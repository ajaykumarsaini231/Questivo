// Work out which section each question belongs to, and which printed key is
// actually its answer.
//
// THE BUG THIS EXISTS TO FIX
//
// Both converters used to assume a MathonGo paper prints the 20 multiple-choice
// questions of a subject first and its 10 numerical ones after — positions 1-20
// and 21-30 — because that is the order the exam defines. 19 of the 26 papers
// do not print them that way. They interleave, so a numerical question turns up
// as Q4 with three MCQs after it.
//
// The ANSWER KEY, though, is always printed in the exam's order: the twenty
// option numbers first, then the ten values. So reading key[4] for the question
// printed as Q4 hands a numerical question an option number.
//
// Concretely, 30 Jan 2023 Shift 2 Physics Q4 — a stone on a 180 cm string at 28
// rev/min, asking for x in a = 1936/x:
//
//     ω = 28·2π/60 = 2.933 rad/s,  a = ω²r = 15.49 m/s²,  x = 1936/15.49 = 125
//
// The stored key was "A". Key position 21 — the first numerical slot — is 125.
// Q6 asks for α where s = ⅓α²√P, which works out to α = 4; key position 22 is 4.
// The mapping below is what produced those two, and it is why it is done by
// counting rather than by position.
//
// WHAT IDENTIFIES A NUMERICAL QUESTION
//
// Its fill-in blank — "The value of x ______." — and NOT the absence of
// options. Plenty of MCQs in these files have no extractable options because
// the choices are drawn as vector outlines, and treating those as numerical
// would corrupt far more than it fixed.

/** "The value of x ______." — three or more underscores. */
const BLANK = /_{3,}/;

/**
 * A subject's shape: multiple choice first, numerical after.
 *
 * The default is the 2021-2024 paper. It is a default and not a constant
 * because the board has changed the split — 2025 cut Section B from ten
 * questions to five — and a caller that knows the year says so.
 */
const DEFAULT_SHAPE = { mcq: 20, numerical: 10 };

/**
 * Re-derive section, question type and answer key for one subject's questions.
 *
 * @param {Array} questions  the subject's questions, in printed order, each
 *                           with `{ number, questionText, options }`
 * @param {number} base      key offset for this subject: 0, N or 2N
 * @param {Map<number,string>} key  printed answer key for the whole paper
 * @param {{mcq:number, numerical:number}} [shape]  this year's split
 * @returns {{assigned: Array, interleaved: boolean, trustworthy: boolean}}
 */
export function assignSectionsAndKeys(questions, base, key, shape = DEFAULT_SHAPE) {
  const MCQ_PER_SUBJECT = shape.mcq;
  const NUM_PER_SUBJECT = shape.numerical;
  // Three states, not two.
  //
  //   definitely MCQ       — options were extracted
  //   definitely numerical — a fill-in blank, and no options
  //   unknown              — neither, because the whole question is drawn
  //
  // Treating "unknown" as MCQ was too eager: a subject would come out as 22
  // MCQs and 8 numericals, fail the shape check, and lose its keys. But the
  // subject's shape is itself information — it must be exactly 20 and 10 — and
  // when the unknowns can only be resolved one way, they ARE resolved.
  const kind = questions.map((q) => {
    const hasOptions = Boolean(q.options) && Object.values(q.options).some((o) => o && String(o).trim());
    if (hasOptions) return "mcq";
    if (BLANK.test(q.questionText || "")) return "num";
    return "unknown";
  });

  const definiteMcq = kind.filter((k) => k === "mcq").length;
  const definiteNum = kind.filter((k) => k === "num").length;
  const unknown = kind.filter((k) => k === "unknown").length;
  const full = questions.length === MCQ_PER_SUBJECT + NUM_PER_SUBJECT;

  // Every unknown must be numerical, because the numerical slots cannot be
  // filled otherwise.
  if (full && definiteNum + unknown === NUM_PER_SUBJECT) {
    kind.forEach((k, i) => { if (k === "unknown") kind[i] = "num"; });
  } else if (full && definiteMcq + unknown === MCQ_PER_SUBJECT) {
    // ...or every unknown must be MCQ, by the same argument.
    kind.forEach((k, i) => { if (k === "unknown") kind[i] = "mcq"; });
  }

  const isNumerical = kind.map((k) => k === "num");
  const numCount = isNumerical.filter(Boolean).length;
  const mcqCount = questions.length - numCount;

  // Only re-key when the classification reproduces the exam's own shape.
  // Anything else means some questions are still unresolved, and re-keying on a
  // wrong count shifts every answer after the mistake.
  const trustworthy =
    full && numCount === NUM_PER_SUBJECT && mcqCount === MCQ_PER_SUBJECT;

  let seenMcq = 0;
  let seenNum = 0;
  let interleaved = false;

  const assigned = questions.map((q, i) => {
    const numerical = isNumerical[i];
    const within = ((q.number - 1) % 30) + 1;
    if (numerical && within <= MCQ_PER_SUBJECT) interleaved = true;

    if (trustworthy) {
      const section = numerical ? "B" : "A";
      const keyIndex = numerical ? base + MCQ_PER_SUBJECT + ++seenNum : base + ++seenMcq;
      return {
        ...q,
        section,
        numberInSubject: within,
        keyIndex,
        answerRaw: key.get(keyIndex) ?? null,
        // A numerical key is a value; an MCQ key is an option number 1-4.
        fromOptionNumber: section === "A",
        keyUnreliable: false,
      };
    }

    // Not enough of the subject survived extraction to recount, so the printed
    // position is all there is.
    const section = numerical ? "B" : within <= MCQ_PER_SUBJECT ? "A" : "B";

    // A numerical question sitting in a multiple-choice key slot is a mismatch
    // that cannot be repaired here: its real answer is in one of the ten
    // numerical slots, and without the full subject there is no way to know
    // which. What the slot does hold is an option number, and serving that as
    // the answer to "the value of x is ____" would mark a candidate who
    // answered 125 wrong. A missing key is recoverable; a confidently wrong one
    // teaches the mistake. So it is dropped and flagged.
    const mismatch = numerical && within <= MCQ_PER_SUBJECT;

    return {
      ...q,
      section,
      numberInSubject: within,
      keyIndex: q.number,
      answerRaw: mismatch ? null : key.get(q.number) ?? null,
      fromOptionNumber: section === "A" && !numerical,
      keyUnreliable: mismatch,
    };
  });

  return { assigned, interleaved, trustworthy, mcqCount, numCount, total: questions.length };
}

export { BLANK as NUMERICAL_BLANK };
