/**
 * The paywall has two switches now, and they have to compose in one direction
 * only: the environment decides for everybody, and a per-account grant may open
 * what the environment has shut — never the reverse.
 *
 * Worth a test because every way this can be wrong is silent. A grant that is
 * not read looks exactly like a user who was never granted anything; a gate that
 * ignores the account bills the wrong people; and `premium` inverted anywhere
 * gives a metered third-party service away to the whole internet, which nothing
 * on the site would report.
 *
 * No database and no server: these are pure functions over a user-shaped object,
 * which is the whole reason the entitlement logic lives apart from the
 * middleware that fetches the row.
 *
 * Run: node src/test/entitlements.test.mjs
 */
import {
  FEATURE_KEYS,
  entitlements,
  entitlementsFor,
  grantedFeatures,
  isFeatureKey,
  requireEntitlement,
} from "../lib/entitlements.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`${cond ? "  PASS  " : "  FAIL  "}${label}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
};

/** Run one middleware to completion and report which way it went. */
const runGate = (key, user) => {
  const req = { user };
  let status = null;
  let body = null;
  let passed = false;
  const res = {
    status(code) {
      status = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };
  requireEntitlement(key)(req, res, () => {
    passed = true;
  });
  return { passed, status, body };
};

const ANON = null;
const PLAIN = { id: "u1", role: "user", entitlements: [] };
const GRANTED = { id: "u2", role: "user", entitlements: ["aiGeneration"] };
const ADMIN = { id: "u3", role: "admin", entitlements: [] };
const SUPER = { id: "u4", role: "superadmin", entitlements: [] };

console.log("\n=== site-wide default: AI generation is paid, mocks are free ===\n");

delete process.env.PREMIUM_AI_GENERATION;
delete process.env.PREMIUM_MOCK_GENERATION;

check("aiGeneration is premium by default", entitlements().aiGeneration.premium === true);
check("mockGeneration is free by default", entitlements().mockGeneration.premium === false);
check(
  "an anonymous visitor gets the site-wide answer",
  entitlementsFor(ANON).aiGeneration.premium === true
);
check(
  "a plain account with no grant gets the same",
  entitlementsFor(PLAIN).aiGeneration.premium === true
);

console.log("\n=== a grant opens the door for that account only ===\n");

check("the granted user is not paywalled", entitlementsFor(GRANTED).aiGeneration.premium === false);
check("and is told it was granted", entitlementsFor(GRANTED).aiGeneration.granted === true);
check(
  "the next user along is still paywalled",
  entitlementsFor(PLAIN).aiGeneration.premium === true,
  "a grant must not leak between accounts"
);
check(
  "a grant on one feature does not open another",
  entitlementsFor({ ...PLAIN, entitlements: ["mockGeneration"] }).aiGeneration.premium === true
);
check("admins hold it by role", entitlementsFor(ADMIN).aiGeneration.premium === false);
check("superadmins hold it by role", entitlementsFor(SUPER).aiGeneration.premium === false);

console.log("\n=== the gate follows the account, not just the environment ===\n");

check("anonymous is refused", runGate("aiGeneration", ANON).passed === false);
check("anonymous is refused with 402, not 403", runGate("aiGeneration", ANON).status === 402);
check(
  "the refusal carries the feature and a reason",
  runGate("aiGeneration", ANON).body?.feature === "aiGeneration" &&
    typeof runGate("aiGeneration", ANON).body?.reason === "string" &&
    runGate("aiGeneration", ANON).body.reason.length > 0
);
check("an ungranted account is refused", runGate("aiGeneration", PLAIN).passed === false);
check("a granted account is let through", runGate("aiGeneration", GRANTED).passed === true);
check("an admin is let through", runGate("aiGeneration", ADMIN).passed === true);
check(
  "a free feature is let through for everyone",
  runGate("mockGeneration", ANON).passed === true
);

console.log("\n=== the environment can only be opened, never closed per account ===\n");

process.env.PREMIUM_AI_GENERATION = "on";
check("switching it on frees it for anonymous", entitlementsFor(ANON).aiGeneration.premium === false);
check(
  "and `granted` stays false when there was no door to be let through",
  entitlementsFor(GRANTED).aiGeneration.granted === false,
  "otherwise the UI tells every free user they have something special"
);

process.env.PREMIUM_MOCK_GENERATION = "on";
check(
  "closing a feature site-wide closes it for an ungranted user",
  entitlementsFor(PLAIN).mockGeneration.premium === true
);
check(
  "an account holding no grant cannot be closed further",
  entitlementsFor(GRANTED).mockGeneration.premium === true,
  "the aiGeneration grant must not spill onto mockGeneration"
);

delete process.env.PREMIUM_AI_GENERATION;
delete process.env.PREMIUM_MOCK_GENERATION;

console.log("\n=== what may be written into the column ===\n");

check("known keys are accepted", FEATURE_KEYS.every(isFeatureKey));
check("anything else is not", !isFeatureKey("adminPanel") && !isFeatureKey("") && !isFeatureKey(undefined));
check(
  "a retired key sitting in the column grants nothing",
  grantedFeatures({ role: "user", entitlements: ["somethingWeRemoved"] }).length === 0
);
check(
  "a null column does not throw",
  grantedFeatures({ role: "user", entitlements: null }).length === 0
);
check("no user at all grants nothing", grantedFeatures(null).length === 0);

console.log(failures === 0 ? "\nAll entitlement checks passed\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
