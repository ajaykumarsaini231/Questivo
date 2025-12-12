// src/routes/testRoutes.js
import express from "express";
import {
  generateTest,
  getTest,
  submitTest,
  getQuestionByIndex,
  getTestResult
} from "../controllers/testController.js";

const router = express.Router();

router.post("/tests/generate", generateTest);
router.get("/tests/:sessionId", getTest);
router.get("/tests/:sessionId/questions/:index", getQuestionByIndex);
router.post("/tests/:sessionId/submit", submitTest);
router.get("/tests/:sessionId/result", getTestResult)

export default router;
