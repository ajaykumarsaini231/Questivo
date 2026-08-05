/**
 * A candidate's test history — types and fetchers.
 *
 * Three categories, and they are genuinely three different things rather than
 * one list with a tag:
 *
 *   PYQ Tests            one real shift, sat as printed. Stored as a PyqAttempt
 *                        with kind "pyq"; the questions live in the shared
 *                        archive, so an attempt is one row.
 *   Mock Tests           a paper the candidate configured on the generate
 *                        screen. Stored as a TestSession, which OWNS its
 *                        questions because they exist nowhere else.
 *   Generated Mock Tests a paper drawn from the question bank to a pattern.
 *                        A PyqAttempt with kind "generated"; `questionIds` is
 *                        the paper, since the draw exists nowhere else.
 *
 * The reason the first and third share a table and the second does not is the
 * question ownership, not the flow — see the PyqAttempt model's own note.
 */

import { API_BASE } from "./apiBase";

export type AttemptKind = "pyq" | "generated";
export type HistoryCategory = AttemptKind | "mock";

/** One sitting of a real paper or a generated one. */
export interface AttemptRow {
  id: string;
  kind: AttemptKind;
  paperId: string;
  examCode: string;
  examName: string;
  year: number;
  /** "Session 1 · 24 Jan 2023 · Shift 1" — the three facets below, joined. */
  label: string | null;
  sessionLabel: string | null;
  dateLabel: string | null;
  shiftLabel: string | null;
  /** Only set when the paper covered one subject. */
  subject: string | null;
  score: number;
  totalMarks: number;
  percent: number;
  correct: number;
  wrong: number;
  unattempted: number;
  totalQuestions: number | null;
  timeTakenSeconds: number | null;
  createdAt: string;
  spec?: Record<string, any> | null;
  /**
   * Standing against everyone else who sat the same paper. Absent — not zero —
   * until enough other candidates have sat it for the number to mean anything.
   */
  percentile?: number;
  rank?: number;
  outOf?: number;
}

/** One mock test the candidate configured and generated themselves. */
export interface MockRow {
  id: string;
  sessionId: string;
  kind: "mock";
  examType: string;
  examName: string;
  medium: string;
  createdAt: string;
  /** Null when the test was generated but never submitted. */
  scorePercent: number | null;
  correct: number;
  totalQuestions: number;
  difficulty: string;
  /** "mock" | "practice" | "pyq" — how its questions were sourced. */
  sourceType: string;
  durationMinutes: number | null;
  status: string;
}

export interface ProfilePayload {
  user: {
    name: string;
    email: string;
    authProvider: "LOCAL" | "GOOGLE" | "FACEBOOK";
    photoUrl: string | null;
    bio: string | null;
    preferredMedium: string;
    createdAt: string;
  };
  stats: {
    totalTests: number;
    totalGenerated: number;
    attemptedTests: number;
    avgScore: number;
    averageScore: number;
    bestScore: number;
    papersSat: number;
  };
  history: { pyq: AttemptRow[]; mock: MockRow[]; generated: AttemptRow[] };
}

/** Full replay of one saved sitting. */
export interface AttemptReview {
  attempt: AttemptRow & { responses: Record<string, string> };
  paper: {
    id: string;
    examCode: string;
    examName: string;
    year: number;
    dateLabel: string | null;
    shiftLabel: string | null;
    sessionLabel: string | null;
    durationMinutes: number | null;
    totalQuestions: number;
    totalMarks: number;
    sectionBAttemptLimit: number | null;
    subjectCounts: Record<string, number>;
  };
  questions: any[];
  result: import("./pyqPapers").PyqScore;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { signal, credentials: "include" });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      message = (await res.json())?.error || message;
    } catch {
      /* non-JSON error body; the status is enough */
    }
    throw new ApiError(message, res.status);
  }
  return res.json();
}

/**
 * This candidate's PYQ and generated sittings, with their standings.
 *
 * Separate from the profile call on purpose: rank and percentile need a scan
 * across every candidate who sat the same paper, and the profile header should
 * not wait on that to render a name and an avatar.
 */
export const fetchMyAttempts = (kind?: AttemptKind, signal?: AbortSignal) =>
  getJson<{ data: AttemptRow[] }>(
    `/api/pyq/attempts${kind ? `?kind=${kind}` : ""}`,
    signal
  ).then((r) => r.data);

export const fetchAttemptReview = (attemptId: string, signal?: AbortSignal) =>
  getJson<{ data: AttemptReview }>(
    `/api/pyq/attempts/${encodeURIComponent(attemptId)}`,
    signal
  ).then((r) => r.data);

/** What the generator can be asked for, for this exam. */
export const fetchGeneratorOptions = (examCode = "JEE_MAIN", signal?: AbortSignal) =>
  getJson<{ data: any }>(
    `/api/pyq/generate/options?examCode=${encodeURIComponent(examCode)}`,
    signal
  ).then((r) => r.data);

/* ------------------------------ formatting ------------------------------- */

export const hhmmss = (total: number | null | undefined) => {
  if (total == null) return "—";
  const s = Math.max(0, total);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
};

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

export const CATEGORY_LABEL: Record<HistoryCategory, string> = {
  pyq: "PYQ Tests",
  mock: "Mock Tests",
  generated: "Generated Mock Tests",
};

/**
 * Everything a row can be matched on, lower-cased and joined.
 *
 * One string rather than a field-by-field comparison so a candidate can type
 * "24 jan shift 1" or "physics 2023" and have it hit, which is how people
 * actually search a list of papers they have sat.
 */
export const searchIndex = (row: AttemptRow | MockRow) =>
  (row.kind === "mock"
    ? [row.examType, row.difficulty, row.sourceType, row.status]
    : [
        row.examName,
        row.examCode,
        String(row.year),
        row.label,
        row.sessionLabel,
        row.dateLabel,
        row.shiftLabel,
        row.subject,
      ]
  )
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

export type SortKey = "recent" | "oldest" | "best" | "worst";

export const SORT_LABEL: Record<SortKey, string> = {
  recent: "Newest first",
  oldest: "Oldest first",
  best: "Highest score",
  worst: "Lowest score",
};

const percentOf = (row: AttemptRow | MockRow) =>
  row.kind === "mock" ? (row.scorePercent ?? -1) : row.percent;

export function sortRows<T extends AttemptRow | MockRow>(rows: T[], key: SortKey): T[] {
  const byDate = (a: T, b: T) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  const copy = [...rows];
  switch (key) {
    case "oldest":
      return copy.sort((a, b) => -byDate(a, b));
    case "best":
      // Ties broken by recency, so re-sorting never scrambles equal scores into
      // an arbitrary order that changes on every render.
      return copy.sort((a, b) => percentOf(b) - percentOf(a) || byDate(a, b));
    case "worst":
      return copy.sort((a, b) => percentOf(a) - percentOf(b) || byDate(a, b));
    default:
      return copy.sort(byDate);
  }
}
