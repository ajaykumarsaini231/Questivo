// src/routes/testRoutes.js
import express from "express";
import {
  generateTest,
  getTest,
  submitTest,
  getQuestionByIndex,
  getTestResult,
  getMyTests,
} from "../controllers/testController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/tests/generate", protect, generateTest);
router.post("/tests/:sessionId/submit", protect, submitTest);
router.get("/tests/my", protect, getMyTests);


// router.post("/tests/generate", generateTest);
router.get("/tests/:sessionId", getTest);
router.get("/tests/:sessionId/questions/:index", getQuestionByIndex);
// router.post("/tests/:sessionId/submit", submitTest);
router.get("/tests/:sessionId/result", getTestResult)

export default router;
