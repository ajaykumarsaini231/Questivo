import prisma from "../prismaClient.js";

/**
 * GET /api/exam-categories
 * Optional query: ?includeTopics=true
 */
export async function getAllExamCategories(req, res) {
  try {
    const includeTopics = req.query.includeTopics === "true";

    const categories = await prisma.examCategory.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: includeTopics
        ? {
            topics: {
              where: { isActive: true },
              orderBy: { order: "asc" },
            },
          }
        : undefined,
    });

    res.json(categories);
  } catch (err) {
    console.error("Error in getAllExamCategories:", err);
    res.status(500).json({ error: "Failed to fetch exam categories" });
  }
}

/**
 * GET /api/exam-categories/:codeOrId
 * - First tries code
 * - If not found, tries id
 */
export async function getExamCategory(req, res) {
  try {
    const { codeOrId } = req.params;

    let category = await prisma.examCategory.findUnique({
      where: { code: codeOrId },
      include: {
        topics: {
          where: { isActive: true },
          orderBy: { order: "asc" },
        },
      },
    });

    if (!category) {
      category = await prisma.examCategory.findUnique({
        where: { id: codeOrId },
        include: {
          topics: {
            where: { isActive: true },
            orderBy: { order: "asc" },
          },
        },
      });
    }

    if (!category) {
      return res.status(404).json({ error: "Exam category not found" });
    }

    res.json(category);
  } catch (err) {
    console.error("Error in getExamCategory:", err);
    res.status(500).json({ error: "Failed to fetch exam category" });
  }
}

/**
 * POST /api/exam-categories
 * Body: { name, code?, description? }
 * Note: In production, protect this with admin auth.
 */
export async function createExamCategory(req, res) {
  try {
    const { name, code, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const category = await prisma.examCategory.create({
      data: {
        name,
        code,
        description: description || null,
        isActive: true,
      },
    });

    res.status(201).json(category);
  } catch (err) {
    console.error("Error in createExamCategory:", err);
    if (err.code === "P2002") {
      // unique constraint
      return res.status(409).json({ error: "Category with same name or code already exists" });
    }
    res.status(500).json({ error: "Failed to create exam category" });
  }
}

/**
 * PUT /api/exam-categories/:id
 * Body: { name?, code?, description?, isActive? }
 */
export async function updateExamCategory(req, res) {
  try {
    const { id } = req.params;
    const { name, code, description, isActive } = req.body;

    const category = await prisma.examCategory.update({
      where: { id },
      data: {
        name,
        code,
        description,
        isActive,
      },
    });

    res.json(category);
  } catch (err) {
    console.error("Error in updateExamCategory:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Exam category not found" });
    }
    res.status(500).json({ error: "Failed to update exam category" });
  }
}

/**
 * PATCH /api/exam-categories/:id/deactivate
 */
export async function deactivateExamCategory(req, res) {
  try {
    const { id } = req.params;

    const category = await prisma.examCategory.update({
      where: { id },
      data: { isActive: false },
    });

    res.json(category);
  } catch (err) {
    console.error("Error in deactivateExamCategory:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Exam category not found" });
    }
    res.status(500).json({ error: "Failed to deactivate exam category" });
  }
}
