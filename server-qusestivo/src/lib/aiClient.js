// Resilient AI client.
//
// Wraps the credential pool from aiProviders.js and retries across keys and
// providers when one fails. Call sites ask for a logical role
// (ROLES.GENERATION, ROLES.CONVERSATION, ...) and never name a model or a key.
//
// Uses plain fetch rather than groq-sdk on purpose. The SDK hard-codes Groq's
// "/openai/v1" path segment onto whatever baseURL it is given, which both
// double-prefixed Groq itself and would have produced nonsense URLs for every
// other provider. Every provider in the registry speaks the same
// OpenAI-compatible HTTP contract, so one fetch wrapper is simpler and correct:
//   POST {baseURL}/chat/completions
//   POST {baseURL}/audio/transcriptions
//
// Failure policy — the important part:
//   401 / 403          key is dead or revoked  -> disable it for this process
//   429                rate limited            -> cool it down, honour Retry-After
//   404 model_not_found model missing here     -> skip this provider for this role
//   5xx / network      provider is having a bad time -> short cooldown
//   400 and other 4xx  OUR request is malformed -> fail immediately
//
// That last rule matters: a bad prompt would otherwise burn through every key
// in the pool producing the same error, and look like a credential outage.

import fs from "node:fs";
import {
  ROLES,
  availableCredentials,
  credentialReport,
  CREDENTIALS,
} from "./aiProviders.js";

export { ROLES, credentialReport };

const RATE_LIMIT_COOLDOWN_MS = Number(process.env.AI_RATE_LIMIT_COOLDOWN_MS || 60_000);
const SERVER_ERROR_COOLDOWN_MS = Number(process.env.AI_SERVER_ERROR_COOLDOWN_MS || 15_000);
const REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 90_000);

class ApiError extends Error {
  constructor(status, body, headers) {
    const detail =
      typeof body === "string" ? body : body?.error?.message || JSON.stringify(body || {});
    super(`HTTP ${status}: ${String(detail).slice(0, 300)}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.headers = headers;
  }
}

async function readBody(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function retryAfterMs(err) {
  const raw = err?.headers?.get?.("retry-after");
  const secs = Number(raw);
  return Number.isFinite(secs) && secs > 0 ? secs * 1000 : null;
}

function isModelMissing(err) {
  const msg = `${err?.message || ""}`.toLowerCase();
  return (
    err?.status === 404 &&
    (msg.includes("model") || msg.includes("does not exist") || msg.includes("decommissioned"))
  );
}

/**
 * Classify a failure and update the credential's health.
 * @returns {"retry"|"fatal"} whether to try the next credential.
 */
function handleFailure(cred, err, role, model) {
  const status = err?.status ?? 0;
  cred.failures++;

  if (status === 401 || status === 403) {
    cred.disabled = true;
    cred.disabledReason = `auth failed (${status}) — key expired or revoked`;
    console.error(`[AI] ${cred.id} disabled: ${cred.disabledReason}`);
    return "retry";
  }

  if (status === 429) {
    // Groq meters per model per key, so a limit on compound-mini says nothing
    // about llama on the same key. Cool the (key, model) pair, not the key —
    // otherwise one exhausted model takes three healthy ones down with it.
    const wait = retryAfterMs(err) ?? RATE_LIMIT_COOLDOWN_MS;
    modelCooldowns.set(`${cred.id}:${model}`, Date.now() + wait);
    console.warn(
      `[AI] ${cred.id} rate limited on ${model}, cooling that pair ${Math.round(wait / 1000)}s`
    );
    return "retry";
  }

  if (isModelMissing(err)) {
    // Drop just this model from the role's chain; the credential and the rest
    // of the chain are fine.
    const chain = cred.models[role];
    if (Array.isArray(chain) && model) {
      cred.models[role] = chain.filter((m) => m !== model);
    }
    console.warn(`[AI] ${cred.id} does not serve "${model}" — removed from the "${role}" chain`);
    return "retry";
  }

  const isNetwork =
    !status ||
    err?.name === "AbortError" ||
    err?.name === "TimeoutError" ||
    err?.code === "ECONNRESET" ||
    err?.code === "ETIMEDOUT" ||
    err?.code === "ENOTFOUND" ||
    err?.cause?.code === "ECONNRESET" ||
    err?.cause?.code === "ETIMEDOUT";

  if (status >= 500 || isNetwork) {
    cred.cooldownUntil = Date.now() + SERVER_ERROR_COOLDOWN_MS;
    console.warn(`[AI] ${cred.id} transient failure (${status || err?.name || "network"})`);
    return "retry";
  }

  // 400 and friends: our payload is wrong. Rotating keys cannot fix it.
  console.error(`[AI] ${cred.id} request rejected (${status}): ${err?.message}`);
  return "fatal";
}

/**
 * Ordering: last credential that worked goes first, so a healthy key keeps
 * serving instead of every request re-probing a dead one at the top of the list.
 */
/** Cooldowns keyed by `${credentialId}:${model}` — see the 429 branch above. */
const modelCooldowns = new Map();
const isCooling = (credId, model) => (modelCooldowns.get(`${credId}:${model}`) || 0) > Date.now();

let preferred = null;
let lastServed = null;
function orderCandidates(list) {
  if (!preferred) return list;
  const idx = list.findIndex((c) => c.id === preferred);
  if (idx <= 0) return list;
  return [list[idx], ...list.slice(0, idx), ...list.slice(idx + 1)];
}

class AllProvidersFailedError extends Error {
  constructor(role, attempts) {
    const detail = attempts.map((a) => `${a.id}: ${a.message}`).join(" | ");
    super(
      `All AI providers failed for role "${role}". Tried ${attempts.length} credential(s). ${detail}`
    );
    this.name = "AllProvidersFailedError";
    this.attempts = attempts;
    this.status = 503;
  }
}

async function withFailover(capability, role, run) {
  const candidates = orderCandidates(availableCredentials(capability, role));

  if (candidates.length === 0) {
    const anyConfigured = CREDENTIALS.some((c) => c.supports.includes(capability));
    throw new AllProvidersFailedError(
      role,
      anyConfigured
        ? [{ id: "pool", message: "every credential is disabled or cooling down" }]
        : [{ id: "pool", message: `no API key configured that supports ${capability}` }]
    );
  }

  // Walk (credential x model). The model chain matters as much as the key
  // chain here: Groq's daily REQUEST quota is per model, so the best model can
  // be exhausted for the day while the key itself is perfectly healthy.
  const attempts = [];
  for (const cred of candidates) {
    for (const model of [...(cred.models[role] || [])]) {
      if (isCooling(cred.id, model)) continue;
      try {
        const result = await run(cred, model);
        cred.successes++;
        const tag = `${cred.id}:${model}`;
        if (lastServed !== tag) {
          lastServed = tag;
          preferred = cred.id;
          console.log(`[AI] serving "${role}" from ${cred.id} (${model})`);
        }
        return result;
      } catch (err) {
        attempts.push({ id: `${cred.id}:${model}`, message: err?.message || String(err) });
        if (handleFailure(cred, err, role, model) === "fatal") throw err;
        // Auth failure kills the whole key, so stop trying its other models.
        // A 429 does not — it is scoped to this (key, model) pair and the loop
        // should fall through to the next model on the same key.
        const s = err?.status ?? 0;
        if (s === 401 || s === 403) break;
      }
    }
  }

  throw new AllProvidersFailedError(role, attempts);
}

/**
 * Chat completion with automatic failover.
 * `params` is passed through to the provider, minus `model`, which is resolved
 * from the role so each provider uses its own equivalent.
 */
export async function chat(role, params) {
  return withFailover("chat", role, async (cred, model) => {
    const res = await fetch(`${cred.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cred.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...params, model }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new ApiError(res.status, await readBody(res), res.headers);
    return res.json();
  });
}

/**
 * Speech-to-text with automatic failover.
 *
 * `fileFactory` must be a function, not a stream: a consumed stream cannot be
 * replayed, so a retry against the next provider would silently upload nothing.
 */
export async function transcribe({ fileFactory, filePath, ...params }) {
  if (typeof fileFactory !== "function" && !filePath) {
    throw new TypeError(
      "transcribe() needs fileFactory: () => ReadStream (or filePath) so a retry can re-read the audio"
    );
  }

  return withFailover("transcription", ROLES.TRANSCRIPTION, async (cred, model) => {
    // Read fresh per attempt — this is the whole reason a factory is required.
    const bytes = filePath
      ? await fs.promises.readFile(filePath)
      : await streamToBuffer(fileFactory());

    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "audio/wav" }), "audio.wav");
    form.append("model", model);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) form.append(k, String(v));
    }

    const res = await fetch(`${cred.baseURL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cred.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new ApiError(res.status, await readBody(res), res.headers);
    return res.json();
  });
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}
