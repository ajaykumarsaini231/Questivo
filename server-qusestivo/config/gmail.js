import nodemailer from "nodemailer";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

/**
 * Outbound mail.
 *
 * Two transports, tried in order:
 *
 *   1. APP PASSWORD (preferred). Plain SMTP with a Google App Password. No
 *      OAuth client, no consent screen, no verification, and critically no
 *      7-day refresh-token expiry. This is the right tool for "an app sends
 *      mail as its own Gmail account".
 *
 *   2. OAUTH2 (fallback). Kept for deployments that only have the refresh
 *      token configured.
 *
 * Why the order changed: the OAuth path kept dying with invalid_grant because
 * the consent screen sits in "Testing", where Google expires refresh tokens
 * after 7 days. An App Password sidesteps that entirely.
 *
 * App Passwords require 2-Step Verification on the account, and are created at
 * https://myaccount.google.com/apppasswords — 16 characters, spaces optional.
 */

const APP_PASSWORD = (process.env.NODE_CODE_SENDING_EMAIL_ADDRESS_PASSWORD || "")
  // Google displays them in groups of four; the API wants them unspaced.
  .replace(/\s+/g, "");
const SMTP_USER =
  process.env.NODE_CODE_SENDING_EMAIL_ADDRESS || process.env.MAIL_FROM;
const FROM = process.env.MAIL_FROM || SMTP_USER;

const useAppPassword = Boolean(APP_PASSWORD && SMTP_USER);

let oauth2Client = null;
if (!useAppPassword) {
  oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
}

console.log(
  `[Mail] transport: ${useAppPassword ? "SMTP app password" : "OAuth2 refresh token"}` +
    `${useAppPassword ? "" : " — set NODE_CODE_SENDING_EMAIL_ADDRESS_PASSWORD to avoid the 7-day token expiry"}`
);

async function buildTransport() {
  if (useAppPassword) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: { user: SMTP_USER, pass: APP_PASSWORD },
    });
  }

  const accessToken = await oauth2Client.getAccessToken();
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: FROM,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
      accessToken: accessToken?.token,
    },
  });
}

/** Display name on outgoing mail, e.g. "Questivo <noreply@…>". */
const FROM_HEADER = FROM ? `Questivo <${FROM}>` : undefined;

export async function sendMail(to, subject, html) {
  const transporter = await buildTransport();
  return transporter.sendMail({ from: FROM_HEADER, to, subject, html });
}

/** Verify the configured transport can actually authenticate. */
export async function verifyMailTransport() {
  const transporter = await buildTransport();
  await transporter.verify();
  return useAppPassword ? "app-password" : "oauth2";
}
