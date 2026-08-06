import prisma from "../prismaClient.js";
import { profileUpdateSchema } from "../middleware/validator.js";

/**
 * Which history bucket a TestSession belongs to.
 *
 * TestSession.sessionType records how the paper was BUILT — "mock", "practice"
 * or "pyq" — and all three are papers the candidate configured themselves on
 * the generate screen. They are one category to a reader: a mock test they
 * made. The other two categories live in PyqAttempt and are told apart by its
 * `kind`, so nothing here has to guess.
 */
const MOCK_KIND = "mock";

// --- GET PROFILE ---
export const getMyProfile = async (req, res) => {
  const userId = req.userId;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      authProvider: true,
      preferredMedium: true,
      createdAt: true,
      // ✅ Ye do fields add kiye taaki frontend pe dikhe
      bio: true,
      photoUrl: true,
      // The chosen track. Read on every profile load so the browser can be
      // corrected from the account rather than the other way round.
      audienceId: true,
      focusExam: true,
    },
  });

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  // --- STATS CALCULATION (Same as before) ---
  const sessions = await prisma.testSession.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      questions: true,
      answers: true,
    },
  });

  let attemptedTests = 0;
  let bestScore = 0;
  let totalScore = 0;

  const mockTests = sessions.map((s) => {
    const totalQ = s.questions.length;
    const correct = s.answers.filter((a) => a.isCorrect).length;

    let score = null;
    if (s.answers.length > 0) {
      attemptedTests++;
      score = totalQ ? Math.round((correct / totalQ) * 100) : 0;
      bestScore = Math.max(bestScore, score);
      totalScore += score;
    }

    return {
      id: s.id,
      // The row's own identifier for the two things the UI does with it:
      // reopen the result, and retake. Both route by session id.
      sessionId: s.id,
      kind: MOCK_KIND,
      examType: s.examType,
      examName: s.examType,
      medium: user.preferredMedium,
      createdAt: s.createdAt,
      scorePercent: score,
      correct,
      totalQuestions: totalQ || s.numQuestions || 0,
      difficulty: s.difficulty,
      /// "mock" | "practice" | "pyq" — how the questions were sourced. Kept
      /// because it is the difference between an AI paper and one assembled
      /// from stored previous year questions, and the row should say which.
      sourceType: s.sessionType,
      durationMinutes: s.durationMinutes ?? null,
      status: s.answers.length > 0 ? "Completed" : "Not attempted",
    };
  });

  // Papers sat through the PYQ player — real shifts and generated mocks alike.
  //
  // These live in their own table, not TestSession: a mock test OWNS its
  // questions because they exist nowhere else, while a previous year paper's
  // questions are shared archive rows. So the history has to read both, or a
  // candidate who has only ever sat real papers sees an empty list and
  // "0 tests attempted" — which is exactly what happened, and is the bug this
  // endpoint existed to cause.
  const attempts = await prisma.pyqAttempt.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true, kind: true, paperId: true, examCode: true, examName: true, year: true,
      label: true, sessionLabel: true, dateLabel: true, shiftLabel: true, subject: true,
      score: true, totalMarks: true, percent: true, correct: true, wrong: true,
      unattempted: true, totalQuestions: true, timeTakenSeconds: true, createdAt: true,
    },
  });

  for (const a of attempts) {
    attemptedTests++;
    bestScore = Math.max(bestScore, a.percent);
    totalScore += a.percent;
  }

  const toAttemptRow = (a) => ({
    ...a,
    // Reviewing a saved sitting routes by attempt id, not session id — a PYQ
    // attempt has no TestSession, and sending it to /tests/:id/result was why
    // the "view result" button 404ed for every real paper.
    attemptId: a.id,
    sessionId: a.id,
    examType: [a.examName, a.year].filter(Boolean).join(" "),
    medium: user.preferredMedium,
    scorePercent: a.percent,
    status: "Completed",
  });

  const pyqTests = attempts.filter((a) => a.kind === "pyq").map(toAttemptRow);
  const generatedTests = attempts.filter((a) => a.kind === "generated").map(toAttemptRow);

  // One list, newest first, regardless of which flow produced the attempt.
  const allTests = [...mockTests, ...pyqTests, ...generatedTests].sort(
    (x, y) => new Date(y.createdAt) - new Date(x.createdAt)
  );

  const avgScore =
    attemptedTests > 0 ? Math.round(totalScore / attemptedTests) : 0;

  return res.json({
    success: true,
    user,
    stats: {
      totalTests: sessions.length + attempts.length,
      attemptedTests,
      avgScore,
      bestScore,
      // The profile's stat tiles read these names. They used to read
      // `totalGenerated` and `averageScore` against a payload that only ever
      // sent `totalTests` and `avgScore`, so both tiles rendered 0 for every
      // user however many tests they had taken. Both spellings are sent rather
      // than renaming one side, because the /api/auth/stats endpoint answers in
      // the other vocabulary and either could reach this page.
      totalGenerated: sessions.length,
      averageScore: avgScore,
      papersSat: attempts.length,
    },
    // The three categories the history page files tests under, pre-split so
    // each tab filters, sorts and searches its own list independently.
    history: {
      pyq: pyqTests,
      mock: mockTests,
      generated: generatedTests,
    },
    recentTests: allTests.slice(0, 20),
  });
};

/**
 * Tracks a candidate may be on. Mirrors questivo/src/lib/audience.ts.
 *
 * Validated rather than trusted: an unrecognised value stored here would match
 * no track on the client, and the exam list would filter down to nothing — a
 * user locked out of every exam on the site by a typo in a request body.
 */
const AUDIENCE_IDS = ["jee-neet", "government", "college"];

// --- ✅ NEW UPDATE FUNCTION ---
export const updateProfile = async (req, res) => {
  const userId = req.userId;
  const { audienceId, focusExam } = req.body ?? {};

  /**
   * name, bio, photoUrl and preferredMedium are checked before they are stored.
   *
   * They were not. audienceId was validated against a fixed list — carefully —
   * while the four beside it went to the database exactly as they arrived: no
   * maximum length on the name or the bio, and no requirement that photoUrl be
   * a URL. photoUrl is the one that mattered: it is rendered as the src of the
   * avatar in the header, so it is an attribute the browser acts on, and
   * "any string at all" is the wrong type for that. See profileUpdateSchema.
   */
  const { value, error } = profileUpdateSchema.validate(req.body ?? {});
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });

  const { name, bio, photoUrl, preferredMedium } = value;

  // Explicit null is how the profile clears a track back to "not chosen", so
  // presence has to be tested rather than truthiness — `...(audienceId && {})`
  // would silently ignore every attempt to reset it.
  if (audienceId !== undefined && audienceId !== null && !AUDIENCE_IDS.includes(audienceId)) {
    return res.status(400).json({
      success: false,
      message: `Unknown track. Expected one of: ${AUDIENCE_IDS.join(", ")}.`,
    });
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        // Sirf wahi update hoga jo frontend se aayega
        ...(name && { name }),
        ...(bio && { bio }),
        ...(photoUrl && { photoUrl }),
        ...(preferredMedium && { preferredMedium }),
        ...(audienceId !== undefined && { audienceId }),
        ...(focusExam !== undefined && { focusExam }),
      },
      select: {
        id: true, name: true, email: true, authProvider: true, preferredMedium: true,
        bio: true, photoUrl: true, audienceId: true, focusExam: true, createdAt: true,
      },
    });

    res.json({
        success: true,
        message: "Profile updated successfully!",
        user: updatedUser
    });
  } catch (error) {
    console.error("Update Error:", error);
    res.status(500).json({ success: false, message: "Failed to update profile" });
  }
};