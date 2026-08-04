import express from "express";
import rateLimit from "express-rate-limit";
import optionalAuth from "../middleware/optionalAuth.js";
import {
  getPyqCoverage,
  getPyqTopics,
  listPyqs,
  getPyqSolution,
  getPyqPattern,
  listPyqPapers,
  getPyqPaper,
  scorePyqPaper,
  generatePracticePaper,
  scoreQuestionSet,
  createCourseRequest,
  listCourseRequests,
} from "../controllers/pyqController.js";

const router = express.Router();

/**
 * Solutions and course requests are the only endpoints here that cost anything
 * — one calls a model, the other writes a row. Both are public, so both are
 * capped. Browsing PYQs is a plain indexed read and is left uncapped.
 */
const solutionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many solution requests. Please try again later." },
});

const requestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many course requests from this address." },
});

router.get("/coverage", getPyqCoverage);
router.get("/topics/:examCode", getPyqTopics);
router.get("/pattern/:examCode", getPyqPattern);

// Whole-paper archive. Declared before "/:id/solution" so "papers" is never
// matched as a question id.
router.get("/papers", listPyqPapers);
router.get("/papers/:paperId", getPyqPaper);
// optionalAuth, not requireAuth: sitting a paper without an account still has
// to work — that is the point of a free PYQ dashboard. But the browser already
// sends its session cookie here (credentials: "include"), and without this
// middleware req.userId was never populated, so every attempt was scored
// anonymously and the candidate's profile read "0 tests attempted" no matter
// how many papers they sat.
router.post("/papers/:paperId/score", optionalAuth, scorePyqPaper);

// A fresh paper drawn from the question bank, and its scorer. Declared before
// "/:id/solution" for the same reason as the routes above.
router.get("/practice/generate", generatePracticePaper);
router.post("/practice/score", scoreQuestionSet);

router.get("/", listPyqs);
router.get("/:id/solution", solutionLimiter, getPyqSolution);

router.post("/course-request", requestLimiter, optionalAuth, createCourseRequest);
router.get("/course-request", listCourseRequests);

export default router;
