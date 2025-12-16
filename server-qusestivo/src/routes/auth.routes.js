import express from "express";
import {
  signup,
  verifySignupOtp,
  signin,
  sendLoginOtp,
  verifyLoginOtp,
  sendResetOtp,
  verifyResetOtp,
  googleAuth,
  me,
  logout,
  getUserStats,
} from "../controllers/authController.js";

const router = express.Router();

router.get("/me", me);
import { protect } from "../middleware/authMiddleware.js";
router.get("/stats", protect, getUserStats);
router.post("/signup", signup);
router.post("/signup/verify-otp", verifySignupOtp);

// Email + Password
router.post("/signin", signin);

// Email + OTP
router.post("/signin/otp", sendLoginOtp);
router.post("/signin/otp/verify", verifyLoginOtp);


router.post("/password/reset", sendResetOtp);
router.post("/password/reset/verify", verifyResetOtp);

router.post('/logout', logout)
router.post("/oauth/google", googleAuth);

export default router;
