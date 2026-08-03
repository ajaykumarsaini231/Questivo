import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

/**
 * Outbound mail — Gmail REST API over HTTPS.
 *
 * Modelled on the METNMAT dashboard's lib/gmail/send-otp.ts, which sends via
 * `gmail.users.messages.send` rather than SMTP.
 *
 * WHY NOT SMTP (this is the whole reason the file looks like this):
 * Render's free web services block outbound traffic to SMTP ports 25, 465 and
 * 587 (Render changelog, 16 Sept 2025). A perfectly valid Gmail App Password
 * still failed in production with ETIMEDOUT on CONN, because the socket can
 * never open. The Gmail API talks HTTPS on 443, which is not blocked — so it
 * works on Render free where nodemailer/SMTP cannot. The SMTP path has been
 * removed entirely rather than left as a fallback that silently reintroduces
 * the same outage.
 *
 * Error handling follows the same principle as METNMAT's formatGmailSendError:
 * a failure should name the thing the operator has to go and fix, not just say
 * "invalid_grant".
 */

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const SENDER = process.env.MAIL_FROM || process.env.NODE_CODE_SENDING_EMAIL_ADDRESS;
const FROM_HEADER = SENDER ? `Questivo <${SENDER}>` : undefined;
const SEND_TIMEOUT_MS = Number(process.env.MAIL_SEND_TIMEOUT_MS || 10_000);

export function isMailConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN && SENDER);
}

/**
 * Catch the classic mix-up before it reaches Google: pasting the one-time
 * authorisation code (starts "4/0A") into GOOGLE_REFRESH_TOKEN instead of the
 * refresh token (starts "1//"). Google answers both with a bare invalid_grant,
 * which sends people hunting the wrong problem.
 */
function refreshTokenFormatHint(token) {
  if (!token) return "GOOGLE_REFRESH_TOKEN is empty.";
  if (token.startsWith("4/")) {
    return (
      "GOOGLE_REFRESH_TOKEN looks like a one-time OAuth authorisation code " +
      '(starts with "4/"), not a refresh token (starts with "1//"). ' +
      "Run: node scripts/googleRefreshToken.mjs"
    );
  }
  return undefined;
}

let oauth2Client = null;
function getOAuthClient() {
  if (!oauth2Client) {
    oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
    oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
  }
  return oauth2Client;
}

/** Turn a Gmail failure into something actionable. */
function formatGmailError(err) {
  const code = err?.response?.data?.error;
  const desc = err?.response?.data?.error_description;

  if (code === "invalid_grant") {
    return (
      "Gmail refresh token is invalid or expired. Most often the OAuth consent " +
      'screen is still in "Testing", where Google expires refresh tokens after ' +
      "7 days — publish the app, or re-mint the token with " +
      "`node scripts/googleRefreshToken.mjs` and update GOOGLE_REFRESH_TOKEN " +
      "in the deployment environment (Render), not just locally."
    );
  }
  if (code === "unauthorized_client" || code === "invalid_client") {
    return (
      "Gmail OAuth client mismatch. GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET do " +
      "not match the client the refresh token was minted for. Note the Render " +
      "environment may hold a different client than your local .env."
    );
  }
  if (err?.code === 403 || err?.status === 403) {
    return (
      "Gmail API refused the request (403). Check the Gmail API is enabled for " +
      "this project and the token carries the gmail.send scope."
    );
  }
  return `Could not send email (${desc || code || err?.message || "unknown error"}).`;
}

/** RFC 5322 message, base64url encoded the way the Gmail API expects. */
function encodeMessage({ to, subject, html }) {
  const lines = [
    `From: ${FROM_HEADER || SENDER}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
    html,
  ];
  return Buffer.from(lines.join("\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendMail(to, subject, html) {
  if (!isMailConfigured()) {
    const missing = [
      !CLIENT_ID && "GOOGLE_CLIENT_ID",
      !CLIENT_SECRET && "GOOGLE_CLIENT_SECRET",
      !REFRESH_TOKEN && "GOOGLE_REFRESH_TOKEN",
      !SENDER && "MAIL_FROM",
    ].filter(Boolean);
    throw new Error(`Gmail is not configured. Missing: ${missing.join(", ")}`);
  }

  const hint = refreshTokenFormatHint(REFRESH_TOKEN);
  if (hint) throw new Error(hint);

  const recipient = String(to || "").trim().toLowerCase();
  if (!recipient.includes("@")) throw new Error("Invalid recipient email address.");

  try {
    const gmail = google.gmail({ version: "v1", auth: getOAuthClient() });
    return await gmail.users.messages.send(
      { userId: "me", requestBody: { raw: encodeMessage({ to: recipient, subject, html }) } },
      { timeout: SEND_TIMEOUT_MS }
    );
  } catch (err) {
    throw new Error(formatGmailError(err));
  }
}

/** Confirm the credentials can mint an access token, without sending mail. */
export async function verifyMailTransport() {
  if (!isMailConfigured()) throw new Error("Gmail is not configured.");
  const hint = refreshTokenFormatHint(REFRESH_TOKEN);
  if (hint) throw new Error(hint);
  try {
    const { token } = await getOAuthClient().getAccessToken();
    if (!token) throw new Error("no access token returned");
    return "gmail-api";
  } catch (err) {
    throw new Error(formatGmailError(err));
  }
}

export const mailTransportName = () => "gmail-api";

console.log(
  `[Mail] transport: Gmail API over HTTPS${isMailConfigured() ? "" : " — NOT CONFIGURED, OTP emails will fail"}`
);
