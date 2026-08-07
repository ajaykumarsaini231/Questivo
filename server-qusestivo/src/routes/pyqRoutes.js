import express from "express";
import rateLimit from "express-rate-limit";
import optionalAuth, { optionalUser } from "../middleware/optionalAuth.js";
import { protect } from "../middleware/authMiddleware.js";
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
 * WHAT IS PUBLIC HERE AND WHAT IS NOT
 *
 * This archive is 9,102 questions, and every one of them used to be readable by
 * anyone who could write a for-loop: listPyqs pages 50 at a time, so the whole
 * bank was ~180 unauthenticated requests. Rate limiting alone could not answer
 * that, and on the Vercel copy of this server it answers nothing at all —
 * express-rate-limit counts in memory, and every serverless instance starts
 * with its own empty counter.
 *
 * So the line is drawn at content rather than at traffic:
 *
 *   PUBLIC — which exams exist, what filters they support, how many questions
 *   match, the pattern of a full test, the list of papers. All of it is
 *   metadata, none of it is a question, and the prerendered /pyq and geo
 *   landing pages need it to stay indexable. Crawlers keep working.
 *
 *   SIGNED IN — the questions themselves: the paged list, a whole paper, a
 *   generated mock, and any solution. Scraping these now costs an account,
 *   and an account is a thing that can be rate-limited, quota'd and banned.
 *
 * `protect` and not `optionalAuth` + a hand-rolled check: server.js mounts a
 * JSON error handler (the four-argument one at the bottom), so an AppError from
 * protect comes back as {success:false, message, error} with the right status.
 * The note further down about 401s arriving as HTML predates that handler.
 */

/**
 * `protect`, with a refusal a candidate can read.
 *
 * protect answers "Not authorized, token missing", which is the truth and is
 * useless on screen: lib/pyq.ts surfaces the body's `error` straight into the
 * page's error state, so a signed-out visitor browsing the archive would have
 * been told about a missing token. Only the 401 body is rewritten — the
 * signature check, the deleted-account lookup and every other status come
 * from protect unchanged, so there is no second copy of the auth rules here.
 *
 * The {error, signedIn} shape matches requireCandidate in pyqController, which
 * the history endpoints already answer with, so the client sees one shape for
 * "you need an account" across this whole router.
 */
const gate = (message) => (req, res, next) =>
  protect(req, res, (err) => {
    if (!err) return next();
    if (err?.statusCode === 401) {
      return res.status(401).json({ error: message, signedIn: false });
    }
    return next(err);
  });

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
// The list stays public — titles, years and question counts are the catalogue,
// and the papers page has to be indexable. Opening one is the content.
router.get("/papers", listPyqPapers);
router.get("/papers/:paperId", gate("Sign in to open this paper."), getPyqPaper);
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
// A generated paper is drawn from the same question bank, so leaving it open
// would have handed a scraper the archive by another door — and a wider one,
// since a spec-driven POST can ask for whole chapters at a time. `protect`
// runs before the limiter: a request with no token is refused on a signature
// check, without a database read and without spending limiter budget.
router.get("/practice/generate", gate("Sign in to generate a practice paper."), generateLimiter, generateMockPaper);
router.get("/generate/options", getGeneratorOptions);
// The official pattern of every full-length paper, plus whether the archive can
// currently fill it. Read before the Full Test card renders.
router.get("/full-tests", listFullTests);
router.post("/generate", gate("Sign in to generate a practice paper."), generateLimiter, generateMockPaper);
// optionalAuth for the same reason as the paper scorer: a signed-in candidate's
// generated paper lands in their history, an anonymous one is still scored.
router.post("/practice/score", optionalUser, scoreQuestionSet);

// The two that mattered most. listPyqs is the bulk read — 50 rows a call, the
// whole archive in a few minutes — and a solution costs a model call, so an
// open one is someone else's compute bill as much as it is our content.
router.get("/", gate("Sign in to browse previous year questions."), listPyqs);
router.get("/:id/solution", gate("Sign in to see the full solution."), solutionLimiter, getPyqSolution);

router.post("/course-request", requestLimiter, optionalUser, createCourseRequest);
router.get("/course-request", listCourseRequests);

export default router;
