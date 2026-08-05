/**
 * Previous year questions — client-side types and fetchers.
 *
 * Plain fetch rather than axios on purpose: this module is imported by the
 * exam landing page, which is prerendered and therefore eager in the bundle.
 * Everything here has to stay small.
 */

import { API_BASE } from "./apiBase";

/** Exams that have a PYQ shelf, keyed by their landing-page slug. */
export const PYQ_SLUGS: Record<string, string> = {
  "jee-main": "JEE_MAIN",
  "jee-advanced": "JEE_ADVANCED",
  "neet-ug": "NEET",
  "gate-metallurgy": "GATE_MT",
};

export const hasPyqs = (slug?: string): boolean => Boolean(slug && slug in PYQ_SLUGS);

export interface Pyq {
  id: string;
  year: number;
  session: string | null;
  subject: string;
  topic: string | null;
  questionText: string;
  optionA: string | null;
  optionB: string | null;
  optionC: string | null;
  optionD: string | null;
  correctAnswer: string;
  questionType: string;
  diagramSvg: string | null;
  sourceUrl: string | null;
}

export interface PyqPage {
  data: Pyq[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PyqCoverage {
  examCode: string;
  label: string;
  total: number;
  years: { year: number; count: number }[];
  /** Individual sittings within a year — January/April, Shift 1/Shift 2. */
  sessions?: { year: number; session: string; count: number }[];
}

export interface PyqProfile {
  examCode: string;
  sampled: number;
  yearsCovered: number[];
  /** Subjects of the real paper with nothing stored for them yet. */
  missingSubjects?: string[];
  /** Subjects held in a proportion too far from the real paper's to quote. */
  skewedSubjects?: { subject: string; stored: number; paper: number }[];
  /**
   * True only when the archive is both complete AND proportioned like the real
   * paper. Presence alone is not enough: a JEE Main archive that is 71%
   * Mathematics has every subject but still misdescribes the exam.
   */
  representative?: boolean;
  /** True only when the stored sample spans every subject of the real paper.
   *  While false, `share` is a share of the archive, not of the exam. */
  subjectCoverageComplete?: boolean;
  subjects: { subject: string; share: number; topTopics: { topic: string; count: number }[] }[];
  questionTypes: { type: string; share: number }[];
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
    const err = new Error(message) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const fetchPyqCoverage = (signal?: AbortSignal) =>
  getJson<{ data: PyqCoverage[] }>("/api/pyq/coverage", signal).then((r) => r.data);

export function fetchPyqs(
  params: {
    examCode: string;
    year?: number | "";
    subject?: string;
    session?: string;
    topic?: string;
    page?: number;
  },
  signal?: AbortSignal
) {
  const q = new URLSearchParams({ examCode: params.examCode });
  if (params.year) q.set("year", String(params.year));
  if (params.subject) q.set("subject", params.subject);
  if (params.session) q.set("session", params.session);
  if (params.topic) q.set("topic", params.topic);
  if (params.page && params.page > 1) q.set("page", String(params.page));
  return getJson<PyqPage>(`/api/pyq?${q}`, signal);
}

/** One subject's chapters, ordered by how often each appears in real papers. */
export interface PyqSubjectChapters {
  subject: string;
  total: number;
  /** Questions in this subject not reachable by chapter yet. */
  untagged: number;
  chapters: { topic: string; count: number }[];
}

export const fetchPyqTopics = (examCode: string, signal?: AbortSignal) =>
  getJson<{ data: PyqSubjectChapters[] }>(
    `/api/pyq/topics/${encodeURIComponent(examCode)}`,
    signal
  ).then((r) => r.data);

export const fetchPyqPattern = (examCode: string, signal?: AbortSignal) =>
  getJson<{ data: { profile: PyqProfile; brief: string } }>(
    `/api/pyq/pattern/${encodeURIComponent(examCode)}`,
    signal
  ).then((r) => r.data);

/**
 * Worked solution for one question. Generated once on the server and cached on
 * the row, so the second reader of a popular question costs nothing.
 */
export const fetchPyqSolution = (id: string, signal?: AbortSignal) =>
  getJson<{ data: { solution: string; cached: boolean } }>(
    `/api/pyq/${encodeURIComponent(id)}/solution`,
    signal
  ).then((r) => r.data);

export async function submitCourseRequest(body: {
  examName: string;
  email?: string;
  note?: string;
}) {
  const res = await fetch(`${API_BASE}/api/pyq/course-request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json.data as { id: string; examName: string; votes: number };
}
