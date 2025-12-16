import { Router } from "express";
import {
  getAllTopics,
  getTopicsForExam,
  createTopicForExam,
  updateTopic,
  deactivateTopic,
} from "../controllers/topicController.js";

const router = Router();

// GET /api/topics?examCode=...&examId=...
router.get("/topics", getAllTopics);

// GET /api/exam-categories/:codeOrId/topics
router.get("/exam-categories/:codeOrId/topics", getTopicsForExam);

// POST /api/exam-categories/:examId/topics
router.post("/exam-categories/:examId/topics", createTopicForExam);

// PUT /api/topics/:id
router.put("/topics/:id", updateTopic);

// PATCH /api/topics/:id/deactivate
router.patch("/topics/:id/deactivate", deactivateTopic);

export default router;
