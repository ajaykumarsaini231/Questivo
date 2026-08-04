/**
 * Whole previous-year papers — types and fetchers.
 *
 * Separate from lib/pyq.ts, which browses individual questions for revision.
 * This module is about sitting a specific paper: pick exam → year → session →
 * shift, then attempt exactly what was printed that day.
 *
 * Note what the paper response does NOT contain: `correctAnswer` and
 * `solution`. The server withholds both until the attempt is submitted, so
 * there is no key in the network tab to read mid-test. Scoring therefore has to
 * be a round trip — see `scorePyqPaper`.
 */

const API_BASE =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_URL) ||
  "http://localhost:4000";

export interface PyqPaperSummary {
  paperId: string;
  paperDate: string | null;
  dateLabel: string | null;
  shift: number | null;
  shiftLabel: string | null;
  shiftTime: string | null;
  durationMinutes: number;
  totalQuestions: number;
  totalMarks: number;
  subjectCounts: Record<string, number>;
  needsFigureCount: number;
  languages: string[];
}

export interface PyqPaperSession {
  sessionNumber: number | null;
  sessionLabel: string;
  papers: PyqPaperSummary[];
}

export interface PyqPaperYear {
  year: number;
  sessions: PyqPaperSession[];
}

export interface PyqPaperExam {
  examCode: string;
  label: string;
  years: PyqPaperYear[];
}

export interface PyqPaperMeta extends PyqPaperSummary {
  id: string;
  examCode: string;
  examName: string;
  stream: string | null;
  year: number;
  sessionLabel: string | null;
  marksCorrect: number;
  marksIncorrect: number;
  /** How many of each subject's Section B questions actually count. */
  sectionBAttemptLimit: number | null;
}

/** A question as served for an attempt — no answer, no solution. */
export interface PyqPaperQuestion {
  id: string;
  paperQuestionNumber: number;
  questionNumber: number;
  subject: string;
  section: "A" | "B";
  chapter: string | null;
  questionText: string;
  optionA: string | null;
  optionB: string | null;
  optionC: string | null;
  optionD: string | null;
  questionType: string;
  marksCorrect: number;
  marksIncorrect: number;
  status: string;
  needsFigure: boolean;
  figureHint: string | null;
  diagramSvg: string | null;
  diagramImage: string | null;
  sourceUrl: string | null;
}

export type Verdict = "correct" | "wrong" | "unattempted" | "bonus" | "not_counted";

export interface PyqScoreRow {
  id: string;
  paperQuestionNumber: number;
  subject: string;
  section: "A" | "B";
  chapter: string | null;
  yourAnswer: string | null;
  correctAnswer: string | null;
  verdict: Verdict;
  marks: number;
  solution: string | null;
  solutionQuality: string | null;
}

export interface PyqScore {
  paperId: string;
  score: number;
  totalMarks: number;
  correct: number;
  wrong: number;
  unattempted: number;
  durationMinutes: number;
  timeTakenSeconds: number | null;
  sectionBAttemptLimit: number | null;
  bySubject: { subject: string; score: number; correct: number; wrong: number; unattempted: number }[];
  breakdown: PyqScoreRow[];
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

export const fetchPyqPapers = (examCode?: string, signal?: AbortSignal) =>
  getJson<{ data: PyqPaperExam[] }>(
    `/api/pyq/papers${examCode ? `?examCode=${encodeURIComponent(examCode)}` : ""}`,
    signal
  ).then((r) => r.data);

export const fetchPyqPaper = (paperId: string, signal?: AbortSignal) =>
  getJson<{ data: { paper: PyqPaperMeta; questions: PyqPaperQuestion[] } }>(
    `/api/pyq/papers/${encodeURIComponent(paperId)}`,
    signal
  ).then((r) => r.data);

/** A fresh paper drawn from the question bank, in the real exam's shape. */
export const generatePracticePaper = (examCode = "JEE_MAIN", signal?: AbortSignal) =>
  getJson<{ data: { paper: PyqPaperMeta; questions: PyqPaperQuestion[] } }>(
    `/api/pyq/practice/generate?examCode=${encodeURIComponent(examCode)}`,
    signal
  ).then((r) => r.data);

/**
 * Score a generated paper.
 *
 * Sends the ids it was served rather than a paperId, because a generated paper
 * has no row of its own. The key is still read server-side; the client is
 * trusted only for which questions it saw.
 */
export async function scorePracticePaper(
  questions: PyqPaperQuestion[],
  responses: Record<string, string>,
  paper: PyqPaperMeta,
  timeTakenSeconds: number
): Promise<PyqScore> {
  const res = await fetch(`${API_BASE}/api/pyq/practice/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      questionIds: questions.map((q) => q.id),
      responses,
      totalMarks: paper.totalMarks,
      sectionBAttemptLimit: paper.sectionBAttemptLimit,
      durationMinutes: paper.durationMinutes,
      timeTakenSeconds,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json.data as PyqScore;
}

export async function scorePyqPaper(
  paperId: string,
  responses: Record<string, string>,
  timeTakenSeconds: number
): Promise<PyqScore> {
  const res = await fetch(`${API_BASE}/api/pyq/papers/${encodeURIComponent(paperId)}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ responses, timeTakenSeconds }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json.data as PyqScore;
}

/** The four states the NTA palette colours a question by. */
export type PaletteState =
  | "notVisited"
  | "notAnswered"
  | "answered"
  | "marked"
  | "answeredMarked";

export function paletteState(
  visited: boolean,
  answered: boolean,
  marked: boolean
): PaletteState {
  if (marked) return answered ? "answeredMarked" : "marked";
  if (answered) return "answered";
  return visited ? "notAnswered" : "notVisited";
}

/** NTA's own palette colours, so the screen is familiar under exam stress. */
export const PALETTE_STYLE: Record<PaletteState, string> = {
  notVisited: "bg-white text-slate-700 border-slate-300",
  notAnswered: "bg-[#e04b2a] text-white border-[#c23e20]",
  answered: "bg-[#26a65b] text-white border-[#1f8a4c]",
  marked: "bg-[#5b3fa8] text-white border-[#4a3290]",
  answeredMarked: "bg-[#5b3fa8] text-white border-[#4a3290] ring-2 ring-[#26a65b]",
};

export const PALETTE_LABEL: Record<PaletteState, string> = {
  notVisited: "Not Visited",
  notAnswered: "Not Answered",
  answered: "Answered",
  marked: "Marked for Review",
  answeredMarked: "Answered & Marked for Review",
};
