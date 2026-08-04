/**
 * Site-wide switches that are not a function of who the visitor is.
 *
 * Distinct from the track features in lib/audience.ts, which answer "does THIS
 * visitor see this?". These answer "is this promoted?", and they deliberately
 * do not fall back to true — `audienceAllows` returns true whenever no track is
 * stored, which is correct for narrowing a menu but wrong for demoting a
 * feature, since an untracked visitor would still see it.
 */

/**
 * Whether the AI paper generator appears in the main navigation.
 *
 * Off: previous year papers are the front door, and the generator is reached
 * from the "Generate a paper" menu on that page as the second of two options.
 * The ROUTE stays live either way — this only controls promotion. Hiding the
 * route as well would break that menu, and would 404 bookmarks and anything
 * already indexed.
 */
export const SHOW_AI_GENERATOR = false;
