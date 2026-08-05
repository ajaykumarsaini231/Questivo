/**
 * The free/premium line — decided by the server, read here.
 *
 * Sitting real previous year papers is free and always will be: that is the
 * front door of the site. What is paid is a switch the operator holds, and it
 * lives in the API (server-qusestivo/src/lib/entitlements.js), not in this
 * bundle. Two reasons it moved:
 *
 *   A constant compiled into the frontend needs a redeploy of the site to
 *   change, and it can disagree with what the API will actually allow — so the
 *   badge says premium while the endpoint serves anyone who posts to it, or the
 *   reverse, which is worse.
 *
 *   The gate that matters for AI generation is server-side anyway. Writing a
 *   paper with a model costs money per request; a hidden button is not a gate.
 *
 * What is left here is the CONTACT DETAILS the upgrade dialog shows, and a
 * small client for the switch.
 */

import { useEffect, useState } from "react";

import { API_BASE } from "./apiBase";

/**
 * The number the "Call Now" button dials.
 *
 * ── SET THIS ──────────────────────────────────────────────────────────────
 * Replace the placeholder with the real sales line. It is used verbatim as
 * the tel: target and is shown to the visitor, so write it the way you want
 * it read: "+91 98765 43210".
 * ──────────────────────────────────────────────────────────────────────────
 */
export const PREMIUM_CONTACT_PHONE = "+91 00000 00000";

/** Optional second channel. Left blank hides the button rather than showing a dead one. */
export const PREMIUM_CONTACT_EMAIL = "";

/** Strip spaces and punctuation for the tel: href; browsers dial the digits. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** One gated feature, as the server describes it. */
export interface Entitlement {
  key: string;
  label: string;
  premium: boolean;
  /** Shown in the upgrade dialog. A paywall with no reason reads as arbitrary. */
  reason: string;
}

export type FeatureKey = "aiGeneration" | "mockGeneration";
export type Entitlements = Record<FeatureKey, Entitlement>;

/**
 * What to assume before the server has answered, and if it never does.
 *
 * Both default to FREE. An API that is down must not make the site look like it
 * has been put behind a paywall, and the request the visitor then makes is
 * refused by the server with its own 402 — which carries the real reason. The
 * gate is server-side; this only decides what is offered.
 */
const OPEN: Entitlements = {
  aiGeneration: { key: "aiGeneration", label: "Written by AI", premium: false, reason: "" },
  mockGeneration: { key: "mockGeneration", label: "Generate Mock Test", premium: false, reason: "" },
};

let cached: Entitlements | null = null;
let inflight: Promise<Entitlements> | null = null;

/** The switch, fetched once per page load and shared by every caller. */
export function fetchEntitlements(): Promise<Entitlements> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  const request: Promise<Entitlements> = fetch(`${API_BASE}/api/features`, {
    credentials: "include",
  })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j) => {
      const merged: Entitlements = { ...OPEN, ...(j?.data ?? {}) };
      cached = merged;
      return merged;
    })
    .catch(() => OPEN)
    .finally(() => {
      inflight = null;
    });
  inflight = request;
  return request;
}

/**
 * Whether one feature is behind the paywall, as a hook.
 *
 * Returns `false` until the server answers, so nothing flashes a Premium badge
 * and then removes it — the quieter mistake of the two.
 */
export function usePremiumGate(
  feature: FeatureKey
): { premium: boolean; reason: string; ready: boolean } {
  const [state, setState] = useState<Entitlement | null>(null);
  useEffect(() => {
    let live = true;
    fetchEntitlements().then((e) => {
      if (live) setState(e[feature] ?? OPEN[feature]);
    });
    return () => {
      live = false;
    };
  }, [feature]);
  return {
    premium: Boolean(state?.premium),
    reason: state?.reason ?? "",
    /**
     * Whether the server has actually answered.
     *
     * A badge can afford to assume "free" while it waits — that is the quieter
     * mistake, and it is what `premium` above does. A whole ROUTE cannot: a
     * gated page that renders its form for one frame and then replaces it with
     * a paywall has shown the visitor the thing it is meant to be withholding,
     * and looks broken doing it. PremiumRoute waits on this instead.
     */
    ready: state !== null,
  };
}
