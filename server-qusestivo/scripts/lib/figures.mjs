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

import { documentFurniture, pageDrawings, classifyRegion } from "./regionInk.mjs";

/** Rendered at 2x so the maths stays sharp on a retina screen. */
const SCALE = 2;
/** Trim the advertising footer off a crop, when the page does not name one. */
const FOOTER_PT = 34;

/**
 * The running footer, so a crop can stop above it rather than at a guess.
 *
 * A fixed 34pt inset is one page design's answer to a question every publisher
 * answers differently. GATE sets its footer 38pt up a 791pt page, so the inset
 * landed INSIDE it and left the top few pixels of "Page 41 of 65" at the foot
 * of the crop — enough ink to defeat the whitespace trim, so the last option of
 * every question that ended a page came out seventeen times taller than its
 * three siblings: one line of text above an empty half-page.
 *
 * The last alternative is ALLEN's, written exactly as the text layer emits it.
 * Its booklets print "ALLEN CAREER INSTITUTE PVT. LTD., KOTA" across the foot
 * of every page, but only "CAREER INSTITUTE PVT. LTD., KOTA" is TEXT — the
 * "ALLEN" wordmark beside it is vector art with no characters — so a pattern
 * anchored on the brand name matches nothing. It was not matching: across the
 * 26 pages of the 2026 Paper-1 Maths booklet this rule fired on zero of them,
 * every page fell through to pageH - 34, and the footer was inside every crop
 * that reached the bottom of a page.
 */
const FOOTER_LINE =
  /^(?:Organi[sz]ing Institute|Page\s+\d+\s+of\s+\d+\b)|^JEE\s*\(|Held\s+on\s+(?:Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)day|^\s*(?:ALLEN\s+)?CAREER\s+INSTITUTE\b/i;
/**
 * How far above a matched footer line the rest of the footer may sit.
 *
 * A running footer is a BAND, not a line: ALLEN's 2023 paper sets
 * "JEE(Advanced) 2023/Paper-1/Held on Sunday 04th June, 2023" at y=758, the
 * superscript "th" at 754 and the page number at 745. Cutting two points above
 * the matched line left the other two printed under the question.
 */
const FOOTER_BAND = 24;
/** A footer sits in the bottom margin; anything higher is the question. */
const FOOTER_ZONE = 0.85;
/** Skip the running header when a question continues onto the next page. */
const HEADER_PT = 62;
/** A crop shorter than this caught nothing useful. */
const MIN_HEIGHT_PT = 12;
/** Baselines within this are the same row of options. */
const ROW_TOLERANCE = 6;
/** Breathing room so glyphs are not clipped at the edges. */
const PAD = 3;
/**
 * How far above its own number a question's first line may be looked for.
 *
 * The number is centred in its table row, so against an N-line question it
 * sits about N/2 lines down. Three lines covers every case in this archive and
 * stops a page-deep block from dragging the crop over the question above.
 */
const MAX_LABEL_LIFT_LINES = 3;

/**
 * How wide a repeating drawn mark must be to be read as a footer BAND.
 *
 * The footer rules above read text, and ALLEN's advertising banner has none —
 * it is a single 524x62pt raster sitting at y=735 on a 842pt page, under a
 * hairline rule at y=732, on every page of the booklet. The drawn-ink furniture
 * pass in regionInk.mjs is the only thing that sees it at all, and until the
 * crop bounds consulted that pass every question whose band ran to the foot of
 * a page was published with "Predict your JEE Adv. 2026 rank — ALLEN's FREE
 * RANK PREDICTOR — Click here" printed under it.
 *
 * Width is what separates that band from ordinary repeating ink. MathonGo's
 * 2022 compilations repeat a decorative 20x20pt glyph grid down every page,
 * eighteen of whose marks sit in the bottom margin — taking the highest of
 * THOSE as the floor would have cut 67pt of real question off every crop in
 * the year. A footer band runs margin to margin, because that is what makes it
 * a footer; the grid marks are 20pt of a 596pt page.
 */
const FURNITURE_BAND_SHARE = 0.8;

/**
 * On what share of a document's pages a text block must recur to be furniture.
 *
 * The diagonal "ALLEN" watermark is a TEXT block — x=91, y=214, 423x423pt on
 * the 2026 Paper-1 Maths pages — and the bodyTop lift below has no defence
 * against it once fullWidth removes the column bound: it starts above the
 * question number, is still under way at the number's line, and sits inside the
 * lift floor, which is everything the lift asks. It dragged Maths Q13's crop up
 * from y=222 to y=211 and brought the bottom 3pt of "Negative Marks : -1 In all
 * other cases." in with it, and lifted three Chemistry questions by up to 39pt.
 * A block standing at the same place to the point on nine pages in ten is
 * furniture; a question's own cell never recurs.
 */
const BLOCK_FURNITURE_SHARE = 0.5;

/**
 * How far off the question-number column an anchor may sit and still be one.
 *
 * One digit's width, because that is the size of the wobble a column actually
 * has: a number is set to a tab and the glyph that lands on it is not always
 * the same width. 2026 Paper-2 Physics rounds four of its eighteen numbers to
 * x=34 and the rest to x=35; the 3 Apr 2025 Shift-1 Maths booklet sets four of
 * its twenty-five at x=41 against x=35 for the rest, and 4 Apr Shift-1
 * Chemistry sets two at 306 and 310 against 304.
 *
 * A hairline 2.5pt was tried first and cost five real questions their crop in
 * those two files alone. At one digit every one of the 57 ALLEN booklets of
 * 2025 lands on exactly 25 anchors and every MathonGo compilation of 2022-2024
 * on exactly 90 — the paper's own question count, to the question — while none
 * of the false anchors comes within 45pt of a column.
 */
const NUMBER_COLUMN_TOLERANCE = 8;
/** A column carrying less than this share of the anchors is not a column. */
const NUMBER_COLUMN_MIN_SHARE = 0.2;
/** ...and below this the columns explain too little of the page to be trusted. */
const NUMBER_COLUMN_MIN_COVERAGE = 0.5;

/**
 * How many pages past its own a question's band may run.
 *
 * One. A question ends at its own answer line, which the paper prints directly
 * beneath it, so the furthest a real question reaches is the top of the
 * following page. A larger span means a question number went unread and the
 * band has run on into somebody else's territory; the old behaviour — stop at
 * the foot of this page — is the safer answer there.
 */
const MAX_SPAN_PAGES = 1;

/**
 * What share of a booklet's question numbers must stand in the right half of
 * the page before it is read as two-up.
 *
 * A genuinely two-up booklet puts about half of them there — that is what the
 * second column IS. A single-column one puts none there, give or take the
 * numbered steps inside a worked solution that read like question numbers:
 * across ALLEN's twelve JEE Advanced booklets the right-hand share runs 0% to
 * 14%. A quarter sits well clear of both.
 */
const TWO_UP_MIN_RIGHT = 0.25;

/**
 * Is this file actually set two-up?
 *
 * `mode` says which publisher a file came from, and that used to be taken as
 * saying how it is laid out. It does not: ALLEN's JEE Advanced booklets are
 * single-column A4, and cropping them at the page midline cut every question
 * off mid-sentence at 262pt — "Consider the function f : (−π/2, π/2) → (−∞,∞)
 * de" and no further.
 *
 * Judged on the question numbers rather than on the text, because a column
 * boundary is invisible in prose that happens to be narrow: a page of short
 * algebra steps looks two-up by any measure of line width, while where the
 * NUMBERS stand says where the columns start and nothing else does.
 *
 * Falls back to two-up when there is too little to go on. That keeps the older
 * behaviour on a file this cannot read, and errs toward a crop that is too
 * narrow over one carrying a neighbouring column's worked solution.
 */
function pagesAreTwoUp(anchors) {
  if (anchors.length < 4) return true;
  const right = anchors.filter((a) => a.x >= a.pageW / 2).length;
  return right / anchors.length >= TWO_UP_MIN_RIGHT;
}

/**
 * Where this file writes its question numbers, so a number printed anywhere
 * else can be refused.
 *
 * THE ANCHOR TEST HAS TO BE STRUCTURAL, BECAUSE THE TEXTUAL ONE CANNOT WIN.
 *
 * "A number, a dot, and not a digit after it" is also what a reagent written
 * over a reaction arrow looks like, and a fraction's denominator, and a graph's
 * tick label. The 2026 Paper-1 Chemistry booklet contributes fourteen of them —
 * "1. LiBH4", "2. H", "1. Kolbe's electrolysis", "2.V2O5, 500°C", "1. (CH CO)
 * O" — and the Maths booklet one: the "4.x" of −lnx/(4x^{3/2}) inside question
 * 1's worked solution, on page 0. Question 4 is on page 4, but the false
 * sighting is first in document order, so `locate` took it: Maths Q4 was
 * published as a picture of question 1's algebra, the advertising banner and
 * the footer, while its extracted TEXT — "Considering only the principal values
 * of the inverse trigonometric functions…" — was perfectly correct. The same
 * false anchors served as the next question's band bottom, which is what
 * truncated Chemistry Q8 at 61pt and Q16 at 136pt.
 *
 * No further regex answers this. What does is that a question number is set in
 * a column and nothing else in the file is: across the three 2026 Paper-1
 * booklets all 48 real numbers sit at x=35.0 and not one of the 15 false ones
 * does. So the columns are read off the anchors themselves — the x values a
 * meaningful share of them agree on — and anchors standing anywhere else are
 * dropped.
 *
 * Two-up booklets have two such columns and both are found; that is why this
 * clusters rather than taking a single modal x. And it refuses to act at all
 * when the columns it finds explain less than half the anchors, because a file
 * this cannot read is better left to the old behaviour than filtered on a guess.
 *
 * @returns {Array<number>|null} the accepted column x's, or null to filter none
 */
function numberColumns(anchors) {
  if (anchors.length < 4) return null;

  const xs = anchors.map((a) => a.x).sort((p, q) => p - q);
  const clusters = [];
  for (const x of xs) {
    const last = clusters[clusters.length - 1];
    if (last && x - last.at <= NUMBER_COLUMN_TOLERANCE) { last.n++; continue; }
    clusters.push({ at: x, n: 1 });
  }

  const floor = Math.max(3, anchors.length * NUMBER_COLUMN_MIN_SHARE);
  const kept = clusters.filter((c) => c.n >= floor);
  const covered = kept.reduce((a, c) => a + c.n, 0);
  if (!kept.length || covered < anchors.length * NUMBER_COLUMN_MIN_COVERAGE) return null;
  return kept.map((c) => c.at);
}

/** "(1)" / "(2)" ... or "(A)" / "(B)" ... at the start of a line or after space. */
const OPTION_MARK = /(?:^|\s)\(\s*([1-4A-D])\s*\)/g;

/**
 * A stem the paper prints ONCE and asks two questions about.
 *
 * JEE Advanced's last section is built this way — "This section contains TWO
 * (02) question stems. There are TWO (02) questions corresponding to each
 * question stem." — and the shared part is headed with its own printed marker
 * naming the questions it belongs to. Without it a question is unanswerable and
 * looks it: 2026 Paper-2 Maths Q15 was published as "The value of n is
 * ______.", the entire definition of n sitting a few lines above it under
 * "Question Stem for Question Nos. 15 and 16" and in no crop at all.
 *
 * The numbers are captured because they are the safest thing on the page: this
 * marker says which questions it serves, so nothing has to be inferred from
 * where it sits.
 */
const SHARED_STEM =
  /^Question\s+Stems?\s+for\s+Questions?\s+Nos?\.?\s*(\d{1,3})\s*(?:and|&|,|to|[-–—])\s*(\d{1,3})/i;

/**
 * The same thing under its other name, which names no questions.
 *
 * The 2021 Paper-2 booklets head theirs "Paragraph" on a line of its own —
 * "This section contains TWO (02) paragraphs. Based on each paragraph, there
 * are TWO (02) questions" — so it has to be bounded by what follows it instead:
 * it serves every question until the next paragraph or the next section.
 * Anchored at both ends so it can only match a heading, never a stem that uses
 * the word.
 */
const BARE_PARAGRAPH = /^Paragraph\s*$/i;

/** Any section heading — the outer bound on a paragraph that names no numbers. */
const SECTION_HEAD = /^SECTION\s*[-–—]?\s*[A-Z0-9]/i;

/**
 * Lines that look like a question anchor but are not one.
 *
 * GATE heads each block with "Q.1 – Q.5 Carry ONE mark Each", which matches the
 * question pattern exactly. Taken as question 1, every crop lands one question
 * early — the stem of Q.1 becomes a picture of the section heading, and so on
 * down the paper.
 */
const NOT_A_QUESTION = /^Q\s*\.\s*\d{1,3}\s*(?:[–—-]|to\b)\s*Q\s*\.\s*\d{1,3}/i;

/**
 * How many consecutive numbers make a run long enough to be a paper's own
 * numbering rather than a coincidence.
 *
 * Half a subject. Long enough that no stray "2." inside a worked solution can
 * assemble a rival run, short enough to still recognise a booklet that only
 * holds one section.
 */
const MIN_NUMBERING_RUN = 12;
/**
 * Consecutive numbers that may be missing inside one run.
 *
 * A question whose number is drawn rather than typed leaves a hole in an
 * otherwise perfect sequence, and should not split the run in two.
 */
const MAX_NUMBERING_GAP = 2;

/**
 * The number this file starts its questions at.
 *
 * A booklet numbered 61..90 returns 61; one that restarts its numbering at each
 * section has no single run and returns null, which sends the caller to the
 * printed-number-plus-occurrence path instead.
 *
 * Measured as the longest run present, NOT as a run of a fixed length. It was
 * a fixed 30 — a JEE Main subject being 20 questions in Section A and 10 in
 * Section B — and 2025 changed the paper: Section B dropped to 5, so a subject
 * is 25 questions and the ALLEN booklets number Physics 26..50, Chemistry
 * 51..75, Maths 1..25. No run of 30 exists in any of them, so this returned
 * null for every 2025 and 2026 file, every question fell through to the
 * printed number, and a Chemistry booklet that starts at 51 was asked for
 * question 1 — which it does not print. What answered instead was "1.5",
 * inside the worked solution of question 54, and that is the picture 579
 * questions were published with.
 *
 * Deriving it means the next time the board changes the paper this reads the
 * new shape off the page instead of quietly mis-addressing a year.
 */
function numberingBase(numbers) {
  const set = new Set(numbers);
  let bestBase = null;
  let bestLen = 0;
  // Ascending, and strictly-greater below, so the SMALLEST base wins a tie —
  // every run also contains a shorter run starting one later.
  for (const base of [...set].sort((a, b) => a - b)) {
    let n = base;
    let len = 0;
    let gap = 0;
    while (gap <= MAX_NUMBERING_GAP) {
      if (set.has(n)) { len = n - base + 1; gap = 0; } else gap++;
      n++;
    }
    if (len > bestLen) { bestBase = base; bestLen = len; }
  }
  return bestLen >= MIN_NUMBERING_RUN ? bestBase : null;
}

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
  /** "Choose the correct answer..." — the options begin after it. */
  const instructions = [];
  /** page → y of the top of its running footer, where the page prints one. */
  const footers = new Map();
  /** page → y of every line in the bottom margin, footer or not. */
  const zoneLines = new Map();
  /** page → y of the highest line down there that reads like a footer. */
  const footerHit = new Map();
  /** Every text block's box, for locating the cell a question number labels. */
  const blocks = [];
  /** How many pages each block box recurs on — see BLOCK_FURNITURE_SHARE. */
  const blockPages = new Map();
  /** Headings for a stem two questions share. */
  const sharedStems = [];
  /** Page and y of every section heading, bounding an unnumbered paragraph. */
  const sectionHeads = [];
  /** Page and y of the first "SECTION-A" heading, if the file has one. */
  let paperStart = null;

  for (let p = 0; p < doc.countPages(); p++) {
    const page = doc.loadPage(p);
    let st;
    try { st = JSON.parse(page.toStructuredText().asJSON()); } catch { continue; }
    const [, , pageW, pageH] = page.getBounds();

    /** Block boxes already counted on THIS page, so one page counts once. */
    const boxesHere = new Set();

    for (const block of st.blocks || []) {
      // Kept whole, not just as lines. A question number and the question
      // beside it are two blocks, and only the block bbox says how far the
      // one beside it reaches UP — see the lift in extractFigures.
      const bb = block.bbox || {};
      let blockIndex = -1;
      if (bb.w) {
        blockIndex = blocks.length;
        const box = `${Math.round(bb.x ?? 0)},${Math.round(bb.y ?? 0)},${Math.round(bb.w)},${Math.round(bb.h ?? 0)}`;
        if (!boxesHere.has(box)) {
          boxesHere.add(box);
          blockPages.set(box, (blockPages.get(box) ?? 0) + 1);
        }
        blocks.push({ page: p, index: blockIndex, box, x: bb.x ?? 0, y: bb.y ?? 0, w: bb.w, h: bb.h ?? 0 });
      }

      for (const line of block.lines || []) {
        const text = (line.text ?? "").trim();
        const b = line.bbox || {};
        const at = {
          page: p, x: b.x ?? 0, y: b.y ?? 0, w: b.w ?? 0, h: b.h ?? 0, pageW, pageH,
          // Which block this line came from, so the lift can tell the cell
          // BESIDE a question number from the one it is written in.
          blockIndex,
        };

        // A booklet prints "Official Ans. by NTA (2)" and then its worked
        // solution beneath the question. Cropping past it would hand the
        // candidate the answer with the question.
        // An ALLEN booklet opens with a page of numbered instructions — "1. Use
        // Blue / Black Ball point pen only." — which match the question pattern
        // exactly. Taking the first "1." on the file cropped that page instead
        // of question 1. The paper starts at SECTION-A.
        //
        // "A" was the only shape this knew, and JEE Advanced does not print it:
        // its booklets head their four sections "SECTION-1 (Maximum Marks :
        // 12)", "SECTION-2 :" and so on, so not one line of any of the thirteen
        // 2026 files matched, paperStart stayed null, and this guard was dead
        // code across the whole exam. convertJeeAdvancedAllen.mjs:284 already
        // knew the right shape; this did not.
        if (!paperStart && /^SECTION\s*[-–—]?\s*[A1]\b/i.test(text)) {
          paperStart = { page: p, y: b.y ?? 0 };
        }
        if (SECTION_HEAD.test(text)) sectionHeads.push(at);

        // A stem two questions share, headed by its own printed marker.
        const stemFor = SHARED_STEM.exec(text);
        if (stemFor) {
          sharedStems.push({ ...at, from: Number(stemFor[1]), to: Number(stemFor[2]) });
        } else if (BARE_PARAGRAPH.test(text)) {
          sharedStems.push({ ...at, from: null, to: null });
        }

        // "Choose the correct answer from the options given below :" divides a
        // statement-list question from its actual choices. Without it the
        // option crops captured the numbered STATEMENTS — which also read
        // (1)..(4) — and the four choices ended up as pictures of the premises.
        if (/Choose the (?:correct|most appropriate|right)|from the options given below/i.test(text)) {
          instructions.push(at);
        }

        // The running footer, taken only from the bottom margin: "Page 41 of
        // 65" would otherwise also match a cross-reference inside a stem.
        // Every line down here is remembered, not just the matching one — the
        // band it belongs to is resolved once the page has been read.
        if (at.y > pageH * FOOTER_ZONE) {
          if (!zoneLines.has(p)) zoneLines.set(p, []);
          zoneLines.get(p).push(at.y);
          if (FOOTER_LINE.test(text)) {
            const seen = footerHit.get(p);
            if (seen === undefined || at.y < seen) footerHit.set(p, at.y);
          }
        }

        if (/^Sol\b\.?/i.test(text)) { solutions.push(at); stops.push(at); continue; }
        // "Ans." on its own is an answer line too, and until it was listed
        // here the question crop ran straight through it: JEE Advanced 2026
        // Paper 1 Q10 was published to candidates with "Ans. 5.00" printed
        // under the question it answers. Bare `Ans` and not `Ans.`, because
        // the booklets space it both ways — and \b keeps it off "Answer the
        // following", which is a question's own words.
        if (/^(Official\s*Ans|Allen\s*Ans|Ans\b)/i.test(text)) { stops.push(at); continue; }

        const q = NOT_A_QUESTION.test(text) ? null : pattern.exec(text);
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
  // A page that prints a footer has its whole footer band excluded, not just
  // the line that identified it. Bounded to FOOTER_BAND so a page whose last
  // question runs down into the bottom margin keeps that question.
  for (const [p, hit] of footerHit) {
    const top = (zoneLines.get(p) ?? [])
      .filter((y) => y >= hit - FOOTER_BAND)
      .reduce((m, y) => Math.min(m, y), hit);
    footers.set(p, top);
  }

  // Anything before SECTION-A is front matter, not the paper.
  const afterStart = (a) =>
    !paperStart || a.page > paperStart.page || (a.page === paperStart.page && a.y >= paperStart.y);

  // Then only the ones standing in a question-number column — see
  // numberColumns for the fifteen false anchors this removes and the crops
  // each of them wrecked.
  const started = questions.filter(afterStart);
  const columns = numberColumns(started);
  const inColumn = (a) =>
    !columns || columns.some((x) => Math.abs(a.x - x) <= NUMBER_COLUMN_TOLERANCE);

  // A block box standing in the same place on most pages is the watermark or
  // the running header, not a question's cell.
  const pages = doc.countPages();
  const recurs = Math.max(2, Math.ceil(pages * BLOCK_FURNITURE_SHARE));
  for (const b of blocks) b.furniture = pages >= 3 && (blockPages.get(b.box) ?? 0) >= recurs;

  return {
    questions: started.filter(inColumn),
    options, stops, solutions, instructions, footers, blocks, sharedStems, sectionHeads,
  };
}

/**
 * Render one rectangle of one page to PNG.
 *
 * Greyscale, not RGB. These pages are black text on white — there is no colour
 * to lose — and one byte per pixel instead of three cut the 2022 folder from
 * 84 MB to a size a frontend `public/` folder can actually carry. At ~40,000
 * images across the archive that difference decides whether the site deploys.
 */
function renderRectPixmap(page, rect, scale = SCALE) {
  const [x0, y0, x1, y1] = rect;
  const m = mupdf.Matrix.concat(mupdf.Matrix.translate(-x0, -y0), mupdf.Matrix.scale(scale, scale));
  const bbox = [0, 0, Math.ceil((x1 - x0) * scale), Math.ceil((y1 - y0) * scale)];
  const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, bbox, false);
  pix.clear(255);
  const dev = new mupdf.DrawDevice(mupdf.Matrix.identity, pix);
  page.run(dev, m);
  dev.close();
  return pix;
}

function renderRect(page, rect, scale = SCALE, trimSides = true) {
  const pix = renderRectPixmap(page, rect, scale);
  try {
    return toTrimmedPNG(pix, trimSides);
  } finally {
    pix.destroy?.();
  }
}

/* --------------------------- whitespace trimming -------------------------- */

/** Below this grey value a pixel counts as ink rather than page. */
const INK = 200;
/** Breathing room left around the ink, in rendered pixels. */
const TRIM_PAD = 6;
/**
 * A row or column this full of ink is a RULE, not content.
 *
 * These papers are typeset as tables and every cell has a border. A border runs
 * the whole width of the crop, so measured naively it fixes the bounds at the
 * full rectangle and nothing is ever trimmed — the option images came out as
 * tall empty boxes with a line across the top and the choice tucked in one
 * corner.
 */
const RULE_FRACTION = 0.85;

/**
 * Cut the blank margins off a rendered crop.
 *
 * The rectangles are derived from where text SITS, not from where it ENDS: an
 * option's box runs from its own marker down to the next row of options, and
 * the last option's runs to the bottom of the whole question band. On a paper
 * that spaces its choices generously — or reserves a blank answer area, as GATE
 * does — that is mostly empty page. Rendered at 2x it is also most of the file
 * size, and on screen it pushed the four choices a screenful apart.
 *
 * Returns null when there is nothing but blank and rules, so an empty box is
 * never written and the row simply has no image for that part.
 */
function trimToInk(pix, trimSides = true) {
  const w = pix.getWidth();
  const h = pix.getHeight();
  if (!w || !h) return null;
  const stride = pix.getStride();
  const px = pix.getPixels();

  const rowInk = new Int32Array(h);
  const colInk = new Int32Array(w);
  for (let y = 0; y < h; y++) {
    const base = y * stride;
    for (let x = 0; x < w; x++) {
      if (px[base + x] < INK) {
        rowInk[y]++;
        colInk[x]++;
      }
    }
  }

  // Measure each axis again, IGNORING the other axis's rules.
  //
  // A blank table cell still has a border down each side, so its rows contain
  // two ink pixels and read as content — which is why the first version left an
  // empty cell hanging under every option. What has to be asked of a row is
  // whether anything is in it BESIDES the borders passing through it.
  const ruleRow = new Uint8Array(h);
  const ruleCol = new Uint8Array(w);
  for (let y = 0; y < h; y++) ruleRow[y] = rowInk[y] >= w * RULE_FRACTION ? 1 : 0;
  for (let x = 0; x < w; x++) ruleCol[x] = colInk[x] >= h * RULE_FRACTION ? 1 : 0;

  const contentRow = new Int32Array(h);
  const contentCol = new Int32Array(w);
  for (let y = 0; y < h; y++) {
    if (ruleRow[y]) continue;
    const base = y * stride;
    for (let x = 0; x < w; x++) {
      if (!ruleCol[x] && px[base + x] < INK) {
        contentRow[y]++;
        contentCol[x]++;
      }
    }
  }

  const emptyRow = (y) => contentRow[y] === 0;
  const emptyCol = (x) => contentCol[x] === 0;

  let top = 0;
  while (top < h && emptyRow(top)) top++;
  if (top === h) return null;
  let bottom = h - 1;
  while (bottom > top && emptyRow(bottom)) bottom--;

  // The sides are kept whole when the caller asked for the page's full width.
  // Trimming them is what makes one question's picture 262pt wide and the next
  // one 590pt: the cut follows the longest line of ink, so a short question
  // comes out narrow and reads on screen as though it were cropped in half.
  let left = 0;
  let right = w - 1;
  if (trimSides) {
    while (left < w && emptyCol(left)) left++;
    if (left === w) return null;
    while (right > left && emptyCol(right)) right--;
  }

  // A rule immediately beside the content belongs to the content.
  //
  // "Rule" is decided by how far the ink stretches, and a graph's x-axis
  // stretches as far as a cell border does — so a "which of these plots" option
  // had its axes, ticks and axis labels classified as furniture and cut off,
  // leaving a curve floating in space. Reaching back over the rules that
  // ADJOIN the content recovers those, while a border on the far side of an
  // empty cell stays outside and is still dropped.
  const REACH = 4;
  const grow = (i, step, limit, isRule) => {
    let out = i;
    for (let k = 0; k < REACH; k++) {
      const next = out + step;
      if (next < 0 || next > limit || !isRule[next]) break;
      out = next;
    }
    return out;
  };
  top = grow(top, -1, h - 1, ruleRow);
  bottom = grow(bottom, 1, h - 1, ruleRow);

  top = Math.max(0, top - TRIM_PAD);
  bottom = Math.min(h - 1, bottom + TRIM_PAD);

  if (trimSides) {
    left = grow(left, -1, w - 1, ruleCol);
    right = grow(right, 1, w - 1, ruleCol);
    left = Math.max(0, left - TRIM_PAD);
    right = Math.min(w - 1, right + TRIM_PAD);
  }

  const tw = right - left + 1;
  const th = bottom - top + 1;
  if (tw < 4 || th < 4) return null;
  if (tw === w && th === h) return pix; // nothing to cut; keep the original

  const out = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, [0, 0, tw, th], false);
  out.clear(255);
  // BOTH views are taken after the allocation above, and neither before.
  //
  // getPixels() hands back a Uint8Array over the wasm heap, not a copy. Any
  // mupdf allocation can grow that heap, and growing it replaces the underlying
  // ArrayBuffer and detaches every view onto the old one. `px` was read before
  // this Pixmap was created, so on whichever crop happened to push the heap
  // over its limit, `px.subarray()` threw on a detached buffer — and the throw
  // was swallowed by the catch around the write, so that question simply had no
  // image and was not even counted as missing.
  const src = pix.getPixels();
  const dst = out.getPixels();
  const dstStride = out.getStride();
  for (let y = 0; y < th; y++) {
    const from = (top + y) * stride + left;
    dst.set(src.subarray(from, from + tw), y * dstStride);
  }
  return out;
}

/**
 * Remove a crop that was written and then decided against.
 *
 * The option images have to be cut before it is known whether all four
 * survived; when they did not, the ones that did are no longer referenced and
 * would otherwise sit in the folder, be committed, and pass the existence check
 * in linkPyqFigures.mjs as readily as a live crop.
 */
function discard(dir, name) {
  try {
    fs.unlinkSync(path.join(dir, name));
  } catch {
    /* already gone */
  }
}

/** Trim, encode, and clean up whichever pixmap the trim produced. */
/**
 * Breathing room above and below the question, in points.
 *
 * A crop trimmed hard to its ink reads on screen as though the question has
 * been clipped — the first line touches the top edge and the last option the
 * bottom, and a candidate cannot tell a tight crop from a truncated one.
 *
 * Added as white margin AFTER the ink trim, deliberately, and never by widening
 * the band. Widening it would reach past the answer line or up into the
 * question above — which is the entire class of defect this file exists to
 * prevent, and how a worked solution and an "Ans. (3)" ended up inside crops
 * before. Whitespace added to the rendered image cannot reach anything.
 */
const CROP_MARGIN_PT = 25;

/** Same image with a white band above and below. */
function padVertically(pix, marginPx) {
  const w = pix.getWidth();
  const h = pix.getHeight();
  if (!w || !h || marginPx <= 0) return pix;

  const out = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, [0, 0, w, h + marginPx * 2], false);
  out.clear(255);
  // Both views taken after the allocation, for the reason trimToInk documents:
  // an allocation can grow the wasm heap and detach every view onto the old one.
  const src = pix.getPixels();
  const dst = out.getPixels();
  const srcStride = pix.getStride();
  const dstStride = out.getStride();
  for (let y = 0; y < h; y++) {
    dst.set(src.subarray(y * srcStride, y * srcStride + w), (y + marginPx) * dstStride);
  }
  return out;
}

function toTrimmedPNG(pix, trimSides = true) {
  const trimmed = trimToInk(pix, trimSides);
  if (!trimmed) return null;
  const padded = padVertically(trimmed, Math.round(CROP_MARGIN_PT * SCALE));
  const png = padded.asPNG();
  if (padded !== trimmed) padded.destroy?.();
  if (trimmed !== pix) trimmed.destroy?.();
  return png;
}

/**
 * Render several page regions as one tall image.
 *
 * A question that starts near the foot of a page finishes on the next one, and
 * on these compilations it is routinely the OPTIONS that spill over — question
 * 38 of 24 Jun 2022 Shift 1 has its stem and reaction scheme at the bottom of
 * page 5 and all four structures at the top of page 6. A crop bounded by one
 * page cannot show them, so the candidate got a question with four blank
 * choices no matter how the band was measured.
 *
 * The regions are a LIST rather than a pair because a question's parts do not
 * always sit next to each other: JEE Advanced prints one stem for a pair of
 * questions and then both questions under it, so the second of the pair is its
 * shared stem, from wherever that is, followed by its own band, followed by
 * whatever ran overleaf. They are stacked in reading order.
 *
 * Each region is rendered on its own and the results are copied into one
 * pixmap, rather than running both pages into a single device. Running them
 * directly would work only without clipping, and page 5's footer would then
 * print across the top of page 6's content.
 */
function renderSpan(regions, scale = SCALE, trimSides = true) {
  const pix = regions.map((r) => renderRectPixmap(r.page, r.rect, scale));
  try {
    const width = Math.max(...pix.map((p) => p.getWidth()));
    const height = pix.reduce((a, p) => a + p.getHeight(), 0);
    const out = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, [0, 0, width, height], false);
    out.clear(255);
    const dst = out.getPixels();
    const dstStride = out.getStride();

    let top = 0;
    for (const p of pix) {
      const src = p.getPixels();
      const srcStride = p.getStride();
      const w = p.getWidth();
      const h = p.getHeight();
      for (let y = 0; y < h; y++) {
        dst.set(src.subarray(y * srcStride, y * srcStride + w), (top + y) * dstStride);
      }
      top += h;
    }
    try {
      return toTrimmedPNG(out, trimSides);
    } finally {
      out.destroy?.();
    }
  } finally {
    for (const p of pix) p.destroy?.();
  }
}

/**
 * Split the option markers of one question into a rectangle per option.
 *
 * Options are set two to a row — "(1) … (2)" then "(3) … (4)" — so an option's
 * rectangle runs from its own marker across to the next marker on the same row
 * (or the column edge), and down as far as the next row begins.
 */
function optionRects(marks, colX0, colX1, bottom, forcedLabels) {
  if (!marks.length) return {};

  // Which label set this paper uses, read from the page rather than assumed —
  // unless the caller knows, in which case counting is worse than useless.
  //
  // It does not follow from the publisher: ALLEN's 2022 booklets print
  // "(A) (B) (C) (D)" and its 2023 ones print "(1) (2) (3) (4)". Assuming
  // letters for every ALLEN file found no markers at all in 2023 and silently
  // dropped 2,687 option crops.
  //
  // Counting is the wrong test for a MATCH-THE-COLUMN question, though, and
  // that is why a caller may override it. Such a question prints "(1)".."(4)"
  // down Column II of its table and its four real choices as "(A)".."(D)"
  // below — an exact tie, which this resolved in favour of the digits. The
  // crops then became the four Column II TERMS, and the stem was cut off above
  // them at the table's own heading: four answers no one offered, under half a
  // question.
  const numeric = marks.filter((m) => /[1-4]/.test(m.label)).length;
  const alpha = marks.filter((m) => /[A-D]/.test(m.label)).length;
  const labels =
    forcedLabels ?? (numeric >= alpha ? ["1", "2", "3", "4"] : ["A", "B", "C", "D"]);

  // Group into rows by baseline.
  const rows = [];
  for (const m of [...marks].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find((r) => Math.abs(r.y - m.y) <= ROW_TOLERANCE);
    if (row) row.items.push(m);
    else rows.push({ y: m.y, items: [m] });
  }
  for (const r of rows) r.items.sort((a, b) => a.x - b.x);

  // Keep only the markers that are actually option labels.
  //
  // An option's own text contains markers — "(1) (1) and (4) only  (2) (1), (2)
  // and (4) only" — and splitting at every one of them produced four-character
  // slivers like ") (1),". The real labels are the ones that appear in reading
  // order as 1, 2, 3, 4, so the scan takes the next EXPECTED label and skips
  // everything else.
  let want = 0;
  for (const row of rows) {
    row.items = row.items.filter((m) => {
      if (want < labels.length && m.label === labels[want]) { want++; return true; }
      return false;
    });
  }
  // A row left with nothing is not a row of options.
  const kept = rows.filter((r) => r.items.length);
  rows.length = 0;
  rows.push(...kept);
  if (!rows.length) return {};

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
 * @param {"mathongo"|"allen"|"gate"} o.mode
 * @returns {{written:number, missing:number[],
 *            parts: Map<string,{stem?:string, options?:object, solution?:string, optionsInStem?:boolean}> keyed by baseName; missing holds baseNames}}
 */
/**
 * @param {boolean} [fullWidth]
 *   Cut every crop at the page's own edges and leave the sides untrimmed, so
 *   each image is the width of the paper it came from. Set for sources whose
 *   questions are published as one picture rather than as a stem plus four
 *   option crops — see the ALLEN JEE Advanced converter. Off elsewhere: a
 *   per-option crop has to be trimmed to its own choice or the four of them
 *   are four page-wide bands with a few words in the corner.
 */
export function extractFigures({ pdfPath, outDir, wanted, mode, fullWidth = false }) {
  const parts = new Map();
  if (!wanted.length) return { written: 0, missing: [], parts };

  const doc = mupdf.Document.openDocument(fs.readFileSync(pdfPath), "application/pdf");

  // MathonGo prints "Q12."; ALLEN prints "12." at the head of its column; GATE
  // prints "Q.12" — the dot on the other side of the number, which neither of
  // the other two patterns matches.
  //
  // The ALLEN pattern refuses a digit after the dot, because a bare number and
  // a dot is also what the first half of a decimal looks like. Its booklets
  // print the question and its worked solution on the same page, and a
  // solution is full of them: an electronegativity table reading "1.5 2 2.5 3
  // 3.5 4.0" contributed four anchors — questions 1, 2, 3 and 4 — to a file
  // whose questions are numbered 51 to 75. The other two patterns need no such
  // guard: both require a literal "Q" that no number in a solution carries.
  const pattern =
    mode === "gate" ? /^Q\s*\.\s*(\d{1,3})\b/
    : mode === "mathongo" ? /^Q\s*(\d{1,3})\s*\./
    : /^(\d{1,3})\s*\.(?!\d)/;

  // GATE has printed its choices as "(A)".."(D)" in every paper of this
  // archive — the text parser splits on nothing else, and all 325 questions
  // come out with option text. Its match-the-column questions number Column II
  // "(1)".."(4)", so the label set has to be stated here rather than counted
  // off the page. The two-up coaching booklets genuinely vary and keep the
  // detection.
  const forcedLabels = mode === "gate" ? ["A", "B", "C", "D"] : null;
  const {
    questions: anchors, options: optionMarks, stops, solutions, instructions, footers, blocks,
    sharedStems, sectionHeads,
  } = structureOf(doc, pattern);

  // Which regions genuinely need to BE a picture, rather than merely having
  // one available. The crop is still cut either way — the image stays on the
  // row as the fallback for when the extracted text is wrong — but a caller
  // that can publish text should know when it may. See lib/regionInk.mjs.
  //
  // The furniture pass reads every page once, so it is done here rather than
  // per question — and before the crop bounds, which need its boxes.
  const furniture = documentFurniture(doc);

  /**
   * The top of the page's own advertising/footer band, from the DRAWN ink.
   *
   * Read once for the document because that is what makes it furniture: the
   * band is in the same place on every page. Bounded to the bottom margin and
   * to marks that run the width of the sheet, so an ordinary repeating
   * decoration cannot pass for a footer — see FURNITURE_BAND_SHARE.
   */
  const bandFloor = (() => {
    let sheetW = 0;
    try { sheetW = doc.loadPage(0).getBounds()[2]; } catch { return Infinity; }
    if (!(sheetW > 0)) return Infinity;
    let floor = Infinity;
    for (const m of furniture.marks) {
      if (!Number.isFinite(m.y0) || m.w < sheetW * FURNITURE_BAND_SHARE) continue;
      floor = Math.min(floor, m.y0);
    }
    return floor;
  })();

  /**
   * How far down a page a crop may go: above its footer, else the old inset —
   * and never into the drawn footer band, which no footer rule can read.
   */
  const contentBottom = (pageIndex, pageH) => {
    const fromText = footers.has(pageIndex) ? footers.get(pageIndex) - 2 : pageH - FOOTER_PT;
    return bandFloor >= pageH * FOOTER_ZONE ? Math.min(fromText, bandFloor) : fromText;
  };

  const byNumber = new Map();
  for (const a of anchors) {
    if (!byNumber.has(a.n)) byNumber.set(a.n, []);
    byNumber.get(a.n).push(a);
  }

  // ALLEN numbers its booklets two different ways and does not say which.
  //
  //   2022 booklets RESTART at each section — Section A runs 1..20 and Section
  //        B runs 1..10, so "7." appears twice and the caller disambiguates
  //        with `occurrence`.
  //   2023 booklets number ABSOLUTELY across the whole paper — a Chemistry
  //        booklet runs 61..90, Section A being 61..80 and Section B 81..90.
  //
  // Assuming the first convention lost every crop in 35 of the 48 files for
  // 2023: the code asked for anchor "1" on a file whose lowest question is 61,
  // found nothing, and reported 802 questions "not located" without any hint as
  // to why. So the base is read off the page — the smallest number that starts
  // a near-complete run of 30 — and questions are addressed from it.
  const anchorBase = numberingBase([...byNumber.keys()]);

  // Decided once for the file, from every question number in it. Per page it
  // would read a page whose second column happens to start below the fold as
  // single-column and crop the next one twice as wide.
  const twoUpBooklet = pagesAreTwoUp(anchors);

  // In reading order, so "the last one before this question" means it.
  const readingOrder = (p, q) => p.page - q.page || p.y - q.y;
  const stemHeads = [...sharedStems].sort(readingOrder);
  const heads = [...sectionHeads].sort(readingOrder);

  /**
   * The shared-stem heading this question belongs to, or null.
   *
   * The numbered form needs no bounding — it names the questions it serves, so
   * a heading that does not name this one is simply not its heading. The bare
   * "Paragraph" of the 2021 booklets names none, so it runs until the next
   * paragraph or the next section heading and no further; without that bound a
   * single "Paragraph" would attach itself to every question in the rest of the
   * file.
   */
  const sharedStemFor = (a) => {
    const precedes = (o) => o.page < a.page || (o.page === a.page && o.y < a.y);
    const named = stemHeads.filter(
      (s) => precedes(s) && s.from !== null && a.n >= s.from && a.n <= s.to
    );
    if (named.length) return named[named.length - 1];

    const bare = stemHeads.filter((s) => precedes(s) && s.from === null);
    const last = bare[bare.length - 1];
    if (!last) return null;
    const between = (o) =>
      (o.page > last.page || (o.page === last.page && o.y > last.y)) && precedes(o);
    if (stemHeads.some((s) => s !== last && between(s))) return null;
    if (heads.some(between)) return null;
    return last;
  };

  /** Where question `w` sits in this file, under whichever numbering it uses. */
  const locate = (w) => {
    if (anchorBase !== null && w.subjectNumber) {
      const hit = byNumber.get(anchorBase + w.subjectNumber - 1);
      if (hit) return hit[0];
    }
    const sightings = byNumber.get(w.printedNumber);
    return sightings?.[(w.occurrence ?? 1) - 1];
  };

  fs.mkdirSync(outDir, { recursive: true });
  let written = 0;
  const missing = [];

  /**
   * One Page object per page, however many crops are taken from it.
   *
   * A span reaches across pages and a shared stem across two more, so a single
   * question can ask for four of them and a booklet for hundreds — each one a
   * live WASM object waiting on a finaliser. That is the same pressure that
   * once made mupdf fail to load pages at all and took 1,176 questions down
   * with it; see the sampling note in regionInk.documentFurniture. A page is
   * only read here, so one handle serves everybody.
   */
  const pageCache = new Map();
  const pageAt = (index) => {
    if (!pageCache.has(index)) pageCache.set(index, doc.loadPage(index));
    return pageCache.get(index);
  };

  const drawingsByPage = new Map();
  const drawingsFor = (index, pageObj) => {
    if (!drawingsByPage.has(index)) {
      drawingsByPage.set(index, pageDrawings(pageObj, furniture.signatures));
    }
    return drawingsByPage.get(index);
  };

  for (const w of wanted) {
    const a = locate(w);
    if (!a) { missing.push(w.baseName); continue; }

    const page = pageAt(a.page);
    // Only some ALLEN booklets are set two-up. MathonGo and GATE both run one
    // column down the page, and so — measured, not assumed — do ALLEN's JEE
    // Advanced booklets. See `pagesAreTwoUp`.
    const twoUp = mode === "allen" && twoUpBooklet;
    const mid = a.pageW / 2;
    // ALLEN booklets are set two-up, so a crop spanning the page would carry
    // half of the worked solution printed beside the question.
    // Start at the question's own left edge rather than the column boundary.
    // These pages carry a black rule down the binding margin, and a crop that
    // began at x=0 put a thick black bar down the side of every image.
    const colEdge = twoUp ? (a.x < mid ? 0 : mid) : 0;
    // Full width means the sheet's own edges — not the question's left margin,
    // and not the page less an inset. Anything narrower is what reads on screen
    // as a question cut in half.
    const colX0 = fullWidth ? 0 : Math.max(colEdge, a.x - PAD * 2);
    const colX1 = fullWidth ? a.pageW : twoUp ? (a.x < mid ? mid : a.pageW - PAD) : a.pageW - PAD;

    const sameColumn = (o) => !twoUp || (o.x < mid) === (a.x < mid);

    /**
     * A QUESTION'S BOUNDARIES ARE TEXT MARKERS, SO THEY CROSS PAGE BREAKS.
     *
     * This asked `o.page === a.page`, and a page break is not a boundary the
     * paper prints. Six of the 48 questions in the 2026 Paper-1 booklets have
     * their answer line on the page AFTER their number — Maths Q6 and Q13,
     * Physics Q15 and Q16, Chemistry Q8 and Q9 — and for exactly those six the
     * end list came back empty, the band fell through to the foot of the page,
     * and everything printed overleaf was lost. Maths Q13 is the plainest: its
     * List-I/List-II table was cropped from page 16 while all four of its
     * options sit at the top of page 17, in no crop at all.
     *
     * Reading order, not y: below on this page, or anywhere on a later one.
     *
     * Two-up booklets keep the old same-page test. There the column beside a
     * question is the worked solution rather than a continuation, so "later in
     * the file" and "later in this column" are different questions, and the
     * per-column logic already keeps a question whole.
     */
    const after = (o) =>
      sameColumn(o) &&
      (twoUp
        ? o.page === a.page && o.y > a.y + 4
        : o.page > a.page || (o.page === a.page && o.y > a.y + 4));
    const inReadingOrder = (p, q) => p.page - q.page || p.y - q.y;

    const nextQ = anchors.filter(after).sort(inReadingOrder)[0];
    const nextStop = stops.filter(after).sort(inReadingOrder)[0];

    // Where this question's territory ends: the next question, or its own
    // answer line, whichever comes first in reading order.
    const endAt = [nextQ, nextStop]
      .filter(Boolean)
      .sort(inReadingOrder)[0] ?? null;
    // A marker more than MAX_SPAN_PAGES away means a question number went
    // unread somewhere between, not that this question is that long.
    const endsHere = endAt && endAt.page === a.page;
    const endsOverleaf = endAt && endAt.page > a.page && endAt.page - a.page <= MAX_SPAN_PAGES;
    const bandBottom = endsHere
      ? Math.min(endAt.y - 2, contentBottom(a.page, a.pageH))
      : contentBottom(a.page, a.pageH);

    /**
     * Where the question actually starts, which is not always its number.
     *
     * These papers are tables: the number sits in a narrow left cell and the
     * question in a wide one beside it, and the number is centred in its row.
     * Centred against two lines of question it is typeset BELOW the first of
     * them — GATE MT 2026 puts "Q.18" at y=118 and "Which one of the following
     * dislocation dissociation reactions is feasible in" at y=107. Cropping
     * from the number cut that line through the middle of its letters and the
     * candidate was asked "face-centered cubic metals?".
     *
     * So the top comes from the cell, not the label: a text block that STARTS
     * above the number and still reaches down to its line — which is what a
     * wrapped question beside a centred number looks like, and what nothing
     * else on the page does.
     *
     * Deliberately not "the block to the RIGHT of the number". That is how it
     * reads on the page and it is not what the boxes say: 2026 Q18's body
     * block begins at x=108 against a number at x=69, but Q57's begins at
     * x=64, a few points to its LEFT, and testing for it left Q57 asking
     * "form a spherical solid nucleus". The columns still bound the search, so
     * a two-up booklet cannot reach the solution printed beside the question.
     *
     * Reaching the label is not sufficient on its own either — some blocks run
     * the depth of the page. Two bounds hold it: the reach is capped at a few
     * lines, which is as far as centring a number in its own cell can push it,
     * and no other question's number may fall inside the lift, so it can never
     * cross into the question above. Within those it only moves the crop UP.
     */
    const liftFloor = Math.max(0, a.y - a.h * MAX_LABEL_LIFT_LINES);
    const bodyTop = blocks.reduce((top, b) => {
      // The block the number is WRITTEN in gets a shorter leash than the cell
      // beside it, and is identified by identity rather than by geometry: the
      // two boxes overlap in the case this exists for, because a number
      // centred in its row sits inside the span of the text beside it, so
      // "does this box contain the number" would reject GATE Q57 — the case it
      // was built for.
      //
      // Its own block may only give back the sliver of box that sits above its
      // first line, which is a couple of points of leading and is what five
      // GATE stems need to stop grazing their ascenders. Anything as deep as a
      // line is another LINE, and mupdf does merge those across a question
      // boundary: in ALLEN's 2025 Chemistry booklet it put the tail of
      // question 5's solution in the same block as question 6's number, and
      // taking that printed "So, Bond length of Li2 > B2" above the question.
      if (b.index === a.blockIndex) {
        return a.y - b.y < a.h ? Math.min(top, b.y) : top;
      }
      if (b.page !== a.page || b.y >= a.y || b.y < liftFloor) return top;
      // Not a block that stands in the same place on every page.
      //
      // The only thing holding this lift inside the question was the column
      // test below, and fullWidth sets colX0=0 and colX1=pageW, so it rejected
      // nothing at all. The diagonal ALLEN watermark — a 423x423pt text block —
      // then satisfied every remaining condition and lifted Maths Q13's crop
      // 11pt over its own number, far enough to catch the bottom of "Negative
      // Marks : -1 In all other cases." from the marking scheme above. Nothing
      // about the box says it is a watermark; that it is in the same place on
      // 24 of the booklet's 26 pages does.
      if (b.furniture) return top;
      if (b.x < colX0 || b.x >= colX1) return top;
      // Must still be under way at the number's own line, or it is a different
      // row of the table rather than this one.
      if (b.y + b.h <= a.y) return top;
      if (anchors.some((q) => q !== a && q.page === a.page && q.y >= b.y && q.y < a.y)) return top;
      return Math.min(top, b.y);
    }, a.y);
    let bandTop = Math.max(0, bodyTop - PAD);
    if (bandBottom - bandTop < MIN_HEIGHT_PT) { missing.push(w.baseName); continue; }

    /**
     * The stem the paper prints once and asks this question about.
     *
     * Its own heading says which questions it serves — "Question Stem for
     * Question Nos. 15 and 16" — so this is read off the page rather than
     * inferred from where anything sits. 2026 Paper-2 Maths Q15 was published
     * as the four words "The value of n is ______." with everything that
     * defines n in no crop at all; its pair, Q16, had the same stem printed
     * three hundred points above its own number and equally absent.
     *
     * It routinely lands on the page BEFORE the question — 2026 Paper-2 Physics
     * heads Q15 and Q16 at the very foot of page 15 and does not reach the "15."
     * until page 16 — which is the other direction a question's region has to be
     * able to cross a page break in.
     */
    const sharedRegions = [];
    const shared = sharedStemFor(a);
    if (shared) {
      // The shared part ends where the first question of the pair begins.
      const opensPair = anchors
        .filter((q) => q.page > shared.page || (q.page === shared.page && q.y > shared.y))
        .sort(inReadingOrder)[0];
      const sharedTop = Math.max(0, shared.y - PAD);
      if (opensPair && opensPair.page - shared.page <= MAX_SPAN_PAGES) {
        if (opensPair === a && shared.page === a.page) {
          // This question opens the pair and the stem is directly above it:
          // one rectangle, not two stacked with a seam between them.
          bandTop = Math.min(bandTop, sharedTop);
        } else {
          for (let p = shared.page; p <= opensPair.page; p++) {
            const from = p === shared.page ? sharedTop : HEADER_PT;
            const to = p === opensPair.page
              ? Math.min(opensPair.y - 2, contentBottom(p, a.pageH))
              : contentBottom(p, a.pageH);
            if (to - from < MIN_HEIGHT_PT) continue;
            sharedRegions.push({ page: pageAt(p), rect: [colX0, from, colX1, to] });
          }
        }
      }
    }

    const mine = { };
    const write = (name, rect) => {
      try {
        const png = renderRect(page, rect, SCALE, !fullWidth);
        // Nothing but blank page and cell borders inside that rectangle. No
        // file is written: an image of empty paper beside a radio button reads
        // as a choice the examiner printed and left blank.
        if (!png) return null;
        fs.writeFileSync(path.join(outDir, name), png);
        written++;
        return name;
      } catch {
        return null;
      }
    };
    /** Write one image out of several page regions, stacked in reading order. */
    const writeSpan = (name, regions) => {
      try {
        const png = renderSpan(regions, SCALE, !fullWidth);
        if (!png) return null;
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
      // Options begin after the instruction line when there is one, so the
      // numbered statements above it are not mistaken for choices.
      const instruction = instructions
        .filter((o) => o.page === a.page && o.y >= a.y && o.y <= bandBottom && sameColumn(o))
        .sort((p1, p2) => p1.y - p2.y)[0];
      const optionsFrom = instruction ? instruction.y : a.y;

      const marks = optionMarks.filter(
        (o) => o.page === a.page && o.y >= optionsFrom && o.y <= bandBottom && sameColumn(o)
      );
      optRects = optionRects(marks, colX0, colX1, bandBottom, forcedLabels);
    }

    const firstOptionY = Object.values(optRects).length
      ? Math.min(...Object.values(optRects).map((r) => r[1]))
      : null;

    // The question runs onto the next page, and what spilled over is the part
    // that matters: a stem and its figure fill the rest of the page and the
    // four choices start the following one. Question 38 of 24 Jun 2022 Shift 1
    // is the case — reaction scheme at the foot of page 5, all four structures
    // at the head of page 6 — and cropped to one page it is unanswerable.
    //
    // Where the text carries on after this region ends, in reading order: the
    // right column of the same page for a two-up booklet's left column, else
    // the top of the next page. Used only where no end marker was found on this
    // page at all — with one, the span below reads to the marker itself instead
    // of guessing how far down the next region to go.
    const nextRegion = () => {
      if (twoUp && a.x < mid) return { pageIndex: a.page, x0: mid, x1: a.pageW - PAD };
      if (a.page + 1 >= doc.countPages()) return null;
      return twoUp
        ? { pageIndex: a.page + 1, x0: 0, x1: mid }
        : { pageIndex: a.page + 1, x0: colX0, x1: colX1 };
    };

    /** The rest of a question, on the pages after the one its number is on. */
    const continuation = [];
    const optionsMissing = w.wantOptions !== false && Object.keys(optRects).length < 4;

    if (endsOverleaf && (w.wantOptions === false || optionsMissing)) {
      // The end marker is on a later page, so the question demonstrably carries
      // on there and this reads to it — page by page, skipping each running
      // header, stopping at the marker's own line.
      //
      // Conditioned on the question not already being complete here, because
      // half of every paper is the last question on some page and its next
      // marker is overleaf by nothing more than typesetting. Stitching all of
      // those on would staple blank paper — or the next question — under 131 of
      // GATE's 178 choice questions, which is what the narrow test below was
      // written for in the first place.
      for (let p = a.page + 1; p <= endAt.page; p++) {
        const stopAt = p === endAt.page
          ? Math.min(endAt.y - 2, contentBottom(p, a.pageH))
          : contentBottom(p, a.pageH);
        if (stopAt - HEADER_PT < MIN_HEIGHT_PT) continue;
        continuation.push({ page: pageAt(p), rect: [colX0, HEADER_PT, colX1, stopAt] });
      }
    } else if (optionsMissing && !endsHere) {
      // No end marker on this page: the old reach into the next region, which
      // is the right-hand column for a two-up booklet and the next page
      // otherwise. Still the only continuation a two-up booklet ever gets, and
      // the fallback for a marker so far away that the span above refused it.
      const region = nextRegion();
      const inRegion = (o) => region && o.page === region.pageIndex && o.x >= region.x0 && o.x < region.x1;
      const endsThere = [
        ...anchors.filter(inRegion).map((o) => o.y),
        ...stops.filter(inRegion).map((o) => o.y),
      ];
      const contBottom = endsThere.length
        ? Math.min(...endsThere) - 2
        : contentBottom(region?.pageIndex, a.pageH);
      // Nothing worth adding if the next question starts at the top of that
      // region — then this one really did finish where its column did.
      if (region && contBottom - HEADER_PT >= MIN_HEIGHT_PT) {
        continuation.push({
          page: pageAt(region.pageIndex),
          rect: [region.x0, HEADER_PT, region.x1, contBottom],
        });
      }
    }

    // ── stem ─────────────────────────────────────────────────────────────
    // Everything above the first option marker, so the picture of the question
    // is the question and nothing else.
    //
    // UNLESS the four options did not all come out. Cutting the stem above the
    // options is only safe when the options survive somewhere else — and when a
    // question draws its choices as figures with no "(A)" text beside them,
    // nothing anchors them, no option crop is made, and the extracted option
    // text is empty too. The candidate then gets a stem, four blank choices and
    // no way to answer. 214 questions across 2022 and 2023 were in that state.
    //
    // So the rule is: the question image must always contain everything the
    // paper printed for that question, minus whatever was successfully split
    // out of it. Losing the split is survivable; losing the options is not.
    const wantedOptions = w.wantOptions !== false;

    // THE OPTIONS ARE CUT FIRST, AND THE STEM IS DECIDED FROM WHAT SURVIVED.
    //
    // Whether the stem may stop above the options depends on the options
    // existing somewhere else, and that is not known until they are written:
    // a rectangle can be located and still yield no file, because trimming it
    // leaves nothing but blank paper and cell borders. Deciding from the
    // rectangle count alone — which is what this did — cut the stem above a
    // choice that then had no image of its own, and the candidate got a
    // question with a blank option and no way to read it.
    //
    // A question that runs onto the next page is never complete however many
    // markers were found on this one: the rest of it is on a page these
    // rectangles do not cover.
    const located = Object.keys(optRects).length === 4 && !continuation.length;
    const optionFiles = {};
    if (located || !wantedOptions) {
      for (const [letter, rect] of Object.entries(optRects)) {
        const name = write(`${w.baseName}_${letter}.png`, rect);
        if (name) optionFiles[letter] = name;
      }
    }
    const complete = !wantedOptions || (located && Object.keys(optionFiles).length === 4);

    // Partial crops are worse than none: three options beside a fourth blank
    // row reads as though the paper printed three. When they are not all
    // there, the stem below carries the lot instead.
    if (complete && wantedOptions) mine.options = optionFiles;
    else for (const name of Object.values(optionFiles)) discard(outDir, name);

    const stemBottom = firstOptionY !== null && complete ? firstOptionY - 1 : bandBottom;
    // Options that were split out are cut off the stem; anything continuing
    // overleaf means the band, not the stem, is what has to be kept whole.
    const ownBottom = continuation.length
      ? bandBottom
      : stemBottom - bandTop >= MIN_HEIGHT_PT
        ? stemBottom
        // The options start immediately: keep the whole band rather than nothing.
        : bandBottom;

    // The question's picture, in reading order: the stem the paper prints once
    // for a pair of questions, then this question's own band, then whatever
    // continues overleaf.
    const regions = [
      ...sharedRegions,
      { page, rect: [colX0, bandTop, colX1, ownBottom] },
      ...continuation,
    ];
    mine.stem = regions.length === 1
      ? write(`${w.baseName}_Q.png`, regions[0].rect)
      : writeSpan(`${w.baseName}_Q.png`, regions);

    // Tell the caller whether the choices are inside the stem image, so a row
    // can be marked and the UI can say "the choices are in the image" instead
    // of "not readable".
    mine.optionsInStem = wantedOptions && !complete;

    // Does the question NEED to be shown as a picture, or is its text the whole
    // of it? Measured over the stem's own rectangle, and given the text the
    // caller extracted for it so a region that drew nothing but whose text
    // came out empty is still marked.
    const ink = drawingsFor(a.page, page);
    const geometry = { pageW: a.pageW, pageH: a.pageH };
    mine.question = classifyRegion(
      ink,
      [colX0, bandTop, colX1, stemBottom > bandTop ? stemBottom : bandBottom],
      { ...geometry, text: w.stemText ?? "" }
    );

    // ── solution ─────────────────────────────────────────────────────────
    if (w.wantSolution) {
      const sol = solutions
        .filter((s) => s.page === a.page && s.y > a.y && sameColumn(s))
        .sort((p, q) => p.y - q.y)[0];

      /**
       * The solution that starts overleaf.
       *
       * A booklet sets a question near the foot of a page and its worked
       * solution on the next one, which is ordinary typesetting rather than an
       * edge case: in ALLEN's 2025 Physics paper it happened to five of sixteen
       * questions, and every one of them came back with no solution image at
       * all because the search above never left the anchor's page.
       *
       * Bounded by the next question, so this can only ever pick up the
       * solution belonging to this one. Stems already do exactly this - see
       * `continuation` - and this reuses the same span writer.
       */
      if (!sol) {
        const lastPage = nextQ ? nextQ.page : a.page + 1;
        let head = null;
        for (let p = a.page + 1; p <= lastPage && !head; p += 1) {
          head = solutions
            .filter((s) => s.page === p && (!nextQ || nextQ.page !== p || s.y < nextQ.y))
            .sort((x, y) => x.y - y.y)[0] ?? null;
        }

        if (head) {
          const regions = [];
          for (let p = head.page; p <= (nextQ ? nextQ.page : head.page); p += 1) {
            const top = p === head.page ? Math.max(0, head.y - PAD) : HEADER_PT;
            const bottom = nextQ && nextQ.page === p
              ? Math.min(nextQ.y - 2, contentBottom(p, a.pageH))
              : contentBottom(p, a.pageH);
            if (bottom - top < MIN_HEIGHT_PT) continue;
            regions.push({ page: pageAt(p), rect: [colX0, top, colX1, bottom] });
          }

          if (regions.length) {
            mine.solution = regions.length === 1
              ? write(`${w.baseName}_S.png`, regions[0].rect)
              : writeSpan(`${w.baseName}_S.png`, regions);
            mine.solutionInk = classifyRegion(
              drawingsFor(head.page, pageAt(head.page)),
              regions[0].rect,
              { pageW: a.pageW, pageH: a.pageH, text: w.solutionText ?? "" },
            );
          }
        }
      }

      if (sol) {
        // The next question, only where it is on this page: `nextQ` now looks
        // ahead in reading order, and comparing an overleaf y against this
        // page's would put the solution's foot above its own head.
        const solEnd = nextQ && nextQ.page === a.page && nextQ.y > sol.y
          ? nextQ.y - 2
          : contentBottom(a.page, a.pageH);
        if (solEnd - sol.y >= MIN_HEIGHT_PT) {
          const solRect = [colX0, Math.max(0, sol.y - PAD), colX1, solEnd];
          mine.solution = write(`${w.baseName}_S.png`, solRect);
          // Judged separately from the question, because they differ far more
          // often than not: a stem of two lines of algebra whose solution is
          // worked out on a graph is the ordinary case, not the exception.
          mine.solutionInk = classifyRegion(drawingsFor(a.page, page), solRect, {
            pageW: a.pageW, pageH: a.pageH, text: w.solutionText ?? "",
          });
        }
      }
    }

    // Keyed by base name, which is unique per question, NOT by printed number.
    //
    // ALLEN's 2022 booklets restart their numbering at each section, so both
    // "7." in Section A and "7." in Section B ask for printed number 7 — the
    // Section B entry overwrote the Section A one, and ten questions per
    // subject per paper were then handed a picture of a different question.
    // `occurrence` disambiguates which anchor to CROP; it did nothing about
    // which slot the result was stored in.
    parts.set(w.baseName, mine);
  }

  return { written, missing, parts };
}
