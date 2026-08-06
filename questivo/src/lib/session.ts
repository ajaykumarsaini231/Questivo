/**
 * The session token, kept somewhere the browser cannot refuse it.
 *
 * The server sets an httpOnly cookie on every sign-in and that remains the
 * preferred carrier — it is the one a script on this page cannot read. But a
 * cookie only comes back if the browser agrees to keep it, and on
 * questivo.vercel.app it does not: the frontend there is built against an
 * absolute API origin on another registrable domain, which makes the session
 * cookie third-party, and third-party cookies are blocked by default in
 * Safari and Brave and are being switched off in Chrome. Sign-in returned 200,
 * the UI moved to a signed-in view, and the next request came back 401. On
 * questivo.sutradharlabs.me the API is a sibling subdomain, the cookie is
 * same-site, and none of that happens — which is exactly why login worked on
 * one host and not the other.
 *
 * So the server also returns the token in the sign-in response body, this
 * module keeps it, and authTransport.ts presents it as `Authorization: Bearer`
 * on every API call. No cookie policy applies to a header the page sets itself.
 *
 * Worth being plain about the cost: a token readable by scripts is a token an
 * XSS can steal, which is the protection httpOnly was giving up. It is kept as
 * the fallback rather than the primary for that reason — where the cookie
 * survives, the cookie is what the server reads.
 */

import { resetEntitlements } from "./premium";

/**
 * Same key AdminLayout's logout already cleared, so that cleanup keeps meaning
 * what it says rather than becoming a second, stale copy.
 */
const STORAGE_KEY = "token";

/**
 * localStorage is absent during prerender (scripts/prerender.mjs) and throws
 * rather than returning null in Safari private browsing and wherever site data
 * is blocked outright. Every access goes through here so a storage failure
 * degrades to cookie-only auth instead of taking down the page that asked.
 */
function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readSessionToken(): string | null {
  try {
    const value = storage()?.getItem(STORAGE_KEY);
    return value ? value : null;
  } catch {
    return null;
  }
}

export function writeSessionToken(token: string): void {
  if (!token) return;
  try {
    storage()?.setItem(STORAGE_KEY, token);
  } catch {
    // Quota or a blocked store. The cookie may still carry the session; there
    // is nothing useful to tell the user here.
  }
  // Somebody different is asking now, and what the API will allow them is not
  // what it allowed the last person — entitlements can be granted per account.
  // Outside the try: the store failing does not make the session any less new.
  resetEntitlements();
}

export function clearSessionToken(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    /* see writeSessionToken */
  }
  // Same reason in reverse. Without this a signed-out tab keeps offering the
  // features the account that just left had been granted, and every one of them
  // now 402s.
  resetEntitlements();
}

/**
 * Pull the token out of a sign-in response body, if it carries one.
 *
 * Called for every /api/auth/* response rather than at each sign-in call site:
 * there are seven of those across two pages — password, login OTP, signup OTP,
 * Google, and their duplicates in the older Signin page — and a login path that
 * forgets to store the token is a login that silently works on one host only.
 * That is the bug this whole change exists to fix, so it is not left to each
 * caller to remember.
 *
 * Responses without a token (send-OTP, password reset, logout) are ignored.
 */
export function captureSessionToken(payload: unknown): void {
  if (!payload || typeof payload !== "object") return;
  const token = (payload as { token?: unknown }).token;
  if (typeof token === "string" && token) writeSessionToken(token);
}
