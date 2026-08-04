// Cut the figure for a question out of its source PDF.
//
// WHY THIS EXISTS
//
// A third of the 2023 questions cannot be served as text. Their maths, their
// match-the-column tables and their graph options are drawn as vector outlines,
// so there is no text layer to extract: the stem arrives as connecting prose
// with the quantities missing and all four options come out empty. 31 Jan
// Shift 2 loses a whole page that way.
//
// The pixels are still there, though — the page renders perfectly. So the
// question is cut out of the page as an image and served in place of the text
// it never had. Nothing is dropped and nothing is guessed.
//
// mupdf is used rather than pdf.js + a canvas: it is a self-contained WASM
// build with no native module to compile, and pdf.js's glyph rendering
// segfaults the process against every Node canvas binding tried here.

import fs from "node:fs";
import path from "node:path";
import * as mupdf from "mupdf";

/** Rendered at 2x so the maths stays sharp on a retina screen. */
const SCALE = 2;
/** Trim the running header and the advertising footer off a crop. */
const HEADER_PT = 52;
const FOOTER_PT = 34;
/** A crop shorter than this caught nothing useful. */
const MIN_HEIGHT_PT = 18;

/**
 * Anchors of every question on every page, with where they sit.
 *
 * @param doc     mupdf document
 * @param pattern RegExp with one capturing group for the printed number
 */
function anchorsOf(doc, pattern) {
  const found = [];
  /** Where the printed answer starts — the crop must stop above it. */
  const stops = [];
  for (let p = 0; p < doc.countPages(); p++) {
    const page = doc.loadPage(p);
    let st;
    try { st = JSON.parse(page.toStructuredText().asJSON()); } catch { continue; }
    const [, , pageW, pageH] = page.getBounds();

    for (const block of st.blocks || []) {
      for (const line of block.lines || []) {
        const text = (line.text ?? "").trim();
        const b = line.bbox || {};
        // A booklet prints "Official Ans. by NTA (2)" and then its worked
        // solution directly beneath the question. Cropping to the next question
        // would hand the candidate the answer with the question, which makes the
        // paper useless as a mock — so the answer line is a hard ceiling.
        if (/^(Official\s*Ans|Allen\s*Ans|Sol\b)/i.test(text)) {
          stops.push({ page: p, x: b.x ?? 0, y: b.y ?? 0 });
          continue;
        }
        const m = pattern.exec(text);
        if (!m) continue;
        found.push({ n: Number(m[1]), page: p, x: b.x ?? 0, y: b.y ?? 0, pageW, pageH });
      }
    }
  }
  return { found, stops };
}

/**
 * Render one rectangle of one page to PNG.
 *
 * The clip is applied by building a pixmap the size of the wanted rectangle and
 * running the page into it through a translating matrix, so only that band is
 * ever rasterised.
 */
function renderRect(page, rect, scale = SCALE) {
  const [x0, y0, x1, y1] = rect;
  const m = mupdf.Matrix.concat(
    mupdf.Matrix.translate(-x0, -y0),
    mupdf.Matrix.scale(scale, scale)
  );
  const bbox = [0, 0, Math.ceil((x1 - x0) * scale), Math.ceil((y1 - y0) * scale)];
  const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, bbox, false);
  pix.clear(255);
  const dev = new mupdf.DrawDevice(mupdf.Matrix.identity, pix);
  page.run(dev, m);
  dev.close();
  const png = pix.asPNG();
  pix.destroy?.();
  return png;
}

/**
 * Write a PNG for each wanted question.
 *
 * @param {object}   o
 * @param {string}   o.pdfPath
 * @param {string}   o.outDir
 * @param {Array<{printedNumber:number,fileName:string,occurrence?:number}>} o.wanted
 * @param {"mathongo"|"allen"} o.mode
 * @returns {{written:number, missing:number[]}}
 */
export function extractFigures({ pdfPath, outDir, wanted, mode }) {
  if (!wanted.length) return { written: 0, missing: [] };

  const doc = mupdf.Document.openDocument(fs.readFileSync(pdfPath), "application/pdf");

  // MathonGo prints "Q12."; ALLEN prints "12." at the head of its column.
  const pattern = mode === "mathongo" ? /^Q\s*(\d{1,3})\s*\./ : /^(\d{1,3})\s*\./;
  const { found: anchors, stops } = anchorsOf(doc, pattern);

  // Every sighting of each number, in page order.
  //
  // The first is normally the question and any later one is a formula tail
  // inside a worked solution — but not always. ALLEN's 2022 booklets restart
  // numbering at each section, so "1." is Section A question 1 AND Section B
  // question 1, and taking the first sighting would crop the wrong question for
  // all ten of Section B. A caller that knows the numbering restarts asks for
  // the second sighting instead, via `occurrence`.
  const byNumber = new Map();
  for (const a of anchors) {
    if (!byNumber.has(a.n)) byNumber.set(a.n, []);
    byNumber.get(a.n).push(a);
  }

  fs.mkdirSync(outDir, { recursive: true });
  let written = 0;
  const missing = [];

  for (const w of wanted) {
    const sightings = byNumber.get(w.printedNumber);
    // `occurrence` is 1-based and defaults to the first, which is what every
    // paper that numbers straight through wants.
    const a = sightings?.[(w.occurrence ?? 1) - 1];
    if (!a) { missing.push(w.printedNumber); continue; }

    const page = doc.loadPage(a.page);
    const twoUp = mode !== "mathongo";
    const mid = a.pageW / 2;
    // ALLEN booklets are set two-up, so a crop that spans the page would carry
    // half of the worked solution printed beside the question.
    const colX0 = twoUp ? (a.x < mid ? 0 : mid) : 0;
    const colX1 = twoUp ? (a.x < mid ? mid : a.pageW) : a.pageW;

    // The question ends at whichever comes first below it in the SAME column:
    // the next question, or the printed answer.
    const sameColumn = (o) => !twoUp || (o.x < mid) === (a.x < mid);
    const below = (o) => o.page === a.page && o.y > a.y + 4 && sameColumn(o);

    const nextQ = anchors.filter(below).sort((p, q) => p.y - q.y)[0];
    const nextStop = stops.filter(below).sort((p, q) => p.y - q.y)[0];
    const ends = [nextQ?.y, nextStop?.y].filter((v) => typeof v === "number");

    const y0 = Math.max(0, a.y - 6);
    const y1 = ends.length
      ? Math.min(Math.min(...ends) - 2, a.pageH - FOOTER_PT)
      : a.pageH - FOOTER_PT;
    if (y1 - y0 < MIN_HEIGHT_PT) { missing.push(w.printedNumber); continue; }

    try {
      const png = renderRect(page, [colX0, Math.max(y0, HEADER_PT * 0), colX1, y1]);
      fs.writeFileSync(path.join(outDir, w.fileName), png);
      written++;
    } catch {
      missing.push(w.printedNumber);
    }
  }

  return { written, missing };
}
