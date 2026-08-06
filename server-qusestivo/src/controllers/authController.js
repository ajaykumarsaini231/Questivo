import crypto from "crypto";
import jwt from "jsonwebtoken";
import axios from "axios";
import prisma from "../prismaClient.js";

import {
  signupSchema,
  signinSchema,
  passwordStrengthSchema,
} from "../middleware/validator.js";

import { doHash, dohashValidation, hmacProcess } from "../utills/hashing.js";
import { transport } from "../middleware/sendmail.js";
import {
  guardOtpSend,
  guardOtpVerify,
  clearOtpAttempts,
  OTP_PURPOSES,
} from "../lib/otpThrottle.js";
import { readSessionToken } from "../lib/sessionToken.js";

/**
 * Strip secrets before a user row crosses the network.
 *
 * signin/signup/me were returning the Prisma row verbatim, which shipped
 * passwordHash (bcrypt) and otpHash to the browser. A password hash in a
 * response body can be harvested and attacked offline at the attacker's
 * leisure, and the OTP hash undermines the second factor. Neither is ever
 * needed by the client.
 */
const publicUser = (u) => {
  if (!u) return u;
  const { passwordHash, otpHash, otpExpiresAt, otpPurpose, ...safe } = u;
  return safe;
};


const OTP_SECRET = process.env.HMAC_VARIFICATION_CODE_SECRET;

if (!OTP_SECRET) {
  throw new Error("HMAC_VARIFICATION_CODE_SECRET not set");
}


/* ===================== HELPERS ===================== */

const signJwt = (payload) =>
  jwt.sign(payload, process.env.Secret_Token, { expiresIn: "7d" });

/**
 * Mint a six-digit code.
 *
 * crypto.randomInt, not Math.random. Math.random is a fast non-cryptographic
 * PRNG — in V8 an xorshift128+ whose internal state can be reconstructed from a
 * short run of its outputs, after which every future value is known. That is a
 * lab attack rather than a drive-by, but the whole security of this code is
 * that it cannot be predicted, and there is no reason to defend a guess when
 * the CSPRNG is one import away and costs microseconds.
 *
 * The range is [100000, 1000000) so every code is exactly six digits — a
 * leading zero would render as a five-digit code in the email and be typed back
 * as one.
 */
const mintOtp = () => String(crypto.randomInt(100000, 1000000));

/**
 * Failed password sign-ins are counted in the same place as failed codes.
 *
 * It is not an OTP purpose, but it is the same measurement — "how many wrong
 * credentials has this account been shown" — and it wants the same per-account
 * bucket rather than a per-IP one, for the same reason: guesses spread across
 * addresses defeat an IP limit, and this audience shares addresses behind
 * carrier-grade NAT by the thousand. Its own key so a password lockout cannot
 * stop the owner from using the OTP route to get back in.
 */
const PASSWORD_PURPOSE = "PASSWORD";

/** Passwords get a longer leash than codes: people genuinely misremember them. */
const PASSWORD_MAX_ATTEMPTS = Number(process.env.PASSWORD_MAX_ATTEMPTS) || 10;

/**
 * Compare two HMAC digests without letting the comparison time say how much of
 * the prefix matched.
 *
 * `a !== b` on strings stops at the first differing byte. Over the public
 * internet that difference is buried in jitter and this is close to
 * theoretical — but it is one call to make it unconditionally true instead of
 * probably-fine, and these are the digests standing between a guess and an
 * account.
 *
 * Lengths are compared first because timingSafeEqual throws on a mismatch, and
 * a thrown comparison is a failed sign-in with a 500 instead of a 400.
 */
const digestsMatch = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

const COOKIE_OPTS = {
  httpOnly: true,
  secure: true, // MUST (https)
  /**
   * Lax, not None.
   *
   * None was needed while the frontend was built against an absolute API origin
   * — the page and the API were different sites, so the session cookie was a
   * cross-site cookie and Lax would never have been sent. That is no longer the
   * arrangement: apiBase.ts resolves to an empty base and vercel.json rewrites
   * /api through to this server, so the cookie is first-party on every hostname
   * the site answers on.
   *
   * The reason to change it is CSRF. This API parses urlencoded bodies, which
   * means a form on any website can POST to it with no preflight to stop it; a
   * SameSite=None cookie rides along on that request and the action executes.
   * There is no CSRF token here to catch it. Lax is the fix: the browser simply
   * does not attach this cookie to a cross-site POST, which closes the whole
   * class without a token anywhere.
   *
   * If an absolute API origin is ever reintroduced, this has to go back to None
   * AND a CSRF token has to appear — the two are a pair, and it was the missing
   * half of that pair that made this exploitable.
   */
  sameSite: "Lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

/**
 * End every successful sign-in the same way: set the cookie, and also hand the
 * token back in the body.
 *
 * The cookie alone was not enough. When the page and the API are different
 * sites — which they are on at least one of this site's hostnames whenever the
 * frontend is built against an absolute API origin — the cookie is
 * third-party, and a browser that blocks those discards it without telling
 * anyone. The response still said `success: true`, so the UI navigated to a
 * signed-in view, and the first request behind it came back 401. That is the
 * whole of the "login works on one domain and not the other" report.
 *
 * Returning the token lets the client keep it and present it as
 * `Authorization: Bearer`, which no cookie policy can drop. The cookie is
 * still set and still preferred by readSessionToken, so the httpOnly path
 * remains the one in use wherever it survives; the body copy is what the other
 * hostname falls back to.
 *
 * The tradeoff is deliberate and worth naming: a token the page can read is a
 * token an XSS can read, which is exactly what httpOnly buys. Being unable to
 * log in at all is the worse failure, and this keeps the safer carrier first.
 *
 * All four sign-in paths — password, signup OTP, login OTP, Google — go
 * through here so none of them can be the one that forgets.
 */
const grantSession = (res, user) => {
  const token = signJwt({ userId: user.id });
  res.cookie("token", token, COOKIE_OPTS);
  return res.json({ success: true, token, user: publicUser(user) });
};

/* =====================================================
   SIGNUP — EMAIL + OTP  (PendingUser)
===================================================== */

export const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const { error } = signupSchema.validate({ name, email, password });
    if (error) return res.status(400).json({ message: error.details[0].message });

    const exists = await prisma.user.findUnique({ where: { email } });

    // Throttled BEFORE the pending row is touched. Checking afterwards would
    // let a refused request still wipe the pending signup the caller already
    // had, which is a denial of service against the victim rather than against
    // the attacker.
    if (!(await guardOtpSend(req, res, { identifier: email, purpose: OTP_PURPOSES.SIGNUP }))) return;

    /**
     * An address that already has an account gets the same answer as one that
     * does not, and hears about it by email instead.
     *
     * "User already exists" told anyone who asked whether a given address is
     * registered here, one request at a time, with no account of their own —
     * a membership list for any mailing list, breach dump or guess someone
     * cares to feed it. Paired with the 404s the OTP endpoints used to return,
     * the whole user base was enumerable.
     *
     * The mail is not a consolation prize for the UX cost. It is the useful
     * half: the real owner learns that someone tried to register their address
     * and is pointed at the route that actually works, while the person who
     * typed it learns nothing about who is registered.
     */
    if (exists) {
      await transport.sendMail({
        to: email,
        subject: "You already have a Questivo account",
        html: `
    <div style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;padding:24px;">
      <div style="text-align:center;margin-bottom:20px;">
        <h1 style="color:#4f46e5;margin:0;">Questivo</h1>
        <p style="color:#6b7280;font-size:14px;margin-top:4px;">Smart Practice. Real Results.</p>
      </div>
      <p style="font-size:15px;color:#374151;line-height:1.6;">
        Someone just tried to create a Questivo account with this email address,
        but you already have one.
      </p>
      <p style="font-size:15px;color:#374151;line-height:1.6;">
        You can <strong>sign in</strong> with your password, or use the
        <strong>"Sign in with OTP"</strong> option if you would rather not
        remember one. If you have forgotten your password, use
        <strong>"Forgot password"</strong> on the sign-in page to set a new one.
      </p>
      <p style="font-size:14px;color:#6b7280;line-height:1.6;">
        If this was not you, no action is needed — your account has not changed
        and no one has been given access to it.
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="font-size:12px;color:#6b7280;text-align:center;">
        © ${new Date().getFullYear()} Questivo. All rights reserved.<br/>
        This is an automated message. Please do not reply.
      </p>
    </div>
  `,
      });

      return res.json({ success: true, message: "OTP sent" });
    }

    await prisma.pendingUser.deleteMany({ where: { email } });

    const otp = mintOtp();

    await prisma.pendingUser.create({
      data: {
        email,
        name,
        passwordHash: await doHash(password, 12),
        otpHash: hmacProcess(otp, process.env.HMAC_VARIFICATION_CODE_SECRET),
        otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    await transport.sendMail({
      to: email,
      subject: "Welcome to Questivo - Verify Your Email",
      html: `
    <div style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;padding:24px;">
      
      <div style="text-align:center;margin-bottom:20px;">
        <h1 style="color:#4f46e5;margin:0;">Questivo</h1>
        <p style="color:#6b7280;font-size:14px;margin-top:4px;">
          Smart Practice. Real Results.
        </p>
      </div>

      <p style="font-size:16px;color:#111827;">
        Hi <strong>${email}</strong>,
      </p>

      <p style="font-size:15px;color:#374151;line-height:1.6;">
        Welcome to <strong>Questivo</strong>! 🎯  
        You're just one step away from unlocking AI-powered mock tests
        tailored for competitive exams like JEE, GATE, SSC, and more.
      </p>

      <p style="font-size:15px;color:#374151;">
        Please use the verification code below to complete your signup:
      </p>

      <div style="text-align:center;margin:24px 0;">
        <div style="display:inline-block;background:#f5f3ff;color:#5b21b6;
                    font-size:28px;letter-spacing:6px;font-weight:bold;
                    padding:16px 28px;border-radius:6px;">
          ${otp}
        </div>
      </div>

      <p style="font-size:14px;color:#374151;line-height:1.6;">
        This OTP is valid for <strong>5 minutes</strong>.  
        If you did not attempt to sign up, you can safely ignore this email.
      </p>

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

      <p style="font-size:12px;color:#6b7280;text-align:center;">
        © ${new Date().getFullYear()} Questivo. All rights reserved.<br/>
        This is an automated message. Please do not reply.
      </p>
    </div>
  `,
    });


    res.json({ success: true, message: "OTP sent" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =====================================================
   VERIFY SIGNUP OTP → CREATE USER
===================================================== */

export const verifySignupOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Every guess is charged against this address before it is checked. Without
    // it a six-digit code with a five-minute life is a million tries at
    // whatever rate the network allows — see consumeOtpAttempt.
    if (!(await guardOtpVerify(req, res, { identifier: email, purpose: OTP_PURPOSES.SIGNUP }))) return;

    const pending = await prisma.pendingUser.findUnique({ where: { email } });

    /**
     * `pending.otpExpiresAt`, not `pending.otpExpiry`.
     *
     * The column is otpExpiresAt — that is the name the schema declares, the
     * name signup writes, and the name the login and reset paths read. This one
     * line read a field that does not exist, so the comparison was
     * `undefined < new Date()`, which is false for every date there has ever
     * been. The expiry check was not lenient; it never ran at all, and signup
     * codes stayed valid forever. Combined with there being no attempt limit,
     * every pending signup was a code an attacker had unlimited time and
     * unlimited tries to find.
     */
    if (!pending || !pending.otpExpiresAt || pending.otpExpiresAt < new Date())
      return res.status(400).json({ message: "OTP invalid or expired" });

    if (
      !digestsMatch(
        pending.otpHash,
        hmacProcess(String(otp ?? ""), process.env.HMAC_VARIFICATION_CODE_SECRET)
      )
    )
      return res.status(400).json({ message: "OTP invalid" });

    await clearOtpAttempts({ identifier: email, purpose: OTP_PURPOSES.SIGNUP });

    const user = await prisma.user.create({
      data: {
        email,
        name: pending.name,
        passwordHash: pending.passwordHash,
        authProvider: "LOCAL",
      },
    });

    await prisma.pendingUser.delete({ where: { email } });

    return grantSession(res, user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =====================================================
   SIGNIN — PASSWORD
===================================================== */

export const signin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const { error } = signinSchema.validate({ email, password });
    if (error) return res.status(400).json({ message: error.details[0].message });

    // Nothing stood in front of this before: /signin accepted guesses at
    // whatever rate a script could send them, forever. The per-IP limiter now
    // mounted on the router stops one loud source; this stops a quiet one
    // spread across many, which is the attack that actually works.
    if (
      !(await guardOtpVerify(req, res, {
        identifier: email,
        purpose: PASSWORD_PURPOSE,
        max: PASSWORD_MAX_ATTEMPTS,
      }))
    )
      return;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash)
      return res.status(401).json({ message: "Invalid credentials" });

    const ok = await dohashValidation(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    await clearOtpAttempts({ identifier: email, purpose: PASSWORD_PURPOSE });

    return grantSession(res, user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =====================================================
   SIGNIN — OTP
===================================================== */

export const sendLoginOtp = async (req, res) => {
  try {
    const { email } = req.body;

    // The throttle runs before the account lookup on purpose. Looking up first
    // means an attacker can probe which addresses have accounts at any rate
    // they like — the 404 below already leaks that, and letting it be probed
    // for free makes the leak enumerable in bulk.
    if (!(await guardOtpSend(req, res, { identifier: email, purpose: OTP_PURPOSES.LOGIN }))) return;

    const user = await prisma.user.findUnique({ where: { email } });
    /**
     * Same answer whether or not the account exists.
     *
     * The 404 that stood here was a free membership oracle — one request per
     * address, no account needed, and the comment above already noted the leak
     * was enumerable in bulk. Someone who typed their address wrong sees "code
     * sent" and no code arrives, which is the same thing they would see if the
     * mail were delayed; someone probing the user base learns nothing at all.
     */
    if (!user) return res.json({ success: true });

    const otp = mintOtp();

    await prisma.user.update({
      where: { email },
      data: {
        otpHash: hmacProcess(otp, process.env.HMAC_VARIFICATION_CODE_SECRET),
        otpPurpose: "LOGIN",
        otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    await transport.sendMail({
      to: email,
      subject: "Your Questivo Login OTP",
      html: `
    <div style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;padding:24px;">
      
      <div style="text-align:center;margin-bottom:20px;">
        <h1 style="color:#4f46e5;margin:0;">Questivo</h1>
        <p style="color:#6b7280;font-size:14px;margin-top:4px;">
          Smart Practice. Real Results.
        </p>
      </div>

      <p style="font-size:16px;color:#111827;">
        Hi <strong>${email}</strong>,
      </p>

      <p style="font-size:15px;color:#374151;line-height:1.6;">
        We noticed a login attempt on your <strong>Questivo</strong> account.
        Please use the OTP below to verify your login.
      </p>

      <div style="text-align:center;margin:24px 0;">
        <div style="display:inline-block;background:#ecfeff;color:#0369a1;
                    font-size:28px;letter-spacing:6px;font-weight:bold;
                    padding:16px 28px;border-radius:6px;">
          ${otp}
        </div>
      </div>

      <p style="font-size:14px;color:#374151;line-height:1.6;">
        This OTP is valid for <strong>5 minutes</strong>.
        If you did not attempt to log in, please ignore this email.
      </p>

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

      <p style="font-size:12px;color:#6b7280;text-align:center;">
        © ${new Date().getFullYear()} Questivo. All rights reserved.<br/>
        This is an automated message. Please do not reply.
      </p>
    </div>
  `,
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

export const verifyLoginOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!(await guardOtpVerify(req, res, { identifier: email, purpose: OTP_PURPOSES.LOGIN }))) return;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.otpPurpose !== "LOGIN")
      return res.status(400).json({ message: "Invalid request" });

    if (!user.otpExpiresAt || user.otpExpiresAt < new Date())
      return res.status(400).json({ message: "OTP expired" });

    if (
      !digestsMatch(
        user.otpHash,
        hmacProcess(String(otp ?? ""), process.env.HMAC_VARIFICATION_CODE_SECRET)
      )
    )
      return res.status(400).json({ message: "Invalid OTP" });

    await prisma.user.update({
      where: { email },
      data: { otpHash: null, otpExpiresAt: null, otpPurpose: null },
    });

    await clearOtpAttempts({ identifier: email, purpose: OTP_PURPOSES.LOGIN });

    return grantSession(res, user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =====================================================
   RESET PASSWORD — OTP
===================================================== */

export const sendResetOtp = async (req, res) => {
  try {
    const { email } = req.body;

    // Its own purpose bucket, so exhausting password-reset codes cannot also
    // lock the account out of logging in. A rate limit that denies the real
    // owner their normal route in has become the attack.
    if (!(await guardOtpSend(req, res, { identifier: email, purpose: OTP_PURPOSES.RESET_PASSWORD }))) return;

    const user = await prisma.user.findUnique({ where: { email } });
    // Generic, for the reason spelled out in sendLoginOtp. A password-reset
    // form that answers "no such user" is the same membership oracle, and it is
    // the one an attacker reaches for first because it needs no account.
    if (!user) return res.json({ success: true });

    const otp = mintOtp();
    await prisma.user.update({
      where: { email },
      data: {
        otpHash: null,
        otpPurpose: null,
        otpExpiresAt: null,
      },
    });

    await prisma.user.update({
      where: { email },
      data: {
        otpHash: hmacProcess(otp, process.env.HMAC_VARIFICATION_CODE_SECRET),
        otpPurpose: "RESET_PASSWORD",
        otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });


    await transport.sendMail({
      to: email,
      subject: "Questivo Password Reset Code – Secure Your Account",
      html: `
    <div style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;padding:24px;">
      
      <div style="text-align:center;margin-bottom:20px;">
        <h1 style="color:#4f46e5;margin:0;">Questivo</h1>
        <p style="color:#6b7280;font-size:14px;margin-top:4px;">
          Smart Practice. Real Results.
        </p>
      </div>

      <p style="font-size:16px;color:#111827;">
        Hi <strong>${email}</strong>,
      </p>

      <p style="font-size:15px;color:#374151;line-height:1.6;">
        We received a request to reset your <strong>Questivo</strong> account password.
        Please use the OTP below to proceed. This code is valid for <strong>5 minutes</strong>.
      </p>

      <div style="text-align:center;margin:24px 0;">
        <div style="display:inline-block;background:#eef2ff;color:#4338ca;
                    font-size:28px;letter-spacing:6px;font-weight:bold;
                    padding:16px 28px;border-radius:6px;">
          ${otp}
        </div>
      </div>

      <p style="font-size:14px;color:#374151;line-height:1.6;">
        If you did <strong>not</strong> request this password reset, please ignore this email.
        Your account is safe.
      </p>

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

      <p style="font-size:12px;color:#6b7280;text-align:center;">
        © ${new Date().getFullYear()} Questivo. All rights reserved.<br/>
        This is an automated message. Please do not reply.
      </p>
    </div>
  `,
    });


    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

export const verifyResetOtp = async (req, res) => {
  try {
    let { email, otp, newPassword } = req.body;

    // The debug logging that used to sit here dumped `req.body` — which on
    // THIS endpoint is the user's plaintext new password and their one-time
    // code — straight into the hosting provider's log stream, alongside the
    // stored otpHash and a freshly computed hash of the submitted code. Log
    // retention then turns every password reset on the site into a durable,
    // searchable record of the password that was chosen.
    //
    // Nothing below logs a credential. The failure branches are distinguishable
    // from their responses, which is all a debugger actually needed.

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: "Missing fields" });
    }

    email = email.trim().toLowerCase();
    otp = otp.toString();

    /**
     * Strength is checked here, before anything else touches the account.
     *
     * This endpoint used to hash whatever arrived and store it, so the rule
     * signupSchema enforces could be bypassed entirely by resetting instead of
     * signing up. The user who did that then could not sign in either, because
     * signinSchema applies the same pattern to the password being submitted —
     * so the gap did not just weaken the rule, it was a way to lock yourself
     * out of your own account.
     */
    const weak = passwordStrengthSchema.validate({ password: newPassword }).error;
    if (weak) return res.status(400).json({ message: weak.details[0].message });

    if (!(await guardOtpVerify(req, res, { identifier: email, purpose: OTP_PURPOSES.RESET_PASSWORD }))) return;

    const user = await prisma.user.findUnique({ where: { email } });

    // "User not found" here named an address that has no account, same as the
    // send endpoint used to. Every failure on this path now reads the same.
    if (!user) {
      return res.status(400).json({ message: "Invalid or expired code" });
    }

    if (user.otpPurpose !== "RESET_PASSWORD") {
      return res.status(400).json({ message: "OTP purpose invalid" });
    }

    if (!user.otpExpiresAt || user.otpExpiresAt < new Date()) {
      return res.status(400).json({ message: "OTP expired" });
    }

    const hashedOtp = hmacProcess(
      otp,
      process.env.HMAC_VARIFICATION_CODE_SECRET
    );

    if (!digestsMatch(user.otpHash, hashedOtp)) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    await prisma.user.update({
      where: { email },
      data: {
        passwordHash: await doHash(newPassword, 12),
        otpHash: null,
        otpPurpose: null,
        otpExpiresAt: null,
      },
    });

    // The password just changed, so any lockout accumulated while guessing at
    // this account is no longer protecting anything the owner does not control.
    await clearOtpAttempts({ identifier: email, purpose: OTP_PURPOSES.RESET_PASSWORD });
    await clearOtpAttempts({ identifier: email, purpose: PASSWORD_PURPOSE });

    res.json({ success: true });
  } catch (err) {
    console.error("VERIFY RESET OTP ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};




/* =====================================================
   GOOGLE / FACEBOOK AUTH
===================================================== */

/**
 * Sign in with a Google access token — after proving the token was issued to
 * THIS application.
 *
 * THE HOLE THIS CLOSES
 *
 * The handler took `accessToken` from the request body, presented it to
 * Google's userinfo endpoint, and trusted the email that came back. That reads
 * as a verification and is not one. Google's userinfo endpoint answers for ANY
 * valid Google access token carrying the userinfo scope, whoever it was issued
 * to. So the attack was:
 *
 *   1. Register any Google OAuth app of your own — free, minutes.
 *   2. Get a victim to sign into it, by any pretext. You now hold a Google
 *      access token for their account.
 *   3. POST that token to /api/auth/oauth/google here.
 *   4. userinfo returns the victim's email, this endpoint believes it, and
 *      hands back a Questivo session for them.
 *
 * No password, no code, no interaction with our site at all. It works against
 * accounts that never used Google sign-in here, because a matching email is all
 * it took.
 *
 * WHAT MAKES IT SAFE
 *
 * The `aud` claim. tokeninfo reports which OAuth client a token was minted for,
 * and a token from a stranger's app carries their client id, not ours. Checking
 * it is the difference between "this is a real Google token" — which the old
 * code established, and which is not a useful fact — and "this is a real Google
 * token that a user obtained by signing into US".
 *
 * `email_verified` is checked too: an unverified address on a Google account is
 * one its holder never proved they control, and treating it as an identity here
 * would let it be used to claim someone else's account by the same route.
 */
export const googleAuth = async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (typeof accessToken !== "string" || !accessToken) {
      return res.status(400).json({ message: "Missing Google token" });
    }

    const expectedAudience = process.env.GOOGLE_CLIENT_ID;
    if (!expectedAudience) {
      // Refusing beats falling back to the old, unchecked behaviour: an
      // unconfigured audience means we cannot tell our tokens from anyone's.
      console.error("[auth] GOOGLE_CLIENT_ID is not set; refusing Google sign-in");
      return res.status(503).json({ message: "Google sign-in is not configured" });
    }

    let tokenInfo;
    try {
      const { data } = await axios.get("https://oauth2.googleapis.com/tokeninfo", {
        params: { access_token: accessToken },
        timeout: 8000,
      });
      tokenInfo = data;
    } catch {
      return res.status(401).json({ message: "Invalid Google token" });
    }

    // `aud` is the client the token was issued to; `azp` is the authorised
    // party when the two differ. Either matching ours means the user went
    // through our consent screen.
    const audiences = [tokenInfo?.aud, tokenInfo?.azp].filter(Boolean);
    if (!audiences.includes(expectedAudience)) {
      console.warn(`[auth] Google token rejected: audience ${tokenInfo?.aud} is not ours`);
      return res.status(401).json({ message: "Invalid Google token" });
    }

    const { data } = await axios.get(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 8000 }
    );

    const email = typeof data?.email === "string" ? data.email.trim().toLowerCase() : "";
    if (!email) return res.status(401).json({ message: "Google account has no email" });

    // Both sources are consulted: userinfo reports it, and tokeninfo reports it
    // independently. Google returns the flag as a real boolean in one and the
    // string "true" in the other, so both spellings are accepted.
    const verified = [data?.email_verified, tokenInfo?.email_verified].some(
      (v) => v === true || v === "true"
    );
    if (!verified) {
      return res
        .status(401)
        .json({ message: "Please verify your email with Google before signing in." });
    }

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: data.name,
          authProvider: "GOOGLE",
        },
      });
    }

    return grantSession(res, user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "OAuth failed" });
  }
};

export const me = async (req, res) => {
  try {
    const token = readSessionToken(req);
    if (!token) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.Secret_Token);
    } catch {
      return res.status(401).json({ message: "Invalid token" });
    }

    let user;
    try {
      user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          name: true,
          email: true,
          photoUrl: true,
          // The caller's OWN role, which the UI needs to decide whether to show
          // the admin view — a track-filtered visitor sees only their track,
          // while an admin sees every exam and every tool. Safe to return: it
          // tells a user what they already are, and every admin-only endpoint
          // still checks the role server-side in adminIdentifier.js rather than
          // trusting anything the client says about itself.
          role: true,
          // The chosen track, returned here as well as on /api/user/me so the
          // narrowing can be applied on the FIRST render after sign-in. The
          // profile endpoint is only fetched on the profile page; waiting for
          // it would mean every other page briefly showed the unfiltered site
          // and then re-rendered, which is exactly the flash this is meant to
          // remove.
          audienceId: true,
          focusExam: true,
        },
      });
    } catch (dbErr) {
      console.error("DB ERROR in /me:", dbErr);
      return res.status(503).json({ message: "Database unavailable" });
    }

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    return res.json({ user: publicUser(user) });
  } catch (err) {
    console.error("ME UNKNOWN ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const logout = (req, res) => {
  // Cleared with the attributes it was set with. A browser matches a deletion
  // by name, domain and path, so `path: "/"` is the part that must agree —
  // sameSite and secure disagreeing with COOKIE_OPTS meant the clearing
  // Set-Cookie was itself a SameSite=Lax, non-Secure cookie, which is a header
  // some browsers will not even accept over the cross-site request that logout
  // is here. Reusing COOKIE_OPTS keeps the two ends from drifting again.
  const { maxAge, ...clearOpts } = COOKIE_OPTS;
  res.clearCookie("token", clearOpts);

  // The bearer copy lives in the client's localStorage, out of this server's
  // reach — the frontend drops it in the same handler that calls this. Nothing
  // here can revoke it, which is what a 7-day stateless JWT means in both
  // carriers: the cookie stops being sent, the token stops being attached, and
  // neither is invalidated server-side.
  return res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
};

// controllers/userStatsController.js
export const getUserStats = async (req, res) => {
  try {
    const userId = req.userId;

    // 1. Fetch User Profile
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, email: true, photoUrl: true, bio: true,
        authProvider: true, preferredMedium: true, createdAt: true
      }
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    // 2. Fetch Sessions
    const sessions = await prisma.testSession.findMany({
      where: { userId: userId },
      include: {
        examCategory: { select: { name: true } },
        answers: { select: { isCorrect: true } },
        _count: { select: { questions: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // 3. Calculate Stats & Map History
    // ... (Stats calculation logic same as before) ...
    const totalGenerated = sessions.length;
    const attemptedSessions = sessions.filter(s => s.answers.length > 0);
    let totalAttempted = attemptedSessions.length;

    let totalScoreSum = 0;
    let bestScore = 0;

    const history = sessions.map(session => {
      const totalQ = session._count.questions || session.numQuestions || 0;
      const correct = session.answers.filter(a => a.isCorrect).length;
      const percentage = totalQ > 0 ? Math.round((correct / totalQ) * 100) : 0;

      if (session.answers.length > 0) {
        totalScoreSum += percentage;
        if (percentage > bestScore) bestScore = percentage;
      }

      return {
        id: session.id,
        examName: session.examCategory?.name || session.examType,
        date: session.createdAt,
        score: percentage,
        totalQuestions: totalQ,
        difficulty: session.difficulty,
        status: session.answers.length >= totalQ ? 'Completed' : 'Incomplete'
      };
    });

    // Real papers sat through the PYQ player.
    //
    // These live in PyqAttempt, not TestSession — a real paper cannot be stored
    // as a generated one (see the model's own note). Reading only TestSession
    // here is why a candidate who had sat several papers still saw "0 tests
    // attempted" and an empty history: the sittings existed, this endpoint just
    // never looked at them.
    const attempts = await prisma.pyqAttempt.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const attemptHistory = attempts.map((a) => ({
      id: a.id,
      examName: [a.examName, a.year, a.label].filter(Boolean).join(" · "),
      date: a.createdAt,
      score: a.percent,
      totalQuestions: a.correct + a.wrong + a.unattempted,
      // PyqAttempt now holds generated mock tests as well as real shifts, so
      // this reads the row rather than assuming. Labelling a drawn paper
      // "Actual paper" would misreport it in the one place a candidate goes to
      // check what they have actually sat.
      difficulty: a.kind === "generated" ? "Generated mock" : "Actual paper",
      status: "Completed",
      kind: a.kind,
    }));

    for (const a of attempts) {
      totalAttempted += 1;
      totalScoreSum += a.percent;
      if (a.percent > bestScore) bestScore = a.percent;
    }

    const averageScore = totalAttempted > 0 ? Math.round(totalScoreSum / totalAttempted) : 0;

    const merged = [...history, ...attemptHistory].sort(
      (x, y) => new Date(y.date).getTime() - new Date(x.date).getTime()
    );

    res.json({
      success: true,
      user,
      stats: { totalGenerated, totalAttempted, averageScore, bestScore, papersSat: attempts.length },
      history: merged.slice(0, 10)
    });

  } catch (err) {
    console.error("Stats Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};



const cleanExpiredPendingUsers = async () => {
  try {
    const deleted =
      await prisma.pendingUser.deleteMany({
        where: {
          otpExpiresAt: {
            lt: new Date(),
          },
        },
      });

    console.log(
      `Deleted ${deleted.count} expired pending users`
    );
  } catch (err) {
    console.error(
      "Pending cleanup failed:",
      err
    );
  }
};

setInterval(
  cleanExpiredPendingUsers,
  60 * 1000
);
