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
// Two switches move it: PREMIUM_AI_GENERATION in the environment for everyone,
// and a per-account grant an admin sets from Admin → Users. See
// lib/entitlements.js.
//
// AFTER `protect`, and that order is now load-bearing. It used to be the other
// way round, on the reasoning that whether a feature is for sale does not depend
// on who is asking — true while the switch was all-or-nothing. It is not any
// more: requireEntitlement reads req.user to see the account's grants, so a gate
// running ahead of the sign-in would answer the site-wide "no" to the very users
// who have been granted it. The cost of the flip is that an anonymous caller is
// told to sign in before being told the feature is paid, which is one extra step
// for someone who could not have been granted it anyway.
router.post("/tests/generate", protect, requireEntitlement("aiGeneration"), generateTest);
router.post("/tests/:sessionId/submit", protect, submitTest);
router.get("/tests/my", protect, getMyTests);


/**
 * Reading a session, its questions and its result.
 *
 * These three had no `protect` and no ownership check of their own: the handler
 * looked the session up by id and returned it. A session id is a uuid so it
 * could not be counted through, but ids are not secrets — they sit in the URL
 * bar, in browser history, in a screenshot of a shared screen, in a Referer
 * header on the way to any third-party asset — and anyone holding one could
 * read another candidate's paper, every question in it, and the correct answers.
 *
 * `protect` establishes who is asking; the ownership comparison lives in
 * testController.js next to the query, because that is where the session row
 * with its userId is already in hand.
 */
// router.post("/tests/generate", generateTest);
router.get("/tests/:sessionId", protect, getTest);
router.get("/tests/:sessionId/questions/:index", protect, getQuestionByIndex);
// router.post("/tests/:sessionId/submit", submitTest);
router.get("/tests/:sessionId/result", protect, getTestResult)

export default router;
