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

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import SafeMathRenderer from "../componenets/SafeMathRenderer";
import PyqResultView, { Stat } from "../componenets/PyqResultView";
import PremiumDialog from "../componenets/PremiumDialog";
import { useExamLock } from "../lib/useExamLock";
import { hhmmss } from "../lib/pyqHistory";
import { PREMIUM_UNLOCKED } from "../lib/premium";
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

/** What the paper calls each kind of question, in its own words. */
const TYPE_LABEL: Record<string, string> = {
  mcq_single: "MCQ",
  mcq_multiple: "MSQ (multiple correct)",
  numerical: "Numerical",
  integer: "Numerical",
};

export default function PyqPaperRunner() {
  const { paperId = "" } = useParams();
  const navigate = useNavigate();

  const [paper, setPaper] = useState<PyqPaperMeta | null>(null);
  const [questions, setQuestions] = useState<PyqPaperQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** What a generated paper was drawn to. Stored on the attempt at submission
   *  so the history row can say which paper it was. Null for a real shift,
   *  which is identified by its own date and shift instead. */
  const [spec, setSpec] = useState<Record<string, unknown> | undefined>();

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
  const isPractice = paperId === "practice" || paperId === "generated";

  /**
   * A generated paper is the premium feature, so the free build answers the
   * request with the upgrade dialog rather than a paper.
   *
   * Checked here as well as on the buttons that link here: gating only the
   * menu entry would leave /pyq/practice reachable by typing it, and a paywall
   * you can walk around by editing the address bar is not one. The API stays
   * open — entitlement needs a plan on the user record, which does not exist
   * yet — so this is a promotion gate in the same sense as lib/featureFlags.ts.
   */
  const premiumBlocked = isPractice && !PREMIUM_UNLOCKED;

  // The filter selection the setup flow arrived with, as it was encoded there.
  // Carried through untouched — this page does not get to reinterpret it, and
  // the server draws only from what it matches.
  const search = useLocation().search;

  useEffect(() => {
    if (premiumBlocked) return;
    const ac = new AbortController();
    const params = new URLSearchParams(search);
    const load = isPractice
      ? generatePracticePaper(params.get("examCode") || "JEE_MAIN", ac.signal, params)
      : fetchPyqPaper(paperId, ac.signal);

    load
      .then((data) => {
        const { paper: p, questions: qs } = data;
        setPaper(p);
        setQuestions(qs);
        setSpec("spec" in data ? (data.spec as Record<string, unknown>) : undefined);
        setRemaining(p.durationMinutes * 60);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => ac.abort();
  }, [paperId, isPractice, premiumBlocked, search]);

  const current = questions[index];

  /** GATE's MSQ: several correct options, stored as a sorted "A,C" string. */
  const multiSelect = current?.questionType === "mcq_multiple";
  const chosen = multiSelect ? draft.split(",").filter(Boolean) : [];
  /** Is the question itself on screen as a picture? Decides what an option
   *  with no text and no crop of its own can honestly say. */
  const hasPicture = Boolean(current?.questionImage || current?.diagramImage);

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
          ? await scorePracticePaper(questions, finalResponses, paper, spent, spec)
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
  }, [paper, responses, draft, current, remaining, submitting, isPractice, questions, spec]);

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

  if (premiumBlocked) {
    return (
      <>
        <Centered>
          <p className="font-medium text-slate-800">Generated Mock Tests are a premium feature.</p>
          <p className="mt-1 text-sm text-slate-500">
            Previous year papers are free — pick any exam, year and shift.
          </p>
          <Link to="/pyq" className="mt-4 inline-block text-sm text-indigo-600 underline">
            Back to papers
          </Link>
        </Centered>
        <PremiumDialog open onClose={() => navigate("/pyq")} />
      </>
    );
  }

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
      <PyqResultView
        paper={paper}
        questions={questions}
        result={result}
        lockedOut={lock.lockedOut}
        // The scorer reports whether the sitting reached the candidate's
        // history. Passing it through is the whole fix for "I sat the paper and
        // it never appeared": either they see it was saved, or they are told
        // why it was not, at the moment it matters.
        savedNotice={{ saved: Boolean(result.saved), signedIn: Boolean(result.signedIn) }}
        actions={
          <>
            <Link
              to="/pyq"
              className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Attempt another paper
            </Link>
            {result.attemptId && (
              <Link
                to="/profile"
                className="rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                My test history
              </Link>
            )}
          </>
        }
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
              {current?.section ? `Section ${current.section} · ` : ""}
              {TYPE_LABEL[current?.questionType ?? ""] ?? "MCQ"} · +{current?.marksCorrect} /{" "}
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
            {/* The stem as the paper printed it, when we have it. It is the
                authoritative rendering — the extracted text is a transcription
                of it — so it leads, and the text follows only when there is no
                image or the text adds something the crop does not. */}
            {current?.questionImage && (
              <img
                src={current.questionImage}
                alt={`Question ${current.paperQuestionNumber} as printed`}
                loading="lazy"
                className="mb-4 max-w-full rounded border border-slate-200"
              />
            )}

            {!current?.questionImage && !isPlaceholderStem(current) && (
              <div className="prose prose-slate max-w-none text-[15px] leading-relaxed text-slate-800">
                <SafeMathRenderer text={current?.questionText ?? ""} />
              </div>
            )}

            {/* The older whole-question figure, kept for rows that predate the
                per-part crops. Suppressed when questionImage exists, because
                the linker points both at the same file and the stem would
                render twice. */}
            {current?.diagramImage && !current?.questionImage && (
              <img
                src={current.diagramImage}
                alt=""
                className="mt-4 max-h-96 rounded border border-slate-200"
              />
            )}
            {!current?.diagramImage && !current?.questionImage && current?.diagramSvg && (
              <div
                className="mt-4 overflow-x-auto"
                // Sanitized server-side by lib/sanitizeSvg.js before storage.
                dangerouslySetInnerHTML={{ __html: current.diagramSvg }}
              />
            )}

            {/* What the candidate is given to answer with follows the question's
                TYPE, not its section. Section is a JEE Main idea — A is the
                multiple-choice block, B the numerical one — and GATE has no
                equivalent, so keying the input off it showed a number box under
                all 43 of GATE's multiple-choice questions. */}
            {current && current.questionType !== "numerical" && current.questionType !== "integer" ? (
              <div className="mt-6 space-y-2.5">
                {/* GATE's MSQ: more than one option is correct, and the board
                    awards nothing unless the exact set is chosen. */}
                {multiSelect && (
                  <p className="mb-1 text-sm font-medium text-amber-700">
                    More than one option may be correct — select all that apply.
                  </p>
                )}
                {(["A", "B", "C", "D"] as const).map((letter) => {
                  const text = (current as any)[`option${letter}`] as string | null;
                  const image = (current as any)[`option${letter}Image`] as string | null;
                  const selected = multiSelect ? chosen.includes(letter) : draft === letter;
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
                        type={multiSelect ? "checkbox" : "radio"}
                        name={`q-${current.id}`}
                        checked={selected}
                        onChange={() =>
                          setDraft(
                            multiSelect
                              ? (selected
                                  ? chosen.filter((c) => c !== letter)
                                  : [...chosen, letter]
                                )
                                  .sort()
                                  .join(",")
                              : letter
                          )
                        }
                        className={`mt-1 h-4 w-4 accent-indigo-600 ${multiSelect ? "rounded" : ""}`}
                      />
                      {/* The crop starts at the printed "(A)", so an option
                          shown as an image already carries its letter and this
                          would print it twice. */}
                      {!image && <span className="font-semibold text-slate-500">({letter})</span>}
                      <span className="flex-1 text-[15px] text-slate-800">
                        {/* The choice as printed, cropped to itself — which is
                            why the options are separate images.

                            When a paper draws its choices as figures there is
                            no text to extract and nothing to anchor a crop on.
                            Those questions keep their options inside the
                            question image above, so this says where to look
                            rather than "not readable", which told the candidate
                            the choice was lost when it was on screen already. */}
                        {image ? (
                          <img
                            src={image}
                            alt={`Option ${letter}`}
                            loading="lazy"
                            className="max-w-full"
                          />
                        ) : text ? (
                          <SafeMathRenderer text={text} />
                        ) : hasPicture ? (
                          <em className="text-slate-500">
                            choice ({letter}) is in the question image above
                          </em>
                        ) : (
                          // Nothing on screen states this choice. Saying so is
                          // the only honest option — pointing at an image that
                          // is not there would send the candidate hunting.
                          <em className="text-amber-700">
                            choice ({letter}) could not be read from the source paper
                          </em>
                        )}
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


function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="rounded-xl bg-white p-8 text-center shadow-sm">{children}</div>
    </div>
  );
}
