import axios from "axios";
import type { AxiosInstance, InternalAxiosRequestConfig } from "axios";

import { API_BASE } from "./apiBase";
import { captureSessionToken, readSessionToken } from "./session";

/**
 * Attach the session token to every API call, whichever way the call is made.
 *
 * This app talks to its API through three different mechanisms — bare `fetch`
 * (26 call sites), five separately-created axios instances, and the default
 * axios export — and any one of them that forgets the header is a page that
 * says "not signed in" on questivo.vercel.app while working on
 * questivo.sutradharlabs.me. See session.ts for why the header is needed at all.
 *
 * Doing it here rather than at each call site is the same choice apiBase.ts
 * made when it replaced eighteen inline copies of the base URL: one place that
 * is right beats thirty-eight that have to stay right.
 *
 * Nothing here replaces the cookie. `withCredentials` / `credentials:
 * "include"` stay exactly as each call site set them, the cookie is still sent
 * wherever the browser keeps it, and the server still prefers it. This only
 * adds a header the browser has no policy about.
 */

/** Absolute origin of the configured API, or null when calls are same-origin. */
function configuredApiOrigin(): string | null {
  if (!API_BASE) return null;
  try {
    return new URL(API_BASE, typeof window === "undefined" ? undefined : window.location.href).origin;
  } catch {
    return null;
  }
}

/**
 * Is this URL one of ours?
 *
 * Both halves matter. The path test keeps the token off requests to Google's
 * OAuth endpoints and any other third party the app happens to call through the
 * same fetch. The origin test keeps it off a stranger who merely serves a path
 * beginning "/api/" — a bearer token sent to the wrong host is a handed-over
 * session, so the default here is to not send it.
 */
function targetsOurApi(rawUrl: string): boolean {
  if (typeof window === "undefined") return false;
  let url: URL;
  try {
    url = new URL(rawUrl, window.location.href);
  } catch {
    return false;
  }
  if (!url.pathname.startsWith("/api/")) return false;
  if (url.origin === window.location.origin) return true;
  const configured = configuredApiOrigin();
  return configured !== null && url.origin === configured;
}

/** Sign-in responses — the only ones that carry a token to keep. */
function mintsSession(rawUrl: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URL(rawUrl, window.location.href).pathname.startsWith("/api/auth/");
  } catch {
    return false;
  }
}

/** How axios will resolve this request, so the checks above see the real URL. */
function resolveAxiosUrl(config: InternalAxiosRequestConfig): string {
  const url = config.url ?? "";
  const base = config.baseURL ?? "";
  if (!base) return url;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return url;
  return `${base.replace(/\/+$/, "")}/${url.replace(/^\/+/, "")}`;
}

/**
 * Read the token out of a sign-in response without consuming the body.
 *
 * Awaited rather than left to run on its own: the sign-in handlers navigate as
 * soon as they see `success: true`, and the page they land on fetches /me
 * immediately. A token stored a tick late is a token the first request after
 * login goes without.
 */
async function rememberFrom(response: Response): Promise<void> {
  try {
    if (!response.ok) return;
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("json")) return;
    captureSessionToken(await response.clone().json());
  } catch {
    // A body that is not the JSON it claimed to be says nothing about the
    // session; the caller is about to fail on it for its own reasons.
  }
}

function authorization(): string | null {
  const token = readSessionToken();
  return token ? `Bearer ${token}` : null;
}

/** Add the session interceptors to one axios instance. Safe to call once each. */
export function attachSessionInterceptors(instance: AxiosInstance): AxiosInstance {
  instance.interceptors.request.use((config) => {
    const header = authorization();
    // An Authorization the caller set itself wins — this is a fallback, not an
    // override of anything deliberate.
    if (header && !config.headers?.Authorization && targetsOurApi(resolveAxiosUrl(config))) {
      config.headers.Authorization = header;
    }
    return config;
  });

  instance.interceptors.response.use((response) => {
    if (mintsSession(resolveAxiosUrl(response.config as InternalAxiosRequestConfig))) {
      captureSessionToken(response.data);
    }
    return response;
  });

  return instance;
}

let installed = false;

/**
 * Wrap the global fetch and the default axios export. Call once, from the app
 * entry, before anything renders.
 *
 * Wrapping fetch globally is the heavier hammer, and it is used because the
 * alternative is editing 26 call sites and every one added after today. The
 * wrapper is narrow about what it touches: our API only, no existing
 * Authorization overwritten, everything else passed through untouched.
 */
export function installAuthTransport(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  attachSessionInterceptors(axios);

  const original = window.fetch;
  if (typeof original !== "function") return;

  window.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    if (!targetsOurApi(rawUrl)) return original.call(window, input, init);

    const header = authorization();
    let response: Response;

    if (!header) {
      response = await original.call(window, input, init);
    } else if (input instanceof Request) {
      const headers = new Headers(input.headers);
      if (!headers.has("Authorization")) headers.set("Authorization", header);
      response = await original.call(window, new Request(input, { headers }), init);
    } else {
      const headers = new Headers(init?.headers);
      if (!headers.has("Authorization")) headers.set("Authorization", header);
      response = await original.call(window, input, { ...init, headers });
    }

    if (mintsSession(rawUrl)) await rememberFrom(response);
    return response;
  };
}

export default installAuthTransport;
