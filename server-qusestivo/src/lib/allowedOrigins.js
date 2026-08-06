/**
 * The one list of origins allowed to call this API.
 *
 * It lived inline in server.js, which meant the HTTP layer had an allow-list
 * and socket.io — initialised two lines earlier in the same file — was left on
 * `origin: '*'`. Every rule the list expressed was therefore true of requests
 * and false of websockets, which is the kind of split nobody notices until a
 * page that could not fetch from your API turns out to be able to open a live
 * connection to it.
 *
 * One module, imported by both.
 */

/** Extra origins for a deploy that needs them: CORS_ORIGINS=https://a,https://b */
export const ALLOWED_ORIGINS = new Set(
  [
    process.env.FRONTEND_URL,
    ...(process.env.CORS_ORIGINS || "").split(",").map((s) => s.trim()),
    // Vite dev server, both spellings the browser may send.
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://questivo.vercel.app",
  ]
    .filter(Boolean)
    .map((o) => o.replace(/\/$/, ""))
);

/**
 * @param {string|undefined} origin
 * @returns {boolean} true when this origin may talk to the API.
 *
 * A missing Origin is allowed: same-origin requests, curl and server-to-server
 * calls send none, and refusing those would break the health checks and the
 * Vercel rewrite. It is not a hole — a browser always sends Origin on the
 * cross-site requests this list exists to refuse.
 */
export function isAllowedOrigin(origin) {
  if (!origin) return true;
  return ALLOWED_ORIGINS.has(String(origin).replace(/\/$/, ""));
}
