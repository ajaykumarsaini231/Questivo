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
/**
 * The answer line as the 2025 and 2026 booklets print it: "Ans. (3)", with no
 * publisher named.
 *
 * ALLEN changed the wording, and the skeleton this parser is built on — one
 * "Official Ans. by NTA" per question — stopped existing. Every 2025 file
 * parsed to zero questions, and the converter filled the gap with placeholder
 * rows: 1,710 questions with no text, no options and no answer key, which is
 * every JEE Main 2025 row in the archive.
 *
 * Not anchored to the start of the line, for the same reason OFFICIAL is not:
 * where the two columns of a page collide the extractor hands back one line
 * holding an option, the answer and the head of the solution together. Four
 * questions per Chemistry booklet arrive that way, and anchoring dropped every
 * one of them along with its key.
 *
 * The opening bracket is required, and that is what keeps "Answer the
 * following" — a question's own words — from reading as an answer: after "Ans"
 * it demands an optional dot and then "(", and "Answer" offers "w".
 */
const BARE_ANS = /(?:^|[^A-Za-z])Ans\.?\s*\(\s*([^)\n]{1,24}?)\s*\)/i;
const SOL = /^Sol\b\.?\s*/i;

/**
 * A question number at the head of a line: "51.".
 *
 * Refuses a digit after the dot so "1.5" inside a worked solution is not a
 * question number — the same distinction lib/figures.mjs draws when it looks
 * for the same anchors as boxes rather than as text.
 */
const NUMBER_LINE = /^(\d{1,3})\s*\.(?!\d)/;

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
 * The two ways these booklets label a choice.
 *
 * ALLEN's 2022 papers print "(A) (B) (C) (D)" and its 2023-onward ones print
 * "(1) (2) (3) (4)". Only the letters were understood here, so every newer
 * booklet parsed its stems and then found no options at all: JEE Main 2024
 * landed in the archive as 1,800 questions of which 30 had readable text, and
 * the rest were published as pictures because there was nothing else to show.
 * lib/figures.mjs already read both sets off the page; this side never did.
 *
 * Both are tried per question rather than decided once per file, and the run
 * that starts LATER wins. A question quotes the other family in its own words
 * — an assertion-reason stem says "(A) Both (A) and (R) are true", a
 * match-the-column stem numbers Column II "(1)".."(4)" — but it does so
 * ABOVE its real choices, never below them.
 */
const LABEL_SETS = [
  { key: "ABCD", labels: ["A", "B", "C", "D"], head: /^\(([A-D])\)/, all: /(?<!\^)\(([A-D])\)/g },
  { key: "1234", labels: ["1", "2", "3", "4"], head: /^\(([1-4])\)/, all: /(?<!\^)\(([1-4])\)/g },
];

/** Options are always returned under A-D, whatever the paper printed. */
const asAD = (values) => ({ A: values[0], B: values[1], C: values[2], D: values[3] });

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
  const candidates = [];

  for (const set of LABEL_SETS) {
    const at = Object.fromEntries(set.labels.map((l) => [l, -1]));
    lines.forEach((l, i) => {
      const m = set.head.exec(l);
      // Last wins: a question that quotes an option list is followed by the
      // real one, and it is the real one we want.
      if (m && (at[m[1]] < 0 || Object.values(at).every((v) => v <= i))) at[m[1]] = i;
    });

    const idx = set.labels.map((l) => at[l]);
    if (idx[0] < 0 || !idx.every((v, i) => i === 0 || idx[i - 1] < v)) continue;

    const take = (from, to) => joinText(lines.slice(from, to)).replace(set.head, "").trim();
    candidates.push({
      options: asAD([
        take(idx[0], idx[1]),
        take(idx[1], idx[2]),
        take(idx[2], idx[3]),
        take(idx[3], lines.length),
      ]),
      questionLines: idx[0],
    });
  }

  if (!candidates.length) return null;
  // The later run is the real one — see LABEL_SETS.
  return candidates.sort((a, b) => b.questionLines - a.questionLines)[0];
}

/**
 * Split options that share lines — "(A) 3 × 10 (B) 9 × 10" — from joined text.
 */
function splitOptionsInline(text) {
  const candidates = [];

  for (const set of LABEL_SETS) {
    // (?<!\^) so an exponent the joiner produced is never mistaken for a label.
    const marks = [...text.matchAll(set.all)];
    if (marks.length < 4) continue;

    let start = -1;
    for (let i = 0; i + 3 < marks.length; i++) {
      if (marks.slice(i, i + 4).every((m, k) => m[1] === set.labels[k])) start = i;
    }
    if (start < 0) continue;

    const run = marks.slice(start, start + 4);
    const values = run.map((m, i) => {
      const from = m.index + m[0].length;
      const to = i < 3 ? run[i + 1].index : text.length;
      return text.slice(from, to).trim();
    });
    candidates.push({ options: asAD(values), questionEnd: run[0].index });
  }

  if (!candidates.length) return null;
  // The later run is the real one — see LABEL_SETS.
  return candidates.sort((a, b) => b.questionEnd - a.questionEnd)[0];
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
    //
    // Which wording this booklet uses is read off the file, not assumed. The
    // older ones name the board — "Official Ans. by NTA (C)" — and print
    // ALLEN's own answer beneath it; 2025 onward prints only "Ans. (3)".
    // Whichever form is present is the skeleton, and only one of them is, so
    // a question can never be counted twice.
    const anchors = [];
    const hasOfficial = lines
      .slice(sectionStart + 1, sectionEnd)
      .some((l) => OFFICIAL.test(l));
    const isAnchor = hasOfficial ? (l) => OFFICIAL.test(l) : (l) => BARE_ANS.test(l) && !ALLEN.test(l);
    const answerOn = (l) => (OFFICIAL.exec(l) ?? BARE_ANS.exec(l))?.[1]?.trim() ?? null;

    /**
     * The same answer twice is one question, not two.
     *
     * Some booklets print the key, then the working, then the key again:
     *
     *     Ans. (4)
     *     Sol. Conceptual
     *     Ans. (4)
     *
     * Each repeat added a question to the skeleton — 24 Jan Shift 1 Physics
     * came out as 39 rather than 25 — and every question after the first
     * repeat took the stem of the one before it. Three conditions together, so
     * that only this shape collapses: no question number in between, the same
     * printed answer, and close enough to be the same block. Two genuine
     * questions can meet any one of those; they do not meet all three.
     */
    const SAME_ANSWER_WINDOW = 6;
    let lastKept = -1;
    let numberSinceKept = false;
    for (let i = sectionStart + 1; i < sectionEnd; i++) {
      if (NUMBER_LINE.test(lines[i])) numberSinceKept = true;
      if (!isAnchor(lines[i])) continue;
      const repeat =
        lastKept >= 0 &&
        !numberSinceKept &&
        i - lastKept <= SAME_ANSWER_WINDOW &&
        answerOn(lines[i]) !== null &&
        answerOn(lines[i]) === answerOn(lines[lastKept]);
      if (repeat) continue;
      anchors.push(i);
      lastKept = i;
      numberSinceKept = false;
    }

    /**
     * What this section numbers its first question.
     *
     * Both sections of a 2022 booklet start at 1. A 2025 one numbers straight
     * through its subject — Chemistry runs 51..70 in Section A and 71..75 in
     * Section B — so predicting "the i-th question is printed i+1" found no
     * stem at all there. Taken as the first numbered line standing between the
     * section heading and the first answer, which is that question's own
     * number under either convention.
     */
    const numberBase = (() => {
      for (let i = sectionStart + 1; i < (anchors[0] ?? sectionEnd); i++) {
        const m = NUMBER_LINE.exec(lines[i]);
        if (m) return Number(m[1]);
      }
      return 1;
    })();
    /** What the i-th question of this section is printed as. */
    const printedNumber = (i) => numberBase + i;

    // Where each question's text starts — searched only inside the span that
    // must contain it, so a "5." in an earlier solution is out of reach.
    // A question stem is a handful of lines. Anything longer than this before
    // the answer is the previous worked solution, not part of the question.
    const MAX_STEM_LINES = 10;

    const starts = anchors.map((anchor, i) => {
      const from = i === 0 ? sectionStart + 1 : anchors[i - 1] + 1;
      const want = new RegExp(`^${printedNumber(i)}\\s*\\.(?!\\d)`);
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
        k === 0 ? l.replace(new RegExp(`^${printedNumber(i)}\\s*\\.\\s*`), "") : l
      );
      const { questionText, options } = splitQuestion(head.filter(Boolean));

      // Solution runs from just after the answer block to the next question.
      const tailTo = i + 1 < starts.length ? starts[i + 1] : sectionEnd;
      const tail = lines
        .slice(anchor + 1, tailTo)
        .filter((l) => !ALLEN.test(l) && !OFFICIAL.test(l) && !BARE_ANS.test(l));
      const solution = joinText(tail).replace(SOL, "").trim();

      const allenLine = lines.slice(anchor + 1, Math.min(anchor + 4, tailTo)).find((l) => ALLEN.test(l));

      questions.push({
        section,
        // Position within the section, 1-based — what the caller addresses a
        // question by. Not the printed number, which is the same thing only
        // for a booklet that starts each section at 1.
        number: i + 1,
        questionText,
        options: section === "A" ? options : null,
        officialAnswer:
          OFFICIAL.exec(lines[anchor])?.[1]?.trim() ??
          BARE_ANS.exec(lines[anchor])?.[1]?.trim() ??
          null,
        allenAnswer: allenLine ? ALLEN.exec(allenLine)[1].trim() : null,
        solution: solution || null,
      });
    });
  }

  return questions;
}
