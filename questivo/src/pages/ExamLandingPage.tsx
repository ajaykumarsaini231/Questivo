import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronRight, CheckCircle, Target, Sparkles, Send } from "lucide-react";
import { EXAMS, getExam, examPath } from "../lib/exams";
import { getPaper, questionTypeLabel } from "../lib/examSyllabus";
import { PYQ_SLUGS } from "../lib/pyq";
// Eager on purpose. This page is prerendered, so the PYQ heading and the AI
// button end up in the static HTML — no layout shift at the very top of the
// page, and the block is indexable. The expensive part (katex + markdown) is
// lazy INSIDE PyqSection, so nothing heavy joins the first paint.
import PyqSection from "../componenets/PyqSection";
import CourseRequestModal from "../componenets/CourseRequestModal";

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
  // Declared before the not-found branch below: hooks must run in the same
  // order on every render, so they cannot sit after an early return.
  const [requestOpen, setRequestOpen] = useState(false);
  // -1 until PyqSection reports back. Starting at -1 rather than 0 keeps the
  // prerendered markup and the first hydration pass identical: neither CTA
  // claims a free paper exists before anything has been counted.
  const [pyqCount, setPyqCount] = useState(-1);
  const hasPyqBank = pyqCount > 0;

  if (!exam) {
    // A visitor who landed here typed or followed a URL for an exam we do not
    // cover — the single best moment to ask them which one they wanted, so the
    // request form goes here rather than only in a footer somewhere.
    const guess = (slug || "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();

    return (
      <div className="min-h-screen bg-slate-50">
        <main className="shell py-16">
          <h1 className="text-3xl font-bold text-slate-900">
            We don't cover that exam yet
          </h1>
          <p className="mt-3 text-slate-600">
            Questivo has mock tests for the six exams below. If yours isn't one of them,
            request it and we'll build it.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {EXAMS.map((e) => (
              <Link key={e.slug} to={examPath(e)} className="btn btn-secondary btn-sm">
                {e.shortName}
              </Link>
            ))}
          </div>

          <button onClick={() => setRequestOpen(true)} className="btn btn-primary mt-8">
            <Send className="h-4 w-4" />
            Request {guess || "this course"}
          </button>

          <CourseRequestModal
            open={requestOpen}
            onClose={() => setRequestOpen(false)}
            prefill={guess}
          />
        </main>
      </div>
    );
  }

  // Two ways into the generator, and the distinction is money: a PYQ paper is
  // assembled from stored questions for nothing, while an AI paper spends model
  // credits on every generation. The mode travels in router state so the page
  // opens on the right one instead of the visitor having to find the selector.
  const start = () =>
    navigate("/GenerateTestPage", { state: { selectedExam: exam.code, mode: "practice" } });
  /**
   * A PYQ mock test is sat in the exam player, not written by the model.
   *
   * This used to open /GenerateTestPage with `mode: "pyq"` — the AI writer's
   * screen, carrying a hint it does not act on. A button that says "PYQ mock
   * test" has to produce a paper of previous year questions, and the route that
   * does that is /pyq/practice: full official pattern, drawn from questions
   * that were actually examined, run in the NTA interface with the key withheld
   * until submission.
   */
  const startPyq = () =>
    navigate(`/pyq/practice?examCode=${encodeURIComponent(exam.code)}&mode=full`);

  /**
   * A chapter drill, sat as a real paper.
   *
   * Clicking a chapter used to unfold a list of its questions with the answers
   * beside them, which is a reference page, not practice — you cannot test
   * yourself on a question whose answer is already on screen. It now opens the
   * same player as everything else, drawn ONLY from that chapter, and the
   * answer and worked solution appear when the paper is submitted and not
   * before.
   *
   * Length is capped at what the chapter actually holds. Asking for 25 from a
   * chapter with 12 is refused by the generator — correctly, since it will not
   * pad from elsewhere — and the candidate would see an error instead of a
   * paper.
   */
  const startChapter = (topic: string, subject: string, available: number) => {
    const p = new URLSearchParams({
      examCode: exam.code,
      subjects: subject,
      topics: topic,
      totalQuestions: String(Math.max(1, Math.min(available, 25))),
    });
    navigate(`/pyq/practice?${p}`);
  };
  const others = EXAMS.filter((e) => e.slug !== exam.slug);
  const paper = getPaper(exam.slug);
  // Every exam leads with the real paper, not just the three with a stocked
  // shelf. Exams we hold questions for resolve to their PYQ bucket; the rest
  // pass their own code, which the API answers with a 404 that PyqSection
  // renders as "being added" alongside the AI paper CTA. Previously these
  // three exams had no PYQ block at all, so half the catalogue jumped straight
  // to the generated paper and the ordering promise only held on paper.
  const pyqExamCode = PYQ_SLUGS[exam.slug] ?? exam.code;
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
            {hasPyqBank
              ? `Practise ${pyqCount} real ${exam.shortName} questions from past papers, each with a worked solution — or generate an unlimited fresh paper in the official exam pattern, scored instantly with negative marking.`
              : `Questivo generates unlimited ${exam.shortName} practice papers that follow the official exam pattern, scores them instantly with negative marking, and explains the reasoning behind every answer.`}
          </p>
          {/* Once real questions exist for this exam they are the better paper
              AND the free one, so the hero stops advertising generation. The AI
              route stays available from the section below when someone wants a
              fresh paper on a specific topic. */}
          {hasPyqBank ? (
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button onClick={startPyq} className="btn btn-primary btn-lg">
                Start a free {exam.shortName} PYQ mock test
                <ChevronRight className="ml-2 h-4 w-4" />
              </button>
              <a href="#pyq" className="btn btn-secondary btn-lg">
                Browse {pyqCount} previous year questions
              </a>
            </div>
          ) : (
            <button onClick={start} className="btn btn-primary btn-lg mt-8">
              Generate a free {exam.shortName} mock test
              <ChevronRight className="ml-2 h-4 w-4" />
            </button>
          )}
        </header>

        {/* ============ PREVIOUS YEAR QUESTIONS ============
            Positioned directly under the hero, ahead of every explanatory
            section: a candidate who came here to practise should hit the real
            paper before they hit prose about it. */}
        <PyqSection
          examCode={pyqExamCode}
          examShortName={exam.shortName}
          onGenerate={start}
          onPyqTest={startPyq}
          onPractiseChapter={startChapter}
          onCount={setPyqCount}
        />

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

        {/* ============ COURSE REQUEST ============
            Every exam page is a place someone may have arrived while looking
            for a different exam, so the ask sits on all of them rather than on
            a page nobody navigates to. */}
        <section className="mt-16" id="request-a-course">
          <h2 className="section-title">Preparing for a different exam?</h2>
          <p className="mt-3 leading-relaxed text-slate-600">
            Questivo covers {EXAMS.length} exams today. Tell us which one you need and we
            will add it — requests are prioritised by how many people ask for the same exam.
          </p>
          <button onClick={() => setRequestOpen(true)} className="btn btn-secondary mt-6">
            <Send className="h-4 w-4" />
            Request a course
          </button>
        </section>

        <CourseRequestModal open={requestOpen} onClose={() => setRequestOpen(false)} />

        <aside className="mt-16 rounded-[10px] bg-slate-900 p-8 text-center">
          <Sparkles className="mx-auto h-6 w-6 text-indigo-400" />
          <p className="mt-3 text-xl font-bold text-white">
            Ready to attempt a {exam.shortName} paper?
          </p>
          <p className="mx-auto mt-2 max-w-lg muted">
            {hasPyqBank
              ? `${pyqCount} real ${exam.shortName} questions are stored, with a worked solution on each. Free, no payment details required.`
              : "Generating and attempting mock tests on Questivo is free. No payment details required."}
          </p>
          <button onClick={hasPyqBank ? startPyq : start} className="btn btn-primary btn-lg mt-6">
            Start now <ChevronRight className="h-4 w-4" />
          </button>
        </aside>
      </main>
    </div>
  );
};

export default ExamLandingPage;
