import express from "express";
import { google } from "googleapis";

/**
 * In-app Gmail OAuth setup, ported from the METNMAT dashboard
 * (app/api/gmail/setup/route.ts + app/oauth2callback/route.ts).
 *
 *   GET /api/gmail/setup?token=<Secret_Token>   -> redirects to Google consent
 *   GET /oauth2callback                         -> exchanges the code, shows the
 *                                                  refresh token to copy
 *
 * WHY THIS AND NOT A LOCAL CLI SCRIPT
 * Every failure so far came from the token being minted somewhere other than
 * where it is used:
 *   - the redirect URI (https://questivo.onrender.com/oauth2callback) is
 *     registered for production, not localhost, so a local mint needs extra
 *     Cloud Console setup;
 *   - Render carries its own GOOGLE_CLIENT_ID, and a refresh token only works
 *     with the client that minted it, so a token minted against the local .env
 *     is invalid in production even when it verifies locally.
 * Running the flow ON the deployed server removes both problems: the redirect
 * URI already matches and the client is by definition the right one.
 *
 * The callback deliberately does NOT write to .env — Render's filesystem is
 * ephemeral, so it prints the value for pasting into the dashboard instead.
 */

const router = express.Router();

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  // Carried so the question-diagram lookup (src/lib/driveDiagrams.js) works off
  // the same token. Re-minting without it would silently disable Drive
  // diagrams, and nothing would surface that until a paper needed a figure.
  "https://www.googleapis.com/auth/drive.readonly",
];

/**
 * Shared-secret gate. This endpoint mints credentials; it must not be public.
 *
 * `state` matters: the callback is invoked BY GOOGLE, so it cannot carry a
 * query param we chose. Google does round-trip `state` verbatim, which is how
 * the secret survives the redirect — the same mechanism METNMAT uses to carry
 * the mailbox role. Without this the callback answered 401 and the operator had
 * to exchange the code by hand.
 */
function requireSecret(req, res) {
  const expected = process.env.Secret_Token;
  const supplied = req.query.token || req.query.state || req.headers["x-admin-token"];
  if (!expected) {
    res.status(500).send(page("Not configured", "<p>Set <code>Secret_Token</code> in the environment first.</p>"));
    return false;
  }
  if (supplied !== expected) {
    res.status(401).send(page("Unauthorized", "<p>Append <code>?token=&lt;Secret_Token&gt;</code> to the URL.</p>"));
    return false;
  }
  return true;
}

function redirectUri() {
  return (
    process.env.GOOGLE_REDIRECT_URI ||
    `${(process.env.PUBLIC_URL || "http://localhost:4000").replace(/\/$/, "")}/oauth2callback`
  );
}

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri()
  );
}

/* --------------------------------- start -------------------------------- */

router.get("/api/gmail/setup", (req, res) => {
  if (!requireSecret(req, res)) return;

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res
      .status(400)
      .send(page("Gmail not configured", "<p>Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> first.</p>"));
  }

  // Pre-select the account that is supposed to send, so the wrong Google
  // account cannot be authorised silently — the easiest mistake here.
  const hint = process.env.MAIL_FROM || process.env.NODE_CODE_SENDING_EMAIL_ADDRESS;

  const url = oauthClient().generateAuthUrl({
    access_type: "offline",
    // Without prompt=consent Google returns only an access token on a repeat
    // approval, and no refresh token at all.
    prompt: "consent",
    include_granted_scopes: true,
    scope: SCOPES,
    // Carries the gate secret through Google and back to /oauth2callback.
    state: process.env.Secret_Token,
    ...(hint ? { login_hint: hint } : {}),
  });

  res.redirect(url);
});

/* -------------------------------- callback ------------------------------ */

router.get("/oauth2callback", async (req, res) => {
  if (!requireSecret(req, res)) return;

  const { code, error } = req.query;
  const secret = req.query.token || req.query.state || "";
  const retry = `/api/gmail/setup?token=${encodeURIComponent(secret)}`;

  if (error) return res.send(page("Authorisation denied", `<p>Google returned: <strong>${esc(String(error))}</strong></p><p><a href="${retry}">Try again</a></p>`));
  if (!code) return res.send(page("Missing code", `<p>No <code>code</code> in the URL. Start at <a href="${retry}">Connect Gmail</a>.</p>`));

  const client = oauthClient();

  try {
    const { tokens } = await client.getToken(String(code));
    const granted = String(tokens.scope || "").split(/\s+/).filter(Boolean);

    if (!tokens.refresh_token) {
      return res.send(
        page(
          "No refresh token returned",
          `<p>Google returned an access token but <strong>no refresh token</strong>, which happens when
            this app was already authorised for the account.</p>
           <ol>
             <li>Open <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">Third-party access</a></li>
             <li>Remove access for this app</li>
             <li><a href="${retry}">Connect again</a></li>
           </ol>`
        )
      );
    }

    // Show which account was actually authorised. Authorising the wrong Google
    // account produces a token that works but sends from the wrong mailbox, and
    // nothing else reveals it.
    let authorizedAs = "";
    try {
      client.setCredentials(tokens);
      const profile = await google.gmail({ version: "v1", auth: client }).users.getProfile({ userId: "me" });
      authorizedAs = String(profile.data.emailAddress || "");
    } catch {
      /* best effort; the token is still valid */
    }

    const hasSend = granted.includes("https://www.googleapis.com/auth/gmail.send");
    const hasDrive = granted.some((s) => s.startsWith("https://www.googleapis.com/auth/drive"));
    const expected = process.env.MAIL_FROM || "";
    const mismatch =
      authorizedAs && expected && authorizedAs.toLowerCase() !== expected.toLowerCase()
        ? `<p class="bad"><strong>Account mismatch.</strong> You authorised <strong>${esc(authorizedAs)}</strong>
             but <code>MAIL_FROM</code> is <strong>${esc(expected)}</strong>. Gmail sends as the authorised
             account, so either re-run and pick ${esc(expected)}, or update MAIL_FROM.</p>`
        : "";

    return res.send(
      page(
        "Gmail connected",
        `${authorizedAs ? `<p>Authorised as <strong>${esc(authorizedAs)}</strong></p>` : ""}
         ${mismatch}
         <p class="${hasSend ? "ok" : "bad"}">gmail.send: ${hasSend ? "granted" : "NOT granted — mail will fail"}</p>
         <p class="${hasDrive ? "ok" : "warn"}">drive.readonly: ${hasDrive ? "granted" : "not granted — Drive diagrams will fall back to generated SVG"}</p>
         <p>Paste this into <strong>Render → Environment</strong> (and your local <code>.env</code>), then redeploy:</p>
         <pre id="tok">GOOGLE_REFRESH_TOKEN=${esc(tokens.refresh_token)}</pre>
         <p><button onclick="navigator.clipboard.writeText(document.getElementById('tok').innerText)">Copy</button></p>
         <p class="muted">Refresh tokens start with <code>1//</code>. A value starting <code>4/0A</code> is the
           one-time authorisation code, not a refresh token.</p>
         <p class="muted">If the consent screen is still in "Testing", this token stops working in 7 days.
           Publish the app in Google Auth Platform → Audience to stop that.</p>`
      )
    );
  } catch (err) {
    const detail =
      err?.response?.data?.error_description || err?.message || "Token exchange failed";
    return res.send(
      page(
        "Exchange failed",
        `<p>${esc(String(detail))}</p>
         <p>The redirect URI used here was <code>${esc(redirectUri())}</code> — it must match one of the
            Authorised redirect URIs on this OAuth client in Google Cloud Console.</p>
         <p>Authorisation codes are single-use and expire in minutes; start again from
            <a href="${retry}">Connect Gmail</a>.</p>`
      )
    );
  }
});

/* -------------------------------- helpers ------------------------------- */

const esc = (v) =>
  String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function page(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
 body{font-family:system-ui,sans-serif;max-width:680px;margin:2rem auto;padding:0 1rem;line-height:1.55}
 pre{background:#f4f4f5;padding:1rem;overflow-x:auto;font-size:13px;word-break:break-all;white-space:pre-wrap}
 .muted{color:#666;font-size:14px}.ok{color:#15803d}.warn{color:#b45309}.bad{color:#b91c1c}
 button{padding:.5rem 1rem;cursor:pointer}
</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`;
}

export default router;
