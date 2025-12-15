// controllers/userController.js
import prisma from "../prismaClient.js";

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
    },
  });

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

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

  const recentTests = sessions.map((s) => {
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
      sessionId: s.id,
      examType: s.examType,
      medium: user.preferredMedium,
      createdAt: s.createdAt,
      scorePercent: score,
    };
  });

  const avgScore =
    attemptedTests > 0 ? Math.round(totalScore / attemptedTests) : 0;

  return res.json({
    success: true,
    user,
    stats: {
      totalTests: sessions.length,
      attemptedTests,
      avgScore,
      bestScore,
    },
    recentTests: recentTests.slice(0, 5),
  });
};

/* ===== Update Preferred Medium ===== */
export const updateMedium = async (req, res) => {
  const { medium } = req.body;

  await prisma.user.update({
    where: { id: req.userId },
    data: { preferredMedium: medium },
  });

  res.json({ success: true });
};
