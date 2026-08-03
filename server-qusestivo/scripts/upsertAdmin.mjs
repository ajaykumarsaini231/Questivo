/**
 * Create or promote a super-admin user.
 *
 *   node scripts/upsertAdmin.mjs <email> <password> [role]
 *
 * Idempotent: creates the account if the email is new, otherwise updates the
 * existing row's password and role. Never creates a duplicate.
 *
 * Values are matched to the running app, not guessed:
 *   role         "superadmin"  — src/middleware/adminIdentifier.js accepts only
 *                               "admin" or "superadmin"; anything else is a
 *                               normal user that silently fails the admin gate.
 *   passwordHash bcrypt cost 12 — same as doHash(password, 12) in signup, so
 *                               the existing sign-in comparison works unchanged.
 *   authProvider LOCAL         — password sign-in rather than Google.
 *   isVerified   true          — skips the OTP gate for this account.
 */
import dotenv from "dotenv";
import prisma from "../src/prismaClient.js";
import { doHash, dohashValidation } from "../src/utills/hashing.js";

dotenv.config();

const [email, password, roleArg] = process.argv.slice(2);
const role = roleArg || "superadmin";

if (!email || !password) {
  console.error("\nUsage: node scripts/upsertAdmin.mjs <email> <password> [role]\n");
  process.exit(1);
}
if (!email.includes("@")) {
  console.error("\nThat does not look like an email address.\n");
  process.exit(1);
}

const normalised = email.trim().toLowerCase();

try {
  const existing = await prisma.user.findUnique({
    where: { email: normalised },
    select: { id: true, email: true, name: true, role: true, authProvider: true },
  });

  const passwordHash = await doHash(password, 12);

  const data = {
    passwordHash,
    role,
    isVerified: true,
    authProvider: "LOCAL",
    // Clear any pending OTP so a stale challenge cannot interfere with sign-in.
    otpHash: null,
    otpExpiresAt: null,
    otpPurpose: null,
  };

  let user;
  if (existing) {
    user = await prisma.user.update({
      where: { email: normalised },
      data,
      select: { id: true, email: true, name: true, role: true, isVerified: true, authProvider: true },
    });
    console.log(`\nUPDATED existing user (was role "${existing.role}")`);
  } else {
    user = await prisma.user.create({
      data: { ...data, email: normalised, name: normalised.split("@")[0] },
      select: { id: true, email: true, name: true, role: true, isVerified: true, authProvider: true },
    });
    console.log("\nCREATED new user");
  }

  // Prove the stored hash actually validates the given password, rather than
  // trusting that the write succeeded.
  const check = await prisma.user.findUnique({
    where: { email: normalised },
    select: { passwordHash: true },
  });
  const valid = await dohashValidation(password, check.passwordHash);

  console.log("  id           :", user.id);
  console.log("  email        :", user.email);
  console.log("  name         :", user.name);
  console.log("  role         :", user.role, user.role === "superadmin" || user.role === "admin" ? "(passes the admin gate)" : "(NOT an admin role)");
  console.log("  isVerified   :", user.isVerified);
  console.log("  authProvider :", user.authProvider);
  console.log("  password check:", valid ? "PASSES" : "FAILS");
  console.log("");

  process.exitCode = valid ? 0 : 1;
} catch (err) {
  console.error("\nFailed:", err.message, "\n");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
