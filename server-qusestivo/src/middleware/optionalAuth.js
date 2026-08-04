import jwt from "jsonwebtoken";

/**
 * Resolve the signed-in user when a session cookie is present, without
 * rejecting the request when it is not.
 *
 * `protect` throws a 401 on a missing cookie, which is right for private
 * endpoints but wrong for ones that must also serve logged-out visitors — the
 * resume analyser is usable without an account. Those endpoints previously
 * hard-coded userId to "anonymous-session-layer", so every row in the database
 * belonged to the same fake user: per-user history was impossible, and the
 * history endpoint returned everybody's analyses to everybody.
 *
 * Sets req.userId when a valid cookie exists, leaves it undefined otherwise.
 */
export const optionalAuth = (req, _res, next) => {
  const token = req.cookies?.token;
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, process.env.Secret_Token);
    req.userId = decoded.userId;
  } catch {
    // An expired or tampered cookie is treated as "not signed in" rather than
    // an error: these routes are public.
  }
  next();
};

export default optionalAuth;
