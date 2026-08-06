import jwt from "jsonwebtoken";
import prisma from "../prismaClient.js";
import { readSessionToken } from "../lib/sessionToken.js";

/**
 * Resolve the signed-in user when a session credential is present, without
 * rejecting the request when it is not.
 *
 * `protect` throws a 401 on a missing cookie, which is right for private
 * endpoints but wrong for ones that must also serve logged-out visitors — the
 * resume analyser is usable without an account. Those endpoints previously
 * hard-coded userId to "anonymous-session-layer", so every row in the database
 * belonged to the same fake user: per-user history was impossible, and the
 * history endpoint returned everybody's analyses to everybody.
 *
 * Sets req.userId when a valid session token exists, leaves it undefined
 * otherwise. It does NOT read the database and does not set req.user — a
 * caller that needs the account row wants `optionalUser` below.
 */
export const optionalAuth = (req, _res, next) => {
  const token = readSessionToken(req);
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, process.env.Secret_Token);
    req.userId = decoded.userId;
  } catch {
    // An expired or tampered token is treated as "not signed in" rather than
    // an error: these routes are public.
  }
  next();
};

/**
 * The same thing, but with the account row — for the few public endpoints whose
 * ANSWER depends on who is asking.
 *
 * WHY IT IS SEPARATE FROM `optionalAuth`
 *
 * `optionalAuth` verifies a signature and nothing more, and it is mounted on the
 * busiest public routes there are: every PYQ score, every resume analysis, every
 * interview transcript. Teaching it to load the user would put a database read
 * in front of all of them to serve one endpoint that needs it. So the lookup is
 * opt-in, and the routes that only want an id keep paying nothing for it.
 *
 * GET /api/features is the endpoint that needs it: since entitlements can be
 * granted per account, what is for sale is no longer the same answer for
 * everyone, and deciding it needs `role` and `entitlements` off the row rather
 * than a userId out of a token. `protect` is the wrong tool there because it
 * answers 401 with no session, which would take the feature list away from every
 * signed-out visitor and from every crawler.
 *
 * Refuses nothing, ever. No token, an expired token, a deleted account, or a
 * database that is briefly unreachable all arrive at the handler as "no user" —
 * which is the anonymous, site-wide answer, and a correct one to give.
 */
export const optionalUser = async (req, _res, next) => {
  try {
    const token = readSessionToken(req);
    if (!token) return next();

    const decoded = jwt.verify(token, process.env.Secret_Token);
    if (!decoded?.userId) return next();

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, entitlements: true },
    });
    if (!user) return next();

    req.userId = user.id;
    req.user = user;
    return next();
  } catch {
    // Deliberately silent and deliberately total — see above. A malformed token
    // is the normal state of a stale browser tab, and there is nothing here to
    // report and nothing to refuse.
    return next();
  }
};

export default optionalAuth;
