import express from "express";
import multer from "multer";
import { uploadAndAnalyzeResume, getAnalysisHistory } from "../controllers/resumeController.js";
// Import your existing verification middleware context to protect application records
// import { protectAuth } from "../middlewares/authMiddleware.js"; 

const router = express.Router();

// Setup in-memory structural storage processing constraints inside transient instance loops
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB bounds verification checks limits
});

// Primary operational matrix routes targets mapping endpoints registers
// Replace mock array bypass routes once existing middleware is attached
router.post("/analyze", upload.single("resume"), uploadAndAnalyzeResume);
router.get("/history", getAnalysisHistory);

export default router;