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
     * The 2022–23 pattern, because that is what the archive holds — every
     * stored JEE Main paper is from those two years, and 2022–23 printed 10
     * numerical questions per subject of which any 5 were scored. Encoding the
     * current 2025 pattern instead (5 compulsory numerical) would produce a
     * paper that could not be filled from these questions and would mis-state
     * the marks of the ones it did draw.
     */
    patternNote:
      "2022–23 pattern: 20 multiple-choice + 10 numerical per subject, best 5 of the 10 numerical scored.",
    durationMinutes: 180,
    sectionBAttemptLimit: 5,
    marksCorrect: 4,
    marksIncorrect: -1,
    subjects: [
      { subject: "Physics", slots: [
        { count: 20, questionTypes: ["mcq_single"], label: "Section A · multiple choice" },
        { count: 10, questionTypes: ["numerical", "integer"], label: "Section B · numerical" },
      ]},
      { subject: "Chemistry", slots: [
        { count: 20, questionTypes: ["mcq_single"], label: "Section A · multiple choice" },
        { count: 10, questionTypes: ["numerical", "integer"], label: "Section B · numerical" },
      ]},
      { subject: "Mathematics", slots: [
        { count: 20, questionTypes: ["mcq_single"], label: "Section A · multiple choice" },
        { count: 10, questionTypes: ["numerical", "integer"], label: "Section B · numerical" },
      ]},
    ],
  },

  NEET: {
    label: "NEET UG",
    /**
     * BOTANY AND ZOOLOGY ARE NOT SEPARATE HERE, AND CANNOT BE.
     *
     * The real paper is Physics 45, Chemistry 45, Botany 45, Zoology 45. The
     * archive stores Biology as ONE subject — 727 questions, no Botany/Zoology
     * column — and every one of those rows has a null chapter, so there is
     * nothing in the data to derive the split from either. Splitting them would
     * mean labelling 727 questions by hand or guessing with a model, and a
     * guessed split produces a paper whose "Zoology section" is quietly part
     * botany: worse than not claiming the split at all.
     *
     * So the paper is drawn as Biology 90, which keeps the thing that actually
     * affects the candidate exactly right — 180 questions, 720 marks, 200
     * minutes, the real subject weighting. The moment the rows carry a
     * botany/zoology marker, this becomes two 45-question entries and nothing
     * else changes.
     */
    patternNote:
      "180 questions · 720 marks. Biology is drawn as one 90-question block: the archive does not label Botany and Zoology separately.",
    durationMinutes: 200,
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
    marksIncorrect: -0.33,
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
      "Representative full-length practice paper. JEE Advanced changes its section structure most years, so this follows the archive's own mix rather than claiming one official pattern.",
    durationMinutes: 180,
    sectionBAttemptLimit: null,
    marksCorrect: 4,
    marksIncorrect: -1,
    approximate: true,
    subjects: [
      { subject: "Physics", slots: [{ count: 18 }] },
      { subject: "Chemistry", slots: [{ count: 18 }] },
      { subject: "Mathematics", slots: [{ count: 18 }] },
    ],
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
    totalMarks: totalMarksFor(blueprint, rows),
    rows,
    canGenerate: rows.every((r) => r.short === 0),
    shortBy: rows.reduce((n, r) => n + r.short, 0),
  };
}

/**
 * What the paper is out of.
 *
 * GATE's slots carry their own marks; the others take the blueprint's. The
 * Section B "best N of M" rule reduces the total — a JEE Main paper of 90
 * questions is out of 300, not 360, because only 5 of each subject's 10
 * numerical questions are scored.
 */
function totalMarksFor(blueprint, rows) {
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
        questions.push({
          ...q,
          paperQuestionNumber: ++paperNumber,
          questionNumber: ++withinSubject,
          // The question's own marks win where it has them (GATE), else the
          // blueprint's.
          marksCorrect: slot.marks ?? q.marksCorrect ?? blueprint.marksCorrect,
          marksIncorrect: q.marksIncorrect ?? blueprint.marksIncorrect,
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
      totalMarks: audit.totalMarks,
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
