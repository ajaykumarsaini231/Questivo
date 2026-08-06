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
import { protect } from "../middleware/authMiddleware.js";
import { authLimiter } from "../middleware/rateLimits.js";

const router = express.Router();

/**
 * Reads, not credential attempts — deliberately outside the limiter.
 *
 * /me is called on every page load to decide whether the visitor is signed in.
 * Putting it behind the same per-address budget as password attempts would mean
 * ordinary browsing from a shared college or carrier NAT exhausted the sign-in
 * allowance for everyone on that address, and the failure would look like the
 * site being broken rather than like a limit.
 */
router.get("/me", me);
router.get("/stats", protect, getUserStats);
router.post("/logout", logout);

/**
 * Everything below accepts a credential — a password, a one-time code, or an
 * OAuth token — and each one is a place a script can guess.
 *
 * The limiter here is the outer, per-address layer and is sized so a lecture
 * hall signing in together never trips it. The precise defence is per-ACCOUNT:
 * otpThrottle.js counts failures against the email being attacked, so guesses
 * spread across a thousand addresses still run out after ten. Read the two
 * together; neither is sufficient alone.
 */
router.post("/signup", authLimiter, signup);
router.post("/signup/verify-otp", authLimiter, verifySignupOtp);

// Email + Password
router.post("/signin", authLimiter, signin);

// Email + OTP
router.post("/signin/otp", authLimiter, sendLoginOtp);
router.post("/signin/otp/verify", authLimiter, verifyLoginOtp);

router.post("/password/reset", authLimiter, sendResetOtp);
router.post("/password/reset/verify", authLimiter, verifyResetOtp);

router.post("/oauth/google", authLimiter, googleAuth);

export default router;
