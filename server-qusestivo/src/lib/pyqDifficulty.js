/**
 * How hard a previous year question actually is, measured rather than declared.
 *
 * WHY THIS IS NOT A COLUMN
 *
 * The generator takes a difficulty, so the obvious move is a `difficulty`
 * column on PreviousYearQuestion. But nobody would ever fill it in: the source
 * papers do not state a difficulty, and 4,000 questions is far past what anyone
 * will hand-label. A column that is null for every row is a filter that either
 * matches everything or nothing, and the second is worse — a candidate asking
 * for "hard" would get "not enough questions to build a paper".
 *
 * What we do have is candidates. Every submitted sitting stores its responses,
 * so the share of people who got a question right is a real, improving measure
 * of its difficulty — the same statistic a coaching institute publishes.
 *
 * THE HONESTY RULE
 *
 * A question answered three times has no accuracy worth the name. So a question
 * is rated only once at least MIN_RESPONSES candidates have answered it, and an
 * unrated question stays eligible for EVERY difficulty. That way the filter
 * biases the draw toward genuinely-hard questions where evidence exists and
 * never starves the pool where it does not. The generator reports how many of
 * the questions it drew were actually rated, so the UI can say so rather than
 * implying a precision that is not there.
 */

import prisma from "../prismaClient.js";
import { isCorrectAnswer } from "./pyqMarking.js";

/** Below this many recorded answers a question is "unrated", not "medium". */
const MIN_RESPONSES = 8;

/** Accuracy above this is easy; below the second is hard. */
const EASY_AT = 0.66;
const HARD_BELOW = 0.34;

/** Recomputed at most this often. The input only changes when someone submits. */
const TTL_MS = 5 * 60 * 1000;

/** examCode -> { at, index: Map<questionId, "easy"|"medium"|"hard"> } */
const cache = new Map();

export const DIFFICULTY_BANDS = ["easy", "medium", "hard"];

/**
 * Measured difficulty for every question of an exam that has enough answers.
 *
 * @returns {Promise<Map<string, "easy"|"medium"|"hard">>} rated questions only.
 *          A question absent from the map is unrated, NOT medium.
 */
export async function difficultyIndex(examCode) {
  const hit = cache.get(examCode);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.index;

  const index = new Map();
  try {
    // Cap the scan: the point is a stable estimate, not a census, and the tail
    // of very old sittings cannot move a ratio that already has thousands of
    // samples behind it.
    const attempts = await prisma.pyqAttempt.findMany({
      where: { examCode },
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: { responses: true },
    });

    // questionId -> the answers given to it.
    const answers = new Map();
    for (const a of attempts) {
      const responses = a.responses && typeof a.responses === "object" ? a.responses : {};
      for (const [questionId, answer] of Object.entries(responses)) {
        if (answer === null || answer === undefined || String(answer).trim() === "") continue;
        let list = answers.get(questionId);
        if (!list) answers.set(questionId, (list = []));
        list.push(answer);
      }
    }

    const rateable = [...answers.entries()].filter(([, list]) => list.length >= MIN_RESPONSES);
    if (!rateable.length) {
      cache.set(examCode, { at: Date.now(), index });
      return index;
    }

    // Only the keys of questions that cleared the threshold — typically a small
    // fraction of the archive, so this stays a narrow lookup rather than a
    // table scan.
    const keys = await prisma.previousYearQuestion.findMany({
      where: { id: { in: rateable.map(([id]) => id) } },
      select: { id: true, correctAnswer: true, questionType: true, status: true },
    });
    const keyById = new Map(keys.map((k) => [k.id, k]));

    for (const [questionId, list] of rateable) {
      const key = keyById.get(questionId);
      // A voided question tells you nothing about difficulty — everyone scored
      // it — and a question with no key cannot be marked at all.
      if (!key || key.status === "bonus" || key.correctAnswer == null) continue;

      const right = list.filter((answer) => isCorrectAnswer(key, answer)).length;
      const accuracy = right / list.length;
      index.set(
        questionId,
        accuracy >= EASY_AT ? "easy" : accuracy >= HARD_BELOW ? "medium" : "hard"
      );
    }
  } catch (err) {
    // A difficulty estimate is a refinement, never a precondition. If the scan
    // fails the generator should still build a paper, just an unrated one.
    console.warn(`[pyq] difficulty index unavailable for ${examCode}: ${err.message}`);
  }

  cache.set(examCode, { at: Date.now(), index });
  return index;
}

/**
 * Order a pool so the requested difficulty comes first.
 *
 * A filter would be wrong here: it throws away every unrated question, which is
 * most of the archive, and turns "hard Physics paper" into "not enough
 * questions". Ranking keeps the whole pool available and simply prefers the
 * evidence — matching questions first, unrated next, contradicting last.
 *
 * Pass an ALREADY SHUFFLED pool. The sort is stable, so the shuffle survives
 * inside each band and two generations of the same request are still different
 * papers; sorting a pool in database order would return the same one twice.
 *
 * @returns {{ pool: object[], rated: number }} `rated` counts how many of the
 *          questions carry a measured band at all.
 */
export function rankByDifficulty(pool, index, wanted) {
  if (!wanted || wanted === "mixed") {
    return { pool, rated: pool.filter((q) => index.has(q.id)).length };
  }

  const rank = (q) => {
    const band = index.get(q.id);
    if (!band) return 1; // unrated: usable, but not evidence for the request
    return band === wanted ? 0 : 2;
  };

  return {
    pool: [...pool].sort((a, b) => rank(a) - rank(b)),
    rated: pool.filter((q) => index.has(q.id)).length,
  };
}
