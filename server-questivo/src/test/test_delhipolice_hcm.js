// test_delhipolice_hcm.js
// Seed script to create ExamCategory + ExamTopic rows for
// Delhi Police Head Constable Ministerial (HCM) Syllabus 2025.
// Usage: node test_delhipolice_hcm.js

import prisma from "../prismaClient.js";

const EXAM_CODE = "DELHI_POLICE_HCM_2025";

// -------------------------
// General Awareness & GK
// -------------------------
const gaTopics = [
  { name: "History", code: "DELHIPO_HCM_GA_HISTORY", order: 100 },
  { name: "Culture", code: "DELHIPO_HCM_GA_CULTURE", order: 101 },
  { name: "Geography", code: "DELHIPO_HCM_GA_GEOGRAPHY", order: 102 },
  { name: "Indian Economy", code: "DELHIPO_HCM_GA_ECONOMY", order: 103 },
  { name: "General Polity", code: "DELHIPO_HCM_GA_POLITY", order: 104 },
  { name: "Indian Constitution", code: "DELHIPO_HCM_GA_CONSTITUTION", order: 105 },
  { name: "Scientific Research", code: "DELHIPO_HCM_GA_SCI_RESEARCH", order: 106 },
  { name: "Countries & Currencies", code: "DELHIPO_HCM_GA_COUNTRIES_CURRENCIES", order: 107 },
  { name: "Abbreviations", code: "DELHIPO_HCM_GA_ABBREVIATIONS", order: 108 },
  { name: "Science: Inventions & Discoveries", code: "DELHIPO_HCM_GA_INV_DISC", order: 109 },
  { name: "Current Important Events", code: "DELHIPO_HCM_GA_CURRENT_EVENTS", order: 110 },
  { name: "Current Affairs - National & International", code: "DELHIPO_HCM_GA_CURRENT_AFFAIRS", order: 111 },
  { name: "Awards & Honours", code: "DELHIPO_HCM_GA_AWARDS", order: 112 },
  { name: "Important Financial & Economic News", code: "DELHIPO_HCM_GA_FINANCIAL_NEWS", order: 113 },
  { name: "Banking News", code: "DELHIPO_HCM_GA_BANKING_NEWS", order: 114 },
  { name: "Books & Authors", code: "DELHIPO_HCM_GA_BOOKS_AUTHORS", order: 115 },
  { name: "Important Days & Dates", code: "DELHIPO_HCM_GA_DAYS_DATES", order: 116 },
];

// -------------------------
// English Language
// -------------------------
const englishTopics = [
  { name: "Spot the Error", code: "DELHIPO_HCM_ENG_SPOT_ERROR", order: 200 },
  { name: "Fill in the Blanks", code: "DELHIPO_HCM_ENG_FILL_BLANKS", order: 201 },
  { name: "Synonyms / Antonyms / Homonyms", code: "DELHIPO_HCM_ENG_SYNON_ANT", order: 202 },
  { name: "Spellings / Detecting Misspelt Words", code: "DELHIPO_HCM_ENG_SPELLINGS", order: 203 },
  { name: "Idioms & Phrases", code: "DELHIPO_HCM_ENG_IDIOMS", order: 204 },
  { name: "One-word Substitution", code: "DELHIPO_HCM_ENG_ONE_WORD", order: 205 },
  { name: "Improvement of Sentences", code: "DELHIPO_HCM_ENG_IMPROVE_SENT", order: 206 },
  { name: "Active / Passive Voice", code: "DELHIPO_HCM_ENG_VOICE", order: 207 },
  { name: "Direct / Indirect Speech", code: "DELHIPO_HCM_ENG_REPORTING", order: 208 },
  { name: "Shuffling of Sentence Parts", code: "DELHIPO_HCM_ENG_SHUFFLE_PARTS", order: 209 },
  { name: "Shuffling of Sentences in a Passage", code: "DELHIPO_HCM_ENG_SHUFFLE_PASSAGE", order: 210 },
  { name: "Cloze Passage", code: "DELHIPO_HCM_ENG_CLOZE", order: 211 },
  { name: "Comprehension Passage", code: "DELHIPO_HCM_ENG_COMP", order: 212 },
];

// -------------------------
// General Intelligence
// -------------------------
const giTopics = [
  { name: "Semantic Analogy", code: "DELHIPO_HCM_GI_SEM_ANA", order: 300 },
  { name: "Symbolic / Number Analogy", code: "DELHIPO_HCM_GI_SYM_ANA", order: 301 },
  { name: "Figural Analogy", code: "DELHIPO_HCM_GI_FIG_ANA", order: 302 },
  { name: "Semantic Classification", code: "DELHIPO_HCM_GI_SEM_CLASS", order: 303 },
  { name: "Symbolic / Number Classification", code: "DELHIPO_HCM_GI_SYM_CLASS", order: 304 },
  { name: "Figural Classification", code: "DELHIPO_HCM_GI_FIG_CLASS", order: 305 },
  { name: "Semantic Series", code: "DELHIPO_HCM_GI_SEM_SER", order: 306 },
  { name: "Number Series", code: "DELHIPO_HCM_GI_NUM_SER", order: 307 },
  { name: "Figural Series", code: "DELHIPO_HCM_GI_FIG_SER", order: 308 },
  { name: "Problem Solving", code: "DELHIPO_HCM_GI_PROB_SOLVE", order: 309 },
  { name: "Word Building", code: "DELHIPO_HCM_GI_WORD_BUILD", order: 310 },
  { name: "Coding & Decoding", code: "DELHIPO_HCM_GI_CODING_DECODING", order: 311 },
  { name: "Numerical / Symbolic Operations", code: "DELHIPO_HCM_GI_NUM_SYMBOL_OP", order: 312 },
  { name: "Trends, Space Orientation & Visualization", code: "DELHIPO_HCM_GI_SPACE", order: 313 },
  { name: "Venn Diagrams", code: "DELHIPO_HCM_GI_VENN", order: 314 },
  { name: "Drawing Inferences", code: "DELHIPO_HCM_GI_INFERENCES", order: 315 },
  { name: "Punched Hole / Pattern Folding & Unfolding", code: "DELHIPO_HCM_GI_PATTERN_FOLD", order: 316 },
  { name: "Figural Pattern-folding & Completion", code: "DELHIPO_HCM_GI_PATTERN_COMPLETE", order: 317 },
  { name: "Indexing, Address & Date/City Matching", code: "DELHIPO_HCM_GI_INDEX_MATCH", order: 318 },
  { name: "Classification of Centre Codes / Roll Numbers", code: "DELHIPO_HCM_GI_CENTER_CODE", order: 319 },
  { name: "Embedded Figures", code: "DELHIPO_HCM_GI_EMBED_FIG", order: 320 },
  { name: "Critical, Social & Emotional Intelligence", code: "DELHIPO_HCM_GI_INTELLIGENCE", order: 321 },
];

// -------------------------
// Quantitative Aptitude
// -------------------------
const quantTopics = [
  { name: "Number Systems: Whole, Decimal & Fractions", code: "DELHIPO_HCM_Q_NUM_SYSTEMS", order: 400 },
  { name: "Percentages, Ratio & Proportion, Averages", code: "DELHIPO_HCM_Q_PERC_RATIO_AVG", order: 401 },
  { name: "Interest (Simple & Compound), Profit & Loss, Discount", code: "DELHIPO_HCM_Q_INTEREST_PROFIT", order: 402 },
  { name: "Partnership, Mixture & Alligation", code: "DELHIPO_HCM_Q_PART_MIX", order: 403 },
  { name: "Time & Distance, Time & Work", code: "DELHIPO_HCM_Q_TIME_DIST_WORK", order: 404 },
  { name: "Algebra & Linear Equations, Elementary Surds", code: "DELHIPO_HCM_Q_ALGEBRA", order: 405 },
  { name: "Geometry: Triangles, Circles & Elementary Figures", code: "DELHIPO_HCM_Q_GEOMETRY", order: 406 },
  { name: "Mensuration: 2D & 3D Figures", code: "DELHIPO_HCM_Q_MENSURATION", order: 407 },
  { name: "Trigonometry: Ratios & Height/Distance", code: "DELHIPO_HCM_Q_TRIGONOMETRY", order: 408 },
  { name: "Statistical Charts: Tables, Histogram, Bar, Pie", code: "DELHIPO_HCM_Q_STATS_CHARTS", order: 409 },
];

// -------------------------
// Computer Fundamentals
// -------------------------
const compTopics = [
  { name: "MS Excel: Spreadsheets, Functions & Formulas", code: "DELHIPO_HCM_COMP_EXCEL", order: 500 },
  { name: "Communication: Basics of E-mail", code: "DELHIPO_HCM_COMP_EMAIL", order: 501 },
  { name: "Word Processing: Document Creation & Formatting", code: "DELHIPO_HCM_COMP_WORD", order: 502 },
  { name: "Internet, WWW & Web Browsers (Basics)", code: "DELHIPO_HCM_COMP_INTERNET", order: 503 },
  { name: "Basic Computer Concepts: Hardware & Software", code: "DELHIPO_HCM_COMP_BASIC", order: 504 },
  { name: "Security & Safe Usage (Basic Cyber Hygiene)", code: "DELHIPO_HCM_COMP_SECURITY", order: 505 },
];

// Combine all topics in insertion order
const allTopics = [
  ...gaTopics,
  ...englishTopics,
  ...giTopics,
  ...quantTopics,
  ...compTopics,
];

async function main() {
  console.log("▶ Seeding Delhi Police HCM topics…");

  const exam = await prisma.examCategory.upsert({
    where: { code: EXAM_CODE },
    update: {},
    create: {
      name: "Delhi Police Head Constable Ministerial Syllabus",
      code: EXAM_CODE,
      isActive: true,
    },
  });

  console.log("Using ExamCategory:", exam.name, exam.id);

  // Clear old topics for idempotency
  await prisma.examTopic.deleteMany({
    where: { examCategoryId: exam.id },
  });

  // Bulk insert
  await prisma.examTopic.createMany({
    data: allTopics.map((t) => ({
      examCategoryId: exam.id,
      name: t.name,
      code: t.code,
      order: t.order,
      isActive: true,
    })),
  });

  console.log(`✅ Inserted ${allTopics.length} topics for ${exam.name}.`);

  await prisma.$disconnect();
}

main()
  .catch((err) => {
    console.error("Error seeding Delhi Police HCM topics:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
