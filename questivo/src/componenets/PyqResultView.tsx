"use client";

/**
 * The result of a paper — the same screen whether the paper was just submitted
 * or is being reopened out of history months later.
 *
 * ONE component for both on purpose. A review screen that renders differently
 * from the result screen is a review screen nobody trusts: the candidate has to
 * work out whether the difference is in their answers or in the code. The
 * server helps by re-marking a stored sitting through the same markPaper the
 * submission used, so what arrives here is the same shape either way.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SafeMathRenderer from "./SafeMathRenderer";
// hhmmss lives with the other history formatters rather than here: a component
// file that also exports plain functions loses fast refresh, so the clock
// formatter shared by the player, the history list and this view belongs in a
// module that exports no components at all.
import { hhmmss } from "../lib/pyqHistory";
import type { PyqPaperQuestion, PyqScore } from "../lib/pyqPapers";

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-4 text-center">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
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

/** Minimal paper header this view needs; both callers already carry more. */
export interface ResultPaperHeader {
  examName: string;
  dateLabel: string | null;
  shiftLabel: string | null;
  sessionLabel?: string | null;
  year?: number;
}

/** Where this attempt stands against everyone who sat the same paper. */
export interface Standing {
  percentile?: number;
  rank?: number;
  outOf?: number;
}

export default function PyqResultView({
  paper,
  questions,
  result,
  lockedOut,
  standing,
  savedNotice,
  submittedAt,
  actions,
}: {
  paper: ResultPaperHeader;
  questions: PyqPaperQuestion[];
  result: PyqScore;
  /** Set when the paper ended itself because the candidate left the window. */
  lockedOut?: boolean;
  standing?: Standing;
  /** Whether this sitting made it into the candidate's history, and why not. */
  savedNotice?: { saved: boolean; signedIn: boolean };
  submittedAt?: string;
  actions?: React.ReactNode;
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
          {[paper.examName, paper.sessionLabel, paper.dateLabel, paper.shiftLabel]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Your result</h1>
        {submittedAt && (
          <p className="mt-1 text-sm text-slate-500">
            Submitted {new Date(submittedAt).toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        )}

        {/* Say why the paper ended, rather than leaving the candidate to guess
            whether they ran out of time or something broke. */}
        {lockedOut && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>This paper was submitted automatically.</strong> You left the exam window three
            times. Everything you had answered up to that point has been marked.
          </div>
        )}

        {/* Whether the sitting was saved is not a detail. A candidate who has
            just spent three hours on a paper and is not signed in would
            otherwise find out it was never recorded by looking for it later
            and not finding it. */}
        {savedNotice &&
          (savedNotice.saved ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <span>Saved to your test history.</span>
              <Link to="/profile" className="font-semibold underline">
                View history
              </Link>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {savedNotice.signedIn ? (
                <>
                  <strong>This attempt could not be saved.</strong> Your result below is correct,
                  but it will not appear in your history.
                </>
              ) : (
                <>
                  <strong>This attempt was not saved.</strong>{" "}
                  <Link to="/signin" className="font-semibold underline">
                    Sign in
                  </Link>{" "}
                  before your next paper and every sitting is kept in your history.
                </>
              )}
            </div>
          ))}

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <Stat label="Score" value={`${result.score} / ${result.totalMarks}`} />
          <Stat label="Correct" value={String(result.correct)} />
          <Stat label="Incorrect" value={String(result.wrong)} />
          <Stat label="Time taken" value={hhmmss(result.timeTakenSeconds)} />
        </div>

        {/* Only rendered once enough other candidates have sat the same paper
            for the comparison to mean anything — the server withholds it
            otherwise rather than sending a percentile computed from two
            people. */}
        {standing?.percentile != null && (
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm">
            <span className="text-indigo-900">
              <strong className="text-lg font-bold">{standing.percentile}</strong> percentile
            </span>
            {standing.rank != null && (
              <span className="text-indigo-800">
                Rank <strong>{standing.rank}</strong> of {standing.outOf}
              </span>
            )}
            <span className="text-indigo-700/70">
              among everyone who has sat this paper here
            </span>
          </div>
        )}

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
                    {r.subject}
                    {r.section ? ` · Section ${r.section}` : ""}
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

                {/* The stem as the paper printed it leads, exactly as it does in
                    the player. A question whose text could not be extracted
                    reads as a placeholder line, and reviewing a paper is
                    precisely when you need to recognise what you got wrong. */}
                {q?.questionImage ? (
                  <img
                    src={q.questionImage}
                    alt={`Question ${r.paperQuestionNumber} as printed`}
                    loading="lazy"
                    className="mt-2 max-w-full rounded border border-slate-200"
                  />
                ) : (
                  q && (
                    <div className="mt-2 text-sm text-slate-800">
                      <SafeMathRenderer text={q.questionText} />
                    </div>
                  )
                )}

                {q?.diagramImage && !q?.questionImage && (
                  <img
                    src={q.diagramImage}
                    alt={`Question ${r.paperQuestionNumber} as printed`}
                    loading="lazy"
                    className="mt-2 max-h-96 rounded border border-slate-200"
                  />
                )}
                {!q?.diagramImage && !q?.questionImage && q?.diagramSvg && (
                  <div
                    className="mt-2 overflow-x-auto"
                    // Sanitized server-side by lib/sanitizeSvg.js before storage.
                    dangerouslySetInnerHTML={{ __html: q.diagramSvg }}
                  />
                )}

                {/* Every option, with the candidate's pick and the key marked.
                    "Your answer: C, correct: B" alone makes a candidate scroll
                    back to the paper to find out what C and B actually were. */}
                {q && (
                  <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                    {(["A", "B", "C", "D"] as const).map((letter) => {
                      const text = (q as any)[`option${letter}`] as string | null;
                      const image = (q as any)[`option${letter}Image`] as string | null;
                      if (!text && !image) return null;

                      const isKey = (r.correctAnswer ?? "").toUpperCase().includes(letter);
                      const isYours = (r.yourAnswer ?? "").toUpperCase().includes(letter);
                      return (
                        <div
                          key={letter}
                          className={`flex items-start gap-2 rounded-lg border p-2.5 text-sm ${
                            isKey
                              ? "border-emerald-300 bg-emerald-50"
                              : isYours
                                ? "border-rose-300 bg-rose-50"
                                : "border-slate-200"
                          }`}
                        >
                          {/* The crop is cut from the paper starting at the
                              printed "(A)", so it already carries the letter.
                              Repeating it beside the image gave every choice a
                              stuttered "(A) (A) 500". */}
                          {!image && <span className="font-semibold text-slate-500">({letter})</span>}
                          <span className="flex-1 text-slate-800">
                            {image ? (
                              <img src={image} alt={`Option ${letter}`} loading="lazy" className="max-w-full" />
                            ) : (
                              <SafeMathRenderer text={text!} />
                            )}
                          </span>
                          {isKey && (
                            <span className="shrink-0 text-xs font-bold text-emerald-700">key</span>
                          )}
                          {isYours && !isKey && (
                            <span className="shrink-0 text-xs font-bold text-rose-700">yours</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <p className="mt-2 text-sm">
                  <span className="text-slate-500">Your answer: </span>
                  <strong className="text-slate-800">{r.yourAnswer ?? "—"}</strong>
                  <span className="ml-4 text-slate-500">Correct: </span>
                  <strong className="text-emerald-700">{r.correctAnswer ?? "awarded to all"}</strong>
                </p>

                {/* The booklet's own worked solution, as printed. Preferred
                    over the extracted text: a derivation is stacked fractions
                    and integral signs, which no text layer linearises — 793 of
                    them extract as loose operators. */}
                {(r.solutionImage || (r.solution && r.solutionQuality === "prose")) && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-medium text-indigo-600">
                      Solution
                    </summary>
                    <div className="mt-2 text-sm text-slate-700">
                      {r.solutionImage ? (
                        <img
                          src={r.solutionImage}
                          alt={`Worked solution for question ${r.paperQuestionNumber}`}
                          loading="lazy"
                          className="max-w-full rounded border border-slate-200"
                        />
                      ) : (
                        <SafeMathRenderer text={r.solution!} />
                      )}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          {actions ?? (
            <Link
              to="/pyq"
              className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Attempt another paper
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
