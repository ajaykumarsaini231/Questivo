// Split a scanned GATE booklet into its papers and their solution sections.
//
// These bundles are compilations: "GATE papers and solutions 2005-2009" is five
// question papers, each followed by its own worked solutions, in one 198-page
// scan. Nothing downstream can start until it is known which pages belong to
// which year and which half of that year.
//
// Both boundaries are printed as headings and are read as such:
//
//   GATE 2010 - MT : METALLURGICAL ENGINEERING     ← a paper starts
//   SOLUTIONS / ANSWERS                            ← its solutions start
//
// A HEADING, specifically, and not the words anywhere on the page. Matching
// loose words found "answers" in "Questions must be answered on the Objective
// Response Sheet" and opened a solutions section inside the instructions page
// of every paper. A heading is a short, centred line of its own, so that is
// what is tested — which is also why this works off lines rather than words.

import { groupLines } from "./bookletOcr.mjs";

/** Headings live above this fraction of the page. */
const HEAD_TO = 0.36;
/** A heading is a short line — this many words at most. */
const HEAD_WORDS = 6;

const GATE_YEAR = /GATE\s*[-–—]?\s*(19[89]\d|20[0-2]\d)/i;
const YEAR_ALONE = /^\(?(19[89]\d|20[0-2]\d)\)?[-–—]?$/;

/**
 * Only these tokens, in any order. "SOLUTIONS / ANSWERS", "SOLUTIONS ANSWERS /"
 * and a bare "ANSWERS" are all the same heading; a sentence containing the word
 * "answered" is not, because it brings other words onto the line with it.
 */
const SOLUTION_TOKEN = /^(SOLUTIONS?|ANSWERS?|KEYS?|[/&:—–-]|AND)$/i;
/** OCR routinely drops or doubles a letter in these two words. */
const SOLUTION_WORD = /^(S[O0]LUTI[O0]NS?|ANS[WV]ERS?)$/i;

const isSolutionHeading = (line) => {
  const ws = line.words.map((w) => w.text.trim()).filter(Boolean);
  if (!ws.length || ws.length > 5) return false;
  if (!ws.some((t) => SOLUTION_WORD.test(t))) return false;
  return ws.every((t) => SOLUTION_TOKEN.test(t) || SOLUTION_WORD.test(t));
};

/**
 * What a page's headings announce.
 *
 * `year` is set only when a heading names one; `metallurgy` when the subject
 * title appears in the heading block, which is what separates a paper's own
 * title page from a page that merely mentions a year.
 */
export function readHeading(page) {
  const head = groupLines(page).filter((l) => l.y <= page.height * HEAD_TO);

  let year = null;
  let years = new Set();
  let metallurgy = false;
  let solutions = false;

  for (const line of head) {
    if (line.words.length <= HEAD_WORDS) {
      const m = GATE_YEAR.exec(line.text);
      if (m) years.add(Number(m[1]));
      else {
        for (const w of line.words) {
          const y = YEAR_ALONE.exec(w.text.trim());
          // A bare year counts only on a line that is otherwise a title — the
          // running header carries a page number, not a year, but a two-digit
          // page number in a scan is not always read as two digits.
          if (y && line.words.length <= 4) years.add(Number(y[1]));
        }
      }
      if (/METALLURG/i.test(line.text)) metallurgy = true;
    }
    if (isSolutionHeading(line)) solutions = true;
  }

  if (years.size === 1) [year] = [...years];

  return {
    year,
    years: [...years],
    // A page naming more than one year is the volume's table of contents.
    isContents: years.size > 1 || head.some((l) => /\bContents\b/i.test(l.text)),
    solutions,
    metallurgy,
  };
}

/**
 * The booklet's sections, in page order.
 *
 * Returns [{ year, paperFrom, paperTo, solutionFrom, solutionTo }] with `to`
 * inclusive. A year whose solutions were never found comes back with
 * solutionFrom null — whether a paper without its key is worth keeping is the
 * caller's decision, not this one's.
 */
export function segmentBooklet(pages) {
  const marks = [];
  for (const p of pages) {
    const h = readHeading(p);
    if (h.isContents) continue;
    // A paper's title page names its year AND its subject. Requiring both stops
    // the solutions section — whose running header repeats the year in some
    // volumes — from reading as the start of another paper.
    if (h.year && h.metallurgy && !h.solutions) {
      marks.push({ kind: "paper", year: h.year, page: p.index });
    } else if (h.solutions) {
      marks.push({ kind: "solutions", year: h.year, page: p.index });
    }
  }

  // Collapse repeats: a heading reprinted as a running head on every page of
  // its section, and the two-line title page that names the year twice.
  const opens = [];
  for (const m of marks) {
    const prev = opens[opens.length - 1];
    if (prev && prev.kind === m.kind && m.page - prev.page <= 2) continue;
    if (prev && prev.kind === m.kind && m.kind === "solutions") continue;
    if (prev && prev.kind === m.kind && m.kind === "paper" && prev.year === m.year) continue;
    opens.push(m);
  }

  const sections = [];
  for (let i = 0; i < opens.length; i++) {
    const m = opens[i];
    if (m.kind !== "paper") continue;
    const next = opens[i + 1];
    const nextPaper = opens.find((o, j) => j > i && o.kind === "paper");

    const solutionFrom = next && next.kind === "solutions" ? next.page : null;
    const end = nextPaper ? nextPaper.page - 1 : pages.length - 1;

    sections.push({
      year: m.year,
      paperFrom: m.page,
      paperTo: solutionFrom ? solutionFrom - 1 : end,
      solutionFrom,
      solutionTo: solutionFrom ? end : null,
    });
  }
  return sections;
}
