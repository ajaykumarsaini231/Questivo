// Database side of the PYQ pattern: query the rows, aggregate them, cache the
// result. The maths lives in pyqPattern.js, which stays free of I/O.

import prisma from "../prismaClient.js";
import { aggregatePyqProfile, resolvePyqExamCode } from "./pyqPattern.js";

/**
 * Distribution of an exam's stored previous year questions.
 *
 * Only the four columns the aggregation needs are selected — question text and
 * solutions are never loaded, because they never reach a prompt.
 */
export async function buildPyqProfile(examCode, years = 10) {
  const cutoff = new Date().getFullYear() - years;
  const rows = await prisma.previousYearQuestion.findMany({
    where: { examCode, year: { gte: cutoff } },
    select: { subject: true, topic: true, questionType: true, year: true },
  });
  return aggregatePyqProfile(rows, examCode);
}

/**
 * In-memory cache. A full paper makes one generation call per section (six for
 * JEE Main); without this each one would re-run the same aggregation query.
 */
const PROFILE_TTL_MS = Number(process.env.PYQ_PROFILE_TTL_MS || 10 * 60 * 1000);
const profileCache = new Map(); // examCode -> { at, profile }

export async function getCachedPyqProfile(examCode) {
  const code = resolvePyqExamCode(examCode);
  if (!code) return null;

  const hit = profileCache.get(code);
  if (hit && Date.now() - hit.at < PROFILE_TTL_MS) return hit.profile;

  let profile = null;
  try {
    profile = await buildPyqProfile(code);
  } catch (err) {
    // A PYQ table that is missing or unreachable must not take generation down
    // with it — the static exam pattern is still a good fallback. Not cached,
    // so the next paper retries instead of inheriting the outage for 10 minutes.
    console.warn(`[PYQ] profile lookup failed for ${code}: ${err.message}`);
    return null;
  }

  // A null profile IS cached: an exam with no PYQs should not re-query per section.
  profileCache.set(code, { at: Date.now(), profile });
  return profile;
}

/** Drop the cache after an import so new rows apply without a restart. */
export function clearPyqProfileCache(examCode) {
  if (examCode) profileCache.delete(resolvePyqExamCode(examCode) || examCode);
  else profileCache.clear();
}
