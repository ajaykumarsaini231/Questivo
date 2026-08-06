// Does this part of the page need to be a picture, or is it text?
//
// The archive used to cut every question to an image whether or not it needed
// one, on the reasoning that the picture is the authoritative rendering. That
// is true, and it is also why a perfectly typeset equation was published as a
// screenshot: unselectable, unsearchable, unreadable to a screen reader, and
// unable to reflow on a phone. Text is the better answer wherever text is the
// truth, and the picture stays on the row behind it as the fallback.
//
// WHAT DECIDES IT
//
// mupdf will replay a page through a device and report every drawing operation
// with its bounding box. Text arrives through the text callbacks and is
// ignored here; what is left is what was DRAWN. That distinguishes the two
// cases exactly, where counting glyphs or measuring whitespace never could:
//
//   a coordinate graph, a benzene ring, a circuit, a free-body diagram —
//   strokes and fills that carry meaning, so the region must be a picture
//
//   a fraction bar, a table rule, an underline, a radical's vinculum —
//   drawn, but only as typography around text that says everything
//
// The line between them is dimensionality. A rule is one-dimensional: long and
// hairline, or tall and hairline. Anything that encloses area — a curve, a
// diagonal bond, an axis with a plot on it — has both dimensions. That single
// test separates "3π/4" from a graph of it.
//
// TABLES STAY TEXT
//
// A table is drawn entirely out of rules, so it falls out as text by the test
// above, which is what the extraction spec asks for: a table is data and must
// stay selectable. It is still reported, because a caller that wants to
// preserve the grid needs to know one is there.

import * as mupdf from "mupdf";

/** Both sides longer than this and the mark encloses area — it is a shape. */
const TWO_D_PT = 6;
/** A shape covering this much of the page in both axes is the watermark. */
const PAGE_FRACTION = 0.4;
/** Rules this close to each other and this parallel read as one table. */
const TABLE_MIN_RULES = 4;
/** Below this, a "stem" is not text however cleanly it extracted. */
const MIN_TEXT_CHARS = 12;

/**
 * How big a raster must be before it is a picture rather than a letter.
 *
 * These booklets do not draw all their text as text. ALLEN's running header is
 * a row of small images, and its solutions raster the odd inline fragment — a
 * subscripted "m₁", a coordinate label beside a graph — at around 20x16pt.
 * Counting those as illustrations marked almost every region in the file as
 * needing a picture, which is the same as not deciding at all.
 *
 * A real illustration is not glyph-sized. Both bounds and the area have to
 * clear the bar, so that a wide thin strip of rasterised header text does not
 * qualify on width alone.
 */
const MIN_RASTER_PT = 24;
const MIN_RASTER_AREA = 1200;

/** Appearing on this share of sampled pages makes a mark furniture. */
const FURNITURE_SHARE = 0.6;
/** How many pages to sample when looking for what repeats. */
const FURNITURE_SAMPLE_PAGES = 5;

/**
 * Spanning this much of the region's width makes a shape a background band.
 *
 * These pages are built out of full-bleed rectangles: the coloured
 * "MATHEMATICS | TEST PAPER WITH SOLUTION" header, the tint behind SECTION-A,
 * the fill behind a table's heading row. Each is a filled rectangle with area,
 * so the two-dimensional test above says "figure" — and on the page in hand
 * that marked a stem of plain algebra as needing a picture.
 *
 * They are told apart by where their edges are. A banner runs margin to
 * margin, because that is what makes it a banner. A diagram is set INSIDE the
 * text column, inset on at least one side — the graph on this same page spans
 * 65% of its column and no more.
 */
const BANNER_WIDTH_SHARE = 0.9;

/**
 * Every drawing operation on one page, in page coordinates.
 *
 * Text callbacks are deliberately empty rather than absent: mupdf calls them,
 * and a device that does not answer them will not replay the page at all.
 */
export function pageDrawings(page, furniture = null) {
  const ops = rawDrawings(page);
  return furniture ? ops.filter((op) => !furniture.has(signature(op))) : ops;
}

function rawDrawings(page) {
  const ops = [];
  const add = (kind, bounds) => {
    if (!bounds) return;
    const [x0, y0, x1, y1] = bounds;
    if (!Number.isFinite(x0) || !Number.isFinite(y1)) return;
    ops.push({ kind, x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 });
  };

  const device = new mupdf.Device({
    fillPath(path, evenOdd, ctm) { add("path", path.getBounds(null, ctm)); },
    strokePath(path, stroke, ctm) { add("path", path.getBounds(stroke, ctm)); },
    fillImage(image, ctm) { add("image", mupdf.Rect.transform([0, 0, 1, 1], ctm)); },
    fillImageMask(image, ctm) { add("image", mupdf.Rect.transform([0, 0, 1, 1], ctm)); },
    fillShade(shade, ctm) { add("shade", mupdf.Rect.transform([0, 0, 1, 1], ctm)); },
    fillText() {}, strokeText() {}, clipText() {}, clipStrokeText() {}, ignoreText() {},
    clipPath() {}, clipStrokePath() {}, clipImageMask() {}, popClip() {},
    beginMask() {}, endMask() {}, beginGroup() {}, endGroup() {},
    beginTile() { return 0; }, endTile() {}, beginLayer() {}, endLayer() {},
    close() {},
  });

  try {
    page.run(device, mupdf.Matrix.identity);
  } catch {
    // A page that will not replay tells us nothing about its drawings. An
    // empty list makes every region on it read as text, and the text checks
    // below still decide correctly from what was extracted.
    return [];
  } finally {
    // Released here rather than left to the finaliser. One device per page
    // across an archive of 300 booklets is a great many live WASM objects,
    // and the crops being rendered alongside them need that heap.
    try { device.close(); } catch { /* already closed */ }
    try { device.destroy?.(); } catch { /* no destroy in this build */ }
  }
  return ops;
}

/** Where a mark sits and how big it is, to the point — its identity. */
const signature = (op) =>
  `${op.kind}@${Math.round(op.x0)},${Math.round(op.y0)},${Math.round(op.w)},${Math.round(op.h)}`;

/**
 * Marks that stand in the same place on most pages: the running header, the
 * watermark, the advertising band at the foot.
 *
 * Repetition is what identifies them, and nothing else does as well. The ALLEN
 * footer banner is 524x62pt of raster — the size of a real diagram, and
 * indistinguishable from one by size or position alone. It is on all seven
 * pages, and no diagram ever is.
 *
 * Computed once per document and passed to pageDrawings.
 */
export function documentFurniture(doc) {
  const pages = doc.countPages();
  if (pages < 3) return new Set();

  // Sampled, not exhaustive. Replaying a page through a JS device is thousands
  // of calls across the WASM boundary and allocates as it goes; doing it for
  // every page of every booklet, on top of the render the crops already do,
  // exhausted the heap and took 1,176 questions down with it — mupdf started
  // failing to load pages at all, and they were reported as "not located on
  // the page". Furniture is what REPEATS, so a handful of pages spread through
  // the file identifies it exactly as well as all of them.
  const sample = [];
  const step = Math.max(1, Math.floor(pages / FURNITURE_SAMPLE_PAGES));
  for (let p = 0; p < pages && sample.length < FURNITURE_SAMPLE_PAGES; p += step) sample.push(p);

  const seen = new Map();
  for (const p of sample) {
    let marks;
    try {
      marks = new Set(rawDrawings(doc.loadPage(p)).map(signature));
    } catch {
      continue;
    }
    for (const sig of marks) seen.set(sig, (seen.get(sig) ?? 0) + 1);
  }
  const threshold = Math.max(2, Math.ceil(sample.length * FURNITURE_SHARE));
  return new Set([...seen].filter(([, n]) => n >= threshold).map(([sig]) => sig));
}

/** Is `op` inside `rect`, allowing for a crop's own padding? */
const within = (op, [x0, y0, x1, y1]) =>
  op.x1 > x0 && op.x0 < x1 && op.y1 > y0 && op.y0 < y1;

/** A watermark or a full-bleed background, not a figure. */
const isBackdrop = (op, pageW, pageH) =>
  op.w > pageW * PAGE_FRACTION && op.h > pageH * PAGE_FRACTION;

/** Big enough to be an illustration rather than a rasterised glyph. */
const isIllustration = (op) =>
  op.w >= MIN_RASTER_PT && op.h >= MIN_RASTER_PT && op.w * op.h >= MIN_RASTER_AREA;

/** Rules make a table when several run each way and enclose something. */
function looksLikeTable(rules) {
  if (rules.length < TABLE_MIN_RULES) return false;
  const horizontal = rules.filter((r) => r.w >= r.h).length;
  const vertical = rules.length - horizontal;
  return horizontal >= 2 && vertical >= 2;
}

/**
 * Classify one region of one page.
 *
 * @param {Array} drawings  from pageDrawings, for THIS page
 * @param {[number,number,number,number]} rect  the region, in page points
 * @param {{pageW:number, pageH:number, text?:string}} ctx
 * @returns {{needsImage:boolean, category:string, why:string,
 *            shapes:number, rules:number}}
 *
 * `category` is one of:
 *   text        nothing drawn — publish the text
 *   table       drawn only from rules — still text, but a grid to preserve
 *   figure      vector artwork that carries meaning — publish the picture
 *   image       a raster illustration — publish the picture
 *   unreadable  nothing drawn, and no usable text either — the picture is all
 *               there is
 */
export function classifyRegion(drawings, rect, { pageW, pageH, text = "" }) {
  const regionWidth = Math.max(1, rect[2] - rect[0]);
  const isBanner = (op) => op.w >= regionWidth * BANNER_WIDTH_SHARE;

  const here = drawings.filter((op) => within(op, rect) && !isBackdrop(op, pageW, pageH));
  const raster = here.filter((op) => op.kind !== "path" && isIllustration(op) && !isBanner(op));
  const twoD = (op) => op.w > TWO_D_PT && op.h > TWO_D_PT;
  const shapes = here.filter((op) => op.kind === "path" && twoD(op) && !isBanner(op));
  // Banners are dropped rather than demoted to rules: a page whose heading
  // tints happen to number four would otherwise report its plain algebra as a
  // table. They are background, which is neither of the two things counted.
  const rules = here.filter((op) => op.kind === "path" && !twoD(op) && !isBanner(op));
  const readable = text.replace(/\s+/g, " ").trim().length >= MIN_TEXT_CHARS;

  if (raster.length) {
    return { needsImage: true, category: "image", why: `${raster.length} raster`, shapes: shapes.length, rules: rules.length };
  }
  if (shapes.length) {
    return { needsImage: true, category: "figure", why: `${shapes.length} 2-D shape(s)`, shapes: shapes.length, rules: rules.length };
  }
  if (!readable) {
    // No artwork, and nothing legible came out either — the text layer failed,
    // which is the other reason a candidate needs to see the page itself.
    return { needsImage: true, category: "unreadable", why: `${text.trim().length} chars extracted`, shapes: 0, rules: rules.length };
  }
  if (looksLikeTable(rules)) {
    return { needsImage: false, category: "table", why: `${rules.length} rules in a grid`, shapes: 0, rules: rules.length };
  }
  return { needsImage: false, category: "text", why: rules.length ? `${rules.length} rule(s), typography only` : "no drawing", shapes: 0, rules: rules.length };
}
