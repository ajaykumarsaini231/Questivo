// Exam syllabi.
//
// JEE Main and NEET below are transcribed from the CURRENT official NTA
// syllabus PDFs, parsed directly from the primary source on 2026-08-03:
//
//   JEE Main 2026 syllabus
//   https://jeemain.nta.nic.in/  ->  "Syllabus"
//   cdnbbsr.s3waas.gov.in/s3f8e59f4b2fe7c5705bf878bbd494ccdf/uploads/2025/10/202510311323551056.pdf
//
//   NEET (UG) 2026 syllabus
//   https://neet.nta.nic.in/  ->  "Syllabus for NEET (UG)-2026 Examination"
//   cdnbbsr.s3waas.gov.in/s37bc1ec1d9c3426357e69acd5bf320061/uploads/2026/01/202601081066816297.pdf
//
// Unit numbering and wording follow the official documents, including their
// own section grouping (e.g. JEE Chemistry is split Physical / Inorganic /
// Organic). Typos in the source ("INTEGRAL CALCULAS", "DIFFRENTIAL EQUATIONS")
// are corrected here for display only.
//
// The remaining exams are marked `official: false` — the topic lists are a
// reasonable working outline, not a transcription of a notification. Replace
// them from the conducting body's own syllabus before presenting them as
// authoritative.

export const SYLLABI = {
  JEE_MAIN: {
    official: true,
    source: "NTA JEE (Main) 2026 Syllabus (Paper 1, B.E./B.Tech)",
    sourceUrl: "https://jeemain.nta.nic.in/",
    checkedOn: "2026-08-03",
    subjects: {
      Mathematics: [
        "Sets, Relations and Functions",
        "Complex Numbers and Quadratic Equations",
        "Matrices and Determinants",
        "Permutations and Combinations",
        "Binomial Theorem and its Simple Applications",
        "Sequence and Series",
        "Limit, Continuity and Differentiability",
        "Integral Calculus",
        "Differential Equations",
        "Co-ordinate Geometry",
        "Three Dimensional Geometry",
        "Vector Algebra",
        "Statistics and Probability",
        "Trigonometry",
      ],
      Physics: [
        "Units and Measurements",
        "Kinematics",
        "Laws of Motion",
        "Work, Energy and Power",
        "Rotational Motion",
        "Gravitation",
        "Properties of Solids and Liquids",
        "Thermodynamics",
        "Kinetic Theory of Gases",
        "Oscillations and Waves",
        "Electrostatics",
        "Current Electricity",
        "Magnetic Effects of Current and Magnetism",
        "Electromagnetic Induction and Alternating Currents",
        "Electromagnetic Waves",
        "Optics",
        "Dual Nature of Matter and Radiation",
        "Atoms and Nuclei",
        "Electronic Devices",
        "Experimental Skills",
      ],
      Chemistry: [
        // Physical Chemistry
        "Some Basic Concepts in Chemistry",
        "Atomic Structure",
        "Chemical Bonding and Molecular Structure",
        "Chemical Thermodynamics",
        "Solutions",
        "Equilibrium",
        "Redox Reactions and Electrochemistry",
        "Chemical Kinetics",
        // Inorganic Chemistry
        "Classification of Elements and Periodicity in Properties",
        "p-Block Elements",
        "d- and f-Block Elements",
        "Co-ordination Compounds",
        // Organic Chemistry
        "Purification and Characterisation of Organic Compounds",
        "Some Basic Principles of Organic Chemistry",
        "Hydrocarbons",
        "Organic Compounds Containing Halogens",
        "Organic Compounds Containing Oxygen",
        "Organic Compounds Containing Nitrogen",
        "Biomolecules",
        "Principles Related to Practical Chemistry",
      ],
    },
  },

  NEET: {
    official: true,
    source: "NTA NEET (UG) 2026 Syllabus",
    sourceUrl: "https://neet.nta.nic.in/",
    checkedOn: "2026-08-03",
    subjects: {
      Physics: [
        "Physics and Measurement",
        "Kinematics",
        "Laws of Motion",
        "Work, Energy and Power",
        "Rotational Motion",
        "Gravitation",
        "Properties of Solids and Liquids",
        "Thermodynamics",
        "Kinetic Theory of Gases",
        "Oscillations and Waves",
        "Electrostatics",
        "Current Electricity",
        "Magnetic Effects of Current and Magnetism",
        "Electromagnetic Induction and Alternating Currents",
        "Electromagnetic Waves",
        "Optics",
        "Dual Nature of Matter and Radiation",
        "Atoms and Nuclei",
        "Electronic Devices",
        "Experimental Skills",
      ],
      Chemistry: [
        "Some Basic Concepts in Chemistry",
        "Atomic Structure",
        "Chemical Bonding and Molecular Structure",
        "Chemical Thermodynamics",
        "Solutions",
        "Equilibrium",
        "Redox Reactions and Electrochemistry",
        "Chemical Kinetics",
        "Classification of Elements and Periodicity in Properties",
        "p-Block Elements",
        "d- and f-Block Elements",
        "Co-ordination Compounds",
        "Purification and Characterisation of Organic Compounds",
        "Some Basic Principles of Organic Chemistry",
        "Hydrocarbons",
        "Organic Compounds Containing Halogens",
        "Organic Compounds Containing Oxygen",
        "Organic Compounds Containing Nitrogen",
        "Biomolecules",
        "Principles Related to Practical Chemistry",
      ],
      "Biology (Botany & Zoology)": [
        "Diversity in Living World",
        "Structural Organisation in Animals and Plants",
        "Cell Structure and Function",
        "Plant Physiology",
        "Human Physiology",
        "Reproduction",
        "Genetics and Evolution",
        "Biology and Human Welfare",
        "Biotechnology and Its Applications",
        "Ecology and Environment",
      ],
    },
  },

  JEE_ADVANCED: {
    official: false,
    source: "Working outline — replace from the official JEE Advanced syllabus",
    sourceUrl: "https://jeeadv.ac.in/",
    subjects: {
      Physics: [
        "General Physics and Units",
        "Mechanics",
        "Thermal Physics",
        "Electricity and Magnetism",
        "Optics",
        "Modern Physics",
      ],
      Chemistry: [
        "Physical Chemistry",
        "Inorganic Chemistry",
        "Organic Chemistry",
      ],
      Mathematics: [
        "Algebra",
        "Matrices and Determinants",
        "Probability and Statistics",
        "Trigonometry",
        "Analytical Geometry",
        "Differential Calculus",
        "Integral Calculus",
        "Vectors",
      ],
    },
  },

  GATE: {
    official: false,
    source: "Working outline for GATE MT (Metallurgical Engineering)",
    sourceUrl: "https://gate.iitk.ac.in/",
    subjects: {
      "General Aptitude": ["Verbal Aptitude", "Quantitative Aptitude", "Analytical Aptitude", "Spatial Aptitude"],
      "Engineering Mathematics": [
        "Linear Algebra",
        "Calculus",
        "Differential Equations",
        "Vector Calculus",
        "Complex Variables",
        "Probability and Statistics",
        "Numerical Methods",
      ],
      "Metallurgical Engineering": [
        "Thermodynamics and Rate Processes",
        "Extractive Metallurgy",
        "Physical Metallurgy",
        "Mechanical Metallurgy",
        "Manufacturing Processes",
        "Materials Characterisation",
      ],
    },
  },

  SSC_CGL: {
    official: false,
    source: "Working outline for SSC CGL Tier 1",
    sourceUrl: "https://ssc.gov.in/",
    subjects: {
      "General Intelligence & Reasoning": [
        "Analogies and Classification",
        "Series (Number, Figural)",
        "Coding-Decoding",
        "Syllogism and Statement Conclusions",
        "Blood Relations and Direction Sense",
        "Non-verbal Reasoning (Paper Folding, Mirror Images, Embedded Figures)",
        "Venn Diagrams",
      ],
      "General Awareness": [
        "Indian History and Culture",
        "Indian Polity and Constitution",
        "Geography (India and World)",
        "Indian Economy",
        "General Science",
        "Static General Knowledge",
        "Current Affairs",
      ],
      "Quantitative Aptitude": [
        "Number System and Simplification",
        "Percentage, Profit and Loss, Discount",
        "Ratio, Proportion, Partnership",
        "Average, Mixture and Alligation",
        "Time and Work, Pipes and Cisterns",
        "Time, Speed and Distance",
        "Simple and Compound Interest",
        "Geometry and Mensuration",
        "Trigonometry",
        "Data Interpretation",
      ],
      "English Comprehension": [
        "Reading Comprehension",
        "Cloze Test",
        "Error Spotting and Sentence Improvement",
        "Fill in the Blanks",
        "Synonyms, Antonyms and One-word Substitution",
        "Idioms and Phrases",
        "Active/Passive Voice and Narration",
        "Para Jumbles",
      ],
    },
  },

  RRB_NTPC: {
    official: false,
    source: "Working outline for RRB NTPC CBT 1",
    sourceUrl: "https://www.rrbcdg.gov.in/",
    subjects: {
      Mathematics: [
        "Number System and BODMAS",
        "Decimals, Fractions, LCM and HCF",
        "Ratio and Proportion, Percentage",
        "Mensuration",
        "Time and Work, Time and Distance",
        "Simple and Compound Interest",
        "Profit and Loss",
        "Elementary Algebra, Geometry and Trigonometry",
        "Elementary Statistics",
      ],
      "General Intelligence & Reasoning": [
        "Analogies and Series Completion",
        "Coding-Decoding",
        "Mathematical Operations",
        "Syllogism, Statement–Conclusion",
        "Venn Diagrams and Data Interpretation",
        "Puzzles and Seating Arrangement",
        "Decision Making and Analytical Reasoning",
      ],
      "General Awareness": [
        "Current Events of National and International Importance",
        "Indian History and Freedom Struggle",
        "Indian Polity and Governance",
        "Indian Geography and Economy",
        "General Science and Life Science (up to Class 10)",
        "Transport Systems and Indian Railways",
        "Computer Fundamentals",
        "Art and Culture of India",
      ],
    },
  },

  UPSC_PRELIMS: {
    official: false,
    source: "Working outline for UPSC Civil Services Prelims GS Paper I",
    sourceUrl: "https://upsc.gov.in/",
    subjects: {
      "General Studies Paper I": [
        "Current Events of National and International Importance",
        "History of India and Indian National Movement",
        "Indian and World Geography",
        "Indian Polity and Governance",
        "Economic and Social Development",
        "Environmental Ecology, Biodiversity and Climate Change",
        "General Science",
      ],
      "CSAT (Paper II, qualifying)": [
        "Comprehension",
        "Interpersonal Skills including Communication",
        "Logical Reasoning and Analytical Ability",
        "Decision Making and Problem Solving",
        "General Mental Ability",
        "Basic Numeracy and Data Interpretation (Class X level)",
      ],
    },
  },
};

/** Flat topic list for an exam, used to seed generation when none are chosen. */
export function allTopics(key) {
  const s = SYLLABI[key];
  if (!s) return [];
  return Object.values(s.subjects).flat();
}

/** Topics for one subject, used for section-aware full mock generation. */
export function topicsForSubject(key, subject) {
  const s = SYLLABI[key];
  if (!s) return [];
  // Exact match first, then a loose contains match ("Biology" -> "Biology (Botany & Zoology)").
  if (s.subjects[subject]) return s.subjects[subject];
  const hit = Object.keys(s.subjects).find(
    (k) => k.toLowerCase().includes(subject.toLowerCase()) || subject.toLowerCase().includes(k.toLowerCase())
  );
  return hit ? s.subjects[hit] : [];
}
