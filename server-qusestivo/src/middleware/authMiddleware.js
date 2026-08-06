import jwt from "jsonwebtoken";
import { AppError } from "../utills/errorHandler.js";
import prisma from "../prismaClient.js";
import { readSessionToken } from "../lib/sessionToken.js";

/**
 * Require a signed-in user, and require that the user still exists.
 *
 * WHY THE DATABASE IS CONSULTED AT ALL
 *
 * A JWT is a claim frozen at the moment it was signed. This one lives seven
 * days, so for a week after it is issued the signature keeps saying "this is
 * user X" no matter what has happened to user X since. Verifying the signature
 * and nothing else meant a deleted account kept working, and every handler
 * behind this middleware then wrote rows for a userId with no row of its own.
 *
 * A lookup per request is the price. It is one indexed primary-key read, the
 * same one adminIdentifier has always done, against a database every one of
 * these handlers is about to query anyway.
 *
 * WHAT THIS STILL DOES NOT DO
 *
 * It cannot revoke a specific token. Signing out, or having a password reset
 * out from under you, does not invalidate a JWT already in someone's hands —
 * nothing here is stateful enough to know. Closing that needs a
 * `sessionsValidFrom` column on User compared against the token's `iat`, which
 * is a schema migration; this is the part that needed no migration and covers
 * the case that actually came up.
 *
 * NOTE ON `next(err)` VS `throw`
 *
 * This used to be a synchronous function that threw AppError, which Express 4
 * catches and routes to the error handler. Adding the lookup made it async, and
 * Express 4 does NOT catch a rejected promise from a middleware — a throw here
 * would become an unhandled rejection and the request would simply never be
 * answered, hanging the browser instead of returning 401. Every failure path
 * below therefore hands the error to next() explicitly. (Express 5 changes
 * this; until the upgrade, the rule is: async middleware never throws.)
 */
export const protect = async (req, res, next) => {
  // Cookie, then Authorization header — see readSessionToken for why there are
  // two carriers and why the cookie is tried first.
  const token = readSessionToken(req);
  // The session JWT is a bearer credential: anyone who reads it is that user
  // until it expires. Printing it put a working credential for every logged-in
  // request into the hosting provider's log stream, where it is retained,
  // searchable, and readable by anyone with dashboard access.
  if (!token) {
    return next(new AppError("Not authorized, token missing", 401));
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.Secret_Token);
  } catch {
    return next(new AppError("Not authorized, token invalid", 401));
  }

  if (!decoded?.userId) {
    return next(new AppError("Not authorized, token invalid", 401));
  }

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      // `entitlements` rides along on the lookup that already happens, because
      // requireEntitlement runs behind this middleware and needs it. Selecting
      // it here rather than querying again in the gate keeps the cost at the
      // one indexed read this middleware has always done.
      select: { id: true, role: true, entitlements: true },
    });
  } catch (err) {
    // A database outage is not an authentication failure, and answering 401
    // would send every signed-in user to the login screen to discover that
    // their password does not work either.
    console.error(`[auth] user lookup failed: ${err.message}`);
    return next(new AppError("Service temporarily unavailable", 503));
  }

  if (!user) {
    return next(new AppError("Not authorized, session no longer valid", 401));
  }

  // 🔥 IMPORTANT
  req.userId = user.id;
  // Read fresh from the row rather than from the token, so a role that changed
  // after the token was signed is the one that applies.
  req.user = user;

  return next();
};
