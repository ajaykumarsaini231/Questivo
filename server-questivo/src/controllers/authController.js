import jwt from "jsonwebtoken";
import axios from "axios";
import prisma from "../prismaClient.js";

import {
  signupSchema,
  signinSchema,
} from "../middleware/validator.js";

import { doHash, dohashValidation, hmacProcess } from "../utills/hashing.js";
import { transport } from "../middleware/sendmail.js";

const OTP_SECRET = process.env.HMAC_VARIFICATION_CODE_SECRET;

if (!OTP_SECRET) {
  throw new Error("HMAC_VARIFICATION_CODE_SECRET not set");
}


/* ===================== HELPERS ===================== */

const signJwt = (payload) =>
  jwt.sign(payload, process.env.Secret_Token, { expiresIn: "7d" });

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "Lax",
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
  subject: "🎉 Welcome to Quistivo – Verify Your Email",
  html: `
    <div style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;padding:24px;">
      
      <div style="text-align:center;margin-bottom:20px;">
        <h1 style="color:#4f46e5;margin:0;">Quistivo</h1>
        <p style="color:#6b7280;font-size:14px;margin-top:4px;">
          Smart Practice. Real Results.
        </p>
      </div>

      <p style="font-size:16px;color:#111827;">
        Hi <strong>${email}</strong>,
      </p>

      <p style="font-size:15px;color:#374151;line-height:1.6;">
        Welcome to <strong>Quistivo</strong>! 🎯  
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
        © ${new Date().getFullYear()} Quistivo. All rights reserved.<br/>
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
    res.json({ success: true, user });
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
    res.json({ success: true, user });
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
  subject: "Your Quistivo Login OTP",
  html: `
    <div style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;padding:24px;">
      
      <div style="text-align:center;margin-bottom:20px;">
        <h1 style="color:#4f46e5;margin:0;">Quistivo</h1>
        <p style="color:#6b7280;font-size:14px;margin-top:4px;">
          Smart Practice. Real Results.
        </p>
      </div>

      <p style="font-size:16px;color:#111827;">
        Hi <strong>${email}</strong>,
      </p>

      <p style="font-size:15px;color:#374151;line-height:1.6;">
        We noticed a login attempt on your <strong>Quistivo</strong> account.
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
        © ${new Date().getFullYear()} Quistivo. All rights reserved.<br/>
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
    res.json({ success: true, user });
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
  subject: "Quistivo Password Reset Code – Secure Your Account",
  html: `
    <div style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;padding:24px;">
      
      <div style="text-align:center;margin-bottom:20px;">
        <h1 style="color:#4f46e5;margin:0;">Quistivo</h1>
        <p style="color:#6b7280;font-size:14px;margin-top:4px;">
          Smart Practice. Real Results.
        </p>
      </div>

      <p style="font-size:16px;color:#111827;">
        Hi <strong>${email}</strong>,
      </p>

      <p style="font-size:15px;color:#374151;line-height:1.6;">
        We received a request to reset your <strong>Quistivo</strong> account password.
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
        © ${new Date().getFullYear()} Quistivo. All rights reserved.<br/>
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

    console.log("RAW BODY:", req.body);

    if (!email || !otp || !newPassword) {
      console.log("FAIL: missing fields");
      return res.status(400).json({ message: "Missing fields" });
    }

    email = email.trim().toLowerCase();
    otp = otp.toString();

    const user = await prisma.user.findUnique({ where: { email } });

    console.log("DB USER:", {
      exists: !!user,
      otpPurpose: user?.otpPurpose,
      otpExpiresAt: user?.otpExpiresAt,
      now: new Date(),
      otpHash: user?.otpHash,
      incomingOtpHash: hmacProcess(
        otp,
        process.env.HMAC_VARIFICATION_CODE_SECRET
      ),
    });

    if (!user) {
      console.log("FAIL: user not found");
      return res.status(400).json({ message: "User not found" });
    }

    if (user.otpPurpose !== "RESET_PASSWORD") {
      console.log("FAIL: otpPurpose mismatch", user.otpPurpose);
      return res.status(400).json({ message: "OTP purpose invalid" });
    }

    if (!user.otpExpiresAt || user.otpExpiresAt < new Date()) {
      console.log("FAIL: OTP expired");
      return res.status(400).json({ message: "OTP expired" });
    }

    const hashedOtp = hmacProcess(
      otp,
      process.env.HMAC_VARIFICATION_CODE_SECRET
    );

    if (user.otpHash !== hashedOtp) {
      console.log("FAIL: OTP mismatch");
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

    console.log("SUCCESS: password reset");
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
    res.json({ success: true, user });
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
        },
      });
    } catch (dbErr) {
      console.error("DB ERROR in /me:", dbErr);
      return res.status(503).json({ message: "Database unavailable" });
    }

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    return res.json({ user });
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
    const totalAttempted = attemptedSessions.length;
    
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

      // 👇👇👇 IMPORTANCE: This ID mapping is causing your error if missing
      return {
        id: session.id, // <--- YE LINE MOST IMPORTANT HAI
        examName: session.examCategory?.name || session.examType,
        date: session.createdAt,
        score: percentage,
        totalQuestions: totalQ,
        difficulty: session.difficulty,
        status: session.answers.length >= totalQ ? 'Completed' : 'Incomplete'
      };
    });

    const averageScore = totalAttempted > 0 ? Math.round(totalScoreSum / totalAttempted) : 0;

    res.json({
      success: true,
      user,
      stats: { totalGenerated, totalAttempted, averageScore, bestScore },
      history: history.slice(0, 10) 
    });

  } catch (err) {
    console.error("Stats Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};



/* =====================================================
   CLEANUP — EXPIRED PENDING USERS
===================================================== */

const cleanExpiredPendingUsers = async () => {
  try {
    await prisma.pendingUser.deleteMany({
      where: { otpExpiry: { lt: new Date() } },
    });
  } catch (err) {
    console.error("Pending cleanup failed:", err);
  }
};

setInterval(cleanExpiredPendingUsers, 15 * 60 * 1000);
