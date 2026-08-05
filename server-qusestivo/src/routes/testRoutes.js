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
import { requireEntitlement } from "../lib/entitlements.js";

const router = express.Router();

// Writing a paper with a model is the paid feature, and it is gated HERE
// rather than only in the UI. Every other route in this file reads or writes a
// session that already exists; this is the one that spends money, so a hidden
// button is not a gate — anyone who posted to it directly was served.
//
// Toggle with PREMIUM_AI_GENERATION in the environment; see lib/entitlements.js.
//
// Before `protect`, while the switch is all-or-nothing: whether the feature is
// for sale does not depend on who is asking, and answering 401 first tells a
// visitor to go and sign in only to be told at the second attempt that it is
// paid. When per-user plans arrive this order flips — the entitlement will then
// need req.userId, and the sign-in has to come first.
router.post("/tests/generate", requireEntitlement("aiGeneration"), protect, generateTest);
router.post("/tests/:sessionId/submit", protect, submitTest);
router.get("/tests/my", protect, getMyTests);


// router.post("/tests/generate", generateTest);
router.get("/tests/:sessionId", getTest);
router.get("/tests/:sessionId/questions/:index", getQuestionByIndex);
// router.post("/tests/:sessionId/submit", submitTest);
router.get("/tests/:sessionId/result", getTestResult)

export default router;
