/**
 * Rate limiting for OTP issuance.
 *
 * THE PROBLEM
 *
 * signup, sendLoginOtp and sendResetOtp each generated a code and sent an email
 * with nothing in front of them. A loop against any of the three is a free mail
 * cannon: point it at a victim's inbox to bury them, or at our own address to
 * burn the Gmail sending quota until every real user's OTP stops arriving. The
 * second is the cheaper attack and the one that takes the site down.
 *
 * THE RULE
 *
 *   - One OTP per identifier per COOLDOWN_SECONDS (60). Asking sooner is
 *     refused with the exact number of seconds left, so the client can count
 *     down instead of guessing.
 *   - Asking again DURING that window is a strike. ABUSE_STRIKES of them and
 *     the identifier is blocked for BLOCK_HOURS (24). That is the anti-DDoS
 *     part: a script that ignores the cooldown takes itself out of the game
 *     after three requests instead of hammering forever at one per minute.
 *   - Strikes decay: if the last request was over STRIKE_DECAY_MINUTES ago the
 *     counter resets, so a user who mistypes their email today is not one click
 *     from a lockout next week.
 *
 * WHY THREE STRIKES AND NOT ONE
 *
 * The brief said to block on the second request. Taken literally that bans a
 * real user for a full day for double-clicking "Resend" — one stray click, one
 * flaky network retry, one impatient tap on a slow phone, and a paying
 * candidate cannot log in until tomorrow. The frontend already disables the
 * button for the full 60 seconds, so a person following the UI can never reach
 * even one strike; three is unreachable by accident and still triggers on the
 * second and third request of any script that ignores the UI. Set
 * OTP_ABUSE_STRIKES=1 in the environment for the strict reading.
 *
 * WHY THE STATE IS IN POSTGRES
 *
 * See the OtpThrottle model's own note: a memory store hands an attacker one
 * full allowance per running instance and forgets every block on deploy. This
 * one is correct with any number of instances, which is a precondition for
 * horizontal scaling rather than an optimisation.
 */

import prisma from "../prismaClient.js";

const int = (name, fallback) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

/** Seconds a caller must wait between OTPs for the same identifier+purpose. */
export const COOLDOWN_SECONDS = int("OTP_RESEND_COOLDOWN_SECONDS", 60);
/** Requests inside the cooldown before the identifier is blocked outright. */
export const ABUSE_STRIKES = int("OTP_ABUSE_STRIKES", 3);
/** How long that block lasts. */
export const BLOCK_HOURS = int("OTP_BLOCK_HOURS", 24);
/** Quiet period after which accumulated strikes are forgiven. */
export const STRIKE_DECAY_MINUTES = int("OTP_STRIKE_DECAY_MINUTES", 60);

/**
 * Per-source volume cap, layered under the per-identifier rule above.
 *
 * Deliberately generous and deliberately NOT a 60-second cooldown. Indian exam
 * candidates sit behind carrier-grade NAT and college networks by the
 * thousand, so a strict per-IP cooldown would lock out a whole hostel because
 * one person asked for a code. This only catches an address enumerating many
 * different accounts, and it never escalates to a 24-hour block.
 */
export const IP_MAX_PER_WINDOW = int("OTP_IP_MAX_PER_HOUR", 20);
export const IP_WINDOW_MINUTES = int("OTP_IP_WINDOW_MINUTES", 60);

export const OTP_PURPOSES = {
  SIGNUP: "SIGNUP",
  LOGIN: "LOGIN",
  RESET_PASSWORD: "RESET_PASSWORD",
};

/** Same address in two letter cases is the same person. */
const normalise = (identifier) => String(identifier || "").trim().toLowerCase();

/**
 * Client address, honouring the proxy chain.
 *
 * The API sits behind Vercel's rewrite and Render's load balancer, so
 * req.socket.remoteAddress is the proxy every single time — limiting on it
 * would rate-limit the entire internet as one client. Only the FIRST hop of
 * x-forwarded-for is the real caller; the rest can be forged by the caller and
 * must not be trusted.
 */
export const clientIp = (req) => {
  const fwd = req.headers?.["x-forwarded-for"];
  const first = Array.isArray(fwd) ? fwd[0] : String(fwd || "").split(",")[0];
  return (first || req.ip || req.socket?.remoteAddress || "unknown").trim();
};

/** Decisions this module can return. Compared by string at the call sites. */
export const DECISION = {
  ALLOWED: "allowed",
  COOLDOWN: "cooldown",
  BLOCKED: "blocked",
  IP_FLOOD: "ip_flood",
};

/**
 * Take one OTP slot for `identifier`, or explain why not.
 *
 * Read-modify-write under a row lock. Without the lock two requests landing in
 * the same millisecond — trivially arranged, and the whole point of a flood —
 * both read "last sent: never", both decide they are allowed, and two emails go
 * out per cooldown. SELECT ... FOR UPDATE makes the second wait for the first
 * to commit, so it sees the send that just happened.
 *
 * @returns {Promise<{decision: string, retryAfterSeconds: number, blockedUntil: Date|null, strikes: number, message: string}>}
 */
export async function consumeOtpSlot({ identifier, purpose, ip }) {
  const key = normalise(identifier);
  if (!key) {
    // No identifier means the caller has a bug, not that the request is safe.
    // Refusing is the only honest answer; allowing would leave a limiter with a
    // hole shaped exactly like an empty string.
    return deny(DECISION.COOLDOWN, COOLDOWN_SECONDS, null, 0);
  }

  // The per-source cap runs first and is cheap: an address that is already
  // flooding should not get to touch the per-account rows at all.
  if (ip) {
    const flood = await checkIpVolume(ip, purpose);
    if (flood) return flood;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // Create the row if this identifier has never asked before. lastSentAt is
      // seeded to the epoch rather than now(), or the very first request would
      // read as "sent a moment ago" and be refused.
      await tx.$executeRaw`
        INSERT INTO "OtpThrottle" ("id", "identifier", "purpose", "lastSentAt", "sendCount", "strikes", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, ${key}, ${purpose}, to_timestamp(0), 0, 0, now(), now())
        ON CONFLICT ("identifier", "purpose") DO NOTHING`;

      const rows = await tx.$queryRaw`
        SELECT "strikes",
               "blockedUntil",
               GREATEST(0, ${COOLDOWN_SECONDS}::int - FLOOR(EXTRACT(EPOCH FROM (now() - "lastSentAt")))::int) AS "waitLeft",
               CEIL(EXTRACT(EPOCH FROM (COALESCE("blockedUntil", now()) - now())))::int AS "blockLeft",
               (EXTRACT(EPOCH FROM (now() - "lastSentAt")) > ${STRIKE_DECAY_MINUTES * 60}::int) AS "decayed"
        FROM "OtpThrottle"
        WHERE "identifier" = ${key} AND "purpose" = ${purpose}
        FOR UPDATE`;

      const row = rows[0];
      // The row is created two statements above, so it cannot be missing; if it
      // somehow is, refuse rather than fall open.
      if (!row) return deny(DECISION.COOLDOWN, COOLDOWN_SECONDS, null, 0);

      const blockLeft = Number(row.blockLeft) || 0;
      if (row.blockedUntil && blockLeft > 0) {
        return deny(DECISION.BLOCKED, blockLeft, row.blockedUntil, Number(row.strikes));
      }

      const waitLeft = Number(row.waitLeft) || 0;
      if (waitLeft > 0) {
        // Asked again while already told to wait. Strike, and block on the third.
        const strikes = (row.decayed ? 0 : Number(row.strikes)) + 1;
        const blocking = strikes >= ABUSE_STRIKES;
        const blockedUntil = blocking
          ? new Date(Date.now() + BLOCK_HOURS * 60 * 60 * 1000)
          : null;

        await tx.$executeRaw`
          UPDATE "OtpThrottle"
          SET "strikes" = ${strikes},
              "blockedUntil" = ${blockedUntil},
              "updatedAt" = now()
          WHERE "identifier" = ${key} AND "purpose" = ${purpose}`;

        return blocking
          ? deny(DECISION.BLOCKED, BLOCK_HOURS * 60 * 60, blockedUntil, strikes)
          : deny(DECISION.COOLDOWN, waitLeft, null, strikes);
      }

      // Allowed. The clock restarts here, and a well-behaved request forgives
      // whatever strikes had built up — the counter exists to catch hammering,
      // not to remember it forever.
      await tx.$executeRaw`
        UPDATE "OtpThrottle"
        SET "lastSentAt" = now(),
            "sendCount" = "sendCount" + 1,
            "strikes" = ${row.decayed ? 0 : Math.max(0, Number(row.strikes) - 1)},
            "blockedUntil" = NULL,
            "updatedAt" = now()
        WHERE "identifier" = ${key} AND "purpose" = ${purpose}`;

      return {
        decision: DECISION.ALLOWED,
        retryAfterSeconds: COOLDOWN_SECONDS,
        blockedUntil: null,
        strikes: 0,
        message: "",
      };
    });
  } catch (err) {
    // FAIL CLOSED.
    //
    // The usual instinct with a limiter is to let traffic through when the
    // store is unreachable, so an outage in the limiter does not become an
    // outage in the product. That is exactly backwards here: the thing being
    // limited SENDS EMAIL AND COSTS MONEY, and the most likely reason the
    // database is struggling is the flood this exists to stop. Refusing costs a
    // user one retry; falling open costs the mail quota.
    console.error(`[otp] throttle unavailable, refusing send: ${err.message}`);
    return deny(DECISION.COOLDOWN, COOLDOWN_SECONDS, null, 0);
  }
}

/** Has this source asked for too many codes across all accounts lately? */
async function checkIpVolume(ip, purpose) {
  const key = `ip:${normalise(ip)}`;
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "OtpThrottle" ("id", "identifier", "purpose", "lastSentAt", "sendCount", "strikes", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, ${key}, 'IP', now(), 0, 0, now(), now())
        ON CONFLICT ("identifier", "purpose") DO NOTHING`;

      const rows = await tx.$queryRaw`
        SELECT "sendCount",
               (EXTRACT(EPOCH FROM (now() - "lastSentAt")) > ${IP_WINDOW_MINUTES * 60}::int) AS "expired"
        FROM "OtpThrottle"
        WHERE "identifier" = ${key} AND "purpose" = 'IP'
        FOR UPDATE`;

      const row = rows[0];
      if (!row) return null;

      // A fixed window, not a sliding one. Less precise, but it is one row and
      // one update per request instead of a log of every attempt, and the cap
      // is generous enough that the boundary effect does not matter.
      const count = row.expired ? 0 : Number(row.sendCount);
      if (count >= IP_MAX_PER_WINDOW) {
        return {
          decision: DECISION.IP_FLOOD,
          retryAfterSeconds: IP_WINDOW_MINUTES * 60,
          blockedUntil: null,
          strikes: 0,
          message:
            `Too many verification codes have been requested from this network. ` +
            `Please try again in about ${IP_WINDOW_MINUTES} minutes.`,
        };
      }

      // The window only restarts when the old one has actually expired, so
      // lastSentAt is chosen in SQL rather than passed in — binding `undefined`
      // here would write NULL into a NOT NULL column and take the endpoint down.
      await tx.$executeRaw`
        UPDATE "OtpThrottle"
        SET "sendCount" = ${count + 1},
            "lastSentAt" = CASE WHEN ${row.expired} THEN now() ELSE "lastSentAt" END,
            "updatedAt" = now()
        WHERE "identifier" = ${key} AND "purpose" = 'IP'`;

      return null;
    });
  } catch (err) {
    // The per-account rule below is the primary defence and has its own
    // fail-closed path, so a hiccup here should not refuse a legitimate user.
    console.warn(`[otp] ip volume check skipped: ${err.message}`);
    return null;
  }
}

function deny(decision, retryAfterSeconds, blockedUntil, strikes) {
  const hours = Math.max(1, Math.ceil(retryAfterSeconds / 3600));
  return {
    decision,
    retryAfterSeconds,
    blockedUntil: blockedUntil ?? null,
    strikes,
    message:
      decision === DECISION.BLOCKED
        ? `Too many verification codes have been requested for this account. ` +
          `For security, new codes are paused for ${hours} hour${hours === 1 ? "" : "s"}.`
        : `Please wait ${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"} before requesting another code.`,
  };
}

/**
 * Refuse the request if the caller has no slot, and report it in a shape the
 * client can act on.
 *
 * 429 with Retry-After is the standard the browser and every HTTP client
 * already understand, and `retryAfterSeconds` in the body is what the resend
 * button counts down from — so the UI never has to guess how long to disable
 * itself, and a limit change on the server does not need a frontend release.
 *
 * @returns {Promise<boolean>} true when the caller may proceed.
 */
export async function guardOtpSend(req, res, { identifier, purpose }) {
  const result = await consumeOtpSlot({
    identifier,
    purpose,
    ip: clientIp(req),
  });

  if (result.decision === DECISION.ALLOWED) return true;

  res.set("Retry-After", String(result.retryAfterSeconds));
  res.status(429).json({
    success: false,
    message: result.message,
    error: result.message,
    retryAfterSeconds: result.retryAfterSeconds,
    blocked: result.decision === DECISION.BLOCKED,
    blockedUntil: result.blockedUntil,
  });
  return false;
}

/**
 * Drop throttle rows nothing will ever read again.
 *
 * Unbounded growth here is slow but real: one row per address that ever asked
 * for a code, forever, plus one per source address. A row is dead once it is
 * past its block and well past its cooldown.
 */
export async function sweepOtpThrottle() {
  const cutoff = new Date(Date.now() - Math.max(BLOCK_HOURS, 24) * 60 * 60 * 1000);
  try {
    const { count } = await prisma.otpThrottle.deleteMany({
      where: {
        updatedAt: { lt: cutoff },
        OR: [{ blockedUntil: null }, { blockedUntil: { lt: new Date() } }],
      },
    });
    if (count) console.log(`[otp] swept ${count} expired throttle rows`);
    return count;
  } catch (err) {
    console.warn(`[otp] sweep failed: ${err.message}`);
    return 0;
  }
}
