/**
 * Failover test for the AI credential pool.
 *
 * Run:  node src/test/aiFailover.test.mjs
 *
 * Spins up a local OpenAI-compatible endpoint that fails in the specific ways
 * real providers fail, points synthetic keys at it, and asserts the client
 * rolls over correctly. No real API keys and no network calls.
 *
 * Worth re-running whenever you add a provider or change a model chain.
 */
import http from "node:http";

const PORT = 5599;

/* ------------------------- mock provider ------------------------------- */
let requestLog = [];   // [{key, model, path}]

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const key = (req.headers.authorization || "").replace("Bearer ", "");
    let model = "";
    try { model = JSON.parse(raw).model; } catch { /* ignore */ }
    requestLog.push({ key, model, path: req.url });

    const send = (code, body, headers = {}) => {
      res.writeHead(code, { "Content-Type": "application/json", ...headers });
      res.end(JSON.stringify(body));
    };

    if (key === "key_expired") return send(401, { error: { message: "Invalid API Key" } });
    if (key === "key_down") return send(503, { error: { message: "Service unavailable" } });
    // This key is exhausted on the FIRST model of the chain but fine on the second.
    if (key === "key_partial" && model === "model_a")
      return send(429, { error: { message: "Rate limit reached" } }, { "retry-after": "2" });
    if (key === "key_ratelimited")
      return send(429, { error: { message: "Rate limit reached" } }, { "retry-after": "2" });
    if (model === "model_missing")
      return send(404, { error: { message: "The model does not exist", code: "model_not_found" } });

    send(200, {
      id: "chatcmpl-mock",
      choices: [{ message: { role: "assistant", content: `served by ${key}/${model}` } }],
    });
  });
});

await new Promise((r) => server.listen(PORT, r));

/* --------------------- env must be set before import -------------------- */
process.env.GROQ_API_KEY = "key_expired";
process.env.GROQ_API_KEY_2 = "key_ratelimited";
process.env.GROQ_API_KEY_3 = "key_down";
process.env.GROQ_API_KEY_4 = "key_partial";
process.env.GROQ_API_KEY_5 = "key_healthy";
process.env.GROQ_BASE_URL = `http://localhost:${PORT}`;
process.env.AI_PROVIDER_ORDER = "groq";
process.env.GROQ_MODEL_GENERATION = "model_a,model_b";
// Must be set before the import below — aiProviders reads env at module load.
process.env.GROQ_MODEL_ANALYSIS = "model_missing,model_b";
process.env.AI_RATE_LIMIT_COOLDOWN_MS = "2000";
process.env.AI_SERVER_ERROR_COOLDOWN_MS = "2000";

const { chat, ROLES, credentialReport } = await import("../lib/aiClient.js");

/* ------------------------------ assertions ------------------------------ */
let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`${cond ? "  PASS  " : "  FAIL  "}${label}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
};

console.log("\n=== AI failover ===\n");

const res = await chat(ROLES.GENERATION, {
  messages: [{ role: "user", content: "ping" }],
  max_tokens: 8,
});
const content = res.choices[0].message.content;

// 1. Endpoint shape. This is what caught the SDK double-prefixing /openai/v1.
check(
  "posts to exactly {baseURL}/chat/completions",
  requestLog.every((r) => r.path === "/chat/completions"),
  [...new Set(requestLog.map((r) => r.path))].join(", ")
);

// 2. key_partial is rate limited on model_a but healthy on model_b, so the
//    chain must fall to model_b on the SAME key rather than skipping the key.
check("falls over to the next MODEL on the same key", content === "served by key_partial/model_b", content);

// Expected walk: for each key, try model_a then model_b, except that an auth
// failure (key_expired) abandons the key immediately.
const seq = requestLog.map((r) => `${r.key}/${r.model}`).join(" -> ");
check(
  "walks every model on a key before moving on, but abandons a key on 401",
  seq ===
    "key_expired/model_a -> " +
      "key_ratelimited/model_a -> key_ratelimited/model_b -> " +
      "key_down/model_a -> key_down/model_b -> " +
      "key_partial/model_a -> key_partial/model_b",
  seq
);
check(
  "401 key is tried once, not once per model",
  requestLog.filter((r) => r.key === "key_expired").length === 1
);

// 3. Credential health per failure mode.
const report = credentialReport();
check("expired key is disabled", report[0].state === "disabled", report[0].reason);
check("5xx key is cooling down", report[2].state === "cooling-down");
check(
  "rate-limited key is NOT disabled (limit is per model, not per key)",
  report[1].state === "ready",
  report[1].state
);

// 4. Sticky: a second call goes straight to the pair that worked.
requestLog = [];
await chat(ROLES.GENERATION, { messages: [{ role: "user", content: "ping" }], max_tokens: 8 });
check(
  "sticky: reuses the last good key+model",
  requestLog.length === 1 && requestLog[0].key === "key_partial" && requestLog[0].model === "model_b",
  requestLog.map((r) => `${r.key}/${r.model}`).join(",")
);

// 5. A model the provider does not serve is dropped from the chain.
requestLog = [];
const r2 = await chat(ROLES.ANALYSIS, { messages: [{ role: "user", content: "x" }] });
check("drops a 404 model and uses the next in the chain", r2.choices[0].message.content.endsWith("model_b"));

// 6. Exhaustion produces one clear error rather than a raw provider error.
try {
  const { CREDENTIALS } = await import("../lib/aiProviders.js");
  CREDENTIALS.forEach((c) => { c.disabled = true; });
  await chat(ROLES.GENERATION, { messages: [{ role: "user", content: "x" }] });
  check("throws when pool is exhausted", false, "no error thrown");
} catch (err) {
  check(
    "throws a clear error when pool is exhausted",
    err.name === "AllProvidersFailedError" && err.status === 503,
    err.message.slice(0, 70)
  );
}

// 7. Keys never leak into the report.
const serialized = JSON.stringify(credentialReport());
check(
  "report never contains key values",
  !serialized.includes("key_healthy") && !serialized.includes("key_expired")
);

console.log(`\n${failures === 0 ? "All checks passed." : failures + " CHECK(S) FAILED"}\n`);
// Set the code and let the event loop drain on its own. Calling process.exit()
// while the HTTP server still has handles closing aborts the process with a
// libuv assertion on Windows, which reads as a failed test run even when every
// check passed.
process.exitCode = failures === 0 ? 0 : 1;
server.closeAllConnections?.();
server.close();
