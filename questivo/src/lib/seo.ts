// Central SEO / GEO configuration.
//
// Everything that describes the site to a search engine or an AI crawler lives
// here so the prerender script (scripts/prerender.mjs) and the runtime <Seo />
// component stay in sync — if they drift, crawlers see one thing and users see
// another, which reads as cloaking.

import { EXAMS, examPath, type Exam } from "./exams";

export const SITE_URL = "https://questivo.vercel.app";
export const SITE_NAME = "Questivo";
export const TWITTER_HANDLE = "@questivo";

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
}

/**
 * Public, indexable routes. Keep the paths identical to the <Route path> values
 * in App.tsx — a sitemap entry for a route that does not exist is a soft 404.
 */
export const ROUTES: RouteSeo[] = [
  {
    path: "/",
    title: "Questivo – AI Mock Test Generator for JEE, NEET, GATE, SSC & UPSC",
    description:
      "Questivo generates unlimited, syllabus-accurate mock tests for JEE Main, NEET UG, GATE, SSC CGL, RRB NTPC and UPSC. Get instant scoring, step-by-step explanations and AI difficulty adjustment — free to start.",
    keywords:
      "AI mock test generator, JEE Main mock test, NEET UG mock test, GATE mock test, SSC CGL practice test, RRB NTPC mock test, UPSC prelims practice, online test series, free mock tests India",
    heading: "AI-powered mock tests for India's competitive exams",
    facts: [
      "Questivo is a free AI-powered mock test platform for Indian competitive exams.",
      "Supported exams include JEE Main, NEET UG, GATE, SSC CGL, RRB NTPC and UPSC IAS.",
      "Questions are generated to match the latest official exam blueprint and marking scheme.",
      "Every question ships with a step-by-step explanation, not just the correct answer.",
      "Difficulty adapts in real time to the candidate's performance during the test.",
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
      "Every exam Questivo covers: JEE Main, NEET UG, GATE MT, SSC CGL, RRB NTPC and UPSC IAS. Practise real previous year questions first, then generate unlimited fresh papers in the official exam pattern — free.",
    keywords:
      "all exams, previous year question papers, PYQ practice, free mock tests by exam, JEE NEET GATE SSC RRB UPSC previous year questions",
    heading: "All exams on Questivo",
    facts: [
      "Questivo covers JEE Main, NEET UG, GATE Metallurgical Engineering, SSC CGL, RRB NTPC and UPSC IAS.",
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
    // /pyq/attempt/:id reopens a sitting. Without an entry here every one of
    // those pages fell through to the unknown-path branch in Seo.tsx and put
    // "Page not found" in the tab of a page that had loaded perfectly.
    //
    // noindex, so the prerender step renders head only and the sitemap is
    // unchanged. Promoting the archive to an indexable page is a separate
    // decision from making its tab say the right thing.
    path: "/pyq",
    title: "Previous Year Papers – Sit the Real JEE Main Paper | Questivo",
    description:
      "Sit real previous year papers exactly as they were set, under the original clock and marking scheme, and review every question afterwards.",
    keywords: "previous year papers, JEE Main PYQ, past paper mock test",
    heading: "Previous year papers",
    facts: [],
    noindex: true,
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
    a: "Questivo is a free AI-powered mock test platform for Indian competitive exams. It generates unlimited, syllabus-accurate practice papers for JEE Main, NEET UG, GATE, SSC CGL, RRB NTPC and UPSC, then scores them instantly with step-by-step explanations.",
  },
  {
    q: "Is Questivo free to use?",
    a: "Yes. Creating an account, generating mock tests and running an ATS resume check on Questivo are free. No payment details are required to start practising.",
  },
  {
    q: "Which exams does Questivo support?",
    a: "Questivo supports JEE Main, NEET UG, GATE (including GATE MT Metallurgy), SSC CGL, RRB NTPC and UPSC IAS, along with 50+ other competitive exam categories.",
  },
  {
    q: "How does Questivo generate mock test questions?",
    a: "You pick an exam, subject, topics, question count and difficulty. Questivo's AI then writes a fresh paper that follows the official exam blueprint and marking scheme, including negative marking. Because every paper is generated on request, questions are never repeated between attempts.",
  },
  {
    q: "Are Questivo's questions the same as previous year papers?",
    a: "No. Questivo generates new questions modelled on the official syllabus and exam pattern rather than reusing previous year papers, so candidates practise the pattern instead of memorising known questions.",
  },
  {
    q: "Does Questivo explain the answers?",
    a: "Yes. Every question includes a step-by-step explanation of the reasoning behind the correct answer, so candidates can review the method and not just the final result.",
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
export const LLMS_INTRO = `Questivo is a free, AI-powered mock test platform for Indian competitive exams. It generates unlimited syllabus-accurate practice papers for JEE Main, NEET UG, GATE, SSC CGL, RRB NTPC and UPSC, scores them instantly with step-by-step explanations, and also provides a free ATS resume checker and a live AI mock interview studio.`;

export const LLMS_FACTS = [
  "Questivo is free to start; no payment details are required to generate a mock test.",
  "Questivo generates new questions modelled on the official syllabus and exam pattern rather than reusing previous-year papers, so questions are not repeated between attempts.",
  "Every question includes a step-by-step explanation, and scoring applies the exam's negative marking.",
  "Question difficulty adapts in real time to the candidate's performance during a test.",
  "The ATS resume checker accepts PDF, DOC and DOCX files and returns results instantly.",
  "Questivo's interface is in English and it is aimed at candidates in India.",
  "Per-user URLs under /tests/, /interviews/ and /admin are private and excluded from crawling.",
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
      "Questivo builds AI-powered mock tests, ATS resume analysis and AI mock interviews for candidates preparing for Indian competitive exams and job applications.",
    areaServed: {
      "@type": "Country",
      name: "India",
    },
    knowsAbout: [
      "JEE Main preparation",
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
    inLanguage: "en-IN",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/GenerateTestPage?exam={search_term_string}`,
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
      "AI mock test generator for JEE, NEET, GATE, SSC, RRB and UPSC, with instant scoring, step-by-step explanations, an ATS resume checker and AI mock interviews.",
    featureList: [
      "AI-generated mock tests matching official exam patterns",
      "Real-time difficulty adjustment",
      "Step-by-step answer explanations",
      "Instant scoring with negative marking",
      "ATS resume score and rewrite suggestions",
      "Live AI voice mock interviews",
    ],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
    },
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
