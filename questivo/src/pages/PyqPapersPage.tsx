"use client";

/**
 * Previous year paper picker — exam → year → session → shift.
 *
 * Deliberately NOT the topic-and-difficulty form the AI generator uses. A PYQ
 * is not a practice quiz assembled to a spec; it is one specific paper that was
 * sat on one specific morning, and the only choice a candidate makes is WHICH
 * one. So this screen asks four questions and then hands over the whole paper.
 *
 * Each step narrows the next, and a step with only one option still renders —
 * seeing "Session 1 (June)" sit alone tells the candidate what exists, where
 * auto-skipping would leave them wondering whether they missed a choice.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PREMIUM_UNLOCKED } from "../lib/premium";
import {
  fetchPyqPapers,
  type PyqPaperExam,
  type PyqPaperSummary,
} from "../lib/pyqPapers";

const CARD = "rounded-2xl border border-slate-200 bg-white shadow-sm";

/** One row of choices. Selected chip is filled, the rest are outlined. */
function ChoiceRow<T>({
  label,
  items,
  isSelected,
  onSelect,
  render,
  hint,
}: {
  label: string;
  items: T[];
  isSelected: (item: T) => boolean;
  onSelect: (item: T) => void;
  render: (item: T) => React.ReactNode;
  hint?: string;
}) {
  if (!items.length) return null;
  return (
    <div className="mb-7">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{label}</h2>
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
      </div>
      <div className="flex flex-wrap gap-2.5">
        {items.map((item, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(item)}
            className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
              isSelected(item)
                ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                : "border-slate-300 bg-white text-slate-700 hover:border-indigo-400 hover:bg-indigo-50"
            }`}
          >
            {render(item)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PyqPapersPage() {
  const [exams, setExams] = useState<PyqPaperExam[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  // The selection lives in the URL so a chosen shift can be linked and shared.
  const examCode = params.get("exam") || "";
  const year = params.get("year") ? Number(params.get("year")) : null;
  const sessionLabel = params.get("session") || "";

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const ac = new AbortController();
    fetchPyqPapers(undefined, ac.signal)
      .then(setExams)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => ac.abort();
  }, []);

  const exam = useMemo(
    () => exams?.find((e) => e.examCode === examCode) ?? exams?.[0] ?? null,
    [exams, examCode]
  );
  const yearRow = useMemo(
    () => exam?.years.find((y) => y.year === year) ?? exam?.years[0] ?? null,
    [exam, year]
  );
  const session = useMemo(
    () => yearRow?.sessions.find((s) => s.sessionLabel === sessionLabel) ?? yearRow?.sessions[0] ?? null,
    [yearRow, sessionLabel]
  );

  if (error) {
    return (
      <Shell>
        <div className={`${CARD} p-8 text-center`}>
          <p className="text-slate-700">Could not load the paper archive.</p>
          <p className="mt-1 text-sm text-slate-500">{error}</p>
        </div>
      </Shell>
    );
  }

  if (!exams) {
    return (
      <Shell>
        <div className={`${CARD} animate-pulse p-8`}>
          <div className="h-4 w-40 rounded bg-slate-200" />
          <div className="mt-6 flex gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 w-24 rounded-xl bg-slate-100" />
            ))}
          </div>
        </div>
      </Shell>
    );
  }

  if (!exams.length || !exam) {
    return (
      <Shell>
        <div className={`${CARD} p-8 text-center`}>
          <p className="font-medium text-slate-800">No papers published yet.</p>
          <p className="mt-2 text-sm text-slate-500">
            Papers appear here once they have been released. Meanwhile you can{" "}
            <Link to="/GenerateTestPage" className="text-indigo-600 underline">
              generate a practice paper
            </Link>
            .
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className={`${CARD} p-6 sm:p-8`}>
        <ChoiceRow
          label="Exam"
          items={exams}
          isSelected={(e) => e.examCode === exam.examCode}
          onSelect={(e) => set({ exam: e.examCode, year: null, session: null })}
          render={(e) => e.label}
        />

        <ChoiceRow
          label="Year"
          items={exam.years}
          isSelected={(y) => y.year === yearRow?.year}
          onSelect={(y) => set({ exam: exam.examCode, year: String(y.year), session: null })}
          render={(y) => y.year}
        />

        {/* Only where there is a choice to make. JEE Main sat two sessions a
            year and the row is the point of the page; GATE sits one paper a
            year and its rows came back with a single unnamed "Session" chip —
            a control offering exactly one option, which reads as though the
            other options failed to load. */}
        {(yearRow?.sessions?.length ?? 0) > 1 && (
          <ChoiceRow
            label="Session"
            items={yearRow?.sessions ?? []}
            isSelected={(s) => s.sessionLabel === session?.sessionLabel}
            onSelect={(s) =>
              set({ exam: exam.examCode, year: String(yearRow!.year), session: s.sessionLabel })
            }
            render={(s) => s.sessionLabel}
          />
        )}

        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {(session?.papers ?? []).some((p) => p.shift !== null) ? "Date & Shift" : "Paper"}
          </h2>
          <span className="text-xs text-slate-400">
            {session?.papers.length ?? 0} paper{(session?.papers.length ?? 0) === 1 ? "" : "s"}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(session?.papers ?? []).map((p) => (
            <PaperCard key={p.paperId} paper={p} onStart={() => navigate(`/pyq/${p.paperId}`)} />
          ))}
        </div>
      </div>
    </Shell>
  );
}

function PaperCard({ paper, onStart }: { paper: PyqPaperSummary; onStart: () => void }) {
  const subjects = Object.entries(paper.subjectCounts || {});
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 p-4 transition hover:border-indigo-400 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">{paper.dateLabel}</p>
          {/* An exam with no shifts leaves shiftLabel null, and the line
              rendered empty — a card with a title and a blank row under it.
              Falls back to what the paper IS. */}
          <p className="text-sm text-slate-500">
            {[paper.shiftLabel, paper.shiftTime].filter(Boolean).join(" · ") || "Full paper"}
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
          {paper.durationMinutes} min
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {subjects.map(([s, n]) => (
          <span key={s} className="rounded bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
            {s} {n}
          </span>
        ))}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        {paper.totalQuestions} questions · {paper.totalMarks} marks
      </p>

      {/* Stated up front, not discovered mid-paper. */}
      {paper.needsFigureCount > 0 && (
        <p className="mt-1 text-xs text-amber-700">
          {paper.needsFigureCount} question{paper.needsFigureCount === 1 ? "" : "s"} shown as the
          original scan
        </p>
      )}

      <button
        type="button"
        onClick={onStart}
        className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
      >
        Start this paper
      </button>
    </div>
  );
}

/**
 * Build a paper instead of choosing one.
 *
 * Two sources, and the difference between them is worth stating on the buttons
 * rather than in a tooltip: one draws real questions that were actually
 * examined and is instant, the other writes new ones with a model and is slow
 * and metered. A candidate picking between them is really picking between
 * "authentic" and "unlimited".
 */
function GeneratePaperButton() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  /**
   * Opens the setup screen, where the candidate chooses exam, subjects,
   * chapters and length before anything is drawn.
   *
   * This used to open the upgrade dialog on the spot, which orphaned
   * /pyq/setup — nothing else in the app linked to it, so the filter screen
   * was unreachable and the generator looked as though it had been taken away.
   * Choosing filters costs nothing and generates nothing, so it is not the
   * thing to gate. The gate belongs on the button that actually builds the
   * paper: ExamSetupPage submits to /pyq/practice, and PyqPaperRunner still
   * refuses that in the free build.
   */
  const startGenerated = () => {
    setOpen(false);
    navigate("/pyq/setup");
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
      >
        Generate a paper
        <span className={`transition ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <button
              onClick={startGenerated}
              className="block w-full border-b border-slate-100 p-4 text-left transition hover:bg-indigo-50"
            >
              <p className="flex items-center gap-2 font-semibold text-slate-900">
                Generate Mock Test
                {!PREMIUM_UNLOCKED && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                    Premium
                  </span>
                )}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                A balanced paper in the real pattern, drawn from questions that were actually
                examined. Instant, and unlimited.
              </p>
            </button>
            <button
              onClick={() => {
                setOpen(false);
                navigate("/GenerateTestPage");
              }}
              className="block w-full p-4 text-left transition hover:bg-indigo-50"
            >
              <p className="font-semibold text-slate-900">Written by AI</p>
              <p className="mt-1 text-sm text-slate-600">
                New questions in the official pattern. Slower, and uses generation credits.
              </p>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <nav className="mb-6 text-sm text-slate-500">
          <Link to="/" className="hover:text-indigo-600">
            Home
          </Link>
          <span className="mx-2">/</span>
          <span className="text-slate-700">Previous year papers</span>
        </nav>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Previous year papers
            </h1>
            <p className="mt-2 max-w-2xl text-slate-600">
              Pick a paper and sit it exactly as it was set — every question in its original order,
              under the real marking scheme and the real clock. Nothing is generated or shuffled.
            </p>
          </div>
          <GeneratePaperButton />
        </div>

        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
