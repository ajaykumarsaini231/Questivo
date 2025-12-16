import prisma from "../prismaClient.js"; 
import { generateQuestionsAgent } from "../agentic-mock-test/questionGenerator.js";

// POST /api/tests/generate
export async function generateTest(req, res) {
  try {
     const userId = req.userId; 
    //  console.log(userId)
    // 1. Extract raw body into normal let variables
    let examType = req.body.examType || "SSC CGL Tier 1";
    let topics = req.body.topics || ["Percentage", "Ratio and Proportion"];
    let numQuestions = req.body.numQuestions || 10;
    let difficulty = req.body.difficulty || "mixed";
    let sessionType = req.body.sessionType || "practice";

    // optional medium (language) — only forward if provided
    let medium = undefined;
    if (req.body.medium) {
      medium = String(req.body.medium).trim();
    }

    // 2. Convert topics (string → array for urlencoded)
    if (typeof topics === "string") {
      try {
        topics = JSON.parse(topics); // For '["A","B"]'
      } catch {
        topics = topics
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      }
    }

    // 3. Convert numQuestions (string → number)
    numQuestions = Number(numQuestions) || 10;

    // 4. Validation
    if (!Array.isArray(topics) || topics.length === 0) {
      return res.status(400).json({
        success: false,
        error: "topics[] is required and must be non-empty",
      });
    }

    // 5. Generate questions using Agentic AI
    const agentArgs = {
      examType,
      topics,
      numQuestions,
      difficulty,
      sessionType,
    };
    // forward medium only if provided by client
    if (medium) agentArgs.medium = medium;

    const questions = await generateQuestionsAgent(agentArgs);

    // ----- NEW: parse & normalize duration (accept: minutes or hours) -----
    // Accepts: durationMinutes (preferred), durationHours (e.g. 1.5), or generic duration
    let durationMinutes = null;
    try {
      if (req.body.durationMinutes != null) {
        const dm = Number(req.body.durationMinutes);
        if (!Number.isNaN(dm) && dm > 0) durationMinutes = Math.round(dm);
      } else if (req.body.durationHours != null) {
        const dh = Number(req.body.durationHours);
        if (!Number.isNaN(dh) && dh > 0) durationMinutes = Math.round(dh * 60);
      } else if (req.body.duration != null) {
        // Heuristic: if value > 24 treat as minutes (unlikely for hours); otherwise treat as hours if fractional
        const d = Number(req.body.duration);
        if (!Number.isNaN(d) && d > 0) {
          durationMinutes = d > 24 ? Math.round(d) : Math.round(d * 60);
        }
      }
    } catch (e) {
      // if parsing fails, ignore and leave durationMinutes null so default applies
      durationMinutes = null;
    }

    // 6. Create session (include durationMinutes if parsed)

    const sessionData = {
      examType,
      difficulty,
      sessionType,
      numQuestions: questions.length,
      userId, 
    };

    if (durationMinutes != null) {
      sessionData.durationMinutes = durationMinutes;
    }

    const session = await prisma.testSession.create({
      data: sessionData,
    });

    // 7. Insert questions
    const questionData = questions.map((q, idx) => ({
      sessionId: session.id,
      indexInSession: idx + 1,
      examType: q.exam_type,
      topic: q.topic,
      difficulty: q.difficulty,
      questionText: q.question_text,
      optionA: q.option_a,
      optionB: q.option_b,
      optionC: q.option_c,
      optionD: q.option_d,
      correctOption: q.correct_option,
      explanation: q.explanation || "",
    }));

    await prisma.testQuestion.createMany({ data: questionData });

    // 8. Return saved questions
    const savedQuestions = await prisma.testQuestion.findMany({
      where: { sessionId: session.id },
      orderBy: { indexInSession: "asc" },
      select: {
        id: true,
        indexInSession: true,
        examType: true,
        topic: true,
        difficulty: true,
        questionText: true,
        optionA: true,
        optionB: true,
        optionC: true,
        optionD: true,
      },
    });

    return res.json({
      success: true,
      sessionId: session.id,
      count: savedQuestions.length,
      // questions: savedQuestions,
    });
  } catch (err) {
    console.error("Error in generateTest:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}


// GET /api/tests/:sessionId
export async function getTest(req, res) {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ success: false, error: "Missing sessionId param" });
    }

    const maybeInt = Number(sessionId);
    const useNumeric = !Number.isNaN(maybeInt) && String(maybeInt) === sessionId;

    const whereForSession = useNumeric ? { id: maybeInt } : { id: sessionId };

    const session = await prisma.testSession.findUnique({
      where: whereForSession,
    });

    if (!session) {
      return res.status(404).json({ success: false, error: "Session not found" });
    }

    const whereForQuestions = useNumeric ? { sessionId: maybeInt } : { sessionId: session.id };

    const questions = await prisma.testQuestion.findMany({
      where: whereForQuestions,
      orderBy: { indexInSession: "asc" },
      select: {
        id: true,
        indexInSession: true,
        examType: true,
        topic: true,
        difficulty: true,
        questionText: true,
        optionA: true,
        optionB: true,
        optionC: true,
        optionD: true,
      },
    });

    return res.json({
      success: true,
      session,
      questions,
      meta: {
        durationMinutes: session.durationMinutes ?? 60, // <-- only required change
      },
    });

  } catch (err) {
    console.error("Error in getTest:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}



export async function submitTest(req, res) {
  try {
    const { sessionId } = req.params;
    if (!sessionId)
      return res.status(400).json({ success: false, error: "Missing sessionId param" });

    // detect numeric vs uuid-like
    const maybeNum = Number(sessionId);
    const useNumeric = !Number.isNaN(maybeNum) && String(maybeNum) === sessionId;
    const sessionWhere = useNumeric ? { id: maybeNum } : { id: sessionId };

    const session = await prisma.testSession.findUnique({ where: sessionWhere });
    if (!session)
      return res.status(404).json({ success: false, error: "Session not found" });

    const sessionIdForQuery = session.id;

    const rawAnswers =
      req.body && Array.isArray(req.body.answers) ? req.body.answers : [];

    // Fetch only questionId + correctOption for marking
    const questions = await prisma.testQuestion.findMany({
      where: { sessionId: sessionIdForQuery },
      select: { id: true, correctOption: true },
    });

    if (!questions || questions.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "No questions found for this session" });
    }

    // Map for correctness check
    const correctMap = new Map(
      questions.map((q) => [String(q.id), String(q.correctOption).toUpperCase()])
    );

    let attempted = 0;
    let correctCount = 0;
    const upserts = [];

    for (const a of rawAnswers) {
      if (!a) continue;

      const qidRaw = a.questionId ?? a.qid;
      if (!qidRaw) continue;

      const qid = String(qidRaw);
      if (!correctMap.has(qid)) continue;

      const selected = String(a.selectedOption ?? a.selected ?? "").toUpperCase();
      if (!selected) continue;

      attempted++;
      const isCorrect = selected === correctMap.get(qid);
      if (isCorrect) correctCount++;

      // Upsert using composite unique
      upserts.push(
        prisma.testAnswer.upsert({
          where: {
            sessionId_questionId: {
              sessionId: sessionIdForQuery,
              questionId: qid,
            },
          },
          update: {
            selectedOption: selected,
            isCorrect,
            answeredAt: new Date(),
          },
          create: {
            sessionId: sessionIdForQuery,
            questionId: qid,
            selectedOption: selected,
            isCorrect,
          },
        })
      );
    }

    if (upserts.length > 0) {
      await prisma.$transaction(upserts);
    }

    const totalQuestions = questions.length;
    const scorePercent = totalQuestions
      ? Math.round((correctCount / totalQuestions) * 100)
      : 0;

    return res.json({
      success: true,
      message: "Submission recorded",
      totalQuestions,
      attempted,
      correct: correctCount,
      scorePercent,
      // breakdown is NOT returned here anymore
      // frontend will call GET /api/tests/:sessionId/result
    });
  } catch (err) {
    console.error("Error in submitTest:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/tests/:sessionId/questions/:index
export async function getQuestionByIndex(req, res) {
  try {
    const { sessionId, index } = req.params;
    console.log("getQuestionByIndex req.params:", req.params);

    if (!sessionId || index == null) {
      return res.status(400).json({ success: false, error: "Missing sessionId or index" });
    }

    // parse index and require integer
    const indexNum = Number(index);
    if (!Number.isFinite(indexNum) || !Number.isInteger(indexNum)) {
      return res.status(400).json({ success: false, error: "Index must be an integer" });
    }

    // detect numeric id vs uuid string
    const maybeNum = Number(sessionId);
    const useNumeric = !Number.isNaN(maybeNum) && String(maybeNum) === sessionId;
    const sessionWhere = useNumeric ? { id: maybeNum } : { id: sessionId };

    // confirm session exists
    const session = await prisma.testSession.findUnique({ where: sessionWhere });
    if (!session) {
      console.log("Session not found for where:", sessionWhere);
      return res.status(404).json({ success: false, error: "Session not found" });
    }
    console.log("Found session.id (type):", session.id, typeof session.id);

    const sessionIdForQuery = useNumeric ? maybeNum : session.id;

    // get total questions quickly
    const totalQuestions = await prisma.testQuestion.count({ where: { sessionId: sessionIdForQuery } });
    console.log("totalQuestions:", totalQuestions);

    if (totalQuestions === 0) {
      return res.status(404).json({ success: false, error: "No questions for this session" });
    }

    if (indexNum < 0 || indexNum > totalQuestions + 1) {
      // loose upper bound; we will check exact later
      return res.status(400).json({ success: false, error: "Index out of sensible range" });
    }

    // Try the provided index first (assume user passed the correct convention)
    let question = await prisma.testQuestion.findFirst({
      where: {
        sessionId: sessionIdForQuery,
        indexInSession: indexNum,
      },
      select: {
        id: true,
        indexInSession: true,
        examType: true,
        topic: true,
        difficulty: true,
        questionText: true,
        optionA: true,
        optionB: true,
        optionC: true,
        optionD: true,
      },
    });

    // If not found, try the alternate convention (fallback: index-1), useful when DB is zero-based but client used 1-based
    if (!question) {
      const altIndex = indexNum - 1;
      if (altIndex >= 0) {
        console.log(`Question not found for index ${indexNum}, trying altIndex ${altIndex}`);
        question = await prisma.testQuestion.findFirst({
          where: {
            sessionId: sessionIdForQuery,
            indexInSession: altIndex,
          },
          select: {
            id: true,
            indexInSession: true,
            examType: true,
            topic: true,
            difficulty: true,
            questionText: true,
            optionA: true,
            optionB: true,
            optionC: true,
            optionD: true,
          },
        });
        if (question) {
          console.log(`Found question using altIndex ${altIndex}`);
        }
      }
    }

    if (!question) {
      // helpful diagnostic: return a small sample of indices present (so you can see convention)
      const sample = await prisma.testQuestion.findMany({
        where: { sessionId: sessionIdForQuery },
        orderBy: { indexInSession: "asc" },
        take: 10,
        select: { id: true, indexInSession: true },
      });
      console.log("Sample question indices:", sample);
      return res.status(404).json({ success: false, error: "Question not found", diagnostic: { totalQuestions, sample } });
    }

    return res.json({
      success: true,
      question,
      meta: { requestedIndex: indexNum, returnedIndex: question.indexInSession, totalQuestions },
    });
  } catch (err) {
    console.error("Error in getQuestionByIndex:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}


// GET /api/tests/:sessionId/result
export async function getTestResult(req, res) {
  try {
    const { sessionId } = req.params;
    if (!sessionId) return res.status(400).json({ success: false, error: "Missing sessionId" });

    const maybeNum = Number(sessionId);
    const useNumeric = !Number.isNaN(maybeNum) && String(maybeNum) === sessionId;
    const sessionWhere = useNumeric ? { id: maybeNum } : { id: sessionId };

    const session = await prisma.testSession.findUnique({ where: sessionWhere });
    if (!session) return res.status(404).json({ success: false, error: "Session not found" });

    const sessionIdForQuery = session.id;

    const questions = await prisma.testQuestion.findMany({
      where: { sessionId: sessionIdForQuery },
      orderBy: { indexInSession: "asc" },
      select: {
        id: true,
        indexInSession: true,
        questionText: true,
        optionA: true,
        optionB: true,
        optionC: true,
        optionD: true,
        correctOption: true,
        explanation: true,
      },
    });

    const answers = await prisma.testAnswer.findMany({
      where: { sessionId: sessionIdForQuery },
      select: { questionId: true, selectedOption: true, isCorrect: true, answeredAt: true },
    });
    const aMap = new Map(answers.map((a) => [String(a.questionId), a]));

    const breakdown = questions.map((q) => {
      const a = aMap.get(String(q.id));
      return {
        questionId: q.id,
        indexInSession: q.indexInSession,
        questionText: q.questionText,
        options: { A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD },
        selectedOption: a ? a.selectedOption : null,
        correctOption: q.correctOption,
        isCorrect: a ? a.isCorrect : false,
        explanation: q.explanation ?? null,
        answeredAt: a ? a.answeredAt : null,
      };
    });

    const total = breakdown.length;
    const attempted = answers.length;
    const correct = answers.filter((x) => x.isCorrect).length;
    const scorePercent = total ? Math.round((correct / total) * 100) : 0;

    return res.json({ success: true, total, attempted, correct, scorePercent, breakdown });
  } catch (err) {
    console.error("Error in getTestResult:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/tests/my
export async function getMyTests(req, res) {
  try {
    const userId = req.userId; // from protect middleware

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Not authenticated",
      });
    }

    const sessions = await prisma.testSession.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        examType: true,
        difficulty: true,
        sessionType: true,
        numQuestions: true,
        durationMinutes: true,
        createdAt: true,

        // quick stats
        questions: {
          select: { id: true },
        },
        answers: {
          select: { isCorrect: true },
        },
      },
    });

    const formatted = sessions.map((s) => {
      const attempted = s.answers.length;
      const correct = s.answers.filter((a) => a.isCorrect).length;
      const total = s.questions.length;
      const scorePercent = total
        ? Math.round((correct / total) * 100)
        : 0;

      return {
        sessionId: s.id,
        examType: s.examType,
        difficulty: s.difficulty,
        sessionType: s.sessionType,
        numQuestions: s.numQuestions,
        durationMinutes: s.durationMinutes ?? 60,
        createdAt: s.createdAt,

        attempted,
        correct,
        scorePercent,
      };
    });

    return res.json({
      success: true,
      tests: formatted,
    });
  } catch (err) {
    console.error("Error in getMyTests:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch user tests",
    });
  }
}



