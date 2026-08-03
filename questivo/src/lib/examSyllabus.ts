// Syllabus and paper pattern shown on the /mock-test/<exam> pages.
//
// This mirrors server-qusestivo/src/agentic-mock-test/examSyllabus.js and
// examPatterns.js. The two are separate deployables so they cannot share a
// module; if you change one, change the other.
//
// SOURCING — this is published content, so it matters:
//   `official: true`  entries are transcribed from the conducting body's own
//                     current PDF, parsed from the primary source on the date
//                     in `checkedOn`.
//   `official: false` entries are a working outline. They are rendered with a
//                     visible "not yet verified" note rather than presented as
//                     authoritative, because a wrong exam pattern on a public
//                     page is worse than no pattern at all.

export interface PaperSection {
  name: string;
  questions: number;
  type: "mcq_single" | "mcq_multiple" | "numerical" | "integer";
  marksCorrect: number;
  marksIncorrect: number;
  note?: string;
}

export interface ExamPaper {
  official: boolean;
  conductedBy: string;
  sourceUrl: string;
  checkedOn?: string;
  durationMinutes: number;
  totalQuestions: number;
  totalMarks: number;
  mode?: string;
  sections: PaperSection[];
  /** subject -> ordered unit list, as named in the official syllabus */
  syllabus: Record<string, string[]>;
}

const TYPE_LABEL: Record<PaperSection["type"], string> = {
  mcq_single: "Single correct MCQ",
  mcq_multiple: "One or more correct (MSQ)",
  numerical: "Numerical value (no options)",
  integer: "Integer answer (no options)",
};

export const questionTypeLabel = (t: PaperSection["type"]) => TYPE_LABEL[t];

export const EXAM_PAPERS: Record<string, ExamPaper> = {
  "jee-main": {
    official: true,
    conductedBy: "National Testing Agency (NTA)",
    sourceUrl: "https://jeemain.nta.nic.in/",
    checkedOn: "3 August 2026",
    durationMinutes: 180,
    totalQuestions: 75,
    totalMarks: 300,
    mode: "Computer Based Test (CBT)",
    sections: [
      { name: "Mathematics – Section A", questions: 20, type: "mcq_single", marksCorrect: 4, marksIncorrect: -1 },
      { name: "Mathematics – Section B", questions: 5, type: "numerical", marksCorrect: 4, marksIncorrect: -1, note: "Answer rounded to the nearest integer." },
      { name: "Physics – Section A", questions: 20, type: "mcq_single", marksCorrect: 4, marksIncorrect: -1 },
      { name: "Physics – Section B", questions: 5, type: "numerical", marksCorrect: 4, marksIncorrect: -1 },
      { name: "Chemistry – Section A", questions: 20, type: "mcq_single", marksCorrect: 4, marksIncorrect: -1 },
      { name: "Chemistry – Section B", questions: 5, type: "numerical", marksCorrect: 4, marksIncorrect: -1 },
    ],
    syllabus: {
      Mathematics: [
        "Sets, Relations and Functions", "Complex Numbers and Quadratic Equations",
        "Matrices and Determinants", "Permutations and Combinations",
        "Binomial Theorem and its Simple Applications", "Sequence and Series",
        "Limit, Continuity and Differentiability", "Integral Calculus",
        "Differential Equations", "Co-ordinate Geometry", "Three Dimensional Geometry",
        "Vector Algebra", "Statistics and Probability", "Trigonometry",
      ],
      Physics: [
        "Units and Measurements", "Kinematics", "Laws of Motion", "Work, Energy and Power",
        "Rotational Motion", "Gravitation", "Properties of Solids and Liquids",
        "Thermodynamics", "Kinetic Theory of Gases", "Oscillations and Waves",
        "Electrostatics", "Current Electricity", "Magnetic Effects of Current and Magnetism",
        "Electromagnetic Induction and Alternating Currents", "Electromagnetic Waves",
        "Optics", "Dual Nature of Matter and Radiation", "Atoms and Nuclei",
        "Electronic Devices", "Experimental Skills",
      ],
      Chemistry: [
        "Some Basic Concepts in Chemistry", "Atomic Structure",
        "Chemical Bonding and Molecular Structure", "Chemical Thermodynamics", "Solutions",
        "Equilibrium", "Redox Reactions and Electrochemistry", "Chemical Kinetics",
        "Classification of Elements and Periodicity in Properties", "p-Block Elements",
        "d- and f-Block Elements", "Co-ordination Compounds",
        "Purification and Characterisation of Organic Compounds",
        "Some Basic Principles of Organic Chemistry", "Hydrocarbons",
        "Organic Compounds Containing Halogens", "Organic Compounds Containing Oxygen",
        "Organic Compounds Containing Nitrogen", "Biomolecules",
        "Principles Related to Practical Chemistry",
      ],
    },
  },

  "neet-ug": {
    official: true,
    conductedBy: "National Testing Agency (NTA)",
    sourceUrl: "https://neet.nta.nic.in/",
    checkedOn: "3 August 2026",
    durationMinutes: 180,
    totalQuestions: 180,
    totalMarks: 720,
    mode: "Pen and paper (OMR)",
    sections: [
      { name: "Physics", questions: 45, type: "mcq_single", marksCorrect: 4, marksIncorrect: -1 },
      { name: "Chemistry", questions: 45, type: "mcq_single", marksCorrect: 4, marksIncorrect: -1 },
      { name: "Botany", questions: 45, type: "mcq_single", marksCorrect: 4, marksIncorrect: -1 },
      { name: "Zoology", questions: 45, type: "mcq_single", marksCorrect: 4, marksIncorrect: -1 },
    ],
    syllabus: {
      Physics: [
        "Physics and Measurement", "Kinematics", "Laws of Motion", "Work, Energy and Power",
        "Rotational Motion", "Gravitation", "Properties of Solids and Liquids",
        "Thermodynamics", "Kinetic Theory of Gases", "Oscillations and Waves",
        "Electrostatics", "Current Electricity", "Magnetic Effects of Current and Magnetism",
        "Electromagnetic Induction and Alternating Currents", "Electromagnetic Waves",
        "Optics", "Dual Nature of Matter and Radiation", "Atoms and Nuclei",
        "Electronic Devices", "Experimental Skills",
      ],
      Chemistry: [
        "Some Basic Concepts in Chemistry", "Atomic Structure",
        "Chemical Bonding and Molecular Structure", "Chemical Thermodynamics", "Solutions",
        "Equilibrium", "Redox Reactions and Electrochemistry", "Chemical Kinetics",
        "Classification of Elements and Periodicity in Properties", "p-Block Elements",
        "d- and f-Block Elements", "Co-ordination Compounds",
        "Purification and Characterisation of Organic Compounds",
        "Some Basic Principles of Organic Chemistry", "Hydrocarbons",
        "Organic Compounds Containing Halogens", "Organic Compounds Containing Oxygen",
        "Organic Compounds Containing Nitrogen", "Biomolecules",
        "Principles Related to Practical Chemistry",
      ],
      "Biology (Botany & Zoology)": [
        "Diversity in Living World", "Structural Organisation in Animals and Plants",
        "Cell Structure and Function", "Plant Physiology", "Human Physiology",
        "Reproduction", "Genetics and Evolution", "Biology and Human Welfare",
        "Biotechnology and Its Applications", "Ecology and Environment",
      ],
    },
  },

  "gate-metallurgy": {
    official: false,
    conductedBy: "IISc / IITs",
    sourceUrl: "https://gate.iitk.ac.in/",
    durationMinutes: 180,
    totalQuestions: 65,
    totalMarks: 100,
    mode: "Computer Based Test (CBT)",
    sections: [
      { name: "General Aptitude", questions: 10, type: "mcq_single", marksCorrect: 1, marksIncorrect: -0.33 },
      { name: "Metallurgical Engineering – MCQ", questions: 30, type: "mcq_single", marksCorrect: 1, marksIncorrect: -0.33 },
      { name: "Metallurgical Engineering – MSQ", questions: 10, type: "mcq_multiple", marksCorrect: 2, marksIncorrect: 0, note: "No negative marking." },
      { name: "Metallurgical Engineering – NAT", questions: 15, type: "numerical", marksCorrect: 2, marksIncorrect: 0, note: "Typed answer, no negative marking." },
    ],
    syllabus: {
      "General Aptitude": ["Verbal Aptitude", "Quantitative Aptitude", "Analytical Aptitude", "Spatial Aptitude"],
      "Engineering Mathematics": [
        "Linear Algebra", "Calculus", "Differential Equations", "Vector Calculus",
        "Complex Variables", "Probability and Statistics", "Numerical Methods",
      ],
      "Metallurgical Engineering": [
        "Thermodynamics and Rate Processes", "Extractive Metallurgy", "Physical Metallurgy",
        "Mechanical Metallurgy", "Manufacturing Processes", "Materials Characterisation",
      ],
    },
  },

  "ssc-cgl": {
    official: false,
    conductedBy: "Staff Selection Commission",
    sourceUrl: "https://ssc.gov.in/",
    durationMinutes: 60,
    totalQuestions: 100,
    totalMarks: 200,
    mode: "Computer Based Examination (Tier 1)",
    sections: [
      { name: "General Intelligence & Reasoning", questions: 25, type: "mcq_single", marksCorrect: 2, marksIncorrect: -0.5 },
      { name: "General Awareness", questions: 25, type: "mcq_single", marksCorrect: 2, marksIncorrect: -0.5 },
      { name: "Quantitative Aptitude", questions: 25, type: "mcq_single", marksCorrect: 2, marksIncorrect: -0.5 },
      { name: "English Comprehension", questions: 25, type: "mcq_single", marksCorrect: 2, marksIncorrect: -0.5 },
    ],
    syllabus: {
      "General Intelligence & Reasoning": [
        "Analogies and Classification", "Series (Number, Figural)", "Coding-Decoding",
        "Syllogism and Statement Conclusions", "Blood Relations and Direction Sense",
        "Non-verbal Reasoning", "Venn Diagrams",
      ],
      "General Awareness": [
        "Indian History and Culture", "Indian Polity and Constitution",
        "Geography (India and World)", "Indian Economy", "General Science",
        "Static General Knowledge", "Current Affairs",
      ],
      "Quantitative Aptitude": [
        "Number System and Simplification", "Percentage, Profit and Loss, Discount",
        "Ratio, Proportion, Partnership", "Average, Mixture and Alligation",
        "Time and Work, Pipes and Cisterns", "Time, Speed and Distance",
        "Simple and Compound Interest", "Geometry and Mensuration", "Trigonometry",
        "Data Interpretation",
      ],
      "English Comprehension": [
        "Reading Comprehension", "Cloze Test", "Error Spotting and Sentence Improvement",
        "Fill in the Blanks", "Synonyms, Antonyms and One-word Substitution",
        "Idioms and Phrases", "Active/Passive Voice and Narration", "Para Jumbles",
      ],
    },
  },

  "rrb-ntpc": {
    official: false,
    conductedBy: "Railway Recruitment Boards",
    sourceUrl: "https://www.rrbcdg.gov.in/",
    durationMinutes: 90,
    totalQuestions: 100,
    totalMarks: 100,
    mode: "Computer Based Test (CBT 1)",
    sections: [
      { name: "General Awareness", questions: 40, type: "mcq_single", marksCorrect: 1, marksIncorrect: -0.333 },
      { name: "Mathematics", questions: 30, type: "mcq_single", marksCorrect: 1, marksIncorrect: -0.333 },
      { name: "General Intelligence & Reasoning", questions: 30, type: "mcq_single", marksCorrect: 1, marksIncorrect: -0.333 },
    ],
    syllabus: {
      Mathematics: [
        "Number System and BODMAS", "Decimals, Fractions, LCM and HCF",
        "Ratio and Proportion, Percentage", "Mensuration", "Time and Work, Time and Distance",
        "Simple and Compound Interest", "Profit and Loss",
        "Elementary Algebra, Geometry and Trigonometry", "Elementary Statistics",
      ],
      "General Intelligence & Reasoning": [
        "Analogies and Series Completion", "Coding-Decoding", "Mathematical Operations",
        "Syllogism, Statement–Conclusion", "Venn Diagrams and Data Interpretation",
        "Puzzles and Seating Arrangement", "Decision Making and Analytical Reasoning",
      ],
      "General Awareness": [
        "Current Events of National and International Importance",
        "Indian History and Freedom Struggle", "Indian Polity and Governance",
        "Indian Geography and Economy", "General Science and Life Science (up to Class 10)",
        "Transport Systems and Indian Railways", "Computer Fundamentals",
        "Art and Culture of India",
      ],
    },
  },

  "upsc-ias": {
    official: false,
    conductedBy: "Union Public Service Commission",
    sourceUrl: "https://upsc.gov.in/",
    durationMinutes: 120,
    totalQuestions: 100,
    totalMarks: 200,
    mode: "Offline OMR (Prelims GS Paper I)",
    sections: [
      { name: "General Studies Paper I", questions: 100, type: "mcq_single", marksCorrect: 2, marksIncorrect: -0.66 },
    ],
    syllabus: {
      "General Studies Paper I": [
        "Current Events of National and International Importance",
        "History of India and Indian National Movement", "Indian and World Geography",
        "Indian Polity and Governance", "Economic and Social Development",
        "Environmental Ecology, Biodiversity and Climate Change", "General Science",
      ],
      "CSAT (Paper II, qualifying)": [
        "Comprehension", "Interpersonal Skills including Communication",
        "Logical Reasoning and Analytical Ability", "Decision Making and Problem Solving",
        "General Mental Ability", "Basic Numeracy and Data Interpretation (Class X level)",
      ],
    },
  },
};

export const getPaper = (slug: string): ExamPaper | undefined => EXAM_PAPERS[slug];
