// Who the visitor is, and therefore what the site shows them.
//
// WHY THIS EXISTS
//
// Questivo carries three things that serve three different people: exam mock
// tests, an ATS resume checker and an AI interview studio. Showing all of it to
// everyone means a Class 12 NEET aspirant lands on a page offering to rewrite
// their resume, which is noise at best and makes the site look unfocused at
// worst. So the visitor picks a track once, and the site narrows to it.
//
// THREE RULES THIS FILE IS BUILT AROUND
//
// 1. Narrowing is a default, never a wall. Everything stays reachable — the
//    exam directory keeps a "show all exams" escape hatch, and a gated tool
//    explains itself rather than 404ing. A visitor who mis-picks must never be
//    trapped, and must never be told a feature does not exist when it does.
//
// 2. No track means everything. That is what an unhydrated page, a first-time
//    visitor and a crawler all see. Prerendered HTML is therefore identical for
//    every visitor and always the fullest version of the site, so filtering can
//    never read as cloaking — the narrowing happens after hydration, from a
//    choice the visitor made themselves.
//
// 3. Admins bypass it entirely. An operator has to be able to see every exam
//    and every tool regardless of any track stored in their browser.

import { EXAMS, type Exam } from "./exams";

/* ------------------------------- features ------------------------------- */

export type FeatureId = "mockTests" | "pyq" | "resumeAts" | "aiInterview";

export type AudienceId = "jee-neet" | "government" | "college";

export interface Audience {
  id: AudienceId;
  /** Shown on the chooser card and in the header switcher. */
  label: string;
  /** One line under the label on the chooser. */
  tagline: string;
  /** Exam slugs from lib/exams.ts that belong to this track. */
  examSlugs: string[];
  /** What this track can see. Anything false is hidden from navigation. */
  features: Record<FeatureId, boolean>;
}

/**
 * The tracks.
 *
 * The feature matrix is the whole product decision, so it is stated once, here,
 * rather than being spread across a dozen `if` statements in components:
 *
 *   - JEE / NEET aspirants are school students sitting an entrance exam. They
 *     have no resume and no job interview, so both career tools are hidden.
 *     This is the case the brief called out explicitly.
 *
 *   - Government aspirants keep the AI interview: UPSC's Personality Test is an
 *     interview, and several SSC and RRB tracks end in one. They have no use for
 *     an ATS resume score, because government recruitment does not screen
 *     resumes through applicant tracking systems at all.
 *
 *   - College students and graduates get everything. They are the group sitting
 *     GATE while also applying for placements, which is exactly what the resume
 *     checker and the interview studio are for.
 *
 * To move a tool between tracks, change the boolean here and nothing else.
 */
export const AUDIENCES: Audience[] = [
  {
    id: "jee-neet",
    label: "JEE / NEET aspirant",
    tagline: "Class 11, 12 or dropper preparing for an engineering or medical entrance exam.",
    examSlugs: ["jee-main", "jee-advanced", "neet-ug"],
    features: { mockTests: true, pyq: true, resumeAts: false, aiInterview: false },
  },
  {
    id: "government",
    label: "Government exam aspirant",
    tagline: "Preparing for SSC, Railways or UPSC recruitment.",
    examSlugs: ["ssc-cgl", "rrb-ntpc", "upsc-ias"],
    // The interview studio stays: UPSC's final stage is an interview.
    features: { mockTests: true, pyq: true, resumeAts: false, aiInterview: true },
  },
  {
    id: "college",
    label: "College student or graduate",
    tagline: "Sitting GATE, or preparing for placements and job interviews.",
    examSlugs: ["gate-metallurgy"],
    features: { mockTests: true, pyq: true, resumeAts: true, aiInterview: true },
  },
];

export const getAudience = (id?: AudienceId | null): Audience | null =>
  AUDIENCES.find((a) => a.id === id) ?? null;

/** Exams belonging to a track, in the order lib/exams.ts declares them. */
export function examsForAudience(audience: Audience | null): Exam[] {
  if (!audience) return EXAMS;
  const wanted = new Set(audience.examSlugs);
  return EXAMS.filter((e) => wanted.has(e.slug));
}

/** No track selected means no restriction — see rule 2 at the top of this file. */
export function audienceAllows(audience: Audience | null, feature: FeatureId): boolean {
  return audience ? audience.features[feature] : true;
}

/** Which track an exam belongs to, used to offer a switch instead of a dead end. */
export function audienceForExamSlug(slug: string): Audience | null {
  return AUDIENCES.find((a) => a.examSlugs.includes(slug)) ?? null;
}

/* ------------------------------- storage -------------------------------- */

/**
 * Versioned key. The stored shape is part of this module's contract, and a
 * rename here is cheaper than migrating whatever is already in a visitor's
 * browser — a bumped version simply re-asks the question once.
 */
const STORAGE_KEY = "questivo.track.v1";

export interface StoredTrack {
  audience: AudienceId | null;
  /**
   * A single exam to lead with, inside the chosen track. Optional: a visitor
   * who is certain gets a site pointed at exactly one exam, and one who is not
   * gets the whole track.
   */
  focusExam: string | null;
  /** Set when the visitor explicitly chose "show me everything". */
  dismissed?: boolean;
}

/**
 * Read the stored choice.
 *
 * Returns null on the server, in a prerender, and whenever storage is
 * unavailable — private browsing and blocked-cookie setups both throw on
 * access rather than returning empty, and an exception here would take the
 * whole app down on first paint.
 */
export function readTrack(): StoredTrack | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredTrack;
    // A hand-edited or stale value must not select a track that no longer
    // exists, which would filter every exam out and leave an empty site.
    if (parsed.audience && !getAudience(parsed.audience)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeTrack(value: StoredTrack): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* Storage full or blocked. The choice lasts this session only. */
  }
}

export function clearStoredTrack(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}
