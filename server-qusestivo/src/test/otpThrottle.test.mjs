/**
 * OTP throttle: the cooldown, the strike escalation and the 24-hour block.
 *
 * Runs against the real database, because the whole point of this limiter is
 * that its state lives in Postgres under a row lock — a test with a stubbed
 * store would prove the arithmetic and miss the only part that is hard. It
 * uses a unique throw-away identifier per run and deletes its own rows, so it
 * never touches a real account.
 */

import "dotenv/config";
import prisma from "../prismaClient.js";
import {
  consumeOtpSlot,
  DECISION,
  COOLDOWN_SECONDS,
  ABUSE_STRIKES,
  BLOCK_HOURS,
} from "../lib/otpThrottle.js";

let passed = 0;
let failed = 0;

const check = (label, actual, expected) => {
  const ok = actual === expected;
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — expected ${expected}, got ${actual}`}`);
};

const PURPOSE = "LOGIN";
const ident = `throttle-test-${process.pid}-${Date.now()}@example.invalid`;

const cleanup = async () => {
  await prisma.otpThrottle.deleteMany({
    where: { OR: [{ identifier: ident }, { identifier: "ip:198.51.100.7" }] },
  });
};

try {
  await cleanup();

  console.log(`\n=== OTP throttle (cooldown ${COOLDOWN_SECONDS}s, ${ABUSE_STRIKES} strikes, ${BLOCK_HOURS}h block) ===\n`);

  // 1. First request from a brand new identifier is always allowed.
  const first = await consumeOtpSlot({ identifier: ident, purpose: PURPOSE });
  check("first request is allowed", first.decision, DECISION.ALLOWED);

  // 2. Immediately asking again is refused, with time remaining.
  const second = await consumeOtpSlot({ identifier: ident, purpose: PURPOSE });
  check("second request inside the window is refused", second.decision, DECISION.COOLDOWN);
  check("refusal carries a countdown", second.retryAfterSeconds > 0, true);
  check("countdown is within the cooldown", second.retryAfterSeconds <= COOLDOWN_SECONDS, true);
  check("first violation is one strike", second.strikes, 1);

  // 3. Keep hammering: the strike limit blocks the identifier outright.
  let last = second;
  for (let i = second.strikes + 1; i <= ABUSE_STRIKES; i++) {
    last = await consumeOtpSlot({ identifier: ident, purpose: PURPOSE });
  }
  check(`request ${ABUSE_STRIKES + 1} is blocked, not merely cooled down`, last.decision, DECISION.BLOCKED);
  check("block carries an end time", last.blockedUntil instanceof Date, true);

  const blockHours = (last.blockedUntil.getTime() - Date.now()) / 3_600_000;
  check(`block lasts about ${BLOCK_HOURS}h`, Math.round(blockHours), BLOCK_HOURS);

  // 4. The block persists — it is a row, not a variable.
  const stored = await prisma.otpThrottle.findUnique({
    where: { identifier_purpose: { identifier: ident, purpose: PURPOSE } },
  });
  check("block is stored in the database", stored?.blockedUntil != null, true);
  check("strike count is stored", stored.strikes >= ABUSE_STRIKES, true);

  // 5. A blocked identifier stays blocked even once the 60s cooldown lapses.
  await prisma.otpThrottle.update({
    where: { identifier_purpose: { identifier: ident, purpose: PURPOSE } },
    data: { lastSentAt: new Date(Date.now() - 10 * 60 * 1000) },
  });
  const whileBlocked = await consumeOtpSlot({ identifier: ident, purpose: PURPOSE });
  check("cooldown lapsing does not lift the block", whileBlocked.decision, DECISION.BLOCKED);

  // 6. Once the block expires the identifier is served again.
  await prisma.otpThrottle.update({
    where: { identifier_purpose: { identifier: ident, purpose: PURPOSE } },
    data: { blockedUntil: new Date(Date.now() - 1000), lastSentAt: new Date(Date.now() - 10 * 60 * 1000) },
  });
  const afterBlock = await consumeOtpSlot({ identifier: ident, purpose: PURPOSE });
  check("expired block releases the identifier", afterBlock.decision, DECISION.ALLOWED);

  // 7. Purposes are independent: a login lockout must not block a reset.
  await prisma.otpThrottle.update({
    where: { identifier_purpose: { identifier: ident, purpose: PURPOSE } },
    data: { blockedUntil: new Date(Date.now() + 60 * 60 * 1000) },
  });
  const otherPurpose = await consumeOtpSlot({ identifier: ident, purpose: "RESET_PASSWORD" });
  check("a login block does not block a password reset", otherPurpose.decision, DECISION.ALLOWED);

  // 8. Case and whitespace are the same person.
  await prisma.otpThrottle.deleteMany({ where: { identifier: ident } });
  await consumeOtpSlot({ identifier: ident, purpose: PURPOSE });
  const upper = await consumeOtpSlot({ identifier: `  ${ident.toUpperCase()}  `, purpose: PURPOSE });
  check("upper-case spelling shares the same limit", upper.decision, DECISION.COOLDOWN);

  // 9. Concurrency: ten simultaneous requests must yield exactly one send.
  //    This is the case a memory limiter and an unlocked read-modify-write both
  //    get wrong, and it is precisely what a flood looks like.
  const raceIdent = `race-${ident}`;
  const burst = await Promise.all(
    Array.from({ length: 10 }, () => consumeOtpSlot({ identifier: raceIdent, purpose: PURPOSE }))
  );
  const allowedCount = burst.filter((r) => r.decision === DECISION.ALLOWED).length;
  check("ten simultaneous requests issue exactly one code", allowedCount, 1);
  await prisma.otpThrottle.deleteMany({ where: { identifier: raceIdent } });

  // 10. The per-source cap counts across different accounts.
  const ip = "198.51.100.7";
  const flooders = [];
  for (let i = 0; i < 25; i++) {
    flooders.push(
      await consumeOtpSlot({ identifier: `flood-${i}-${ident}`, purpose: PURPOSE, ip })
    );
  }
  check(
    "one source enumerating many accounts is eventually refused",
    flooders.some((r) => r.decision === DECISION.IP_FLOOD),
    true
  );
  await prisma.otpThrottle.deleteMany({ where: { identifier: { startsWith: `flood-` } } });
} finally {
  await cleanup();
  await prisma.$disconnect();
}

console.log(`\n${failed === 0 ? "✅" : "❌"} OTP throttle: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
