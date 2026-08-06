import express from "express";
import dotenv from "dotenv";
import http from "http"; // 🛠️ Import HTTP module
import { Server } from "socket.io"; // 🛠️ Import Socket.io
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

// Routes
import testRoutes from "./src/routes/testRoutes.js";
import categoryRoutes from "./src/routes/categoryRoutes.js";
import topicRoutes from "./src/routes/topicRoutes.js";
import authrouter from "./src/routes/auth.routes.js";
import adminRoutes from "./src/routes/adminRoutes.js";
import userroter from './src/routes/userRoutes.js';
import resumeRouter from "./src/routes/resumeRoutes.js";
import interviewRoutes from "./src/routes/interviewRoutes.js";
import pyqRoutes from "./src/routes/pyqRoutes.js";

// Sockets
import { initializeInterviewSocket } from "./src/agentic-mock-test/interviewSocket.js"; // 🛠️ Import your socket logic
import { credentialReport } from "./src/lib/aiClient.js";
import gmailSetupRoutes from "./src/routes/gmailSetupRoutes.js";
import { sweepOtpThrottle } from "./src/lib/otpThrottle.js";
import { entitlementsFor } from "./src/lib/entitlements.js";
import { optionalUser } from "./src/middleware/optionalAuth.js";
import { ALLOWED_ORIGINS, isAllowedOrigin } from "./src/lib/allowedOrigins.js";
import { requireAdmin } from "./src/lib/adminAccess.js";

dotenv.config();

const app = express();
const server = http.createServer(app); // 🛠️ Wrap express app in HTTP server

// Socket.io initialization
initializeInterviewSocket(server); 

/**
 * Response headers that cost nothing and close whole classes of attack.
 *
 * There were none. This API answers with JSON, so the headline risks helmet
 * covers — framing, sniffing, referrer leakage — are smaller here than on an
 * HTML site, but "smaller" is not "absent": /api/gmail/setup renders real HTML,
 * error pages render HTML, and nosniff is what stops a browser from deciding
 * that a JSON response was really a script.
 *
 * CSP is left off. This server serves an API and two setup pages; the policy
 * that would suit them is not the policy that suits the app, and a wrong CSP
 * that silently blocks a resource is worse than a documented absence. The site
 * itself is served by Vercel, where its headers are set in vercel.json.
 *
 * `x-powered-by` goes with it — it told every caller the stack and framework
 * for no benefit to anyone but the person choosing which exploit to try.
 */
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: false,
    // Images and audio generated here are fetched by the site on another
    // origin; the default same-origin policy would block them.
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

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
 * The list itself now lives in lib/allowedOrigins.js, because socket.io needs
 * the same one and had been left on '*' while this file grew a careful
 * allow-list. Extra origins: CORS_ORIGINS=https://a.com,https://b.com
 */
console.log("[CORS] allowed origins:", [...ALLOWED_ORIGINS].join(", "));

app.use(
  cors({
    origin(origin, cb) {
      if (isAllowedOrigin(origin)) return cb(null, true);
      // Name the rejected origin: the browser only reports the mismatch, which
      // makes this the single hardest CORS failure to diagnose from the client.
      console.warn(`[CORS] blocked origin: ${origin}`);
      // Marked so the error handler answers 403 rather than reporting a refused
      // origin as "something went wrong" — a 500 here reads as our bug and
      // sends whoever is debugging it looking in the wrong place.
      const err = new Error(`Origin not allowed by CORS: ${origin}`);
      err.statusCode = 403;
      err.isOperational = true;
      return cb(err);
    },
    credentials: true,
  })
);

/**
 * Trust the proxy chain.
 *
 * The API is reached through Vercel's /api rewrite and then Render's load
 * balancer, so every request arrives from a proxy. Without this, req.ip is the
 * proxy's address for all of them and any per-address limit treats the entire
 * internet as one client — which is the difference between a rate limit and a
 * global outage the first time it fires.
 *
 * A number, not `true`: `true` trusts the whole X-Forwarded-For chain, and a
 * caller can prepend anything they like to that header to look like a fresh
 * address on every request. Counting exactly the hops we actually run in front
 * of this leaves the left-most entry as the one the first trusted proxy
 * observed. Set TRUST_PROXY_HOPS if the deployment gains or loses a layer.
 */
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 2));

app.use(cookieParser());
/**
 * Body size caps.
 *
 * express.json() defaults to 100kb, which is fine — but urlencoded had no
 * explicit limit and the same default, and neither said so. Stating them keeps
 * a future "just raise it for this one upload" from raising it for every
 * endpoint at once. File uploads do not come through here; multer handles those
 * with its own limit.
 */
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

/**
 * Which features this caller may use right now.
 *
 * Read by the UI on load so the badge, the menu, the CTAs and the route guard
 * all follow the same switch. Without it the free/premium line lived in a
 * compiled-in frontend constant, which meant changing it needed a redeploy of
 * the site and could drift from what the API would actually allow.
 *
 * `optionalUser`, not `protect`: signed-out visitors and crawlers must still
 * get an answer — this endpoint decides what the homepage promotes. It is
 * public, it just no longer says the same thing to everyone, because an
 * entitlement can now be granted to one account.
 *
 * WHICH MAKES IT UNCACHEABLE, AND SAYING SO MATTERS
 *
 * The response now varies by session. Anything in front of this — a CDN, a
 * corporate proxy, the browser's own store — that kept one copy would serve a
 * granted user's answer to the next anonymous visitor, which advertises a paid
 * feature to someone the API will refuse. `private, no-store` says do not keep
 * it at all; `Vary` is belt and braces for anything that ignores the first.
 *
 * res.vary(), not res.set("Vary", …). The cors middleware above is configured
 * with a function rather than a fixed origin, which means it has already put
 * `Vary: Origin` on this response — and `set` REPLACES a header where `vary`
 * appends to it. Overwriting it would drop the one field that keeps an answer
 * for questivo.vercel.app from being reused for questivo.sutradharlabs.me.
 *
 * Declared before the routers so no wildcard can shadow it.
 */
app.get("/api/features", optionalUser, (req, res) => {
  res.set("Cache-Control", "private, no-store");
  res.vary("Cookie");
  res.vary("Authorization");
  res.json({ success: true, data: entitlementsFor(req.user) });
});

/**
 * `/api/mail` is deliberately not mounted any more.
 *
 * It carried exactly one route — POST /api/mail/send — with no authentication,
 * no rate limit, and no validation, which interpolated the caller's `message`
 * straight into the HTML body of a mail sent FROM this project's Gmail account:
 *
 *     await sendMail(email, subject, `<h3>${message}</h3>`);
 *
 * That is an open relay. Anyone on the internet could send arbitrary HTML to
 * arbitrary recipients over our sending reputation — phishing wearing our
 * domain, and a straight line to the Gmail account being suspended and the
 * domain blacklisted, which would take every OTP on the site down with it.
 *
 * Nothing called it: the frontend has no reference to /api/mail/send and
 * neither does any script. It was reachable, dangerous, and unused, so it is
 * gone rather than guarded. The transport itself (config/gmail.js) is
 * untouched — the auth flows still send their codes.
 *
 * If a contact form is wanted later, it needs its own route with: an
 * authenticated or captcha-gated caller, a fixed recipient (never one supplied
 * by the request), an escaped body, and a rate limit.
 */
app.use("/api/resume", resumeRouter);
app.use("/api/interview", interviewRoutes);
// Previous year questions + the course request form for exams not covered yet.
// Mounted before testRoutes because testRoutes owns the bare "/api" prefix.
app.use("/api/pyq", pyqRoutes);
app.use("/api", testRoutes);
app.use("/api/category", categoryRoutes);
app.use("/api/cate_topics", topicRoutes);
// The auth limiter is applied inside auth.routes.js, per credential endpoint,
// rather than to the whole prefix — /api/auth/me runs on every page load and
// must not share a budget with password attempts. See middleware/rateLimits.js.
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
app.get("/api/mail/health", requireAdmin, async (req, res) => {
  try {
    const { verifyMailTransport } = await import("./config/gmail.js");
    const transport = await verifyMailTransport();
    res.json({ ok: true, transport, sender: process.env.MAIL_FROM || null });
  } catch (err) {
    res.status(503).json({
      ok: false,
      error: err.message,
      clientId: (process.env.GOOGLE_CLIENT_ID || "").split("-")[0] || null,
      hint: "Re-mint at /api/gmail/setup?token=<ADMIN_API_TOKEN> ON THIS SERVER, then set GOOGLE_REFRESH_TOKEN here.",
    });
  }
});

/**
 * AI credential pool status. Shows which keys are live, cooling down after a
 * rate limit, or disabled because the token expired. Never returns key values.
 *
 * Admin-only: the provider list and failure counts are useful operational
 * detail that does not need to be public. See lib/adminAccess.js for why the
 * gate is no longer a comparison against the JWT signing key.
 */
app.get("/api/ai/health", requireAdmin, (req, res) => {
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

/**
 * The last middleware: turn an error into JSON.
 *
 * There was no error handler at all, so every AppError thrown by `protect` fell
 * through to Express's built-in one — which answers with an HTML page. A
 * frontend calling fetch().json() on that gets a parse failure and reports "a
 * network error", which is how an ordinary expired session came to look like
 * the API being down.
 *
 * The message is only echoed for errors this code raised deliberately
 * (AppError sets isOperational). Anything else — a Prisma failure, a TypeError,
 * a driver timeout — is reported as a generic 500, because those messages
 * routinely carry table names, column names, file paths and occasionally a
 * connection string. The real one goes to the log, where it is useful and not
 * public.
 *
 * Four arguments, and it must stay four: Express identifies error handlers by
 * arity, and dropping `next` silently turns this into an ordinary middleware
 * that never runs.
 */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err?.statusCode || err?.status || 500;
  const operational = err?.isOperational === true && status < 500;

  if (!operational) {
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  }

  if (res.headersSent) return;

  res.status(status).json({
    success: false,
    message: operational ? err.message : "Something went wrong. Please try again.",
    error: operational ? err.message : "Internal server error",
  });
});

const PORT = process.env.PORT || 4000;

// 🛠️ IMPORTANT: Server.listen use karo, app.listen nahi
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

/**
 * Drop OTP throttle rows nothing will read again.
 *
 * Hourly rather than per-minute because it is safe to run on every instance —
 * the delete is idempotent, so N servers doing it is correct, just N times the
 * work. An hour keeps that waste at nothing while still bounding the table.
 * `unref()` so a stray timer cannot hold the process open during a shutdown.
 */
const otpSweep = setInterval(() => void sweepOtpThrottle(), 60 * 60 * 1000);
otpSweep.unref();