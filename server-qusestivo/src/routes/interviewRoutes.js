import express from "express";
import multer from "multer";
import {
  initializeInterviewSession,
  getInterviewSessionDetails,
  getInterviewHistory,
  getInterviewTranscript,
} from "../controllers/interviewController.js";
import { optionalAuth } from "../middleware/optionalAuth.js";

// Multer memory storage configuration buffer parsing
const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

// optionalAuth resolves req.userId from the session cookie so sessions are
// filed against the real user. The controller previously fell back to a shared
// "anonymous-session-layer" id, which made per-user history impossible.
router.post("/initialize", optionalAuth, upload.single("resume"), initializeInterviewSession);

// Literal paths are declared before the parameterised one, otherwise Express
// would match /history as a sessionId.
router.get("/history", optionalAuth, getInterviewHistory);
router.get("/transcript/:sessionId", optionalAuth, getInterviewTranscript);
router.get("/session/:sessionId", optionalAuth, getInterviewSessionDetails);

export default router;
