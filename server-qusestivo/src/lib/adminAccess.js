/**
 * Who counts as an administrator on a route that is otherwise public.
 *
 * THE PROBLEM THIS REPLACES
 *
 * Six endpoints gated themselves by comparing a request header, or a URL query
 * parameter, against `process.env.Secret_Token` — and Secret_Token is the key
 * every session JWT is signed with. So the credential that proves "I am an
 * admin" was the same string that lets its holder MINT a token for any user id
 * on the site, including a superadmin. It travelled in places a secret must
 * never go:
 *
 *   - `/api/gmail/setup?token=<Secret_Token>` — query strings are written to
 *     the access logs of Render, Cloudflare and every proxy in between, kept
 *     for as long as those logs are kept, and readable by anyone with dashboard
 *     access.
 *   - `state: process.env.Secret_Token` on the Google consent URL — which sent
 *     the JWT signing key to a third party, put it in the browser's history,
 *     and exposed it to any Referer leak on the consent page.
 *
 * One leak of that string is a total compromise: forge an admin session, read
 * every unpublished paper, read every course request. Rotating it logs out
 * every user, so the incentive is to not rotate it, which is exactly backwards.
 *
 * THE SPLIT
 *
 * `Secret_Token` goes back to doing one job — signing sessions — and is never
 * compared against anything a caller sends. Administrative access to these
 * routes is proved one of two ways:
 *
 *   1. A signed-in user whose row says role admin/superadmin. This is what the
 *      admin panel already uses everywhere else, and it is the path a person
 *      should take.
 *   2. `x-admin-token: <ADMIN_API_TOKEN>` — a separate, purpose-made secret for
 *      health checks and scripts, which are not people and cannot log in.
 *
 * ADMIN_API_TOKEN UNSET MEANS "NOBODY", NOT "EVERYBODY". A missing secret is a
 * deployment that has not been finished, and the safe reading of an unfinished
 * gate is closed. Path 1 keeps working regardless, so an operator who never
 * sets it simply signs in like everyone else.
 */

import crypto from "crypto";
import jwt from "jsonwebtoken";
import prisma from "../prismaClient.js";
import { readSessionToken } from "./sessionToken.js";

/**
 * Compare without letting the time taken reveal how much of the prefix matched.
 *
 * `a !== b` on a shared secret is the textbook case for this — unlike the OTP
 * digests, this value does not expire and does not lock out after a few
 * attempts, so an attacker gets unlimited, unpenalised samples to average over.
 */
function secretsMatch(supplied, expected) {
  if (typeof supplied !== "string" || typeof expected !== "string") return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Does this request carry the machine token? */
export function hasAdminToken(req) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return false;
  return secretsMatch(req?.headers?.["x-admin-token"], expected);
}

/**
 * Is this request an administrator's, by either route?
 *
 * Async because the role lives on the user row and a token is only a claim
 * about it — the same lookup adminIdentifier does. Never throws: a database
 * failure here means "cannot prove admin", which is the answer that keeps a
 * public endpoint public rather than turning an outage into an access grant.
 */
export async function isAdminRequest(req) {
  if (hasAdminToken(req)) return true;

  const token = readSessionToken(req);
  if (!token) return false;

  try {
    const decoded = jwt.verify(token, process.env.Secret_Token);
    if (!decoded?.userId) return false;
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { role: true },
    });
    return user?.role === "admin" || user?.role === "superadmin";
  } catch {
    return false;
  }
}

/**
 * Middleware form, for endpoints that exist only for operators — the health
 * probes and the course-request backlog. Answers 401 rather than 404 because
 * these are not secrets whose existence must be hidden; they are tools whose
 * use must be proved.
 */
export async function requireAdmin(req, res, next) {
  if (await isAdminRequest(req)) return next();
  return res.status(401).json({ success: false, error: "unauthorized" });
}
