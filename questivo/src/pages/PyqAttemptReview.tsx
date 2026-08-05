"use client";

/**
 * Reopen a saved sitting — every question, the answer given, the key, and the
 * worked solution.
 *
 * The point of a history list is being able to go back into a paper you sat
 * three weeks ago and find out what you got wrong. That was not possible
 * before: PYQ attempts stored a score and nothing that could reconstruct the
 * paper, and the history row's "view result" pointed at /tests/:id/result,
 * which only resolves a TestSession and 404s for every real paper.
 *
 * Nothing is re-scored on the client. The server re-marks the stored responses
 * through the same markPaper the submission used, so a reopened result and the
 * result the candidate saw on the day cannot disagree.
 */

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import PyqResultView from "../componenets/PyqResultView";
import { fetchAttemptReview, ApiError, type AttemptReview } from "../lib/pyqHistory";

export default function PyqAttemptReview() {
  const { attemptId = "" } = useParams();
  const navigate = useNavigate();

  const [review, setReview] = useState<AttemptReview | null>(null);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetchAttemptReview(attemptId, ac.signal)
      .then(setReview)
      .catch((e) => {
        if (e.name === "AbortError") return;
        setError({ message: e.message, status: e instanceof ApiError ? e.status : undefined });
      });
    return () => ac.abort();
  }, [attemptId]);

  if (error) {
    return (
      <Centered>
        <p className="font-medium text-slate-800">
          {error.status === 401
            ? "Sign in to review your attempts."
            : "This attempt could not be opened."}
        </p>
        <p className="mt-1 text-sm text-slate-500">{error.message}</p>
        <div className="mt-4 flex justify-center gap-3">
          {error.status === 401 ? (
            <Link to="/signin" className="text-sm font-semibold text-indigo-600 underline">
              Sign in
            </Link>
          ) : (
            <Link to="/profile" className="text-sm font-semibold text-indigo-600 underline">
              Back to history
            </Link>
          )}
        </div>
      </Centered>
    );
  }

  if (!review) {
    return (
      <Centered>
        <div className="h-4 w-48 animate-pulse rounded bg-slate-200" />
      </Centered>
    );
  }

  const { attempt, paper, questions, result } = review;

  return (
    <>
      <div className="bg-slate-50 pt-6">
        <div className="mx-auto max-w-5xl px-4">
          <button
            type="button"
            onClick={() => navigate("/profile")}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            <ArrowLeft className="h-4 w-4" /> Back to history
          </button>
        </div>
      </div>

      <PyqResultView
        paper={paper}
        questions={questions}
        result={result}
        submittedAt={attempt.createdAt}
        standing={{ percentile: attempt.percentile, rank: attempt.rank, outOf: attempt.outOf }}
        actions={
          <>
            {/* Retaking is only offered for a real paper. A generated one
                cannot be re-sat: it was a one-off draw, and "retake" would
                quietly hand over a different paper under the same name. */}
            {attempt.kind === "pyq" && (
              <Link
                to={`/pyq/${encodeURIComponent(attempt.paperId)}`}
                className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Sit this paper again
              </Link>
            )}
            <Link
              to="/pyq"
              className="rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Attempt another paper
            </Link>
          </>
        }
      />
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="rounded-xl bg-white p-8 text-center shadow-sm">{children}</div>
    </div>
  );
}
