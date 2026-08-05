/**
 * The origin every REST call is made against.
 *
 * Empty is the meaningful production value here, not a missing one. An empty
 * base makes each call same-origin, and vercel.json rewrites /api/* through to
 * the Render backend, so the session cookie is set by — and handed back to —
 * whichever host served the page. The site answers on more than one hostname,
 * and any absolute origin written here would be first-party on exactly one of
 * them and a blocked third-party cookie on the rest. That is what made login
 * report success and then not stick.
 *
 * Read with ?? rather than ||. This expression stood inline in eighteen modules
 * before this file, every copy of it using ||, which reads "" as absent and
 * falls through to localhost — so same-origin was not expressible at all.
 *
 * Websockets cannot use this: a rewrite terminates the request and never holds
 * an upgraded connection open. See VITE_SOCKET_URL in vite-env.d.ts.
 */
function configuredBase(): string | undefined {
  if (typeof import.meta !== "undefined") {
    const fromVite = (import.meta as any).env?.VITE_API_URL;
    if (typeof fromVite === "string") return fromVite;
  }
  // Carried over from the inline copies, which read these too. Nothing sets
  // them today; they cost one typeof each and save a silent failure if some
  // part of this app is ever built by something other than Vite.
  if (typeof process !== "undefined") {
    const env = ((process as any).env ?? {}) as Record<string, unknown>;
    for (const key of ["NEXT_PUBLIC_API_URL", "REACT_APP_API_URL"]) {
      const value = env[key];
      if (typeof value === "string") return value;
    }
  }
  return undefined;
}

/** True for `vite build`, false for `vite dev`. */
function isProdBuild(): boolean {
  return typeof import.meta !== "undefined" && !!(import.meta as any).env?.PROD;
}

/**
 * No trailing slash — every caller appends its own path, and "" has to stay ""
 * so that `${API_BASE}/api/x` is the same-origin "/api/x" rather than the
 * protocol-relative "//api/x", which resolves to a host called "api".
 *
 * Unset falls back by build, not to one constant. A deployed bundle calling
 * localhost is never what was meant, and "unset" is a state a deploy can reach
 * by accident — a dashboard that will not store an empty string leaves deleting
 * the variable as the only way to ask for same-origin. So production reads
 * absent as same-origin, which is the answer that is right on every host, and
 * only dev falls back to the local API.
 */
function resolve(): string {
  const configured = configuredBase();
  if (typeof configured === "string") return configured.replace(/\/+$/, "");
  return isProdBuild() ? "" : "http://localhost:4000";
}

export const API_BASE = resolve();
