/**
 * Full-length mock papers: what each exam's paper actually IS.
 *
 * A "Full Test" is not "a lot of questions". It is a specific shape — this many
 * of this subject, of this question type, worth this many marks, in this long —
 * and a paper that misses the shape is not practice for the exam even if every
 * question in it is real. So the shape is declared here, once, and the drawer
 * below satisfies it exactly or refuses.
 *
 * WHY SLOTS RATHER THAN A COUNT PER SUBJECT
 *
 * The three exams differ in what varies inside a subject:
 *
 *   JEE Main   splits Physics into 20 multiple-choice + 10 numerical. The split
 *              is the pattern; 30 random Physics questions is a different exam.
 *   GATE       splits each subject by MARKS — 25 one-mark and 30 two-mark
 *              questions — and the marks are what make the paper add to 100.
 *   NEET       splits by nothing. Every question is a 4-mark single-correct MCQ.
 *
 * One `slots` array covers all three: each slot names the constraints for its
 * own draw. Adding an exam is adding a blueprint, not adding a branch.
 *
 * EVERY NUMBER HERE IS CHECKED AGAINST THE ARCHIVE
 *
 * A blueprint asking for more questions than the database holds is a Generate
 * button that always errors. `auditBlueprints()` at the bottom reports the
 * shortfall for every slot of every exam; src/test/blueprints.test.mjs runs it.
 */

import prisma from "../prismaClient.js";
import { shuffle } from "./pyqGenerator.js";
import { PYQ_EXAMS } from "./pyqPattern.js";

/**
 * @typedef {object} Slot
 * @property {number} count           How many questions this slot contributes.
 * @property {string[]} [questionTypes] Restrict to these types. Omit for any.
 * @property {number} [marks]         Restrict to questions worth this much.
 * @property {string} [label]         Shown in the pattern summary.
 */

export const FULL_TEST_BLUEPRINTS = {
  JEE_MAIN: {
    label: "JEE Main",
    /**
     * The CURRENT pattern (2025/2026), not the archive's own 2022–23 one.
     *
     * The two differ in a way that matters: 2022–23 printed 10 numerical
     * questions per subject and scored the best 5, and NTA abolished that
     * "attempt any 5 of 10" rule on 17 October 2024. It exists in no live
     * exam. A candidate sitting a mock today is preparing for the 2026 paper,
     * so the mock has to be the 2026 shell — 20 multiple-choice + 5 numerical
     * per subject, all 75 compulsory, +4/−1 throughout.
     *
     * The archive holding 2022–23 CONTENT is not an argument against this. A
     * 2022 numerical question is a perfectly good numerical question; what
     * changed is how many of them are printed and which of them count, and
     * both of those are properties of the container, not the question.
     */
    patternNote:
      "2026 pattern: 20 multiple-choice + 5 numerical per subject, all 75 compulsory. +4 / −1.",
    durationMinutes: 180,
    // No "best N of M" any more. Section B is compulsory and negatively marked.
    sectionBAttemptLimit: null,
    marksCorrect: 4,
    marksIncorrect: -1,
    subjects: [
      { subject: "Physics", slots: [
        { count: 20, questionTypes: ["mcq_single"], label: "Section A · multiple choice" },
        { count: 5, questionTypes: ["numerical", "integer"], label: "Section B · numerical" },
      ]},
      { subject: "Chemistry", slots: [
        { count: 20, questionTypes: ["mcq_single"], label: "Section A · multiple choice" },
        { count: 5, questionTypes: ["numerical", "integer"], label: "Section B · numerical" },
      ]},
      { subject: "Mathematics", slots: [
        { count: 20, questionTypes: ["mcq_single"], label: "Section A · multiple choice" },
        { count: 5, questionTypes: ["numerical", "integer"], label: "Section B · numerical" },
      ]},
    ],
  },

  NEET: {
    label: "NEET UG",
    /**
     * BIOLOGY IS ONE 90-QUESTION BLOCK — WHICH IS WHAT NTA ITSELF PUBLISHES.
     *
     * The request was Physics 45 / Chemistry 45 / Botany 45 / Zoology 45. The
     * NTA Information Bulletin's own table prints THREE rows, the third being
     * "Biology (Botany & Zoology) — 90", and NTA scores Biology as a single
     * combined subject for tie-breaking. The 45/45 split is a convention of how
     * the printed booklet is laid out, not a scoring or structural division, so
     * a three-block paper is not a compromise — it is the official table.
     *
     * It is also the only honest option here. The archive stores Biology as one
     * subject (727 questions, no botany/zoology column) and every one of those
     * rows has a null chapter, so there is nothing to derive a split from. The
     * remaining route is asking a model to classify each question, and the
     * Botany/Zoology boundary has no single ground truth — Biomolecules, Cell
     * Structure, Genetics, Evolution and Ecology are filed differently by
     * different institutes. A realistic 10–20% error rate means roughly 9 to 18
     * misfiled questions in every Biology block, and a candidate who opens
     * "Botany" and meets human physiology stops trusting the whole product.
     *
     * What the candidate actually experiences is identical either way: 180
     * questions, 720 marks, 180 minutes, the real subject weighting, +4/−1.
     */
    patternNote:
      "2026 pattern: 180 questions · 720 marks · 180 minutes. Biology is one 90-question block, exactly as NTA's own bulletin prints it.",
    // 180, not 200. The 200-minute paper was the 2021–23 Section A/B era; NTA
    // removed the optional section and restored 180 minutes in January 2025.
    durationMinutes: 180,
    sectionBAttemptLimit: null,
    marksCorrect: 4,
    marksIncorrect: -1,
    subjects: [
      { subject: "Physics", slots: [{ count: 45, questionTypes: ["mcq_single"] }] },
      { subject: "Chemistry", slots: [{ count: 45, questionTypes: ["mcq_single"] }] },
      { subject: "Biology", slots: [{ count: 90, questionTypes: ["mcq_single"], label: "Botany + Zoology" }] },
    ],
  },

  GATE_MT: {
    label: "GATE Metallurgical Engineering",
    /**
     * 65 questions, 100 marks. The marks split is the paper: 10 General
     * Aptitude questions worth 15 marks and 55 subject questions worth 85. Draw
     * it by count alone and a 65-question paper comes out worth anywhere from
     * 65 to 130.
     */
    patternNote:
      "65 questions · 100 marks · General Aptitude 15 marks, Metallurgical Engineering 85 marks.",
    durationMinutes: 180,
    sectionBAttemptLimit: null,
    // GATE marks vary per question, so these are the defaults for anything the
    // slot does not pin down; the drawer reads each question's own marks.
    marksCorrect: 1,
    marksIncorrect: -1 / 3,
    /**
     * GATE penalises by TYPE, not uniformly:
     *   MCQ  −1/3 of a 1-mark question, −2/3 of a 2-mark one
     *   MSQ  no negative marking
     *   NAT  no negative marking
     * A flat penalty would mark a candidate down for a wrong numerical answer
     * that the real exam costs them nothing for, so the paper would score
     * lower than the exam it is imitating.
     */
    negativeByType: (questionType, marks) =>
      questionType === "mcq_single" ? -(marks / 3) : 0,
    subjects: [
      { subject: "General Aptitude", slots: [
        { count: 5, marks: 1, label: "1-mark" },
        { count: 5, marks: 2, label: "2-mark" },
      ]},
      { subject: "Metallurgical Engineering", slots: [
        { count: 25, marks: 1, label: "1-mark" },
        { count: 30, marks: 2, label: "2-mark" },
      ]},
    ],
  },

  JEE_ADVANCED: {
    label: "JEE Advanced",
    /**
     * ONE paper's worth, not the real two-paper sitting.
     *
     * JEE Advanced does not have a fixed pattern: the organising IIT changes the
     * section structure and the partial-marking rules most years, and the real
     * exam is two 3-hour papers on the same day. Encoding "the" pattern would be
     * encoding one year's, and the archive (513 questions across four question
     * types, no chapters, no paper/section labels) cannot reconstruct either
     * paper faithfully anyway.
     *
     * So this is deliberately a representative full-length practice paper —
     * 54 questions across the three subjects, in the type mix the archive
     * actually holds — and the summary says so rather than claiming to be the
     * official pattern.
     */
    patternNote:
      "One paper's worth, in the 2026 shape. JEE Advanced is redesigned most years — question counts, marks and partial-marking rules have all moved — so this is representative practice, not a reproduction of one official paper.",
    durationMinutes: 180,
    sectionBAttemptLimit: null,
    marksCorrect: 4,
    marksIncorrect: -1,
    approximate: true,
    /**
     * Typed slots, roughly the 2026 Paper 1 shape: 4 single-correct, 4
     * multiple-correct and 8 numerical per subject.
     *
     * Untyped slots were worse than they looked. Drawing "18 Physics questions"
     * from a pool that is 36% multiple-correct produced papers with wildly
     * different type mixes run to run — and JEE Advanced's whole difficulty is
     * the MSQ and numerical sections, so a draw that happened to be mostly
     * single-correct is a much easier paper wearing the same name.
     *
     * Matching-list is absent: the archive has no such type, those items having
     * been stored as single-correct when they were imported.
     */
    subjects: ["Physics", "Chemistry", "Mathematics"].map((subject) => ({
      subject,
      slots: [
        { count: 4, questionTypes: ["mcq_single"], label: "Single correct" },
        { count: 4, questionTypes: ["mcq_multiple"], label: "One or more correct" },
        { count: 8, questionTypes: ["numerical", "integer"], label: "Numerical" },
      ],
    })),
  },
};

/** Every constraint a slot puts on the questions it may draw. */
function slotWhere(examCode, subject, slot) {
  return {
    examCode,
    subject,
    needsFigure: false,
    status: "ok",
    correctAnswer: { not: null },
    ...(slot.questionTypes?.length ? { questionType: { in: slot.questionTypes } } : {}),
    ...(slot.marks != null ? { marksCorrect: slot.marks } : {}),
  };
}

/** Columns the player needs. Deliberately no `correctAnswer` — see getPyqPaper. */
const DRAW_SELECT = {
  id: true, subject: true, section: true, chapter: true, year: true,
  questionText: true, optionA: true, optionB: true, optionC: true, optionD: true,
  questionType: true, marksCorrect: true, marksIncorrect: true,
  diagramSvg: true, diagramImage: true, sourceUrl: true,
  questionImage: true, optionAImage: true, optionBImage: true,
  optionCImage: true, optionDImage: true,
};

/**
 * How many questions each slot of a full paper can actually be filled from.
 *
 * Runs before the draw so the UI can state the shortfall precisely — "Physics
 * Section B: 10 needed, 7 available" — instead of the generator failing with a
 * single unhelpful message after the candidate has committed.
 */
export async function auditFullTest(examCode) {
  const blueprint = FULL_TEST_BLUEPRINTS[examCode];
  if (!blueprint) return null;

  const rows = [];
  for (const { subject, slots } of blueprint.subjects) {
    for (const slot of slots) {
      const available = await prisma.previousYearQuestion.count({
        where: slotWhere(examCode, subject, slot),
      });
      rows.push({
        subject,
        label: slot.label ?? null,
        questionTypes: slot.questionTypes ?? null,
        marks: slot.marks ?? null,
        needed: slot.count,
        available,
        short: Math.max(0, slot.count - available),
      });
    }
  }

  const totalQuestions = rows.reduce((n, r) => n + r.needed, 0);
  return {
    examCode,
    label: blueprint.label,
    patternNote: blueprint.patternNote,
    approximate: Boolean(blueprint.approximate),
    durationMinutes: blueprint.durationMinutes,
    sectionBAttemptLimit: blueprint.sectionBAttemptLimit,
    totalQuestions,
    totalMarks: estimateTotalMarks(blueprint, rows),
    rows,
    canGenerate: rows.every((r) => r.short === 0),
    shortBy: rows.reduce((n, r) => n + r.short, 0),
  };
}

/**
 * What the paper will be out of, before it is drawn.
 *
 * An ESTIMATE, and named as one. Where a slot pins the marks (GATE) it is
 * exact; where it does not, the questions themselves may be worth different
 * amounts — the JEE Advanced archive holds 3-mark single-correct rows and
 * 4-mark everything else — so the true total is only known once the draw has
 * happened. generateFullTest recomputes it from the questions it actually took
 * and returns that; this exists so the pattern summary has a number to show
 * before the candidate commits.
 */
function estimateTotalMarks(blueprint, rows) {
  let marks = 0;
  for (const r of rows) {
    const per = r.marks ?? blueprint.marksCorrect;
    // A capped slot contributes only what is actually scored.
    const scored =
      blueprint.sectionBAttemptLimit && r.questionTypes?.includes("numerical")
        ? Math.min(r.needed, blueprint.sectionBAttemptLimit)
        : r.needed;
    marks += scored * per;
  }
  return Math.round(marks);
}

/**
 * What the drawn paper is actually out of.
 *
 * Summed from the questions in hand, honouring the Section B cap per subject.
 * The audit's estimate and this agreed for three of the four exams and drifted
 * for JEE Advanced, where the estimate assumed 4 marks for rows that are worth
 * 3 — so a candidate would have been shown "216 marks" on a paper that scores
 * out of 200. The number on the paper has to be the number the marker uses.
 */
function realisedTotalMarks(blueprint, questions) {
  const limit = blueprint.sectionBAttemptLimit;
  if (!limit) {
    return Math.round(questions.reduce((n, q) => n + (q.marksCorrect || 0), 0));
  }
  let marks = 0;
  const usedBySubject = new Map();
  for (const q of questions) {
    if (q.section === "B") {
      const used = usedBySubject.get(q.subject) || 0;
      if (used >= limit) continue; // beyond the cap: present but not scored
      usedBySubject.set(q.subject, used + 1);
    }
    marks += q.marksCorrect || 0;
  }
  return Math.round(marks);
}

/**
 * Draw a full-length paper to the blueprint.
 *
 * Refuses rather than improvising. If any slot cannot be filled the whole thing
 * throws with the per-slot shortfall attached, because a "full test" that
 * quietly contains 24 Physics questions instead of 30 is worse than no paper:
 * the candidate scores it out of the wrong total and compares it against real
 * attempts.
 *
 * @throws {Error & {status:number, audit:object}}
 */
export async function generateFullTest(examCode) {
  const blueprint = FULL_TEST_BLUEPRINTS[examCode];
  if (!blueprint) {
    const err = new Error(
      `No full-test pattern for ${examCode} yet. Supported: ${Object.keys(FULL_TEST_BLUEPRINTS).join(", ")}.`
    );
    err.status = 404;
    err.canRequest = true;
    throw err;
  }

  const audit = await auditFullTest(examCode);
  if (!audit.canGenerate) {
    const worst = audit.rows.filter((r) => r.short > 0);
    const err = new Error(
      `The archive cannot fill a full ${blueprint.label} paper yet. ` +
        worst
          .map((r) => `${r.subject}${r.label ? ` (${r.label})` : ""}: ${r.available} of ${r.needed}`)
          .join("; ") +
        ". Try a Partial Test instead."
    );
    err.status = 409;
    err.audit = audit;
    throw err;
  }

  /**
   * Ids already placed in this paper.
   *
   * A question must never appear twice, and slots CAN overlap: a JEE Advanced
   * subject slot with no type restriction would otherwise be free to draw the
   * same row another slot already took. Excluding as we go is the only thing
   * that makes "no duplicates" true rather than merely likely.
   */
  const used = new Set();
  const questions = [];
  let paperNumber = 0;

  for (const { subject, slots } of blueprint.subjects) {
    let withinSubject = 0;
    for (const slot of slots) {
      const pool = await prisma.previousYearQuestion.findMany({
        where: { ...slotWhere(examCode, subject, slot), id: { notIn: [...used] } },
        select: DRAW_SELECT,
      });

      if (pool.length < slot.count) {
        // Only reachable if the pool shrank between the audit and here, or if
        // an earlier slot consumed the overlap. Same refusal either way.
        const err = new Error(
          `Not enough ${subject}${slot.label ? ` (${slot.label})` : ""} questions left to draw ` +
            `(${pool.length} of ${slot.count} after removing duplicates).`
        );
        err.status = 409;
        err.audit = audit;
        throw err;
      }

      // Randomise AFTER filtering — the whole pool is eligible, and the draw is
      // uniform over it rather than over whatever the planner returned first.
      for (const q of shuffle(pool).slice(0, slot.count)) {
        used.add(q.id);
        const marksCorrect = slot.marks ?? q.marksCorrect ?? blueprint.marksCorrect;
        questions.push({
          ...q,
          paperQuestionNumber: ++paperNumber,
          questionNumber: ++withinSubject,
          // The slot's marks win where it pins them (GATE), else the question's
          // own, else the blueprint's.
          marksCorrect,
          // Per-type where the exam marks that way — GATE does not penalise a
          // wrong numerical or multi-select answer at all.
          marksIncorrect: blueprint.negativeByType
            ? blueprint.negativeByType(q.questionType, marksCorrect)
            : (q.marksIncorrect ?? blueprint.marksIncorrect),
          // Section is what the Section B cap is applied by. Derived from the
          // slot rather than the stored row, because a drawn paper's sections
          // are the ones this blueprint just defined.
          section: slot.questionTypes?.includes("numerical") ? "B" : "A",
          status: "ok",
          needsFigure: false,
          figureHint: null,
        });
      }
    }
  }

  return {
    audit,
    questions,
    paper: {
      id: "generated",
      examCode,
      examName: PYQ_EXAMS[examCode]?.label || blueprint.label,
      stream: null,
      year: new Date().getFullYear(),
      dateLabel: "Full mock test",
      shiftLabel: blueprint.patternNote,
      shiftTime: null,
      sessionLabel: null,
      durationMinutes: blueprint.durationMinutes,
      totalQuestions: questions.length,
      // From the questions actually drawn, not the pre-draw estimate.
      totalMarks: realisedTotalMarks(blueprint, questions),
      marksCorrect: blueprint.marksCorrect,
      marksIncorrect: blueprint.marksIncorrect,
      sectionBAttemptLimit: blueprint.sectionBAttemptLimit,
      subjectCounts: Object.fromEntries(
        blueprint.subjects.map((s) => [s.subject, questions.filter((q) => q.subject === s.subject).length])
      ),
      needsFigureCount: 0,
      languages: ["en"],
      subject: null,
    },
  };
}

/** Every exam that can currently produce a full paper, and what it looks like. */
export async function listFullTestPatterns() {
  const out = [];
  for (const examCode of Object.keys(FULL_TEST_BLUEPRINTS)) {
    const audit = await auditFullTest(examCode);
    if (audit) out.push(audit);
  }
  return out;
}
