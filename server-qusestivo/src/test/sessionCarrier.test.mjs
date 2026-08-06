/**
 * A session must be accepted from either carrier: the httpOnly cookie, or an
 * Authorization: Bearer header.
 *
 * The header exists because the cookie does not always arrive. Where the page
 * and the API are different sites — which they are on questivo.vercel.app —
 * the session cookie is third-party, and a browser that blocks those throws it
 * away without telling anyone. Sign-in answered 200, the UI believed it, and
 * the next request came back 401. This asserts the header path really is a
 * second way in, and that it is not a way in for a token that should not work.
 *
 * Runs against the real express stack (cookie-parser, the real middleware, a
 * real HTTP round trip) so it fails if any of those stop agreeing. No database:
 * these middlewares only verify a JWT.
 *
 * Run: node src/test/sessionCarrier.test.mjs
 */
process.env.Secret_Token ||= "session-carrier-test-secret";

import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

import { protect } from "../middleware/authMiddleware.js";
import { optionalAuth } from "../middleware/optionalAuth.js";
import { readSessionToken } from "../lib/sessionToken.js";
import { handleServerError } from "../utills/errorHandler.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`${cond ? "  PASS  " : "  FAIL  "}${label}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
};

const USER = "user_carrier_test";
const token = jwt.sign({ userId: USER }, process.env.Secret_Token, { expiresIn: "5m" });
const expired = jwt.sign({ userId: USER }, process.env.Secret_Token, { expiresIn: -60 });
const forged = jwt.sign({ userId: "someone_else" }, "not-the-server-secret");

const app = express();
app.use(cookieParser());
app.get("/private", protect, (req, res) => res.json({ userId: req.userId }));
app.get("/public", optionalAuth, (req, res) => res.json({ userId: req.userId ?? null }));
// protect throws rather than calling next(err), so the rejection lands here.
app.use((err, req, res, _next) => handleServerError(err, res));

const server = app.listen(0);
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;

const call = async (path, headers = {}) => {
  const res = await fetch(base + path, { headers });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

console.log("\n=== protect: both carriers open the door ===\n");

let r = await call("/private", { cookie: `token=${token}` });
check("cookie alone authenticates", r.status === 200 && r.body.userId === USER, `${r.status}`);

r = await call("/private", { authorization: `Bearer ${token}` });
check("bearer header alone authenticates", r.status === 200 && r.body.userId === USER, `${r.status}`);

r = await call("/private", { cookie: `token=${token}`, authorization: `Bearer ${token}` });
check("both together authenticate", r.status === 200 && r.body.userId === USER, `${r.status}`);

r = await call("/private");
check("neither is 401", r.status === 401, `${r.status}`);

console.log("\n=== the header is not a way past verification ===\n");

r = await call("/private", { authorization: `Bearer ${forged}` });
check("token signed with another secret is 401", r.status === 401, `${r.status}`);

r = await call("/private", { authorization: `Bearer ${expired}` });
check("expired token is 401", r.status === 401, `${r.status}`);

r = await call("/private", { authorization: `Bearer ${token}x` });
check("tampered token is 401", r.status === 401, `${r.status}`);

r = await call("/private", { authorization: token });
check("bare token without the Bearer scheme is 401", r.status === 401, `${r.status}`);

r = await call("/private", { authorization: "Bearer    " });
check("empty bearer is 401, not a token of spaces", r.status === 401, `${r.status}`);

console.log("\n=== optionalAuth: identifies, never rejects ===\n");

r = await call("/public");
check("anonymous is served with no user", r.status === 200 && r.body.userId === null, `${r.status}`);

r = await call("/public", { authorization: `Bearer ${token}` });
check("bearer identifies the caller", r.status === 200 && r.body.userId === USER, `${r.status}`);

r = await call("/public", { cookie: `token=${token}` });
check("cookie identifies the caller", r.status === 200 && r.body.userId === USER, `${r.status}`);

r = await call("/public", { authorization: `Bearer ${expired}` });
check(
  "an expired token is logged-out, not an error",
  r.status === 200 && r.body.userId === null,
  `${r.status}`
);

console.log("\n=== precedence: the cookie is read first ===\n");

// Not a preference between two valid sessions — they are the same session in
// practice. It is that the httpOnly carrier, the one a page script cannot
// reach, is what decides the request wherever the browser still sends it.
check(
  "cookie wins when both are present",
  readSessionToken({ cookies: { token: "from-cookie" }, headers: { authorization: "Bearer from-header" } }) ===
    "from-cookie"
);
check(
  "header is read when there is no cookie",
  readSessionToken({ cookies: {}, headers: { authorization: "Bearer from-header" } }) === "from-header"
);
check(
  "an empty cookie does not shadow the header",
  readSessionToken({ cookies: { token: "" }, headers: { authorization: "Bearer from-header" } }) === "from-header"
);
check("nothing present reads as undefined", readSessionToken({}) === undefined);

server.close();

console.log(failures === 0 ? "\nAll session-carrier checks passed\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
