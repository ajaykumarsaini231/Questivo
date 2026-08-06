import { Link, useParams } from "react-router-dom";
import { ChevronRight, GraduationCap, ShieldAlert, Target } from "lucide-react";

import { examPath } from "../lib/exams";
import {
  COLLEGES,
  collegePath,
  collegesByType,
  examsFor,
  getCollege,
  type College,
} from "../lib/geo";

/**
 * "Which exam gets you into <college>."
 *
 * WHY THIS PAGE CAN EXIST HONESTLY
 *
 * The directories that own these queries — Shiksha, Collegedunia, Careers360 —
 * rank on cut-off tables, fee tables and rankings. Questivo has none of that
 * data and must not invent it: the accuracy policy in lib/exams.ts exists
 * because a wrong number aimed at someone choosing where to apply is worse than
 * publishing nothing at all.
 *
 * What is left is the question those pages bury three scrolls down and which
 * Questivo can answer better than anyone, because it is the thing the product
 * is for: which examination actually admits you, and where to practise it.
 * That fact is structural and stable — the IITs admit through JEE Advanced, the
 * NITs through JEE Main, medical colleges through NEET UG — so it does not rot
 * between cycles the way a cut-off does.
 *
 * The disclaimer block is not boilerplate. These are real named institutions
 * and a page that is vague about affiliation is a page that implies one.
 */
export default function CollegePage() {
  const { collegeSlug } = useParams();
  const college = getCollege(collegeSlug);

  if (!college) {
    return (
      <div className="min-h-screen bg-slate-50">
        <main className="shell py-16 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            We don't have a page for that institution yet
          </h1>
          <p className="mt-4 text-slate-600">
            Browse the admission routes we have written up, or go straight to the exam
            practice.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/college" className="btn btn-primary btn-lg">
              All admission routes <ChevronRight className="ml-2 h-4 w-4" />
            </Link>
            <Link to="/exams" className="btn btn-secondary btn-lg">
              All exams
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const via = examsFor([college.admitsVia])[0];
  const also = examsFor(college.alsoVia ?? []);
  const siblings = COLLEGES.filter(
    (c) => c.type === college.type && c.slug !== college.slug
  ).slice(0, 8);

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="shell py-10">
        <nav className="mb-6 text-sm text-slate-500" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-indigo-600">
            Home
          </Link>
          <span className="mx-2">/</span>
          <Link to="/college" className="hover:text-indigo-600">
            Admission routes
          </Link>
          <span className="mx-2">/</span>
          <span className="text-slate-700">{college.shortName}</span>
        </nav>

        <header>
          <span className="chip inline-flex items-center gap-1.5">
            <GraduationCap className="h-3.5 w-3.5" />
            {college.city}, {college.state}
          </span>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">
            Which exam do you need for {college.shortName}?
          </h1>

          {via && (
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-slate-600">
              Undergraduate admission to {college.name} is through{" "}
              <Link
                to={examPath(via)}
                className="font-semibold text-indigo-600 underline decoration-indigo-200 underline-offset-2"
              >
                {via.name}
              </Link>
              . {college.context}
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {via && (
              <Link to={examPath(via)} className="btn btn-primary btn-lg">
                Practise {via.shortName} free <ChevronRight className="ml-2 h-4 w-4" />
              </Link>
            )}
            <Link to="/pyq" className="btn btn-secondary btn-lg">
              Sit a previous year paper
            </Link>
          </div>
        </header>

        {via && (
          <section className="mt-16">
            <h2 className="section-title">What {via.shortName} actually tests</h2>
            <p className="mt-3 max-w-3xl leading-relaxed text-slate-600">{via.whyPractice}</p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="card p-5">
                <Target className="h-5 w-5 text-indigo-600" />
                <h3 className="mt-3 font-bold text-slate-900">Subjects</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  {via.subjects.join(", ")}
                </p>
              </div>
              <div className="card p-5">
                <GraduationCap className="h-5 w-5 text-indigo-600" />
                <h3 className="mt-3 font-bold text-slate-900">Who sits it</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{via.audience}</p>
              </div>
            </div>

            <h3 className="mt-10 text-lg font-bold text-slate-900">
              Where {via.shortName} candidates lose marks
            </h3>
            <ul className="mt-4 space-y-3">
              {via.commonMistakes.map((m) => (
                <li key={m} className="flex gap-3 text-slate-600">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                  <span className="leading-relaxed">{m}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {also.length > 0 && (
          <section className="mt-16">
            <h2 className="section-title">Other examinations relevant here</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {also.map((exam) => (
                <Link
                  key={exam.slug}
                  to={examPath(exam)}
                  className="card card-hover group flex items-start justify-between gap-4 p-5"
                >
                  <span>
                    <span className="block font-bold text-slate-900 group-hover:text-indigo-600">
                      {exam.name}
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-slate-500">
                      {exam.summary}
                    </span>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 muted group-hover:text-indigo-500" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Not a footer afterthought. The page names a real institution, so what
            it is NOT saying has to be as visible as what it is. */}
        <section className="mt-16">
          <div className="card border-amber-200 bg-amber-50/60 p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              What this page does not tell you
            </h2>
            <ul className="mt-4 space-y-2.5 text-[15px] leading-relaxed text-slate-700">
              <li>
                <strong>No cut-offs, fees, seat counts or rankings.</strong> Those change every
                admission cycle, and a wrong one aimed at someone deciding where to apply is
                worse than publishing nothing. Read them from {college.shortName}'s own
                notification.
              </li>
              <li>
                <strong>Questivo is not affiliated with {college.name}</strong>, and offers no
                admission, counselling or placement service. It is an online practice platform.
              </li>
              <li>
                <strong>Eligibility and reservation rules are set by the conducting body</strong>{" "}
                and the counselling authority, not by this site.
              </li>
            </ul>
          </div>
        </section>

        {siblings.length > 0 && (
          <section className="mt-16">
            <h2 className="section-title">Other institutions on the same route</h2>
            <div className="mt-6 flex flex-wrap gap-2">
              {siblings.map((s) => (
                <Link
                  key={s.slug}
                  to={collegePath(s)}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600"
                >
                  {s.shortName}
                </Link>
              ))}
              <Link
                to="/college"
                className="rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-600"
              >
                All routes
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

/** The hub at /college, grouped by institution family. */
export function CollegeIndexPage() {
  const groups = collegesByType();

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="shell py-10">
        <nav className="mb-6 text-sm text-slate-500" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-indigo-600">
            Home
          </Link>
          <span className="mx-2">/</span>
          <span className="text-slate-700">Admission routes</span>
        </nav>

        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          Which exam gets you in
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-slate-600">
          For {COLLEGES.length} institutions, the national examination its undergraduate
          admission actually runs through — and free practice for that exam. This is the
          question the college directories bury under a fee table.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { route: "JEE Advanced", who: "The IITs", to: "/mock-test/jee-advanced" },
            { route: "JEE Main", who: "NITs, IIITs and GFTIs", to: "/mock-test/jee-main" },
            { route: "NEET UG", who: "MBBS, including AIIMS and JIPMER", to: "/mock-test/neet-ug" },
            { route: "GATE", who: "Postgraduate engineering", to: "/mock-test/gate-metallurgy" },
          ].map((r) => (
            <Link key={r.route} to={r.to} className="card card-hover group p-5">
              <span className="block text-xs font-bold uppercase tracking-wider text-indigo-600">
                {r.route}
              </span>
              <span className="mt-2 block font-semibold text-slate-900 group-hover:text-indigo-600">
                {r.who}
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-8 max-w-3xl leading-relaxed text-slate-600">
          Questivo publishes no cut-offs, fees, seat counts or rankings, and is not affiliated
          with any institution listed below.
        </p>

        {groups.map((g) => (
          <section key={g.type} className="mt-12">
            <h2 className="section-title">{g.label}</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.colleges.map((c: College) => {
                const via = examsFor([c.admitsVia])[0];
                return (
                  <Link
                    key={c.slug}
                    to={collegePath(c)}
                    className="card card-hover group flex items-center justify-between p-4"
                  >
                    <span>
                      <span className="block font-semibold text-slate-900 group-hover:text-indigo-600">
                        {c.shortName}
                      </span>
                      <span className="text-sm text-slate-500">
                        {c.city} · via {via?.shortName ?? "entrance exam"}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 muted group-hover:text-indigo-500" />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
