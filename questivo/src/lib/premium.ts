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
  /**
   * This account has been let through a door that is shut for everyone else.
   *
   * Only ever true when the feature is paid site-wide and an admin granted it
   * to this person, so it is safe to say "included on your account" from it
   * without saying that to every visitor on a feature that is simply free.
   */
  granted?: boolean;
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

/**
 * Which session the in-flight request belongs to.
 *
 * Bumped by every reset, and checked before a reply is allowed to become the
 * cache. Without it the two requests around a sign-in can land out of order —
 * the anonymous one issued on page load resolving AFTER the one issued on
 * login — and the last writer wins, which leaves a freshly signed-in user
 * holding the signed-out answer until they reload. Exactly the bug the reset
 * exists to prevent, arrived at from the other direction.
 */
let generation = 0;

/** Everything currently mounted that is watching the switch. */
const listeners = new Set<() => void>();

/**
 * Forget the cached answer, because the person asking has changed.
 *
 * The cache exists so one page load makes one request no matter how many
 * components read the switch. That was safe while the answer was the same for
 * everybody; it is not now that an entitlement can be granted per account.
 * Signing in and out are client-side navigations, so without this a visitor who
 * signs in keeps the signed-out answer — their granted feature stays hidden
 * until they reload — and a visitor who signs out keeps the granted one, which
 * offers them a feature the API will refuse.
 *
 * Refetches immediately rather than waiting to be asked, and tells every
 * mounted `usePremiumGate` to re-read, so the header changes in place instead of
 * on the next route change.
 */
export function resetEntitlements(): void {
  cached = null;
  inflight = null;
  generation += 1;
  if (typeof window === "undefined") return;
  void fetchEntitlements().then(() => {
    for (const notify of listeners) notify();
  });
}

/** The switch, fetched once per session and shared by every caller. */
export function fetchEntitlements(): Promise<Entitlements> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  // Captured before the request goes out, compared after it comes back. A reply
  // that belongs to a session the visitor has already left is still returned to
  // whoever asked for it — they are owed an answer — but it is not written to
  // the cache, where it would outlive the request that supersedes it.
  const issuedFor = generation;
  const request: Promise<Entitlements> = fetch(`${API_BASE}/api/features`, {
    credentials: "include",
  })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j) => {
      const merged: Entitlements = { ...OPEN, ...(j?.data ?? {}) };
      if (issuedFor === generation) cached = merged;
      return merged;
    })
    .catch(() => OPEN)
    .finally(() => {
      // Same guard: a later reset has already cleared `inflight` and started a
      // fresh request, and clearing it again here would drop that one on the
      // floor for every caller still waiting on it.
      if (issuedFor === generation) inflight = null;
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
): { premium: boolean; reason: string; ready: boolean; granted: boolean } {
  const [state, setState] = useState<Entitlement | null>(null);
  useEffect(() => {
    let live = true;
    const read = () => {
      fetchEntitlements().then((e) => {
        if (live) setState(e[feature] ?? OPEN[feature]);
      });
    };
    read();
    // Re-read when the session changes under us. Without this the switch is
    // only ever as fresh as the last full page load — see resetEntitlements.
    listeners.add(read);
    return () => {
      live = false;
      listeners.delete(read);
    };
  }, [feature]);
  return {
    premium: Boolean(state?.premium),
    reason: state?.reason ?? "",
    granted: Boolean(state?.granted),
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

/** The AI writer's own route. Gated — PremiumRoute stands in front of it. */
export const AI_GENERATOR_PATH = "/GenerateTestPage";

/**
 * The free builder that does very nearly the same job, from previous year
 * questions. Never gated, and the place every locked CTA should land instead.
 */
export const PYQ_BUILDER_PATH = "/pyq/setup";

/**
 * Where a "generate a paper" call to action should point, for this visitor.
 *
 * WHY THIS EXISTS
 *
 * Seven places linked at /GenerateTestPage — the header, the homepage hero and
 * footer, the exam landing page, the exam index, the profile empty state and the
 * 404 — and every one of them hardcoded it. The header separately hid its entry
 * behind a compiled-in constant. So the site had three switches that did not
 * know about each other: the entitlement in the API, the constant in the bundle,
 * and six links that were never switched at all. The result was a feature hidden
 * from the navigation while the rest of the site went on advertising it, with
 * every one of those links dead-ending on a paywall.
 *
 * One hook, read by all of them. `path` is the AI writer when the visitor may
 * have it and the free PYQ builder when they may not, so a locked visitor gets
 * a paper rather than a wall — the same thing PremiumRoute offers them, offered
 * one click earlier. `allowed` is for the places that should disappear outright
 * instead, like the navigation entry.
 */
export function useAiGenerator(): {
  /** The server has answered. Until then, treat the feature as unavailable. */
  ready: boolean;
  /** This visitor may use the AI writer. */
  allowed: boolean;
  /** Where to send them for a paper, whichever of the two that turns out to be. */
  path: string;
  /** Wording that is true of wherever `path` leads. */
  label: string;
  /** The server's reason, for a dialog that has to explain the wall. */
  reason: string;
} {
  const gate = usePremiumGate("aiGeneration");
  const allowed = gate.ready && !gate.premium;
  return {
    ready: gate.ready,
    allowed,
    path: allowed ? AI_GENERATOR_PATH : PYQ_BUILDER_PATH,
    label: allowed ? "Generate a mock test" : "Build a practice paper",
    reason: gate.reason,
  };
}
