/**
 * Repair the .env values that are provably wrong.
 *
 *   node scripts/fixEnv.mjs           # show what would change
 *   node scripts/fixEnv.mjs --apply   # write it (backs up to .env.backup)
 *
 * Only touches keys with a demonstrably incorrect value. Everything else is
 * left exactly as-is.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV = path.join(ROOT, ".env");
dotenv.config({ path: ENV });

const APPLY = process.argv.includes("--apply");
const fixes = [];

/* 1. GOOGLE_REDIRECT_URI -------------------------------------------------
   Must be the BACKEND origin with a scheme, and must match an Authorised
   redirect URI on the OAuth client. It was pointing at the Vercel frontend
   with no https://, which is neither the backend nor a registered value. */
const redirect = process.env.GOOGLE_REDIRECT_URI || "";
const CORRECT_REDIRECT = "https://questivo.onrender.com/oauth2callback";
if (redirect !== CORRECT_REDIRECT) {
  fixes.push({
    key: "GOOGLE_REDIRECT_URI",
    from: redirect,
    to: CORRECT_REDIRECT,
    why:
      "the OAuth callback is served by the BACKEND (onrender.com), not the frontend, " +
      "and it needs the https:// scheme. This is the value registered in Cloud Console.",
  });
}

/* 2. Secret_Token --------------------------------------------------------
   This guards /api/gmail/setup and the health endpoints, and it travels in
   URLs and in the OAuth `state` parameter. It was set to the Google CLIENT
   SECRET, which would leak that credential into browser history and Google's
   logs. It must be an unrelated random value. */
const secretToken = process.env.Secret_Token || "";
if (!secretToken || secretToken === process.env.GOOGLE_CLIENT_SECRET || secretToken.startsWith("GOCSPX-")) {
  fixes.push({
    key: "Secret_Token",
    from: secretToken ? `${secretToken.slice(0, 6)}… (the Google client secret)` : "(empty)",
    to: crypto.randomBytes(24).toString("hex"),
    why: "it must not be the Google client secret — this value ends up in URLs and in Google's logs.",
  });
}

/* 3. GOOGLE_REFRESH_TOKEN ------------------------------------------------
   Cannot be repaired by editing text; Google reports it revoked. Flagged so
   the operator knows a re-mint is required, not a typo fix. */
const rt = process.env.GOOGLE_REFRESH_TOKEN || "";

if (!fixes.length) {
  console.log("\nNothing to fix.\n");
} else {
  console.log(`\n${APPLY ? "APPLYING" : "WOULD CHANGE"} ${fixes.length} value(s):\n`);
  for (const f of fixes) {
    console.log(`  ${f.key}`);
    console.log(`    from : ${f.from || "(empty)"}`);
    console.log(`    to   : ${f.key === "Secret_Token" ? f.to.slice(0, 8) + "… (random, 48 hex)" : f.to}`);
    console.log(`    why  : ${f.why}\n`);
  }
}

if (APPLY && fixes.length) {
  fs.copyFileSync(ENV, ENV + ".backup");
  const lines = fs.readFileSync(ENV, "utf8").split(/\r?\n/);
  for (const f of fixes) {
    let done = false;
    for (let i = 0; i < lines.length; i++) {
      if (new RegExp(`^\\s*${f.key}\\s*=`).test(lines[i])) {
        lines[i] = `${f.key}=${f.to}`;
        done = true;
        break;
      }
    }
    if (!done) lines.push(`${f.key}=${f.to}`);
  }
  fs.writeFileSync(ENV, lines.join("\n"));
  console.log("Written. Backup at .env.backup\n");
}

console.log("=".repeat(66));
console.log("REFRESH TOKEN");
console.log("=".repeat(66));
if (rt.startsWith("1//")) {
  console.log("  Format is correct, but Google reports it revoked, so it must be");
  console.log("  re-minted. A text edit cannot fix this.\n");
} else {
  console.log("  Missing or malformed — must be minted.\n");
}
const st = APPLY && fixes.find((f) => f.key === "Secret_Token") ? fixes.find((f) => f.key === "Secret_Token").to : secretToken;
console.log("  Mint it ON THE DEPLOYED SERVER (redirect URI + client both match there):");
console.log(`    https://questivo.onrender.com/api/gmail/setup?token=${st || "<Secret_Token>"}\n`);
