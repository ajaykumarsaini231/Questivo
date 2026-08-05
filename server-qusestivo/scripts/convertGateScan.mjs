#!/usr/bin/env node
// Convert a SCANNED GATE paper — one with no text layer — into PYQ rows.
//
// WHY A SECOND CONVERTER
//
// scripts/convertGateMt.mjs reads the page's text to find where each question
// sits. GATE MT 2019, 2020 and 2021 have no text at all: they are images of
// paper. Everything downstream still works — the player renders a question from
// its crop and the marker scores it from the key — so the only thing missing is
// knowing WHERE ON THE PAGE each question starts.
//
// Pixels alone cannot answer that. Segmenting on whitespace bands and table
// rules was tried and produced 76, 37 and 98 blocks on three papers that all
// have exactly 65 questions: the layouts differ (2021 is bordered tables, 2019
// is flowing text, 2020 uses a left gutter), questions run across page breaks,
// and a stray rule reads like a boundary. A wrong boundary is not a cosmetic
// problem — question n would be shown with question n+1's picture and marked
// against question n's key.
//
// So the numbers are READ, with the OCR engine built into Windows. Only the
// numbers: "Q.8" in a 200-dpi scan is the easiest thing OCR does, and the
// result is checked against an invariant the paper guarantees — the anchors
// must run 1..65 with no gaps and no repeats. A misread fails the run instead
// of reaching a candidate.
//
// THE TEXT IS NOT RECOVERED, AND IS NOT CLAIMED TO BE
//
// Every row is flagged `needsFigure` and carries a citation line as its stem.
// The crop IS the question. That is honest — OCR of a whole metallurgy paper,
// with its subscripts, Greek and equations, would produce plausible-looking
// wrong text, which is worse than a picture.
//
// Usage:
//   node scripts/convertGateScan.mjs --dir "<folder>" --year 2021
//   node scripts/convertGateScan.mjs --dir "<folder>"          # every scan
//   node scripts/convertGateScan.mjs --dir <folder> --year 2021 --keep-pages

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import * as mupdf from "mupdf";

import { extractLines } from "./lib/pdfLayout.mjs";
import { parseGateKey } from "./lib/parseGate.mjs";

/* ------------------------------- constants ------------------------------ */

const EXAM_CODE = "GATE_MT";
const EXAM_NAME = "GATE Metallurgical Engineering";
const STREAM = "Metallurgical Engineering";
const TOTAL_QUESTIONS = 65;
const DURATION_MIN = 180;

/**
 * Rendered at this scale for the crops, and larger again for OCR.
 *
 * Recognition rate is strongly scale-dependent on these scans: at 2x the
 * engine returned nothing at all for several pages and found 59 of the 65
 * markers; the pages are not harder than their neighbours, the glyphs are just
 * small. The crops do not need the extra resolution — they are read by a person
 * on a screen — so the two are separate and the OCR pages are thrown away.
 */
const SCALE = 2;
const OCR_SCALE = 3.2;
/** Trim the running header and the footer off every page. */
const HEADER_FRAC = 0.06;
const FOOTER_FRAC = 0.955;
/** Breathing room around a crop, in rendered pixels. */
const PAD = 6;
/** A crop shorter than this caught nothing. */
const MIN_H = 24;

const SUBJECT_NAME = { GA: "General Aptitude", MT: "Metallurgical Engineering" };
const TYPE_MAP = { MCQ: "mcq_single", MSQ: "mcq_multiple", NAT: "numerical" };

const SOURCE_NOTE =
  "GATE Metallurgical Engineering question paper and official answer key, " +
  "published by the organising institute. © GATE committee. Supplied by the operator. " +
  "This paper is an image scan; each question is shown as the original page.";

/* -------------------------------- helpers ------------------------------- */

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const hashQuestion = (s) => crypto.createHash("sha1").update(s).digest("hex");

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    const v = argv[i + 1];
    if (v && !v.startsWith("--")) { out[k] = v; i++; } else out[k] = true;
  }
  return out;
}

/**
 * "Q.8", "Q8", "Q. 8", and the "Q.No. 11" form GATE 2020 uses.
 *
 * The digits are allowed to be the letters OCR confuses them with. Reading a
 * scan, "Q.1" comes back as "Q.I" and "Q.54" as "Q.S4" often enough to lose a
 * dozen anchors a paper, and both are unambiguous in this position: no GATE
 * question is numbered with a letter.
 */
const Q_MARK = /^Q\s*[.,]?\s*(?:No\s*\.?\s*)?([\dIiLlOoSs]{1,3})\.?$/;
/** A marker whose number OCR dropped entirely — "Q." on its own. */
const Q_BARE = /^Q\s*[.,]?$/;

/** OCR's letter-for-digit substitutions, in a place only digits can appear. */
const readNumber = (s) =>
  Number(s.replace(/[Ii Ll]/g, "1").replace(/[Oo]/g, "0").replace(/[Ss]/g, "5"));
/** "(A)" … "(D)", alone or leading. OCR drops the brackets often enough. */
const OPT_MARK = /^\(?\s*([A-D])\s*\)?$/;

/**
 * Render every page of a PDF to PNG, and read them with the OCR engine.
 *
 * One PowerShell process for the whole paper: starting it and loading the WinRT
 * projections costs about two seconds, and a paper is thirty pages.
 */
function ocrPaper(pdfPath, workDir) {
  const doc = mupdf.Document.openDocument(fs.readFileSync(pdfPath), "application/pdf");
  fs.mkdirSync(workDir, { recursive: true });

  // Two renders per page: one to crop from, one — larger, in its own folder —
  // for the recogniser. Word positions come back in the OCR render's pixels and
  // are scaled onto the crop render before anything is measured against them.
  const ocrDir = path.join(workDir, "ocr");
  fs.mkdirSync(ocrDir, { recursive: true });

  const pages = [];
  for (let p = 0; p < doc.countPages(); p++) {
    const page = doc.loadPage(p);
    const pix = page.toPixmap(mupdf.Matrix.scale(SCALE, SCALE), mupdf.ColorSpace.DeviceGray, false);
    const file = path.join(workDir, `p${String(p).padStart(3, "0")}.png`);
    fs.writeFileSync(file, pix.asPNG());

    const big = page.toPixmap(mupdf.Matrix.scale(OCR_SCALE, OCR_SCALE), mupdf.ColorSpace.DeviceGray, false);
    fs.writeFileSync(path.join(ocrDir, `p${String(p).padStart(3, "0")}.png`), big.asPNG());

    pages.push({ index: p, file, width: pix.getWidth(), height: pix.getHeight() });
    pix.destroy?.();
    big.destroy?.();
  }

  const script = path.join(path.dirname(new URL(import.meta.url).pathname).replace(/^\//, ""), "ocrPage.ps1");
  const jsonl = path.join(workDir, "ocr.jsonl");
  execFileSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Folder", ocrDir, "-Out", jsonl],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 64 }
  );

  const byFile = new Map();
  for (const line of fs.readFileSync(jsonl, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    const j = JSON.parse(t);
    byFile.set(j.file, j);
  }
  // Word boxes are in OCR-render pixels; every later measurement is against the
  // crop render, so they are converted once here rather than at each use.
  const k = SCALE / OCR_SCALE;
  for (const p of pages) {
    const j = byFile.get(path.basename(p.file)) ?? { words: [] };
    p.ocr = {
      words: (j.words ?? []).map((w) => ({
        text: w.text,
        x: w.x * k,
        y: w.y * k,
        w: w.w * k,
        h: w.h * k,
      })),
    };
  }
  return { doc, pages };
}

/**
 * Where each question starts, read off the pages.
 *
 * A marker only counts when it is in the LEFT margin — every one of these
 * layouts puts the question number there, and "Q.8" quoted inside a sentence is
 * not a new question. The numbers must then run 1..65 in order; anything else
 * is a misread and the caller refuses the paper rather than guessing.
 */
function findAnchors(pages) {
  let found = [];
  for (const p of pages) {
    const top = p.height * HEADER_FRAC;
    const bottom = p.height * FOOTER_FRAC;
    const leftMargin = p.width * 0.24;

    const here = [];
    for (const w of p.ocr.words ?? []) {
      const t = w.text.trim();
      // Only the left margin. Every one of these layouts puts the number
      // there, and "Q-4," inside a match-the-column option is not a question.
      if (w.x > leftMargin || w.y < top || w.y > bottom) continue;
      if (Q_BARE.test(t)) { here.push({ n: null, page: p.index, y: w.y, x: w.x }); continue; }
      const m = Q_MARK.exec(t);
      if (!m) continue;
      const n = readNumber(m[1]);
      if (!Number.isFinite(n) || n < 1 || n > TOTAL_QUESTIONS) continue;
      here.push({ n, page: p.index, y: w.y, x: w.x });
    }
    here.sort((a, b) => a.y - b.y || a.x - b.x);

    // "Q.1 – Q.5 Carry ONE mark Each" is a section heading, and reaches OCR as
    // two markers on one baseline. Neither is a question; taking the first
    // would put question 1's crop on the heading and shift the whole paper.
    const keep = here.filter((a, i) => {
      const prev = here[i - 1];
      const next = here[i + 1];
      const near = (o) => o && Math.abs(o.y - a.y) < 14;
      return !(near(prev) || near(next));
    });
    found.push(...keep);
  }

  found.sort((a, b) => a.page - b.page || a.y - b.y);

  // These papers number each SECTION from 1 — General Aptitude runs 1..10 and
  // then the subject paper restarts at 1 and runs to 55. The archive numbers a
  // paper straight through, so the second block is offset by the length of the
  // first. Detected from the sequence itself rather than assumed, because the
  // 2022-onwards papers number 1..65 continuously.
  let offset = 0;
  let last = 0;
  const numbered = [];
  for (const a of found) {
    if (a.n === null) { numbered.push(a); continue; }
    if (a.n <= last && last >= 5) offset = last;
    const n = a.n + offset;
    if (n > TOTAL_QUESTIONS) continue;
    last = a.n;
    numbered.push({ ...a, n });
  }

  // A marker whose digits OCR lost sits between two it read. The paper
  // guarantees a contiguous run, so the gap has exactly one answer.
  for (let i = 0; i < numbered.length; i++) {
    if (numbered[i].n !== null) continue;
    const before = numbered.slice(0, i).reverse().find((a) => a.n !== null);
    const after = numbered.slice(i + 1).find((a) => a.n !== null);
    if (before && after && after.n - before.n === 2) numbered[i].n = before.n + 1;
    else if (before && !after && before.n + 1 <= TOTAL_QUESTIONS) numbered[i].n = before.n + 1;
  }

  // First sighting of each number, in document order.
  const seen = new Set();
  const clean = [];
  for (const a of numbered) {
    if (a.n === null || seen.has(a.n)) continue;
    if (clean.length && a.n <= clean[clean.length - 1].n) continue;
    seen.add(a.n);
    clean.push(a);
  }
  return clean;
}

/**
 * Where the left margin carries ink, as [top, bottom] runs.
 *
 * Used to recover an anchor the recogniser missed entirely. The question NUMBER
 * is always the leftmost thing on its line, so a run of ink in that narrow strip
 * is a question start — and because the search is bounded by the two anchors
 * either side of the gap, it cannot wander onto anything else.
 */
function marginRuns(pageFile, width, height) {
  const img = new mupdf.Image(fs.readFileSync(pageFile));
  const pix = img.toPixmap();
  try {
    const stride = pix.getStride();
    const comps = pix.getNumberOfComponents();
    const px = pix.getPixels();
    // The NUMBER COLUMN, and only it. The recognised anchors sit at about 15%
    // of the page width and the question text starts at about 20%, so a strip
    // that reached 22% swept up the stem as well and every run looked like a
    // candidate; one that stopped at 14% covered only the blank margin to their
    // left and no run looked like anything.
    const from = Math.round(width * 0.11);
    const to = Math.round(width * 0.19);

    const runs = [];
    let start = -1;
    let blank = 0;
    for (let y = 0; y < height; y++) {
      let ink = 0;
      const base = y * stride;
      for (let x = from; x < to; x++) if (px[base + x * comps] < 200) ink++;
      if (ink > 1) {
        if (start < 0) start = y;
        blank = 0;
      } else if (start >= 0 && ++blank > 6) {
        runs.push([start, y - blank]);
        start = -1;
        blank = 0;
      }
    }
    if (start >= 0) runs.push([start, height - 1]);
    return runs.filter(([a, b]) => b - a > 6);
  } finally {
    pix.destroy?.();
  }
}

/**
 * Fill anchors the recogniser missed, from the left margin's ink.
 *
 * Only inside a gap bounded by two anchors it DID read, and only when exactly
 * one candidate sits there — anything less certain is left missing so the run
 * fails loudly rather than putting a question on the wrong crop.
 */
function fillGaps(anchors, pages) {
  const byN = new Map(anchors.map((a) => [a.n, a]));
  for (let n = 2; n < TOTAL_QUESTIONS; n++) {
    if (byN.has(n)) continue;
    const prev = byN.get(n - 1);
    const next = byN.get(n + 1);
    if (!prev || !next) continue;

    // Where the missing one can be: after the previous anchor, before the next.
    const windows = [];
    if (prev.page === next.page) {
      windows.push({ page: prev.page, from: prev.y + 12, to: next.y - 12 });
    } else {
      const p = pages[prev.page];
      windows.push({ page: prev.page, from: prev.y + 12, to: p.height * FOOTER_FRAC });
      for (let mid = prev.page + 1; mid < next.page; mid++) {
        windows.push({ page: mid, from: pages[mid].height * HEADER_FRAC, to: pages[mid].height * FOOTER_FRAC });
      }
      windows.push({ page: next.page, from: pages[next.page].height * HEADER_FRAC, to: next.y - 12 });
    }

    const hits = [];
    for (const win of windows) {
      const page = pages[win.page];
      // The option labels live in this margin too — 2021 sets each choice in
      // its own table row with "(A)" in the number column — so a bare run of
      // ink is not necessarily a question. The ones the recogniser already
      // identified as options are removed, which on a four-option question
      // leaves exactly the question number behind.
      const optionYs = findOptions(page).map((o) => o.y);
      for (const [a] of marginRuns(page.file, page.width, page.height)) {
        if (a < win.from || a > win.to) continue;
        if (optionYs.some((y) => Math.abs(y - a) < 14)) continue;
        hits.push({ n, page: win.page, y: a, x: 0 });
      }
    }
    // The FIRST run in the window. The window opens just after the previous
    // question's own marker and closes just before the next one's, and within
    // it the number column carries the missing question's number before that
    // question's option labels. Requiring exactly one candidate was too strict:
    // where OCR misses a marker it usually misses some of that question's
    // option labels too, so they stay in the running as rival candidates and
    // every gap was refused.
    hits.sort((a, b) => a.page - b.page || a.y - b.y);
    if (hits.length) byN.set(n, hits[0]);
  }

  return [...byN.values()].sort((a, b) => a.n - b.n);
}

/** The option markers on a page, for splitting a question into its choices. */
function findOptions(page) {
  const out = [];
  for (const w of page.ocr.words ?? []) {
    const m = OPT_MARK.exec(w.text.trim());
    if (!m) continue;
    out.push({ label: m[1], x: w.x, y: w.y, h: w.h });
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Render one rectangle of an already-rendered page image. */
function cropPng(pageFile, rect) {
  const img = new mupdf.Image(fs.readFileSync(pageFile));
  const src = img.toPixmap();
  try {
    const [x0, y0, x1, y1] = rect.map(Math.round);
    const w = Math.max(1, Math.min(src.getWidth(), x1) - Math.max(0, x0));
    const h = Math.max(1, Math.min(src.getHeight(), y1) - Math.max(0, y0));
    if (w < 8 || h < MIN_H) return null;

    const out = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, [0, 0, w, h], false);
    out.clear(255);
    const comps = src.getNumberOfComponents();
    const sStride = src.getStride();
    const dStride = out.getStride();
    // Both views are taken AFTER the output pixmap is allocated: getPixels
    // returns a view over the wasm heap, and allocating can grow and detach it.
    const sp = src.getPixels();
    const dp = out.getPixels();
    for (let y = 0; y < h; y++) {
      const sBase = (Math.max(0, y0) + y) * sStride;
      const dBase = y * dStride;
      for (let x = 0; x < w; x++) dp[dBase + x] = sp[sBase + (Math.max(0, x0) + x) * comps];
    }
    const png = out.asPNG();
    out.destroy?.();
    return png;
  } finally {
    src.destroy?.();
  }
}

/* --------------------------------- main --------------------------------- */

async function main() {
  const args = parseArgs(process.argv);
  const dir = args.dir;
  if (!dir) {
    console.error("--dir <folder containing MT*.pdf and the answer keys> is required");
    process.exit(2);
  }
  const OUT = args.out || path.join("data", "pyq", "gate-mt-scans.json");
  const ONLY = args.year ? Number(args.year) : null;
  const figDir = args.figures && args.figures !== true
    ? args.figures
    : path.join(path.dirname(OUT), "figures-gate-scan");

  const files = fs.readdirSync(dir);
  const papers = new Map();
  for (const f of files) {
    let m = /^MT(\d{4})\.pdf$/i.exec(f);
    if (m) papers.set(Number(m[1]), { ...(papers.get(Number(m[1])) || {}), paper: f });
    m = /^MT[-_ ]?(\d{4})[^\d]*answer\s*key\.pdf$/i.exec(f);
    if (m) papers.set(Number(m[1]), { ...(papers.get(Number(m[1])) || {}), key: f });
  }

  const rows = [];
  const problems = [];
  const skipped = [];
  fs.mkdirSync(figDir, { recursive: true });

  for (const year of [...papers.keys()].filter((y) => !ONLY || y === ONLY).sort()) {
    const { paper, key } = papers.get(year);
    if (!paper) continue;

    const paperPath = path.join(dir, paper);
    const paperBuf = fs.readFileSync(paperPath);

    // Only scans belong here. A paper with a text layer is converted properly
    // by convertGateMt.mjs, which recovers the words as well as the pictures.
    const textLen = (await extractLines(paperBuf)).map((l) => l.text ?? l).join("").length;
    if (textLen > 2000) {
      skipped.push(`${year}: has a text layer — use convertGateMt.mjs`);
      continue;
    }

    if (!key) { skipped.push(`${year}: no answer key file`); continue; }
    const keyBuf = fs.readFileSync(path.join(dir, key));
    if (paperBuf.equals(keyBuf)) {
      skipped.push(`${year}: "${key}" is a byte-identical copy of "${paper}", not a key`);
      continue;
    }

    /* ------------------------------ the key ----------------------------- */

    // A transcribed key, where one exists, wins over anything machine-read.
    //
    // Windows OCR reads these tables' multi-character cells — "MCQ", "GA",
    // "1/3" — and consistently DROPS the isolated bold single characters, which
    // is precisely the Answer Key column. Tested at two resolutions. A key is
    // the one thing that must never be plausible-but-wrong, so where the scan
    // defeats OCR the table is transcribed into data/pyq/keys/ and read here.
    const keyFile = path.join(path.dirname(OUT), "keys", `gate-mt-${year}.json`);
    let keyMap = new Map();
    let keyFrom = "";

    if (fs.existsSync(keyFile)) {
      for (const q of JSON.parse(fs.readFileSync(keyFile, "utf8")).questions) {
        keyMap.set(q.n, { type: q.type, subject: q.subject, key: q.key, marks: q.marks });
      }
      keyFrom = `transcription (${path.basename(keyFile)})`;
    } else {
      keyMap = parseGateKey((await extractLines(keyBuf, { columns: false })).map((l) => l.text ?? l));
      keyFrom = "the key's own text layer";
    }

    if (keyMap.size !== TOTAL_QUESTIONS) {
      skipped.push(
        `${year}: the answer key gives ${keyMap.size} of ${TOTAL_QUESTIONS} questions ` +
          `(read from ${keyFrom || "nothing"}). Transcribe it to ${path.relative(".", keyFile)} ` +
          `and re-run — a partial key would leave questions unscoreable or, worse, mis-numbered.`
      );
      continue;
    }

    /* ----------------------------- the paper ---------------------------- */

    const work = fs.mkdtempSync(path.join(os.tmpdir(), `gate-scan-${year}-`));
    let pages;
    try {
      ({ pages } = ocrPaper(paperPath, work));
      const anchors = fillGaps(findAnchors(pages), pages);

      // The invariant that makes this safe to ship. GATE MT is 65 questions,
      // numbered 1..65. Anything else means a marker was misread or missed, and
      // a missed marker shifts every crop after it onto the wrong question.
      const missing = [];
      for (let n = 1; n <= TOTAL_QUESTIONS; n++) if (!anchors.some((a) => a.n === n)) missing.push(n);
      if (missing.length) {
        problems.push(
          `${year}: OCR found ${anchors.length}/${TOTAL_QUESTIONS} question markers — ` +
            `missing ${missing.join(", ")}. Not converted: a missing marker puts every ` +
            `later question on the wrong crop.`
        );
        continue;
      }

      const facets = {
        examCode: EXAM_CODE, examName: EXAM_NAME, stream: STREAM, year,
        paperId: `gate-mt-${year}`, paperLabel: `GATE MT ${year}`,
        sessionNumber: null, sessionLabel: null, paperDate: null,
        dateLabel: String(year), shift: null, shiftLabel: "Full paper", shiftTime: "3 hours",
        daySlot: null,
      };

      for (let i = 0; i < anchors.length; i++) {
        const a = anchors[i];
        const next = anchors[i + 1];
        const page = pages[a.page];
        const k = keyMap.get(a.n);

        // The question's band on its own page. A question that runs onto the
        // next page keeps only what is on this one — same limitation the
        // text-layer converter has, and visible in the crop rather than silent.
        const bandTop = Math.max(page.height * HEADER_FRAC, a.y - PAD);
        let bandBottom =
          next && next.page === a.page ? next.y - PAD : page.height * FOOTER_FRAC;

        // A band too short to hold anything means the anchor landed low —
        // which happens to one recovered from pixels rather than read. Run it
        // to the foot of the page instead of skipping the question: an
        // overlapping crop shows the candidate too much, a missing one shows
        // them nothing, and this archive's rule is that no question is dropped.
        if (bandBottom - bandTop < MIN_H) bandBottom = page.height * FOOTER_FRAC;
        if (bandBottom - bandTop < MIN_H) continue;

        const base = `GATE_MT_${year}_Q${String(a.n).padStart(2, "0")}`;
        const isNumerical = k?.type === "NAT";

        // Where the choices begin, so the stem can stop above them.
        const opts = findOptions(page).filter((o) => o.y > a.y + 4 && o.y < bandBottom);
        const firstA = isNumerical ? null : opts.find((o) => o.label === "A");

        const stemBottom = firstA ? firstA.y - 2 : bandBottom;
        const stem = cropPng(page.file, [0, bandTop, page.width, Math.max(stemBottom, bandTop + MIN_H)]);
        let stemName = null;
        if (stem) {
          stemName = `${base}_Q.png`;
          fs.writeFileSync(path.join(figDir, stemName), stem);
        }

        // Options, each from its own marker down to the next. Written only when
        // all four came out — three beside a blank fourth reads as a question
        // with three choices.
        const optionFiles = {};
        if (!isNumerical && firstA) {
          const picked = ["A", "B", "C", "D"].map((L) => opts.find((o) => o.label === L));
          if (picked.every(Boolean) && picked.every((o, j) => j === 0 || o.y >= picked[j - 1].y)) {
            for (let j = 0; j < 4; j++) {
              const from = picked[j].y - 2;
              const to = j < 3 ? picked[j + 1].y - 2 : bandBottom;
              const png = cropPng(page.file, [0, from, page.width, to]);
              if (!png) continue;
              const name = `${base}_${"ABCD"[j]}.png`;
              fs.writeFileSync(path.join(figDir, name), png);
              optionFiles["ABCD"[j]] = name;
            }
          }
        }
        if (Object.keys(optionFiles).length !== 4) {
          for (const n of Object.values(optionFiles)) {
            fs.rmSync(path.join(figDir, n), { force: true });
          }
          // The stem must then carry them, so re-cut it over the whole band.
          const whole = cropPng(page.file, [0, bandTop, page.width, bandBottom]);
          if (whole && stemName) fs.writeFileSync(path.join(figDir, stemName), whole);
          for (const key2 of Object.keys(optionFiles)) delete optionFiles[key2];
        }

        rows.push(toRow({ n: a.n, k, facets, base, stemName, optionFiles, sourceFile: paper }));
      }

      console.log(`${year}: 65 questions, key from the ${keyFrom}`);
    } finally {
      if (!args["keep-pages"]) fs.rmSync(work, { recursive: true, force: true });
      else console.log(`  pages kept in ${work}`);
    }
  }

  /* --------------------------------- out -------------------------------- */

  rows.sort((a, b) => a.year - b.year || a.paperQuestionNumber - b.paperQuestionNumber);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2));
  fs.writeFileSync(OUT.replace(/\.json$/, "-papers.json"), JSON.stringify(buildManifest(rows), null, 2));

  const by = (fn) => rows.reduce((a, r) => ((a[fn(r)] = (a[fn(r)] || 0) + 1), a), {});
  console.log(`\n${rows.length} question(s) → ${OUT}`);
  console.log(`by year:    ${JSON.stringify(by((r) => r.year))}`);
  console.log(`by type:    ${JSON.stringify(by((r) => r.questionType))}`);
  console.log(`keyed:      ${rows.filter((r) => r.correctAnswer !== null).length}/${rows.length}`);
  console.log(`with a stem image: ${rows.filter((r) => r.questionImage).length}`);
  console.log(`with option images: ${rows.filter((r) => r.optionAImage).length}`);
  if (skipped.length) {
    console.log(`\nnot converted:`);
    for (const s of skipped) console.log(`  ${s}`);
  }
  if (problems.length) {
    console.log(`\nproblems:`);
    for (const p of problems) console.log(`  ${p}`);
  }
}

function toRow({ n, k, facets, base, stemName, optionFiles, sourceFile }) {
  const subject = SUBJECT_NAME[k?.subject] ?? "Metallurgical Engineering";
  const questionType = k ? TYPE_MAP[k.type] ?? "mcq_single" : "mcq_single";
  const marks = k?.marks ?? 1;
  const MARKS_TO_ALL = /^(MTA|MARKS?\s*TO\s*ALL|ALL|BONUS|DROPPED|CANCELLED)$/i;

  let answer = null;
  let awardedToAll = false;
  if (k) {
    const raw = k.key.trim();
    if (MARKS_TO_ALL.test(raw)) awardedToAll = true;
    else if (k.type === "MCQ") {
      const m = /^\(?\s*([A-D])\s*\)?$/.exec(raw.toUpperCase());
      answer = m ? m[1] : null;
    } else if (k.type === "MSQ") {
      const letters = [...new Set(raw.toUpperCase().match(/[A-D]/g) ?? [])].sort();
      answer = letters.length ? letters.join(",") : null;
    } else answer = raw;
  }

  return {
    ...facets,
    subject,
    subjectId: slug(subject),
    topic: null, chapter: null, chapterId: null,
    topicConfidence: null, topicRunnerUp: null,
    section: null,
    sectionLabel: SUBJECT_NAME[k?.subject] ?? null,
    questionNumber: n,
    paperQuestionNumber: n,

    // The picture is the question. Saying so is better than an OCR transcript
    // of a metallurgy paper's subscripts and equations, which would look right
    // and be wrong.
    questionText: `[Shown as an image] ${EXAM_NAME} ${facets.year}, question ${n}.`,
    optionA: null, optionB: null, optionC: null, optionD: null,
    correctAnswer: answer,
    questionType,
    marksCorrect: marks,
    marksIncorrect: k?.type === "MCQ" ? -Number((marks / 3).toFixed(4)) : 0,

    solution: null, solutionQuality: null, solutionModel: null, answerNote: null,
    status: awardedToAll ? "bonus" : k && answer !== null ? "ok" : "needs_review",
    voidReason: awardedToAll
      ? "the board awarded this question to all candidates (MTA in the official key)"
      : k ? null : "no row for this question in the published key",

    needsFigure: true,
    figureHint: `${EXAM_NAME} ${facets.year} Q${n} (the paper is an image scan)`,
    figureBase: base,
    questionImage: stemName,
    optionAImage: optionFiles.A ?? null,
    optionBImage: optionFiles.B ?? null,
    optionCImage: optionFiles.C ?? null,
    optionDImage: optionFiles.D ?? null,
    solutionImage: null,
    diagramImage: null, diagramSource: null,
    languages: ["en"],
    sourceUrl: sourceFile,
    sourceNote: SOURCE_NOTE,
    questionHash: hashQuestion(`${facets.paperId}|${subject}|${n}`),
  };
}

function buildManifest(rows) {
  const byPaper = new Map();
  for (const r of rows) {
    if (!byPaper.has(r.paperId)) {
      byPaper.set(r.paperId, {
        paperId: r.paperId, examCode: r.examCode, examName: r.examName, stream: r.stream,
        year: r.year, sessionNumber: null, sessionLabel: null, paperDate: null,
        dateLabel: String(r.year), shift: null, shiftLabel: "Full paper", shiftTime: "3 hours",
        label: `GATE Metallurgical Engineering ${r.year}`,
        durationMinutes: DURATION_MIN, totalQuestions: 0, totalMarks: 0,
        marksCorrect: 1, marksIncorrect: -Number((1 / 3).toFixed(4)),
        sectionBAttemptLimit: null, subjects: {}, needsFigureCount: 0,
      });
    }
    const p = byPaper.get(r.paperId);
    p.totalQuestions++;
    p.totalMarks += r.marksCorrect;
    p.subjects[r.subject] = (p.subjects[r.subject] || 0) + 1;
    if (r.needsFigure) p.needsFigureCount++;
  }
  return [...byPaper.values()].sort((a, b) => a.year - b.year);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
