import prisma from "../prismaClient.js";

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

// --- ✅ NEW UPDATE FUNCTION ---
export const updateProfile = async (req, res) => {
  const userId = req.userId;
  const { name, bio, photoUrl, preferredMedium } = req.body;

  try {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        // Sirf wahi update hoga jo frontend se aayega
        ...(name && { name }),
        ...(bio && { bio }),
        ...(photoUrl && { photoUrl }),
        ...(preferredMedium && { preferredMedium }),
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