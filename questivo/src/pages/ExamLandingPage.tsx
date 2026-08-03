import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronRight, CheckCircle, Target, Sparkles } from "lucide-react";
import { EXAMS, getExam, examPath } from "../lib/exams";
import { getPaper, questionTypeLabel } from "../lib/examSyllabus";

/**
 * Per-exam landing page.
 *
 * Structure follows what actually ranks in this vertical: question-phrased
 * subheadings (Testbook's top page uses 19 of them), a specification table,
 * a visible FAQ block that matches the FAQPage JSON-LD, and dense internal
 * links out to sibling exams.
 */
const ExamLandingPage: React.FC = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const exam = getExam(slug);

  if (!exam) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="shell py-20 text-center">
          <h1 className="text-3xl font-bold text-slate-900">Exam not found</h1>
          <p className="mt-4 text-slate-600">
            We don't have a mock test page for that exam yet.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {EXAMS.map((e) => (
              <Link
                key={e.slug}
                to={examPath(e)}
                className="btn btn-secondary btn-sm"
              >
                {e.shortName}
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const start = () => navigate("/GenerateTestPage", { state: { selectedExam: exam.code } });
  const others = EXAMS.filter((e) => e.slug !== exam.slug);
  const paper = getPaper(exam.slug);
  const fmtMarks = (c: number, w: number) =>
    w === 0 ? `+${c}, no negative` : `+${c} / ${w}`;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <main className="shell py-10">
        {/* Breadcrumb — mirrors the BreadcrumbList JSON-LD for this route. */}
        <nav aria-label="Breadcrumb" className="mb-8 text-sm text-slate-500">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link to="/" className="hover:text-indigo-600">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="font-medium text-slate-700">{exam.shortName} mock test</li>
          </ol>
        </nav>

        <header>
          <span className="chip">
            {exam.category}
          </span>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">
            {exam.name} Mock Test — Free AI Practice Papers
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-slate-600">{exam.summary}</p>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Questivo generates unlimited {exam.shortName} practice papers that follow the
            official exam pattern, scores them instantly with negative marking, and explains
            the reasoning behind every answer.
          </p>
          <button
            onClick={start}
            className="btn btn-primary btn-lg mt-8"
          >
            Generate a free {exam.shortName} mock test
            <ChevronRight className="ml-2 h-4 w-4" />
          </button>
        </header>

        <section className="mt-16">
          <h2 className="section-title">
            What is {exam.name}?
          </h2>
          <p className="mt-4 leading-relaxed text-slate-600">{exam.summary}</p>
          <p className="mt-4 leading-relaxed text-slate-600">
            <strong className="font-semibold text-slate-800">Who it's for: </strong>
            {exam.audience}
          </p>
          {exam.officialFacts?.length ? (
            <ul className="mt-4 space-y-2 text-slate-600">
              {exam.officialFacts.map((f) => (
                <li key={f} className="flex gap-2">
                  <CheckCircle className="mt-1 h-4 w-4 shrink-0 text-indigo-500" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {exam.officialSource ? (
            <p className="mt-3 text-sm text-slate-500">
              Official details:{" "}
              <a
                href={exam.officialSource}
                rel="nofollow noopener"
                target="_blank"
                className="text-indigo-600 underline"
              >
                {exam.officialSource}
              </a>
            </p>
          ) : null}
        </section>

        {/* ============ PAPER PATTERN ============
            The section-by-section structure of the real paper. Questivo's full
            mock test generates exactly these blocks, so what a candidate reads
            here is what they actually sit. */}
        {paper && (
          <section className="mt-14">
            <h2 className="section-title">
              What is the {exam.shortName} exam pattern?
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="chip">{paper.totalQuestions} questions</span>
              <span className="chip">{paper.totalMarks} marks</span>
              <span className="chip">{paper.durationMinutes} minutes</span>
              {paper.mode && <span className="chip">{paper.mode}</span>}
            </div>

            <div className="card mt-5 overflow-x-auto">
              <table className="data-table min-w-[560px]">
                <caption className="sr-only">{exam.name} paper pattern</caption>
                <thead>
                  <tr>
                    <th scope="col">Section</th>
                    <th scope="col">Questions</th>
                    <th scope="col">Question type</th>
                    <th scope="col">Marking</th>
                  </tr>
                </thead>
                <tbody>
                  {paper.sections.map((s) => (
                    <tr key={s.name}>
                      <th scope="row" className="font-medium">
                        {s.name}
                        {s.note && <span className="block text-xs muted">{s.note}</span>}
                      </th>
                      <td>{s.questions}</td>
                      <td>{questionTypeLabel(s.type)}</td>
                      <td className="whitespace-nowrap">
                        {fmtMarks(s.marksCorrect, s.marksIncorrect)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-sm muted">
              Conducted by {paper.conductedBy}.{" "}
              {paper.official ? (
                <>
                  Pattern taken from the official information bulletin
                  {paper.checkedOn ? `, checked ${paper.checkedOn}` : ""}.{" "}
                </>
              ) : (
                <>
                  <strong>Not yet verified against the current notification</strong> — treat
                  as indicative and confirm on the official site before relying on it.{" "}
                </>
              )}
              <a
                href={paper.sourceUrl}
                target="_blank"
                rel="nofollow noopener"
                style={{ color: "var(--c-brand)" }}
                className="underline"
              >
                {paper.sourceUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            </p>
          </section>
        )}

        {/* ============ SYLLABUS ============ */}
        {paper && (
          <section className="mt-14" id="syllabus">
            <h2 className="section-title">What is the {exam.shortName} syllabus?</h2>
            <p className="mt-3 leading-relaxed muted">
              {paper.official
                ? `Unit names below are as published in the official ${exam.shortName} syllabus. You can generate a mock test on any single unit.`
                : `Working outline of the ${exam.shortName} syllabus. Confirm against the official notification before relying on it.`}
            </p>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              {Object.entries(paper.syllabus).map(([subject, units]) => (
                <div key={subject} className="card p-5">
                  <h3 className="text-base font-bold">
                    {subject}{" "}
                    <span className="text-sm font-normal muted">({units.length} units)</span>
                  </h3>
                  <ol className="mt-3 space-y-1.5 text-sm">
                    {units.map((u, i) => (
                      <li key={u} className="flex gap-2.5">
                        <span className="w-5 shrink-0 tabular-nums muted">{i + 1}.</span>
                        <span>{u}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-14">
          {/* Phrased in the plural to sidestep a/an — "a SSC CGL" reads wrong
              and the article varies by exam initialism. */}
          <h2 className="section-title">
            What subjects do {exam.shortName} mock tests cover?
          </h2>
          <p className="mt-4 leading-relaxed text-slate-600">
            You can generate a full-length paper across every area below, or restrict a test
            to a single subject or chapter.
          </p>
          {/* Spec tables like this are disproportionately quoted by answer engines. */}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse overflow-hidden rounded-xl bg-white text-left text-sm ring-1 ring-slate-200">
              <caption className="sr-only">
                Subjects available in a Questivo {exam.name} mock test
              </caption>
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Subject area
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Sectional practice
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {exam.subjects.map((s) => (
                  <tr key={s}>
                    <th scope="row" className="px-4 py-3 font-medium text-slate-800">
                      {s}
                    </th>
                    <td className="px-4 py-3 text-slate-600">Available</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-14">
          <h2 className="section-title">
            How does Questivo generate {exam.shortName} mock tests?
          </h2>
          <ol className="mt-6 space-y-5">
            {[
              `Choose ${exam.name} and pick the subjects or chapters you want to be tested on.`,"Set how many questions you want and the difficulty level.","Questivo's AI writes a fresh paper that follows the official exam pattern and marking scheme.","Attempt it against a timer, then review a step-by-step explanation for every question.",
            ].map((step, i) => (
              <li key={step} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <span className="pt-1 leading-relaxed text-slate-600">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-14">
          <h2 className="section-title">
            Why take timed {exam.shortName} mock tests?
          </h2>
          <p className="mt-4 leading-relaxed text-slate-600">{exam.whyPractice}</p>
        </section>

        <section className="mt-14">
          <h2 className="section-title">
            Are {exam.shortName} questions repeated between tests?
          </h2>
          <p className="mt-4 leading-relaxed text-slate-600">
            No. Questivo generates a new {exam.shortName} paper on every request rather than
            serving from a fixed bank, so you will not see the same question twice across
            attempts. That also means practice scores reflect understanding rather than
            recall of a paper you have already seen.
          </p>
        </section>

        <section className="mt-14">
          <h2 className="section-title">
            What mistakes cost candidates marks in {exam.shortName}?
          </h2>
          <p className="mt-4 leading-relaxed text-slate-600">
            These are the patterns worth watching for when you review a mock test:
          </p>
          <ul className="mt-5 space-y-4">
            {exam.commonMistakes.map((m) => (
              <li key={m} className="flex gap-3">
                <CheckCircle className="mt-1 h-5 w-5 shrink-0 text-indigo-500" />
                <span className="leading-relaxed text-slate-600">{m}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-14">
          <h2 className="section-title">
            How should you use mock tests in {exam.shortName} preparation?
          </h2>
          <p className="mt-4 leading-relaxed text-slate-600">
            Treat the attempt as the cheap part and the review as the real work. A practical
            loop: take a sectional test on the topic you studied most recently, review every
            wrong answer against its explanation before starting anything new, then note
            whether each mistake was a knowledge gap or an execution error. Knowledge gaps
            send you back to the material; execution errors — misreading, arithmetic slips,
            spending four minutes on a question worth the same as one that takes forty
            seconds — only improve with more timed attempts.
          </p>
          <p className="mt-4 leading-relaxed text-slate-600">
            Once sectional accuracy is steady, switch to full-length {exam.shortName} papers
            to build stamina and practise the order in which you attempt sections.
          </p>
        </section>

        {/* Visible FAQ. Must stay in sync with the FAQPage JSON-LD built for
            this route in lib/seo.ts — schema without visible content breaches
            Google's structured data guidelines. */}
        <section className="mt-16" id="faq">
          <h2 className="section-title">
            {exam.shortName} mock test FAQs
          </h2>
          <div className="mt-6 divide-y divide-slate-200 rounded-[10px] bg-white px-6 ring-1 ring-slate-200">
            {exam.faqs.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold text-slate-900 marker:content-none [&::-webkit-details-marker]:hidden">
                  <h3 className="text-base">{f.q}</h3>
                  <ChevronRight className="h-5 w-5 shrink-0 muted transition-transform group-open:rotate-90" />
                </summary>
                <p className="mt-3 leading-relaxed text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <h2 className="section-title">
            Mock tests for other exams
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {others.map((e) => (
              <Link
                key={e.slug}
                to={examPath(e)}
                className="card card-hover group flex items-center justify-between p-4"
              >
                <span>
                  <span className="block font-semibold text-slate-900 group-hover:text-indigo-600">
                    {e.name} mock test
                  </span>
                  <span className="text-sm text-slate-500">{e.category}</span>
                </span>
                <Target className="h-5 w-5 muted group-hover:text-indigo-500" />
              </Link>
            ))}
          </div>
        </section>

        <aside className="mt-16 rounded-[10px] bg-slate-900 p-8 text-center">
          <Sparkles className="mx-auto h-6 w-6 text-indigo-400" />
          <p className="mt-3 text-xl font-bold text-white">
            Ready to attempt a {exam.shortName} paper?
          </p>
          <p className="mx-auto mt-2 max-w-lg muted">
            Generating and attempting mock tests on Questivo is free. No payment details
            required.
          </p>
          <button
            onClick={start}
            className="btn btn-primary btn-lg mt-6"
          >
            Start now <ChevronRight className="h-4 w-4" />
          </button>
        </aside>
      </main>
    </div>
  );
};

export default ExamLandingPage;
