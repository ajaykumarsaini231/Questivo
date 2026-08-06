import prisma from "../prismaClient.js";
import { chat, ROLES } from "../lib/aiClient.js";
import { PYQ_EXAMS, resolvePyqExamCode, profileToBrief } from "../lib/pyqPattern.js";
import { buildPyqProfile } from "../lib/pyqProfile.js";
import { markPaper, MARKING_SELECT } from "../lib/pyqMarking.js";
import { generatePaper, planPaper, GENERATOR_PATTERNS } from "../lib/pyqGenerator.js";
import { generateFullTest, listFullTestPatterns } from "../lib/pyqBlueprints.js";
import {
  DRAWABLE,
  buildBrowseWhere,
  buildQuestionWhere,
  examFacets,
  normalizeSpec,
} from "../lib/pyqFilters.js";

/* ------------------------------ read APIs ------------------------------- */

/** Which exams have PYQs, and how many, so the UI never offers an empty year. */
export const getPyqCoverage = async (_req, res) => {
  try {
    // Grouped by session as well as year, so the UI can offer the same
    // breakdown a candidate expects from an exam site: a year, and within it
    // the individual sittings (January / April, Shift 1 / Shift 2).
    const grouped = await prisma.previousYearQuestion.groupBy({
      by: ["examCode", "year", "session"],
      _count: { _all: true },
      orderBy: [{ examCode: "asc" }, { year: "desc" }, { session: "asc" }],
    });

    const byExam = {};
    for (const row of grouped) {
      const e = (byExam[row.examCode] ||= {
        examCode: row.examCode,
        label: PYQ_EXAMS[row.examCode]?.label || row.examCode,
        total: 0,
        years: [],
        sessions: [],
      });
      e.total += row._count._all;

      const year = e.years.find((y) => y.year === row.year);
      if (year) year.count += row._count._all;
      else e.years.push({ year: row.year, count: row._count._all });

      if (row.session) {
        e.sessions.push({ year: row.year, session: row.session, count: row._count._all });
      }
    }

    // Advertise supported exams even at zero, so the UI can say "coming soon"
    // rather than pretending the exam does not exist.
    for (const [code, meta] of Object.entries(PYQ_EXAMS)) {
      byExam[code] ||= { examCode: code, label: meta.label, total: 0, years: [] };
    }

    res.json({ success: true, data: Object.values(byExam) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** Paged PYQ list. Solutions are excluded here — they are fetched per question. */
export const listPyqs = async (req, res) => {
  try {
    const { examCode: raw, page = 1, pageSize = 20 } = req.query;
    const examCode = resolvePyqExamCode(raw);
    if (!examCode) {
      // Not an exam we carry PYQs for. 404 rather than an empty 200 so the UI
      // can route the visitor to the course request form.
      return res.status(404).json({ error: "No previous year questions for this exam", canRequest: true });
    }

    // Exam, year, session, subject and chapter, built by lib/pyqFilters.js.
    // Shared with the admin question table so one filter cannot select two
    // different sets of rows — the table is where a broken question gets fixed
    // and this list is where the fix has to show up.
    //
    // Chapter is how candidates actually revise — one chapter at a time, across
    // every year — so it is a first-class filter, not a sub-filter of year.
    const where = buildBrowseWhere({ ...req.query, examCode });

    const take = Math.min(Number(pageSize) || 20, 50);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const [items, total] = await Promise.all([
      prisma.previousYearQuestion.findMany({
        where,
        orderBy: [{ year: "desc" }, { createdAt: "asc" }],
        skip,
        take,
        select: {
          id: true, year: true, session: true, subject: true, topic: true,
          questionText: true, optionA: true, optionB: true, optionC: true, optionD: true,
          correctAnswer: true, questionType: true, diagramSvg: true,
          // Only whether a solution exists, not its body.
          solution: false,
          sourceUrl: true,
        },
      }),
      prisma.previousYearQuestion.count({ where }),
    ]);

    res.json({ success: true, data: items, total, page: Number(page), pageSize: take });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Worked solution for one PYQ.
 *
 * Generated once, then cached on the row. This is the single biggest token
 * saving in the feature: a popular question is explained once for every user
 * who ever opens it, instead of once per view.
 */
export const getPyqSolution = async (req, res) => {
  try {
    const q = await prisma.previousYearQuestion.findUnique({ where: { id: req.params.id } });
    if (!q) return res.status(404).json({ error: "Question not found" });

    if (q.solution) {
      return res.json({ success: true, data: { solution: q.solution, cached: true } });
    }

    const options = [q.optionA, q.optionB, q.optionC, q.optionD].filter(Boolean);
    const body =
      `${q.questionText}\n` +
      (options.length ? options.map((o, i) => `${"ABCD"[i]}) ${o}`).join("\n") + "\n" : "") +
      `Official answer: ${q.correctAnswer}`;

    const completion = await chat(ROLES.VERIFICATION, {
      messages: [
        {
          role: "system",
          content:
            "You explain exam questions to a candidate. Give a concise step-by-step derivation ending at the stated official answer. " +
            "Wrap all mathematics in \\( ... \\), never nesting delimiters. " +
            "If the official answer looks wrong, say so explicitly rather than contriving a derivation for it.",
        },
        { role: "user", content: body },
      ],
      temperature: 0.2,
      max_tokens: 900,
    });

    const solution = completion.choices?.[0]?.message?.content?.trim();
    if (!solution) return res.status(502).json({ error: "Could not generate a solution" });

    await prisma.previousYearQuestion.update({
      where: { id: q.id },
      data: { solution, solutionModel: "verification-chain" },
    });

    res.json({ success: true, data: { solution, cached: false } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Chapters that actually have questions, grouped by subject, with counts.
 *
 * This is the index a candidate navigates by: pick a chapter, get every
 * previous year question on it across all years. Year is how papers are
 * archived; chapter is how people revise.
 *
 * Counted in SQL rather than by loading questions — the index has to be cheap
 * because it renders before anything else on the page.
 */
export const getPyqTopics = async (req, res) => {
  try {
    const examCode = resolvePyqExamCode(req.params.examCode);
    if (!examCode) {
      return res.status(404).json({ error: "No previous year questions for this exam", canRequest: true });
    }

    // Counted the way the DRAW counts, not the way the table does.
    //
    // These numbers are on a button that sits a paper on the chapter, so they
    // have to be the questions a paper can actually be built from — keyed,
    // scoreable, readable. Counting every row instead advertised a chapter of
    // 26 whose drawable pool was 2, and the candidate got an error page where
    // they expected a test.
    //
    // needsFigure rows are the gap: real questions whose text did not survive
    // extraction. They are still worth reading in the list below, which is why
    // they are counted into `untagged`-style totals, but they cannot carry a
    // scored paper.
    const grouped = await prisma.previousYearQuestion.groupBy({
      by: ["subject", "topic"],
      where: { examCode, topic: { not: null }, needsFigure: false, ...DRAWABLE },
      _count: { _all: true },
    });

    // Untagged questions still exist and are still worth practising, so each
    // subject reports how many are not reachable by chapter yet rather than
    // quietly hiding them.
    const totals = await prisma.previousYearQuestion.groupBy({
      by: ["subject"],
      where: { examCode },
      _count: { _all: true },
    });

    const bySubject = {};
    for (const row of grouped) {
      bySubject[row.subject] ||= { subject: row.subject, total: 0, untagged: 0, chapters: [] };
      bySubject[row.subject].chapters.push({ topic: row.topic, count: row._count._all });
    }
    for (const t of totals) {
      const s = (bySubject[t.subject] ||= {
        subject: t.subject,
        total: 0,
        untagged: 0,
        chapters: [],
      });
      s.total = t._count._all;
      s.untagged = t._count._all - s.chapters.reduce((a, c) => a + c.count, 0);
      s.chapters.sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
    }

    res.json({
      success: true,
      data: Object.values(bySubject).sort((a, b) => b.total - a.total),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ─────────────────────── whole papers, attempted as sat ───────────────────
 *
 * Distinct from listPyqs above, which is a browse-and-revise list. This is the
 * archive: pick an exam, a year, a session and a shift, and sit THAT paper —
 * every question, in the order it was printed, under the marking scheme and
 * clock the candidates actually had.
 *
 * Two rules the endpoints below exist to enforce:
 *
 *   1. Nothing is generated, sampled or shuffled. The paper is a fixed row set
 *      ordered by paperQuestionNumber.
 *   2. The answer key never leaves the server before the candidate submits.
 *      getPyqPaper strips correctAnswer and solution; scorePyqPaper is the only
 *      place they are read, and it reads them from the database rather than
 *      trusting anything the client sends back.
 */

/** Papers available to sit, as the nested tree the picker walks. */
export const listPyqPapers = async (req, res) => {
  try {
    const where = { isPublished: true };
    if (req.query.examCode) {
      const examCode = resolvePyqExamCode(req.query.examCode);
      if (!examCode) {
        return res.status(404).json({ error: "No previous year papers for this exam", canRequest: true });
      }
      where.examCode = examCode;
    }
    if (req.query.year) where.year = Number(req.query.year);

    // Admins previewing before release. Same token gate as listCourseRequests.
    if (process.env.Secret_Token && req.headers["x-admin-token"] === process.env.Secret_Token) {
      delete where.isPublished;
    }

    const papers = await prisma.pyqPaper.findMany({
      where,
      orderBy: [{ examCode: "asc" }, { year: "desc" }, { paperDate: "asc" }, { shift: "asc" }],
    });

    // Nested exam → year → session → shift, which is the order the picker asks
    // the candidate for. Building it here keeps the client from having to
    // regroup a flat list on every render.
    const byExam = new Map();
    for (const p of papers) {
      if (!byExam.has(p.examCode)) {
        byExam.set(p.examCode, {
          examCode: p.examCode,
          label: PYQ_EXAMS[p.examCode]?.label || p.examName,
          years: new Map(),
        });
      }
      const exam = byExam.get(p.examCode);

      if (!exam.years.has(p.year)) exam.years.set(p.year, { year: p.year, sessions: new Map() });
      const year = exam.years.get(p.year);

      const sessionKey = p.sessionLabel || "Session";
      if (!year.sessions.has(sessionKey)) {
        year.sessions.set(sessionKey, {
          sessionNumber: p.sessionNumber,
          sessionLabel: sessionKey,
          papers: [],
        });
      }
      year.sessions.get(sessionKey).papers.push({
        paperId: p.id,
        paperDate: p.paperDate,
        dateLabel: p.dateLabel,
        shift: p.shift,
        shiftLabel: p.shiftLabel,
        shiftTime: p.shiftTime,
        durationMinutes: p.durationMinutes,
        totalQuestions: p.totalQuestions,
        totalMarks: p.totalMarks,
        subjectCounts: p.subjectCounts,
        needsFigureCount: p.needsFigureCount,
        languages: p.languages,
      });
    }

    const data = [...byExam.values()].map((e) => ({
      examCode: e.examCode,
      label: e.label,
      /// How many shifts this exam has in the archive. Drives the order below,
      /// and worth sending anyway — the picker can say "30 papers" on the chip.
      paperCount: [...e.years.values()].reduce(
        (total, y) => total + [...y.sessions.values()].reduce((n, s) => n + s.papers.length, 0),
        0
      ),
      years: [...e.years.values()]
        .sort((a, b) => b.year - a.year)
        .map((y) => ({
          year: y.year,
          sessions: [...y.sessions.values()].sort(
            (a, b) => (a.sessionNumber ?? 0) - (b.sessionNumber ?? 0)
          ),
        })),
    }));

    /**
     * Deepest archive first — NOT alphabetical.
     *
     * The picker opens on whichever exam this list puts first, and the query
     * above orders by examCode, so adding the single GATE MT paper silently
     * moved the landing view off JEE Main's 30 shifts (a full year → session →
     * date & shift grid, which is the point of this screen) and onto one GATE
     * card with no session row and no shifts at all. Nothing had been removed;
     * "G" simply sorts before "J".
     *
     * Ordering by how many papers an exam actually has makes the default the
     * exam a visitor is most likely to want, and keeps doing so as the archive
     * grows — no hard-coded favourite to update every time an exam is added.
     * Label breaks ties so the order is stable between requests.
     */
    data.sort((a, b) => b.paperCount - a.paperCount || a.label.localeCompare(b.label));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * One whole paper, ready to sit.
 *
 * `correctAnswer` and `solution` are deliberately absent from the selection.
 * They are not merely hidden by the client — they are never sent, because a
 * timed paper whose key sits in the network tab is not a timed paper.
 */
export const getPyqPaper = async (req, res) => {
  try {
    const paper = await prisma.pyqPaper.findUnique({ where: { id: req.params.paperId } });
    if (!paper) return res.status(404).json({ error: "Paper not found" });

    const isAdmin =
      process.env.Secret_Token && req.headers["x-admin-token"] === process.env.Secret_Token;
    if (!paper.isPublished && !isAdmin) {
      return res.status(404).json({ error: "This paper is not published yet" });
    }

    const questions = await prisma.previousYearQuestion.findMany({
      where: { paperId: paper.id },
      // The order it was printed in. Never randomised.
      orderBy: { paperQuestionNumber: "asc" },
      select: {
        id: true,
        paperQuestionNumber: true,
        questionNumber: true,
        subject: true,
        section: true,
        chapter: true,
        questionText: true,
        optionA: true, optionB: true, optionC: true, optionD: true,
        questionType: true,
        marksCorrect: true,
        marksIncorrect: true,
        status: true,
        needsFigure: true,
        figureHint: true,
        diagramSvg: true,
        diagramImage: true,
        // The question as printed, in parts. These are what the player renders
        // when the text layer could not be recovered — and the authoritative
        // rendering of the original even when it could.
        questionImage: true,
        optionAImage: true,
        optionBImage: true,
        optionCImage: true,
        optionDImage: true,
        // How much of each of those to draw. Without it the player shows the
        // whole file, and an operator's crop is applied on the admin screen it
        // was made on and nowhere else.
        imageCrops: true,
        // Which of the two the player draws. Without it the player falls back
        // to "a crop wins", and an operator's decision to show the text of a
        // mis-cut question would be silently ignored on the one screen it was
        // made for.
        renderAs: true,
        // Whether the crop IS the question or a spare copy of it, so the
        // player can publish text where the page drew nothing the text does
        // not already say. Without it every question renders as a picture.
        questionNeedsImage: true,
        questionContentKind: true,
        sourceUrl: true,
      },
    });

    if (!questions.length) {
      return res.status(404).json({ error: "This paper has no questions stored" });
    }

    res.json({ success: true, data: { paper, questions } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Score a submitted attempt.
 *
 * The client posts only its responses; every marking decision is made here
 * against the stored key. Two rules of the real paper that a naive
 * "+4 per match" would get wrong:
 *
 *   - Section B caps how many answers count. JEE Main 2022 printed 10 numerical
 *     questions per subject and scored any 5, which is why the paper is out of
 *     300 and not 360. The first `sectionBAttemptLimit` ATTEMPTED questions per
 *     subject count, in paper order, and the rest are marked "not counted"
 *     rather than silently ignored.
 *   - A question the board voided scores full marks for everyone, attempted or
 *     not. That is what "bonus" meant on the day.
 */
export const scorePyqPaper = async (req, res) => {
  try {
    const paper = await prisma.pyqPaper.findUnique({ where: { id: req.params.paperId } });
    if (!paper) return res.status(404).json({ error: "Paper not found" });

    const responses = req.body?.responses;
    if (!responses || typeof responses !== "object") {
      return res.status(400).json({ error: "responses must be an object of questionId → answer" });
    }

    const questions = await prisma.previousYearQuestion.findMany({
      where: { paperId: paper.id },
      orderBy: { paperQuestionNumber: "asc" },
      select: MARKING_SELECT,
    });
    if (!questions.length) return res.status(404).json({ error: "This paper has no questions stored" });

    const timeTakenSeconds = Number(req.body?.timeTakenSeconds) || null;
    const result = markPaper(questions, responses, {
      totalMarks: paper.totalMarks,
      sectionBAttemptLimit: paper.sectionBAttemptLimit,
      durationMinutes: paper.durationMinutes,
      timeTakenSeconds,
    });

    const attemptId = await recordAttempt(req.userId, {
      kind: "pyq",
      paperId: paper.id,
      examCode: paper.examCode,
      examName: paper.examName,
      year: paper.year,
      sessionLabel: paper.sessionLabel,
      dateLabel: paper.dateLabel,
      shiftLabel: paper.shiftLabel,
      subject: null,
      totalMarks: paper.totalMarks,
      questionIds: questions.map((q) => q.id),
      responses,
      timeTakenSeconds,
      result,
    });

    res.json({
      success: true,
      data: {
        paperId: paper.id,
        attemptId,
        // Stated so the player can tell the candidate their paper was saved —
        // or, when they are not signed in, that it was not. A sitting that
        // silently fails to persist is the bug this whole feature exists to
        // fix, and it must never be silent again.
        saved: Boolean(attemptId),
        signedIn: Boolean(req.userId),
        ...result,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Write one sitting to the candidate's history.
 *
 * Deliberately after the result is computed, and deliberately swallowing its
 * own errors: a candidate who has just spent three hours on a paper must get
 * their score even if the write fails, so a storage problem degrades to "not in
 * your history" rather than "your paper is lost". The caller reports which of
 * those happened via `saved`.
 *
 * @returns {Promise<string|null>} the attempt id, or null when nothing was
 *          written — either nobody was signed in, or the insert failed.
 */
async function recordAttempt(userId, a) {
  if (!userId) return null;
  try {
    const attempt = await prisma.pyqAttempt.create({
      data: {
        userId,
        kind: a.kind,
        paperId: a.paperId,
        examCode: a.examCode,
        examName: a.examName,
        year: a.year,
        label: [a.sessionLabel, a.dateLabel, a.shiftLabel].filter(Boolean).join(" · ") || null,
        sessionLabel: a.sessionLabel ?? null,
        dateLabel: a.dateLabel ?? null,
        shiftLabel: a.shiftLabel ?? null,
        subject: a.subject ?? null,
        score: Math.round(a.result.score),
        totalMarks: a.totalMarks ?? 0,
        percent: a.totalMarks ? Math.round((a.result.score / a.totalMarks) * 100) : 0,
        correct: a.result.correct ?? 0,
        wrong: a.result.wrong ?? 0,
        unattempted: a.result.unattempted ?? 0,
        timeTakenSeconds: a.timeTakenSeconds ?? null,
        questionIds: a.questionIds ?? [],
        totalQuestions: a.questionIds?.length ?? null,
        spec: a.spec ?? undefined,
        responses: a.responses ?? {},
      },
      select: { id: true },
    });
    return attempt.id;
  } catch (e) {
    console.warn(`[pyq] could not record ${a.kind} attempt for ${a.paperId}: ${e.message}`);
    return null;
  }
}

/* ──────────────── a fresh paper built from the question bank ───────────────
 *
 * The third way to get a paper. Instead of sitting one specific shift, draw a
 * new one from every previous year question we hold, following the real exam's
 * shape.
 *
 * Costs nothing and takes no model call, which is the point: the AI generator
 * writes new questions and is slow and metered, whereas this is a database read
 * over questions that were actually examined. The drawing itself lives in
 * lib/pyqGenerator.js — this is only the HTTP shell around it.
 */

/**
 * Read a generation spec from wherever the caller put it.
 *
 * GET /practice/generate carries it in the query string as comma-joined
 * strings; POST /generate carries real JSON arrays. Normalising both here means
 * the generator never has to know which door the request came through.
 */
/**
 * Ceiling on a drawn paper. The marker, the palette and the review list all
 * render every question, so this is a rendering limit as much as a load one.
 * Comfortably above the longest real paper here (NEET's 180).
 */
const MAX_GENERATED_QUESTIONS = 200;

function readGenerateSpec(req) {
  const src = { ...(req.query || {}), ...(req.body || {}) };

  const list = (v) =>
    Array.isArray(v)
      ? v.map((x) => String(x).trim()).filter(Boolean)
      : String(v ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

  // Every filter the picker offers is carried through to the draw. One that is
  // read here but not passed on is worse than one that does not exist: the UI
  // shows it as applied, the preview counts it, and the paper ignores it.
  // An exam code we do not recognise is an ERROR, not a reason to pick one.
  //
  // This used to fall back to JEE_MAIN whenever resolvePyqExamCode returned
  // null — which it does for GATE_CS, for UPSC, and for any typo. A candidate
  // who asked for GATE Computer Science was handed a JEE Main paper with no
  // indication that anything had been substituted, and would have sat it.
  const asked = src.examCode || "JEE_MAIN";
  const examCode = resolvePyqExamCode(asked);
  if (!examCode) {
    const err = new Error(
      `No previous year questions for "${asked}". Supported: ${Object.keys(PYQ_EXAMS).join(", ")}.`
    );
    err.status = 404;
    err.canRequest = true;
    throw err;
  }

  const spec = {
    ...normalizeSpec(src),
    examCode,
    subjects: list(src.subjects),
    chapters: list(src.chapters),
    years: list(src.years).map(Number).filter(Number.isFinite),
    difficulty: ["easy", "medium", "hard", "mixed"].includes(src.difficulty)
      ? src.difficulty
      : "mixed",
  };

  if (src.totalQuestions != null && Number(src.totalQuestions) > 0) {
    // Capped, and the cap REFUSES rather than truncating.
    //
    // Math.min() here quietly turned a request for 400 questions into a
    // 200-question paper with nothing said — the candidate asks for one paper
    // and sits a different one, which is the same silent-shortening failure the
    // "not enough questions" refusal exists to prevent. A limit the caller
    // cannot see them hit is worse than no limit.
    const asked = Number(src.totalQuestions);
    if (asked > MAX_GENERATED_QUESTIONS) {
      const err = new Error(
        `A generated paper can hold at most ${MAX_GENERATED_QUESTIONS} questions; you asked for ${asked}.`
      );
      err.status = 400;
      throw err;
    }
    spec.totalQuestions = asked;
  }
  if (src.durationMinutes != null && Number(src.durationMinutes) > 0) {
    spec.durationMinutes = Math.min(Number(src.durationMinutes), 600);
  }
  if (src.distribution && typeof src.distribution === "object") {
    spec.distribution = src.distribution;
  }
  return spec;
}

/**
 * Draw a paper. Serves both GET /practice/generate and POST /generate.
 *
 * Like getPyqPaper, the answer key is absent from the response by construction
 * — lib/pyqGenerator.js never selects `correctAnswer`. Scoring is a round trip
 * to scoreQuestionSet below.
 */
export const generateMockPaper = async (req, res) => {
  try {
    const spec = readGenerateSpec(req);

    /**
     * TWO KINDS OF TEST, AND THEY ARE NOT THE SAME FEATURE.
     *
     * A FULL test is the official paper's shape: the exam decides the subjects,
     * the counts and the type split, and the candidate chooses nothing beyond
     * which exam. Letting a filter through here would quietly produce a "full
     * NEET mock" that was 180 questions of Modern Physics.
     *
     * A PARTIAL test is the opposite: the candidate's filters are the whole
     * specification, and the generator's job is to honour them exactly or say
     * why it cannot.
     */
    const mode = (req.body?.mode || req.query?.mode) === "full" ? "full" : "partial";

    if (mode === "full") {
      const { paper, questions, audit } = await generateFullTest(spec.examCode);
      return res.json({
        success: true,
        data: { paper, questions, audit, spec: { examCode: spec.examCode, mode: "full" } },
      });
    }

    const { paper, questions, warnings } = await generatePaper(spec);
    res.json({
      success: true,
      data: {
        paper,
        questions,
        spec: { ...spec, mode: "partial" },
        // Never silent about a substitution: a chapter that could not be filled
        // or a difficulty the archive cannot yet evidence is said out loud.
        ...(warnings.length ? { warnings } : {}),
      },
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      error: err.message,
      ...(err.canRequest ? { canRequest: true } : {}),
      // So the UI can say "56 available, you asked for 100" rather than only
      // repeating the sentence. Sent whenever the draw ran short.
      ...(err.available !== undefined ? { available: err.available, needed: err.needed } : {}),
      // The per-slot shortfall for a full paper — which subject, how many
      // short — so the screen can name the gap instead of just refusing.
      ...(err.audit ? { audit: err.audit } : {}),
    });
  }
};

/**
 * The official pattern of every exam that can produce a full-length paper,
 * with a live count of whether the archive can currently fill it.
 *
 * Fetched before the candidate presses anything, so the Full Test card shows
 * the real paper's shape — 180 questions, 720 marks, 180 minutes — and is
 * disabled with a reason rather than failing after the click.
 */
export const listFullTests = async (_req, res) => {
  try {
    res.json({ success: true, data: await listFullTestPatterns() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** Which exams can be drawn from, and what the picker should offer for each. */
export const getGeneratorOptions = async (req, res) => {
  try {
    const examCode = resolvePyqExamCode(req.query.examCode || "JEE_MAIN");
    const pattern = examCode ? GENERATOR_PATTERNS[examCode] : null;
    if (!pattern) {
      return res.status(404).json({
        error: "No generator pattern for this exam yet",
        canRequest: true,
        exams: Object.keys(GENERATOR_PATTERNS).map((code) => ({
          examCode: code,
          label: PYQ_EXAMS[code]?.label || code,
        })),
      });
    }

    // Only subjects and chapters that actually HAVE drawable questions are
    // offered. Listing a chapter the bank cannot fill turns the picker into a
    // way to produce an error.
    const grouped = await prisma.previousYearQuestion.groupBy({
      by: ["subject", "chapter"],
      where: { examCode, needsFigure: false, status: "ok", correctAnswer: { not: null } },
      _count: { _all: true },
    });
    const years = await prisma.previousYearQuestion.groupBy({
      by: ["year"],
      where: { examCode, needsFigure: false, status: "ok", correctAnswer: { not: null } },
      _count: { _all: true },
      orderBy: { year: "desc" },
    });

    const bySubject = new Map();
    for (const row of grouped) {
      if (!bySubject.has(row.subject)) {
        bySubject.set(row.subject, { subject: row.subject, total: 0, chapters: [] });
      }
      const s = bySubject.get(row.subject);
      s.total += row._count._all;
      if (row.chapter) s.chapters.push({ chapter: row.chapter, count: row._count._all });
    }
    for (const s of bySubject.values()) {
      s.chapters.sort((a, b) => b.count - a.count || a.chapter.localeCompare(b.chapter));
    }

    res.json({
      success: true,
      data: {
        examCode,
        label: PYQ_EXAMS[examCode]?.label || examCode,
        pattern: {
          subjects: pattern.subjects,
          sectionA: pattern.sectionA,
          sectionB: pattern.sectionB,
          sectionBAttemptLimit: pattern.sectionBAttemptLimit,
          durationMinutes: pattern.durationMinutes,
          fullLength: pattern.subjects.length * (pattern.sectionA + pattern.sectionB),
        },
        subjects: [...bySubject.values()].sort((a, b) => b.total - a.total),
        years: years.map((y) => ({ year: y.year, count: y._count._all })),
        exams: Object.keys(GENERATOR_PATTERNS).map((code) => ({
          examCode: code,
          label: PYQ_EXAMS[code]?.label || code,
        })),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Every exam the archive can actually put a paper together for, step 1 of the
 * setup flow.
 *
 * Counted from the question table, not from a list. An exam with a generator
 * pattern but no questions is offered as "coming soon" rather than as a choice
 * that leads to an empty picker, and an exam with questions but no pattern can
 * still be sat as a previous year paper.
 */
export const listExams = async (_req, res) => {
  try {
    const grouped = await prisma.previousYearQuestion.groupBy({
      by: ["examCode"],
      where: DRAWABLE,
      _count: { _all: true },
    });
    const held = new Map(grouped.map((g) => [g.examCode, g._count._all]));

    const papers = await prisma.pyqPaper.groupBy({
      by: ["examCode"],
      where: { isPublished: true },
      _count: { _all: true },
    });
    const paperCount = new Map(papers.map((p) => [p.examCode, p._count._all]));

    const codes = new Set([...held.keys(), ...Object.keys(PYQ_EXAMS)]);
    const data = [...codes]
      .map((code) => ({
        examCode: code,
        label: PYQ_EXAMS[code]?.label || code,
        slug: PYQ_EXAMS[code]?.slug ?? null,
        questions: held.get(code) ?? 0,
        papers: paperCount.get(code) ?? 0,
        // Whether a MOCK can be generated for it. Sitting a real paper needs
        // only questions; generating one needs a pattern to shape it.
        canGenerate: Boolean(GENERATOR_PATTERNS[code]) && (held.get(code) ?? 0) > 0,
        canSitPapers: (paperCount.get(code) ?? 0) > 0,
      }))
      .sort((a, b) => b.questions - a.questions || a.label.localeCompare(b.label));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Which filters apply to one exam, and what each is worth — step 3.
 *
 * The whole point is that this is DERIVED. JEE Main has sessions and shifts;
 * GATE has neither and is one sitting a year; JEE Advanced has Paper 1 and
 * Paper 2. Hardcoding that per exam means every new exam needs a code change
 * and every stale entry offers a filter that matches nothing — so the answer is
 * simply whichever facets this exam's rows actually carry.
 *
 * Any filter already chosen can be passed in, and the counts come back narrowed
 * to it, so "Physical Metallurgy (48)" means 48 given everything else picked.
 */
export const getExamFilters = async (req, res) => {
  try {
    const examCode = resolvePyqExamCode(req.query.examCode || req.params.examCode);
    if (!examCode) {
      return res.status(404).json({ error: "No previous year questions for this exam", canRequest: true });
    }
    const scope = normalizeSpec(req.query);
    const facets = await examFacets(prisma, examCode, scope);
    const pattern = GENERATOR_PATTERNS[examCode] ?? null;

    res.json({
      success: true,
      data: {
        examCode,
        label: PYQ_EXAMS[examCode]?.label || examCode,
        ...facets,
        canGenerate: Boolean(pattern) && facets.total > 0,
        pattern: pattern && {
          subjects: pattern.subjects,
          sectionA: pattern.sectionA,
          sectionB: pattern.sectionB,
          sectionBAttemptLimit: pattern.sectionBAttemptLimit,
          durationMinutes: pattern.durationMinutes,
          marksCorrect: pattern.marksCorrect,
          marksIncorrect: pattern.marksIncorrect,
          fullLength: pattern.subjects.length * (pattern.sectionA + pattern.sectionB),
        },
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * How many questions a filter selection actually matches — step 4.
 *
 * Asked before anything is generated so the candidate is told "56 available,
 * you asked for 100" instead of being handed a short paper, or a padded one.
 */
export const countAvailable = async (req, res) => {
  try {
    const spec = normalizeSpec({ ...req.query, ...req.body });
    const examCode = resolvePyqExamCode(spec.examCode);
    if (!examCode) return res.status(400).json({ error: "examCode is required" });

    const where = buildQuestionWhere({ ...spec, examCode });
    const [available, bySubject, byType] = await Promise.all([
      prisma.previousYearQuestion.count({ where }),
      prisma.previousYearQuestion.groupBy({ by: ["subject"], where, _count: { _all: true } }),
      prisma.previousYearQuestion.groupBy({ by: ["questionType"], where, _count: { _all: true } }),
    ]);

    const asked = spec.totalQuestions;
    const marks = await prisma.previousYearQuestion.aggregate({ where, _sum: { marksCorrect: true } });

    // "Enough" has to mean enough FOR THE PAPER THE DRAW WILL BUILD, not for a
    // flat total.
    //
    // The generator does not take N questions from one pool: planPaper splits N
    // across subjects by the exam's own share, and then across Section A and
    // Section B, and every one of those slots must be filled from its own pool
    // or the whole request is refused. A flat count of 40 against a request for
    // 30 says "enough" while the draw is looking for 10 Section B questions in
    // a subject that has 2 — the preview said yes and the Start button then
    // failed. Each slot is counted the same way the draw counts it.
    const plan = planPaper({
      examCode,
      subjects: spec.subjects,
      totalQuestions: asked,
      distribution: spec.distribution,
    });

    const slots = [];
    if (asked && plan) {
      for (const subject of plan.chosen) {
        for (const section of ["A", "B"]) {
          const need = plan.plan[subject]?.[section] ?? 0;
          if (!need) continue;
          const slotWhere = buildQuestionWhere(
            { ...spec, examCode, subjects: [subject] },
            section === "A" ? { OR: [{ section: "A" }, { section: null }] } : { section: "B" }
          );
          slots.push({
            subject,
            section,
            need,
            have: await prisma.previousYearQuestion.count({ where: slotWhere }),
          });
        }
      }
    }
    const short = slots.filter((s) => s.have < s.need);
    const enough = asked ? (plan ? short.length === 0 : available >= asked) : true;

    res.json({
      success: true,
      data: {
        examCode,
        available,
        requested: asked,
        // The one thing the preview exists to say. Left explicit rather than
        // implied by the numbers so the UI cannot get the comparison backwards.
        enough,
        shortBy: asked && available < asked ? asked - available : 0,
        // Which slot the paper would fail on, so the message can name it
        // instead of leaving the candidate to guess which filter to widen.
        slots,
        shortSlots: short.map((s) => ({
          subject: s.subject,
          section: s.section,
          need: s.need,
          have: s.have,
        })),
        bySubject: bySubject.map((s) => ({ subject: s.subject, count: s._count._all })),
        byType: byType.map((t) => ({ questionType: t.questionType, count: t._count._all })),
        // Marks and minutes for the WHOLE matching pool; the UI scales them by
        // how many questions are actually asked for.
        totalMarksIfAll: marks._sum.marksCorrect ?? 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Score an arbitrary set of questions — a generated paper.
 *
 * A generated paper has no PyqPaper row to score against, so the client sends
 * the ids it was served and the marking is done against those. The answer key
 * is still read from the database and never from the request — the client is
 * trusted for WHICH questions it saw, never for what the right answers were.
 * For the same reason `totalMarks` is recomputed here rather than believed: it
 * divides into the percentage that lands in the candidate's history.
 */
export const scoreQuestionSet = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.questionIds) ? req.body.questionIds.slice(0, 200) : null;
    const responses = req.body?.responses;
    if (!ids?.length) return res.status(400).json({ error: "questionIds is required" });
    if (!responses || typeof responses !== "object") {
      return res.status(400).json({ error: "responses must be an object of questionId → answer" });
    }

    const rows = await prisma.previousYearQuestion.findMany({
      where: { id: { in: ids } },
      // examCode and year are not used for marking; they are what lets the
      // history row say which exam this paper was drawn from without trusting
      // the client to say so.
      select: { ...MARKING_SELECT, examCode: true, year: true },
    });

    // Preserve the order the candidate saw, which is what the Section B limit
    // and the review list are both indexed by.
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
    if (!ordered.length) return res.status(404).json({ error: "None of those questions exist" });

    const limit = Number(req.body?.sectionBAttemptLimit) || null;
    const totalMarks = totalMarksFor(ordered, limit) ?? Number(req.body?.totalMarks) ?? null;
    const timeTakenSeconds = Number(req.body?.timeTakenSeconds) || null;

    const result = markPaper(ordered, responses, {
      totalMarks,
      sectionBAttemptLimit: limit,
      durationMinutes: Number(req.body?.durationMinutes) || null,
      timeTakenSeconds,
    });

    // A generated paper used to be scored and thrown away — the same bug real
    // papers had, one flow later. It is a sitting like any other, so it is
    // stored like any other, under its own kind.
    const subjects = [...new Set(ordered.map((q) => q.subject))];
    const examCode = ordered[0].examCode;
    const attemptId = await recordAttempt(req.userId, {
      kind: "generated",
      paperId: "generated",
      examCode,
      examName: PYQ_EXAMS[examCode]?.label || examCode,
      year: new Date().getFullYear(),
      sessionLabel: null,
      dateLabel: "Generated mock test",
      shiftLabel: typeof req.body?.label === "string" ? req.body.label.slice(0, 120) : null,
      subject: subjects.length === 1 ? subjects[0] : null,
      totalMarks,
      questionIds: ordered.map((q) => q.id),
      responses,
      timeTakenSeconds,
      spec: req.body?.spec && typeof req.body.spec === "object" ? req.body.spec : undefined,
      result,
    });

    res.json({
      success: true,
      data: {
        paperId: "generated",
        attemptId,
        saved: Boolean(attemptId),
        signedIn: Boolean(req.userId),
        ...result,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * What the paper is out of, under its own Section B rule.
 *
 * JEE Main prints 10 numerical questions per subject and scores any 5, so a
 * 90-question paper is out of 300 and not 360. Deriving it from the questions
 * rather than accepting the client's number keeps the stored percentage honest.
 */
function totalMarksFor(questions, sectionBAttemptLimit) {
  if (!questions.length) return null;
  const perQuestion = questions[0].marksCorrect;
  if (!Number.isFinite(perQuestion)) return null;

  if (!sectionBAttemptLimit) {
    return Math.round(questions.reduce((a, q) => a + (q.marksCorrect || 0), 0));
  }

  const subjects = [...new Set(questions.filter((q) => q.section === "B").map((q) => q.subject))];
  const sectionA = questions.filter((q) => q.section !== "B");
  return Math.round(
    sectionA.reduce((a, q) => a + (q.marksCorrect || 0), 0) +
      subjects.length * sectionBAttemptLimit * perQuestion
  );
}

/* ────────────────────────── a candidate's history ──────────────────────────
 *
 * Every sitting on this site now lands in one of two places: a generated mock
 * test and a real previous year paper are both PyqAttempt rows, told apart by
 * `kind`, while the AI-written papers remain TestSessions because those own
 * their questions. The two endpoints below serve the first pair; the profile
 * endpoint stitches all three together.
 */

/** Columns the history list needs. `responses` is deliberately absent — it is
 *  the biggest column on the row and nothing in a list renders it. */
const ATTEMPT_LIST_SELECT = {
  id: true, kind: true, paperId: true, examCode: true, examName: true, year: true,
  label: true, sessionLabel: true, dateLabel: true, shiftLabel: true, subject: true,
  score: true, totalMarks: true, percent: true, correct: true, wrong: true,
  unattempted: true, totalQuestions: true, timeTakenSeconds: true, spec: true,
  createdAt: true,
};

/** Below this many other candidates a percentile is noise, so none is shown. */
const MIN_PEERS_FOR_PERCENTILE = 5;

/**
 * Where each attempt stands against everyone else who sat the same paper.
 *
 * Ranked on each USER'S BEST score, not on every row: a candidate who sits the
 * same shift four times would otherwise occupy four of the places above you,
 * and your rank would fall every time somebody else practised.
 *
 * Only real papers get this. Two generated papers are two different draws, so
 * comparing their scores would be comparing different exams.
 */
async function percentilesFor(attempts) {
  const paperIds = [...new Set(attempts.filter((a) => a.kind === "pyq").map((a) => a.paperId))];
  if (!paperIds.length) return new Map();

  const peers = await prisma.pyqAttempt.findMany({
    where: { kind: "pyq", paperId: { in: paperIds } },
    select: { paperId: true, userId: true, score: true },
  });

  // paperId -> userId -> best score
  const best = new Map();
  for (const p of peers) {
    let byUser = best.get(p.paperId);
    if (!byUser) best.set(p.paperId, (byUser = new Map()));
    byUser.set(p.userId, Math.max(byUser.get(p.userId) ?? -Infinity, p.score));
  }

  const out = new Map();
  for (const a of attempts) {
    const byUser = best.get(a.paperId);
    if (!byUser || byUser.size < MIN_PEERS_FOR_PERCENTILE) continue;

    const scores = [...byUser.values()];
    const below = scores.filter((s) => s < a.score).length;
    out.set(a.id, {
      // Share of candidates this attempt beat. The convention every exam board
      // uses, and the reason a topper reads 100 rather than 99.9.
      percentile: Math.round((below / scores.length) * 1000) / 10,
      rank: scores.filter((s) => s > a.score).length + 1,
      outOf: scores.length,
    });
  }
  return out;
}

/** No history exists for a visitor with no account, and saying so beats an
 *  empty list — which reads as "your attempts are gone". */
const requireCandidate = (req, res) => {
  if (req.userId) return true;
  res.status(401).json({ error: "Sign in to see your test history.", signedIn: false });
  return false;
};

/** GET /api/pyq/attempts — this candidate's sittings, newest first. */
export const listMyAttempts = async (req, res) => {
  try {
    if (!requireCandidate(req, res)) return;
    const kind = req.query.kind === "pyq" || req.query.kind === "generated" ? req.query.kind : null;

    const attempts = await prisma.pyqAttempt.findMany({
      where: { userId: req.userId, ...(kind ? { kind } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: ATTEMPT_LIST_SELECT,
    });

    const standings = await percentilesFor(attempts);
    res.json({
      success: true,
      data: attempts.map((a) => ({ ...a, ...(standings.get(a.id) ?? {}) })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** Everything the review screen renders, plus everything markPaper reads. */
const REVIEW_SELECT = {
  ...MARKING_SELECT,
  questionText: true,
  optionA: true, optionB: true, optionC: true, optionD: true,
  needsFigure: true,
  diagramSvg: true,
  diagramImage: true,
  questionImage: true,
  optionAImage: true, optionBImage: true, optionCImage: true, optionDImage: true,
  // The review screen re-renders the paper, so it has to draw each question the
  // same way the player did or a candidate sees a different question afterwards.
  // That goes for how much of each crop is shown as much as for which form wins.
  imageCrops: true,
  renderAs: true,
  questionNeedsImage: true,
  questionContentKind: true,
  sourceUrl: true,
  year: true,
};

/**
 * GET /api/pyq/attempts/:attemptId — one saved sitting, reopened in full.
 *
 * The result is re-marked from the stored responses rather than read back from
 * the stored totals. Both are kept, and they agree, but the breakdown — which
 * question, what you put, what the key said, the worked solution — was never
 * stored per question and does not need to be: the responses plus the archive
 * reconstruct it exactly, through the same markPaper the submission used.
 */
export const getMyAttempt = async (req, res) => {
  try {
    if (!requireCandidate(req, res)) return;
    const attempt = await prisma.pyqAttempt.findUnique({ where: { id: req.params.attemptId } });
    // 404 rather than 403 for someone else's attempt: whether a given id exists
    // is not this caller's business.
    if (!attempt || attempt.userId !== req.userId) {
      return res.status(404).json({ error: "Attempt not found" });
    }

    let paper = null;
    let questions = [];

    if (attempt.kind === "pyq") {
      paper = await prisma.pyqPaper.findUnique({ where: { id: attempt.paperId } });
      questions = await prisma.previousYearQuestion.findMany({
        where: { paperId: attempt.paperId },
        orderBy: { paperQuestionNumber: "asc" },
        select: REVIEW_SELECT,
      });
    } else {
      // A generated paper exists only as the draw that produced it, so its
      // question set comes off the attempt and is re-ordered to match. findMany
      // returns rows in whatever order the planner likes, and the Section B
      // limit is decided in paper order — marking an unordered set would score
      // a different paper than the candidate sat.
      const rows = await prisma.previousYearQuestion.findMany({
        where: { id: { in: attempt.questionIds } },
        select: REVIEW_SELECT,
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      questions = attempt.questionIds
        .map((id, i) => {
          const q = byId.get(id);
          return q ? { ...q, paperQuestionNumber: i + 1 } : null;
        })
        .filter(Boolean);
    }

    if (!questions.length) {
      return res.status(410).json({
        error:
          "The questions for this attempt are no longer in the archive, so it cannot be reopened.",
      });
    }

    const sectionBAttemptLimit =
      paper?.sectionBAttemptLimit ?? attempt.spec?.sectionBAttemptLimit ?? null;

    const result = markPaper(questions, attempt.responses || {}, {
      totalMarks: attempt.totalMarks,
      sectionBAttemptLimit,
      durationMinutes: paper?.durationMinutes ?? attempt.spec?.durationMinutes ?? null,
      timeTakenSeconds: attempt.timeTakenSeconds,
    });

    const standings = await percentilesFor([attempt]);

    res.json({
      success: true,
      data: {
        attempt: {
          ...attempt,
          // Sent as its own field rather than folded into the attempt, so a
          // client can tell "no percentile yet" from "percentile of zero".
          ...(standings.get(attempt.id) ?? {}),
        },
        // Shaped exactly like the live player's paper so the review screen can
        // render a saved sitting and a just-submitted one with one component.
        paper: paper ?? {
          id: attempt.paperId,
          examCode: attempt.examCode,
          examName: attempt.examName,
          year: attempt.year,
          dateLabel: attempt.dateLabel,
          shiftLabel: attempt.shiftLabel,
          sessionLabel: attempt.sessionLabel,
          durationMinutes: attempt.spec?.durationMinutes ?? null,
          totalQuestions: questions.length,
          totalMarks: attempt.totalMarks,
          sectionBAttemptLimit,
          subjectCounts: questions.reduce((acc, q) => {
            acc[q.subject] = (acc[q.subject] || 0) + 1;
            return acc;
          }, {}),
        },
        questions,
        result,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* --------------------- pattern derived from real PYQs -------------------- */

/**
 * Exposed so the UI can show what the AI paper will be based on before the
 * candidate spends a generation on it. The statistics themselves are computed
 * in src/lib/pyqPattern.js — in SQL, for zero tokens.
 */
export const getPyqPattern = async (req, res) => {
  try {
    const examCode = resolvePyqExamCode(req.params.examCode);
    const profile = examCode ? await buildPyqProfile(examCode) : null;
    if (!profile) {
      return res.status(404).json({
        error: "No previous year questions stored for this exam yet",
        canRequest: !examCode,
      });
    }
    res.json({ success: true, data: { profile, brief: profileToBrief(profile) } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* --------------------------- course requests ---------------------------- */

export const createCourseRequest = async (req, res) => {
  try {
    const examName = String(req.body.examName || "").trim();
    if (examName.length < 2) return res.status(400).json({ error: "Please name the exam" });

    const existing = await prisma.courseRequest.findFirst({
      where: { examName: { equals: examName, mode: "insensitive" }, status: "open" },
    });

    // Repeat asks bump the vote instead of creating duplicates, so the backlog
    // is ordered by real demand.
    const record = existing
      ? await prisma.courseRequest.update({ where: { id: existing.id }, data: { votes: { increment: 1 } } })
      : await prisma.courseRequest.create({
          data: {
            examName,
            email: req.body.email || null,
            note: req.body.note || null,
            userId: req.userId || null,
          },
        });

    res.json({ success: true, data: { id: record.id, examName: record.examName, votes: record.votes } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const listCourseRequests = async (req, res) => {
  if (!process.env.Secret_Token || req.headers["x-admin-token"] !== process.env.Secret_Token) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const rows = await prisma.courseRequest.findMany({ orderBy: [{ votes: "desc" }, { createdAt: "desc" }], take: 200 });
  res.json({ success: true, data: rows });
};
