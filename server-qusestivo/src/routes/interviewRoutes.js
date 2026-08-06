import express from "express";
import {
  initializeInterviewSession,
  getInterviewSessionDetails,
  getInterviewHistory,
  getInterviewTranscript,
} from "../controllers/interviewController.js";
import { optionalAuth, optionalUser } from "../middleware/optionalAuth.js";
import { resumeUpload, handleUploadErrors } from "../middleware/resumeUpload.js";
import { aiUploadLimiter } from "../middleware/rateLimits.js";

const router = express.Router();

/**
 * optionalAuth resolves req.userId from the session cookie so sessions are
 * filed against the real user. The controller previously fell back to a shared
 * "anonymous-session-layer" id, which made per-user history impossible.
 *
 * The multer config here used to be `multer({ storage: memoryStorage() })` and
 * nothing else — no size limit, no type check — so an anonymous caller could
 * post a file of any size straight into the heap. It shares resumeRoutes'
 * configuration now, and the same limiter, because it starts an AI session and
 * costs the same money.
 */
/**
 * optionalUser on the write, for the reason spelled out in resumeRoutes.js:
 * this creates an InterviewSession owned by `userId`, and the socket's
 * ownership check later compares against exactly that value. An owner id that
 * no longer names an account is one nobody can be, and one anybody holding the
 * old token still can.
 */
router.post(
  "/initialize",
  optionalUser,
  aiUploadLimiter,
  resumeUpload.single("resume"),
  handleUploadErrors,
  initializeInterviewSession
);

// Literal paths are declared before the parameterised one, otherwise Express
// would match /history as a sessionId.
router.get("/history", optionalAuth, getInterviewHistory);
router.get("/transcript/:sessionId", optionalAuth, getInterviewTranscript);
router.get("/session/:sessionId", optionalAuth, getInterviewSessionDetails);

export default router;
