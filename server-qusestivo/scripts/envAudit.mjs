/**
 * Environment audit.
 *
 *   node scripts/envAudit.mjs
 *
 * Reports what is set, what is missing, and — for the credentials that have
 * actually caused outages here — whether the value WORKS, not merely whether
 * it is present. A refresh token that is present but expired looks identical
 * to a good one in a dashboard, which is precisely how this stalled.
 *
 * Secrets are never printed in full.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const mask = (v) => (!v ? "" : v.length <= 10 ? "***" : `${v.slice(0, 4)}…${v.slice(-4)} (${v.length})`);
const ok = (s) => `  \x1b[32mOK\x1b[0m   ${s}`;
const bad = (s) => `  \x1b[31mFAIL\x1b[0m ${s}`;
const warn = (s) => `  \x1b[33mWARN\x1b[0m ${s}`;

const REQUIRED = [
  ["DATABASE_URL", "Postgres connection"],
  ["FRONTEND_URL", "CORS origin — must be the Vercel URL"],
  ["Secret_Token", "guards /api/*/health and /api/gmail/setup"],
  ["HMAC_VARIFICATION_CODE_SECRET", "OTP hashing"],
  ["GOOGLE_CLIENT_ID", "OAuth client"],
  ["GOOGLE_CLIENT_SECRET", "OAuth client"],
  ["GOOGLE_REDIRECT_URI", "must match Cloud Console exactly"],
  ["GOOGLE_REFRESH_TOKEN", "Gmail send + Drive"],
  ["MAIL_FROM", "sending address"],
  ["GROQ_API_KEY", "AI generation"],
];

console.log("\n=== PRESENCE ===");
let missing = 0;
for (const [key, why] of REQUIRED) {
  const v = process.env[key];
  if (v) console.log(ok(`${key.padEnd(32)} ${mask(v)}`));
  else {
    console.log(bad(`${key.padEnd(32)} MISSING — ${why}`));
    missing++;
  }
}

console.log("\n=== CONSISTENCY ===");
const redirect = process.env.GOOGLE_REDIRECT_URI || "";
const front = process.env.FRONTEND_URL || "";
if (/\/oauth2callback$/.test(redirect)) console.log(ok(`GOOGLE_REDIRECT_URI ends /oauth2callback`));
else console.log(bad(`GOOGLE_REDIRECT_URI should end with /oauth2callback — got "${redirect}"`));

if (front.includes("vercel.app") || front.includes("localhost"))
  console.log(ok(`FRONTEND_URL looks like the frontend (${front})`));
else console.log(warn(`FRONTEND_URL = "${front}" — should be the Vercel site, not the API`));

const rt = process.env.GOOGLE_REFRESH_TOKEN || "";
if (rt.startsWith("1//")) console.log(ok("GOOGLE_REFRESH_TOKEN has refresh-token format (1//)"));
else if (rt.startsWith("4/")) console.log(bad('GOOGLE_REFRESH_TOKEN is a one-time AUTH CODE (4/…), not a refresh token'));
else if (rt) console.log(warn("GOOGLE_REFRESH_TOKEN has an unexpected prefix"));

if ((process.env.Secret_Token || "").startsWith("GOCSPX-"))
  console.log(bad("Secret_Token is set to a Google CLIENT SECRET (GOCSPX-…). Use a random value instead."));

console.log("\n=== LIVE CHECKS ===");

// Gmail
try {
  const { verifyMailTransport } = await import("../config/gmail.js");
  const kind = await verifyMailTransport();
  console.log(ok(`Gmail token WORKS (${kind}) — sender ${process.env.MAIL_FROM}`));
} catch (e) {
  console.log(bad(`Gmail token FAILS — ${e.message.split("\n")[0].slice(0, 120)}`));
}

// Groq
const groqKeys = Object.keys(process.env).filter((k) => /^GROQ_API_KEY(_\d+)?$/.test(k));
let live = 0;
for (const k of groqKeys) {
  const r = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${process.env[k]}` },
  });
  if (r.ok) live++;
  else console.log(bad(`${k} rejected (HTTP ${r.status})`));
}
if (live) console.log(ok(`${live}/${groqKeys.length} Groq key(s) working`));

// Drive
try {
  const { driveStatus } = await import("../src/lib/driveDiagrams.js");
  const s = driveStatus();
  console.log(s.configured ? ok("Drive credentials present") : warn("Drive not configured — diagrams fall back to SVG"));
} catch {
  /* optional */
}

console.log("\n=== WHAT RENDER NEEDS ===");
console.log("  These must be set in Render → Environment with the SAME values:");
for (const [key] of REQUIRED) {
  if (key === "FRONTEND_URL") continue;
  console.log(`    ${key}`);
}
console.log("  FRONTEND_URL   = https://questivo.vercel.app");
console.log("\n  Copy the working refresh token out with:");
console.log("    node -e \"require('dotenv').config();console.log(process.env.GOOGLE_REFRESH_TOKEN)\"\n");

process.exitCode = missing ? 1 : 0;
