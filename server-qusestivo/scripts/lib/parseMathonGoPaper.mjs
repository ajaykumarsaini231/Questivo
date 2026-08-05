// Parse a MathonGo "JEE Main Previous Year Paper" PDF — all three subjects and
// the answer key for one shift.
//
// SHAPE OF THE SOURCE
//
//   Q1.A person moved from A to B on a circular path ...
//   (1)42 m(2)47 m
//   (3)19 m(4)40 m
//   Q2....
//   ...
//   ANSWER KEYS
//   1. (2)2. (1)3. (1)4. (2)5. (4) ...
//
// 90 questions: Q1–30 Physics, Q31–60 Chemistry, Q61–90 Mathematics. Within
// each subject the first 20 are four-option MCQs (Section A) and the last 10
// are numerical (Section B) — which is also visible in the key, where Section B
// answers are values like (5418) rather than an option number 1–4.
//
// The key is the only place the answers live, so a paper whose key does not
// parse is worth nothing and is rejected outright by the caller.

const STRIP = [
  /Join\s+the\s+Most\s+Relevant\s+Test\s+Series[^\n]*/gi,
  /JEE\s+Main\s+20\d\d\s*\(\s*\d{1,2}\s+\w{3}\s+Shift\s*\d\s*\)/gi,
  /JEE\s+Main\s+Previous\s+Year\s+Paper/gi,
  /^\s*Question\s+Paper\s*$/gim,
  /MathonGo/gi,
  /https?:\/\/links\.mathongo\.com\/\S*/gi,
];

/**
 * Drop page furniture and blank lines.
 *
 * Lines arrive from lib/pdfLayout.mjs already in reading order with their
 * scripts marked, so nothing here reflows them.
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

/** Where each subject sits. Fixed by the exam's own section order. */
export const SUBJECT_BLOCKS = [
  { from: 1, to: 30, subject: "Physics" },
  { from: 31, to: 60, subject: "Chemistry" },
  { from: 61, to: 90, subject: "Mathematics" },
];

/** Section A is the first 20 of each subject's 30, Section B the last 10. */
export function sectionFor(n) {
  const block = SUBJECT_BLOCKS.find((b) => n >= b.from && n <= b.to);
  if (!block) return null;
  return n - block.from < 20 ? "A" : "B";
}

export function subjectFor(n) {
  return SUBJECT_BLOCKS.find((b) => n >= b.from && n <= b.to)?.subject ?? null;
}

/**
 * Where the real options begin.
 *
 * A question that lists numbered statements and then asks you to pick among
 * combinations of them is full of decoy markers:
 *
 *   (1) The average kinetic energy ... decreases when the temperature is reduced.
 *   ...
 *   Choose the correct answer from the options given below :
 *   (1) (1) and (4) only        (2) (1), (2) and (4) only
 *
 * The marker sequence there is 1,2,3,4,1,1,4,2,1,2,4,3,... — the statements
 * form a clean 1-2-3-4 run and the actual options do not, because each option's
 * own text contains markers. Searching for a run therefore picks the
 * statements, and the paper renders with its statements as its choices.
 *
 * These papers always print an instruction line first, so the options are
 * whatever comes after it.
 */
const CHOOSE_LINE =
  /Choose the (?:correct|most appropriate|right)[^:\n]{0,80}:|from the options given below\s*:?/i;

/** Pull "(1) … (2) … (3) … (4) …" out of a question body. */
function splitOptions(text) {
  const instruction = CHOOSE_LINE.exec(text);
  const from = instruction ? instruction.index + instruction[0].length : 0;

  // (?<!\^) so an exponent the joiner produced — "5^(3)" — is never mistaken
  // for option 3.
  const marks = [...text.matchAll(/(?<!\^)\((\d)\)/g)]
    .filter((m) => "1234".includes(m[1]) && m.index >= from);
  if (marks.length < 4) return null;

  // Choose the four markers that carve the text into the most even pieces.
  //
  // A run of four CONSECUTIVE markers reading 1,2,3,4 does not exist in these
  // questions: each option's own text contains markers, so
  // "(1) (1) and (4) only  (2) (1), (2) and (4) only" yields
  // 1,1,4,2,1,2,4,3,2,4,4,1,2 and the whole question came back optionless.
  // Taking the first of each number in turn is not right either — it lands on
  // the "(4)" inside option 3's text and cuts that option in half.
  //
  // What separates a real marker from a decoy is spacing: four options divide
  // the text into four substantial pieces, while a decoy sits a few characters
  // from its neighbour. So every ascending 1-2-3-4 assignment is scored by its
  // SHORTEST piece, and the most even one wins. Marker counts here are small,
  // so the search is cheap.
  const at = (d) => marks.filter((m) => m[1] === d);
  let run = null;
  let best = -1;

  for (const m1 of at("1")) {
    for (const m2 of at("2")) {
      if (m2.index <= m1.index) continue;
      for (const m3 of at("3")) {
        if (m3.index <= m2.index) continue;
        for (const m4 of at("4")) {
          if (m4.index <= m3.index) continue;
          const score = Math.min(
            m2.index - m1.index,
            m3.index - m2.index,
            m4.index - m3.index,
            text.length - m4.index
          );
          if (score > best) {
            best = score;
            run = [m1, m2, m3, m4];
          }
        }
      }
    }
  }
  if (!run) return null;
  const options = {};
  for (let i = 0; i < 4; i++) {
    const from = run[i].index + run[i][0].length;
    const to = i < 3 ? run[i + 1].index : text.length;
    options["ABCD"[i]] = text.slice(from, to).trim();
  }
  return { options, questionEnd: run[0].index };
}

/**
 * Questions and answer key from one MathonGo paper.
 *
 * @param {string[]} rawLines   lines from lib/pdfLayout.mjs, in reading order
 * @returns {{questions: object[], key: Map<number,string>}}
 */
export function parseMathonGoPaper(rawLines) {
  const lines = clean(rawLines);

  const keyAt = lines.findIndex((l) => /^ANSWER\s*KEYS?\b/i.test(l));
  const bodyLines = keyAt >= 0 ? lines.slice(0, keyAt) : lines;
  const keyLines = keyAt >= 0 ? lines.slice(keyAt) : [];

  /* ------------------------------ answer key ------------------------------ */

  const key = new Map();
  const keyText = keyLines.join(" ");
  for (const m of keyText.matchAll(/(\d{1,3})\s*\.\s*\(\s*([^)]{0,20}?)\s*\)/g)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 90 && !key.has(n)) key.set(n, m[2].trim());
  }

  /* ------------------------------- questions ------------------------------ */

  // Any question number greater than the last one accepted.
  //
  // Not "exactly the next one". A question whose whole stem is drawn rather
  // than typeset has no "Q56." line to find, and a parser waiting for 56
  // specifically then rejects 57 through 64 as well — one unreadable question
  // silently costs nine. Requiring only that the number increases keeps a
  // stray "Q1" inside a later stem from restarting the parse, while letting a
  // gap be a gap.
  const starts = [];
  let last = 0;
  for (let i = 0; i < bodyLines.length && last < 90; i++) {
    const m = /^Q\s*(\d{1,2})\s*\.\s*(.*)$/i.exec(bodyLines[i]);
    if (!m) continue;
    const n = Number(m[1]);
    if (n <= last || n > 90) continue;
    starts.push({ line: i, rest: m[2], number: n });
    last = n;
  }

  const questions = starts.map((s, idx) => {
    const to = idx + 1 < starts.length ? starts[idx + 1].line : bodyLines.length;
    const body = joinText([s.rest, ...bodyLines.slice(s.line + 1, to)].filter(Boolean));
    const split = splitOptions(body);

    return {
      number: s.number,
      subject: subjectFor(s.number),
      section: sectionFor(s.number),
      questionText: (split ? body.slice(0, split.questionEnd) : body).trim(),
      options: split?.options ?? null,
    };
  });

  return { questions, key };
}
