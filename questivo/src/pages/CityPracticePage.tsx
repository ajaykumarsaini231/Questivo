import { Link, useParams } from "react-router-dom";
import { ChevronRight, MapPin, Clock, IndianRupee, Globe2 } from "lucide-react";

import { examPath } from "../lib/exams";
import {
  ALL_CITIES,
  cityPath,
  citiesByRegion,
  examsFor,
  getCity,
  type ExamCity,
} from "../lib/geo";
import { useAiGenerator } from "../lib/premium";

/**
 * "Free exam practice in <city>."
 *
 * WHAT THIS PAGE IS ALLOWED TO SAY
 *
 * Questivo has no premises anywhere. Every line here is either about the
 * national paper — which is identical in every city, and saying so is the
 * page's most useful sentence — or about the local candidate pool, which comes
 * from the per-city `context` in lib/geo.ts. The page states outright that
 * there is no centre in the city rather than leaving a coaching-shaped
 * ambiguity, because a visitor who arrives from "NEET coaching in Kota"
 * deserves to know within one screen that this is not that.
 *
 * WHY IT LINKS OUT SO HEAVILY
 *
 * The depth lives on /mock-test/<exam> and /pyq. This page's job is to be the
 * right entry point for a local query and then hand over. A city page that
 * tried to restate the exam content would be sixty copies of the same document,
 * which is the doorway pattern the whole geo layer is written to avoid — see
 * the header comment in lib/geo.ts.
 */
export default function CityPracticePage() {
  const { citySlug } = useParams();
  const city = getCity(citySlug);
  const generator = useAiGenerator();

  if (!city) {
    return (
      <div className="min-h-screen bg-slate-50">
        <main className="shell py-16 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            We don't have a page for that city yet
          </h1>
          <p className="mt-4 text-slate-600">
            Questivo works everywhere — the papers are the national ones. Browse the cities
            we have written up, or go straight to the archive.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/practice" className="btn btn-primary btn-lg">
              All cities <ChevronRight className="ml-2 h-4 w-4" />
            </Link>
            <Link to="/pyq" className="btn btn-secondary btn-lg">
              Previous year papers
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const exams = examsFor(city.exams);
  const where = city.state ? `${city.name}, ${city.state}` : `${city.name}, ${city.country}`;
  const isIndia = city.country === "India";
  // Same region, minus this city. The mesh is what makes these pages a section
  // rather than sixty orphans hanging off one hub.
  const neighbours = ALL_CITIES.filter(
    (c) => c.region === city.region && c.slug !== city.slug
  ).slice(0, 8);

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="shell py-10">
        <nav className="mb-6 text-sm text-slate-500" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-indigo-600">
            Home
          </Link>
          <span className="mx-2">/</span>
          <Link to="/practice" className="hover:text-indigo-600">
            Practice by city
          </Link>
          <span className="mx-2">/</span>
          <span className="text-slate-700">{city.name}</span>
        </nav>

        <header>
          <span className="chip inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {where}
          </span>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">
            Free mock tests and previous year papers in {city.name}
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-slate-600">
            {city.context}
          </p>
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-slate-600">
            The papers themselves are national. A candidate in {city.name} sits exactly the
            same previous year paper, under the same duration and the same marking scheme, as
            a candidate anywhere else — so what a local page can usefully change is which exam
            it leads with, not what the paper contains.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/pyq" className="btn btn-primary btn-lg">
              Sit a previous year paper <ChevronRight className="ml-2 h-4 w-4" />
            </Link>
            <Link to={generator.path} className="btn btn-secondary btn-lg">
              {generator.label}
            </Link>
          </div>
        </header>

        {/* The three things a local searcher is actually weighing against a
            coaching enrolment. Stated plainly rather than as marketing. */}
        <section className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: IndianRupee,
              title: "Free, with no signup to start",
              body: "Sitting a previous year paper costs nothing and asks for no payment details. Signing in only adds saved history.",
            },
            {
              icon: Clock,
              title: "No slot, no schedule",
              body: `Papers can be attempted at any hour. That is the difference that matters where local test-series slots are scarce or oversubscribed.`,
            },
            {
              icon: Globe2,
              title: "The real paper, not a summary",
              body: "Every question in its original order, the original clock, the original marking scheme. Nothing generated, shuffled or substituted.",
            },
          ].map((f) => (
            <div key={f.title} className="card p-5">
              <f.icon className="h-5 w-5 text-indigo-600" />
              <h2 className="mt-3 font-bold text-slate-900">{f.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{f.body}</p>
            </div>
          ))}
        </section>

        <section className="mt-16">
          <h2 className="section-title">
            What candidates in {city.name} practise here
          </h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-slate-600">
            Ordered by how the local pool actually splits. Each links to that exam's own page,
            which is where the detail lives.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {exams.map((exam) => (
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
                  <span className="mt-2 block text-xs uppercase tracking-wider text-slate-400">
                    {exam.subjects.slice(0, 4).join(" · ")}
                  </span>
                </span>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 muted group-hover:text-indigo-500" />
              </Link>
            ))}
          </div>
        </section>

        {/* Said outright, high on the page, because the queries that land here
            are coaching queries and the honest answer is "we are not that". */}
        <section className="mt-16">
          <h2 className="section-title">Is Questivo a coaching centre in {city.name}?</h2>
          <p className="mt-3 max-w-3xl leading-relaxed text-slate-600">
            No. Questivo is online only. It runs no classrooms, no coaching centre and no
            examination centre in {city.name} or in any other city, and it does not offer
            admission, counselling or placement services. What it provides is the previous
            year archive, papers built from past questions, instant scoring under the real
            marking scheme, and a worked solution on every question.
          </p>
          {!isIndia && (
            <p className="mt-4 max-w-3xl leading-relaxed text-slate-600">
              Candidates preparing from {city.name} sit the same Indian national papers as
              candidates inside India, on the same syllabus. Questivo does not administer the
              examination and does not advise on centres or eligibility — read those from the
              conducting body's own notification.
            </p>
          )}
        </section>

        {neighbours.length > 0 && (
          <section className="mt-16">
            <h2 className="section-title">
              {isIndia ? `Also in ${city.region}` : "Other cities"}
            </h2>
            <div className="mt-6 flex flex-wrap gap-2">
              {neighbours.map((n) => (
                <Link
                  key={n.slug}
                  to={cityPath(n)}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600"
                >
                  {n.name}
                </Link>
              ))}
              <Link
                to="/practice"
                className="rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-600"
              >
                All cities
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

/** The hub at /practice. A real index, not a link farm: grouped and captioned. */
export function CityIndexPage() {
  const groups = citiesByRegion();
  const total = ALL_CITIES.length;

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="shell py-10">
        <nav className="mb-6 text-sm text-slate-500" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-indigo-600">
            Home
          </Link>
          <span className="mx-2">/</span>
          <span className="text-slate-700">Practice by city</span>
        </nav>

        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          Exam practice by city
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-slate-600">
          Free previous year papers and practice tests for candidates in {total} cities across
          India and overseas. The papers are the national ones and are identical everywhere —
          each city page changes which exams it leads with, and says what is actually different
          about preparing there.
        </p>
        <p className="mt-4 max-w-3xl leading-relaxed text-slate-600">
          Questivo is online only. It operates no coaching centres, classrooms or examination
          centres in any of these cities.
        </p>

        {groups.map((g) => (
          <section key={g.region} className="mt-12">
            <h2 className="section-title">{g.region}</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.cities.map((c: ExamCity) => (
                <Link
                  key={c.slug}
                  to={cityPath(c)}
                  className="card card-hover group flex items-center justify-between p-4"
                >
                  <span>
                    <span className="block font-semibold text-slate-900 group-hover:text-indigo-600">
                      {c.name}
                    </span>
                    <span className="text-sm text-slate-500">
                      {c.state || c.country}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 muted group-hover:text-indigo-500" />
                </Link>
              ))}
            </div>
          </section>
        ))}

        <section className="mt-16 rounded-[10px] bg-slate-900 p-8 text-center">
          <p className="text-xl font-bold text-white">Your city not listed?</p>
          <p className="mx-auto mt-2 max-w-lg muted">
            It changes nothing. The archive is national and free everywhere — pick a paper and
            sit it.
          </p>
          <Link to="/pyq" className="btn btn-primary btn-lg mt-6">
            Previous year papers <ChevronRight className="h-4 w-4" />
          </Link>
        </section>
      </main>
    </div>
  );
}
