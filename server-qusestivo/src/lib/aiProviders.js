// AI provider registry and credential pool.
//
// Goal: adding another API key must require zero code changes. Drop
// GROQ_API_KEY_2 (or XAI_API_KEY, or OPENROUTER_API_KEY) into .env and it joins
// the failover chain on the next boot.
//
// Every provider here speaks the OpenAI chat-completions wire format, so one
// client (see aiClient.js) drives all of them.

import dotenv from "dotenv";

dotenv.config();

/**
 * Logical task roles. Call sites ask for a role, not a model name, so a
 * failover to a different provider still picks a sensible model there.
 */
export const ROLES = {
  GENERATION: "generation", // mock-test question generation — needs a large model
  ANALYSIS: "analysis", // resume/ATS analysis — needs a large model
  CONVERSATION: "conversation", // live interview turns — needs a fast, cheap model
  TRANSCRIPTION: "transcription", // speech to text
  VERIFICATION: "verification", // independently re-solve a question to check its answer key
};

/**
 * Known providers, in the order they are tried when AI_PROVIDER_ORDER is unset.
 *
 * `models` maps a logical role to that provider's model id. Model ids change
 * over time, so every one of them can be overridden from the environment:
 *   GROQ_MODEL_GENERATION=llama-3.3-70b-versatile
 *   XAI_MODEL_CONVERSATION=grok-3-mini
 */
const PROVIDER_REGISTRY = [
  {
    id: "groq",
    envPrefix: "GROQ",
    baseURL: "https://api.groq.com/openai/v1",
    supports: ["chat", "transcription"],
    // Chosen by benchmark against this account's actual rate limits, not by
    // reputation. Measured 2026-08-03 (4-key pool, on_demand tier):
    //
    //   model                     TPM     5 MCQs      notes
    //   groq/compound-mini      70,000    1,527 tok   arithmetic verified by its
    //                                                 built-in code execution
    //   llama-3.3-70b-versatile 12,000    2,769 tok   produced a wrong answer key
    //   openai/gpt-oss-120b      8,000    1,978 tok   produced a wrong answer key
    //   llama-3.1-8b-instant     6,000    -           14,400 RPM, lowest latency
    //
    // compound-mini gives ~6x the throughput of llama-3.3-70b and was the only
    // model that did not fabricate an answer key in testing — it runs a tool
    // loop that actually computes the result instead of pattern-matching it.
    //
    // Each role is a CHAIN, tried left to right. This matters because Groq's
    // free tier limits requests per DAY, not just per minute, and the good
    // model has the smallest daily quota (measured 2026-08-03):
    //
    //   groq/compound-mini        250 requests/day per key   70,000 TPM
    //   llama-3.3-70b-versatile 1,000 requests/day per key   12,000 TPM
    //   openai/gpt-oss-120b     1,000 requests/day per key    8,000 TPM
    //
    // So compound-mini leads on quality, and when its daily quota runs out the
    // chain drops to llama rather than failing the request.
    models: {
      generation: ["groq/compound-mini", "llama-3.3-70b-versatile", "openai/gpt-oss-120b"],
      // Resume analysis needs response_format json_object; both of these support it.
      analysis: ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"],
      // Real-time voice: latency matters far more than depth here.
      conversation: ["llama-3.1-8b-instant", "openai/gpt-oss-20b"],
      transcription: ["whisper-large-v3", "whisper-large-v3-turbo"],
      // Independent re-solve for answer-key checking. Deliberately led by a
      // different family from `generation` so it does not repeat the same
      // mistake, and ordered by daily quota.
      verification: ["openai/gpt-oss-120b", "qwen/qwen3.6-27b", "llama-3.3-70b-versatile"],
    },
  },
  {
    id: "xai",
    envPrefix: "XAI",
    baseURL: "https://api.x.ai/v1",
    supports: ["chat"],
    models: {
      generation: "grok-3",
      analysis: "grok-3",
      conversation: "grok-3-mini",
      verification: "grok-3",
    },
  },
  {
    id: "cerebras",
    envPrefix: "CEREBRAS",
    baseURL: "https://api.cerebras.ai/v1",
    supports: ["chat"],
    models: {
      generation: "llama-3.3-70b",
      analysis: "llama-3.3-70b",
      conversation: "llama3.1-8b",
      verification: "llama-3.3-70b",
    },
  },
  {
    id: "together",
    envPrefix: "TOGETHER",
    baseURL: "https://api.together.xyz/v1",
    supports: ["chat"],
    models: {
      generation: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      analysis: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      conversation: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
      verification: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    },
  },
  {
    id: "openrouter",
    envPrefix: "OPENROUTER",
    baseURL: "https://openrouter.ai/api/v1",
    supports: ["chat"],
    models: {
      generation: "meta-llama/llama-3.3-70b-instruct",
      analysis: "meta-llama/llama-3.3-70b-instruct",
      conversation: "meta-llama/llama-3.1-8b-instruct",
      verification: "meta-llama/llama-3.3-70b-instruct",
    },
  },
  {
    id: "openai",
    envPrefix: "OPENAI",
    baseURL: "https://api.openai.com/v1",
    supports: ["chat", "transcription"],
    models: {
      generation: "gpt-4.1",
      analysis: "gpt-4.1",
      conversation: "gpt-4.1-mini",
      transcription: "whisper-1",
      verification: "gpt-4.1",
    },
  },
];

/**
 * Collect every key for one provider from the environment.
 *
 * Supported shapes, all combinable:
 *   GROQ_API_KEY=abc                 single key (the existing convention)
 *   GROQ_API_KEY_2=def               numbered extras, scanned until a gap
 *   GROQ_API_KEYS=ghi,jkl            comma-separated list
 */
function collectKeys(envPrefix) {
  const keys = [];
  const push = (v) => {
    const k = (v || "").trim();
    // De-duplicate: pasting the same key twice would otherwise double the
    // retry budget spent on a single dead credential.
    if (k && !keys.includes(k)) keys.push(k);
  };

  push(process.env[`${envPrefix}_API_KEY`]);

  const csv = process.env[`${envPrefix}_API_KEYS`];
  if (csv) csv.split(",").forEach(push);

  // Numbered keys. Tolerate one gap so KEY_2 missing but KEY_3 present still
  // gets picked up — a very easy mistake to make by hand.
  let misses = 0;
  for (let i = 2; i <= 25 && misses < 2; i++) {
    const v = process.env[`${envPrefix}_API_KEY_${i}`];
    if (v) {
      push(v);
      misses = 0;
    } else {
      misses++;
    }
  }

  return keys;
}

/**
 * Normalise every role to an ordered array of model ids (a "chain").
 * An env override may itself be a comma-separated chain:
 *   GROQ_MODEL_GENERATION=groq/compound-mini,llama-3.3-70b-versatile
 */
function resolveModels(provider) {
  const models = {};
  for (const [role, value] of Object.entries(provider.models)) {
    models[role] = Array.isArray(value) ? [...value] : [value];
  }
  for (const role of Object.values(ROLES)) {
    const override = process.env[`${provider.envPrefix}_MODEL_${role.toUpperCase()}`];
    if (override) {
      models[role] = override.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return models;
}

/**
 * A credential is one (provider, key) pair — the unit that gets rotated,
 * cooled down or disabled.
 */
function buildCredentials() {
  const orderEnv = (process.env.AI_PROVIDER_ORDER || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const ordered = orderEnv.length
    ? [
        ...orderEnv
          .map((id) => PROVIDER_REGISTRY.find((p) => p.id === id))
          .filter(Boolean),
        // Anything not named in AI_PROVIDER_ORDER still participates, last.
        ...PROVIDER_REGISTRY.filter((p) => !orderEnv.includes(p.id)),
      ]
    : PROVIDER_REGISTRY;

  const creds = [];
  for (const provider of ordered) {
    const keys = collectKeys(provider.envPrefix);
    const models = resolveModels(provider);
    keys.forEach((apiKey, idx) => {
      creds.push({
        id: `${provider.id}#${idx + 1}`,
        providerId: provider.id,
        baseURL: process.env[`${provider.envPrefix}_BASE_URL`] || provider.baseURL,
        supports: provider.supports,
        models,
        apiKey,
        // Runtime health, mutated by aiClient.
        disabled: false,
        disabledReason: null,
        cooldownUntil: 0,
        failures: 0,
        successes: 0,
      });
    });
  }
  return creds;
}

export const CREDENTIALS = buildCredentials();

/** Credentials that can serve a given capability and are currently usable. */
export function availableCredentials(capability, role) {
  const now = Date.now();
  return CREDENTIALS.filter(
    (c) =>
      !c.disabled &&
      c.cooldownUntil <= now &&
      c.supports.includes(capability) &&
      Array.isArray(c.models[role]) &&
      c.models[role].length > 0
  );
}

/** Redacted snapshot for logging and the health endpoint — never leaks keys. */
export function credentialReport() {
  const now = Date.now();
  return CREDENTIALS.map((c) => ({
    id: c.id,
    provider: c.providerId,
    supports: c.supports,
    state: c.disabled
      ? "disabled"
      : c.cooldownUntil > now
        ? "cooling-down"
        : "ready",
    reason: c.disabledReason || undefined,
    cooldownSecondsLeft:
      c.cooldownUntil > now ? Math.ceil((c.cooldownUntil - now) / 1000) : 0,
    successes: c.successes,
    failures: c.failures,
  }));
}

if (CREDENTIALS.length === 0) {
  console.error(
    "[AI] No API keys found. Set at least GROQ_API_KEY in .env — see .env.example."
  );
} else {
  const byProvider = CREDENTIALS.reduce((acc, c) => {
    acc[c.providerId] = (acc[c.providerId] || 0) + 1;
    return acc;
  }, {});
  console.log(
    "[AI] Credential pool:",
    Object.entries(byProvider)
      .map(([p, n]) => `${p}×${n}`)
      .join(", ")
  );
}
