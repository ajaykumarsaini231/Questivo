// Find where each question, each option and each worked solution begins.
//
// Everything the converter cuts is bounded by two anchors, so an anchor that is
// wrong by one line shows a candidate the wrong picture, and an anchor that is
// MISSING shifts every question after it onto its neighbour's crop. The rule
// throughout is therefore the same one convertGateScan.mjs established: read the
// numbers, check them against an invariant the paper guarantees, and refuse the
// paper rather than ship a plausible guess.
//
// Two marker styles occur across these volumes and both are handled:
//
//   2003-2011   "Q.21"          the recogniser returns one word
//   2012        "Q." "21"       it returns two
//
// and in the solutions, the answer is printed with the number:
//
//   "12. (B)"    which is where the answer key for these years comes from —
//                these booklets ship no separate key table.

import { groupLines } from "./bookletOcr.mjs";

/** The question number sits in the left margin, left of the text column. */
export const MARGIN_FRAC = 0.22;
/** Fallback bounds, for a page whose running header cannot be identified. */
export const HEADER_FRAC = 0.055;
export const FOOTER_FRAC = 0.95;

/** "GA/QB/MT-IV", "GWQB/W-V", "Elite Academy" and the page number beside them. */
const RUNNING_HEADER = /Elite|Academ|A?cademv|G[AW][/I]?QB|QB[/I]?[MW]T|MT[-—–]?\s*(I|V|X)+\b/i;

/**
 * The first y below the page's running header.
 *
 * A fixed fraction cannot do this job. The header sits at about 0.16 of the
 * page height and the first question can start at 0.19, so any constant that
 * clears the header also clips questions on the pages where it does not appear.
 * Stacking a crop across a page break made the cost visible: "Elite Academy
 * 159" appeared in the middle of a worked solution.
 *
 * So the header is identified and measured instead, and only skipped when the
 * topmost line actually is one.
 */
export function bodyTop(page) {
  const fallback = page.height * HEADER_FRAC;
  const lines = groupLines(page).filter((l) => l.y < page.height * 0.25);
  if (!lines.length) return fallback;

  const first = lines[0];
  // A lone number at the top of the page is a page number, and is a header too.
  const isNumberOnly = first.words.length === 1 && /^\d{1,3}$/.test(first.words[0].text.trim());
  if (!RUNNING_HEADER.test(first.text) && !isNumberOnly) return fallback;
  return first.bottom + Math.max(6, (first.bottom - first.y) * 0.4);
}

/**
 * The last y above the page's running footer.
 *
 * Some volumes set the running head at the foot instead, so a crop that runs to
 * the bottom of its page picks up "116  Elite Academy  GA/QB/MT-IV" under the
 * question. Same treatment as the header: identified and measured, with the
 * fixed fraction kept for the pages that have none.
 */
export function bodyBottom(page) {
  const fallback = page.height * FOOTER_FRAC;
  const lines = groupLines(page).filter((l) => l.y > page.height * 0.85);
  if (!lines.length) return fallback;

  const lastLine = lines[lines.length - 1];
  const isNumberOnly =
    lastLine.words.length === 1 && /^\d{1,3}$/.test(lastLine.words[0].text.trim());
  if (!RUNNING_HEADER.test(lastLine.text) && !isNumberOnly) return fallback;
  return Math.min(fallback, lastLine.y - Math.max(6, (lastLine.bottom - lastLine.y) * 0.4));
}

/**
 * Digits, allowing the letters OCR substitutes for them.
 *
 * In this position nothing but a number can appear, so "Q.S4" is 54 and "Q.I I"
 * is 11. Left un-normalised, a dozen anchors a paper are lost.
 */
const DIGITS = "[\\dIiLlOoSsBGZ]";
const readNumber = (s) =>
  Number(
    String(s)
      .replace(/[IiLl]/g, "1")
      .replace(/[Oo]/g, "0")
      .replace(/[Ss]/g, "5")
      .replace(/B/g, "8")
      .replace(/G/g, "6")
      .replace(/Z/g, "2")
  );

/** "Q.21", "Q 21", "Q.No.21" — number in the same token. */
const Q_WITH_NUMBER = new RegExp(`^Q\\s*[.,:]?\\s*(?:N[o0]\\s*[.,]?\\s*)?(${DIGITS}{1,3})\\s*[.,]?$`, "i");
/** "Q." alone: the number is the next token, or was lost entirely. */
const Q_BARE = /^Q\s*[.,:]?$/i;
/** A token that is only a number, for the token after a bare "Q." */
const NUMBER_ONLY = new RegExp(`^(${DIGITS}{1,3})\\s*[.,]?$`);
/**
 * "21." — the 2005-2009 volumes drop the "Q" and number the questions bare.
 *
 * The trailing full stop is required and is doing real work. Those years set a
 * marks column in the same margin, and it holds bare digits — "2", "4" — with
 * no stop; without this, every marks figure read as a question number and the
 * sequence check rejected the paper.
 */
const NUMBER_WITH_STOP = new RegExp(`^(${DIGITS}{1,3})\\s*[.)]$`);
/** "(A)" … "(D)"; OCR drops the brackets often enough to make them optional. */
const OPT_MARK = /^\(?\s*([A-Da-d])\s*[).,]?$/;
/** "12." or "12" opening a solution, followed by its answer in brackets. */
const SOL_NUMBER = new RegExp(`^(${DIGITS}{1,3})\\s*[.,)]?$`);

/* --------------------------- question anchors --------------------------- */

/**
 * Where each question starts, within `pages`.
 *
 * Only markers that OPEN a line in the left margin count. "Q.8" quoted inside a
 * sentence, and the "Q.1 to Q.20 carry one mark each" of the instructions, both
 * sit mid-line and are rejected by that alone.
 */
/**
 * Phrases that only ever appear on a paper's front matter.
 *
 * Those pages are a NUMBERED LIST — "10. Wrong answers will carry NEGATIVE
 * marks…" — set in the same left margin as the questions, and the bare "N."
 * marker style of the 2005-2009 volumes cannot tell the two apart. Worse, the
 * list is contiguous, so it forms a perfectly valid increasing run: on GATE
 * 2010 the instructions numbered 1..13 tied with the real questions for the
 * longest chain, and question 10's crop came out as the whole front of the
 * paper — the instructions, the Useful Data table and questions 1 to 10.
 *
 * Refusing to read anchors off these pages is the fix. They carry no questions,
 * so nothing is lost by skipping them.
 */
const INSTRUCTION_MARKERS = [
  /Read\s+the\s+following\s+instructions/i,
  /Optical\s+Response\s+Sheet|\bORS\b/i,
  /registration\s+number/i,
  /NEGATIVE\s+mark|negative\s+marking/i,
  /Rough\s+work/i,
  /darken(ing)?\s+the\s+(appropriate\s+)?bubble/i,
  /Useful\s+Data/i,
  /Do\s+not\s+open\s+the\s+seal/i,
];

/** Is this page front matter rather than questions? */
export function isInstructionPage(page) {
  const text = groupLines(page).map((l) => l.text).join(" ");
  const hits = INSTRUCTION_MARKERS.filter((re) => re.test(text)).length;
  if (hits >= 2) return true;
  // A single strong marker is enough when the page carries no choices at all —
  // every real question page has option labels on it.
  const options = findOptionMarks(page, 0, page.height).length;
  return hits >= 1 && options < 2;
}

export function findQuestionAnchors(pages) {
  const found = [];

  for (const page of pages) {
    if (isInstructionPage(page)) continue;
    const margin = page.width * MARGIN_FRAC;
    const top = page.height * HEADER_FRAC;
    const bottom = page.height * FOOTER_FRAC;

    for (const line of groupLines(page)) {
      if (line.y < top || line.y > bottom) continue;
      if (!line.words.length || line.words[0].x > margin) continue;

      // The marker is not always the first thing on the line: 2010-2012 print a
      // marks column to its left, so "4  Q.12  Which of the following…" opens
      // with the mark. Both positions are tried, and only those two — a marker
      // any further into the line is a citation inside a sentence.
      let hit = null;
      for (let i = 0; i < Math.min(2, line.words.length) && !hit; i++) {
        const w = line.words[i];
        if (w.x > margin) break;
        // Skipping over a first token is only allowed when that token is a
        // plausible mark (a bare single digit), never when it is a word.
        if (i === 1 && !/^[1-9]$/.test(line.words[0].text.trim())) break;
        hit = readMarker(line, i);
      }
      if (!hit) continue;

      // "Q.1 – Q.5 carry ONE mark each" is a section heading, not a question,
      // and reaches the recogniser as two markers on one baseline. Taking the
      // first would put question 1's crop on the heading and shift the paper.
      const others = line.words.filter(
        (w, j) => j > hit.consumed && Q_WITH_NUMBER.test(w.text.trim())
      );
      if (others.length) continue;

      found.push({
        n: hit.n,
        page: page.index,
        y: line.y,
        x: line.words[hit.at].x,
        // Where the DIGITS sit, which is a stable column down the page and is
        // what recoverMissingAnchors() matches against.
        numX: (hit.numAt !== undefined ? line.words[hit.numAt] : line.words[hit.at]).x,
        line,
        style: hit.style,
      });
    }
  }

  // A paper numbers its questions ONE way. Where both styles have been read,
  // the minority is something else wearing the same clothes — a numbered list
  // inside a question, or front matter that escaped the filter above — so it is
  // dropped rather than left to compete for a place in the sequence.
  const q = found.filter((a) => a.style === "q").length;
  const bare = found.length - q;
  if (q && bare) {
    const keep = q >= bare ? "q" : "bare";
    return found.filter((a) => a.style === keep);
  }
  return found;
}

/**
 * Read a question marker out of `line` starting at word `i`, or null.
 *
 * `consumed` is the index of the last word the marker used, so the caller can
 * tell a second marker on the same line from the number it just read.
 */
function readMarker(line, i) {
  const ws = line.words;
  const tok = ws[i].text.trim();
  const rest = ws[i + 1];

  const one = Q_WITH_NUMBER.exec(tok);
  if (one) return { n: readNumber(one[1]), at: i, consumed: i, style: "q" };

  if (Q_BARE.test(tok) && rest) {
    // "Q." then "21". The number must sit close enough to belong to it: on a
    // match-the-column list, "Q. Rolling" is an item label, not a question.
    const m = NUMBER_ONLY.exec(rest.text.trim());
    if (m && rest.x - (ws[i].x + ws[i].w) < ws[i].h * 2.5) {
      return { n: readNumber(m[1]), at: i, numAt: i + 1, consumed: i + 1, style: "q" };
    }
    // "Q." "I" "I" — 11 returned as two separate letters.
    if (rest.text.trim() === "I" && ws[i + 2]?.text.trim() === "I") {
      return { n: 11, at: i, numAt: i + 1, consumed: i + 2, style: "q" };
    }
    return null;
  }

  // The bare "21." style. Required to be followed by a real gap, so a decimal
  // or a numbered list item inside the body of a question is not mistaken for
  // the start of the next one.
  const bare = NUMBER_WITH_STOP.exec(tok);
  if (bare && rest && rest.x - (ws[i].x + ws[i].w) > ws[i].h * 0.5) {
    return { n: readNumber(bare[1]), at: i, consumed: i, style: "bare" };
  }
  return null;
}

/**
 * Reduce raw sightings to the one strictly increasing run through them.
 *
 * These papers number straight through, so the sequence is the check. Taking
 * the first sighting of each number and dropping anything that goes backwards —
 * the obvious greedy pass — is wrong, and quietly so: the instructions page
 * says "Q.1 to Q.25 carry one mark each", which puts a 25 into the stream
 * before question 2 exists, and every question from 2 to 25 is then discarded
 * for going backwards. Three papers lost more than fifty questions each that
 * way and still reported a tidy-looking run.
 *
 * The longest increasing subsequence has no such failure. A stray number can
 * only displace the real run if following it yields a LONGER chain, which a
 * one-off misread never does.
 */
export function sequenceAnchors(found, total) {
  const items = found
    .filter((a) => a.n >= 1 && a.n <= total)
    .sort((a, b) => a.page - b.page || a.y - b.y);
  if (!items.length) return [];

  // Patience sorting. tails[k] is the index of the smallest possible tail of an
  // increasing chain of length k+1; prev[] rebuilds the chain from its end.
  const tails = [];
  const tailIdx = [];
  const prev = new Array(items.length).fill(-1);

  for (let i = 0; i < items.length; i++) {
    const n = items[i].n;
    // Strictly increasing: a repeated number is a second sighting of the same
    // question — a running header, or the number quoted in its own solution.
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < n) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = n;
    tailIdx[lo] = i;
    prev[i] = lo > 0 ? tailIdx[lo - 1] : -1;
  }

  const chain = [];
  for (let i = tailIdx[tails.length - 1]; i >= 0; i = prev[i]) chain.push(items[i]);
  return chain.reverse();
}

/**
 * Recover anchors whose "Q." the recogniser dropped, leaving a bare number.
 *
 * On the 2011 and 2012 volumes the prefix is lost often enough to cost a dozen
 * questions a paper: what survives of "Q. 7" is "7", with no full stop, which
 * the bare-number style deliberately refuses — accepting every loose digit in
 * the margin would let a marks column and a figure label in with it.
 *
 * Here it is safe, because the search is far narrower. A SPECIFIC number is
 * looked for, in the NUMBER COLUMN the confidently-read anchors establish, and
 * only in the stretch of page between the anchors either side of the gap. A
 * candidate that satisfies all three is the missing question or nothing is.
 */
export function recoverMissingAnchors(pages, anchors, total) {
  const byN = new Map(anchors.map((a) => [a.n, a]));
  const xs = anchors.map((a) => a.numX).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (xs.length < 4) return anchors;
  const column = xs[Math.floor(xs.length / 2)];
  const pageOf = (i) => pages.find((p) => p.index === i);

  for (let n = 1; n <= total; n++) {
    if (byN.has(n)) continue;
    // Bounds: the nearest read anchor below and above. Without both, the
    // stretch to search is unbounded and a match could come from anywhere.
    let prev = null;
    let next = null;
    for (let k = n - 1; k >= 1 && !prev; k--) prev = byN.get(k) ?? null;
    for (let k = n + 1; k <= total && !next; k++) next = byN.get(k) ?? null;
    if (!prev || !next) continue;

    const hits = [];
    for (let i = prev.page; i <= next.page; i++) {
      const page = pageOf(i);
      if (!page || isInstructionPage(page)) continue;
      const tolerance = Math.max(14, page.width * 0.02);

      for (const line of groupLines(page)) {
        if (i === prev.page && line.y <= prev.y + 8) continue;
        if (i === next.page && line.y >= next.y - 8) continue;
        if (line.y < bodyTop(page) || line.y > page.height * FOOTER_FRAC) continue;

        for (let j = 0; j < Math.min(2, line.words.length); j++) {
          const w = line.words[j];
          if (Math.abs(w.x - column) > tolerance) continue;
          // Digits only here — no letter substitutions. Those exist to rescue a
          // marker already identified as one by its "Q"; applied to a loose
          // token they would turn any stray "I" or "S" into a question number.
          if (!/^\d{1,3}[.)]?$/.test(w.text.trim())) continue;
          if (Number(w.text.trim().replace(/[.)]/g, "")) !== n) continue;
          // Something has to follow it: a number alone in the column with no
          // question after it is a page artefact.
          if (!line.words[j + 1]) continue;
          hits.push({ n, page: i, y: line.y, x: w.x, numX: w.x, line, style: "recovered" });
        }
      }
    }
    if (hits.length === 1) byN.set(n, hits[0]);
  }

  return [...byN.values()].sort((a, b) => a.page - b.page || a.y - b.y);
}

/**
 * Fill in answers the first recognition pass lost, from a second one.
 *
 * Windows OCR drops isolated single characters, and on these key lines it drops
 * "(A)" far more than the rest — GATE 2008's key came back with two A's in 57.
 * The letters ARE legible; the engine returns them at a larger render, but at
 * that size it also returns them out of reading order, so "2. (C) 3. (A) 4. (C)
 * 5. (A)" arrives as "2. (C) 3. (A) (C) 4. 5. (A)". Pairing by sequence there
 * would attach the wrong letter to the wrong question, which is the one mistake
 * this pipeline must never make.
 *
 * So the pairing is GEOMETRIC. A question's answer is the bracketed letter on
 * its own baseline, to the right of its number and to the left of whatever
 * number comes next. Reading order is never consulted, so its scrambling
 * cannot matter.
 *
 * Only ever fills a blank. An answer already read stands: two passes that
 * disagree mean one of them is wrong, and the lower-resolution pass is the one
 * whose reading order is trustworthy.
 */
export function resolveAnswers(anchors, hiPages) {
  const byPage = new Map();
  for (const p of hiPages) byPage.set(p.index, p);

  for (const a of anchors) {
    if (a.answer) continue;
    const page = byPage.get(a.page);
    if (!page) continue;

    // The line at this anchor's baseline in the second pass.
    const height = Math.max(10, (a.line?.bottom ?? a.y + 20) - a.y);
    const line = groupLines(page)
      .filter((l) => Math.abs(l.mid - (a.y + height / 2)) < height * 0.9)
      .sort((p1, p2) => Math.abs(p1.y - a.y) - Math.abs(p2.y - a.y))[0];
    if (!line) continue;

    // This question's own number on that line, then the next number after it.
    // Everything between the two belongs to this question and nothing else.
    let from = null;
    let to = Infinity;
    for (const w of line.words) {
      const m = SOL_NUMBER.exec(w.text.trim());
      if (!m) continue;
      const n = readNumber(m[1]);
      if (n === a.n && from === null) from = w.x + w.w;
      else if (from !== null && w.x > from) { to = w.x; break; }
    }
    // The number itself may be one of the tokens this pass dropped; fall back
    // to the position it was read at in the first pass.
    if (from === null) from = a.x + Math.max(12, height * 0.5);

    const letters = line.words.filter((w) => {
      if (w.x < from || w.x >= to) return false;
      const t = w.text.trim();
      // Bracketed only. A bare letter in this position is as likely to be a
      // symbol from the working as a key.
      return /^\([A-Da-d]\)$/.test(t);
    });
    // Exactly one candidate, or it is not established.
    if (letters.length === 1) {
      a.answer = letters[0].text.trim()[1].toUpperCase();
      a.answerFrom = "second pass";
    }
  }
  return anchors;
}

/* ------------------------------- options -------------------------------- */

/**
 * The option labels inside a question's band, as lines.
 *
 * Returned with their geometry because the layout is not fixed: these booklets
 * set four choices either one per line, or two-by-two in a grid. Cutting a
 * grid's option A as a full-width band would hand the candidate option B in the
 * same picture, so the caller has to know which it is looking at.
 */
export function findOptionMarks(page, fromY, toY) {
  const out = [];
  for (const line of groupLines(page)) {
    if (line.y < fromY || line.y > toY) continue;
    for (let i = 0; i < line.words.length; i++) {
      const w = line.words[i];
      const m = OPT_MARK.exec(w.text.trim());
      if (!m) continue;
      // A label OPENS its choice: either the line, or a column within it. A
      // stray "(A)" inside prose — "as shown in (a)" — has text hard against
      // its left, so a gap is required before it.
      const prev = line.words[i - 1];
      const gap = prev ? w.x - (prev.x + prev.w) : Infinity;
      if (prev && gap < w.h * 0.8) continue;
      out.push({
        label: m[1].toUpperCase(),
        x: w.x,
        y: line.y,
        bottom: line.bottom,
        mid: line.mid,
        line,
      });
    }
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * The four choices as rectangles, or null when they are not cleanly separable.
 *
 * Null is a real answer and not a failure: where the four labels cannot be
 * found in order the honest thing is to leave the options inside the stem's own
 * crop, which the renderer and the importer both already handle. Guessing a
 * boundary here would cut a choice in half.
 */
export function optionBoxes(marks, page, bandBottom) {
  const picked = ["A", "B", "C", "D"].map((L) => marks.find((m) => m.label === L));
  if (!picked.every(Boolean)) return null;

  // These booklets set four choices in whichever arrangement fits the page:
  // one per line, two-by-two, or all four across a single line. Rather than
  // testing for each shape, the labels are gathered into rows and the grid is
  // read off whatever comes out — which also rejects the arrangements that are
  // genuinely ambiguous (a 3-and-1 split) instead of cutting them wrongly.
  const rows = [];
  for (const m of picked.slice().sort((a, b) => a.mid - b.mid || a.x - b.x)) {
    const height = Math.max(8, m.bottom - m.y);
    const row = rows.find((r) => Math.abs(r.mid - m.mid) < height * 0.8);
    if (row) {
      row.items.push(m);
      row.mid = row.items.reduce((s, x) => s + x.mid, 0) / row.items.length;
    } else {
      rows.push({ mid: m.mid, items: [m] });
    }
  }
  for (const r of rows) r.items.sort((a, b) => a.x - b.x);

  // Every row must hold the same number of choices, or the grid is not one.
  const perRow = rows[0].items.length;
  if (!rows.every((r) => r.items.length === perRow)) return null;
  if (![1, 2, 4].includes(perRow)) return null;

  const out = {};
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const next = rows[i + 1];
    const top = Math.min(...row.items.map((m) => m.y)) - 4;
    const bottom = next ? Math.min(...next.items.map((m) => m.y)) - 4 : bandBottom;
    if (bottom - top < 6) return null;

    for (let j = 0; j < row.items.length; j++) {
      // The column boundary sits just left of the next label rather than at
      // the middle of the page: these grids are not symmetric, and splitting
      // down the centre cut the wider choices in half.
      const left = j === 0 ? 0 : row.items[j].x - 10;
      const right = j === row.items.length - 1 ? page.width : row.items[j + 1].x - 10;
      if (right - left < 20) return null;
      out[row.items[j].label] = [left, top, right, bottom];
    }
  }

  return ["A", "B", "C", "D"].every((L) => out[L]) ? out : null;
}

/* ------------------------------- solutions ------------------------------ */

/**
 * Where each worked solution starts, and what answer it states.
 *
 * These volumes print no key table. The answer is in the solution's own first
 * line — "12. (B)" — so the key and the crop boundary are read together, which
 * is also what guarantees they agree: a letter is only ever taken from the line
 * an anchor was found on.
 *
 * Compact runs matter here. The General Aptitude answers are often set several
 * to a line — "55. (B) 56. (B) 57. (D)" — so every "N. (X)" pair on a line is
 * taken, not just the one that opens it.
 */
export function findSolutionAnchors(pages) {
  const found = [];

  for (const page of pages) {
    const top = page.height * HEADER_FRAC;
    const bottom = page.height * FOOTER_FRAC;
    const margin = page.width * 0.26;

    for (const line of groupLines(page)) {
      if (line.y < top || line.y > bottom) continue;

      for (let i = 0; i < line.words.length; i++) {
        const m = SOL_NUMBER.exec(line.words[i].text.trim());
        if (!m) continue;
        const n = readNumber(m[1]);
        if (!Number.isFinite(n) || n < 1 || n > 200) continue;

        const next = line.words[i + 1];
        const opt = next ? OPT_MARK.exec(next.text.trim()) : null;
        // The answer, but ONLY when it is bracketed and sits immediately after
        // the number. It is never searched for in the body of the working: a
        // derivation writes "det (A)" and "(B)" for its own quantities, and
        // reading one of those as the key would mark the whole question wrong
        // for every candidate who got it right.
        const answer = opt && /^\(/.test(next.text.trim()) ? opt[1].toUpperCase() : null;

        // A number begins a solution when it OPENS a line in the left margin.
        // Requiring an answer beside it — which the first version did — missed
        // every question the booklet works out rather than just states, which
        // on GATE 2012 was 16 of 65.
        const opensLine = i === 0 && line.words[0].x < margin;
        // The aptitude answers are set several to a line: "55. (B) 56. (B)".
        // Those follow another answer rather than opening the line.
        const prev = line.words[i - 1];
        const followsAnswer = prev && OPT_MARK.test(prev.text.trim()) && /^\(/.test(prev.text.trim());
        if (!opensLine && !followsAnswer) continue;
        // A number ALONE on its line opens a solution whose working starts on
        // the line below — which is how these booklets set every question they
        // derive rather than simply state, 16 of 65 on GATE 2012. It must
        // carry its full stop though: bare digits alone in the margin are the
        // equation numbers and step markers inside a derivation.
        if (opensLine && !next && !/[.)]$/.test(line.words[i].text.trim())) continue;

        found.push({
          n,
          answer,
          page: page.index,
          y: line.y,
          x: line.words[i].x,
          line,
          compact: !opensLine,
        });
      }
    }
  }

  return found;
}
