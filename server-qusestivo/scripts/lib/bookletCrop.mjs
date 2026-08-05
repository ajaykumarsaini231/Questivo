// Cut pictures out of a scanned booklet, including across a page break.
//
// WHY CROSS-PAGE MATTERS HERE
//
// convertGateScan.mjs keeps only the part of a question that is on its own
// page: "a question that runs onto the next page keeps only what is on this
// one". On the 2019-2021 papers that is a rare, visible truncation. In these
// booklets it is neither — the volumes are set tight, and a question whose stem
// ends two lines onto the following page is common. A crop that stops at the
// page foot silently hands the candidate half a question, and because the crop
// IS the question there is no text to fall back on.
//
// So a region here is a LIST of rectangles, one per page it spans, and they are
// stacked into a single image. Intermediate pages contribute only their body:
// the running header and the page-number footer are trimmed off, because
// otherwise "Elite Academy 34" would appear in the middle of a question.

import fs from "node:fs";
import * as mupdf from "mupdf";
import { SCALE } from "./bookletOcr.mjs";
import { bodyTop, bodyBottom } from "./bookletAnchors.mjs";

/**
 * Page images, rendered on demand and kept for as long as they are useful.
 *
 * Questions are cut in document order and each one touches the page it starts
 * on and sometimes the next, so a two-page window serves nearly every crop
 * without holding 200 rendered pages in memory.
 */
export class PageImages {
  constructor(pdfPath) {
    this.doc = mupdf.Document.openDocument(fs.readFileSync(pdfPath), "application/pdf");
    this.cache = new Map();
  }

  get(index) {
    let hit = this.cache.get(index);
    if (!hit) {
      const pix = this.doc
        .loadPage(index)
        .toPixmap(mupdf.Matrix.scale(SCALE, SCALE), mupdf.ColorSpace.DeviceGray, false);
      hit = {
        width: pix.getWidth(),
        height: pix.getHeight(),
        stride: pix.getStride(),
        comps: pix.getNumberOfComponents(),
        // Copied out of the wasm heap: getPixels returns a view, and allocating
        // the next pixmap can grow and detach it.
        px: Uint8Array.from(pix.getPixels()),
      };
      pix.destroy?.();
      this.cache.set(index, hit);
      if (this.cache.size > 4) this.cache.delete(this.cache.keys().next().value);
    }
    return hit;
  }
}

/**
 * The first and last rows of a rectangle that carry any ink.
 *
 * A question's band runs to wherever the NEXT question starts, which on a short
 * question is centimetres of blank paper, and on one that ends mid-page is the
 * whole rest of the page. Stacked across a page break that blank became a gap
 * in the middle of the picture with the two halves pushed apart. Trimming to
 * the ink is what makes a crop tight enough to read as one question.
 */
function inkBounds(img, x0, x1, y0, y1) {
  const hasInk = (y) => {
    const base = y * img.stride;
    let n = 0;
    for (let x = x0; x < x1; x++) if (img.px[base + x * img.comps] < 200 && ++n > 1) return true;
    return false;
  };
  let top = y0;
  let bottom = y1 - 1;
  while (top < bottom && !hasInk(top)) top++;
  while (bottom > top && !hasInk(bottom)) bottom--;
  return [top, bottom + 1];
}

/**
 * Stack `rects` — [{ page, x0, y0, x1, y1 }] — into one PNG.
 *
 * Returns null when there is nothing worth writing, which the caller treats as
 * "this part has no picture" rather than as an error.
 */
export function stackCrop(images, rects, { minHeight = 18, gap = 10, pad = 6 } = {}) {
  const parts = [];
  for (const r of rects) {
    const img = images.get(r.page);
    const x0 = Math.max(0, Math.round(r.x0));
    const x1 = Math.min(img.width, Math.round(r.x1));
    let y0 = Math.max(0, Math.round(r.y0));
    let y1 = Math.min(img.height, Math.round(r.y1));
    if (x1 - x0 < 8 || y1 - y0 < 4) continue;

    // Tightened to the ink, then given a little air back so the glyphs are not
    // flush against the edge.
    const [inkTop, inkBottom] = inkBounds(img, x0, x1, y0, y1);
    if (inkBottom - inkTop < 2) continue;
    y0 = Math.max(0, inkTop - pad);
    y1 = Math.min(img.height, inkBottom + pad);

    parts.push({ img, x0, y0, w: x1 - x0, h: y1 - y0 });
  }
  if (!parts.length) return null;

  const width = Math.max(...parts.map((p) => p.w));
  const height = parts.reduce((s, p) => s + p.h, 0) + gap * (parts.length - 1);
  if (height < minHeight) return null;

  const out = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, [0, 0, width, height], false);
  out.clear(255);
  const dStride = out.getStride();
  const dp = out.getPixels();

  let top = 0;
  for (const p of parts) {
    for (let y = 0; y < p.h; y++) {
      const sBase = (p.y0 + y) * p.img.stride;
      const dBase = (top + y) * dStride;
      for (let x = 0; x < p.w; x++) {
        dp[dBase + x] = p.img.px[sBase + (p.x0 + x) * p.img.comps];
      }
    }
    top += p.h + gap;
  }

  const png = out.asPNG();
  out.destroy?.();
  return png;
}

/**
 * The rectangles covering everything from (page, y) up to (endPage, endY).
 *
 * This is what makes a crop "full length": the caller gives a start and an end
 * that may be pages apart, and gets back every band in between with each
 * intermediate page trimmed to its body.
 */
export function spanRects(pages, from, to, { x0 = 0, x1 = null } = {}) {
  const rects = [];
  for (let i = from.page; i <= to.page; i++) {
    const page = pages.find((p) => p.index === i);
    if (!page) continue;
    const right = x1 ?? page.width;
    // Below this page's own running header — measured, not a fixed fraction —
    // so a stitched crop does not carry "Elite Academy 159" through its middle.
    const above = bodyTop(page);
    const below = bodyBottom(page);

    const top = i === from.page ? Math.max(above, from.y) : above;
    const bottom = i === to.page ? Math.min(below, to.y) : below;
    if (bottom - top < 4) continue;
    rects.push({ page: i, x0, y0: top, x1: right, y1: bottom });
  }
  return rects;
}

/**
 * Where the left margin carries ink, as [top, bottom] runs.
 *
 * Used to recover a question number the recogniser missed entirely. The number
 * is always the leftmost thing on its line, so a run of ink in that narrow
 * strip is a question start — and because the search is bounded by the two
 * anchors either side of the gap, it cannot wander onto anything else.
 */
export function marginRuns(images, pageIndex, { from = 0.1, to = 0.2 } = {}) {
  const img = images.get(pageIndex);
  const x0 = Math.round(img.width * from);
  const x1 = Math.round(img.width * to);

  const runs = [];
  let start = -1;
  let blank = 0;
  for (let y = 0; y < img.height; y++) {
    let ink = 0;
    const base = y * img.stride;
    for (let x = x0; x < x1; x++) if (img.px[base + x * img.comps] < 200) ink++;
    if (ink > 1) {
      if (start < 0) start = y;
      blank = 0;
    } else if (start >= 0 && ++blank > 6) {
      runs.push([start, y - blank]);
      start = -1;
      blank = 0;
    }
  }
  if (start >= 0) runs.push([start, img.height - 1]);
  return runs.filter(([a, b]) => b - a > 6);
}
