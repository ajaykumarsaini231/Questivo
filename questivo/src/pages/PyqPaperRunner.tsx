"use client";

/**
 * Sit one previous year paper, in the NTA candidate interface.
 *
 * The layout is copied from the real portal on purpose — question on the left,
 * palette on the right, the same five states, the same four buttons, the same
 * countdown. A candidate should not have to learn our UI during a mock; muscle
 * memory built here has to transfer to the exam hall.
 *
 * Three rules this screen exists to keep:
 *
 *   1. The paper is fixed. Questions arrive ordered by paperQuestionNumber and
 *      are never re-sorted, sampled or replaced.
 *   2. No answer key is present. The server withholds it until submission, so
 *      there is nothing here to leak — scoring is a round trip.
 *   3. "Marked for review" is a note to self, not an answer. NTA scores a
 *      marked question exactly as its answer state dictates, and so do we: the
 *      flag rides alongside the response, never instead of it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import SafeMathRenderer from "../componenets/SafeMathRenderer";
import { useExamLock } from "../lib/useExamLock";
import {
  fetchPyqPaper,
  generatePracticePaper,
  scorePyqPaper,
  scorePracticePaper,
  paletteState,
  PALETTE_STYLE,
  PALETTE_LABEL,
  type PaletteState,
  type PyqPaperMeta,
  type PyqPaperQuestion,
  type PyqScore,
} from "../lib/pyqPapers";

type Responses = Record<string, string>;
type Flags = Record<string, boolean>;

const SUBJECT_ORDER = ["Physics", "Chemistry", "Mathematics", "Biology"];

/**
 * True when the stem is only the converter's citation line AND the figure it
 * refers to is present — i.e. the text carries nothing the image does not.
 *
 * Without the image the same line is worth showing: it is the only thing
 * identifying the question.
 */
const isPlaceholderStem = (q?: PyqPaperQuestion | null) =>
  Boolean(q?.diagramImage && /^\[Shown as an image\]/.test(q.questionText || ""));

const hhmmss = (total: number) => {
  const s = Math.max(0, total);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
};

export default function PyqPaperRunner() {
  const { paperId = "" } = useParams();
  const navigate = useNavigate();

  const [paper, setPaper] = useState<PyqPaperMeta | null>(null);
  const [questions, setQuestions] = useState<PyqPaperQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<Responses>({});
  const [visited, setVisited] = useState<Flags>({});
  const [marked, setMarked] = useState<Flags>({});
  /** The radio/box value being edited, committed to `responses` on save. */
  const [draft, setDraft] = useState("");

  const [remaining, setRemaining] = useState(0);
  const [result, setResult] = useState<PyqScore | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  /* ------------------------------- loading ------------------------------- */

  // "practice" is not a stored paper — it is drawn fresh from the question bank
  // on load. Everything downstream treats the two identically.
  const isPractice = paperId === "practice";

  useEffect(() => {
    const ac = new AbortController();
    const load = isPractice
      ? generatePracticePaper("JEE_MAIN", ac.signal)
      : fetchPyqPaper(paperId, ac.signal);

    load
      .then(({ paper: p, questions: qs }) => {
        setPaper(p);
        setQuestions(qs);
        setRemaining(p.durationMinutes * 60);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => ac.abort();
  }, [paperId, isPractice]);

  const current = questions[index];

  /* -------------------------------- clock -------------------------------- */

  // Submit is called from the ticker, so it is held in a ref: putting it in the
  // interval's dependency list would tear down and restart the clock on every
  // keystroke, and the countdown would drift.
  const submitRef = useRef<() => void>(() => {});
  /** Guards against two submits racing — see `submit` below. */
  const submitLatch = useRef(false);

  useEffect(() => {
    if (!started || result) return;
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(t);
          // Same as the real exam: time up ends the paper, nothing to confirm.
          submitRef.current();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [started, result]);

  /* ----------------------------- navigation ------------------------------ */

  const goTo = useCallback(
    (i: number) => {
      if (i < 0 || i >= questions.length) return;
      setIndex(i);
      const q = questions[i];
      setVisited((v) => ({ ...v, [q.id]: true }));
      setDraft(responses[q.id] ?? "");
    },
    [questions, responses]
  );

  useEffect(() => {
    if (started && current) {
      setVisited((v) => (v[current.id] ? v : { ...v, [current.id]: true }));
    }
  }, [started, current]);

  const commit = useCallback(
    (opts: { keep?: boolean; mark?: boolean } = {}) => {
      if (!current) return;
      const value = draft.trim();
      setResponses((r) => {
        const next = { ...r };
        if (value) next[current.id] = value;
        else delete next[current.id];
        return next;
      });
      if (opts.mark !== undefined) setMarked((m) => ({ ...m, [current.id]: opts.mark! }));
      if (!opts.keep) goTo(index + 1);
    },
    [current, draft, goTo, index]
  );

  const clearResponse = () => {
    if (!current) return;
    setDraft("");
    setResponses((r) => {
      const next = { ...r };
      delete next[current.id];
      return next;
    });
  };

  /* ------------------------------- submit -------------------------------- */

  const submit = useCallback(async () => {
    // A ref, not the `submitting` state: the timer and the proctor can both
    // call this within the same tick, and a state update has not landed by
    // then — two scoring requests would go out for one paper.
    if (!paper || submitLatch.current) return;
    submitLatch.current = true;
    setSubmitting(true);
    setConfirmSubmit(false);

    // Whatever is on screen but unsaved still counts — the real portal does not
    // discard a selected option just because SAVE was not the last click.
    const finalResponses = { ...responses };
    if (current && draft.trim()) finalResponses[current.id] = draft.trim();

    try {
      const spent = paper.durationMinutes * 60 - remaining;
      setResult(
        isPractice
          ? await scorePracticePaper(questions, finalResponses, paper, spent)
          : await scorePyqPaper(paper.id, finalResponses, spent)
      );
      lock.release();
    } catch (e: any) {
      // Let the candidate try again rather than stranding them on an error
      // page with a finished paper and no result.
      submitLatch.current = false;
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
    // `lock` is created below and is stable across renders except for its
    // counters, which submitting does not read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper, responses, draft, current, remaining, submitting, isPractice, questions]);

  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  /* ------------------------------ proctoring ----------------------------- */

  // Leaving the paper — Escape, a tab switch, another application — is a
  // strike. The third ends the paper, exactly as an invigilator would.
  const lock = useExamLock({
    active: started && !result,
    limit: 3,
    onLimitReached: () => submitRef.current(),
  });

  /* -------------------------------- views -------------------------------- */

  if (error) {
    return (
      <Centered>
        <p className="font-medium text-slate-800">This paper could not be opened.</p>
        <p className="mt-1 text-sm text-slate-500">{error}</p>
        <Link to="/pyq" className="mt-4 inline-block text-sm text-indigo-600 underline">
          Back to papers
        </Link>
      </Centered>
    );
  }

  if (!paper || !questions.length) {
    return (
      <Centered>
        <div className="h-4 w-48 animate-pulse rounded bg-slate-200" />
      </Centered>
    );
  }

  if (result) {
    return (
      <ResultView
        paper={paper}
        questions={questions}
        result={result}
        lockedOut={lock.lockedOut}
      />
    );
  }

  if (!started) {
    return (
      <Instructions
        paper={paper}
        questions={questions}
        onStart={async () => {
          // Requested from the click itself: browsers only grant fullscreen
          // inside a user gesture, so it cannot be moved into an effect.
          await lock.enter();
          setStarted(true);
          goTo(0);
        }}
        onBack={() => navigate("/pyq")}
      />
    );
  }

  const answeredCount = Object.keys(responses).length;
  const markedCount = Object.values(marked).filter(Boolean).length;
  const notAnswered = Object.keys(visited).filter((id) => !responses[id]).length;

  return (
    <div className="min-h-screen bg-slate-100">
      <ExamHeader paper={paper} remaining={remaining} violations={lock.violations} />

      {lock.warning !== null && (
        <ProctorWarning
          strike={lock.warning}
          limit={3}
          onResume={async () => {
            await lock.enter();
            lock.dismiss();
          }}
        />
      )}

      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 p-4 lg:flex-row">
        {/* ─────────────── question pane ─────────────── */}
        <main className="flex-1 rounded-lg bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3">
            {SUBJECT_ORDER.filter((s) => questions.some((q) => q.subject === s)).map((s) => {
              const first = questions.findIndex((q) => q.subject === s);
              const active = current?.subject === s;
              return (
                <button
                  key={s}
                  onClick={() => goTo(first)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {s}
                </button>
              );
            })}
            <span className="ml-auto rounded bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              Section {current?.section} ·{" "}
              {current?.section === "A" ? "MCQ" : "Numerical"} · +{current?.marksCorrect} /{" "}
              {current?.marksIncorrect}
            </span>
          </div>

          <div className="px-5 py-5">
            <h2 className="mb-4 text-lg font-bold text-slate-900">
              Question {current?.paperQuestionNumber}:
            </h2>

            {current?.needsFigure && <FigureNotice q={current} />}

            {/* The stem of a figure-only question is a citation the converter
                wrote so the row is identifiable in a list — "[Shown as an
                image] JEE Main 2023 · 24 Jan Shift 1 · Physics Q1". Once the
                cut-out is actually attached, printing that line above the image
                tells the candidate nothing and looks like the question failed
                to load. The image IS the question; show it alone. */}
            {!isPlaceholderStem(current) && (
              <div className="prose prose-slate max-w-none text-[15px] leading-relaxed text-slate-800">
                <SafeMathRenderer text={current?.questionText ?? ""} />
              </div>
            )}

            {current?.diagramImage && (
              <img
                src={current.diagramImage}
                alt=""
                className="mt-4 max-h-96 rounded border border-slate-200"
              />
            )}
            {!current?.diagramImage && current?.diagramSvg && (
              <div
                className="mt-4 overflow-x-auto"
                // Sanitized server-side by lib/sanitizeSvg.js before storage.
                dangerouslySetInnerHTML={{ __html: current.diagramSvg }}
              />
            )}

            {current?.section === "A" ? (
              <div className="mt-6 space-y-2.5">
                {(["A", "B", "C", "D"] as const).map((letter) => {
                  const text = (current as any)[`option${letter}`] as string | null;
                  const selected = draft === letter;
                  return (
                    <label
                      key={letter}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                        selected
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${current.id}`}
                        checked={selected}
                        onChange={() => setDraft(letter)}
                        className="mt-1 h-4 w-4 accent-indigo-600"
                      />
                      <span className="font-semibold text-slate-500">({letter})</span>
                      <span className="flex-1 text-[15px] text-slate-800">
                        {text ? <SafeMathRenderer text={text} /> : <em className="text-slate-400">see figure</em>}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="mt-6">
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Your answer (numerical)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.replace(/[^0-9.\-]/g, ""))}
                  placeholder="e.g. 12 or 2.50"
                  className="w-56 rounded-lg border border-slate-300 px-4 py-2.5 text-lg tracking-wide outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-slate-200 px-5 py-4">
            <button
              onClick={() => commit({ mark: false })}
              className="rounded bg-[#26a65b] px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white hover:brightness-95"
            >
              Save &amp; Next
            </button>
            <button
              onClick={clearResponse}
              className="rounded border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-slate-700 hover:bg-slate-50"
            >
              Clear
            </button>
            <button
              onClick={() => commit({ mark: true })}
              className="rounded bg-[#e39b28] px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white hover:brightness-95"
            >
              Save &amp; Mark for Review
            </button>
            <button
              onClick={() => {
                setMarked((m) => ({ ...m, [current!.id]: true }));
                goTo(index + 1);
              }}
              className="rounded bg-[#2f6fb5] px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white hover:brightness-95"
            >
              Mark for Review &amp; Next
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
            <div className="flex gap-2">
              <button
                onClick={() => goTo(index - 1)}
                disabled={index === 0}
                className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
              >
                &lt;&lt; Back
              </button>
              <button
                onClick={() => goTo(index + 1)}
                disabled={index === questions.length - 1}
                className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
              >
                Next &gt;&gt;
              </button>
            </div>
            <button
              onClick={() => setConfirmSubmit(true)}
              className="rounded bg-[#26a65b] px-6 py-2 text-sm font-bold uppercase text-white hover:brightness-95"
            >
              Submit
            </button>
          </div>
        </main>

        {/* ─────────────── palette ─────────────── */}
        <aside className="w-full shrink-0 rounded-lg bg-white p-4 shadow-sm lg:w-[340px]">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 border border-dashed border-slate-300 p-3 text-xs">
            <Legend n={questions.length - Object.keys(visited).length} state="notVisited" />
            <Legend n={notAnswered} state="notAnswered" />
            <Legend n={answeredCount} state="answered" />
            <Legend n={markedCount} state="marked" />
          </div>

          <div className="mt-4 max-h-[52vh] overflow-y-auto pr-1">
            {SUBJECT_ORDER.filter((s) => questions.some((q) => q.subject === s)).map((s) => (
              <div key={s} className="mb-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{s}</p>
                <div className="grid grid-cols-8 gap-1.5">
                  {questions.map((q, i) =>
                    q.subject !== s ? null : (
                      <button
                        key={q.id}
                        onClick={() => goTo(i)}
                        title={`Q${q.paperQuestionNumber} · Section ${q.section}`}
                        className={`h-9 rounded border text-xs font-semibold transition ${
                          PALETTE_STYLE[
                            paletteState(!!visited[q.id], !!responses[q.id], !!marked[q.id])
                          ]
                        } ${i === index ? "ring-2 ring-indigo-500 ring-offset-1" : ""}`}
                      >
                        {q.paperQuestionNumber}
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {confirmSubmit && (
        <ConfirmDialog
          paper={paper}
          total={questions.length}
          answered={answeredCount}
          marked={markedCount}
          remaining={remaining}
          onCancel={() => setConfirmSubmit(false)}
          onConfirm={submit}
          busy={submitting}
        />
      )}
    </div>
  );
}

/* ------------------------------ sub-views -------------------------------- */

/**
 * Shown after a strike that did not end the paper.
 *
 * Blocking, and the only way past it re-enters fullscreen — a warning the
 * candidate can ignore is not a warning. The clock keeps running behind it, as
 * it would in the hall.
 */
function ProctorWarning({
  strike,
  limit,
  onResume,
}: {
  strike: number;
  limit: number;
  onResume: () => void;
}) {
  const left = limit - strike;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 text-center shadow-xl">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl">
          ⚠️
        </div>
        <h3 className="text-lg font-bold text-slate-900">You left the exam window</h3>
        <p className="mt-2 text-sm text-slate-600">
          This is warning <strong>{strike}</strong> of <strong>{limit}</strong>. After{" "}
          {left === 1 ? "one more" : `${left} more`}, the paper submits itself automatically and you
          will see your result.
        </p>
        <p className="mt-2 text-xs text-slate-500">The timer has not stopped.</p>
        <button
          onClick={onResume}
          className="mt-5 w-full rounded-lg bg-[#26a65b] px-6 py-2.5 text-sm font-bold uppercase tracking-wide text-white hover:brightness-95"
        >
          Return to the paper
        </button>
      </div>
    </div>
  );
}

function ExamHeader({
  paper,
  remaining,
  violations,
}: {
  paper: PyqPaperMeta;
  remaining: number;
  violations: number;
}) {
  const low = remaining < 300;
  return (
    <header className="border-b border-slate-300 bg-white">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3">
        <div className="text-sm">
          <p className="text-slate-500">
            Exam Name: <span className="font-semibold text-orange-600">{paper.examName}</span>
          </p>
          <p className="text-slate-500">
            Paper:{" "}
            <span className="font-semibold text-orange-600">
              {paper.dateLabel} — {paper.shiftLabel}
            </span>
          </p>
        </div>
        <div className="ml-auto flex items-center gap-4 text-sm">
          {violations > 0 && (
            <span className="rounded bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
              Warnings {violations}/3
            </span>
          )}
          <span className="text-slate-500">Remaining Time:</span>
          <span
            className={`rounded px-3 py-1 font-mono text-base font-bold text-white ${
              low ? "animate-pulse bg-rose-600" : "bg-sky-600"
            }`}
          >
            {hhmmss(remaining)}
          </span>
        </div>
      </div>
    </header>
  );
}

function Legend({ n, state }: { n: number; state: PaletteState }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex h-6 w-7 items-center justify-center rounded border text-[11px] font-bold ${PALETTE_STYLE[state]}`}
      >
        {n}
      </span>
      <span className="leading-tight text-slate-600">{PALETTE_LABEL[state]}</span>
    </div>
  );
}

/** Shown when the printed question is a scan rather than text. */
function FigureNotice({ q }: { q: PyqPaperQuestion }) {
  if (q.diagramImage) return null;
  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">This question was printed as an image.</p>
      <p className="mt-0.5 text-amber-800">
        The scan is not attached yet, so the text below may be incomplete. The answer key is
        correct, and the question is unchanged from the original paper.
      </p>
    </div>
  );
}

function Instructions({
  paper,
  questions,
  onStart,
  onBack,
}: {
  paper: PyqPaperMeta;
  questions: PyqPaperQuestion[];
  onStart: () => void;
  onBack: () => void;
}) {
  const subjects = Object.entries(paper.subjectCounts || {});
  const needsFigure = questions.filter((q) => q.needsFigure).length;

  return (
    <div className="min-h-screen bg-slate-100 py-8">
      <div className="mx-auto max-w-4xl rounded-lg bg-white p-8 shadow-sm">
        <h1 className="text-center text-2xl font-bold uppercase tracking-wide text-slate-800">
          General Instructions
        </h1>
        <p className="mt-2 text-center text-slate-600">
          {paper.examName} · {paper.dateLabel} · {paper.shiftLabel}
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat label="Duration" value={`${paper.durationMinutes} min`} />
          <Stat label="Questions" value={String(questions.length)} />
          <Stat label="Maximum Marks" value={String(paper.totalMarks)} />
        </div>

        <ol className="mt-7 list-decimal space-y-2.5 pl-5 text-[15px] leading-relaxed text-slate-700">
          <li>
            Total duration of this paper is <strong>{paper.durationMinutes} minutes</strong>. The
            countdown in the top right shows the time remaining; when it reaches zero the paper
            submits itself.
          </li>
          <li>
            The paper has {subjects.map(([s, n]) => `${s} (${n})`).join(", ")}. Each subject has
            Section A (multiple choice) and Section B (numerical).
          </li>
          <li>
            Marking: <strong>+{paper.marksCorrect}</strong> for a correct answer,{" "}
            <strong>{paper.marksIncorrect}</strong> for an incorrect one, 0 for unattempted.
          </li>
          {paper.sectionBAttemptLimit != null && (
            <li>
              In Section B you may attempt any{" "}
              <strong>{paper.sectionBAttemptLimit} of the {questions.filter((q) => q.section === "B" && q.subject === subjects[0]?.[0]).length}</strong>{" "}
              questions per subject. Only the first {paper.sectionBAttemptLimit} you answer, in
              paper order, are scored — exactly as on the day.
            </li>
          )}
          <li>
            The paper opens in <strong>fullscreen</strong>. Leaving it — pressing Escape, switching
            tab or switching application — is recorded as a warning. On the{" "}
            <strong>third</strong> warning the paper submits itself automatically and your result is
            shown.
          </li>
          <li>The question palette on the right shows the status of every question:</li>
        </ol>

        <div className="mt-4 grid gap-2.5 pl-5 sm:grid-cols-2">
          {(["notVisited", "notAnswered", "answered", "marked", "answeredMarked"] as PaletteState[]).map(
            (s) => (
              <div key={s} className="flex items-center gap-2.5 text-sm">
                <span className={`inline-block h-6 w-8 rounded border ${PALETTE_STYLE[s]}`} />
                <span className="text-slate-700">{PALETTE_LABEL[s]}</span>
              </div>
            )
          )}
        </div>

        <p className="mt-5 pl-5 text-[15px] text-slate-700">
          Marking a question for review is a note to yourself — it does not change how the question
          is scored. A marked question with an answer is still scored as answered.
        </p>

        {needsFigure > 0 && (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>{needsFigure}</strong> question{needsFigure === 1 ? " was" : "s were"} printed as
            images in the original paper. Where the scan is not attached yet, the text may be
            incomplete — the answer key is still the official one.
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            onClick={onBack}
            className="rounded-lg border border-slate-300 px-6 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Choose another paper
          </button>
          <button
            onClick={onStart}
            className="rounded-lg bg-[#26a65b] px-8 py-2.5 text-sm font-bold uppercase tracking-wide text-white hover:brightness-95"
          >
            I am ready to begin
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-4 text-center">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function ConfirmDialog({
  paper,
  total,
  answered,
  marked,
  remaining,
  onCancel,
  onConfirm,
  busy,
}: {
  paper: PyqPaperMeta;
  total: number;
  answered: number;
  marked: number;
  remaining: number;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-slate-900">Submit {paper.examName} paper?</h3>
        <dl className="mt-4 space-y-1.5 text-sm">
          <Row k="Answered" v={`${answered} of ${total}`} />
          <Row k="Not answered" v={String(total - answered)} />
          <Row k="Marked for review" v={String(marked)} />
          <Row k="Time remaining" v={hhmmss(remaining)} />
        </dl>
        <p className="mt-4 text-sm text-slate-600">
          You cannot return to the paper after submitting.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Keep working
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="rounded-lg bg-[#26a65b] px-5 py-2 text-sm font-bold text-white hover:brightness-95 disabled:opacity-60"
          >
            {busy ? "Submitting…" : "Yes, submit"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{k}</dt>
      <dd className="font-semibold text-slate-900">{v}</dd>
    </div>
  );
}

const VERDICT_STYLE: Record<string, string> = {
  correct: "bg-emerald-100 text-emerald-800",
  wrong: "bg-rose-100 text-rose-800",
  unattempted: "bg-slate-100 text-slate-600",
  bonus: "bg-sky-100 text-sky-800",
  not_counted: "bg-amber-100 text-amber-800",
};

const VERDICT_LABEL: Record<string, string> = {
  correct: "Correct",
  wrong: "Incorrect",
  unattempted: "Not attempted",
  bonus: "Bonus — awarded to all",
  not_counted: "Beyond the Section B limit — not scored",
};

function ResultView({
  paper,
  questions,
  result,
  lockedOut,
}: {
  paper: PyqPaperMeta;
  questions: PyqPaperQuestion[];
  result: PyqScore;
  lockedOut?: boolean;
}) {
  const [filter, setFilter] = useState<"all" | "wrong" | "unattempted">("all");
  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);

  const rows = result.breakdown.filter((r) =>
    filter === "all" ? true : filter === "wrong" ? r.verdict === "wrong" : r.verdict === "unattempted"
  );

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="mx-auto max-w-5xl px-4">
        <p className="text-sm text-slate-500">
          {paper.examName} · {paper.dateLabel} · {paper.shiftLabel}
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Your result</h1>

        {/* Say why the paper ended, rather than leaving the candidate to guess
            whether they ran out of time or something broke. */}
        {lockedOut && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>This paper was submitted automatically.</strong> You left the exam window three
            times. Everything you had answered up to that point has been marked.
          </div>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <Stat label="Score" value={`${result.score} / ${result.totalMarks}`} />
          <Stat label="Correct" value={String(result.correct)} />
          <Stat label="Incorrect" value={String(result.wrong)} />
          <Stat
            label="Time taken"
            value={result.timeTakenSeconds ? hhmmss(result.timeTakenSeconds) : "—"}
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {result.bySubject.map((s) => (
            <div key={s.subject} className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="font-semibold text-slate-800">{s.subject}</p>
              <p className="mt-1 text-2xl font-bold text-indigo-600">{s.score}</p>
              <p className="mt-1 text-xs text-slate-500">
                {s.correct} correct · {s.wrong} incorrect · {s.unattempted} skipped
              </p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold text-slate-900">Question review</h2>
          {(["all", "wrong", "unattempted"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                filter === f ? "bg-indigo-600 text-white" : "bg-white text-slate-700 border border-slate-300"
              }`}
            >
              {f === "all" ? "All" : f === "wrong" ? "Incorrect" : "Not attempted"}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {rows.map((r) => {
            const q = byId.get(r.id);
            return (
              <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-700">Q{r.paperQuestionNumber}</span>
                  <span className="text-xs text-slate-500">
                    {r.subject} · Section {r.section}
                    {r.chapter ? ` · ${r.chapter}` : ""}
                  </span>
                  <span
                    className={`ml-auto rounded px-2 py-0.5 text-xs font-medium ${VERDICT_STYLE[r.verdict]}`}
                  >
                    {VERDICT_LABEL[r.verdict]}
                  </span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {r.marks > 0 ? `+${r.marks}` : r.marks}
                  </span>
                </div>

                {q && (
                  <div className="mt-2 text-sm text-slate-800">
                    <SafeMathRenderer text={q.questionText} />
                  </div>
                )}

                {/* A question whose text could not be extracted reads as a
                    placeholder line here, so the review would show the student
                    a row they cannot recognise. The figure is the question for
                    those rows, and reviewing a paper is exactly when you need
                    to see what you got wrong — so it is shown here too, the
                    same way the player shows it. */}
                {q?.diagramImage && (
                  <img
                    src={q.diagramImage}
                    alt={`Question ${r.paperQuestionNumber} as printed`}
                    loading="lazy"
                    className="mt-2 max-h-96 rounded border border-slate-200"
                  />
                )}
                {!q?.diagramImage && q?.diagramSvg && (
                  <div
                    className="mt-2 overflow-x-auto"
                    // Sanitized server-side by lib/sanitizeSvg.js before storage.
                    dangerouslySetInnerHTML={{ __html: q.diagramSvg }}
                  />
                )}

                <p className="mt-2 text-sm">
                  <span className="text-slate-500">Your answer: </span>
                  <strong className="text-slate-800">{r.yourAnswer ?? "—"}</strong>
                  <span className="ml-4 text-slate-500">Correct: </span>
                  <strong className="text-emerald-700">{r.correctAnswer ?? "awarded to all"}</strong>
                </p>

                {r.solution && r.solutionQuality === "prose" && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-medium text-indigo-600">
                      Solution
                    </summary>
                    <div className="mt-2 text-sm text-slate-700">
                      <SafeMathRenderer text={r.solution} />
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8 flex gap-3">
          <Link
            to="/pyq"
            className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Attempt another paper
          </Link>
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="rounded-xl bg-white p-8 text-center shadow-sm">{children}</div>
    </div>
  );
}
