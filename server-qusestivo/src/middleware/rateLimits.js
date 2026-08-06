/**
 * Per-source request limits.
 *
 * WHAT WAS HERE BEFORE
 *
 * rateLimiter.js and advancedRateLimiter.js defined a full set of limiters —
 * general, auth, password reset, upload — and nothing imported either file.
 * Worse, both were written with `require()` in a package declaring
 * `"type": "module"`, so mounting them would not have rate-limited anything;
 * it would have crashed the server on boot. Dead code that reads as a defence
 * is more dangerous than no code, because it answers the question "are the auth
 * endpoints limited?" with a yes. They are gone; this is what actually runs.
 *
 * NO GLOBAL LIMITER, ON PURPOSE
 *
 * The obvious shape is one limiter over `/api` and a higher cap for the
 * expensive routes. That shape is wrong for this audience. Indian exam
 * candidates sit behind carrier-grade NAT, college gateways and shared mobile
 * networks by the thousand, so "requests from this IP" and "requests from this
 * person" are not the same measurement — a cap low enough to stop an attacker
 * is low enough to take a whole hostel offline mid-test. So the limits below
 * are placed only where an unlimited caller costs real money or breaks
 * security, and each one is keyed as narrowly as it can be.
 *
 * WHAT ACTUALLY STOPS PASSWORD GUESSING
 *
 * Not this file. A per-IP limit is trivially defeated by spreading attempts
 * across addresses, and it punishes the shared-NAT case hardest. The real
 * defence is per-ACCOUNT lockout in otpThrottle.js (consumeOtpAttempt), which
 * counts failures against the email being attacked no matter where they come
 * from. These limiters are the second layer: they stop one loud source from
 * flooding, and they bound the cost of the endpoints that call an AI provider.
 */

import rateLimit, { ipKeyGenerator } from "express-rate-limit";

/**
 * Count against the signed-in user when we know who they are, and only fall
 * back to the address otherwise.
 *
 * This is what makes a shared campus gateway survivable: fifty logged-in
 * students on one NAT address are fifty buckets, not one. Anonymous callers
 * still share the address bucket, which is the correct pessimism — an
 * unauthenticated flood is exactly what the limit is for.
 *
 * ipKeyGenerator, rather than req.ip directly: it normalises IPv6 into a /64
 * subnet, so a caller with a routed v6 prefix cannot mint a fresh bucket per
 * request simply by picking a new address out of their own allocation.
 */
const perUserOrIp = (req, res) =>
  req.userId ? `user:${req.userId}` : ipKeyGenerator(req, res);

/** Shared shape: JSON body, standard headers, and a Retry-After the UI can use. */
const limiter = ({ windowMs, max, message, keyGenerator }) =>
  rateLimit({
    windowMs,
    limit: max,
    keyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    // The default handler sends text/plain, which every fetch() in the frontend
    // then fails to parse and reports as a network error rather than a limit.
    handler: (req, res) => {
      const retryAfterSeconds = Math.ceil(windowMs / 1000);
      res.set("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        success: false,
        message,
        error: message,
        retryAfterSeconds,
      });
    },
  });

/**
 * The endpoints that accept a credential: sign-in, sign-up, OTP, reset.
 *
 * MOUNTED PER-ROUTE, NOT ON THE ROUTER
 *
 * The obvious `app.use("/api/auth", authLimiter, authrouter)` is wrong, and
 * wrong in a way that only shows up in production. `/api/auth/me` lives under
 * that prefix and is called on every page load to decide whether the visitor is
 * signed in — so a per-IP cap sized for password attempts would be spent by
 * ordinary browsing, and spent fastest by the shared-address users it was most
 * important not to break. It is applied in auth.routes.js to the credential
 * POSTs only.
 *
 * SIZED FOR A LECTURE HALL, NOT FOR A LAPTOP
 *
 * Six hundred in a quarter hour looks generous for "sign-in attempts", and it
 * is deliberate. Two hundred students starting a mock test from one college
 * gateway inside ten minutes is a normal Tuesday here and must not look like an
 * attack. What this stops is the other order of magnitude — a script trying
 * thousands a minute — and what stops the patient attacker is the per-account
 * lockout in otpThrottle.js, which does not care how many addresses they spread
 * across. Tune with AUTH_RATE_MAX where the deployment knows better.
 */
export const authLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_MAX) || 600,
  message:
    "Too many sign-in attempts from this network. Please wait a few minutes and try again.",
});

/**
 * Endpoints that spend money per call: resume analysis and interview setup both
 * upload a file and then run it through an AI provider.
 *
 * Unauthenticated callers reach these (the analyser is usable logged out), so
 * without a limit anyone can burn the Groq quota from a loop with no account
 * and no cost to themselves. Keyed per user where possible so a signed-in
 * student is not throttled by a stranger on the same NAT.
 */
export const aiUploadLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.AI_UPLOAD_RATE_MAX) || 12,
  keyGenerator: perUserOrIp,
  message:
    "You have run a lot of analyses in the last hour. Please try again later.",
});

/**
 * There is deliberately no general limiter over /api/user or /api/admin.
 *
 * One was written and then removed before it shipped. Those routers authenticate
 * inside themselves, so a limiter mounted in front of them runs before req.userId
 * exists and can only key on the address — which puts an entire college on one
 * bucket for ordinary, authenticated, already-cheap traffic. Any cap low enough
 * to matter would break them, and any cap high enough not to would not be doing
 * anything. The expensive and the guessable endpoints are limited above; these
 * are neither.
 */
