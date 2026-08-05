/**
 * Draw a fresh paper out of the previous year question bank.
 *
 * The third way to get a paper on this site, and the cheapest by a long way:
 *
 *   - sit an archived shift        — fixed, authentic, but you can only sit it once
 *   - have the AI write one        — unlimited, but slow and metered per generation
 *   - draw one from the bank       — instant, free, and every question was really examined
 *
 * The whole point is that it costs no model call. It is a handful of indexed
 * SELECTs over questions that already exist, so the "balanced" part has to be
 * done here in arithmetic rather than delegated to a prompt.
 *
 * WHAT "BALANCED" MEANS
 *
 * Not "an equal number from each subject" — the real papers are not equal. NEET
 * is half Biology. So the split comes from PYQ_EXAMS[...].paperShare, which
 * records what the actual exam does, and the section split within a subject
 * comes from the same pattern the archive was imported under. A candidate
 * sitting a drawn paper should meet the same shape of paper they will meet in
 * the hall.
 */

import prisma from "../prismaClient.js";
import { PYQ_EXAMS } from "./pyqPattern.js";
import { difficultyIndex, rankByDifficulty } from "./pyqDifficulty.js";
import { buildQuestionWhere, normalizeSpec } from "./pyqFilters.js";

/**
 * The shape of each exam's paper, in the exam's own terms.
 *
 * `sectionA`/`sectionB` are per subject and are what a full-length draw uses.
 * A shorter paper scales them down proportionally rather than dropping Section
 * B, which would quietly turn a JEE paper into an MCQ quiz.
 */
export const GENERATOR_PATTERNS = {
  JEE_MAIN: {
    subjects: ["Physics", "Chemistry", "Mathematics"],
    sectionA: 20,
    sectionB: 10,
    sectionBAttemptLimit: 5,
    durationMinutes: 180,
    marksCorrect: 4,
    marksIncorrect: -1,
  },
  JEE_ADVANCED: {
    subjects: ["Physics", "Chemistry", "Mathematics"],
    sectionA: 12,
    sectionB: 6,
    sectionBAttemptLimit: null,
    durationMinutes: 180,
    marksCorrect: 4,
    marksIncorrect: -1,
  },
  NEET: {
    subjects: ["Physics", "Chemistry", "Biology"],
    // NEET has no numerical section; everything is single-correct MCQ.
    sectionA: 45,
    sectionB: 0,
    sectionBAttemptLimit: null,
    durationMinutes: 200,
    marksCorrect: 4,
    marksIncorrect: -1,
  },
  GATE_MT: {
    subjects: ["General Aptitude", "Metallurgical Engineering"],
    sectionA: 30,
    sectionB: 0,
    sectionBAttemptLimit: null,
    durationMinutes: 180,
    marksCorrect: 1,
    marksIncorrect: -0.33,
  },
};

/** Fisher–Yates, so the draw is uniform rather than sort-comparator folklore. */
export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Split `total` across `keys` in the given proportions, losing nothing.
 *
 * Largest-remainder rather than rounding each share independently: rounding
 * three 33.3% shares of 50 gives 17+17+17 = 51 questions in a 50 question
 * paper, and the caller then has a paper that does not match its own header.
 */
function apportion(total, weights) {
  const keys = Object.keys(weights);
  const sum = keys.reduce((a, k) => a + weights[k], 0) || 1;

  const exact = keys.map((k) => ({ k, v: (total * weights[k]) / sum }));
  const out = {};
  let used = 0;
  for (const { k, v } of exact) {
    out[k] = Math.floor(v);
    used += out[k];
  }
  // Hand the leftovers to whoever was cut hardest.
  const order = [...exact].sort((a, b) => (b.v % 1) - (a.v % 1));
  for (let i = 0; used < total && order.length; i++, used++) {
    out[order[i % order.length].k] += 1;
  }
  return out;
}

/**
 * How many questions of each subject and section the paper should hold.
 *
 * An explicit `distribution` wins outright — a user who typed the numbers meant
 * them. Otherwise the subjects are apportioned by the real exam's share and
 * each subject's questions split A/B in the real paper's ratio.
 */
export function planPaper({ examCode, subjects, totalQuestions, distribution }) {
  const pattern = GENERATOR_PATTERNS[examCode];
  if (!pattern) return null;

  const chosen = subjects?.length
    ? pattern.subjects.filter((s) => subjects.includes(s))
    : pattern.subjects;
  if (!chosen.length) return null;

  if (distribution && typeof distribution === "object") {
    const plan = {};
    for (const subject of chosen) {
      const d = distribution[subject];
      if (!d) continue;
      const A = Math.max(0, Math.round(Number(d.A ?? d.sectionA ?? 0)));
      const B = Math.max(0, Math.round(Number(d.B ?? d.sectionB ?? 0)));
      if (A + B > 0) plan[subject] = { A, B };
    }
    if (Object.keys(plan).length) return { plan, pattern, chosen: Object.keys(plan) };
  }

  const share = PYQ_EXAMS[examCode]?.paperShare;
  const weights = Object.fromEntries(
    chosen.map((s) => [s, share?.[s] ?? pattern.sectionA + pattern.sectionB])
  );

  const fullLength = chosen.reduce((a) => a + pattern.sectionA + pattern.sectionB, 0);
  const target = Math.max(1, Math.round(Number(totalQuestions) || fullLength));
  const perSubject = apportion(target, weights);

  const plan = {};
  const bRatio = pattern.sectionB / (pattern.sectionA + pattern.sectionB || 1);
  for (const subject of chosen) {
    const n = perSubject[subject] ?? 0;
    const B = Math.round(n * bRatio);
    plan[subject] = { A: Math.max(0, n - B), B };
  }

  return { plan, pattern, chosen };
}

/**
 * Build the paper.
 *
 * `needsFigure` rows are excluded throughout: their text alone is not
 * answerable, and unlike a real shift there is no scan of "this paper" to fall
 * back on. So is any row with no key — an unmarkable question in a scored paper
 * is worse than a shorter paper.
 *
 * @returns {Promise<{paper: object, questions: object[], warnings: string[]}>}
 * @throws  {Error & {status:number}} when the bank cannot cover the request.
 */
export async function generatePaper(spec = {}) {
  const examCode = spec.examCode || "JEE_MAIN";
  const planned = planPaper({
    examCode,
    subjects: spec.subjects,
    totalQuestions: spec.totalQuestions,
    distribution: spec.distribution,
  });

  if (!planned) {
    const err = new Error(
      `No generator pattern for ${examCode} yet. Supported: ${Object.keys(GENERATOR_PATTERNS).join(", ")}.`
    );
    err.status = 404;
    err.canRequest = true;
    throw err;
  }

  const { plan, pattern, chosen } = planned;
  const filters = normalizeSpec({ ...spec, examCode, subjects: chosen });
  const difficulty = filters.difficulty;

  const index = await difficultyIndex(examCode);

  const questions = [];
  const warnings = [];
  /** Ids already placed, so no paper can ask the same question twice. */
  const used = new Set();
  /**
   * Must the paper be exactly the length asked for?
   *
   * Only for a full-length mock, which claims to reproduce the board's own
   * pattern — 75 questions, 25 per subject — and is not that if it is short. A
   * chapter drill or a filtered practice set has no such claim to keep: it is
   * as long as the archive can make it, which is the honest answer to "give me
   * questions on this chapter".
   */
  const exact = spec.exact === true || spec.mode === "full";
  /** Slots the archive could not fill, so the paper can say how short it is. */
  const shortfall = [];
  let ratedDrawn = 0;
  let paperNumber = 0;

  for (const subject of chosen) {
    for (const section of ["A", "B"]) {
      const want = plan[subject]?.[section] ?? 0;
      if (!want) continue;

      // THE POOL IS THE FILTER — but a short pool is a SHORT PAPER, not an
      // error.
      //
      // Two different rules got conflated here, and only one of them is right.
      //
      // The rule that matters: nothing from outside the selection may enter the
      // paper. This used to widen — when the chosen chapters held too few it
      // redrew from the WHOLE SUBJECT — so a candidate revising phase diagrams
      // sat a paper of general metallurgy. That is not a narrower version of
      // what they asked for, and its score means nothing against the topic they
      // were testing themselves on. That widening is gone and stays gone.
      //
      // The rule that was wrong: refusing to build anything when the pool is
      // smaller than the requested length. A chapter with 12 drawable questions
      // asked for 17 got an error page. Twelve questions on the right chapter is
      // a perfectly good paper — it is exactly what the candidate asked for,
      // just as long as the archive can make it. Serve what exists and say so.
      //
      // A full-length paper is the exception: it claims to reproduce the board's
      // own pattern, and a short one does not. `exact` holds it to that.
      const pool = await drawPool(filters, subject, section);
      const take = exact ? want : Math.min(want, pool.length);

      if (pool.length < want) {
        if (exact) {
          const err = new Error(
            `Not enough ${subject}${section ? ` Section ${section}` : ""} questions matching your ` +
              `filters to build this paper (${pool.length} available, ${want} needed). ` +
              `Widen the years or chapters, or ask for fewer questions.`
          );
          err.status = 409;
          err.available = pool.length;
          err.needed = want;
          throw err;
        }
        shortfall.push({ subject, section, wanted: want, available: pool.length });
      }

      // Shuffle first so the draw is random, then let difficulty reorder it —
      // the sort is stable, so the randomness survives inside each band.
      const ranked = rankByDifficulty(shuffle(pool), index, difficulty);
      let placed = 0;
      for (const q of ranked.pool) {
        if (placed >= take) break;
        // A question can satisfy two draws — Section A matches rows whose
        // section is null, which is every GATE and NEET row — and the same
        // question appearing twice in one paper is a bug the candidate sees.
        if (used.has(q.id)) continue;
        used.add(q.id);
        placed++;
        if (index.has(q.id)) ratedDrawn++;
        questions.push({
          ...q,
          paperQuestionNumber: ++paperNumber,
          questionNumber: questions.filter((x) => x.subject === subject).length + 1,
          // The archive's own marks where it has them — GATE mixes 1- and
          // 2-mark questions and does not negatively mark MSQ or NAT, so
          // stamping the pattern's figures over the top would score a
          // generated GATE paper by JEE's rules.
          marksCorrect: q.marksCorrect ?? pattern.marksCorrect,
          marksIncorrect: q.marksIncorrect ?? pattern.marksIncorrect,
          status: "ok",
          needsFigure: false,
          figureHint: null,
          measuredDifficulty: index.get(q.id) ?? null,
        });
      }
      // Fewer placed than the pool held means duplicates were skipped — a
      // question can satisfy both the Section A and the Section B draw when its
      // section is null. Only an exact paper treats that as a failure.
      if (placed < take && exact) {
        const err = new Error(
          `Not enough distinct ${subject} questions matching your filters ` +
            `(${placed} could be placed, ${want} needed).`
        );
        err.status = 409;
        throw err;
      }
    }
  }

  // Nothing at all is still an error: there is no paper to sit, and silently
  // returning an empty one would send the candidate into the player with a
  // palette of zero questions.
  if (!questions.length) {
    const err = new Error(
      "No questions match those filters yet. Try a different chapter, or widen the years."
    );
    err.status = 409;
    err.available = 0;
    throw err;
  }

  // Say it plainly rather than letting the candidate count the palette. A
  // 12-question paper when 17 were asked for is the right paper at the length
  // the archive can manage, and the one thing that would make it feel broken is
  // not being told.
  if (shortfall.length) {
    const asked = shortfall.reduce((a, s) => a + s.wanted, 0);
    const got = shortfall.reduce((a, s) => a + s.available, 0);
    warnings.push(
      `This paper has ${questions.length} question${questions.length === 1 ? "" : "s"} rather than ` +
        `the ${questions.length + asked - got} asked for — that is every question in the archive ` +
        `matching your filters. Nothing outside them was substituted in.`
    );
  }

  if (difficulty !== "mixed" && ratedDrawn < questions.length / 2) {
    // Said out loud rather than implied. Difficulty here is measured from real
    // candidates' answers, and most of these questions do not have enough of
    // them yet — promising a "hard paper" on that basis would be a claim the
    // data does not support.
    warnings.push(
      `Difficulty is measured from how candidates actually answered, and only ` +
        `${ratedDrawn} of ${questions.length} questions have enough attempts to be rated yet.`
    );
  }

  // Section B's "best N of M" rule only applies when the draw actually contains
  // a Section B; a subject-only Section A paper scores every question.
  const hasSectionB = questions.some((q) => q.section === "B");
  const sectionBAttemptLimit = hasSectionB ? pattern.sectionBAttemptLimit : null;

  // Everything that is NOT Section B counts in full, which is not the same as
  // "everything marked A": rows imported from a source that never printed a
  // section carry null, and testing for "A" dropped them from the total. A
  // 90-question paper then advertised itself as being out of 220 rather than
  // 300, and every percentage stored against it was inflated to match.
  const counted = sectionBAttemptLimit
    ? questions.filter((q) => q.section !== "B").length + chosen.length * sectionBAttemptLimit
    : questions.length;

  return {
    warnings,
    questions,
    paper: {
      id: "generated",
      examCode,
      examName: PYQ_EXAMS[examCode]?.label || examCode,
      stream: null,
      year: new Date().getFullYear(),
      dateLabel: "Generated mock test",
      shiftLabel: describe({ chosen, filters }),
      shiftTime: null,
      sessionLabel: null,
      durationMinutes: Math.max(
        5,
        Math.round(
          Number(spec.durationMinutes) ||
            (pattern.durationMinutes * questions.length) /
              (pattern.subjects.length * (pattern.sectionA + pattern.sectionB))
        )
      ),
      totalQuestions: questions.length,
      // Summed from the questions themselves rather than count × pattern marks.
      // GATE mixes 1- and 2-mark questions, so a 30-question GATE mock is not
      // 30 × anything, and a total that does not match the questions makes
      // every percentage in the candidate's history wrong.
      totalMarks: Math.round(
        questions
          .filter((q) => q.section !== "B" || !sectionBAttemptLimit)
          .reduce((a, q) => a + (q.marksCorrect ?? pattern.marksCorrect), 0) +
          (sectionBAttemptLimit ? chosen.length * sectionBAttemptLimit * pattern.marksCorrect : 0)
      ),
      marksCorrect: pattern.marksCorrect,
      marksIncorrect: pattern.marksIncorrect,
      sectionBAttemptLimit,
      subjectCounts: Object.fromEntries(
        chosen.map((s) => [s, questions.filter((q) => q.subject === s).length])
      ),
      needsFigureCount: 0,
      languages: ["en"],
      /// Only one subject was drawn, so the history row can name it.
      subject: chosen.length === 1 ? chosen[0] : null,
    },
  };
}

/**
 * One subject/section's eligible questions, under the candidate's filters.
 *
 * The where clause comes from lib/pyqFilters.js, which is the same code the
 * preview counts with. That is deliberate: two hand-written queries drift, and
 * when they drift the preview promises a number the generator cannot produce.
 * Everything this function adds is a NARROWING — subject and section — so it
 * cannot let anything in that the filters excluded.
 */
function drawPool(filters, subject, section) {
  const where = buildQuestionWhere(
    { ...filters, subjects: [subject] },
    // NEET and GATE rows carry no section at all, so a section filter on them
    // would match nothing. Only ask for a section where the archive has one.
    section === "A" ? { OR: [{ section: "A" }, { section: null }] } : { section: "B" }
  );

  return prisma.previousYearQuestion.findMany({
    where,
    select: {
      id: true, subject: true, section: true, chapter: true, topic: true, year: true,
      questionText: true, optionA: true, optionB: true, optionC: true, optionD: true,
      questionType: true, marksCorrect: true, marksIncorrect: true,
      diagramSvg: true, diagramImage: true, sourceUrl: true,
      questionImage: true, optionAImage: true, optionBImage: true,
      optionCImage: true, optionDImage: true,
    },
  });
}

/**
 * A one-line description of what was asked for, for the paper header.
 *
 * Every filter that shaped the draw appears, because this line is what the
 * candidate sees on their result and in their history — a score is only
 * meaningful next to what it was scored on.
 */
function describe({ chosen, filters }) {
  const parts = [];
  if (chosen.length === 1) parts.push(chosen[0]);

  const named = [...filters.chapters, ...filters.topics];
  if (named.length) parts.push(named.length === 1 ? named[0] : `${named.length} topics`);

  if (filters.difficulty && filters.difficulty !== "mixed") parts.push(`${filters.difficulty} questions`);
  if (filters.sessions.length) parts.push(filters.sessions.join(", "));
  if (filters.shifts.length) parts.push(filters.shifts.map((s) => `Shift ${s}`).join(", "));
  if (filters.questionTypes.length) parts.push(filters.questionTypes.join(", "));

  if (filters.years.length) parts.push(filters.years.join(", "));
  else if (filters.yearFrom !== null || filters.yearTo !== null) {
    parts.push(`${filters.yearFrom ?? "earliest"}–${filters.yearTo ?? "latest"}`);
  }

  return parts.length ? parts.join(" · ") : "Drawn from previous year questions";
}
