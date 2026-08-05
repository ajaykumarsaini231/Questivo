// Which features are paid, and whether they are currently open.
//
// WHY THIS IS SERVER-SIDE
//
// The free/premium line used to live only in questivo/src/lib/premium.ts — a
// compiled-in constant. That is a promotion gate: it decides what a visitor is
// OFFERED, and nothing more. Anyone who typed the route, or posted to the API
// directly, got the feature anyway.
//
// AI generation is the one that cannot stay that way. Drawing a paper out of
// the question bank costs a database read; writing one with a model costs money
// per request and is rate-limited by the provider, so an ungated endpoint is
// somebody else's bill. That one is enforced here, where the request actually
// arrives.
//
// HOW TO TURN IT ON AND OFF
//
// Set the environment variable and restart. No deploy of the frontend is
// needed: the UI reads GET /api/features and follows what it is told, so the
// badge, the menu and the gate all move together.
//
//   PREMIUM_AI_GENERATION=off    paid — the AI writer answers 402 (default)
//   PREMIUM_AI_GENERATION=on     open to everyone
//
//   PREMIUM_MOCK_GENERATION=on   paid — drawing from the PYQ bank is gated too
//   PREMIUM_MOCK_GENERATION=off  open to everyone (default)
//
// The defaults are deliberately opposite. A mock drawn from previous year
// questions is the site's own archive answering a query about itself, and it is
// what makes a free PYQ dashboard worth visiting. A model writing new questions
// is a metered third-party service.

/** Read a switch that is written the way an operator would write it. */
function envFlag(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
  return /^(1|on|true|yes|enabled?)$/i.test(String(raw).trim());
}

/**
 * Each gated feature, and why it is gated.
 *
 * `premium: true` means the feature is behind the paywall right now. The
 * reason travels with it because it is shown to the visitor — "this is a paid
 * feature" with no explanation reads as an arbitrary wall, and the honest
 * answer here is specific and defensible.
 */
export function entitlements() {
  const aiPremium = !envFlag("PREMIUM_AI_GENERATION", false);
  const mockPremium = envFlag("PREMIUM_MOCK_GENERATION", false);

  return {
    /** Questions written by a model, in the official pattern. */
    aiGeneration: {
      key: "aiGeneration",
      label: "Written by AI",
      premium: aiPremium,
      reason:
        "New questions are written by a model on request, which is metered and " +
        "costs per paper. Previous year papers and mock tests drawn from them stay free.",
    },
    /** A paper drawn from questions that were actually examined. */
    mockGeneration: {
      key: "mockGeneration",
      label: "Generate Mock Test",
      premium: mockPremium,
      reason:
        "Drawing an unlimited supply of fresh papers out of the question bank is " +
        "the paid feature.",
    },
  };
}

/** Is one feature currently behind the paywall? */
export const isPremium = (key) => Boolean(entitlements()[key]?.premium);

/**
 * Refuse a request for a feature the caller is not entitled to.
 *
 * 402 Payment Required, not 403: the caller is not forbidden, they have not
 * paid. The body carries the feature key and the reason so the client can show
 * its own upgrade dialog rather than a bare status.
 *
 * There is no per-user entitlement yet — no plan on the User record — so this
 * is currently all-or-nothing per feature. When plans arrive, this is the one
 * function that has to learn about them, and every gated route inherits it.
 */
export function requireEntitlement(key) {
  return (req, res, next) => {
    const feature = entitlements()[key];
    if (!feature?.premium) return next();
    return res.status(402).json({
      error: `${feature.label} is a premium feature.`,
      premium: true,
      feature: feature.key,
      reason: feature.reason,
    });
  };
}
