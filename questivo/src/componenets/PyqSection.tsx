import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Sparkles, Eye, BookOpen, Loader2, FileCheck, X } from "lucide-react";
import {
  fetchPyqs,
  fetchPyqCoverage,
  fetchPyqPattern,
  fetchPyqSolution,
  type Pyq,
  type PyqCoverage,
  type PyqProfile,
} from "../lib/pyq";
import PyqChapterIndex from "./PyqChapterIndex";

/**
 * Previous year questions for one exam, shown ABOVE everything else on the
 * exam page, with the AI paper button pinned to the top of the block.
 *
 * Ordering is the point. A candidate arriving on a JEE page wants the real
 * paper first; the generated paper is the follow-up, not the lead. So the
 * heading and the CTA render immediately (they are prerendered, static, and
 * carry no dependencies), and only the question list waits on the network.
 *
 * katex + react-markdown are ~250 kB and are needed only once a question is on
 * screen, so the renderer is lazy. The exam page itself is prerendered and
 * eager — importing the renderer directly here would put a quarter of a
 * megabyte back into the first paint of every landing page.
 */
const SafeMathRenderer = lazy(() => import("./SafeMathRenderer"));

const MathText: React.FC<{ text: string }> = ({ text }) => (
  // The plain text is a genuine fallback rather than a spinner: LaTeX source is
  // still readable, and it means the question never disappears mid-load.
  <Suspense fallback={<span className="whitespace-pre-wrap">{text}</span>}>
    <SafeMathRenderer text={text} />
  </Suspense>
);

const OPTION_KEYS = ["A", "B", "C", "D"] as const;

/* ------------------------------ one question ---------------------------- */

const PyqCard: React.FC<{ q: Pyq; index: number }> = ({ q, index }) => {
  const [revealed, setRevealed] = useState(false);
  const [solution, setSolution] = useState<string | null>(null);
  const [loadingSolution, setLoadingSolution] = useState(false);
  const [solutionError, setSolutionError] = useState("");

  const options = OPTION_KEYS.map((k) => ({
    key: k,
    text: (q as any)[`option${k}`] as string | null,
  })).filter((o) => o.text);

  const correct = new Set(q.correctAnswer.split(",").map((s) => s.trim()));

  const loadSolution = async () => {
    if (solution || loadingSolution) return;
    setLoadingSolution(true);
    setSolutionError("");
    try {
      const res = await fetchPyqSolution(q.id);
      setSolution(res.solution);
    } catch (err: any) {
      setSolutionError(err?.message || "Could not load the solution.");
    } finally {
      setLoadingSolution(false);
    }
  };

  return (
    <article className="card p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="chip">{q.year}</span>
        {q.session && <span className="chip">{q.session}</span>}
        <span className="chip">{q.subject}</span>
        {q.topic && <span className="chip">{q.topic}</span>}
        <span className="ml-auto tabular-nums muted">Q{index}</span>
      </div>

      <div className="mt-3 leading-relaxed">
        <MathText text={q.questionText} />
      </div>

      {q.diagramSvg && (
        <div
          className="mt-3 overflow-x-auto"
          /* Sanitized server-side by src/lib/sanitizeSvg.js before it is ever
             stored — the allow-list runs at write time, not here. */
          dangerouslySetInnerHTML={{ __html: q.diagramSvg }}
        />
      )}

      {options.length > 0 ? (
        <ol className="mt-4 space-y-2">
          {options.map((o) => {
            const isCorrect = revealed && correct.has(o.key);
            return (
              <li
                key={o.key}
                className="flex gap-3 rounded-md px-3 py-2 text-sm"
                style={
                  isCorrect
                    ? { background: "#ecfdf3", border: "1px solid #abefc6" }
                    : { border: "1px solid var(--c-border)" }
                }
              >
                <span className="font-semibold">{o.key})</span>
                <span className="min-w-0 flex-1">
                  <MathText text={o.text as string} />
                </span>
                {isCorrect && (
                  <span className="shrink-0 text-xs font-semibold" style={{ color: "#067647" }}>
                    Correct
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        // Numerical and integer questions have no options at all; showing empty
        // A-D rows for them would misrepresent the real paper.
        <p className="mt-4 text-sm muted">
          Numerical answer question — the real paper asks you to type a value.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setRevealed((v) => !v)}
          aria-expanded={revealed}
        >
          <Eye className="h-4 w-4" />
          {revealed ? "Hide answer" : "Show answer"}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setRevealed(true);
            loadSolution();
          }}
          disabled={loadingSolution}
        >
          {loadingSolution ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
          {solution ? "Solution shown" : loadingSolution ? "Working…" : "Show solution"}
        </button>
        {q.sourceUrl && (
          <a
            href={q.sourceUrl}
            target="_blank"
            rel="nofollow noopener"
            className="text-xs underline muted"
          >
            Source
          </a>
        )}
      </div>

      {revealed && options.length === 0 && (
        <p className="mt-3 text-sm">
          <strong>Answer:</strong> {q.correctAnswer}
        </p>
      )}

      {solutionError && (
        <p className="mt-3 text-sm" role="alert" style={{ color: "#b42318" }}>
          {solutionError}
        </p>
      )}

      {solution && (
        <div
          className="mt-4 rounded-md p-4 text-sm leading-relaxed"
          style={{ background: "#f8fafc", border: "1px solid var(--c-border)" }}
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide muted">Solution</p>
          <MathText text={solution} />
        </div>
      )}
    </article>
  );
};

/* ------------------------------ the section ----------------------------- */

interface Props {
  examCode: string;
  examShortName: string;
  /** Starts an AI-generated paper for this exam. Costs model credits. */
  onGenerate: () => void;
  /** Starts a mock test assembled from the stored questions. Costs nothing. */
  onPyqTest?: () => void;
  /**
   * Sit one chapter as a paper, in the exam player.
   *
   * Was `onGenerateChapter`, which wrote a fresh set with the model. Clicking a
   * chapter should test you on what was actually examined in it; the AI writer
   * is still reachable from the "Generate a paper" menu.
   */
  onPractiseChapter?: (topic: string, subject: string, available: number) => void;
  /**
   * Reports how many previous year questions this exam actually has, so the
   * page around this section can drop its own AI buttons when the free option
   * exists. -1 means "not known yet".
   */
  onCount?: (total: number) => void;
}

const PyqSection: React.FC<Props> = ({
  examCode,
  examShortName,
  onGenerate,
  onPyqTest,
  onPractiseChapter,
  onCount,
}) => {
  const [coverage, setCoverage] = useState<PyqCoverage | null>(null);
  const [profile, setProfile] = useState<PyqProfile | null>(null);
  const [year, setYear] = useState<number | "">("");
  const [session, setSession] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Pyq[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [error, setError] = useState("");
  const listTop = useRef<HTMLDivElement>(null);

  // Coverage and pattern are per-exam, not per-filter — fetched once.
  useEffect(() => {
    const ac = new AbortController();
    fetchPyqCoverage(ac.signal)
      .then((all) => {
        const mine = all.find((c) => c.examCode === examCode) || null;
        setCoverage(mine);
        // Coverage is the whole-exam total, unaffected by the year and subject
        // filters below — which is exactly what the page needs to decide
        // whether a free paper is possible at all.
        onCount?.(mine?.total ?? 0);
      })
      .catch(() => {
        setCoverage(null);
        onCount?.(0);
      });
    fetchPyqPattern(examCode, ac.signal)
      .then((r) => setProfile(r.profile))
      .catch(() => setProfile(null)); // 404 until questions exist; not an error
    return () => ac.abort();
  }, [examCode]);

  const load = useCallback(() => {
    const ac = new AbortController();
    setStatus("loading");
    fetchPyqs({ examCode, year, subject, session, topic, page }, ac.signal)
      .then((res) => {
        setItems(res.data);
        setTotal(res.total);
        setStatus(res.total === 0 ? "empty" : "ready");
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        // 404 means "no PYQs for this exam yet", which is an empty shelf rather
        // than a failure — the AI paper button above still works.
        if (err?.status === 404) {
          setStatus("empty");
          return;
        }
        setError(err?.message || "Could not load previous year questions.");
        setStatus("error");
      });
    return () => ac.abort();
  }, [examCode, year, subject, session, topic, page]);

  useEffect(() => load(), [load]);

  // Whole-exam coverage, not the filtered list — a year filter that matches
  // nothing must not make the free option disappear.
  const hasStored = (coverage?.total ?? 0) > 0;
  const years = coverage?.years ?? [];
  const subjects = profile?.subjects.map((s) => s.subject) ?? [];
  // Sittings within the selected year — January/April, Shift 1/Shift 2 — so a
  // candidate can practise one paper at a time rather than the whole archive
  // shuffled together.
  const sessions = (coverage?.sessions ?? []).filter((s) => !year || s.year === year);
  const pageSize = 20;
  const pages = Math.ceil(total / pageSize);

  const changeFilter = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const goToPage = (p: number) => {
    setPage(p);
    listTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="mt-10" id="pyq" aria-labelledby="pyq-heading">
      {/* ---- The CTA sits at the top of the block, per the brief: PYQs are
             the lead, and the AI paper is the thing you do next. ---- */}
      <div
        className="card flex flex-wrap items-center justify-between gap-4 p-5"
        style={{ borderColor: "var(--c-brand)" }}
      >
        <div className="min-w-0">
          <h2 id="pyq-heading" className="section-title">
            {examShortName} previous year questions
          </h2>
          <p className="mt-1 text-sm muted">
            {profile
              ? `Practise the real paper first. ${profile.sampled} questions from ${profile.yearsCovered.at(-1)}–${profile.yearsCovered[0]}, with worked solutions.`
              : `Practise the real paper first, then generate a fresh one in the same pattern.`}
          </p>
        </div>
        {/* THE CTA SWITCHES ON WHETHER REAL QUESTIONS EXIST.
            Where they do, the button assembles a paper from the archive: the
            candidate gets the actual exam instead of an imitation of it, and it
            costs no model credits, because the questions are already written.
            The AI generator is a fallback for an empty shelf, not the headline
            action — offering it next to 472 real questions spends credits to
            produce something worse. */}
        {hasStored ? (
          <button onClick={onPyqTest ?? onGenerate} className="btn btn-primary shrink-0">
            <FileCheck className="h-4 w-4" />
            Start {examShortName} PYQ mock test
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button onClick={onGenerate} className="btn btn-primary shrink-0">
            <Sparkles className="h-4 w-4" />
            Generate test paper by AI
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* What the generated paper is actually based on. Shown because "AI
          generated" alone tells a candidate nothing about whether the paper
          resembles their exam.

          The percentages are only shown once the archive spans every subject of
          the real paper. While it does not, they are shares of what is stored,
          not of the exam — a Mathematics-only JEE archive reads "Mathematics
          100%", which tells a candidate their paper will be all Mathematics.
          Naming the gap is both honest and more useful than a wrong number. */}
      {profile && (
        <p className="mt-3 text-sm muted">
          The AI paper is weighted by how often each topic actually appeared in these{" "}
          {profile.sampled} questions — not sampled evenly across the syllabus.{" "}
          {profile.missingSubjects?.length ? (
            <>
              Stored so far: {profile.subjects.map((s) => s.subject).join(", ")}. Previous
              year questions for {profile.missingSubjects.join(", ")} are still being added,
              so a generated paper keeps the official subject split.
            </>
          ) : profile.representative === false ? (
            // Every subject is present but not in the paper's proportions —
            // quoting the archive's percentages here would tell a candidate
            // their paper is 71% Mathematics when the real one is a third.
            <>
              The archive is still uneven across subjects (
              {profile.subjects.map((s) => `${s.subject} ${s.share}%`).join(", ")}), so a
              generated paper keeps the official subject split and uses this only to
              weight topics within each subject.
            </>
          ) : (
            profile.subjects.map((s) => `${s.subject} ${s.share}%`).join(" · ")
          )}
        </p>
      )}

      {/* Chapter index. Sits above the filters because chapter is the axis a
          candidate revises along; year and sitting narrow within it. */}
      <PyqChapterIndex
        examCode={examCode}
        selected={topic}
        onSelect={(t, s) =>
          changeFilter(() => {
            setTopic(t);
            // Selecting a chapter implies its subject, and clearing the chapter
            // should not leave the subject dropdown stuck on a stale value.
            setSubject(t ? s : "");
            listTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          })
        }
        onPractiseChapter={onPractiseChapter}
      />

      <div ref={listTop} />

      {/* ---- Filters ---- */}
      {(years.length > 0 || subjects.length > 0) && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => changeFilter(() => { setYear(""); setSession(""); })}
            className={year === "" ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
          >
            All years
          </button>
          {years.map((y) => (
            <button
              key={y.year}
              type="button"
              // Changing year clears the sitting: "April 2025" is meaningless
              // once you have switched to 2024.
              onClick={() => changeFilter(() => { setYear(y.year); setSession(""); })}
              className={year === y.year ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
            >
              {y.year}
              <span className="ml-1 text-xs opacity-70">{y.count}</span>
            </button>
          ))}
          {subjects.length > 0 && (
            <select
              value={subject}
              onChange={(e) => changeFilter(() => setSubject(e.target.value))}
              className="ml-auto rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--c-border)" }}
              aria-label="Filter by subject"
            >
              <option value="">All subjects</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* ---- Sittings within the chosen year ----
             Candidates think in papers ("2 April, Shift 1"), not in undivided
             archives, so each sitting is selectable on its own. Only shown when
             there is more than one, since a single chip is not a choice. */}
      {sessions.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide muted">Sitting</span>
          <button
            type="button"
            onClick={() => changeFilter(() => setSession(""))}
            className={session === "" ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
          >
            All
          </button>
          {sessions.map((s) => (
            <button
              key={`${s.year}-${s.session}`}
              type="button"
              onClick={() => changeFilter(() => setSession(s.session))}
              className={
                session === s.session ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"
              }
            >
              {s.session}
              <span className="ml-1 text-xs opacity-70">{s.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* ---- List ---- */}
      {status === "loading" && (
        <div className="mt-6 space-y-4" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card p-5">
              <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
              <div className="mt-4 h-4 w-full animate-pulse rounded bg-slate-200" />
              <div className="mt-2 h-4 w-4/5 animate-pulse rounded bg-slate-200" />
            </div>
          ))}
        </div>
      )}

      {status === "error" && (
        <div className="card mt-6 p-6" role="alert">
          <p className="font-semibold">Could not load previous year questions</p>
          <p className="mt-1 text-sm muted">{error}</p>
          <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={load}>
            Try again
          </button>
        </div>
      )}

      {status === "empty" && (
        <div className="card mt-6 p-6">
          <p className="font-semibold">
            {year ? `No ${examShortName} questions stored for ${year} yet.` : `${examShortName} previous year questions are being added.`}
          </p>
          <p className="mt-1 text-sm muted">
            {year
              ? "Try another year, or generate a fresh paper in the meantime."
              : "In the meantime you can generate a full paper that follows the official exam pattern — same section split, question types and marking as the real thing."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(year || session || topic || subject) && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  changeFilter(() => {
                    setYear("");
                    setSession("");
                    setSubject("");
                    setTopic("");
                  })
                }
              >
                Clear filters
              </button>
            )}
            <button type="button" className="btn btn-primary btn-sm" onClick={onGenerate}>
              <Sparkles className="h-4 w-4" />
              Generate a {examShortName} paper
            </button>
          </div>
        </div>
      )}

      {status === "ready" && (
        <>
          <p className="mt-6 text-sm muted">
            {total} question{total === 1 ? "" : "s"}
            {topic ? ` on ${topic}` : ""}
            {session ? ` from ${session}` : year ? ` from ${year}` : ""}
            {subject && !topic ? ` in ${subject}` : ""}
            {pages > 1 ? ` · page ${page} of ${pages}` : ""}
          </p>

          {/* Active filters, each individually removable.
              Selecting a chapter narrowed the list with no way back except
              finding the same chapter card and clicking it again — the only
              reset lived in the empty state, which a successful filter never
              reaches. */}
          {(topic || year || session || subject) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {[
                topic && { label: topic, clear: () => { setTopic(""); setSubject(""); } },
                !topic && subject && { label: subject, clear: () => setSubject("") },
                session
                  ? { label: session, clear: () => setSession("") }
                  : year && { label: String(year), clear: () => setYear("") },
              ]
                .filter(Boolean)
                .map((f: any) => (
                  <button
                    key={f.label}
                    type="button"
                    onClick={() => changeFilter(f.clear)}
                    className="chip inline-flex items-center gap-1.5 hover:opacity-80"
                    style={{ background: "var(--c-brand-soft)", color: "var(--c-brand)" }}
                    aria-label={`Remove filter ${f.label}`}
                  >
                    {f.label}
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                ))}
              <button
                type="button"
                onClick={() =>
                  changeFilter(() => {
                    setTopic("");
                    setSubject("");
                    setYear("");
                    setSession("");
                  })
                }
                className="text-xs underline muted"
              >
                Clear all
              </button>
            </div>
          )}
          <div className="mt-4 space-y-4">
            {items.map((q, i) => (
              <PyqCard key={q.id} q={q} index={(page - 1) * pageSize + i + 1} />
            ))}
          </div>

          {pages > 1 && (
            <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Pagination">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
              >
                Previous
              </button>
              <span className="px-2 text-sm tabular-nums muted">
                {page} / {pages}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page >= pages}
                onClick={() => goToPage(page + 1)}
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
};

export default PyqSection;
