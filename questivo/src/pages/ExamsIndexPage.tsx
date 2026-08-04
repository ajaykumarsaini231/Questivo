import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Send, Target, FileText } from "lucide-react";
import { EXAMS, examPath, type Exam } from "../lib/exams";
import { PYQ_SLUGS, fetchPyqCoverage, type PyqCoverage } from "../lib/pyq";
import CourseRequestModal from "../componenets/CourseRequestModal";
import { useAudience } from "../componenets/AudienceProvider";

/**
 * Directory of every exam the site covers.
 *
 * "Browse exams" in the hero used to link at /mock-test/jee-main — one exam,
 * picked arbitrarily — so a visitor who wanted to see the range landed on a
 * single JEE page and had to guess that five others existed. This is the page
 * that link should always have pointed at.
 *
 * It is grouped by category rather than being one flat grid: the h2 per
 * category is a real navigational aid on a directory page, and it gives
 * crawlers headings that describe what the links underneath them are.
 *
 * Prerendered, so the first render must not depend on the network. PYQ counts
 * start empty and fill in after hydration — the card is complete without them.
 */
const ExamsIndexPage: React.FC = () => {
  const [coverage, setCoverage] = useState<PyqCoverage[]>([]);
  const [requestOpen, setRequestOpen] = useState(false);
  const { audience, visibleExams, allExams, reopenChoice } = useAudience();
  // The escape hatch that makes narrowing safe. This is a directory page — its
  // whole job is to show what exists — so a visitor must always be able to see
  // past their own track without changing it.
  const [showAll, setShowAll] = useState(false);
  const listed = showAll || !audience ? allExams : visibleExams;

  useEffect(() => {
    const ac = new AbortController();
    fetchPyqCoverage(ac.signal)
      .then(setCoverage)
      .catch(() => setCoverage([])); // A directory page must not break on this.
    return () => ac.abort();
  }, []);

  /** How many real previous year questions are stored for this exam, if any. */
  const pyqTotal = (exam: Exam): number | null => {
    const code = PYQ_SLUGS[exam.slug];
    if (!code) return null;
    return coverage.find((c) => c.examCode === code)?.total ?? 0;
  };

  // Category order follows EXAMS so adding an exam cannot silently reshuffle
  // the page.
  const byCategory = useMemo(() => {
    const groups: { category: string; exams: Exam[] }[] = [];
    for (const exam of EXAMS) {
      if (!listed.includes(exam)) continue;
      const existing = groups.find((g) => g.category === exam.category);
      if (existing) existing.exams.push(exam);
      else groups.push({ category: exam.category, exams: [exam] });
    }
    return groups;
  }, [listed]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <main className="shell py-10">
        <nav aria-label="Breadcrumb" className="mb-8 text-sm text-slate-500">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link to="/" className="hover:text-indigo-600">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="font-medium text-slate-700">All exams</li>
          </ol>
        </nav>

        <header className="max-w-3xl">
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            All exams on Questivo
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-slate-600">
            Questivo covers {allExams.length} exams. Every exam page opens with real previous
            year questions where we have them, and generates a fresh paper in the official
            exam pattern where we don't — free, with a worked solution on every question.
          </p>

          {audience && (
            <div
              className="card mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 p-4 text-sm"
              style={{ borderColor: "var(--c-brand-border)", background: "var(--c-brand-soft)" }}
            >
              <span>
                Showing <strong>{audience.label}</strong> exams
                {showAll ? " alongside everything else" : ""}.
              </span>
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="font-semibold underline"
                style={{ color: "var(--c-brand)" }}
              >
                {showAll ? `Show only my ${visibleExams.length}` : `Show all ${allExams.length}`}
              </button>
              <button
                type="button"
                onClick={reopenChoice}
                className="font-semibold underline"
                style={{ color: "var(--c-brand)" }}
              >
                Change track
              </button>
            </div>
          )}
        </header>

        {byCategory.map((group) => (
          <section key={group.category} className="mt-12">
            <h2 className="section-title">{group.category}</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {group.exams.map((exam) => {
                const total = pyqTotal(exam);
                return (
                  <Link
                    key={exam.slug}
                    to={examPath(exam)}
                    className="card card-hover group flex flex-col p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
                        <span className="chip chip-free">Free</span>
                        {/* Only claimed once the count is actually back from the
                            API — a "previous year questions" badge on an empty
                            shelf is a promise the page cannot keep. */}
                        {total !== null && total > 0 && (
                          <span className="chip">
                            <FileText className="mr-1 h-3 w-3" />
                            {total} PYQs
                          </span>
                        )}
                      </div>
                      <div className="shrink-0 rounded-full bg-slate-50 p-2 muted transition-colors group-hover:bg-indigo-50 group-hover:text-indigo-600">
                        <Target className="h-5 w-5" />
                      </div>
                    </div>

                    <h3 className="mt-4 text-lg font-bold group-hover:text-indigo-600">
                      {exam.name}
                    </h3>
                    <p className="mt-2 line-clamp-3 text-sm text-slate-500">{exam.summary}</p>

                    <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-4">
                      <span className="text-xs font-medium text-slate-500">
                        {exam.subjects.length} subject
                        {exam.subjects.length === 1 ? "" : "s"}
                      </span>
                      <span className="text-sm font-semibold text-indigo-600 group-hover:underline">
                        View {exam.shortName} tests &rarr;
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}

        <section className="mt-16" id="request-a-course">
          <h2 className="section-title">Preparing for a different exam?</h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-slate-600">
            Tell us which one you need and we will add it. Requests are prioritised by how
            many people ask for the same exam.
          </p>
          <button onClick={() => setRequestOpen(true)} className="btn btn-secondary mt-6">
            <Send className="h-4 w-4" />
            Request a course
          </button>
        </section>

        <CourseRequestModal open={requestOpen} onClose={() => setRequestOpen(false)} />

        <aside className="mt-16 rounded-[10px] bg-slate-900 p-8 text-center">
          <p className="text-xl font-bold text-white">Not sure which paper to start with?</p>
          <p className="mx-auto mt-2 max-w-lg muted">
            Build a custom paper instead — pick the exam, the topics and the length, and
            Questivo serves previous year questions first.
          </p>
          <Link to="/GenerateTestPage" className="btn btn-primary btn-lg mt-6">
            Generate a test <ChevronRight className="h-4 w-4" />
          </Link>
        </aside>
      </main>
    </div>
  );
};

export default ExamsIndexPage;
