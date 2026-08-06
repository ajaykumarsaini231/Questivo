import React from "react";
import { Link } from "react-router-dom";
import { Search, ChevronRight } from "lucide-react";
import { EXAMS, examPath } from "../lib/exams";
import { useAiGenerator } from "../lib/premium";

/**
 * Real 404 page.
 *
 * The previous fallback was `<Navigate to="/" replace />`, which answered every
 * dead URL with 200 + homepage content. Google calls that a soft 404 and it
 * wastes crawl budget on URLs that will never rank. This page is marked
 * noindex in lib/seo.ts and, more usefully, sends the visitor somewhere real
 * instead of dumping them on the homepage with no explanation.
 */
const NotFoundPage: React.FC = () => {
  // The primary way out of a dead URL cannot itself be a dead end. Sending a
  // visitor who has already hit one wall straight into a paywall is the worst
  // version of this page, so the button follows what they may actually have.
  const generator = useAiGenerator();

  return (
  <div className="min-h-screen bg-slate-50">
    <main className="shell py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">
        Error 404
      </p>
      <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
        This page doesn't exist
      </h1>
      <p className="mt-5 text-lg leading-relaxed text-slate-600">
        The link may be out of date, or the address may have a typo. Here's where most
        people are heading:
      </p>

      <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
        <Link
          to={generator.path}
          className="btn btn-primary btn-lg"
        >
          {generator.label} <ChevronRight className="ml-2 h-4 w-4" />
        </Link>
        <Link
          to="/resume_ats_score"
          className="btn btn-secondary btn-lg"
        >
          Check my resume
        </Link>
      </div>

      <section className="mt-14 text-left">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
          <Search className="h-4 w-4" /> Free mock tests by exam
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {EXAMS.map((e) => (
            <Link
              key={e.slug}
              to={examPath(e)}
              className="card card-hover group flex items-center justify-between p-4"
            >
              <span>
                <span className="block font-semibold text-slate-900 group-hover:text-indigo-600">
                  {e.name}
                </span>
                <span className="text-sm text-slate-500">{e.category}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 muted group-hover:text-indigo-500" />
            </Link>
          ))}
        </div>
      </section>

      <p className="mt-12">
        <Link to="/" className="text-sm font-medium text-indigo-600 hover:underline">
          ← Back to home
        </Link>
      </p>
    </main>
  </div>
  );
};

export default NotFoundPage;
