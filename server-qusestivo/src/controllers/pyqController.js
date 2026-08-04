import prisma from "../prismaClient.js";
import { chat, ROLES } from "../lib/aiClient.js";
import { PYQ_EXAMS, resolvePyqExamCode, profileToBrief } from "../lib/pyqPattern.js";
import { buildPyqProfile } from "../lib/pyqProfile.js";

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
    const { examCode: raw, year, subject, session, page = 1, pageSize = 20 } = req.query;
    const examCode = resolvePyqExamCode(raw);
    if (!examCode) {
      // Not an exam we carry PYQs for. 404 rather than an empty 200 so the UI
      // can route the visitor to the course request form.
      return res.status(404).json({ error: "No previous year questions for this exam", canRequest: true });
    }

    const where = { examCode };
    if (year) where.year = Number(year);
    if (subject) where.subject = subject;
    if (session) where.session = session;
    // Chapter is how candidates actually revise — one chapter at a time,
    // across every year — so it is a first-class filter, not a sub-filter of
    // year.
    if (req.query.topic) where.topic = req.query.topic;

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

    const grouped = await prisma.previousYearQuestion.groupBy({
      by: ["subject", "topic"],
      where: { examCode, topic: { not: null } },
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
      years: [...e.years.values()]
        .sort((a, b) => b.year - a.year)
        .map((y) => ({
          year: y.year,
          sessions: [...y.sessions.values()].sort(
            (a, b) => (a.sessionNumber ?? 0) - (b.sessionNumber ?? 0)
          ),
        })),
    }));

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
      select: {
        id: true, paperQuestionNumber: true, questionNumber: true, subject: true, section: true,
        chapter: true, correctAnswer: true, questionType: true, status: true,
        marksCorrect: true, marksIncorrect: true, solution: true, solutionQuality: true, solutionImage: true,
      },
    });
    if (!questions.length) return res.status(404).json({ error: "This paper has no questions stored" });

    const result = markPaper(questions, responses, {
      totalMarks: paper.totalMarks,
      sectionBAttemptLimit: paper.sectionBAttemptLimit,
      durationMinutes: paper.durationMinutes,
      timeTakenSeconds: Number(req.body?.timeTakenSeconds) || null,
    });

    // Record the sitting for a signed-in candidate.
    //
    // Deliberately after the result is computed and deliberately not awaited
    // into the response path: a candidate who has just spent three hours on a
    // paper must get their score even if the write fails, so a storage problem
    // degrades to "not in your history" rather than "your paper is lost".
    let attemptId = null;
    if (req.userId) {
      try {
        const attempt = await prisma.pyqAttempt.create({
          data: {
            userId: req.userId,
            paperId: paper.id,
            examCode: paper.examCode,
            examName: paper.examName,
            year: paper.year,
            label: [paper.sessionLabel, paper.dateLabel, paper.shiftLabel].filter(Boolean).join(" · "),
            score: Math.round(result.score),
            totalMarks: paper.totalMarks,
            percent: paper.totalMarks
              ? Math.round((result.score / paper.totalMarks) * 100)
              : 0,
            correct: result.correct ?? 0,
            wrong: result.wrong ?? 0,
            unattempted: result.unattempted ?? 0,
            timeTakenSeconds: Number(req.body?.timeTakenSeconds) || null,
            responses,
          },
          select: { id: true },
        });
        attemptId = attempt.id;
      } catch (e) {
        console.warn(`[pyq] could not record attempt for ${paper.id}: ${e.message}`);
      }
    }

    res.json({ success: true, data: { paperId: paper.id, attemptId, ...result } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** Numerical answers match on value, not on string — "6" equals "6.00". */
function numericallyEqual(a, b) {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  // The papers are keyed to 2dp at most, so this tolerance only absorbs float
  // representation, never a genuinely different answer.
  return Math.abs(x - y) < 0.005;
}

/**
 * Mark a set of questions against the stored key.
 *
 * Shared by the real-paper and generated-paper scorers so the two can never
 * drift — a practice paper that marked differently from the archive would make
 * its score meaningless as a comparison.
 */
function markPaper(questions, responses, opts = {}) {
  const given = (id) => {
    const v = responses[id];
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
    } else if (!counted.has(q.id)) {
      verdict = "not_counted";
    } else if (answer === null) {
      verdict = "unattempted";
    } else if (
      q.questionType === "numerical" || q.questionType === "integer"
        ? numericallyEqual(answer, q.correctAnswer)
        : answer.toUpperCase() === String(q.correctAnswer || "").toUpperCase()
    ) {
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

/* ──────────────── a fresh paper built from the question bank ───────────────
 *
 * The other way to get a paper. Instead of sitting one specific shift, draw a
 * new paper from every previous year question we hold, following the real
 * exam's shape — 20 MCQ + 10 numerical per subject, 180 minutes, +4/−1.
 *
 * Costs nothing and takes no model call, which is the point: the AI generator
 * writes new questions and is slow and metered, whereas this is a database
 * read over questions that were actually examined.
 */

/** Exam shape. Same numbers the real paper uses. */
const PRACTICE_PATTERN = {
  JEE_MAIN: {
    subjects: ["Physics", "Chemistry", "Mathematics"],
    sectionA: 20,
    sectionB: 10,
    sectionBAttemptLimit: 5,
    durationMinutes: 180,
    marksCorrect: 4,
    marksIncorrect: -1,
  },
};

/** Fisher–Yates, so the draw is uniform rather than sort-comparator folklore. */
function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const generatePracticePaper = async (req, res) => {
  try {
    const examCode = resolvePyqExamCode(req.query.examCode || req.body?.examCode || "JEE_MAIN");
    const pattern = PRACTICE_PATTERN[examCode];
    if (!pattern) {
      return res.status(404).json({ error: "No practice pattern for this exam yet", canRequest: true });
    }

    const years = String(req.query.years || req.body?.years || "")
      .split(",")
      .map((y) => Number(y.trim()))
      .filter(Boolean);

    const questions = [];
    let paperNumber = 0;

    for (const subject of pattern.subjects) {
      for (const [section, want] of [["A", pattern.sectionA], ["B", pattern.sectionB]]) {
        // needsFigure rows are excluded: their text alone is not answerable, and
        // a practice paper has no scan to fall back on the way a real shift does.
        const pool = await prisma.previousYearQuestion.findMany({
          where: {
            examCode,
            subject,
            section,
            needsFigure: false,
            status: "ok",
            correctAnswer: { not: null },
            ...(years.length ? { year: { in: years } } : {}),
          },
          select: {
            id: true, subject: true, section: true, chapter: true, year: true,
            questionText: true, optionA: true, optionB: true, optionC: true, optionD: true,
            questionType: true, diagramSvg: true, diagramImage: true, sourceUrl: true,
            questionImage: true, optionAImage: true, optionBImage: true,
            optionCImage: true, optionDImage: true,
          },
        });

        if (pool.length < want) {
          return res.status(409).json({
            error:
              `Not enough ${subject} Section ${section} questions to build a paper ` +
              `(${pool.length} available, ${want} needed).`,
          });
        }

        for (const q of shuffle(pool).slice(0, want)) {
          questions.push({
            ...q,
            paperQuestionNumber: ++paperNumber,
            questionNumber: ((paperNumber - 1) % 30) + 1,
            marksCorrect: pattern.marksCorrect,
            marksIncorrect: pattern.marksIncorrect,
            status: "ok",
            needsFigure: false,
            figureHint: null,
          });
        }
      }
    }

    const total = pattern.subjects.length * (pattern.sectionA + pattern.sectionBAttemptLimit);

    res.json({
      success: true,
      data: {
        paper: {
          id: "practice",
          examCode,
          examName: PYQ_EXAMS[examCode]?.label || examCode,
          stream: "B.E./B.Tech",
          year: new Date().getFullYear(),
          dateLabel: "Practice paper",
          shiftLabel: "Built from previous year questions",
          shiftTime: null,
          sessionLabel: null,
          durationMinutes: pattern.durationMinutes,
          totalQuestions: questions.length,
          totalMarks: total * pattern.marksCorrect,
          marksCorrect: pattern.marksCorrect,
          marksIncorrect: pattern.marksIncorrect,
          sectionBAttemptLimit: pattern.sectionBAttemptLimit,
          subjectCounts: Object.fromEntries(
            pattern.subjects.map((s) => [s, pattern.sectionA + pattern.sectionB])
          ),
          needsFigureCount: 0,
          languages: ["en"],
        },
        questions,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Score an arbitrary set of questions.
 *
 * A generated paper has no PyqPaper row to score against, so the client sends
 * the ids it was served and the marking is done against those. The answer key
 * is still read from the database and never from the request — the client is
 * trusted for WHICH questions it saw, never for what the right answers were.
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
      select: {
        id: true, subject: true, section: true, chapter: true, correctAnswer: true,
        questionType: true, status: true, marksCorrect: true, marksIncorrect: true,
        solution: true, solutionQuality: true, solutionImage: true,
      },
    });

    // Preserve the order the candidate saw, which is what the Section B limit
    // and the review list are both indexed by.
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean);

    const limit = Number(req.body?.sectionBAttemptLimit) || null;
    const result = markPaper(ordered, responses, {
      totalMarks: Number(req.body?.totalMarks) || null,
      sectionBAttemptLimit: limit,
      durationMinutes: Number(req.body?.durationMinutes) || null,
      timeTakenSeconds: Number(req.body?.timeTakenSeconds) || null,
    });

    res.json({ success: true, data: { paperId: "practice", ...result } });
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
