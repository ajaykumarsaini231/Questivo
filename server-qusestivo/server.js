import express from "express";
import dotenv from "dotenv";
import http from "http"; // 🛠️ Import HTTP module
import { Server } from "socket.io"; // 🛠️ Import Socket.io
import cors from "cors";
import cookieParser from "cookie-parser";

// Routes
import testRoutes from "./src/routes/testRoutes.js";
import categoryRoutes from "./src/routes/categoryRoutes.js";
import topicRoutes from "./src/routes/topicRoutes.js";
import authrouter from "./src/routes/auth.routes.js";
import adminRoutes from "./src/routes/adminRoutes.js";
import userroter from './src/routes/userRoutes.js';
import mailRoutes from "./src/routes/mailRoutes.js";
import resumeRouter from "./src/routes/resumeRoutes.js";
import interviewRoutes from "./src/routes/interviewRoutes.js";
import pyqRoutes from "./src/routes/pyqRoutes.js";

// Sockets
import { initializeInterviewSocket } from "./src/agentic-mock-test/interviewSocket.js"; // 🛠️ Import your socket logic
import { credentialReport } from "./src/lib/aiClient.js";
import gmailSetupRoutes from "./src/routes/gmailSetupRoutes.js";

dotenv.config();

const app = express();
const server = http.createServer(app); // 🛠️ Wrap express app in HTTP server

// Socket.io initialization
initializeInterviewSocket(server); 

/**
 * CORS.
 *
 * `origin: FRONTEND_URL` allowed exactly ONE frontend, so whichever origin was
 * not configured got "Access-Control-Allow-Origin ... is not equal to the
 * supplied origin" on every preflight. There is more than one legitimate
 * frontend here — the deployed Vercel site and the local dev server — so the
 * allow-list has to be a set, not a single string.
 *
 * With credentials:true the wildcard "*" is illegal, so the matched origin must
 * be echoed back explicitly. That is what returning the origin from this
 * function does.
 *
 * Extra origins: CORS_ORIGINS=https://a.com,https://b.com
 */
const ALLOWED_ORIGINS = new Set(
  [
    process.env.FRONTEND_URL,
    ...(process.env.CORS_ORIGINS || "").split(",").map((s) => s.trim()),
    // Vite dev server, both spellings the browser may send.
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://questivo.vercel.app",
  ]
    .filter(Boolean)
    .map((o) => o.replace(/\/$/, ""))
);

console.log("[CORS] allowed origins:", [...ALLOWED_ORIGINS].join(", "));

app.use(
  cors({
    origin(origin, cb) {
      // Same-origin requests, curl and server-to-server calls send no Origin.
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.has(origin.replace(/\/$/, ""))) return cb(null, true);
      // Name the rejected origin: the browser only reports the mismatch, which
      // makes this the single hardest CORS failure to diagnose from the client.
      console.warn(`[CORS] blocked origin: ${origin}`);
      return cb(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/mail", mailRoutes);
app.use("/api/resume", resumeRouter);
app.use("/api/interview", interviewRoutes);
// Previous year questions + the course request form for exams not covered yet.
// Mounted before testRoutes because testRoutes owns the bare "/api" prefix.
app.use("/api/pyq", pyqRoutes);
app.use("/api", testRoutes);
app.use("/api/category", categoryRoutes);
app.use("/api/cate_topics", topicRoutes);
app.use("/api/auth", authrouter);
app.use("/api/user", userroter);
app.use("/api/admin", adminRoutes);

// Gmail OAuth setup. Mounted at the root so /oauth2callback matches the
// redirect URI already registered in Google Cloud Console.
app.use(gmailSetupRoutes);

app.get("/", (req, res) => {
  res.send("Mock test API running");
});

/**
 * Mail health. Tells you whether the Gmail credentials in THIS environment can
 * mint an access token — the check that matters, because a token minted
 * against a different client verifies locally and still fails here.
 */
app.get("/api/mail/health", async (req, res) => {
  if (!process.env.Secret_Token || req.headers["x-admin-token"] !== process.env.Secret_Token) {
    return res.status(401).json({ error: "unauthorized" });
  }
  try {
    const { verifyMailTransport } = await import("./config/gmail.js");
    const transport = await verifyMailTransport();
    res.json({ ok: true, transport, sender: process.env.MAIL_FROM || null });
  } catch (err) {
    res.status(503).json({
      ok: false,
      error: err.message,
      clientId: (process.env.GOOGLE_CLIENT_ID || "").split("-")[0] || null,
      hint: "Re-mint at /api/gmail/setup?token=<Secret_Token> ON THIS SERVER, then set GOOGLE_REFRESH_TOKEN here.",
    });
  }
});

/**
 * AI credential pool status. Shows which keys are live, cooling down after a
 * rate limit, or disabled because the token expired. Never returns key values.
 *
 * Guarded by Secret_Token: the provider list and failure counts are useful
 * operational detail that does not need to be public.
 */
app.get("/api/ai/health", (req, res) => {
  const token = req.headers["x-admin-token"];
  if (!process.env.Secret_Token || token !== process.env.Secret_Token) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const credentials = credentialReport();
  res.json({
    ok: credentials.some((c) => c.state === "ready"),
    total: credentials.length,
    ready: credentials.filter((c) => c.state === "ready").length,
    coolingDown: credentials.filter((c) => c.state === "cooling-down").length,
    disabled: credentials.filter((c) => c.state === "disabled").length,
    credentials,
  });
});

const PORT = process.env.PORT || 4000;

// 🛠️ IMPORTANT: Server.listen use karo, app.listen nahi
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});