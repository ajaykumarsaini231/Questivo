// Parse an ALLEN "Final JEE-Main Exam" solution PDF for one subject/shift.
//
// SHAPE OF THE SOURCE
//
//   SECTION-A
//   1. The bulk modulus of a liquid is 3 × 10^(10) Nm^(-2). The pressure ...
//      (A) 3 × 10^(8) Nm^(-2)   (B) 9 × 10^(8) Nm^(-2)
//      (C) 6 × 10^(8) Nm^(-2)   (D) 12 × 10^(8) Nm^(-2)
//      Official Ans. by NTA (C)
//      Allen Ans. (C)
//   Sol. B = 3 × 10^(10) ...
//   2. ...
//   SECTION-B          ← numbering restarts at 1, questions are numerical
//
// Section A is 20 four-option MCQs, Section B is 10 numerical-answer questions.
// Both sections number from 1, so the section has to be tracked while walking.
//
// WHY SEGMENTATION ANCHORS ON THE ANSWER LINE
//
// The obvious approach — find every line starting "5." — breaks, because
// worked solutions are full of lines like "5. 0 10 cm" that are the tail of a
// formula. One false positive shifts the numbering and corrupts every question
// after it in the file.
//
// "Official Ans. by NTA" appears exactly once per question and never inside a
// solution, so it is used as the skeleton: find the answer lines first, and only
// then look backwards, within the span that must contain it, for the question
// number. A stray "5." outside that span can no longer do any damage.

/** Page furniture that repeats on every page and would otherwise land mid-question. */
const STRIP = [
  /©\s*(ALLEN\s*)?Digital\s*Pvt\.?\s*Ltd\.?\s*(\[\d+\])?/gi,
  /ALLEN\s*Digital\s*Pvt\.?\s*Ltd\.?/gi,
  /Final\s+JEE-?Main\s+Exam[^\n]*/gi,
  /JEE-?MAIN\s+20\d\d\s*\((PHYSICS|CHEMISTRY|MATHEMATICS|MATHS)\)/gi,
  /Test\s+Pattern\s*:\s*JEE-?MAIN[^\n]*/gi,
  /Topic\s+Covered\s*:[^\n]*/gi,
];

// No `$` anchor: on a page where an option overhangs into the answer line the
// two share a line — "(C) Official Ans. by NTA (D) ..." — and requiring the
// answer to end the line loses that question and shifts every number after it.
const OFFICIAL = /Official\s*Ans\.?\s*by\s*NTA\s*\(?\s*([^)\n]{1,24}?)\s*(?:\)|$)/i;
const ALLEN = /^\s*Allen\s*Ans\.?\s*\(?\s*([^)\n]{1,24}?)\s*\)?\s*$/i;
const SOL = /^Sol\b\.?\s*/i;

/**
 * Drop page furniture and blank lines.
 *
 * The lines arrive from lib/pdfLayout.mjs already in reading order with their
 * scripts marked, so nothing here reflows them — a joiner that second-guessed
 * the layout would undo the geometry the extractor recovered.
 */
const clean = (lines) =>
  lines
    .map((l) => {
      let s = l;
      for (const re of STRIP) s = s.replace(re, " ");
      return s.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean);

/** Join lines of one block back into running text. */
const joinText = (lines) => lines.join(" ").replace(/\s+/g, " ").trim();

/**
 * Split options when each one starts its own line.
 *
 * This is the reliable path for assertion-reason questions, whose option text
 * quotes "(A)" and "(R)" repeatedly — "(A) Both (A) and (R) are true and (R) is
 * the correct explanation of (A)". Searching the joined text for a run of four
 * ascending markers finds no such run there, because the quoted letters sit
 * between the real ones. Line starts have no such ambiguity.
 */
function splitOptionsByLine(lines) {
  const at = { A: -1, B: -1, C: -1, D: -1 };
  lines.forEach((l, i) => {
    const m = /^\(([A-D])\)/.exec(l);
    // Last wins: a question that quotes an option list is followed by the real
    // one, and it is the real one we want.
    if (m && (at[m[1]] < 0 || Object.values(at).every((v) => v <= i))) at[m[1]] = i;
  });

  if (!(at.A >= 0 && at.A < at.B && at.B < at.C && at.C < at.D)) return null;

  const take = (from, to) => joinText(lines.slice(from, to)).replace(/^\([A-D]\)\s*/, "").trim();
  return {
    options: {
      A: take(at.A, at.B),
      B: take(at.B, at.C),
      C: take(at.C, at.D),
      D: take(at.D, lines.length),
    },
    questionLines: at.A,
  };
}

/**
 * Split options that share lines — "(A) 3 × 10 (B) 9 × 10" — from joined text.
 */
function splitOptionsInline(text) {
  // (?<!\^) so an exponent the joiner produced is never mistaken for a label.
  const marks = [...text.matchAll(/(?<!\^)\(([A-D])\)/g)];
  if (marks.length < 4) return null;

  let start = -1;
  for (let i = 0; i + 3 < marks.length; i++) {
    if (marks.slice(i, i + 4).every((m, k) => m[1] === "ABCD"[k])) start = i;
  }
  if (start < 0) return null;

  const run = marks.slice(start, start + 4);
  const options = {};
  for (let i = 0; i < 4; i++) {
    const from = run[i].index + run[i][0].length;
    const to = i < 3 ? run[i + 1].index : text.length;
    options["ABCD"[i]] = text.slice(from, to).trim();
  }
  return { options, questionEnd: run[0].index };
}

/**
 * Drop worked-solution text that leaked onto the front of a stem.
 *
 * Only reachable when the question's number was drawn rather than typeset and
 * the bounded fallback above took a few lines too many. Each of these markers
 * belongs to the PREVIOUS question's answer, so everything up to the last one
 * is residue by definition.
 */
function stripSolutionResidue(text) {
  const marks = [...text.matchAll(/(?:Allen\s*Ans\.?|Official\s*Ans\.?[^.]*|After\s+solving|Sol\.)/gi)];
  if (!marks.length) return text;
  const last = marks[marks.length - 1];
  const rest = text.slice(last.index + last[0].length).trim();
  // Only if what remains still looks like a question. A genuine stem that
  // happens to quote "Sol." must not be truncated to nothing.
  return rest.length > 40 ? rest : text;
}

/** Question stem and options from the lines between a question number and its answer. */
function splitQuestion(lines) {
  const byLine = splitOptionsByLine(lines);
  if (byLine && Object.values(byLine.options).every(Boolean)) {
    return {
      questionText: stripSolutionResidue(joinText(lines.slice(0, byLine.questionLines)).trim()),
      options: byLine.options,
    };
  }

  const text = joinText(lines);
  const inline = splitOptionsInline(text);
  if (inline) {
    return { questionText: stripSolutionResidue(text.slice(0, inline.questionEnd).trim()), options: inline.options };
  }
  return { questionText: stripSolutionResidue(text.trim()), options: null };
}

/**
 * Every question in one ALLEN solution PDF.
 *
 * @param {string[]} rawLines   lines from lib/pdfLayout.mjs, in reading order
 * @returns {{section: "A"|"B", number: number, questionText: string,
 *            options: object|null, officialAnswer: string|null,
 *            allenAnswer: string|null, solution: string|null}[]}
 */
export function parseAllenSolution(rawLines) {
  const lines = clean(rawLines);

  const sectionAt = [];
  lines.forEach((l, i) => {
    const m = /^SECTION\s*[-–]?\s*([AB])\b/i.exec(l);
    if (m) sectionAt.push({ index: i, section: m[1].toUpperCase() });
  });
  if (!sectionAt.length) return [];

  const questions = [];

  for (let s = 0; s < sectionAt.length; s++) {
    const { index: sectionStart, section } = sectionAt[s];
    const sectionEnd = s + 1 < sectionAt.length ? sectionAt[s + 1].index : lines.length;

    // The skeleton: one answer line per question, in order.
    const anchors = [];
    for (let i = sectionStart + 1; i < sectionEnd; i++) {
      if (OFFICIAL.test(lines[i])) anchors.push(i);
    }

    // Where each question's text starts — searched only inside the span that
    // must contain it, so a "5." in an earlier solution is out of reach.
    // A question stem is a handful of lines. Anything longer than this before
    // the answer is the previous worked solution, not part of the question.
    const MAX_STEM_LINES = 10;

    const starts = anchors.map((anchor, i) => {
      const from = i === 0 ? sectionStart + 1 : anchors[i - 1] + 1;
      const want = new RegExp(`^${i + 1}\\s*\\.`);
      for (let j = from; j < anchor; j++) if (want.test(lines[j])) return j;

      // The number was drawn rather than typeset, so there is nothing to find.
      // Falling back to the whole span would prepend the entire previous
      // solution to the stem — "Allen Ans. (34) Sol. y = ... If two tangents
      // drawn from a point (α, β)...". Bounding it keeps the damage to a few
      // stray lines instead of a page.
      return Math.max(from, anchor - MAX_STEM_LINES);
    });

    anchors.forEach((anchor, i) => {
      const head = lines.slice(starts[i], anchor).map((l, k) =>
        k === 0 ? l.replace(new RegExp(`^${i + 1}\\s*\\.\\s*`), "") : l
      );
      const { questionText, options } = splitQuestion(head.filter(Boolean));

      // Solution runs from just after the answer block to the next question.
      const tailTo = i + 1 < starts.length ? starts[i + 1] : sectionEnd;
      const tail = lines
        .slice(anchor + 1, tailTo)
        .filter((l) => !ALLEN.test(l) && !OFFICIAL.test(l));
      const solution = joinText(tail).replace(SOL, "").trim();

      const allenLine = lines.slice(anchor + 1, Math.min(anchor + 4, tailTo)).find((l) => ALLEN.test(l));

      questions.push({
        section,
        number: i + 1,
        questionText,
        options: section === "A" ? options : null,
        officialAnswer: OFFICIAL.exec(lines[anchor])?.[1]?.trim() ?? null,
        allenAnswer: allenLine ? ALLEN.exec(allenLine)[1].trim() : null,
        solution: solution || null,
      });
    });
  }

  return questions;
}
