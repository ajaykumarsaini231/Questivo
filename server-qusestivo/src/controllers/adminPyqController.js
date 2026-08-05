/**
 * The PYQ question bank, editable.
 *
 * Everything else that reads PreviousYearQuestion reads it for a candidate:
 * the browse list, the paper player, the generator. All of them filter the
 * archive down to what can honestly be put in front of someone — DRAWABLE in
 * lib/pyqFilters.js — so the rows that are WRONG are precisely the rows none of
 * those screens can show. A question whose text did not survive extraction, or
 * whose answer key the source never printed, is invisible to every existing
 * surface and therefore unfixable.
 *
 * This is the surface where they are visible. It deliberately applies no
 * DRAWABLE, no needsFigure exclusion and no status filter unless asked: the
 * defect IS the query.
 */

import { Prisma } from "@prisma/client";
import prisma from "../prismaClient.js";
import { resolvePyqExamCode, PYQ_EXAMS } from "../lib/pyqPattern.js";
import { buildBrowseWhere } from "../lib/pyqFilters.js";
import { numericallyEqual } from "../lib/pyqMarking.js";

/* ------------------------------ vocabulary ------------------------------ */

/** What `status` is allowed to be. Anything else changes how a row is marked. */
const STATUSES = ["ok", "needs_figure", "bonus", "needs_review"];

/**
 * How a question is drawn for a candidate.
 *
 * null — the standing rule: a part that has a crop is drawn as its crop.
 * "image" — pin it to the crop even if the text looks complete.
 * "text" — draw the transcription even though a crop exists, which is the fix
 *          for a figure cut off the wrong part of the page.
 */
const RENDER_MODES = [null, "image", "text"];

/** The four types markPaper knows how to score. */
const QUESTION_TYPES = ["mcq_single", "mcq_multiple", "numerical", "integer"];

/** The image columns, and therefore the only keys `imageCrops` may carry. */
const IMAGE_COLUMNS = [
  "questionImage",
  "optionAImage", "optionBImage", "optionCImage", "optionDImage",
  "solutionImage",
];

/** The sides of a crop window, in the order CSS writes them. */
const CROP_SIDES = ["top", "right", "bottom", "left"];

/**
 * The two defects worth a queue, as Prisma clauses.
 *
 * `needsFigure` is a question whose text could not be recovered from the
 * source; `correctAnswer: null` is one with no key, which markPaper scores as
 * "not counted" for everybody. Both are real questions that were really
 * examined — they are held rather than discarded because the fix is an edit,
 * and this is where the edit happens.
 */
const DEFECTS = {
  needsFigure: { needsFigure: true },
  missingAnswer: { correctAnswer: null },
};

/** Columns the table renders. `solution` is excluded — it is the biggest column
 *  on the row and a list never shows it. */
const LIST_SELECT = {
  id: true,
  examCode: true,
  year: true,
  session: true,
  sessionLabel: true,
  dateLabel: true,
  shiftLabel: true,
  subject: true,
  topic: true,
  chapter: true,
  section: true,
  questionNumber: true,
  paperQuestionNumber: true,
  paperId: true,
  questionText: true,
  questionType: true,
  correctAnswer: true,
  status: true,
  needsFigure: true,
  questionImage: true,
  renderAs: true,
  // The table renders each question the way the player will, so the options
  // have to travel with it — reading a stem alone cannot tell you whether the
  // question is intact.
  optionA: true, optionB: true, optionC: true, optionD: true,
  optionAImage: true, optionBImage: true, optionCImage: true, optionDImage: true,
  // Without this the table draws the whole file while the player draws the
  // window, and the one screen whose job is "what will the candidate see" is
  // the one screen showing something else.
  imageCrops: true,
  createdAt: true,
};

/* -------------------------------- reading ------------------------------- */

/**
 * Read the filter selection off the query string.
 *
 * The exam/year/session/subject/chapter half is handed to buildBrowseWhere, so
 * it means exactly what it means on the public list. The rest is admin-only —
 * nothing on a candidate's screen can ask for "the broken ones".
 */
function adminWhere(query) {
  const examCode = query.examCode ? resolvePyqExamCode(query.examCode) : null;
  const where = buildBrowseWhere({ ...query, examCode: examCode || undefined });
  const and = where.AND ?? (where.AND = []);

  // An exam code we do not recognise must match NOTHING rather than every exam.
  // Falling through to an unfiltered list would show a JEE Main row to someone
  // who asked for GATE and let them edit it believing it was a GATE question.
  if (query.examCode && !examCode) and.push({ examCode: String(query.examCode) });

  if (query.status && STATUSES.includes(query.status)) and.push({ status: query.status });

  // The priority view. `priority` is the union — it is the whole work queue, and
  // the single number worth putting on a dashboard.
  if (query.view === "priority") {
    and.push({ OR: [DEFECTS.needsFigure, DEFECTS.missingAnswer] });
  } else if (query.view === "needsFigure") {
    and.push(DEFECTS.needsFigure);
  } else if (query.view === "missingAnswer") {
    and.push(DEFECTS.missingAnswer);
  }

  // Whether a crop exists, which splits the needsFigure queue in half and is the
  // difference between a row that is readable and one that is not. Most flagged
  // rows already have their figure linked by scripts/linkPyqFigures.mjs; the
  // ones with no image at all are the genuinely unreadable remainder, and they
  // are the ones worth an editor's time.
  if (query.hasImage === "yes") and.push({ questionImage: { not: null } });
  else if (query.hasImage === "no") and.push({ questionImage: null });

  const q = String(query.q ?? "").trim();
  if (q) {
    and.push({
      OR: [
        { questionText: { contains: q, mode: "insensitive" } },
        { figureHint: { contains: q, mode: "insensitive" } },
        // So an operator can paste an id straight out of a bug report.
        { id: q },
      ],
    });
  }

  if (!and.length) delete where.AND;
  return where;
}

/** GET /api/admin/pyq — the question table. */
export const listAdminPyqs = async (req, res) => {
  try {
    const where = adminWhere(req.query);

    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const page = Math.max(Number(req.query.page) || 1, 1);

    /**
     * The defect counts are deliberately NOT counted against `where`.
     *
     * They are counted against the same selection with the view dropped, so the
     * chips read "738 need a figure" while you are standing inside the missing
     * answer queue. Counted against `where` instead, every chip would report
     * either the number you are already looking at or zero, which is the one
     * thing a queue counter must never do.
     */
    const scope = adminWhere({ ...req.query, view: undefined });

    const [items, total, all, needsFigure, missingAnswer, priority] = await Promise.all([
      prisma.previousYearQuestion.findMany({
        where,
        orderBy: [
          { year: "desc" },
          { subject: "asc" },
          { paperQuestionNumber: "asc" },
          { createdAt: "asc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
        select: LIST_SELECT,
      }),
      prisma.previousYearQuestion.count({ where }),
      prisma.previousYearQuestion.count({ where: scope }),
      prisma.previousYearQuestion.count({ where: { AND: [scope, DEFECTS.needsFigure] } }),
      prisma.previousYearQuestion.count({ where: { AND: [scope, DEFECTS.missingAnswer] } }),
      prisma.previousYearQuestion.count({
        where: { AND: [scope, { OR: [DEFECTS.needsFigure, DEFECTS.missingAnswer] }] },
      }),
    ]);

    res.json({
      success: true,
      data: items,
      meta: { total, page, limit, pages: Math.ceil(total / limit) || 1 },
      counts: { all, needsFigure, missingAnswer, priority },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/admin/pyq/facets — what the filter row may offer.
 *
 * Derived from the rows, narrowed by everything already chosen, so picking an
 * exam narrows the years and picking a year narrows the sessions. A hardcoded
 * list would offer a year the archive does not hold; a list derived from the
 * DRAWABLE pool would omit exactly the papers whose questions are broken, which
 * are the ones this screen exists to find.
 */
export const getAdminPyqFacets = async (req, res) => {
  try {
    // Each axis is counted with its OWN value dropped from the selection, so a
    // chosen year still lists its siblings. Narrowing every axis by every choice
    // leaves each dropdown holding only the option already picked, and the
    // filter becomes a one-way door — you cannot get back to another year
    // without clearing the whole form.
    const scoped = (drop) => adminWhere({ ...req.query, [drop]: undefined });

    const [exams, years, sessions, subjects, chapters] = await Promise.all([
      prisma.previousYearQuestion.groupBy({
        by: ["examCode"], where: scoped("examCode"), _count: { _all: true },
      }),
      prisma.previousYearQuestion.groupBy({
        by: ["year"], where: scoped("year"), _count: { _all: true }, orderBy: { year: "desc" },
      }),
      prisma.previousYearQuestion.groupBy({
        by: ["session", "sessionLabel"], where: scoped("session"), _count: { _all: true },
      }),
      prisma.previousYearQuestion.groupBy({
        by: ["subject"], where: scoped("subject"), _count: { _all: true },
      }),
      prisma.previousYearQuestion.groupBy({
        by: ["chapter", "topic"], where: scoped("chapter"), _count: { _all: true },
      }),
    ]);

    // One entry per distinct label, however many columns it arrived in.
    const roll = (rows, pick) => {
      const out = new Map();
      for (const row of rows) {
        const value = pick(row);
        if (!value) continue;
        out.set(value, (out.get(value) ?? 0) + row._count._all);
      }
      return [...out.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
    };

    res.json({
      success: true,
      data: {
        exams: exams
          .map((e) => ({
            value: e.examCode,
            label: PYQ_EXAMS[e.examCode]?.label || e.examCode,
            count: e._count._all,
          }))
          .sort((a, b) => b.count - a.count),
        years: years.map((y) => ({ value: y.year, count: y._count._all })),
        // A session is whichever of the two columns the importer filled.
        sessions: roll(sessions, (r) => r.session || r.sessionLabel),
        subjects: roll(subjects, (r) => r.subject),
        chapters: roll(chapters, (r) => r.chapter || r.topic).slice(0, 400),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/** GET /api/admin/pyq/:id — one question, every column the editor writes. */
export const getAdminPyq = async (req, res) => {
  try {
    const question = await prisma.previousYearQuestion.findUnique({
      where: { id: req.params.id },
    });
    if (!question) {
      return res.status(404).json({ success: false, error: "Question not found" });
    }
    res.json({ success: true, data: question });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/* -------------------------------- writing ------------------------------- */

/**
 * The only columns an edit may touch.
 *
 * An allow-list rather than `data: req.body`, which is what the four handlers in
 * adminController.js do and why an admin there can write any column on any row.
 * Spread into a Prisma update, `{"examCode":"NEET"}` moves a JEE question into
 * another exam's archive and `{"questionHash":"..."}` breaks the uniqueness that
 * stops a re-import duplicating it.
 */
const TEXT_FIELDS = [
  "questionText",
  "optionA", "optionB", "optionC", "optionD",
  "correctAnswer",
  // Paths, not uploads. Nothing here writes a file — the crops live in the
  // pyq-figures repo and reach the browser over the jsDelivr CDN, so an edit
  // here re-POINTS a question at a different existing crop. Publishing a NEW
  // figure is a git commit, not a save button.
  "questionImage",
  "optionAImage", "optionBImage", "optionCImage", "optionDImage",
  "solutionImage",
];

/**
 * Can the marker ever score this key?
 *
 * The point of this endpoint is filling in missing answers, so the failure it
 * has to prevent is a key that LOOKS filled in and scores nobody: markPaper puts
 * "4.5" through numericallyEqual, and a numerical question keyed "four point
 * five" marks every candidate wrong with negative marks. Checked with the
 * marker's own comparison rather than a second parser so the two cannot drift.
 */
export function keyProblem(questionType, key) {
  const value = String(key ?? "").trim();
  if (!value) return null; // absent is a known state; wrong is not

  if (questionType === "numerical" || questionType === "integer") {
    // Any number the key itself mentions must satisfy it. "0.14 to 0.16" is
    // satisfied by 0.14; "four point five" is satisfied by nothing.
    const probe = value.replace(/[−‒–—―]/g, "-").match(/-?\d+(?:\.\d+)?/);
    if (!probe || !numericallyEqual(probe[0], value)) {
      return `"${value}" is not a number or range a ${questionType} question can be marked against.`;
    }
    return null;
  }

  // markPaper reads an option key as letters, upper-cased: "A", or "A,C" for
  // multi-correct. Anything else compares equal to no response at all.
  const letters = value.toUpperCase().replace(/[^A-Z]/g, "");
  if (!letters || /[^A-D]/.test(letters)) {
    return `"${value}" is not an option letter. Use A, B, C or D.`;
  }
  if (questionType === "mcq_single" && letters.length > 1) {
    return `"${value}" gives more than one answer to a single-answer question. Use mcq_multiple, or pick one.`;
  }
  return null;
}

/**
 * Read a set of crop windows, or say what is wrong with it.
 *
 * Returns `{ value }` — the cleaned object, or null when nothing is left to
 * store — or `{ error }`. Never both.
 *
 * Validated rather than trusted because the failure is invisible: this column
 * is applied by a renderer, not by a query, so a malformed window does not
 * throw anywhere. It draws a blank box where a question used to be, on the
 * candidate's screen, and the row still reads as fine in every list.
 *
 * A window covering the whole image is the same thing — `{bottom: 100}` leaves
 * nothing visible — so the two insets on an axis must leave a strip behind. The
 * floor is deliberately generous: 2% of a 900px crop is 18px, which is smaller
 * than anything anyone would crop TO and larger than a slip of the mouse.
 */
export function readCrops(raw) {
  if (raw === null) return { value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "imageCrops must be an object keyed by image field, or null" };
  }

  const out = {};
  for (const [field, window] of Object.entries(raw)) {
    if (!IMAGE_COLUMNS.includes(field)) {
      return { error: `"${field}" is not an image field. Use one of: ${IMAGE_COLUMNS.join(", ")}` };
    }
    // An explicit null is how the client says "this part is drawn whole again",
    // and it has to be distinguishable from a key that was never sent — the
    // PATCH body carries the whole object, so a dropped key is also a removal,
    // but a null says so without the client having to rebuild the set.
    if (window === null) continue;
    if (typeof window !== "object" || Array.isArray(window)) {
      return { error: `${field}: a crop must be an object with top, right, bottom and left` };
    }

    const sides = {};
    for (const side of CROP_SIDES) {
      const n = window[side];
      if (typeof n !== "number" || !Number.isFinite(n)) {
        return { error: `${field}.${side} must be a number of percent` };
      }
      if (n < 0 || n > 100) {
        return { error: `${field}.${side} is ${n}% — a crop inset runs from 0 to 100` };
      }
      // Two decimals is finer than a pixel on any crop in the archive, and it
      // keeps the stored JSON from carrying a drag's full float.
      sides[side] = Math.round(n * 100) / 100;
    }

    for (const [a, b, axis] of [["left", "right", "wide"], ["top", "bottom", "tall"]]) {
      if (sides[a] + sides[b] > 98) {
        return {
          error:
            `${field}: ${a} ${sides[a]}% + ${b} ${sides[b]}% leaves nothing ${axis} enough to see.`,
        };
      }
    }

    // A window that crops nothing is not a window. Dropping it here means
    // "reset" and "drag the box back to the edges" store the same thing, and a
    // row with no cropping left ends up with the column null rather than with
    // an object full of zeroes that every reader has to interpret.
    if (CROP_SIDES.some((side) => sides[side] > 0)) out[field] = sides;
  }

  return { value: Object.keys(out).length ? out : null };
}

/**
 * PATCH /api/admin/pyq/:id — fix one question.
 *
 * Partial by design: the two queues are worked one field at a time (paste a key,
 * or point a row at its crop), and a PUT would make the client resend a whole
 * row it never loaded and clobber whatever an import wrote in between.
 */
export const updateAdminPyq = async (req, res) => {
  try {
    const existing = await prisma.previousYearQuestion.findUnique({
      where: { id: req.params.id },
      select: { id: true, questionType: true, correctAnswer: true },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: "Question not found" });
    }

    const body = req.body ?? {};
    const data = {};

    for (const field of TEXT_FIELDS) {
      if (!(field in body)) continue;
      const raw = body[field];
      if (raw === null) {
        data[field] = null;
        continue;
      }
      if (typeof raw !== "string") {
        return res.status(400).json({ success: false, error: `${field} must be text or null` });
      }
      // "" means "clear it", which for a nullable column is null and not an
      // empty string — an empty optionC renders as a blank fourth choice rather
      // than as a question with three.
      const value = raw.trim();
      data[field] = value === "" ? null : value;
    }

    // questionText is NOT NULL, and a question with no stem is not a question.
    if ("questionText" in data && !data.questionText) {
      return res.status(400).json({ success: false, error: "The question text cannot be empty" });
    }

    if ("questionType" in body) {
      if (!QUESTION_TYPES.includes(body.questionType)) {
        return res.status(400).json({
          success: false,
          error: `questionType must be one of: ${QUESTION_TYPES.join(", ")}`,
        });
      }
      data.questionType = body.questionType;
    }

    // "" from a <select> means "back to the default rule", which is null and
    // not the empty string — the player tests the value, and "" is neither a
    // mode nor an absence it recognises.
    if ("renderAs" in body) {
      const mode = body.renderAs === "" ? null : body.renderAs;
      if (!RENDER_MODES.includes(mode)) {
        return res.status(400).json({
          success: false,
          error: `renderAs must be "image", "text", or empty for the default`,
        });
      }
      data.renderAs = mode;
    }

    if ("status" in body) {
      if (!STATUSES.includes(body.status)) {
        return res.status(400).json({
          success: false,
          error: `status must be one of: ${STATUSES.join(", ")}`,
        });
      }
      data.status = body.status;
    }

    /**
     * needsFigure is editable, and it is not derived from `status`.
     *
     * It has to be editable or the larger queue can never be worked down: the
     * flag is what puts a row in it, and it is also what excludes the row from
     * every drawn paper. Clearing it is the last step of the fix.
     *
     * It is not derived because the two are not the same fact. 336 rows carry
     * needsFigure with a status other than "needs_figure", so setting one from
     * the other would silently rewrite them.
     */
    if ("needsFigure" in body) {
      if (typeof body.needsFigure !== "boolean") {
        return res.status(400).json({ success: false, error: "needsFigure must be true or false" });
      }
      data.needsFigure = body.needsFigure;
    }

    /**
     * Crop windows. Deliberately not in TEXT_FIELDS: that loop trims whatever
     * it is given into a string, which would store this object as "[object
     * Object]" and take a question off the screen.
     *
     * Sent whole rather than per-field. There are at most six windows on a row
     * and they are edited from one drawer, so a partial merge would only buy
     * the chance for two of them to disagree about what the row currently says.
     */
    if ("imageCrops" in body) {
      const { value, error } = readCrops(body.imageCrops);
      if (error) return res.status(400).json({ success: false, error });
      // Prisma.DbNull, not null. On a nullable Json column a bare `null` is
      // rejected as ambiguous — Postgres can hold both an SQL NULL and the JSON
      // value `null`, and Prisma will not guess which was meant. The former is
      // what "no crops on this row" is, and it is what every reader here tests
      // for.
      data.imageCrops = value === null ? Prisma.DbNull : value;
    }

    if (!Object.keys(data).length) {
      return res.status(400).json({ success: false, error: "No editable fields were sent" });
    }

    // Validated against the type this row will HAVE after the edit, not the one
    // it had before — a row switched to numerical in the same request must have
    // its key read as a number.
    const type = data.questionType ?? existing.questionType;
    const key = "correctAnswer" in data ? data.correctAnswer : existing.correctAnswer;
    const problem = keyProblem(type, key);
    if (problem) return res.status(400).json({ success: false, error: problem });

    const question = await prisma.previousYearQuestion.update({
      where: { id: existing.id },
      data,
    });

    res.json({
      success: true,
      data: question,
      // Named so the client can say what it saved rather than "saved".
      meta: { updated: Object.keys(data) },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
