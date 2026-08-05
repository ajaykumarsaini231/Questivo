// Central SEO / GEO configuration.
//
// Everything that describes the site to a search engine or an AI crawler lives
// here so the prerender script (scripts/prerender.mjs) and the runtime <Seo />
// component stay in sync — if they drift, crawlers see one thing and users see
// another, which reads as cloaking.

import { EXAMS, examPath, type Exam } from "./exams";

/**
 * The one hostname Questivo claims as its own.
 *
 * This is not cosmetic. It is stamped into every canonical, og:url, sitemap
 * entry, llms.txt link, JSON-LD @id and the generated robots.txt, so if it names
 * a host the site is not actually served from, every page tells search engines
 * "the real version of me lives somewhere else" and hands the accumulated
 * ranking signal to that other host. That is exactly what happened while this
 * read `questivo.vercel.app` and the site was live on the custom domain.
 *
 * Read from the environment so moving domains again is one Vercel setting and a
 * rebuild, not a code change that can be half-applied. Vite inlines this at
 * build time for both the client and the SSR bundle the prerender step imports,
 * so all four generated artefacts agree by construction.
 *
 * Whatever it is set to must also be the domain vercel.json redirects the
 * deployment's other hostnames to — one live copy, not two.
 */
const ENV_SITE_URL =
  typeof import.meta !== "undefined"
    ? (import.meta as unknown as { env?: Record<string, string | undefined> }).env
        ?.VITE_SITE_URL
    : undefined;

/** No trailing slash: every consumer below appends its own path. */
export const SITE_URL = (ENV_SITE_URL || "https://questivo.sutradharlabs.me").replace(/\/+$/, "");
export const SITE_NAME = "Questivo";
export const TWITTER_HANDLE = "@questivo";
/** Single locale. Emitted as hreflang + og:locale so the market is explicit. */
export const SITE_LOCALE = "en-IN";

export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.jpg`;
export const LOGO_URL = `${SITE_URL}/logo.png`;

export interface RouteSeo {
  path: string;
  title: string;
  description: string;
  keywords: string;
  /** Rendered into the crawler-visible fallback markup. */
  heading: string;
  /** Short factual lines. These are what a generative engine quotes back. */
  facts: string[];
  ogImage?: string;
  /** Exclude from sitemap.xml and mark noindex. */
  noindex?: boolean;
  /**
   * Point rel=canonical at a different path than this route's own.
   *
   * For the case where two URLs render the identical screen — /test-setup and
   * /pyq/setup are the same component — and the duplicate has to keep working
   * for anything already linking to it. noindex alone does not merge the two;
   * a canonical does.
   */
  canonicalPath?: string;
}

/**
 * Public, indexable routes. Keep the paths identical to the <Route path> values
 * in App.tsx — a sitemap entry for a route that does not exist is a soft 404.
 */
export const ROUTES: RouteSeo[] = [
  {
    // Leads with previous year papers, not the generator. That is not a
    // preference — it is what the page now says: the hero reads "real previous
    // year questions with worked solutions", the archive is the front door, and
    // SHOW_AI_GENERATOR is off so the writer is no longer promoted in the nav.
    // A <title> selling an AI generator over a PYQ archive would be describing
    // the site as it was in early August, and a snippet that does not match the
    // page is the cheapest way to lose the click after winning the impression.
    path: "/",
    title: "Questivo – Previous Year Papers & Free Mock Tests for JEE, NEET & GATE",
    description:
      "Sit real previous year papers for JEE Main, JEE Advanced, NEET UG and GATE MT exactly as they were set — original clock, original marking scheme, worked solution on every question. Plus unlimited practice papers in the official exam pattern. Free.",
    keywords:
      "previous year question papers, PYQ with solutions, JEE Main previous year paper, JEE Advanced previous year questions, NEET previous year papers, GATE MT previous year paper, free mock test, online test series India, AI mock test generator",
    heading: "Previous year papers and free mock tests for India's competitive exams",
    facts: [
      "Questivo is a free practice platform for Indian competitive exams, built around real previous year question papers.",
      "Previous year papers can be sat exactly as they were set, under the original duration and marking scheme, with nothing shuffled or generated.",
      "Questivo's previous year archive covers JEE Main, JEE Advanced, NEET UG and GATE Metallurgical Engineering (MT).",
      "Every previous year question can be expanded into a worked solution, including the solution as the original booklet printed it.",
      "Where Questivo holds no previous year paper for an exam, it generates a fresh paper in that exam's official pattern instead.",
      "Landing pages exist for JEE Main, JEE Advanced, NEET UG, GATE MT, SSC CGL, RRB NTPC and UPSC IAS.",
      "Scoring is instant and applies the exam's own negative marking.",
      "Questivo also provides a free ATS resume analyzer and an AI mock interview studio.",
    ],
  },
  {
    path: "/GenerateTestPage",
    title: "Generate a Custom Mock Test – Pick Exam, Topics & Difficulty | Questivo",
    description:
      "Build a custom practice test in seconds. Choose your exam (JEE, NEET, GATE, SSC, RRB, UPSC), pick subjects and topics, set question count and difficulty, and Questivo's AI writes a fresh exam-pattern paper.",
    keywords:
      "custom mock test generator, create practice test online, topic wise mock test, chapter wise test JEE NEET, AI question paper generator",
    heading: "Generate a custom mock test",
    facts: [
      "Users select an exam, subject, topics, question count and difficulty level.",
      "Questivo's AI then generates a fresh paper that follows the real exam pattern.",
      "Tests are never repeated — new questions are generated on each request.",
      "Generated papers use the official marking scheme, including negative marking.",
    ],
  },
  {
    // The directory page every "browse exams" affordance points at. It is the
    // hub that links to all six exam pages, so it needs to be prerendered and
    // indexable in its own right rather than being a client-only convenience.
    path: "/exams",
    title: "All Exams – Free Previous Year Questions & AI Mock Tests | Questivo",
    description:
      "Every exam Questivo covers: JEE Main, JEE Advanced, NEET UG, GATE MT, SSC CGL, RRB NTPC and UPSC IAS. Practise real previous year questions first, then generate unlimited fresh papers in the official exam pattern — free.",
    keywords:
      "all exams, previous year question papers, PYQ practice, free mock tests by exam, JEE Main JEE Advanced NEET GATE SSC RRB UPSC previous year questions",
    heading: "All exams on Questivo",
    facts: [
      "Questivo covers JEE Main, JEE Advanced, NEET UG, GATE Metallurgical Engineering (MT), SSC CGL, RRB NTPC and UPSC IAS.",
      "JEE Advanced is listed separately from JEE Main because it uses different question types and changes its marking scheme between years.",
      "Each exam page opens with real previous year questions where Questivo has them.",
      "Where no previous year questions are stored, Questivo generates a fresh paper in the official exam pattern instead.",
      "Every previous year question can be expanded into a step-by-step worked solution.",
      "Exams Questivo does not yet cover can be requested, and requests are prioritised by demand.",
    ],
  },
  {
    path: "/resume_ats_score",
    title: "Free ATS Resume Checker & Score – Instant AI Audit | Questivo",
    description:
      "Upload your resume and get an instant ATS compatibility score. Questivo's AI flags missing keywords, weak bullet points and formatting that breaks applicant tracking systems, then rewrites them for you.",
    keywords:
      "ATS resume checker, free resume score, applicant tracking system test, resume keyword optimizer, AI resume review, resume checker India",
    heading: "Free ATS resume checker",
    facts: [
      "Questivo scores a resume for compatibility with applicant tracking systems (ATS).",
      "The analyzer accepts PDF and Word (.doc, .docx) resumes.",
      "It reports missing role-specific keywords and formatting that ATS parsers reject.",
      "It rewrites weak bullet points into measurable, achievement-led statements.",
      "The ATS resume check is free and returns results instantly.",
    ],
  },
  {
    // /interviews immediately redirects into a random session id, so it has no
    // stable content of its own. Prerendering copy here that the user never
    // sees would be cloaking — keep it out of the index until a dedicated
    // landing page exists that actually renders for visitors.
    path: "/interviews",
    title: "AI Mock Interview Practice – Live Voice Interviewer | Questivo",
    description:
      "Practise job interviews out loud with Questivo's AI interviewer. Speak your answers, get real-time follow-up questions and structured feedback on content, clarity and confidence.",
    keywords:
      "AI mock interview, practice interview online, voice interview practice, HR interview questions, technical interview practice",
    heading: "AI mock interview studio",
    facts: [
      "Questivo runs live voice mock interviews with an AI interviewer.",
      "Candidates answer out loud and receive real-time follow-up questions.",
      "Feedback covers answer content, clarity, structure and confidence.",
    ],
    noindex: true,
  },
  {
    path: "/signup",
    title: "Create Your Free Questivo Account",
    description:
      "Sign up free to generate AI mock tests, track your scores across attempts and save your practice history.",
    keywords: "Questivo sign up, free account, register",
    heading: "Create your free account",
    facts: ["A free Questivo account saves test history and score trends across attempts."],
    noindex: true,
  },
  {
    path: "/signin",
    title: "Sign In to Questivo",
    description: "Sign in to your Questivo account to continue practising.",
    keywords: "Questivo login, sign in",
    heading: "Sign in",
    facts: [],
    noindex: true,
  },
  {
    path: "/my-reports",
    title: "My Reports – Saved ATS Analyses & Interviews | Questivo",
    description: "Reopen your past ATS resume reports and AI interview transcripts.",
    keywords: "saved resume report, interview transcript history",
    heading: "My reports",
    facts: [],
    noindex: true,
  },
  {
    path: "/profile",
    title: "Your Profile & Test History | Questivo",
    description: "Review your past mock tests, scores and accuracy trends.",
    keywords: "Questivo profile, test history, score report",
    heading: "Your profile",
    facts: [],
    noindex: true,
  },
  {
    // The archive, plus everything under it: /pyq/:paperId runs a paper and
    // /pyq/attempt/:id reopens a sitting.
    //
    // Now INDEXABLE. It was noindex when it was a new, unpromoted screen; it is
    // now the site's front door and its only genuinely scarce asset — the
    // generated papers are a commodity any competitor can also produce, whereas
    // "the real 2019 GATE MT paper with the booklet's own worked solutions" is
    // the thing people actually search for. Leaving the one page that holds it
    // out of the index while shipping seven pages about generated papers had it
    // exactly backwards.
    //
    // What a crawler gets here is head + the `facts` block: the archive itself
    // is a live query, so the prerendered body is the same skeleton a visitor
    // sees on first paint. That is thin, and honest. The per-exam depth lives on
    // /mock-test/<slug>, which is where the internal links point.
    path: "/pyq",
    title: "Previous Year Question Papers with Solutions – JEE, NEET, GATE | Questivo",
    description:
      "Sit real previous year papers for JEE Main, JEE Advanced, NEET UG and GATE MT exactly as they were set — every question in its original order, the original clock, the original marking scheme. Free, with a worked solution on every question.",
    keywords:
      "previous year question papers, previous year papers with solutions, PYQ, JEE Main previous year paper, JEE Advanced previous year questions, NEET UG previous year papers, GATE MT previous year paper, past paper mock test, solved question papers",
    heading: "Previous year papers",
    facts: [
      "Questivo's previous year archive holds papers for JEE Main, JEE Advanced, NEET UG and GATE Metallurgical Engineering (MT).",
      "A previous year paper is sat exactly as it was set: every question in its original order, under the original duration and the original marking scheme.",
      "Nothing in a previous year paper is generated, shuffled or substituted.",
      "Papers are chosen by exam, then year, then session and shift.",
      "The answer key and worked solution are withheld by the server until the paper is submitted, so there is no key to read mid-test.",
      "After submitting, every question shows the correct answer, a worked solution, and where available the solution exactly as the original booklet printed it.",
      "Scoring applies the paper's real marking scheme, including negative marking and any limit on how many Section B questions count.",
      "Questions that were later dropped or awarded to all candidates are scored as bonus rather than as wrong.",
      "Sitting previous year papers on Questivo is free and does not require payment details.",
      "Signed-in candidates keep a history of past sittings and can reopen any of them.",
    ],
  },
  {
    // The guided builder. noindex — it is a form whose entire content is the
    // visitor's own selection, so there is nothing here for a search result to
    // be about, and the queries it would compete for are already served by /pyq
    // and the exam pages.
    //
    // It is listed at all because a route that is neither prerendered nor
    // rewritten in vercel.json returns a HARD 404 on direct visit or refresh —
    // which is what /pyq/setup and /test-setup were both doing in production.
    // A noindex entry still gets a real file written, so the URL answers 200.
    path: "/pyq/setup",
    title: "Set Up a Practice Paper – Pick Exam, Year & Topics | Questivo",
    description:
      "Choose an exam and build a paper from real previous year questions — by year, subject, chapter or difficulty, in the official exam pattern.",
    keywords: "practice paper setup, chapter wise previous year questions, topic wise PYQ practice",
    heading: "Set up a test",
    facts: [
      "The setup flow builds a paper by drawing from real previous year questions that match the filters chosen.",
      "Filters are applied strictly: a paper is never quietly topped up from outside the selection.",
    ],
    noindex: true,
  },
  {
    // The same component as /pyq/setup, reached from an older link. Kept alive
    // rather than deleted, and pointed at the canonical of the two so the pair
    // is never read as duplicate content.
    path: "/test-setup",
    title: "Set Up a Practice Paper – Pick Exam, Year & Topics | Questivo",
    description:
      "Choose an exam and build a paper from real previous year questions — by year, subject, chapter or difficulty, in the official exam pattern.",
    keywords: "practice paper setup, chapter wise previous year questions, topic wise PYQ practice",
    heading: "Set up a test",
    facts: [],
    noindex: true,
    canonicalPath: "/pyq/setup",
  },
];

/**
 * One indexable route per exam.
 *
 * The competitor audit was unambiguous on this: per-exam pages, not homepages,
 * carry the rankings in this vertical. Generating them from EXAMS means adding
 * an exam automatically produces a prerendered page and a sitemap entry.
 *
 * Titles deliberately omit a year. Competitors put "2026" in theirs, which
 * helps CTR but only while someone keeps it current — a stale year reads as an
 * abandoned site, and nothing here re-runs on 1 January.
 */
function examRoute(exam: Exam): RouteSeo {
  return {
    path: examPath(exam),
    title: `${exam.shortName} Mock Test – Free AI Practice Papers | Questivo`,
    description: `Free ${exam.name} mock tests generated by AI to match the official exam pattern. Unlimited fresh papers, instant scoring with negative marking, and a step-by-step explanation for every question.`,
    keywords: [
      `${exam.shortName} mock test`,
      `${exam.shortName} online test series`,
      `free ${exam.shortName} practice test`,
      `${exam.shortName} previous year pattern questions`,
      ...exam.aliases.map((a) => `${a} mock test`),
    ].join(", "),
    heading: `${exam.name} mock test`,
    facts: [
      `Questivo generates free ${exam.name} mock tests that follow the official exam pattern.`,
      `${exam.summary}`,
      `Subjects covered: ${exam.subjects.join(", ")}.`,
      `Papers are generated fresh on each request, so ${exam.shortName} questions are never repeated between attempts.`,
      `Every question includes a step-by-step explanation, and scoring applies the exam's negative marking.`,
    ],
  };
}

export const EXAM_ROUTES: RouteSeo[] = EXAMS.map(examRoute);

/** Every route the prerenderer walks. */
export const ALL_ROUTES: RouteSeo[] = [...ROUTES, ...EXAM_ROUTES];

/** Routes that belong in sitemap.xml. */
export const INDEXABLE_ROUTES = ALL_ROUTES.filter((r) => !r.noindex);

export function getRouteSeo(pathname: string): RouteSeo {
  return (
    ALL_ROUTES.find((r) => r.path === pathname) ??
    // A dynamic child inherits its section's entry, longest prefix first:
    // /pyq/attempt/<id> is a previous-year page, not the homepage. "/" is
    // excluded because it prefixes everything and would match first.
    ALL_ROUTES.filter((r) => r.path !== "/" && pathname.startsWith(`${r.path}/`)).sort(
      (a, b) => b.path.length - a.path.length
    )[0] ??
    ROUTES[0]
  );
}

/* ============================ STRUCTURED DATA ============================ */

/**
 * Questions real users ask, answered in a self-contained way. Generative
 * engines lift these almost verbatim, so each answer must stand alone without
 * the surrounding page for context.
 */
export const FAQS: { q: string; a: string }[] = [
  {
    q: "What is Questivo?",
    a: "Questivo is a free practice platform for Indian competitive exams. It holds real previous year question papers for JEE Main, JEE Advanced, NEET UG and GATE MT which candidates can sit exactly as they were set, and it generates fresh practice papers in the official exam pattern for the exams it has no archive for. Both are scored instantly, with a worked solution on every question.",
  },
  {
    q: "Is Questivo free to use?",
    a: "Sitting previous year papers, creating an account and running an ATS resume check are free, and no payment details are required to start. Some AI features are gated to a paid plan; the free previous year archive is not, and the site says which is which before you start.",
  },
  {
    q: "Which exams does Questivo support?",
    a: "Questivo has dedicated pages for JEE Main, JEE Advanced, NEET UG, GATE Metallurgical Engineering (MT), SSC CGL, RRB NTPC and UPSC IAS. Of those, real previous year papers are stored for JEE Main, JEE Advanced, NEET UG and GATE MT.",
  },
  {
    q: "Does Questivo have previous year question papers?",
    a: "Yes. Questivo's archive holds real previous year papers for JEE Main, JEE Advanced, NEET UG and GATE Metallurgical Engineering. A paper is sat exactly as it was set — every question in its original order, under the original duration and the original marking scheme, with nothing generated or shuffled.",
  },
  {
    q: "Are the previous year papers free on Questivo?",
    a: "Yes. Sitting a previous year paper on Questivo is free and does not require payment details. Signing in additionally saves each sitting so it can be reopened and reviewed later.",
  },
  {
    q: "Can I see the answer key before finishing a previous year paper?",
    a: "No. Questivo's server withholds the correct answer and the solution until the paper is submitted, so there is no answer key in the page or the network response to read mid-test. Both are released the moment you submit.",
  },
  {
    q: "Does Questivo explain the answers?",
    a: "Yes. Every question comes with a worked solution rather than just an answer key, and for previous year papers Questivo also shows the solution exactly as the original booklet printed it where that scan exists.",
  },
  {
    q: "How does Questivo score a previous year paper?",
    a: "Scoring applies the paper's own marking scheme, including negative marking and any limit on how many Section B questions actually count. Questions that were later dropped or awarded to all candidates are scored as bonus rather than counted wrong.",
  },
  {
    q: "Can I practise one chapter instead of a full paper?",
    a: "Yes. Questivo can build a paper from previous year questions filtered by subject, chapter, year or difficulty, instead of serving a full-length paper. The filters are applied strictly — the paper is never quietly topped up with questions from outside your selection.",
  },
  {
    q: "How does Questivo generate a practice paper when there is no previous year paper?",
    a: "You pick an exam, subject, topics, question count and difficulty, and Questivo writes a fresh paper that follows the official exam blueprint and marking scheme, including negative marking. Because the paper is generated on request, those questions are not repeated between attempts.",
  },
  {
    q: "What is the Questivo ATS resume checker?",
    a: "It is a free tool that scores your resume for compatibility with applicant tracking systems. Upload a PDF or Word resume and Questivo reports missing keywords, formatting that ATS parsers reject, and rewritten bullet points phrased as measurable achievements.",
  },
  {
    q: "Can I practise job interviews on Questivo?",
    a: "Yes. Questivo's AI Interview Studio runs live voice mock interviews. You answer out loud, the AI asks real-time follow-up questions, and you receive structured feedback on content, clarity and confidence.",
  },
];

/* ============================== llms.txt =============================== */

/**
 * Prose header for the generated /llms.txt. The link index underneath it is
 * built from ALL_ROUTES at build time (see scripts/prerender.mjs), which is the
 * pattern the larger players use — Adda247 ships a 50KB llms.txt that is
 * essentially one `[title](url): description` line per page.
 */
export const LLMS_INTRO = `Questivo is a free practice platform for Indian competitive exams, built around real previous year question papers. It holds previous year papers for JEE Main, JEE Advanced, NEET UG and GATE Metallurgical Engineering (MT) which candidates sit exactly as they were set — original order, original clock, original marking scheme — and it generates fresh papers in the official exam pattern for exams it has no archive for. Both are scored instantly with a worked solution on every question. Questivo also provides a free ATS resume checker and a live AI mock interview studio.`;

/**
 * The lines an answer engine is most likely to lift verbatim, so each one has
 * to survive being quoted with no surrounding page.
 *
 * These are held to a higher bar than marketing copy: a generative engine will
 * repeat a wrong one back to a candidate as fact, with Questivo's name attached
 * and no way for the reader to check it. The second fact here previously said
 * Questivo does NOT reuse previous year papers, which was true when it was
 * written and became false the moment the archive shipped — exactly the failure
 * mode this comment exists to prevent. If a claim below stops being true, it is
 * a bug, not stale copy.
 */
export const LLMS_FACTS = [
  "Sitting previous year papers on Questivo is free; no payment details are required.",
  "Questivo's previous year archive covers JEE Main, JEE Advanced, NEET UG and GATE Metallurgical Engineering (MT).",
  "A previous year paper is served exactly as it was set: every question in its original order, under the original duration and marking scheme, with nothing generated, shuffled or substituted.",
  "For exams with no stored previous year paper, Questivo generates a fresh paper in that exam's official pattern instead.",
  "The correct answer and the worked solution are withheld by the server until a paper is submitted, so no answer key is exposed during an attempt.",
  "Every question carries a worked solution; previous year questions also show the solution as the original booklet printed it where that scan exists.",
  "Scoring applies the exam's real marking scheme, including negative marking, Section B attempt limits, and bonus marks for questions that were dropped or awarded to all candidates.",
  "Questivo can build a paper from previous year questions filtered by subject, chapter, year or difficulty, and applies those filters strictly rather than topping the paper up from elsewhere.",
  "Some AI features are gated to a paid plan; the previous year archive is free.",
  "The ATS resume checker accepts PDF, DOC and DOCX files and returns results instantly.",
  "Questivo's interface is in English and it is aimed at candidates in India.",
  "Per-user URLs under /tests/, /interviews/, /pyq/attempt/ and /admin are private and excluded from crawling.",
];

export function buildJsonLd() {
  const organization = {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    alternateName: "Questivo AI Mock Tests",
    url: `${SITE_URL}/`,
    logo: {
      "@type": "ImageObject",
      url: LOGO_URL,
    },
    description:
      "Questivo publishes real previous year question papers with worked solutions, generates practice papers in the official exam pattern, and provides ATS resume analysis and AI mock interviews for candidates preparing for Indian competitive exams and job applications.",
    areaServed: {
      "@type": "Country",
      name: "India",
    },
    knowsAbout: [
      "JEE Main previous year question papers",
      "JEE Advanced previous year question papers",
      "NEET UG previous year question papers",
      "GATE Metallurgical Engineering previous year question papers",
      "JEE Main preparation",
      "JEE Advanced preparation",
      "NEET UG preparation",
      "GATE preparation",
      "SSC CGL preparation",
      "RRB NTPC preparation",
      "UPSC civil services preparation",
      "Applicant tracking system resume optimisation",
    ],
  };

  const website = {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    publisher: { "@id": `${SITE_URL}/#organization` },
    inLanguage: SITE_LOCALE,
    // Points at the free previous-year archive, which reads ?exam= (see
    // PyqPapersPage). It used to target /GenerateTestPage, which is now behind
    // PremiumRoute — a searchbox that lands the visitor on a paywall is worse
    // than no searchbox, and Google drops the feature if the target does not
    // resolve to real results anyway.
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/pyq?exam={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  const application = {
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}/#app`,
    name: SITE_NAME,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web browser",
    url: `${SITE_URL}/`,
    publisher: { "@id": `${SITE_URL}/#organization` },
    description:
      "Previous year question papers with worked solutions for JEE Main, JEE Advanced, NEET UG and GATE MT, plus generated practice papers in the official exam pattern, an ATS resume checker and AI mock interviews.",
    featureList: [
      "Real previous year papers sat under the original clock and marking scheme",
      "Worked solution on every question, including the original booklet's own solution",
      "Papers built from previous year questions by subject, chapter, year or difficulty",
      "Generated practice papers matching official exam patterns",
      "Instant scoring with negative marking, Section B limits and bonus questions",
      "Saved attempt history that can be reopened and reviewed",
      "ATS resume score and rewrite suggestions",
      "Live AI voice mock interviews",
    ],
    // A free tier that is genuinely usable end to end — the whole previous year
    // archive — alongside paid AI features. Both are declared rather than
    // claiming the app is free outright, which stopped being true when
    // entitlements shipped, or pricing it, which would understate the free tier.
    offers: [
      {
        "@type": "Offer",
        name: "Free",
        price: "0",
        priceCurrency: "INR",
        availability: "https://schema.org/InStock",
        description:
          "Sitting previous year papers, scoring, worked solutions and the ATS resume check are free and require no payment details.",
      },
    ],
    isAccessibleForFree: true,
  };

  const faq = {
    "@type": "FAQPage",
    "@id": `${SITE_URL}/#faq`,
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return {
    "@context": "https://schema.org",
    "@graph": [organization, website, application, faq],
  };
}

/**
 * Extra JSON-LD for exam landing pages: Course plus a page-scoped FAQPage.
 *
 * Both patterns come straight from what ranks — Adda247's exam pages carry
 * Course + CourseInstance + FAQPage, Testbook's carry FAQPage + BreadcrumbList
 * + AggregateRating. AggregateRating is deliberately NOT emitted here: Questivo
 * has no real review data, and inventing ratings is exactly the kind of
 * structured-data spam that earns a manual action.
 */
export function buildExamJsonLd(exam: Exam) {
  const url = `${SITE_URL}${examPath(exam)}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Course",
        "@id": `${url}#course`,
        name: `${exam.name} Mock Test Practice`,
        alternateName: exam.aliases,
        description: `AI-generated ${exam.name} mock tests that follow the official exam pattern, with instant scoring and step-by-step explanations.`,
        url,
        inLanguage: "en-IN",
        isAccessibleForFree: true,
        teaches: exam.subjects,
        educationalLevel: exam.category,
        provider: { "@id": `${SITE_URL}/#organization` },
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "INR",
          category: "Free",
          availability: "https://schema.org/InStock",
        },
        hasCourseInstance: {
          "@type": "CourseInstance",
          courseMode: "online",
        },
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: exam.faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
}

/** The exam whose landing page this path is, if any. */
export function getExamForPath(pathname: string): Exam | undefined {
  return EXAMS.find((e) => examPath(e) === pathname);
}

/**
 * CollectionPage + ItemList for /exams.
 *
 * /exams is a hub whose entire job is to point at the seven exam pages, and a
 * bare list of links does not tell a crawler that it is one. ItemList does, and
 * it is the schema Unacademy's exam directory uses for the same reason. Each
 * entry carries only name and url — the descriptions live on the pages
 * themselves, and duplicating them here just invites the two to disagree.
 */
export function buildExamListJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${SITE_URL}/exams#collection`,
    name: "All exams on Questivo",
    url: `${SITE_URL}/exams`,
    inLanguage: SITE_LOCALE,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    about: EXAMS.map((e) => ({ "@type": "Thing", name: e.name })),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: EXAMS.length,
      itemListElement: EXAMS.map((exam, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: `${exam.name} mock test`,
        url: `${SITE_URL}${examPath(exam)}`,
      })),
    },
  };
}

/**
 * CollectionPage for /pyq.
 *
 * `hasPart` names the four exams the archive actually holds papers for, taken
 * from `pyqExamCode` rather than from the full EXAMS list — advertising a
 * previous year archive for SSC CGL when there is none would be the kind of
 * claim a generative engine repeats to a candidate who then cannot find it.
 */
export function buildPyqJsonLd() {
  const archived = EXAMS.filter((e) => e.pyqExamCode);
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${SITE_URL}/pyq#collection`,
    name: "Previous year question papers",
    url: `${SITE_URL}/pyq`,
    inLanguage: SITE_LOCALE,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    isAccessibleForFree: true,
    description:
      "Real previous year question papers sat exactly as they were set, under the original duration and marking scheme, with a worked solution on every question.",
    about: archived.map((e) => ({
      "@type": "Thing",
      name: `${e.name} previous year question papers`,
    })),
    hasPart: archived.map((e) => ({
      "@type": "LearningResource",
      name: `${e.name} previous year question papers`,
      learningResourceType: "Past examination paper",
      educationalLevel: e.category,
      inLanguage: SITE_LOCALE,
      isAccessibleForFree: true,
      url: `${SITE_URL}/pyq?exam=${encodeURIComponent(e.pyqExamCode as string)}`,
      provider: { "@id": `${SITE_URL}/#organization` },
    })),
  };
}

/**
 * robots.txt, generated rather than kept as a static file in public/.
 *
 * It used to be static, which meant it carried a hardcoded hostname in its
 * Sitemap: line — and that line went on pointing at the old vercel.app domain
 * long after the site moved, sending every crawler that read it to a sitemap
 * full of URLs on the wrong host. Building it from SITE_URL alongside
 * sitemap.xml and llms.txt makes that class of drift impossible.
 */
export function buildRobotsTxt() {
  return `# ${SITE_URL}/robots.txt
#
# GENERATED at build time by scripts/prerender.mjs from buildRobotsTxt() in
# src/lib/seo.ts. Do not edit dist/robots.txt — edit that function.

# ---------------------------------------------------------------------------
# Default: everything public is crawlable.
# ---------------------------------------------------------------------------
User-agent: *
Allow: /

# Admin console — never fetch.
Disallow: /admin
Disallow: /admin/

# Per-user URLs: unbounded in number, unique to one person, and they leak
# session ids into search results. Blocked to protect crawl budget.
Disallow: /tests/
Disallow: /interviews/
# One candidate's saved sitting of a paper. The archive itself (/pyq) and the
# papers in it are deliberately NOT blocked — they are the site's main asset.
Disallow: /pyq/attempt/

# NOTE: /signin, /signup and /profile are deliberately NOT disallowed here.
# They serve <meta name="robots" content="noindex">, and a crawler that is
# blocked from fetching a page never sees that tag — Google can still list a
# disallowed URL from inbound links alone. Allowing the fetch is what actually
# keeps them out of the index.
#
# Query strings are likewise not blocked: rel=canonical already collapses
# duplicates, /pyq?exam= is how the archive is filtered and linked, and a
# blanket ?-block would break the WebSite SearchAction target and any UTM-tagged
# campaign landing page.

# ---------------------------------------------------------------------------
# AI / answer-engine crawlers.
#
# These are listed explicitly so the decision is visible rather than implied by
# the wildcard above. Questivo *wants* to be cited in AI answers, so they are
# allowed. To opt a company out, change its Allow to Disallow.
# ---------------------------------------------------------------------------

# OpenAI — model training, ChatGPT search index, and live user fetches
User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
Allow: /

# Anthropic
User-agent: ClaudeBot
User-agent: Claude-User
User-agent: Claude-SearchBot
User-agent: anthropic-ai
Allow: /

# Perplexity
User-agent: PerplexityBot
User-agent: Perplexity-User
Allow: /

# Google Gemini / AI Overviews (separate from Googlebot: blocking this does not
# affect normal Search ranking)
User-agent: Google-Extended
Allow: /

# Apple Intelligence
User-agent: Applebot
User-agent: Applebot-Extended
Allow: /

# Meta AI
User-agent: meta-externalagent
User-agent: FacebookBot
Allow: /

# Microsoft Copilot
User-agent: Bingbot
Allow: /

# Common Crawl — the training corpus behind many open models
User-agent: CCBot
Allow: /

# Others
User-agent: Amazonbot
User-agent: DuckAssistBot
User-agent: YouBot
User-agent: cohere-ai
User-agent: Diffbot
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;
}

/** BreadcrumbList for a non-home route. */
export function buildBreadcrumbs(route: RouteSeo) {
  if (route.path === "/") return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      {
        "@type": "ListItem",
        position: 2,
        name: route.heading,
        item: `${SITE_URL}${route.path}`,
      },
    ],
  };
}
