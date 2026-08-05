// Render and OCR a scanned booklet once, and cache the result.
//
// The GATE 1990-2014 bundles are 899 pages of pure image. Every later step —
// finding where a year starts, where the solutions start, where each question
// sits — is a question about the words on those pages, and re-recognising them
// for each of those questions would make the pipeline unworkable to iterate on.
// So recognition happens once per bundle and lands in a cache keyed by the
// PDF's size and mtime.
//
// Word boxes are returned in CROP-render pixels, not OCR-render pixels: the
// recogniser wants more resolution than a person reading a crop does, and
// mixing the two coordinate spaces is the kind of bug that puts a question on
// the wrong picture.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as mupdf from "mupdf";

/** What the crops are cut from. Read by a person on a screen. */
export const SCALE = 2;
/** What the recogniser sees. Higher: small glyphs in these scans need it. */
export const OCR_SCALE = 3.2;

const scriptDir = path.dirname(new URL(import.meta.url).pathname)
  .replace(/^\//, "")
  .replace(/\/lib$/, "");

/**
 * Recognise every page of `pdfPath`, caching to `cacheDir`.
 *
 * Returns { pages: [{ index, width, height, words: [{text,x,y,w,h}] }] } with
 * geometry in crop-render pixels. Page IMAGES are not kept — they are large and
 * cheap to re-render on demand; only the words are expensive.
 */
export function ocrBooklet(pdfPath, cacheDir, { onProgress, ocrScale = OCR_SCALE, pages: only } = {}) {
  const stat = fs.statSync(pdfPath);
  const suffix = `${ocrScale === OCR_SCALE ? "" : `-s${ocrScale}`}${only ? `-p${only[0]}_${only[only.length - 1]}` : ""}`;
  const tag = `${path.basename(pdfPath, ".pdf")}-${stat.size}-${Math.floor(stat.mtimeMs)}${suffix}`;
  const cacheFile = path.join(cacheDir, `${tag}.json`);
  if (fs.existsSync(cacheFile)) {
    return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "booklet-ocr-"));
  try {
    const doc = mupdf.Document.openDocument(fs.readFileSync(pdfPath), "application/pdf");
    const wanted = only ?? Array.from({ length: doc.countPages() }, (_, i) => i);
    const count = wanted.length;
    const pages = [];

    // Rendered in batches rather than all at once: 899 pages of PNG at 3.2x is
    // several GB on disk, and the recogniser only needs one batch at a time.
    const BATCH = 40;
    for (let start = 0; start < count; start += BATCH) {
      const end = Math.min(count, start + BATCH);
      const ocrDir = path.join(work, `b${start}`);
      fs.mkdirSync(ocrDir, { recursive: true });

      const batch = [];
      for (let k = start; k < end; k++) {
        const p = wanted[k];
        const page = doc.loadPage(p);
        const small = page.toPixmap(mupdf.Matrix.scale(SCALE, SCALE), mupdf.ColorSpace.DeviceGray, false);
        const big = page.toPixmap(mupdf.Matrix.scale(ocrScale, ocrScale), mupdf.ColorSpace.DeviceGray, false);
        const name = `p${String(p).padStart(4, "0")}.png`;
        fs.writeFileSync(path.join(ocrDir, name), big.asPNG());
        batch.push({ index: p, name, width: small.getWidth(), height: small.getHeight() });
        small.destroy?.();
        big.destroy?.();
      }

      const jsonl = path.join(work, `ocr-${start}.jsonl`);
      execFileSync(
        "powershell",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
         path.join(scriptDir, "ocrPage.ps1"), "-Folder", ocrDir, "-Out", jsonl],
        { encoding: "utf8", maxBuffer: 1024 * 1024 * 64 }
      );

      const byFile = new Map();
      for (const line of fs.readFileSync(jsonl, "utf8").split(/\r?\n/)) {
        const t = line.trim();
        if (t.startsWith("{")) {
          const j = JSON.parse(t);
          byFile.set(j.file, j);
        }
      }

      const k = SCALE / ocrScale;
      for (const b of batch) {
        const j = byFile.get(b.name) ?? { words: [] };
        pages.push({
          index: b.index,
          width: b.width,
          height: b.height,
          words: (j.words ?? []).map((w) => ({
            text: w.text,
            x: +(w.x * k).toFixed(1),
            y: +(w.y * k).toFixed(1),
            w: +(w.w * k).toFixed(1),
            h: +(w.h * k).toFixed(1),
          })),
        });
      }
      fs.rmSync(ocrDir, { recursive: true, force: true });
      onProgress?.(end, count);
    }

    const out = { pdf: path.basename(pdfPath), pages };
    fs.writeFileSync(cacheFile, JSON.stringify(out));
    return out;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/** Every word on a page joined in reading order — for matching headings. */
export function pageText(page) {
  return [...page.words]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((w) => w.text)
    .join(" ");
}

/**
 * The page's words gathered into lines.
 *
 * Nearly every decision this pipeline makes is really about a LINE — a heading
 * is a short centred one, a question number is the leftmost word of one, an
 * option label starts one — and word-at-a-time tests kept mistaking a word
 * inside a sentence for a word that opens a line.
 *
 * Grouped on the baseline rather than the box top: superscripts and subscripts
 * sit well above and below their own line's top edge, and grouping by top edge
 * split every line carrying an exponent into three.
 */
export function groupLines(page, tolerance = 0.6) {
  const sorted = [...page.words].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  if (!sorted.length) return [];

  const heights = sorted.map((w) => w.h).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)] || 10;
  const limit = median * tolerance;

  const lines = [];
  let current = null;
  for (const w of sorted) {
    const mid = w.y + w.h / 2;
    if (current && Math.abs(mid - current.mid) <= limit) {
      current.words.push(w);
      // A running mean, so a line does not drift onto the next one through a
      // chain of words each just inside the tolerance of the last.
      current.mid = current.words.reduce((s, x) => s + x.y + x.h / 2, 0) / current.words.length;
    } else {
      current = { mid, words: [w] };
      lines.push(current);
    }
  }

  return lines.map((l) => {
    const ws = l.words.sort((a, b) => a.x - b.x);
    return {
      words: ws,
      text: ws.map((w) => w.text).join(" "),
      x: Math.min(...ws.map((w) => w.x)),
      right: Math.max(...ws.map((w) => w.x + w.w)),
      y: Math.min(...ws.map((w) => w.y)),
      bottom: Math.max(...ws.map((w) => w.y + w.h)),
      mid: l.mid,
    };
  });
}
