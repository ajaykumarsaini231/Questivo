// Cut a question out of its source PDF as separate parts: the stem, each
// option, and the worked solution.
//
// WHY SEPARATE PARTS AND NOT ONE CROP
//
// The first version cut the whole question — stem and all four options — into a
// single image. It rendered, but it is not a question paper: the options cannot
// be laid out beside radio buttons, a numerical question still showed four
// empty choices under its picture, and nothing could be styled, reflowed on a
// phone, or read out. The page has the parts separated already; this keeps them
// separated.
//
// So each question yields up to six images:
//
//     stem            the question, with the options cut off below it
//     optionA..D      one image per choice
//     solution        the worked solution, for booklets that print one
//
// A numerical question yields a stem and a solution and no options, which is
// what the paper prints.
//
// HOW THE REGIONS ARE FOUND
//
// mupdf gives every line's bounding box, so the layout is read rather than
// guessed. Within one question's band: the option markers "(1)".."(4)" (or
// "(A)".."(D)") are located, grouped into rows by baseline, and each option's
// rectangle runs from its own marker to the next marker on that row, and down
// to the next row. The stem is everything above the first marker.
//
// mupdf is used rather than pdf.js + a canvas: it is a self-contained WASM
// build with no native module to compile, and pdf.js's glyph rendering
// segfaults the process against every Node canvas binding tried here.

import fs from "node:fs";
import path from "node:path";
import * as mupdf from "mupdf";

/** Rendered at 2x so the maths stays sharp on a retina screen. */
const SCALE = 2;
/** Trim the advertising footer off a crop. */
const FOOTER_PT = 34;
/** A crop shorter than this caught nothing useful. */
const MIN_HEIGHT_PT = 12;
/** Baselines within this are the same row of options. */
const ROW_TOLERANCE = 6;
/** Breathing room so glyphs are not clipped at the edges. */
const PAD = 3;

/** "(1)" / "(2)" ... or "(A)" / "(B)" ... at the start of a line or after space. */
const OPTION_MARK = /(?:^|\s)\(\s*([1-4A-D])\s*\)/g;

/**
 * Everything structural on every page: question anchors, option markers, and
 * the lines that end a question.
 */
function structureOf(doc, pattern) {
  const questions = [];
  const options = [];
  /** Where the printed answer starts — the stem crop must stop above it. */
  const stops = [];
  /** Where the worked solution starts. */
  const solutions = [];
  /** Page and y of the first "SECTION-A" heading, if the file has one. */
  let paperStart = null;

  for (let p = 0; p < doc.countPages(); p++) {
    const page = doc.loadPage(p);
    let st;
    try { st = JSON.parse(page.toStructuredText().asJSON()); } catch { continue; }
    const [, , pageW, pageH] = page.getBounds();

    for (const block of st.blocks || []) {
      for (const line of block.lines || []) {
        const text = (line.text ?? "").trim();
        const b = line.bbox || {};
        const at = { page: p, x: b.x ?? 0, y: b.y ?? 0, w: b.w ?? 0, h: b.h ?? 0, pageW, pageH };

        // A booklet prints "Official Ans. by NTA (2)" and then its worked
        // solution beneath the question. Cropping past it would hand the
        // candidate the answer with the question.
        // An ALLEN booklet opens with a page of numbered instructions — "1. Use
        // Blue / Black Ball point pen only." — which match the question pattern
        // exactly. Taking the first "1." on the file cropped that page instead
        // of question 1. The paper starts at SECTION-A.
        if (!paperStart && /^SECTION\s*[-–]?\s*A\b/i.test(text)) {
          paperStart = { page: p, y: b.y ?? 0 };
        }

        if (/^Sol\b\.?/i.test(text)) { solutions.push(at); stops.push(at); continue; }
        if (/^(Official\s*Ans|Allen\s*Ans)/i.test(text)) { stops.push(at); continue; }

        const q = pattern.exec(text);
        // A worked solution is full of lines that begin like a question number
        // — "0.02", "2.5 kg" — and each one became a false anchor. The nearest
        // one below a solution then became its end, so the crop stopped two
        // lines in. Question numbers on these papers run 1-90.
        const n = q ? Number(q[1]) : NaN;
        if (q && n >= 1 && n <= 90) {
          questions.push({ ...at, n });
          // A question line can carry its first option too; fall through.
        }

        // Option markers, with the x where each begins.
        OPTION_MARK.lastIndex = 0;
        let m;
        while ((m = OPTION_MARK.exec(text)) !== null) {
          // Estimate the marker's x by how far into the line it sits. Exact
          // enough: options are far apart and only their ORDER matters.
          const frac = m.index / Math.max(text.length, 1);
          options.push({ ...at, label: m[1], x: (b.x ?? 0) + frac * (b.w ?? 0) });
        }
      }
    }
  }
  // Anything before SECTION-A is front matter, not the paper.
  const afterStart = (a) =>
    !paperStart || a.page > paperStart.page || (a.page === paperStart.page && a.y >= paperStart.y);

  return { questions: questions.filter(afterStart), options, stops, solutions };
}

/**
 * Render one rectangle of one page to PNG.
 *
 * Greyscale, not RGB. These pages are black text on white — there is no colour
 * to lose — and one byte per pixel instead of three cut the 2022 folder from
 * 84 MB to a size a frontend `public/` folder can actually carry. At ~40,000
 * images across the archive that difference decides whether the site deploys.
 */
function renderRect(page, rect, scale = SCALE) {
  const [x0, y0, x1, y1] = rect;
  const m = mupdf.Matrix.concat(mupdf.Matrix.translate(-x0, -y0), mupdf.Matrix.scale(scale, scale));
  const bbox = [0, 0, Math.ceil((x1 - x0) * scale), Math.ceil((y1 - y0) * scale)];
  const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, bbox, false);
  pix.clear(255);
  const dev = new mupdf.DrawDevice(mupdf.Matrix.identity, pix);
  page.run(dev, m);
  dev.close();
  const png = pix.asPNG();
  pix.destroy?.();
  return png;
}

/**
 * Split the option markers of one question into a rectangle per option.
 *
 * Options are set two to a row — "(1) … (2)" then "(3) … (4)" — so an option's
 * rectangle runs from its own marker across to the next marker on the same row
 * (or the column edge), and down as far as the next row begins.
 */
function optionRects(marks, colX0, colX1, bottom) {
  if (!marks.length) return {};

  // Group into rows by baseline.
  const rows = [];
  for (const m of [...marks].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find((r) => Math.abs(r.y - m.y) <= ROW_TOLERANCE);
    if (row) row.items.push(m);
    else rows.push({ y: m.y, items: [m] });
  }
  for (const r of rows) r.items.sort((a, b) => a.x - b.x);

  const out = {};
  rows.forEach((row, ri) => {
    const rowBottom = ri + 1 < rows.length ? rows[ri + 1].y - 1 : bottom;
    row.items.forEach((m, i) => {
      const x0 = Math.max(colX0, m.x - PAD);
      const x1 = i + 1 < row.items.length ? row.items[i + 1].x - 1 : colX1;
      const key = /[1-4]/.test(m.label) ? "ABCD"[Number(m.label) - 1] : m.label;
      // Last one wins: a stem that quotes "(A)" is followed by the real option
      // list, and it is the real one we want.
      if (x1 - x0 > 8 && rowBottom - m.y > MIN_HEIGHT_PT / 2) {
        out[key] = [x0, Math.max(0, m.y - PAD), x1, rowBottom];
      }
    });
  });
  return out;
}

/**
 * Write the images for each wanted question.
 *
 * @param {object} o
 * @param {string} o.pdfPath
 * @param {string} o.outDir
 * @param {Array<{printedNumber:number, baseName:string, occurrence?:number,
 *                wantOptions?:boolean, wantSolution?:boolean}>} o.wanted
 * @param {"mathongo"|"allen"} o.mode
 * @returns {{written:number, missing:number[],
 *            parts: Map<number,{stem?:string, options?:object, solution?:string}>}}
 */
export function extractFigures({ pdfPath, outDir, wanted, mode }) {
  const parts = new Map();
  if (!wanted.length) return { written: 0, missing: [], parts };

  const doc = mupdf.Document.openDocument(fs.readFileSync(pdfPath), "application/pdf");

  // MathonGo prints "Q12."; ALLEN prints "12." at the head of its column.
  const pattern = mode === "mathongo" ? /^Q\s*(\d{1,3})\s*\./ : /^(\d{1,3})\s*\./;
  const { questions: anchors, options: optionMarks, stops, solutions } = structureOf(doc, pattern);

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
    const a = sightings?.[(w.occurrence ?? 1) - 1];
    if (!a) { missing.push(w.printedNumber); continue; }

    const page = doc.loadPage(a.page);
    const twoUp = mode !== "mathongo";
    const mid = a.pageW / 2;
    // ALLEN booklets are set two-up, so a crop spanning the page would carry
    // half of the worked solution printed beside the question.
    // Start at the question's own left edge rather than the column boundary.
    // These pages carry a black rule down the binding margin, and a crop that
    // began at x=0 put a thick black bar down the side of every image.
    const colEdge = twoUp ? (a.x < mid ? 0 : mid) : 0;
    const colX0 = Math.max(colEdge, a.x - PAD * 2);
    const colX1 = twoUp ? (a.x < mid ? mid : a.pageW - PAD) : a.pageW - PAD;

    const sameColumn = (o) => !twoUp || (o.x < mid) === (a.x < mid);
    const below = (o) => o.page === a.page && o.y > a.y + 4 && sameColumn(o);

    const nextQ = anchors.filter(below).sort((p, q) => p.y - q.y)[0];
    const nextStop = stops.filter(below).sort((p, q) => p.y - q.y)[0];

    // Where this question's territory ends: the next question, or its own
    // answer line, whichever comes first.
    const ends = [nextQ?.y, nextStop?.y].filter((v) => typeof v === "number");
    const bandBottom = ends.length ? Math.min(...ends) - 2 : a.pageH - FOOTER_PT;
    const bandTop = Math.max(0, a.y - PAD);
    if (bandBottom - bandTop < MIN_HEIGHT_PT) { missing.push(w.printedNumber); continue; }

    const mine = { };
    const write = (name, rect) => {
      try {
        const png = renderRect(page, rect);
        fs.writeFileSync(path.join(outDir, name), png);
        written++;
        return name;
      } catch {
        return null;
      }
    };

    // ── options ──────────────────────────────────────────────────────────
    // Only for questions that have them. A numerical question has none, and
    // hunting for markers in its stem would cut it in half at a stray "(1)".
    let optRects = {};
    if (w.wantOptions !== false) {
      const marks = optionMarks.filter(
        (o) => o.page === a.page && o.y >= a.y && o.y <= bandBottom && sameColumn(o)
      );
      optRects = optionRects(marks, colX0, colX1, bandBottom);
    }

    const firstOptionY = Object.values(optRects).length
      ? Math.min(...Object.values(optRects).map((r) => r[1]))
      : null;

    // ── stem ─────────────────────────────────────────────────────────────
    // Everything above the first option marker, so the picture of the question
    // is the question and nothing else.
    const stemBottom = firstOptionY !== null ? firstOptionY - 1 : bandBottom;
    if (stemBottom - bandTop >= MIN_HEIGHT_PT) {
      mine.stem = write(`${w.baseName}_Q.png`, [colX0, bandTop, colX1, stemBottom]);
    } else {
      // The options start immediately: keep the whole band rather than nothing.
      mine.stem = write(`${w.baseName}_Q.png`, [colX0, bandTop, colX1, bandBottom]);
    }

    for (const [letter, rect] of Object.entries(optRects)) {
      const name = write(`${w.baseName}_${letter}.png`, rect);
      if (name) (mine.options ||= {})[letter] = name;
    }

    // ── solution ─────────────────────────────────────────────────────────
    if (w.wantSolution) {
      const sol = solutions
        .filter((s) => s.page === a.page && s.y > a.y && sameColumn(s))
        .sort((p, q) => p.y - q.y)[0];
      if (sol) {
        const solEnd = nextQ && nextQ.y > sol.y ? nextQ.y - 2 : a.pageH - FOOTER_PT;
        if (solEnd - sol.y >= MIN_HEIGHT_PT) {
          mine.solution = write(`${w.baseName}_S.png`, [colX0, Math.max(0, sol.y - PAD), colX1, solEnd]);
        }
      }
    }

    parts.set(w.printedNumber, mine);
  }

  return { written, missing, parts };
}
