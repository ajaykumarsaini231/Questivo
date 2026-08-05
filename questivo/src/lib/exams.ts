// Per-exam landing page content.
//
// Why this file exists: a competitor audit of the ten sites that rank for
// Questivo's target keywords (Testbook, Adda247, Unacademy, Embibe, Oliveboard,
// PhysicsWallah, Vedantu, BYJU'S, Doubtnut/Allen, PracticeMock) found that the
// homepage is nobody's ranking asset. The traffic sits on per-exam pages:
// Testbook's /ssc-cgl-exam alone runs 8,776 words, 17 tables, 745 internal
// links and 50 headings — 19 of them phrased as questions — with FAQPage,
// BreadcrumbList, Course and AggregateRating schema. Questivo had zero such
// pages; its six featured exams were buttons, not documents.
//
// IMPORTANT — accuracy policy:
// Everything below describes what *Questivo* does for a given exam, which is
// verifiable from this codebase. It deliberately contains NO exam dates,
// vacancy counts, cut-offs, syllabus weightings or marking-scheme numbers.
// Those change every cycle, competitors employ editorial teams to maintain
// them, and publishing a wrong one is worse than publishing nothing. Add them
// via `officialFacts` below only from a verified source.

export interface ExamFaq {
  q: string;
  a: string;
}

export interface Exam {
  /** URL segment: /mock-test/<slug> */
  slug: string;
  /** Display name, used in headings and <title>. */
  name: string;
  /** Exam code passed through to the test generator. */
  code: string;
  /**
   * The code the PYQ archive files this exam under — PreviousYearQuestion
   * .examCode, and what /api/pyq/* returns.
   *
   * Separate from `code` above, which carries a year ("NTA_JEE_MAIN_2025",
   * "NEET_2025") because the generator uses it as a syllabus key. The archive's
   * codes are year-free, so the two cannot be the same string, and matching
   * them by fuzzy string comparison is how a JEE candidate ends up being shown
   * GATE papers. Stated explicitly instead.
   *
   * Absent for exams the archive holds nothing for.
   */
  pyqExamCode?: string;
  category: string;
  /** Short label for cards and breadcrumbs. */
  shortName: string;
  /** Alternative names people search for. Feeds keywords + Course alternateName. */
  aliases: string[];
  /** One-sentence definition. Written to be quotable on its own. */
  summary: string;
  /** Who the exam is for — plain, non-time-sensitive. */
  audience: string;
  /** Subject areas Questivo can generate questions across. */
  subjects: string[];
  /** Why timed practice helps for this specific exam. */
  whyPractice: string;
  /** Exam-specific error patterns. Keeps each landing page genuinely
   *  distinct rather than one template repeated six times. */
  commonMistakes: string[];
  /** Exam-specific FAQs. All answers are about Questivo's product. */
  faqs: ExamFaq[];
  /**
   * Verified, sourced facts about the official exam (dates, vacancies, pattern).
   * Intentionally empty — fill only from an official notification, and add the
   * source URL in `officialSource`.
   */
  officialFacts?: string[];
  officialSource?: string;
}

export const EXAMS: Exam[] = [
  {
    slug: "jee-main",
    name: "JEE Main",
    shortName: "JEE Main",
    code: "NTA_JEE_MAIN_2025",
    pyqExamCode: "JEE_MAIN",
    category: "Engineering",
    aliases: ["NTA JEE Main", "JEE Mains", "Joint Entrance Examination Main"],
    summary:
      "JEE Main is the national engineering entrance examination conducted by the National Testing Agency (NTA) for admission to undergraduate engineering programmes in India.",
    audience:
      "Class 11 and 12 students and droppers targeting NITs, IIITs, centrally funded technical institutions, and qualification for JEE Advanced.",
    subjects: ["Physics", "Chemistry", "Mathematics"],
    whyPractice:
      "JEE Main rewards speed as much as accuracy: the difference between a good and a great percentile is usually how many questions you attempt confidently, not how much you know. Repeated full-length practice under a clock is the only way to build that. Because Questivo generates a new paper every time, you cannot accidentally memorise a question set and mistake recall for mastery.",
    commonMistakes: [
      "Treating JEE Main like JEE Advanced. Main rewards clean execution on standard questions far more than it rewards cracking one hard problem, so time spent chasing difficulty often costs more marks than it gains.",
      "Skipping numerical-value questions early in the paper and then running out of time before coming back to them.",
      "Neglecting Chemistry. It is typically the most scoring of the three subjects per hour invested, and candidates who over-rotate on Physics and Maths leave easy marks behind.",
      "Reviewing only the questions you got wrong. A question you guessed correctly is a future mistake that has not happened yet.",
    ],
    faqs: [
      {
        q: "Are Questivo's JEE Main mock tests free?",
        a: "Yes. Generating and attempting JEE Main mock tests on Questivo is free, and no payment details are required to start.",
      },
      {
        q: "How many JEE Main mock tests can I take on Questivo?",
        a: "There is no fixed limit. Questivo generates a new JEE Main paper on each request rather than serving from a fixed bank, so you can keep practising with fresh questions.",
      },
      {
        q: "Can I practise only Physics, Chemistry or Mathematics?",
        a: "Yes. You can restrict a Questivo mock test to a single subject, or to specific chapters within it, instead of taking a full-length paper.",
      },
      {
        q: "Does Questivo explain the solutions to JEE Main questions?",
        a: "Yes. Every question in a Questivo JEE Main mock test comes with a step-by-step explanation of the reasoning, so you can review the method rather than just the answer key.",
      },
    ],
  },
  {
    // Kept as its own exam rather than folded into JEE Main. They share a
    // syllabus and nothing else: Advanced uses multiple-correct options,
    // matching lists and integer answers, and changes its marking scheme
    // between years. src/lib/pyqPattern.js draws the same line server-side —
    // an Advanced candidate served Main history would be practising the wrong
    // paper. No pattern table is declared for it below for the same reason:
    // the scheme moves year to year and this file does not publish numbers it
    // cannot stand behind.
    slug: "jee-advanced",
    name: "JEE Advanced",
    shortName: "JEE Advanced",
    code: "JEE_ADVANCED",
    pyqExamCode: "JEE_ADVANCED",
    category: "Engineering",
    aliases: ["IIT JEE", "JEE Advanced exam", "Joint Entrance Examination Advanced"],
    summary:
      "JEE Advanced is the entrance examination for admission to the Indian Institutes of Technology, conducted each year by one of the zonal IITs under the Joint Admission Board, and taken by candidates who have first qualified through JEE Main.",
    audience:
      "Candidates who have qualified JEE Main and are targeting admission to the IITs.",
    subjects: ["Physics", "Chemistry", "Mathematics"],
    whyPractice:
      "JEE Advanced does not reward recall. Its questions combine several ideas at once and deliberately vary their format between years, so the skill being tested is reading an unfamiliar problem and deciding how to start. That only develops by attempting hard problems and reviewing the approach afterwards, which is why previous year papers matter more here than for any other exam on this site.",
    commonMistakes: [
      "Preparing for it as though it were JEE Main. Main rewards clean execution on standard questions; Advanced rewards working out where to begin on a problem you have not seen before.",
      "Ignoring the question type. Multiple-correct questions carry partial credit and negative marking together, so a half-remembered option is far more expensive than it looks.",
      "Assuming the marking scheme is fixed. It has changed between years, and strategies built around one year's rules can cost marks under another's.",
      "Practising only the questions you can already start. The ones you stall on are the entire point of the paper.",
    ],
    faqs: [
      {
        q: "Are Questivo's JEE Advanced practice questions free?",
        a: "Yes. Previous year JEE Advanced questions on Questivo are free to browse and attempt, and no payment details are required.",
      },
      {
        q: "Where do Questivo's JEE Advanced previous year questions come from?",
        a: "They come from an openly licensed dataset, and every question stores the source it was imported from, which is shown alongside it on the question card.",
      },
      {
        q: "Can I practise JEE Advanced Physics, Chemistry or Mathematics separately?",
        a: "Yes. Previous year questions can be filtered by subject and by year, and a generated practice paper can be restricted to a single subject or topic.",
      },
      {
        q: "Is JEE Advanced the same paper as JEE Main?",
        a: "No. They share a syllabus but differ in difficulty, question formats and marking. Questivo keeps their question banks separate, so JEE Advanced practice never draws on JEE Main questions.",
      },
    ],
  },
  {
    slug: "neet-ug",
    name: "NEET UG",
    shortName: "NEET UG",
    code: "NEET_2025",
    pyqExamCode: "NEET",
    category: "Medical",
    aliases: ["NEET", "National Eligibility cum Entrance Test", "NEET Undergraduate"],
    summary:
      "NEET UG is the national entrance examination for admission to undergraduate medical, dental and allied health courses in India, conducted by the National Testing Agency.",
    audience:
      "Class 11 and 12 students and repeaters aiming for MBBS, BDS, AYUSH and allied health programmes.",
    subjects: ["Physics", "Chemistry", "Biology (Botany & Zoology)"],
    whyPractice:
      "NEET is a high-volume, high-accuracy paper where a single careless negative mark can move you thousands of ranks. That makes deliberate practice on question interpretation — not just content revision — the highest-return activity. Questivo's per-question explanations are aimed squarely at the mistakes you repeat without noticing.",
    commonMistakes: [
      "Over-attempting. With negative marking and a very large candidate pool, ten confident answers beat fifteen half-sure ones almost every time.",
      "Studying Biology by reading rather than by answering. NEET Biology leans heavily on recall and on discriminating between close options, which only sharpens through question practice.",
      "Letting Physics slide. It is the section that most often separates candidates with similar Biology scores.",
      "Not tracking which chapters your errors cluster in. Without that record, revision defaults to whatever feels comfortable.",
    ],
    faqs: [
      {
        q: "Are Questivo's NEET mock tests free?",
        a: "Yes. NEET UG mock tests on Questivo are free to generate and attempt, with no payment details required.",
      },
      {
        q: "Can I take a Biology-only NEET mock test?",
        a: "Yes. You can generate a mock test limited to Biology, or to specific Botany or Zoology chapters, instead of a full-length NEET paper.",
      },
      {
        q: "Does Questivo apply NEET's negative marking?",
        a: "Yes. Questivo scores mock tests using the exam's marking scheme, including negative marking, so your practice score is comparable to a real attempt.",
      },
      {
        q: "Are the questions repeated from previous year NEET papers?",
        a: "No. Questivo generates new questions modelled on the syllabus and exam pattern rather than reusing previous year papers, so you practise the pattern instead of memorising known items.",
      },
    ],
  },
  {
    slug: "gate-metallurgy",
    name: "GATE Metallurgical Engineering (MT)",
    shortName: "GATE MT",
    code: "GATE_MT",
    pyqExamCode: "GATE_MT",
    category: "Graduate",
    aliases: ["GATE MT", "GATE Metallurgy", "Graduate Aptitude Test in Engineering Metallurgical"],
    summary:
      "GATE Metallurgical Engineering (paper code MT) is one of the subject papers of the Graduate Aptitude Test in Engineering, used for postgraduate admissions and PSU recruitment in India.",
    audience:
      "Final-year and graduate metallurgical engineering students targeting M.Tech admission, research positions, or PSU recruitment through GATE.",
    subjects: [
      "Thermodynamics and Rate Processes",
      "Extractive Metallurgy",
      "Physical Metallurgy",
      "Mechanical Metallurgy",
      "Manufacturing Processes",
      "Engineering Mathematics",
      "General Aptitude",
    ],
    whyPractice:
      "GATE MT is a narrow-syllabus, deep-difficulty paper, and good study material for it is far scarcer than for JEE or NEET. That scarcity is exactly where an AI generator helps: instead of re-attempting the same handful of available papers until you have memorised them, you can produce unlimited fresh questions on a specific topic such as phase transformations or extractive routes.",
    commonMistakes: [
      "Practising only the handful of published GATE MT papers until the answers are memorised, which inflates scores without improving understanding.",
      "Underweighting General Aptitude and Engineering Mathematics, which are comparatively accessible marks.",
      "Studying phase diagrams and transformation kinetics passively. These reward worked problems far more than reading.",
      "Ignoring unit consistency in thermodynamics and rate-process questions, a frequent source of otherwise avoidable errors.",
    ],
    faqs: [
      {
        q: "Why is GATE MT practice material hard to find?",
        a: "GATE Metallurgical Engineering has a much smaller candidate pool than papers like Computer Science or Mechanical, so fewer publishers produce dedicated test series for it. Questivo generates papers on demand, which removes the dependence on a limited published question bank.",
      },
      {
        q: "Can I generate a GATE MT test on one topic only?",
        a: "Yes. You can restrict a test to a single area such as physical metallurgy, thermodynamics or mechanical metallurgy, and set the number of questions and difficulty.",
      },
      {
        q: "Does Questivo cover General Aptitude and Engineering Mathematics for GATE?",
        a: "Yes. Both General Aptitude and Engineering Mathematics can be included in a generated GATE MT paper, or practised separately.",
      },
    ],
  },
  {
    slug: "ssc-cgl",
    name: "SSC CGL",
    shortName: "SSC CGL",
    code: "SSC_CGL_2024",
    category: "Government",
    aliases: ["SSC Combined Graduate Level", "Staff Selection Commission CGL"],
    summary:
      "SSC CGL is the Combined Graduate Level examination conducted by the Staff Selection Commission to recruit graduates into Group B and Group C posts across Indian government departments.",
    audience:
      "Graduates seeking central government posts such as Assistant Section Officer, Inspector, Auditor and Tax Assistant.",
    subjects: [
      "Quantitative Aptitude",
      "General Intelligence & Reasoning",
      "English Comprehension",
      "General Awareness",
    ],
    whyPractice:
      "SSC CGL is won on speed. The syllabus is not conceptually hard, but the sectional time pressure is brutal, and candidates who know the material still lose marks to slow arithmetic and second-guessing. Volume practice against a clock is the entire game, which is why an unlimited generator matters more here than a fixed set of twenty papers.",
    commonMistakes: [
      "Practising Quantitative Aptitude without a clock. The content is not conceptually hard; finishing in the time available is the entire difficulty.",
      "Not building calculation shortcuts. Candidates who compute everything longhand lose the paper on arithmetic speed alone.",
      "Treating General Awareness as unlearnable and skipping it, when it is the fastest section to answer and needs the least time per mark.",
      "Attempting sections in whatever order they appear rather than deciding an order in advance and practising it.",
    ],
    faqs: [
      {
        q: "Are Questivo's SSC CGL mock tests free?",
        a: "Yes. SSC CGL mock tests on Questivo are free to generate and attempt.",
      },
      {
        q: "Can I practise only Quantitative Aptitude or Reasoning?",
        a: "Yes. You can generate a sectional test covering only Quantitative Aptitude, Reasoning, English or General Awareness, and choose how many questions it contains.",
      },
      {
        q: "How is a Questivo SSC CGL mock test scored?",
        a: "Tests are scored instantly using the exam's marking scheme, including negative marking, and you get a per-question breakdown showing which items you got wrong and why.",
      },
      {
        q: "Can I increase the difficulty as I improve?",
        a: "Yes. You can set the difficulty when generating a paper, and Questivo also adjusts question difficulty in real time based on how you are performing during a test.",
      },
    ],
  },
  {
    slug: "rrb-ntpc",
    name: "RRB NTPC (Graduate)",
    shortName: "RRB NTPC",
    code: "RRB_NTPC_GRAD_06_2025",
    category: "Railways",
    aliases: ["RRB NTPC", "Railway NTPC", "Non-Technical Popular Categories"],
    summary:
      "RRB NTPC is the Non-Technical Popular Categories examination conducted by the Railway Recruitment Boards to fill graduate and undergraduate level non-technical posts in Indian Railways.",
    audience:
      "Graduates applying for Indian Railways posts such as Station Master, Goods Guard, Senior Clerk and Commercial Apprentice.",
    subjects: ["Mathematics", "General Intelligence & Reasoning", "General Awareness"],
    whyPractice:
      "RRB NTPC draws an enormous applicant pool for a small number of posts, so the qualifying margin is decided by a handful of marks. General Awareness in particular rewards broad repeated exposure rather than deep study, and that is best built through many short, varied practice sets instead of a few long ones.",
    commonMistakes: [
      "Preparing only for the first stage and losing the gap between stages because the next one was never started.",
      "Treating General Awareness as one subject. It spans current affairs, static general knowledge and basic science, and each needs a different revision rhythm.",
      "Practising only full-length papers. Short, frequent sets build the recall speed this exam actually tests.",
      "Planning a preparation timeline around the written stages alone and ignoring the qualifying stages that follow.",
    ],
    faqs: [
      {
        q: "Are Questivo's RRB NTPC mock tests free?",
        a: "Yes. RRB NTPC mock tests on Questivo are free to generate and attempt.",
      },
      {
        q: "Can I generate short RRB NTPC practice sets?",
        a: "Yes. You choose the number of questions when generating a test, so you can run short focused sets rather than only full-length papers.",
      },
      {
        q: "Does Questivo cover General Awareness for RRB NTPC?",
        a: "Yes. General Awareness can be generated on its own or as part of a full RRB NTPC paper, with an explanation attached to each question.",
      },
    ],
  },
  {
    slug: "upsc-ias",
    name: "UPSC Civil Services (IAS)",
    shortName: "UPSC IAS",
    code: "UPSC_IAS_IFS_2024",
    category: "Civil Services",
    aliases: ["UPSC IAS", "UPSC CSE", "Civil Services Examination", "IAS exam"],
    summary:
      "The UPSC Civil Services Examination is the national examination conducted by the Union Public Service Commission to recruit officers into the Indian Administrative Service, Indian Foreign Service, Indian Police Service and other central services.",
    audience:
      "Graduates preparing for the IAS, IPS, IFS and allied central civil services.",
    subjects: [
      "General Studies",
      "Current Affairs",
      "Indian Polity",
      "Geography",
      "History",
      "Economy",
      "Environment & Ecology",
      "CSAT / Aptitude",
    ],
    whyPractice:
      "The UPSC Prelims paper is an elimination filter, and it is famously won by candidates who are good at intelligent guessing and ruthless elimination — skills that only develop by attempting large volumes of multiple-choice questions and reviewing the reasoning afterwards. Reading more material does not build them; answering does.",
    commonMistakes: [
      "Reading endlessly without attempting questions. Prelims tests elimination and calibrated guessing, and neither develops from reading alone.",
      "Blanket-skipping every uncertain question. Attempting one where you can confidently eliminate two options is usually worth it even under negative marking.",
      "Neglecting CSAT because it is only qualifying. Candidates fail on it every year despite strong General Studies scores.",
      "Chasing current affairs across many sources instead of revising one source repeatedly.",
    ],
    faqs: [
      {
        q: "Can Questivo help with UPSC Prelims practice?",
        a: "Yes. Questivo generates multiple-choice practice papers across General Studies areas such as polity, geography, history, economy and environment, scores them instantly, and explains the reasoning behind each answer.",
      },
      {
        q: "Can I practise a single UPSC subject like Polity?",
        a: "Yes. You can restrict a generated paper to one subject area, set the question count and choose the difficulty level.",
      },
      {
        q: "Does Questivo cover the UPSC Mains descriptive papers?",
        a: "No. Questivo generates objective, multiple-choice practice, which maps to the Prelims stage and to CSAT. It does not evaluate descriptive Mains answers.",
      },
    ],
  },
];

export function getExam(slug: string | undefined): Exam | undefined {
  return EXAMS.find((e) => e.slug === slug);
}

export const examPath = (e: Exam) => `/mock-test/${e.slug}`;
