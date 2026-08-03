// Per-exam paper structure.
//
// Drives two things:
//   1. the generation prompt, so a JEE Advanced paper actually reads like JEE
//      Advanced (multiple-correct, integer answers, partial marking) rather
//      than like a generic MCQ set;
//   2. the marking metadata returned with a generated test, so scoring matches
//      the real exam.
//
// ─────────────────────────────────────────────────────────────────────────
// ACCURACY STATUS
//
// `verified: true`  — transcribed from the conducting body's own current
//                     Information Bulletin, parsed from the PDF on the date in
//                     `checkedOn`. Safe to publish.
// `verified: false` — plausible working default, NOT checked against a
//                     notification. Do not present as authoritative.
//
// Verified on 2026-08-03 from primary sources:
//   JEE Main — NTA Information Bulletin 2026, §2.4 "Pattern of Examination".
//              Confirmed: 20 MCQ + 5 numerical per subject, 75 Q / 300 marks,
//              +4/-1 on BOTH sections (Section B is no longer optional and now
//              carries negative marking).
//   NEET UG  — NTA Information Bulletin NEET (UG) 2026, §2 "Pattern of the
//              Test" and §3. Confirmed: 180 compulsory questions / 720 marks
//              in 180 minutes, +4/-1/0.
//              This corrected a real error here: the duration was 200 minutes,
//              which was the older optional-question format. It is 180 now.
//
// Conducting bodies change these between cycles. Re-check before each season.
// ─────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Section
 * @property {string} name
 * @property {string[]} subjects
 * @property {number} questions        how many questions in this section
 * @property {string} type             mcq_single | mcq_multiple | numerical | integer | mixed
 * @property {number} marksCorrect
 * @property {number} marksIncorrect   negative; 0 when there is no penalty
 * @property {string} [note]
 */

const EXAM_PATTERNS = {
  JEE_MAIN: {
    label: "JEE Main",
    conductedBy: "National Testing Agency (NTA)",
    durationMinutes: 180,
    totalQuestions: 75,
    totalMarks: 300,
    sourceUrl: "https://jeemain.nta.nic.in/",
    verified: true,
    checkedOn: "2026-08-03",
    syllabusKey: "JEE_MAIN",
    sections: [
      {
        name: "Physics – Section A",
        subjects: ["Physics"],
        questions: 20,
        type: "mcq_single",
        marksCorrect: 4,
        marksIncorrect: -1,
      },
      {
        name: "Physics – Section B",
        subjects: ["Physics"],
        questions: 5,
        type: "numerical",
        marksCorrect: 4,
        marksIncorrect: -1,
        note: "Numerical value answers, no options.",
      },
      {
        name: "Chemistry – Section A",
        subjects: ["Chemistry"],
        questions: 20,
        type: "mcq_single",
        marksCorrect: 4,
        marksIncorrect: -1,
      },
      {
        name: "Chemistry – Section B",
        subjects: ["Chemistry"],
        questions: 5,
        type: "numerical",
        marksCorrect: 4,
        marksIncorrect: -1,
      },
      {
        name: "Mathematics – Section A",
        subjects: ["Mathematics"],
        questions: 20,
        type: "mcq_single",
        marksCorrect: 4,
        marksIncorrect: -1,
      },
      {
        name: "Mathematics – Section B",
        subjects: ["Mathematics"],
        questions: 5,
        type: "numerical",
        marksCorrect: 4,
        marksIncorrect: -1,
      },
    ],
    styleNotes: [
      "Single-concept to two-step problems. Speed matters more than depth.",
      "Formula-application heavy; avoid multi-page derivations.",
      "Section B answers must be a single numerical value, rounded to the nearest integer where applicable.",
    ],
  },

  JEE_ADVANCED: {
    label: "JEE Advanced",
    conductedBy: "IIT (rotating zonal IIT)",
    durationMinutes: 180,
    totalQuestions: 51,
    totalMarks: 180,
    sourceUrl: "https://jeeadv.ac.in/",
    verified: false,
    note: "Paper 1 approximation. JEE Advanced deliberately varies its pattern year to year — treat this as a template, not a guarantee.",
    sections: [
      {
        name: "Multiple Correct Options",
        subjects: ["Physics", "Chemistry", "Mathematics"],
        questions: 12,
        type: "mcq_multiple",
        marksCorrect: 4,
        marksIncorrect: -2,
        note: "One or more options correct. Partial credit for selecting some but not all correct options, provided no incorrect option is chosen.",
      },
      {
        name: "Integer / Non-negative Numerical",
        subjects: ["Physics", "Chemistry", "Mathematics"],
        questions: 18,
        type: "integer",
        marksCorrect: 4,
        marksIncorrect: 0,
      },
      {
        name: "Paragraph / Comprehension",
        subjects: ["Physics", "Chemistry", "Mathematics"],
        questions: 12,
        type: "mcq_single",
        marksCorrect: 3,
        marksIncorrect: -1,
        note: "Two or more questions sharing a common passage.",
      },
      {
        name: "Matching / Matrix Match",
        subjects: ["Physics", "Chemistry", "Mathematics"],
        questions: 9,
        type: "mcq_single",
        marksCorrect: 3,
        marksIncorrect: -1,
      },
    ],
    styleNotes: [
      "Multi-concept problems that chain two or three ideas across topics.",
      "Expect questions where more than one option is correct — do not default to exactly one.",
      "Answers are rarely round numbers; distractors should be results of plausible mistakes, not random values.",
      "Comprehension sets share one stem across several questions.",
    ],
  },

  NEET: {
    label: "NEET UG",
    conductedBy: "National Testing Agency (NTA)",
    // 180, not 200: the 200-minute paper was the optional-question format that
    // NTA has since dropped. Confirmed in the 2026 bulletin.
    durationMinutes: 180,
    totalQuestions: 180,
    totalMarks: 720,
    sourceUrl: "https://neet.nta.nic.in/",
    verified: true,
    checkedOn: "2026-08-03",
    syllabusKey: "NEET",
    sections: [
      {
        name: "Physics",
        subjects: ["Physics"],
        questions: 45,
        type: "mcq_single",
        marksCorrect: 4,
        marksIncorrect: -1,
      },
      {
        name: "Chemistry",
        subjects: ["Chemistry"],
        questions: 45,
        type: "mcq_single",
        marksCorrect: 4,
        marksIncorrect: -1,
      },
      {
        name: "Botany",
        subjects: ["Biology"],
        questions: 45,
        type: "mcq_single",
        marksCorrect: 4,
        marksIncorrect: -1,
      },
      {
        name: "Zoology",
        subjects: ["Biology"],
        questions: 45,
        type: "mcq_single",
        marksCorrect: 4,
        marksIncorrect: -1,
      },
    ],
    styleNotes: [
      "Strictly NCERT-aligned. Do not test beyond the NCERT Class 11–12 syllabus.",
      "Biology is recall-and-discriminate: distractors should be closely related terms, not obviously wrong ones.",
      "Assertion–Reason and statement-based (‘which of the following statements is correct’) formats are common.",
      "Questions are short. A candidate has roughly one minute per question.",
    ],
  },

  GATE: {
    label: "GATE",
    conductedBy: "IISc / IITs",
    durationMinutes: 180,
    totalQuestions: 65,
    totalMarks: 100,
    sourceUrl: "https://gate.iitk.ac.in/",
    verified: false,
    sections: [
      {
        name: "General Aptitude",
        subjects: ["General Aptitude"],
        questions: 10,
        type: "mcq_single",
        marksCorrect: 1,
        marksIncorrect: -0.33,
        note: "5 questions at 1 mark, 5 at 2 marks in the real paper.",
      },
      {
        name: "Core Subject – MCQ",
        subjects: ["Core"],
        questions: 30,
        type: "mcq_single",
        marksCorrect: 1,
        marksIncorrect: -0.33,
      },
      {
        name: "Core Subject – MSQ",
        subjects: ["Core"],
        questions: 10,
        type: "mcq_multiple",
        marksCorrect: 2,
        marksIncorrect: 0,
        note: "Multiple Select Questions carry no negative marking.",
      },
      {
        name: "Core Subject – NAT",
        subjects: ["Core"],
        questions: 15,
        type: "numerical",
        marksCorrect: 2,
        marksIncorrect: 0,
        note: "Numerical Answer Type — typed in, no options, no negative marking.",
      },
    ],
    styleNotes: [
      "Engineering-depth problems requiring derivation, not recall.",
      "NAT answers are often decimals; state the required rounding in the question.",
      "Negative marking applies only to MCQs, never to MSQ or NAT.",
      "Engineering Mathematics and General Aptitude together carry substantial weight.",
    ],
  },

  SSC_CGL: {
    label: "SSC CGL (Tier 1)",
    conductedBy: "Staff Selection Commission",
    durationMinutes: 60,
    totalQuestions: 100,
    totalMarks: 200,
    sourceUrl: "https://ssc.gov.in/",
    verified: false,
    sections: [
      {
        name: "General Intelligence & Reasoning",
        subjects: ["Reasoning"],
        questions: 25,
        type: "mcq_single",
        marksCorrect: 2,
        marksIncorrect: -0.5,
      },
      {
        name: "General Awareness",
        subjects: ["General Awareness"],
        questions: 25,
        type: "mcq_single",
        marksCorrect: 2,
        marksIncorrect: -0.5,
      },
      {
        name: "Quantitative Aptitude",
        subjects: ["Quantitative Aptitude"],
        questions: 25,
        type: "mcq_single",
        marksCorrect: 2,
        marksIncorrect: -0.5,
      },
      {
        name: "English Comprehension",
        subjects: ["English"],
        questions: 25,
        type: "mcq_single",
        marksCorrect: 2,
        marksIncorrect: -0.5,
      },
    ],
    styleNotes: [
      "Roughly 36 seconds per question — questions must be solvable fast.",
      "Quantitative Aptitude favours shortcut-friendly numbers over ugly arithmetic.",
      "Reasoning covers series, analogy, coding-decoding, syllogism, and figure-based items.",
      "Keep language simple; this is not a comprehension-heavy paper outside the English section.",
    ],
  },

  RRB_NTPC: {
    label: "RRB NTPC (CBT 1)",
    conductedBy: "Railway Recruitment Boards",
    durationMinutes: 90,
    totalQuestions: 100,
    totalMarks: 100,
    sourceUrl: "https://www.rrbcdg.gov.in/",
    verified: false,
    sections: [
      {
        name: "General Awareness",
        subjects: ["General Awareness"],
        questions: 40,
        type: "mcq_single",
        marksCorrect: 1,
        marksIncorrect: -0.333,
      },
      {
        name: "Mathematics",
        subjects: ["Mathematics"],
        questions: 30,
        type: "mcq_single",
        marksCorrect: 1,
        marksIncorrect: -0.333,
      },
      {
        name: "General Intelligence & Reasoning",
        subjects: ["Reasoning"],
        questions: 30,
        type: "mcq_single",
        marksCorrect: 1,
        marksIncorrect: -0.333,
      },
    ],
    styleNotes: [
      "General Awareness dominates: current affairs, static GK, and basic science.",
      "Mathematics is arithmetic-led — percentages, ratio, time-speed-distance, profit and loss.",
      "One-third mark deducted per wrong answer.",
    ],
  },

  UPSC_PRELIMS: {
    label: "UPSC Civil Services (Prelims)",
    conductedBy: "Union Public Service Commission",
    durationMinutes: 120,
    totalQuestions: 100,
    totalMarks: 200,
    sourceUrl: "https://upsc.gov.in/",
    verified: false,
    note: "General Studies Paper I. CSAT (Paper II) is qualifying and structured separately.",
    sections: [
      {
        name: "General Studies Paper I",
        subjects: [
          "Indian Polity",
          "Geography",
          "History",
          "Economy",
          "Environment & Ecology",
          "Current Affairs",
          "General Science",
        ],
        questions: 100,
        type: "mcq_single",
        marksCorrect: 2,
        marksIncorrect: -0.66,
      },
    ],
    styleNotes: [
      "Statement-based formats dominate: 'Consider the following statements… which are correct?'",
      "‘How many of the above are correct’ and matched-pair items are common.",
      "Options should be constructed so elimination is possible but not trivial.",
      "Questions are analytical rather than recall-only; avoid single-fact trivia.",
    ],
  },
};

// EXAM_PATTERNS and SYLLABI are keyed identically, so stamp the registry key
// onto each pattern rather than repeating a syllabusKey on every entry.
for (const [key, pattern] of Object.entries(EXAM_PATTERNS)) {
  pattern.key = key;
}

/**
 * Map an exam code from the database (e.g. NTA_JEE_MAIN_2025, GATE_MT,
 * SSC_CGL_2024) onto a pattern. Matching is prefix/keyword based because codes
 * carry year and paper suffixes that change every cycle.
 */
export function getExamPattern(examCode = "") {
  const c = String(examCode).toUpperCase();

  if (c.includes("ADVANCED") || c.includes("JEE_ADV")) return EXAM_PATTERNS.JEE_ADVANCED;
  if (c.includes("JEE")) return EXAM_PATTERNS.JEE_MAIN;
  if (c.includes("NEET")) return EXAM_PATTERNS.NEET;
  if (c.includes("GATE")) return EXAM_PATTERNS.GATE;
  if (c.includes("SSC")) return EXAM_PATTERNS.SSC_CGL;
  if (c.includes("RRB") || c.includes("NTPC")) return EXAM_PATTERNS.RRB_NTPC;
  if (c.includes("UPSC") || c.includes("IAS") || c.includes("IFS"))
    return EXAM_PATTERNS.UPSC_PRELIMS;

  return null;
}

/**
 * Compact, prompt-ready description of how this exam asks questions.
 * Returns null when the exam is unknown, so the caller can fall back to its
 * previous generic prompt rather than inventing a pattern.
 */
export function buildPatternBrief(examCode, { questionCount } = {}) {
  const p = getExamPattern(examCode);
  if (!p) return null;

  const typeMix = p.sections
    .map((s) => `${s.name}: ${s.questions}Q ${s.type} (+${s.marksCorrect}/${s.marksIncorrect})`)
    .join("; ");

  const lines = [
    `EXAM PATTERN — ${p.label} (${p.conductedBy}).`,
    `Full paper: ${p.totalQuestions} questions, ${p.totalMarks} marks, ${p.durationMinutes} minutes.`,
    `Section structure: ${typeMix}.`,
    `Style rules:`,
    ...p.styleNotes.map((n) => `- ${n}`),
  ];

  if (questionCount && questionCount < p.totalQuestions) {
    lines.push(
      `This is a ${questionCount}-question practice set, not the full paper. Keep the same question TYPES and difficulty as the real exam; just use fewer questions.`
    );
  }

  return lines.join("\n");
}

/**
 * Build the exact section plan for a FULL mock test of this exam.
 *
 * This is what makes a JEE Main paper come out as 20 MCQ + 5 numerical per
 * subject while a NEET paper comes out as 45/45/90 straight MCQs and a GATE
 * paper mixes MCQ, MSQ and NAT. Generation walks these blocks instead of
 * emitting one flat list, so "full mock test" means the real paper.
 *
 * When `requested` is smaller than the real paper, every section is scaled
 * proportionally and the remainder is handed to the largest sections, so a
 * 30-question JEE practice set still comes out 8/2 + 8/2 + 8/2 rather than
 * 30 questions of whichever subject the model felt like.
 */
export function buildSectionPlan(examCode, requestedQuestions) {
  const p = getExamPattern(examCode);
  if (!p) return null;

  const full = !requestedQuestions || requestedQuestions >= p.totalQuestions;
  const target = full ? p.totalQuestions : requestedQuestions;

  const scale = target / p.totalQuestions;
  const blocks = p.sections.map((s) => ({
    ...s,
    // At least one question from a section that exists in the real paper.
    count: full ? s.questions : Math.max(1, Math.floor(s.questions * scale)),
  }));

  // Distribute the rounding remainder to the biggest sections first.
  let assigned = blocks.reduce((a, b) => a + b.count, 0);
  const order = [...blocks].sort((a, b) => b.questions - a.questions);
  let i = 0;
  while (assigned < target && order.length) {
    order[i % order.length].count++;
    assigned++;
    i++;
  }
  while (assigned > target && order.length) {
    const b = order[i % order.length];
    if (b.count > 1) {
      b.count--;
      assigned--;
    }
    i++;
    // Everything is down to 1; stop rather than spin.
    if (order.every((x) => x.count <= 1)) break;
  }

  return {
    exam: p.label,
    key: p.key,
    isFullPaper: full,
    totalQuestions: assigned,
    durationMinutes: full
      ? p.durationMinutes
      : Math.max(5, Math.round(p.durationMinutes * (assigned / p.totalQuestions))),
    blocks: blocks.filter((b) => b.count > 0),
  };
}

/** Human-readable rules for one section, injected into that section's prompt. */
export function describeSection(section) {
  const TYPE_RULES = {
    mcq_single:
      "Standard single-correct multiple choice. Exactly one of A-D is correct.",
    mcq_multiple:
      "MULTIPLE CORRECT: one OR MORE of A-D are correct. State in the question that more than one option may be correct, and list every correct letter in the Correct: line (e.g. 'Correct: A,C').",
    numerical:
      "NUMERICAL VALUE: no options at all. The candidate types a number. Omit the A-D lines entirely and put the numeric answer in the Correct: line (e.g. 'Correct: 12.5'). State the required rounding in the question.",
    integer:
      "INTEGER ANSWER: no options. The answer is a non-negative integer. Omit the A-D lines and put the integer in the Correct: line (e.g. 'Correct: 7').",
  };
  const marks =
    section.marksIncorrect === 0
      ? `+${section.marksCorrect}, no negative marking`
      : `+${section.marksCorrect} / ${section.marksIncorrect}`;
  return [
    `SECTION: ${section.name}`,
    `Question type: ${TYPE_RULES[section.type] || TYPE_RULES.mcq_single}`,
    `Marking: ${marks} per question.`,
    section.note ? `Note: ${section.note}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Marking metadata to attach to a generated test so scoring matches the exam. */
export function getMarkingScheme(examCode) {
  const p = getExamPattern(examCode);
  if (!p) return null;
  return {
    exam: p.label,
    durationMinutes: p.durationMinutes,
    totalQuestions: p.totalQuestions,
    totalMarks: p.totalMarks,
    verified: p.verified,
    sourceUrl: p.sourceUrl,
    sections: p.sections.map((s) => ({
      name: s.name,
      type: s.type,
      questions: s.questions,
      marksCorrect: s.marksCorrect,
      marksIncorrect: s.marksIncorrect,
    })),
  };
}

export { EXAM_PATTERNS };
