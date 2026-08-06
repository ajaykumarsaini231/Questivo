/**
 * Where a request's session JWT is read from.
 *
 * Two carriers, in this order:
 *
 * 1. The `token` cookie. Primary, because it is httpOnly — no script on the
 *    page can read it, so an XSS cannot walk off with a working session.
 * 2. `Authorization: Bearer <jwt>`. The fallback, for the case where the
 *    cookie cannot arrive at all.
 *
 * The fallback is not hypothetical. The site answers on more than one hostname,
 * and the frontend may be built against an absolute API origin — when it is,
 * the API is a different site from the page on every hostname but the one that
 * shares its registrable domain. The session cookie is then third-party, and
 * browsers that block third-party cookies drop it on the floor: sign-in
 * returned 200 and a Set-Cookie the browser refused to keep, and the very next
 * /api/auth/me came back 401. A bearer token is attached by the client itself
 * and no cookie policy can filter it.
 *
 * Cookie first means the safer carrier still wins wherever it works, and the
 * header only decides requests the cookie never reached.
 *
 * Returns undefined when neither carrier is present. Callers decide whether
 * that is a 401 (`protect`) or simply a logged-out visitor (`optionalAuth`).
 */
export function readSessionToken(req) {
  const fromCookie = req?.cookies?.token;
  if (typeof fromCookie === "string" && fromCookie) return fromCookie;

  const header = req?.headers?.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    // Trimmed because "Bearer " with nothing after it, and "Bearer  x", are
    // both things a client can send; neither should become a token string that
    // jwt.verify then rejects with a confusing message.
    const bearer = header.slice(7).trim();
    if (bearer) return bearer;
  }

  return undefined;
}

export default readSessionToken;
