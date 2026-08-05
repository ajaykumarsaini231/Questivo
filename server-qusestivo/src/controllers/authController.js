import jwt from "jsonwebtoken";
import axios from "axios";
import prisma from "../prismaClient.js";

import {
  signupSchema,
  signinSchema,
} from "../middleware/validator.js";

import { doHash, dohashValidation, hmacProcess } from "../utills/hashing.js";
import { transport } from "../middleware/sendmail.js";
import { guardOtpSend, OTP_PURPOSES } from "../lib/otpThrottle.js";

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

const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,          // MUST (https)
  sameSite: "None",      // MUST (cross-site)
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
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
    if (exists) return res.status(400).json({ message: "User already exists" });

    // Throttled BEFORE the pending row is touched. Checking afterwards would
    // let a refused request still wipe the pending signup the caller already
    // had, which is a denial of service against the victim rather than against
    // the attacker.
    if (!(await guardOtpSend(req, res, { identifier: email, purpose: OTP_PURPOSES.SIGNUP }))) return;

    await prisma.pendingUser.deleteMany({ where: { email } });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

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

    const pending = await prisma.pendingUser.findUnique({ where: { email } });
    if (!pending || pending.otpExpiry < new Date())
      return res.status(400).json({ message: "OTP invalid or expired" });

    if (
      pending.otpHash !==
      hmacProcess(otp, process.env.HMAC_VARIFICATION_CODE_SECRET)
    )
      return res.status(400).json({ message: "OTP invalid" });

    const user = await prisma.user.create({
      data: {
        email,
        name: pending.name,
        passwordHash: pending.passwordHash,
        authProvider: "LOCAL",
      },
    });

    await prisma.pendingUser.delete({ where: { email } });

    const token = signJwt({ userId: user.id });
    res.cookie("token", token, COOKIE_OPTS);
    res.json({ success: true, user: publicUser(user) });
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

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash)
      return res.status(401).json({ message: "Invalid credentials" });

    const ok = await dohashValidation(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const token = signJwt({ userId: user.id });
    res.cookie("token", token, COOKIE_OPTS);
    res.json({ success: true, user: publicUser(user) });
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
    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

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

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.otpPurpose !== "LOGIN")
      return res.status(400).json({ message: "Invalid request" });

    if (user.otpExpiresAt < new Date())
      return res.status(400).json({ message: "OTP expired" });

    if (
      user.otpHash !==
      hmacProcess(otp, process.env.HMAC_VARIFICATION_CODE_SECRET)
    )
      return res.status(400).json({ message: "Invalid OTP" });

    await prisma.user.update({
      where: { email },
      data: { otpHash: null, otpExpiresAt: null, otpPurpose: null },
    });

    const token = signJwt({ userId: user.id });
    res.cookie("token", token, COOKIE_OPTS);
    res.json({ success: true, user: publicUser(user) });
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
    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
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

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
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

    if (user.otpHash !== hashedOtp) {
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

    res.json({ success: true });
  } catch (err) {
    console.error("VERIFY RESET OTP ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};




/* =====================================================
   GOOGLE / FACEBOOK AUTH
===================================================== */

export const googleAuth = async (req, res) => {
  try {
    const { accessToken } = req.body;

    const { data } = await axios.get(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    let user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: data.email,
          name: data.name,
          authProvider: "GOOGLE",
        },
      });
    }

    const token = signJwt({ userId: user.id });
    res.cookie("token", token, COOKIE_OPTS);
    res.json({ success: true, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "OAuth failed" });
  }
};

export const me = async (req, res) => {
  try {
    const token = req.cookies?.token;
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
  res.clearCookie("token", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

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
