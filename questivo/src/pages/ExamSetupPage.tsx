"use client";

/**
 * Set up a test: exam → what kind → filters → preview → start.
 *
 * WHY THE FILTERS ARE NOT WRITTEN DOWN HERE
 *
 * There is no table in this file saying which controls each exam gets. JEE Main
 * shows Session and Shift because its rows carry them; GATE does not show
 * Session because a GATE row has none, and a control offering one value that
 * matches nothing is worse than no control. The server reports the facets it
 * actually holds and this page renders one control per facet it receives, so an
 * exam added to the archive appears here correctly without this file changing.
 *
 * WHY EVERY OPTION CARRIES A COUNT
 *
 * The counts are re-fetched as the selection narrows, so "Phase Diagram (11)"
 * means eleven questions given the years and subjects already chosen. Without
 * that the candidate assembles a filter combination, presses start, and only
 * then learns it was empty.
 *
 * WHAT THE PREVIEW IS FOR
 *
 * A mock is drawn ONLY from what the filters match — the server refuses rather
 * than topping a short pool up from elsewhere, because a paper of general
 * metallurgy is not a narrower version of a paper on phase diagrams. So the
 * preview has to state the pool size before anything is generated: "56
 * available, you asked for 100" is a decision the candidate can act on, and a
 * silently padded paper is not.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAudience } from "../componenets/AudienceProvider";
import {
  emptySelection,
  fetchAvailability,
  fetchExamFilters,
  fetchExams,
  fetchFullTests,
  toParams,
  QUESTION_TYPE_LABEL,
  type Availability,
  type ExamFilters,
  type ExamOption,
  type FilterSelection,
  type FullTestPattern,
} from "../lib/examSetup";

/**
 * Three ways to sit a paper, and they differ in WHO chooses what:
 *
 *   pyq   one stored shift, exactly as printed. The candidate chooses which.
 *   full  the official pattern for this exam — subjects, counts and type split
 *         all fixed by the board. The candidate chooses nothing but the exam,
 *         which is the point: a full mock you can tune is not a full mock.
 *   mock  a partial test. The candidate's filters ARE the specification, and
 *         the generator draws only from what they match.
 */
type Mode = "pyq" | "full" | "mock";

const STEPS = ["Exam", "Type", "Filters", "Preview", "Start"] as const;

export default function ExamSetupPage() {
  const navigate = useNavigate();
  const { visibleExams } = useAudience();

  const [exams, setExams] = useState<ExamOption[]>([]);
  const [examCode, setExamCode] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [filters, setFilters] = useState<ExamFilters | null>(null);
  const [sel, setSel] = useState<FilterSelection>(emptySelection);
  const [avail, setAvail] = useState<Availability | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fullTests, setFullTests] = useState<FullTestPattern[]>([]);

  const step = !examCode ? 0 : !mode ? 1 : 2;

  /* ------------------------------- step 1 -------------------------------- */

  useEffect(() => {
    const ac = new AbortController();
    fetchExams(ac.signal)
      .then(setExams)
      .catch((e) => e.name !== "AbortError" && setError(e.message));
    return () => ac.abort();
  }, []);

  // Loaded once alongside the exam list, not on demand: the Full Test card has
  // to state the paper's real numbers the moment the exam is picked, and a
  // spinner inside a choice card is worse than one extra request on load.
  useEffect(() => {
    const ac = new AbortController();
    fetchFullTests(ac.signal)
      .then(setFullTests)
      .catch(() => setFullTests([])); // the other two modes still work
    return () => ac.abort();
  }, []);

  /* ------------------------------- step 3 -------------------------------- */

  // Refetched whenever the selection changes so every count reflects it. The
  // request is aborted on the way out, so a slow response for an earlier
  // selection cannot land after a newer one and show stale numbers.
  //
  // Keyed on the ENCODED selection, not the object.
  //
  // `sel` gets a new identity on every keystroke in the question-count box and
  // on every difficulty change, and neither narrows anything — the facet counts
  // do not depend on how many questions you want. Depending on the object sent
  // eight aggregate queries per digit typed. The encoded string is the same for
  // any two selections that would produce the same query, so it settles.
  const facetKey = toParams({ ...sel, totalQuestions: undefined, difficulty: "mixed" }).toString();
  const availKey = toParams(sel).toString();

  useEffect(() => {
    if (!examCode) return;
    const ac = new AbortController();
    fetchExamFilters(examCode, sel, ac.signal)
      .then(setFilters)
      .catch((e) => e.name !== "AbortError" && setError(e.message));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examCode, facetKey]);

  useEffect(() => {
    if (!examCode || mode !== "mock") return;
    const ac = new AbortController();
    fetchAvailability(examCode, sel, ac.signal)
      .then(setAvail)
      .catch((e) => e.name !== "AbortError" && setError(e.message));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examCode, mode, availKey]);

  /* ------------------------------ selection ------------------------------ */

  const toggle = useCallback(<K extends keyof FilterSelection>(key: K, value: unknown) => {
    setSel((s) => {
      const list = s[key] as unknown[];
      const has = list.includes(value);
      return { ...s, [key]: has ? list.filter((v) => v !== value) : [...list, value] } as FilterSelection;
    });
  }, []);

  const reset = (code: string) => {
    setExamCode(code);
    setMode(null);
    setSel(emptySelection());
    setAvail(null);
    setFilters(null);
    setError(null);
  };

  /* -------------------------------- start -------------------------------- */

  const start = async () => {
    if (!examCode) return;
    setError(null);
    if (mode === "pyq") {
      // One stored paper, sat exactly as printed. Nothing is drawn or shuffled.
      const paperId = sel.papers[0];
      if (!paperId) return setError("Choose which paper to sit.");
      navigate(`/pyq/${encodeURIComponent(paperId)}`);
      return;
    }
    setBusy(true);
    try {
      // A full test carries the exam and nothing else. Sending the filter
      // selection along would be harmless today — the server ignores filters in
      // full mode — but it would put a specification in the URL that the paper
      // does not honour, which is the kind of thing that becomes a bug the
      // moment someone reads the query string and believes it.
      const p = mode === "full" ? new URLSearchParams({ mode: "full" }) : toParams(sel);
      p.set("examCode", examCode);
      navigate(`/pyq/practice?${p}`);
    } finally {
      setBusy(false);
    }
  };

  /* -------------------------------- render ------------------------------- */

  /**
   * The exam list, narrowed to the candidate's track.
   *
   * THE SAME HOLE PyqPapersPage HAD.
   *
   * Fixing the archive listing left this one behind: /api/pyq/exams returns
   * every exam the bank holds, so a JEE/NEET aspirant opening "Set up a test"
   * was still offered GATE Metallurgical Engineering — the exact thing the
   * track exists to stop, one screen over.
   *
   * Matched on `pyqExamCode`, not on names: the bank says "JEE_MAIN" while
   * lib/exams.ts says "NTA_JEE_MAIN_2025", and fuzzy-matching those two
   * vocabularies is how the wrong exam gets through.
   *
   * Never narrows to nothing — a track whose exams have no questions stored
   * would otherwise render a chooser with no choices and no explanation. An
   * untracked visitor sees everything, because `visibleExams` is already the
   * full list for them.
   */
  const listedExams = useMemo(() => {
    const allowed = new Set(visibleExams.map((e) => e.pyqExamCode).filter(Boolean));
    if (!allowed.size) return exams;
    const narrowed = exams.filter((e) => allowed.has(e.examCode));
    return narrowed.length ? narrowed : exams;
  }, [exams, visibleExams]);

  const exam = listedExams.find((e) => e.examCode === examCode) ?? null;
  const fullTest = fullTests.find((f) => f.examCode === examCode) ?? null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-slate-900">Set up a test</h1>
      <p className="mt-1 text-sm text-slate-600">
        Sit a real paper exactly as it was printed, or build a practice paper from the
        chapters you are revising.
      </p>

      <Stepper step={step} />

      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* ── step 1: exam ─────────────────────────────────────────────────── */}
      <Section n={1} title="Select exam" done={Boolean(examCode)}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {listedExams.map((e) => (
            <button
              key={e.examCode}
              type="button"
              disabled={!e.questions}
              onClick={() => reset(e.examCode)}
              className={`rounded-lg border p-3 text-left transition ${
                examCode === e.examCode
                  ? "border-indigo-500 bg-indigo-50"
                  : e.questions
                    ? "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    : "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60"
              }`}
            >
              <div className="font-medium text-slate-900">{e.label}</div>
              <div className="mt-0.5 text-xs text-slate-500">
                {e.questions
                  ? `${e.questions.toLocaleString()} questions${e.papers ? ` · ${e.papers} papers` : ""}`
                  : "coming soon"}
              </div>
            </button>
          ))}
          {!listedExams.length && <Skeleton rows={3} />}
        </div>
      </Section>

      {/* ── step 2: kind ─────────────────────────────────────────────────── */}
      {examCode && (
        <Section n={2} title="Select test type" done={Boolean(mode)}>
          <div className="grid gap-3 sm:grid-cols-3">
            <ModeCard
              active={mode === "pyq"}
              disabled={!exam?.canSitPapers}
              title="Previous year paper"
              detail="The exact paper as it appeared, in its original order, marking scheme and timer. Nothing is randomised."
              onClick={() => setMode("pyq")}
            />
            <ModeCard
              active={mode === "full"}
              // Disabled with its reason attached rather than hidden: an exam
              // whose archive is a few questions short today will be able to
              // build a full paper next month, and "not enough questions yet"
              // is a far better answer than the option silently not existing.
              disabled={!fullTest?.canGenerate}
              title="Full Test"
              detail={
                fullTest
                  ? `${fullTest.totalQuestions} questions · ${fullTest.totalMarks} marks · ${fullTest.durationMinutes} min. The official pattern — every subject, drawn at random from real questions.`
                  : "No full-length pattern for this exam yet."
              }
              onClick={() => setMode("full")}
            />
            <ModeCard
              active={mode === "mock"}
              disabled={!exam?.canGenerate}
              title="Partial Test"
              detail="Your own subject, chapters, years and length. Drawn only from what you choose."
              onClick={() => setMode("mock")}
            />
          </div>
        </Section>
      )}

      {/* ── step 3: the official pattern, or the filters ─────────────────── */}
      {/* A full test has nothing to configure — that is what makes it a full
          test — so this step shows the pattern it will follow instead of
          asking anything. */}
      {examCode && mode === "full" && fullTest && (
        <Section n={3} title={`${fullTest.label} · official pattern`} done>
          <FullTestSummary pattern={fullTest} />
        </Section>
      )}

      {examCode && mode !== "full" && mode && filters && (
        <Section n={3} title={`Filters for ${filters.label}`} done={false}>
          {mode === "pyq" ? (
            <PaperPicker filters={filters} sel={sel} setSel={setSel} />
          ) : (
            <MockFilters filters={filters} sel={sel} setSel={setSel} toggle={toggle} />
          )}
        </Section>
      )}

      {/* ── step 4: preview ──────────────────────────────────────────────── */}
      {examCode && mode === "mock" && (
        <Section n={4} title="Preview" done={false}>
          <Preview avail={avail} sel={sel} filters={filters} />
        </Section>
      )}

      {/* ── step 5: start ────────────────────────────────────────────────── */}
      {examCode && mode && (
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5">
          <button
            type="button"
            onClick={start}
            disabled={busy || (mode === "mock" && avail !== null && !avail.enough) || (mode === "pyq" && !sel.papers.length)}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {busy ? "Preparing…" : "Start test"}
          </button>
          {mode === "mock" && avail && !avail.enough && (
            <span className="text-sm text-amber-700">
              Only {avail.available} question{avail.available === 1 ? "" : "s"} match these filters —
              reduce the count to {avail.available} or widen the filters.
            </span>
          )}
          {mode === "pyq" && !sel.papers.length && (
            <span className="text-sm text-slate-500">Choose a paper above.</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- pieces ---------------------------------- */

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full font-semibold ${
              i <= step ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-500"
            }`}
          >
            {i + 1}
          </span>
          <span className={i <= step ? "font-medium text-slate-900" : "text-slate-400"}>{label}</span>
          {i < STEPS.length - 1 && <span className="text-slate-300">→</span>}
        </li>
      ))}
    </ol>
  );
}

function Section({
  n, title, done, children,
}: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[11px] text-slate-600">
          {n}
        </span>
        {title}
        {done && <span className="text-emerald-600">✓</span>}
      </h2>
      {children}
    </section>
  );
}

function ModeCard({
  active, disabled, title, detail, onClick,
}: { active: boolean; disabled?: boolean; title: string; detail: string; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border p-4 text-left transition ${
        active
          ? "border-indigo-500 bg-indigo-50"
          : disabled
            ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60"
            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <div className="font-medium text-slate-900">{title}</div>
      <div className="mt-1 text-xs leading-relaxed text-slate-600">
        {disabled ? "Not available for this exam yet." : detail}
      </div>
    </button>
  );
}

/** Chips that toggle one facet. Rendered only when the exam has that facet. */
function ChipRow<T extends string | number>({
  label, options, selected, onToggle,
}: {
  label: string;
  options: { value: T; label: string; count: number }[];
  selected: T[];
  onToggle: (v: T) => void;
}) {
  if (!options.length) return null;
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={String(o.value)}
              type="button"
              onClick={() => onToggle(o.value)}
              className={`rounded-full border px-3 py-1 text-sm transition ${
                on
                  ? "border-indigo-500 bg-indigo-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              }`}
            >
              {o.label}
              <span className={on ? "ml-1 text-indigo-100" : "ml-1 text-slate-400"}>{o.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Choosing a stored paper to sit.
 *
 * Year, session and shift narrow the list; the list is the actual PyqPaper
 * rows, so what is offered is exactly what can be sat.
 */
function PaperPicker({
  filters, sel, setSel,
}: { filters: ExamFilters; sel: FilterSelection; setSel: (f: (s: FilterSelection) => FilterSelection) => void }) {
  const toggle = <K extends keyof FilterSelection>(key: K, value: unknown) =>
    setSel((s) => {
      const list = s[key] as unknown[];
      return {
        ...s,
        [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
        // Choosing a different year invalidates the paper picked under the old
        // one, and a Start button pointing at a paper no longer on screen is
        // how you sit the wrong exam.
        papers: key === "papers" ? (s.papers.includes(value as string) ? [] : [value as string]) : [],
      } as FilterSelection;
    });

  return (
    <div className="space-y-4">
      <ChipRow
        label="Year"
        options={filters.years.map((y) => ({ value: y.year, label: String(y.year), count: y.count }))}
        selected={sel.years}
        onToggle={(v) => toggle("years", v)}
      />
      <ChipRow
        label="Session"
        options={filters.sessions.map((s) => ({ value: s.value, label: s.label, count: s.count }))}
        selected={sel.sessions}
        onToggle={(v) => toggle("sessions", v)}
      />
      <ChipRow
        label="Shift"
        options={filters.shifts.map((s) => ({ value: s.value, label: s.label, count: s.count }))}
        selected={sel.shifts}
        onToggle={(v) => toggle("shifts", v)}
      />

      <div>
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
          Paper ({filters.papers.length})
        </div>
        {filters.papers.length ? (
          <div className="grid max-h-72 gap-1.5 overflow-y-auto sm:grid-cols-2">
            {filters.papers.map((p) => {
              const on = sel.papers[0] === p.paperId;
              return (
                <button
                  key={p.paperId}
                  type="button"
                  onClick={() => toggle("papers", p.paperId)}
                  className={`rounded-lg border p-2.5 text-left text-sm transition ${
                    on ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="font-medium text-slate-900">
                    {p.year} · {p.label}
                  </div>
                  <div className="text-xs text-slate-500">{p.count} questions</div>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No stored paper matches those filters.</p>
        )}
      </div>
    </div>
  );
}

/** Everything that shapes a generated paper. */
function MockFilters({
  filters, sel, setSel, toggle,
}: {
  filters: ExamFilters;
  sel: FilterSelection;
  setSel: (f: (s: FilterSelection) => FilterSelection) => void;
  toggle: <K extends keyof FilterSelection>(key: K, value: unknown) => void;
}) {
  const subject = filters.subjects.find((s) => sel.subjects.includes(s.subject)) ?? null;
  const topicsShown = subject ? subject.topics : filters.subjects.flatMap((s) => s.topics);
  const chaptersShown = topicsShown
    .filter((t) => !sel.topics.length || sel.topics.includes(t.topic))
    .flatMap((t) => t.chapters);

  return (
    <div className="space-y-4">
      <ChipRow
        label="Subject"
        options={filters.subjects.map((s) => ({ value: s.subject, label: s.subject, count: s.count }))}
        selected={sel.subjects}
        onToggle={(v) => toggle("subjects", v)}
      />
      <ChipRow
        label="Topic"
        options={topicsShown.map((t) => ({ value: t.topic, label: t.topic, count: t.count }))}
        selected={sel.topics}
        onToggle={(v) => toggle("topics", v)}
      />
      {/* Only where the archive holds a third level — GATE tags a unit and a
          chapter within it; the JEE importers write the same value into both,
          so there is nothing to show and no empty control appears. */}
      <ChipRow
        label="Chapter"
        options={chaptersShown.map((c) => ({ value: c.chapter, label: c.chapter, count: c.count }))}
        selected={sel.chapters}
        onToggle={(v) => toggle("chapters", v)}
      />
      <ChipRow
        label="Year"
        options={filters.years.map((y) => ({ value: y.year, label: String(y.year), count: y.count }))}
        selected={sel.years}
        onToggle={(v) => toggle("years", v)}
      />
      <ChipRow
        label="Session"
        options={filters.sessions.map((s) => ({ value: s.value, label: s.label, count: s.count }))}
        selected={sel.sessions}
        onToggle={(v) => toggle("sessions", v)}
      />
      <ChipRow
        label="Shift"
        options={filters.shifts.map((s) => ({ value: s.value, label: s.label, count: s.count }))}
        selected={sel.shifts}
        onToggle={(v) => toggle("shifts", v)}
      />
      <ChipRow
        label="Question type"
        options={filters.questionTypes.map((t) => ({
          value: t.value,
          label: QUESTION_TYPE_LABEL[t.value] ?? t.value,
          count: t.count,
        }))}
        selected={sel.questionTypes}
        onToggle={(v) => toggle("questionTypes", v)}
      />
      <ChipRow
        label="Marks"
        options={filters.marks.map((m) => ({ value: m.value, label: `${m.value} mark${m.value === 1 ? "" : "s"}`, count: m.count }))}
        selected={sel.marks}
        onToggle={(v) => toggle("marks", v)}
      />

      <div className="flex flex-wrap items-end gap-5 border-t border-slate-100 pt-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Number of questions
          </span>
          <input
            type="number"
            min={1}
            max={200}
            value={sel.totalQuestions}
            onChange={(e) =>
              setSel((s) => ({ ...s, totalQuestions: Math.max(1, Math.min(200, Number(e.target.value) || 1)) }))
            }
            className="w-28 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Difficulty
          </span>
          <select
            value={sel.difficulty}
            onChange={(e) => setSel((s) => ({ ...s, difficulty: e.target.value as FilterSelection["difficulty"] }))}
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500"
          >
            <option value="mixed">Mixed</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
      </div>
    </div>
  );
}

function Preview({
  avail, sel, filters,
}: { avail: Availability | null; sel: FilterSelection; filters: ExamFilters | null }) {
  if (!avail) return <Skeleton rows={2} />;

  // Time and marks for the paper as ASKED FOR, not for the whole pool — the
  // pool is what is available to draw from, the paper is what gets sat.
  const drawn = Math.min(sel.totalQuestions, avail.available);
  const avgMarks = avail.available ? avail.totalMarksIfAll / avail.available : 0;
  const minutes = filters?.pattern
    ? Math.max(5, Math.round((filters.pattern.durationMinutes * drawn) / (filters.pattern.fullLength || drawn || 1)))
    : null;
  const named = [...sel.chapters, ...sel.topics];

  return (
    <div className="space-y-3">
      <div
        className={`rounded-lg border px-4 py-3 ${
          avail.enough ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
        }`}
      >
        <div className="text-lg font-semibold text-slate-900">
          {avail.available.toLocaleString()} question{avail.available === 1 ? "" : "s"} found
        </div>
        <div className="mt-0.5 text-sm text-slate-700">
          {avail.enough
            ? `Your paper will use ${drawn} of them, drawn at random from this pool and nowhere else.`
            : `You asked for ${sel.totalQuestions}. Nothing outside your selection will be substituted in.`}
        </div>
        {/* Which slot it fails on. The paper is not drawn from one pool — the
            count is split across subjects and sections, and a total that looks
            sufficient can still leave one slot short. Saying which one is the
            difference between a fixable message and a dead end. */}
        {!avail.enough && (avail.shortSlots?.length ?? 0) > 0 && (
          <ul className="mt-2 space-y-0.5 text-sm text-amber-900">
            {avail.shortSlots!.map((s) => (
              <li key={`${s.subject}-${s.section}`}>
                {s.subject}
                {s.section === "B" ? " (numerical)" : ""}: needs {s.need}, {s.have} available
              </li>
            ))}
          </ul>
        )}
        {!avail.enough && !(avail.shortSlots?.length ?? 0) && avail.shortBy > 0 && (
          <p className="mt-1 text-sm text-amber-900">
            {avail.shortBy} more than exist under these filters.
          </p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Questions" value={String(drawn)} />
        <Fact label="Marks" value={String(Math.round(avgMarks * drawn))} />
        <Fact label="Time" value={minutes ? `${minutes} min` : "—"} />
        <Fact label="Difficulty" value={sel.difficulty === "mixed" ? "Mixed" : sel.difficulty} />
      </dl>

      {avail.bySubject.length > 1 && (
        <FactList label="Subjects" items={avail.bySubject.map((s) => `${s.subject} (${s.count})`)} />
      )}
      {avail.byType.length > 0 && (
        <FactList
          label="Question types"
          items={avail.byType.map((t) => `${QUESTION_TYPE_LABEL[t.questionType] ?? t.questionType} (${t.count})`)}
        />
      )}
      {named.length > 0 && <FactList label="Chapters / topics selected" items={named} />}
    </div>
  );
}

/**
 * What a full paper will contain, before it is drawn.
 *
 * Every row shows needed against available, because the one question a
 * candidate has about a generated paper is whether it is really the exam's
 * shape. Showing the arithmetic answers it; a "Generate" button that just works
 * asks them to take it on trust.
 */
function FullTestSummary({ pattern }: { pattern: FullTestPattern }) {
  const bySubject = pattern.rows.reduce<Record<string, typeof pattern.rows>>((acc, r) => {
    (acc[r.subject] ||= []).push(r);
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Fact label="Questions" value={String(pattern.totalQuestions)} />
        <Fact label="Marks" value={String(pattern.totalMarks)} />
        <Fact label="Duration" value={`${pattern.durationMinutes} min`} />
      </div>

      <p className="mb-4 text-sm text-slate-600">{pattern.patternNote}</p>

      {/* Said plainly where the paper is practice rather than a reproduction.
          A candidate planning their revision around "the official pattern"
          deserves to know when it is not one. */}
      {pattern.approximate && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This exam changes its structure most years, so this is representative
          full-length practice rather than a reproduction of one official paper.
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Subject</th>
              <th className="px-4 py-2.5 font-semibold">Section</th>
              <th className="px-4 py-2.5 text-right font-semibold">Questions</th>
              <th className="px-4 py-2.5 text-right font-semibold">In the bank</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {Object.entries(bySubject).map(([subject, rows]) =>
              rows.map((r, i) => (
                <tr key={`${subject}-${i}`} className={r.short ? "bg-rose-50" : undefined}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{i === 0 ? subject : ""}</td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {r.label ?? (r.marks != null ? `${r.marks}-mark` : "All questions")}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-900">{r.needed}</td>
                  <td
                    className={`px-4 py-2.5 text-right ${r.short ? "font-semibold text-rose-700" : "text-slate-500"}`}
                  >
                    {r.available}
                    {r.short > 0 && ` — ${r.short} short`}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!pattern.canGenerate && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <strong>This paper cannot be built yet.</strong> The rows above in red do not
          have enough questions stored. A short paper would score out of the wrong
          total, so nothing is generated — try a Partial Test instead.
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function FactList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}: </span>
      <span className="text-slate-700">{items.join(" · ")}</span>
    </div>
  );
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
      ))}
    </div>
  );
}
