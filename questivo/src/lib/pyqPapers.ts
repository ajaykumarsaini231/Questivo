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

import { API_BASE } from "./apiBase";

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
  /**
   * Shifts held for this exam. The server orders the list by it, deepest first,
   * so `exams[0]` is the exam worth defaulting to rather than whichever code
   * happens to sort first.
   */
  paperCount?: number;
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
  /**
   * The question as it was printed, cut out of the source page in parts.
   *
   * Separate images rather than one picture of the whole question, so the
   * options can sit beside their radio buttons and a numerical question shows
   * none. Where the text layer could not be recovered these ARE the question.
   */
  questionImage: string | null;
  optionAImage: string | null;
  optionBImage: string | null;
  optionCImage: string | null;
  optionDImage: string | null;
  /** How much of each of those to draw. See `cropOf`. */
  imageCrops: ImageCrops | null;
  /**
   * How this question is drawn, when the default gets it wrong.
   *
   * null is the standing rule — a part with a crop is drawn as its crop. The
   * two overrides exist because that rule cannot see a figure cut off the wrong
   * part of the page, or a transcription cleaner than the scan it came from.
   * Set per question in the admin question bank. See `renderMode` below.
   */
  renderAs: "image" | "text" | null;
  sourceUrl: string | null;
}

/**
 * Which of a question's two forms to draw, resolved once for the whole question.
 *
 * The rule the archive was imported under is "the crop wins": what the board
 * printed is authoritative and the extracted text is a transcription of it. The
 * override says otherwise, and "text" only means anything when there IS text —
 * pinning a figure-only question to text would draw an empty question, so the
 * fallback is always the form that actually exists.
 */
export function renderMode(q: {
  renderAs?: "image" | "text" | null;
  questionText?: string | null;
  questionImage?: string | null;
}): "image" | "text" {
  if (q.renderAs === "text" && q.questionText?.trim()) return "text";
  if (q.renderAs === "image" && q.questionImage) return "image";
  return q.questionImage ? "image" : "text";
}

/* --------------------------- crop windows --------------------------- */

/** The image columns a crop window can narrow. */
export type PyqImageField =
  | "questionImage"
  | "optionAImage"
  | "optionBImage"
  | "optionCImage"
  | "optionDImage"
  | "solutionImage";

/** Insets in percent of the stored file, in the order CSS writes them. */
export type CropWindow = { top: number; right: number; bottom: number; left: number };

export type ImageCrops = Partial<Record<PyqImageField, CropWindow>>;

/** An untouched image, and what a cleared crop resets to. */
export const NO_CROP: CropWindow = { top: 0, right: 0, bottom: 0, left: 0 };

export const IMAGE_FIELDS: PyqImageField[] = [
  "questionImage",
  "optionAImage",
  "optionBImage",
  "optionCImage",
  "optionDImage",
  "solutionImage",
];

/**
 * How much of one part's crop to draw.
 *
 * Shared for the same reason `renderMode` is: the admin's whole claim is that
 * it shows what the candidate will get, and a second copy of this rule would
 * eventually disagree with the player's.
 *
 * Defensive about its input because the column is free-form JSON written by an
 * editor. A window that does not parse means "draw the file whole", which is
 * the behaviour every row had before the column existed — the wrong crop is
 * recoverable, a question that renders as an empty box is not.
 */
export function cropOf(
  q: { imageCrops?: ImageCrops | null } | null | undefined,
  field: PyqImageField
): CropWindow | null {
  const raw = q?.imageCrops?.[field];
  if (!raw || typeof raw !== "object") return null;

  const sides = (["top", "right", "bottom", "left"] as const).map((side) => {
    const n = (raw as Record<string, unknown>)[side];
    return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100 ? n : 0;
  });
  const [top, right, bottom, left] = sides;

  // The same floor the server enforces, applied again here rather than assumed:
  // this also runs against a draft the editor is still dragging, which has not
  // been near the server yet.
  if (left + right > 98 || top + bottom > 98) return null;
  if (!top && !right && !bottom && !left) return null;
  return { top, right, bottom, left };
}

/** Is there any cropping on this row at all? Drives the admin's badges. */
export function hasCrops(q: { imageCrops?: ImageCrops | null } | null | undefined) {
  return IMAGE_FIELDS.some((f) => cropOf(q, f) !== null);
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
  /** The worked solution as the booklet printed it. Released with the answer. */
  solutionImage: string | null;
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
  /**
   * Whether this sitting reached the candidate's history, and why not.
   *
   * The score screen has to be able to say so. A paper that is scored, shown
   * and then quietly not stored is indistinguishable, from the candidate's
   * side, from one that was stored — until they go looking for it later and
   * find nothing. `attemptId` is the row it became, and what the review screen
   * is reached by.
   */
  attemptId?: string | null;
  saved?: boolean;
  signedIn?: boolean;
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

/**
 * A fresh paper drawn from the question bank, in the real exam's shape.
 *
 * `spec` is what the server was asked for, echoed back. It is carried through
 * to the scorer and stored on the attempt, because a drawn paper has no shift
 * or date to identify it by later — without the spec, a history row can only
 * say "a generated paper", not which one.
 */
export const generatePracticePaper = (
  examCode = "JEE_MAIN",
  signal?: AbortSignal,
  /**
   * The candidate's filter selection, already encoded (see lib/examSetup.ts).
   *
   * Passed straight through to the server, which draws ONLY from what it
   * matches. It is not a hint or a preference: a spec naming one topic yields a
   * paper of that topic or an error saying how many questions exist, never a
   * paper quietly topped up from elsewhere.
   */
  filters?: URLSearchParams | string
) => {
  const p = new URLSearchParams(filters ?? "");
  p.set("examCode", examCode);
  return getJson<{
    data: {
      paper: PyqPaperMeta;
      questions: PyqPaperQuestion[];
      spec?: Record<string, unknown>;
      warnings?: string[];
    };
  }>(`/api/pyq/practice/generate?${p}`, signal).then((r) => r.data);
};

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
  timeTakenSeconds: number,
  /** The generation request, stored on the attempt so history can say what the
   *  paper was — a drawn paper has no shift or date to identify it by. */
  spec?: Record<string, unknown>
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
      label: paper.shiftLabel,
      spec,
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

/* ---------------------------- the player's shell ---------------------------- */

/**
 * How wide the paper runner lays itself out, and how wide that leaves the
 * question.
 *
 * Here rather than in the runner because the admin's preview frame is measured
 * from it. A figure that fits the drawer at 600px and overflows the player at
 * 1012 is exactly the defect the preview exists to catch, so previewing at the
 * drawer's own width answers the wrong question.
 *
 * PyqPaperRunner applies SHELL to its outer flex row. ASIDE is the one number
 * that is still written twice — it is a responsive class there (`lg:w-[340px]`,
 * full width below that breakpoint) and an inline style would flatten it.
 */
export const PLAYER_SHELL_WIDTH = 1400;
export const PLAYER_ASIDE_WIDTH = 340;
/** …less the shell's `p-4` on both sides and the `gap-4` between the columns. */
export const PLAYER_QUESTION_WIDTH = PLAYER_SHELL_WIDTH - 32 - 16 - PLAYER_ASIDE_WIDTH;

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
