import express from "express";
import multer from "multer";
import { uploadAndAnalyzeResume, getAnalysisHistory, getAnalysisById } from "../controllers/resumeController.js";
import { optionalAuth } from "../middleware/optionalAuth.js";
// Import your existing verification middleware context to protect application records
// import { protectAuth } from "../middlewares/authMiddleware.js"; 

const router = express.Router();

// Setup in-memory structural storage processing constraints inside transient instance loops
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB bounds verification checks limits
});

// optionalAuth, not protect: the analyser stays usable while logged out, but a
// signed-in user gets the report filed under their own account. Without it the
// controller had no way to know who the caller was, so every row was stored
// under one shared fake id and /history returned everyone's reports to everyone.
router.post("/analyze", optionalAuth, upload.single("resume"), uploadAndAnalyzeResume);
router.get("/history", optionalAuth, getAnalysisHistory);
// Reopen a stored report. Declared after /history so the literal path is not
// swallowed by the :id parameter.
router.get("/:id", optionalAuth, getAnalysisById);

export default router;