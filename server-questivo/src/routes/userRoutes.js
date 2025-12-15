// routes/userRoutes.js
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { getMyProfile, updateMedium } from "../controllers/userController.js";

const router = express.Router();

router.get("/me/profile", protect, getMyProfile);
router.patch("/me/medium", protect, updateMedium);

export default router;
