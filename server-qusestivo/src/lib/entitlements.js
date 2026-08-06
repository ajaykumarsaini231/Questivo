// Which features are paid, and who may use them anyway.
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
// TWO SWITCHES, IN THIS ORDER
//
//   1. The site-wide default, from the environment. It answers "is this feature
//      for sale?" and applies to everyone who has not been granted it.
//   2. The per-account grant, stored on User.entitlements and set from the admin
//      panel. It answers "may THIS person use it regardless?".
//
// The second can only open a feature the first has closed. There is deliberately
// no per-account way to CLOSE something the environment has opened: a switch
// that both grants and revokes has two sources of truth for the same answer, and
// the day they disagree nobody can say which is meant to win.
//
// SITE-WIDE, WITH THE ENVIRONMENT
//
// Set the variable and restart. No deploy of the frontend is needed: the UI
// reads GET /api/features and follows what it is told, so the badge, the menu
// and the gate all move together.
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
//
// ONE ACCOUNT AT A TIME, FROM THE ADMIN PANEL
//
// Admin → Users → the toggle in the AI Access column, which is
// PATCH /api/admin/users/:id/entitlements. No restart, no deploy, effective on
// that person's next request.

/** Every key this module knows about. Anything else is not an entitlement. */
export const FEATURE_KEYS = ["aiGeneration", "mockGeneration"];

/** Is this a key we recognise? Guards what an admin is allowed to write. */
export const isFeatureKey = (key) => FEATURE_KEYS.includes(key);

/**
 * Roles that hold every entitlement without one being granted.
 *
 * An operator who cannot use the feature cannot check that it works, and
 * "grant it to yourself first" is a step people skip and then report the
 * feature as broken. The cost is bounded: these accounts can already edit the
 * question bank and every user row, so metered generation is not the crown
 * jewel among the things an admin session is worth.
 */
const PRIVILEGED_ROLES = new Set(["admin", "superadmin"]);

/** Read a switch that is written the way an operator would write it. */
function envFlag(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
  return /^(1|on|true|yes|enabled?)$/i.test(String(raw).trim());
}

/**
 * Each gated feature, and why it is gated — the site-wide answer, for nobody in
 * particular.
 *
 * `premium: true` means the feature is behind the paywall right now. The
 * reason travels with it because it is shown to the visitor — "this is a paid
 * feature" with no explanation reads as an arbitrary wall, and the honest
 * answer here is specific and defensible.
 *
 * Callers that know who is asking want `entitlementsFor` instead.
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

/**
 * The keys one account holds, normalised against FEATURE_KEYS.
 *
 * Filtering rather than trusting the column means a key that was granted and
 * later renamed or retired simply stops counting, instead of sitting in the
 * database granting something that no longer exists.
 */
export function grantedFeatures(user) {
  if (!user) return [];
  if (PRIVILEGED_ROLES.has(user.role)) return [...FEATURE_KEYS];
  const held = Array.isArray(user.entitlements) ? user.entitlements : [];
  return FEATURE_KEYS.filter((key) => held.includes(key));
}

/**
 * The same shape as `entitlements()`, answered for one person.
 *
 * `user` may be null — an anonymous visitor gets the site-wide answer, which is
 * the correct one for them. It only needs `role` and `entitlements`, which is
 * what `protect` and `optionalUser` select.
 */
export function entitlementsFor(user) {
  const granted = new Set(grantedFeatures(user));
  const out = {};
  for (const [key, feature] of Object.entries(entitlements())) {
    const held = granted.has(key);
    out[key] = {
      ...feature,
      premium: feature.premium && !held,
      /**
       * Whether this account is being let through a door that is shut for
       * everyone else. False when the feature is open site-wide — there is
       * nothing to be let through — so the UI can say "included on your
       * account" without saying it to every visitor on a free feature.
       */
      granted: held && feature.premium,
    };
  }
  return out;
}

/** Is one feature behind the paywall site-wide, for nobody in particular? */
export const isPremium = (key) => Boolean(entitlements()[key]?.premium);

/**
 * Refuse a request for a feature the caller is not entitled to.
 *
 * 402 Payment Required, not 403: the caller is not forbidden, they have not
 * paid. The body carries the feature key and the reason so the client can show
 * its own upgrade dialog rather than a bare status.
 *
 * MUST BE MOUNTED AFTER `protect`. It reads req.user for the account's grants,
 * and a route that puts this first refuses a user who has been granted the
 * feature — the answer would be the site-wide one for everybody. The order used
 * to be the other way round deliberately, back when the switch could not depend
 * on who was asking; that reason is gone.
 */
export function requireEntitlement(key) {
  return (req, res, next) => {
    const feature = entitlementsFor(req.user)[key];
    if (!feature?.premium) return next();
    return res.status(402).json({
      error: `${feature.label} is a premium feature.`,
      premium: true,
      feature: feature.key,
      reason: feature.reason,
    });
  };
}
