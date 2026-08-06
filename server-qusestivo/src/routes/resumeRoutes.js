import express from "express";
import { uploadAndAnalyzeResume, getAnalysisHistory, getAnalysisById } from "../controllers/resumeController.js";
import { optionalAuth, optionalUser } from "../middleware/optionalAuth.js";
import { resumeUpload, handleUploadErrors } from "../middleware/resumeUpload.js";
import { aiUploadLimiter } from "../middleware/rateLimits.js";
// Import your existing verification middleware context to protect application records
// import { protectAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Size limits and the accepted file types now live in middleware/resumeUpload.js,
// shared with the interview route, which had been configured with no limit at all.

/**
 * optionalAuth, not protect: the analyser stays usable while logged out, but a
 * signed-in user gets the report filed under their own account. Without it the
 * controller had no way to know who the caller was, so every row was stored
 * under one shared fake id and /history returned everyone's reports to everyone.
 *
 * The limiter sits AFTER optionalAuth so it can count against the signed-in
 * user where there is one, and only fall back to the address for anonymous
 * callers — otherwise a campus NAT would share one bucket. It sits BEFORE the
 * upload so a refused caller is turned away without the file being read into
 * memory first. This endpoint reads a file and then pays an AI provider, and
 * it accepts anonymous callers; without a limit it is someone else's free
 * compute.
 */
/**
 * optionalUser, not optionalAuth, on the write.
 *
 * The two differ in one thing: optionalAuth trusts the token's userId, while
 * optionalUser confirms the account still has a row. That distinction does not
 * matter for a read — a deleted user's token filters a history query down to
 * nothing, which is the right answer anyway — but this route PERSISTS a record
 * with `userId` as its owner. Filed against an id with nothing behind it, the
 * row is unreachable by anyone, and every later ownership check
 * (`record.userId !== req.userId`) would still pass for whoever holds that
 * seven-day token. The lookup is opt-in precisely so the write paths can pay
 * for it and the read paths need not.
 */
router.post(
  "/analyze",
  optionalUser,
  aiUploadLimiter,
  resumeUpload.single("resume"),
  handleUploadErrors,
  uploadAndAnalyzeResume
);
router.get("/history", optionalAuth, getAnalysisHistory);
// Reopen a stored report. Declared after /history so the literal path is not
// swallowed by the :id parameter.
router.get("/:id", optionalAuth, getAnalysisById);

export default router;