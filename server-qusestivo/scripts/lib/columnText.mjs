// Column-aware line extraction for two-up coaching booklets.
//
// A separate module rather than a change to pdfLayout.mjs's extractLines, which
// ten converters share and which cannot be re-verified against all of their
// source PDFs here. This is opt-in: a converter that wants it imports it.
//
// WHAT IT FIXES
//
// ALLEN's solution booklets set two columns per page. Reading them in glyph
// order welds the columns together character by character, and the result is
// not merely untidy - it is unreadable:
//
//   Hzseeercroteioew+nlese catArrBiecanadsfisCeulDmd,inaC+ig sn stsiADhed+eca
//
// That is one sentence from each column, interleaved. Splitting at the page
// midline first, then reading each side top-to-bottom, gives back:
//
//   Here we are assuming that "λ" is very large just for the sake of symmetry.
//   Outside cylinder will have zero electric field inside, so the flux …
//
// WHAT IT DOES NOT FIX
//
// Mathematics. A stacked fraction is three separate runs at three heights -
// numerator, rule, denominator - and no reading order recovers "Q/(60ε₀)" from
// them; the same is true of every superscript and subscript. Those questions
// need the cropped image, which is why the converters cut one for every
// question regardless of how well the text came out.

import fs from "node:fs";
import * as mupdf from "mupdf";

/** Rows within this many points of each other are the same visual line. */
const LINE_TOLERANCE = 3;

/**
 * Where a page's columns divide, from the text itself.
 *
 * The midline is the obvious guess and is wrong often enough to matter: a
 * booklet that runs a full-width header, or sets one column wider than the
 * other, puts real text across it. So the gutter is found as the widest empty
 * vertical band in the middle third of the sheet, and the midline is only the
 * fallback for a page that turns out to be single-column.
 */
function gutterOf(rows, pageWidth) {
  if (!rows.length) return pageWidth / 2;

  const from = pageWidth * 0.33;
  const to = pageWidth * 0.67;
  const occupied = new Set();

  for (const r of rows) {
    const start = Math.max(0, Math.floor(r.x));
    const end = Math.min(pageWidth, Math.ceil(r.x + r.w));
    for (let x = start; x <= end; x += 1) occupied.add(x);
  }

  let best = null;
  let runStart = null;
  for (let x = Math.floor(from); x <= Math.ceil(to); x += 1) {
    if (!occupied.has(x)) {
      if (runStart === null) runStart = x;
      continue;
    }
    if (runStart !== null) {
      const run = { start: runStart, end: x - 1 };
      if (!best || run.end - run.start > best.end - best.start) best = run;
      runStart = null;
    }
  }
  if (runStart !== null) {
    const run = { start: runStart, end: Math.ceil(to) };
    if (!best || run.end - run.start > best.end - best.start) best = run;
  }

  // A gutter narrower than this is ordinary word spacing, not a column break.
  if (!best || best.end - best.start < 8) return null;
  return (best.start + best.end) / 2;
}

/** Groups rows into visual lines and renders each left-to-right. */
function renderColumn(rows) {
  const lines = new Map();

  for (const r of rows) {
    const key = [...lines.keys()].find((k) => Math.abs(k - r.y) <= LINE_TOLERANCE) ?? r.y;
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push(r);
  }

  return [...lines.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, items]) => items.sort((a, b) => a.x - b.x).map((i) => i.t).join(" ").trim())
    .filter(Boolean);
}

/**
 * Every line of a PDF, column by column, page by page.
 *
 * Returns plain strings so it is a drop-in for `extractLines`.
 */
export function extractColumnLines(buffer) {
  const doc = mupdf.Document.openDocument(buffer, "application/pdf");
  const out = [];

  for (let p = 0; p < doc.countPages(); p += 1) {
    const page = doc.loadPage(p);
    const [, , pageWidth] = page.getBounds();

    const rows = [];
    let json;
    try {
      json = JSON.parse(page.toStructuredText("preserve-whitespace").asJSON());
    } catch {
      continue;
    }

    for (const block of json.blocks ?? []) {
      for (const line of block.lines ?? []) {
        const t = (line.text ?? "").trim();
        if (!t) continue;
        rows.push({
          t,
          x: line.bbox?.x ?? 0,
          y: line.bbox?.y ?? 0,
          w: line.bbox?.w ?? 0,
        });
      }
    }
    if (!rows.length) continue;

    const gutter = gutterOf(rows, pageWidth);
    if (gutter === null) {
      out.push(...renderColumn(rows));
      continue;
    }

    // Left column in full, then the right - which is how the page is read, and
    // therefore how a question and its solution stay together.
    out.push(...renderColumn(rows.filter((r) => r.x + r.w / 2 < gutter)));
    out.push(...renderColumn(rows.filter((r) => r.x + r.w / 2 >= gutter)));
  }

  return out;
}
