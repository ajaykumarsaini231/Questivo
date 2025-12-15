import prisma from "../prismaClient.js";

/**
 * GET /api/topics
 * Optional ?examCode=NTA_JEE_MAIN_2025 or ?examId=...
 */
export async function getAllTopics(req, res) {
  try {
    const { examCode, examId } = req.query;

    const where = {
      isActive: true,
      ...(examId
        ? { examCategoryId: examId }
        : examCode
        ? { examCategory: { code: examCode } }
        : {}),
    };

    const topics = await prisma.examTopic.findMany({
      where,
      orderBy: { order: "asc" },
      include: {
        examCategory: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    res.json(topics);
  } catch (err) {
    console.error("Error in getAllTopics:", err);
    res.status(500).json({ error: "Failed to fetch topics" });
  }
}

/**
 * GET /api/exam-categories/:codeOrId/topics
 * For frontend: get topics of a specific exam.
 */
export async function getTopicsForExam(req, res) {
  try {
    const { codeOrId } = req.params;

    let exam = await prisma.examCategory.findUnique({
      where: { code: codeOrId },
    });

    if (!exam) {
      exam = await prisma.examCategory.findUnique({
        where: { id: codeOrId },
      });
    }

    if (!exam) {
      return res.status(404).json({ error: "Exam category not found" });
    }

    const topics = await prisma.examTopic.findMany({
      where: {
        examCategoryId: exam.id,
        isActive: true,
      },
      orderBy: { order: "asc" },
    });

    res.json({
      exam: {
        id: exam.id,
        name: exam.name,
        code: exam.code,
      },
      topics,
    });
  } catch (err) {
    console.error("Error in getTopicsForExam:", err);
    res.status(500).json({ error: "Failed to fetch topics for exam" });
  }
}

/**
 * POST /api/exam-categories/:examId/topics
 * Body: { name, code?, order?, isActive? }
 * Again: protect with admin auth in real app.
 */
export async function createTopicForExam(req, res) {
  try {
    const { examId } = req.params;
    const { name, code, order, isActive } = req.body;

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    // Ensure exam exists
    await prisma.examCategory.findUniqueOrThrow({
      where: { id: examId },
    });

    const topic = await prisma.examTopic.create({
      data: {
        examCategoryId: examId,
        name,
        code,
        order: typeof order === "number" ? order : null,
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    res.status(201).json(topic);
  } catch (err) {
    console.error("Error in createTopicForExam:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Exam category not found" });
    }
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Topic with same code already exists" });
    }
    res.status(500).json({ error: "Failed to create topic" });
  }
}

/**
 * PUT /api/topics/:id
 * Body: { name?, code?, order?, isActive? }
 */
export async function updateTopic(req, res) {
  try {
    const { id } = req.params;
    const { name, code, order, isActive } = req.body;

    const topic = await prisma.examTopic.update({
      where: { id },
      data: {
        name,
        code,
        order,
        isActive,
      },
    });

    res.json(topic);
  } catch (err) {
    console.error("Error in updateTopic:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Topic not found" });
    }
    res.status(500).json({ error: "Failed to update topic" });
  }
}

/**
 * PATCH /api/topics/:id/deactivate
 */
export async function deactivateTopic(req, res) {
  try {
    const { id } = req.params;

    const topic = await prisma.examTopic.update({
      where: { id },
      data: { isActive: false },
    });

    res.json(topic);
  } catch (err) {
    console.error("Error in deactivateTopic:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Topic not found" });
    }
    res.status(500).json({ error: "Failed to deactivate topic" });
  }
}
