import express from "express";
import multer from "multer";
import { 
  initializeInterviewSession, 
  getInterviewSessionDetails 
} from "../controllers/interviewController.js";

// Multer memory storage configuration buffer parsing
const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

// 🟢 FIXED: Added upload.single('resume') middleware handler explicitly
router.post("/initialize", upload.single("resume"), initializeInterviewSession);
router.get("/session/:sessionId", getInterviewSessionDetails);

export default router;