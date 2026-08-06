import express from "express";
import rateLimit from "express-rate-limit";
import optionalAuth, { optionalUser } from "../middleware/optionalAuth.js";
import {
  getPyqCoverage,
  getPyqTopics,
  listPyqs,
  getPyqSolution,
  getPyqPattern,
  listPyqPapers,
  getPyqPaper,
  scorePyqPaper,
  generateMockPaper,
  getGeneratorOptions,
  scoreQuestionSet,
  listFullTests,
  listMyAttempts,
  getMyAttempt,
  createCourseRequest,
  listCourseRequests,
  listExams,
  getExamFilters,
  countAvailable,
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

/**
 * Generating a paper is several unindexed-by-difficulty pool reads. Cheap next
 * to a model call, not free next to nothing, and nothing else here can be made
 * to do work in a loop.
 */
const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many papers generated. Please try again later." },
});

router.get("/coverage", getPyqCoverage);
router.get("/topics/:examCode", getPyqTopics);
router.get("/pattern/:examCode", getPyqPattern);

// The guided setup flow: which exams exist, which filters that exam supports,
// and how many questions the current selection actually matches. All three are
// derived from the question table, so an exam added tomorrow appears without a
// code change and no filter is ever offered that the archive cannot fill.
// Declared before "/:id/solution" so none is matched as a question id.
router.get("/exams", listExams);
router.get("/filters", getExamFilters);
router.get("/filters/:examCode", getExamFilters);
router.get("/available", countAvailable);
router.post("/available", countAvailable);

// This candidate's own sittings — real papers and generated mocks alike.
//
// optionalAuth rather than `protect` so the 401 is a JSON body the history page
// can read. `protect` throws an AppError, and with no error handler mounted in
// server.js that reaches Express's default handler: the status is right but the
// body is an HTML page, which a fetch().json() call turns into a parse error
// instead of "sign in to see your history". The handlers below refuse an
// anonymous caller explicitly. Declared before "/:id/solution" so "attempts" is
// never matched as a question id.
router.get("/attempts", optionalAuth, listMyAttempts);
router.get("/attempts/:attemptId", optionalAuth, getMyAttempt);

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
router.post("/papers/:paperId/score", optionalUser, scorePyqPaper);

// A fresh paper drawn from the question bank, and its scorer. Declared before
// "/:id/solution" for the same reason as the routes above.
//
// The GET form is the original zero-argument draw and is kept because the
// player still links to it; POST carries a full spec — subjects, chapters,
// years, difficulty, distribution.
router.get("/practice/generate", generateLimiter, generateMockPaper);
router.get("/generate/options", getGeneratorOptions);
// The official pattern of every full-length paper, plus whether the archive can
// currently fill it. Read before the Full Test card renders.
router.get("/full-tests", listFullTests);
router.post("/generate", generateLimiter, generateMockPaper);
// optionalAuth for the same reason as the paper scorer: a signed-in candidate's
// generated paper lands in their history, an anonymous one is still scored.
router.post("/practice/score", optionalUser, scoreQuestionSet);

router.get("/", listPyqs);
router.get("/:id/solution", solutionLimiter, getPyqSolution);

router.post("/course-request", requestLimiter, optionalUser, createCourseRequest);
router.get("/course-request", listCourseRequests);

export default router;
