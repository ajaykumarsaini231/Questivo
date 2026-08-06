/**
 * The per-account entitlement, end to end: an admin grants it over the real
 * admin API, and GET /api/features changes its answer for that person and for
 * nobody else.
 *
 * entitlements.test.mjs already covers the decision itself as a pure function.
 * What that cannot see is the wiring, which is where this feature is easiest to
 * get wrong: the admin route mounted behind the right guard, `optionalUser`
 * resolving the row that requireEntitlement will later read, and /api/features
 * carrying the account's answer rather than a cached site-wide one.
 *
 * TOUCHES THE DATABASE — run with `npm run test:db`, not `npm test`.
 *
 * It creates a throwaway account and deletes it in `finally`, rather than
 * flipping a real customer's access on and off. The address is under .invalid,
 * which by RFC 2606 can never be a real domain, so nothing can be sent to it.
 *
 * Run: node src/test/entitlementsApi.test.mjs
 */
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

import prisma from "../prismaClient.js";
import adminRoutes from "../routes/adminRoutes.js";
import { optionalUser } from "../middleware/optionalAuth.js";
import { entitlementsFor } from "../lib/entitlements.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`${cond ? "  PASS  " : "  FAIL  "}${label}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
};

const app = express();
app.use(cookieParser());
app.use(express.json());
app.get("/api/features", optionalUser, (req, res) => {
  res.set("Cache-Control", "private, no-store");
  res.set("Vary", "Cookie, Authorization");
  res.json({ success: true, data: entitlementsFor(req.user) });
});
app.use("/api/admin", adminRoutes);

const server = app.listen(0);
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;

const call = async (path, { token, method = "GET", body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => ({})) };
};

const sign = (userId) => jwt.sign({ userId }, process.env.Secret_Token, { expiresIn: "5m" });

let subject = null;
try {
  const admin = await prisma.user.findFirst({
    where: { role: { in: ["admin", "superadmin"] } },
    select: { id: true, email: true, role: true },
  });
  if (!admin) throw new Error("no admin account to authenticate the admin API with");
  console.log(`\nadmin driving the panel: ${admin.email} (${admin.role})`);

  subject = await prisma.user.create({
    data: {
      email: `entitlement-check-${Date.now()}@questivo.invalid`,
      name: "Entitlement check (temporary)",
      role: "user",
    },
    select: { id: true, email: true, entitlements: true },
  });
  console.log(`throwaway subject: ${subject.email}\n`);

  const adminToken = sign(admin.id);
  const userToken = sign(subject.id);

  console.log("=== before any grant ===\n");

  let r = await call("/api/features");
  check("anonymous is told AI generation is paid", r.body?.data?.aiGeneration?.premium === true);
  check("mock generation stays free", r.body?.data?.mockGeneration?.premium === false);
  check(
    "the response says not to cache it",
    /no-store/.test(r.headers.get("cache-control") ?? ""),
    r.headers.get("cache-control") ?? "(none)"
  );

  r = await call("/api/features", { token: userToken });
  check("the ungranted user is told the same", r.body?.data?.aiGeneration?.premium === true);
  check("and is not told anything was granted", r.body?.data?.aiGeneration?.granted === false);

  r = await call("/api/features", { token: adminToken });
  check("an admin holds it by role", r.body?.data?.aiGeneration?.premium === false);

  console.log("\n=== the admin flips the switch on ===\n");

  r = await call(`/api/admin/users/${subject.id}/entitlements`, {
    token: adminToken,
    method: "PATCH",
    body: { feature: "aiGeneration", granted: true },
  });
  check("the grant is accepted", r.status === 200, `${r.status}`);
  check(
    "and the column now holds the key",
    JSON.stringify(r.body?.data?.entitlements) === JSON.stringify(["aiGeneration"]),
    JSON.stringify(r.body?.data?.entitlements)
  );

  r = await call("/api/features", { token: userToken });
  check("that user is no longer paywalled", r.body?.data?.aiGeneration?.premium === false);
  check("and is told it was granted to them", r.body?.data?.aiGeneration?.granted === true);

  r = await call("/api/features");
  check(
    "the grant did not leak to anonymous visitors",
    r.body?.data?.aiGeneration?.premium === true
  );

  console.log("\n=== what the endpoint refuses ===\n");

  r = await call(`/api/admin/users/${subject.id}/entitlements`, {
    token: adminToken,
    method: "PATCH",
    body: { feature: "adminPanel", granted: true },
  });
  check("an unknown feature key is refused", r.status === 400, `${r.status}`);

  r = await call(`/api/admin/users/${subject.id}/entitlements`, {
    token: adminToken,
    method: "PATCH",
    body: { feature: "aiGeneration", granted: "false" },
  });
  check("a non-boolean `granted` is refused", r.status === 400, `${r.status}`);

  r = await call(`/api/admin/users/${subject.id}/entitlements`, {
    token: userToken,
    method: "PATCH",
    body: { feature: "aiGeneration", granted: true },
  });
  check("a non-admin cannot grant themselves access", r.status === 403, `${r.status}`);

  r = await call(`/api/admin/users/${subject.id}/entitlements`, {
    method: "PATCH",
    body: { feature: "aiGeneration", granted: true },
  });
  check("nor can an anonymous caller", r.status === 401, `${r.status}`);

  const still = await prisma.user.findUnique({
    where: { id: subject.id },
    select: { entitlements: true },
  });
  check(
    "none of those refusals changed the column",
    JSON.stringify(still.entitlements) === JSON.stringify(["aiGeneration"]),
    JSON.stringify(still.entitlements)
  );

  console.log("\n=== the admin flips it back off ===\n");

  r = await call(`/api/admin/users/${subject.id}/entitlements`, {
    token: adminToken,
    method: "PATCH",
    body: { feature: "aiGeneration", granted: false },
  });
  check("the revoke is accepted", r.status === 200, `${r.status}`);
  check("the column is empty again", JSON.stringify(r.body?.data?.entitlements) === "[]");

  r = await call("/api/features", { token: userToken });
  check("and the user is paywalled again", r.body?.data?.aiGeneration?.premium === true);
} catch (err) {
  console.error("\nERROR:", err.message);
  failures++;
} finally {
  if (subject) {
    await prisma.user.delete({ where: { id: subject.id } }).then(
      () => console.log(`\ncleaned up throwaway account ${subject.email}`),
      (e) => console.error(`\nCLEANUP FAILED for ${subject.email}: ${e.message}`)
    );
  }
  server.close();
  await prisma.$disconnect();
}

console.log(failures === 0 ? "\nAll end-to-end checks passed\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
