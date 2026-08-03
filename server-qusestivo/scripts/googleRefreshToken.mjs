/**
 * Google OAuth refresh-token helper for the Gmail sender.
 *
 *   node scripts/googleRefreshToken.mjs           # full flow
 *   node scripts/googleRefreshToken.mjs --check   # just test the current token
 *
 * Replaces the old getRefreshToken.js + exchangeCode.js pair, where
 * exchangeCode.js had a hard-coded authorisation code. Those codes are
 * single-use and expire in minutes, so that script could only ever have worked
 * once.
 *
 * WHAT THIS SCRIPT CANNOT DO: sign in to your Google account. Granting consent
 * requires your Google password, which no automation here should ever touch.
 * The script prints a URL, you approve it in your own browser, and it takes
 * over again from the redirect.
 *
 * If your consent screen is still in "Testing", Google expires the refresh
 * token after 7 days and you will be back here. See the note printed at the
 * end.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = path.join(ROOT, ".env");
dotenv.config({ path: ENV_PATH });

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const CONFIGURED_REDIRECT = process.env.GOOGLE_REDIRECT_URI || "";
// gmail.send  - the transactional mailer (src/middleware/sendmail.js)
// drive.readonly - lets the question generator look for an existing diagram in
//                  Drive before falling back to a generated SVG.
// Both are requested together so one consent covers the whole app; asking for
// Drive later would invalidate the Gmail token and send you round again.
const SCOPE = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");
/**
 * Listen on the port the configured redirect URI actually names.
 *
 * This used to be hard-coded to 5555 while the auth URL was built from
 * GOOGLE_REDIRECT_URI. With that set to http://localhost:5173/oauth2callback,
 * Google was told to redirect to 5173 while the script waited on 5555 — so even
 * a successful consent could never be captured, and the script just hung.
 */
function localPortFrom(uri) {
  try {
    const u = new URL(uri);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
      return Number(u.port || 80);
    }
  } catch {
    /* not a URL; fall through to the default */
  }
  return null;
}

const LOCAL_PORT =
  localPortFrom(CONFIGURED_REDIRECT) || Number(process.env.OAUTH_LOCAL_PORT || 5555);
const LOCAL_REDIRECT = `http://localhost:${LOCAL_PORT}/oauth2callback`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing from .env");
  process.exit(1);
}

/* ----------------------------- helpers ---------------------------------- */

async function tokenRequest(params) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  return { ok: res.ok, status: res.status, body: await res.json() };
}

async function checkToken(refreshToken) {
  if (!refreshToken) return { ok: false, body: { error: "no token in .env" } };
  return tokenRequest({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}

function authUrl(redirectUri) {
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    // Both are required to actually get a refresh token back. Without
    // prompt=consent Google returns only an access token on repeat approvals.
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

/**
 * Write the token back without disturbing the rest of the file — this .env
 * holds live database and API credentials, so it is never rewritten wholesale.
 */
function saveRefreshToken(token) {
  fs.copyFileSync(ENV_PATH, ENV_PATH + ".backup");
  const lines = fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/);
  let replaced = false;
  const out = lines.map((l) => {
    if (/^\s*GOOGLE_REFRESH_TOKEN\s*=/.test(l)) {
      replaced = true;
      return `GOOGLE_REFRESH_TOKEN=${token}`;
    }
    return l;
  });
  if (!replaced) out.push(`GOOGLE_REFRESH_TOKEN=${token}`);
  fs.writeFileSync(ENV_PATH, out.join("\n"));
  return replaced;
}

const ask = (q) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => {
      rl.close();
      resolve(a.trim());
    });
  });

/** Serve the redirect once and hand back the ?code= it carries. */
function waitForCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, LOCAL_REDIRECT);
      if (!url.pathname.startsWith("/oauth2callback")) {
        res.writeHead(404).end("not found");
        return;
      }
      const code = url.searchParams.get("code");
      const err = url.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;padding:48px;max-width:32rem">
         <h2>${code ? "Authorised" : "Authorisation failed"}</h2>
         <p>${code ? "You can close this tab and return to the terminal." : "Error: " + err}</p>
         </body>`
      );
      server.close();
      code ? resolve(code) : reject(new Error(err || "no code returned"));
    });
    server.listen(LOCAL_PORT, () => {
      console.log(`Listening on ${LOCAL_REDIRECT} for the redirect...\n`);
    });
    server.on("error", reject);
    setTimeout(() => {
      server.close();
      reject(new Error("timed out after 5 minutes"));
    }, 5 * 60_000);
  });
}

/* ------------------------------- main ----------------------------------- */

console.log("\nGoogle refresh token helper\n  scopes: gmail.send + drive.readonly\n" + "-".repeat(48));

const current = await checkToken(process.env.GOOGLE_REFRESH_TOKEN);
if (current.ok) {
  console.log("Current GOOGLE_REFRESH_TOKEN is VALID.");
  console.log("  scope      :", current.body.scope);
  console.log("  expires_in :", current.body.expires_in, "seconds (access token)");
} else {
  console.log("Current GOOGLE_REFRESH_TOKEN is NOT working.");
  console.log("  error:", current.body.error, "-", current.body.error_description || "");
  if (current.body.error === "invalid_grant") {
    console.log(
      "\n  invalid_grant almost always means one of:\n" +
        "    - the OAuth consent screen is in Testing mode (tokens die after 7 days)\n" +
        "    - the token was revoked, or the Google password was changed\n" +
        "    - the client secret was rotated"
    );
  }
}

if (process.argv.includes("--check")) {
  // Yield once so stdout flushes; exiting mid-write trips a libuv assertion
  // on Windows.
  await new Promise((r) => setImmediate(r));
  process.exit(current.ok ? 0 : 1);
}
if (current.ok && !process.argv.includes("--force")) {
  console.log("\nNothing to do. Re-run with --force to mint a new token anyway.\n");
  process.exit(0);
}

console.log("\n" + "-".repeat(48));
console.log("Configured GOOGLE_REDIRECT_URI:", CONFIGURED_REDIRECT || "(none)");
console.log(
  "\nThis script cannot sign in to your Google account — that needs your\n" +
    "password. You approve in your browser; the script does the rest.\n"
);

const useLocal = CONFIGURED_REDIRECT.startsWith("http://localhost");
let code;

if (useLocal) {
  console.log("Open this URL, pick the Google account that sends your mail, and approve:\n");
  console.log(authUrl(CONFIGURED_REDIRECT) + "\n");
  code = await waitForCode();
} else {
  console.log(
    "Your redirect URI is not localhost, so the browser cannot hand the code\n" +
      "back to this script automatically. Two options:\n\n" +
      `  A) Add  ${LOCAL_REDIRECT}\n` +
      "     to Authorised redirect URIs in Google Cloud Console > Credentials,\n" +
      `     set GOOGLE_REDIRECT_URI=${LOCAL_REDIRECT} in .env, and re-run. Fully automatic.\n\n` +
      "  B) Use the production redirect below. After approving you will land on\n" +
      "     a page that may 404 - that is fine. Copy the FULL URL from the address\n" +
      "     bar and paste it here.\n"
  );
  console.log("Open this URL and approve:\n");
  console.log(authUrl(CONFIGURED_REDIRECT) + "\n");
  const pasted = await ask("Paste the full redirected URL (or just the code): ");
  code = pasted.includes("code=")
    ? new URL(pasted).searchParams.get("code")
    : pasted;
}

if (!code) {
  console.error("\nNo authorisation code captured. Nothing written.\n");
  process.exit(1);
}

console.log("\nExchanging code for tokens...");
const exchanged = await tokenRequest({
  client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET,
  code,
  grant_type: "authorization_code",
  redirect_uri: useLocal ? CONFIGURED_REDIRECT : CONFIGURED_REDIRECT,
});

if (!exchanged.ok) {
  console.error("Exchange failed:", exchanged.body.error, "-", exchanged.body.error_description || "");
  console.error(
    "\nAuthorisation codes are single-use and expire in about 10 minutes.\n" +
      "If you reused an old one, run the script again for a fresh URL.\n"
  );
  process.exit(1);
}

const newToken = exchanged.body.refresh_token;
if (!newToken) {
  console.error(
    "Google returned no refresh_token. This happens when consent was already\n" +
      "granted and access_type=offline/prompt=consent were not both honoured.\n" +
      "Revoke access at https://myaccount.google.com/permissions and retry.\n"
  );
  process.exit(1);
}

const replaced = saveRefreshToken(newToken);

/**
 * Re-read from disk and confirm the value actually landed.
 *
 * A previous run reported "GOOGLE_REFRESH_TOKEN updated in .env" while the file
 * on disk still held the old token, so the operator trusted a write that had not
 * happened. Verifying the in-memory string proves nothing about the file; only
 * reading it back does.
 */
const onDisk = fs.readFileSync(ENV_PATH, "utf8");
const savedLine = onDisk.split(/\r?\n/).find((l) => /^\s*GOOGLE_REFRESH_TOKEN\s*=/.test(l)) || "";
const savedValue = savedLine.slice(savedLine.indexOf("=") + 1).trim();
const persisted = savedValue === newToken;

const verify = await checkToken(newToken);

console.log("\n" + "=".repeat(60));
console.log(replaced ? "GOOGLE_REFRESH_TOKEN updated" : "GOOGLE_REFRESH_TOKEN appended");
console.log("  file          :", ENV_PATH);
console.log("  persisted     :", persisted ? "YES - value re-read from disk matches" : "NO - THE FILE DOES NOT CONTAIN THE NEW TOKEN");
console.log("  token works   :", verify.ok ? "yes" : "NO - " + verify.body.error);
console.log("  granted scope :", exchanged.body.scope);
console.log("=".repeat(60));

if (!persisted) {
  console.log(
    "\n  The write did not land. Usual causes:\n" +
      "    - an editor has .env open and saved an older buffer over it\n" +
      "    - the process lacks write permission on the file\n" +
      "  Paste this line into .env by hand:\n\n" +
      `    GOOGLE_REFRESH_TOKEN=${newToken}\n`
  );
}
console.log(
  "\nIMPORTANT: if your OAuth consent screen is in 'Testing', this token stops\n" +
    "working in 7 days. Google Cloud Console > APIs & Services > OAuth consent\n" +
    "screen > Publish app. Also copy the new value into your Render environment.\n"
);
