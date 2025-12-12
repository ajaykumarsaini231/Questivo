import { Router } from "express";
import {
  getAllExamCategories,
  getExamCategory,
  createExamCategory,
  updateExamCategory,
  deactivateExamCategory,
} from "../controllers/categoryController.js";

const router = Router();

// GET /api/exam-categories?includeTopics=true
router.get("/exam-categories", getAllExamCategories);

// GET /api/exam-categories/:codeOrId
router.get("/exam-categories/:codeOrId", getExamCategory);

// POST /api/exam-categories
router.post("/exam-categories", createExamCategory);

// PUT /api/exam-categories/:id
router.put("/exam-categories/:id", updateExamCategory);

// PATCH /api/exam-categories/:id/deactivate
router.patch("/exam-categories/:id/deactivate", deactivateExamCategory);

export default router;
