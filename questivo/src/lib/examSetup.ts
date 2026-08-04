/**
 * The guided test setup flow — types and fetchers.
 *
 * Everything here is DERIVED FROM THE ARCHIVE, never hardcoded. There is no
 * table in this file saying "JEE Main has sessions and shifts, GATE does not":
 * the server reports whichever facets an exam's questions actually carry, and
 * the UI renders a control for each one it gets back. So GATE shows a year and
 * a paper because that is all a GATE row has, JEE Main additionally shows
 * session and shift, and an exam added next month appears with the right
 * filters without anyone editing this file.
 *
 * The counts matter as much as the options. Every value comes back with how
 * many questions it would leave, narrowed by everything already chosen, so the
 * candidate never picks a combination that turns out to be empty.
 */

const API_BASE =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_URL) ||
  "http://localhost:4000";

export interface ExamOption {
  examCode: string;
  label: string;
  slug: string | null;
  questions: number;
  papers: number;
  /** A mock can be drawn for it — needs both questions and a paper pattern. */
  canGenerate: boolean;
  /** Real papers are stored for it, so the PYQ route is open. */
  canSitPapers: boolean;
}

export interface Counted<T> {
  value: T;
  label?: string;
  count: number;
}

export interface ChapterFacet {
  chapter: string;
  count: number;
}
export interface TopicFacet {
  topic: string;
  count: number;
  chapters: ChapterFacet[];
}
export interface SubjectFacet {
  subject: string;
  count: number;
  topics: TopicFacet[];
}

export interface ExamPattern {
  subjects: string[];
  sectionA: number;
  sectionB: number;
  sectionBAttemptLimit: number | null;
  durationMinutes: number;
  marksCorrect: number;
  marksIncorrect: number;
  fullLength: number;
}

export interface ExamFilters {
  examCode: string;
  label: string;
  total: number;
  years: { year: number; count: number }[];
  sessions: { value: string; number: number | null; label: string; count: number }[];
  shifts: { value: number; label: string; count: number }[];
  papers: { paperId: string; year: number; label: string; count: number }[];
  subjects: SubjectFacet[];
  questionTypes: Counted<string>[];
  marks: Counted<number>[];
  canGenerate: boolean;
  pattern: ExamPattern | null;
}

/** What the candidate has chosen so far. Empty arrays mean "no restriction". */
export interface FilterSelection {
  years: number[];
  yearFrom: number | null;
  yearTo: number | null;
  sessions: string[];
  shifts: number[];
  papers: string[];
  subjects: string[];
  topics: string[];
  chapters: string[];
  questionTypes: string[];
  marks: number[];
  difficulty: "easy" | "medium" | "hard" | "mixed";
  totalQuestions: number;
}

export const emptySelection = (): FilterSelection => ({
  years: [],
  yearFrom: null,
  yearTo: null,
  sessions: [],
  shifts: [],
  papers: [],
  subjects: [],
  topics: [],
  chapters: [],
  questionTypes: [],
  marks: [],
  difficulty: "mixed",
  totalQuestions: 30,
});

export interface Availability {
  examCode: string;
  available: number;
  requested: number | null;
  /** The single fact the preview exists to state. */
  enough: boolean;
  shortBy: number;
  bySubject: { subject: string; count: number }[];
  byType: { questionType: string; count: number }[];
  totalMarksIfAll: number;
}

/** Turn a selection into query parameters, omitting anything not chosen. */
export function toParams(sel: Partial<FilterSelection>): URLSearchParams {
  const p = new URLSearchParams();
  const add = (k: string, v: unknown) => {
    if (Array.isArray(v)) {
      if (v.length) p.set(k, v.join(","));
    } else if (v !== null && v !== undefined && v !== "") {
      p.set(k, String(v));
    }
  };
  add("years", sel.years);
  add("yearFrom", sel.yearFrom);
  add("yearTo", sel.yearTo);
  add("sessions", sel.sessions);
  add("shifts", sel.shifts);
  add("papers", sel.papers);
  add("subjects", sel.subjects);
  add("topics", sel.topics);
  add("chapters", sel.chapters);
  add("questionTypes", sel.questionTypes);
  add("marks", sel.marks);
  if (sel.difficulty && sel.difficulty !== "mixed") add("difficulty", sel.difficulty);
  add("totalQuestions", sel.totalQuestions);
  return p;
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { signal, credentials: "include" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error || `Request failed (${res.status})`), json);
  return json.data as T;
}

export const fetchExams = (signal?: AbortSignal) => get<ExamOption[]>("/api/pyq/exams", signal);

/**
 * The filters for one exam, narrowed by whatever is already chosen.
 *
 * Re-fetched as the candidate picks, so "Phase Diagram (11)" means 11 given the
 * years and subjects already selected rather than 11 in the whole archive.
 */
export const fetchExamFilters = (examCode: string, sel?: Partial<FilterSelection>, signal?: AbortSignal) => {
  const p = toParams(sel ?? {});
  p.set("examCode", examCode);
  return get<ExamFilters>(`/api/pyq/filters?${p}`, signal);
};

export const fetchAvailability = (examCode: string, sel: Partial<FilterSelection>, signal?: AbortSignal) => {
  const p = toParams(sel);
  p.set("examCode", examCode);
  return get<Availability>(`/api/pyq/available?${p}`, signal);
};

export const QUESTION_TYPE_LABEL: Record<string, string> = {
  mcq_single: "Single correct (MCQ)",
  mcq_multiple: "Multiple correct (MSQ)",
  numerical: "Numerical",
  integer: "Integer",
};
