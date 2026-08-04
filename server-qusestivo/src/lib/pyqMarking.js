/**
 * Marking a set of previous year questions against the stored key.
 *
 * Lifted out of pyqController so the three callers cannot drift: the real-paper
 * scorer, the generated-paper scorer, and the review endpoint that re-marks a
 * stored sitting when it is reopened. A paper that marked differently on review
 * than it did on submission would make the whole history worthless, and that is
 * exactly the bug you get from a second copy of this arithmetic.
 *
 * Nothing here touches the database. The caller supplies the questions with
 * their keys already loaded, which also makes the rules testable on their own.
 */

/**
 * Numerical answers match on value, not on string — "6" equals "6.00".
 *
 * GATE keys a numerical answer as a RANGE rather than a point: "0.14 to 0.16",
 * and often "15 to 15" for an exact one. The board does this because the
 * intended answer depends on how far the candidate rounded intermediate steps.
 * Read as a single number, "0.14 to 0.16" is NaN and every candidate who got it
 * right is marked wrong.
 *
 * A key may also offer alternatives — "0.14 to 0.16 or 14 to 16", where the
 * board accepted both a fraction and a percentage — so any range satisfies it.
 */
export function numericallyEqual(a, b) {
  // A candidate can type a Unicode minus as readily as a key can be typeset
  // with one, and Number("−5") is NaN.
  const x = Number(String(a ?? "").replace(/[−‒–—―]/g, "-").trim());
  if (!Number.isFinite(x)) return false;

  // Normalised the same way the importer normalises a key, so a row written
  // before that normalisation existed still scores correctly.
  const key = String(b ?? "").replace(/[−‒–—―]/g, (m, i, s) =>
    /[\d.]$/.test(s.slice(0, i).trim()) ? " to " : "-"
  );
  // The papers are keyed to 2dp at most, so this tolerance only absorbs float
  // representation, never a genuinely different answer.
  const EPS = 0.005;

  const ranges = [];
  for (const part of key.split(/\bor\b/i)) {
    const r = /^\s*(-?[\d.]+)\s*(?:to|-)\s*(-?[\d.]+)\s*$/i.exec(part);
    if (r) {
      const lo = Number(r[1]);
      const hi = Number(r[2]);
      if (Number.isFinite(lo) && Number.isFinite(hi)) ranges.push([Math.min(lo, hi), Math.max(lo, hi)]);
      continue;
    }
    const v = Number(part.trim());
    if (Number.isFinite(v)) ranges.push([v, v]);
  }
  if (!ranges.length) return false;
  return ranges.some(([lo, hi]) => x >= lo - EPS && x <= hi + EPS);
}

/**
 * Multiple-select answers match as a SET: the candidate must pick every correct
 * option and no incorrect one, but the order they clicked them in is not part
 * of the answer. GATE keys these as "A,B" or "B,C,D".
 */
export function optionSetEqual(a, b) {
  const set = (s) =>
    [...new Set(String(s ?? "").toUpperCase().match(/[A-Z]/g) ?? [])].sort().join(",");
  const given = set(a);
  return given !== "" && given === set(b);
}

/** True when this answer satisfies this question's key, by the question's type. */
export function isCorrectAnswer(q, answer) {
  if (q.questionType === "numerical" || q.questionType === "integer") {
    return numericallyEqual(answer, q.correctAnswer);
  }
  if (q.questionType === "mcq_multiple") return optionSetEqual(answer, q.correctAnswer);
  return String(answer).toUpperCase() === String(q.correctAnswer || "").toUpperCase();
}

/**
 * Mark a set of questions against the stored key.
 *
 * Two rules of the real paper that a naive "+4 per match" would get wrong:
 *
 *   - Section B caps how many answers count. JEE Main 2022 printed 10 numerical
 *     questions per subject and scored any 5, which is why the paper is out of
 *     300 and not 360. The first `sectionBAttemptLimit` ATTEMPTED questions per
 *     subject count, in paper order, and the rest are marked "not counted"
 *     rather than silently ignored.
 *   - A question the board voided scores full marks for everyone, attempted or
 *     not. That is what "bonus" meant on the day.
 */
export function markPaper(questions, responses, opts = {}) {
  const given = (id) => {
    const v = responses?.[id];
    return v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim();
  };

  // Which Section B answers count, decided before any marking.
  const limit = opts.sectionBAttemptLimit;
  const counted = new Set();
  const usedBySubject = new Map();

  for (const q of questions) {
    if (q.section !== "B" || !limit) {
      counted.add(q.id);
      continue;
    }
    if (given(q.id) === null) continue; // unattempted takes no slot
    const used = usedBySubject.get(q.subject) || 0;
    if (used < limit) {
      counted.add(q.id);
      usedBySubject.set(q.subject, used + 1);
    }
  }

  let score = 0;
  let correct = 0;
  let wrong = 0;
  let unattempted = 0;
  const bySubject = {};
  const breakdown = [];

  for (const q of questions) {
    const answer = given(q.id);
    const isBonus = q.status === "bonus";

    let verdict;
    let marks = 0;

    if (isBonus) {
      // Awarded to everyone on the day, whether or not they answered.
      verdict = "bonus";
      marks = q.marksCorrect;
    } else if (q.correctAnswer === null || q.correctAnswer === undefined) {
      // We do not know the answer to this one — status "needs_review", or a key
      // the source printed as something other than an answer.
      //
      // Without this it fell through to the comparison below, which no response
      // can satisfy, so the candidate was marked WRONG and given the negative
      // marks for a question nobody knows the answer to. Not counted is the
      // only honest verdict; it is deliberately NOT "bonus", which would hand
      // out full marks for the same unknown.
      verdict = "not_counted";
    } else if (!counted.has(q.id)) {
      verdict = "not_counted";
    } else if (answer === null) {
      verdict = "unattempted";
    } else if (isCorrectAnswer(q, answer)) {
      verdict = "correct";
      marks = q.marksCorrect;
    } else {
      verdict = "wrong";
      marks = q.marksIncorrect;
    }

    score += marks;
    if (verdict === "correct" || verdict === "bonus") correct++;
    else if (verdict === "wrong") wrong++;
    else if (verdict === "unattempted") unattempted++;

    const s = (bySubject[q.subject] ||= {
      subject: q.subject, score: 0, correct: 0, wrong: 0, unattempted: 0,
    });
    s.score += marks;
    if (verdict === "correct" || verdict === "bonus") s.correct++;
    else if (verdict === "wrong") s.wrong++;
    else if (verdict === "unattempted") s.unattempted++;

    breakdown.push({
      id: q.id,
      paperQuestionNumber: q.paperQuestionNumber ?? null,
      subject: q.subject,
      section: q.section,
      chapter: q.chapter,
      yourAnswer: answer,
      correctAnswer: q.correctAnswer,
      verdict,
      marks,
      // Released only now that the paper is over.
      solution: q.solution,
      solutionQuality: q.solutionQuality,
      // The worked solution as the booklet printed it. Released with the rest
      // of the answer, never before.
      solutionImage: q.solutionImage ?? null,
    });
  }

  return {
    score,
    totalMarks: opts.totalMarks ?? null,
    correct,
    wrong,
    unattempted,
    durationMinutes: opts.durationMinutes ?? null,
    timeTakenSeconds: opts.timeTakenSeconds ?? null,
    sectionBAttemptLimit: limit ?? null,
    bySubject: Object.values(bySubject),
    breakdown,
  };
}

/** Every column markPaper reads. Used by all three callers' select clauses. */
export const MARKING_SELECT = {
  id: true,
  paperQuestionNumber: true,
  questionNumber: true,
  subject: true,
  section: true,
  chapter: true,
  correctAnswer: true,
  questionType: true,
  status: true,
  marksCorrect: true,
  marksIncorrect: true,
  solution: true,
  solutionQuality: true,
  solutionImage: true,
};
