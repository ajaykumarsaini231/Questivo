// src/test/test_ssc_cgl.js
// Safe and robust seeder for SSC CGL 2024 full syllabus topics.
// Master seeder should import and call: await seed(prisma)

const EXAM_CODE = "SSC_CGL_2024";
const EXAM_NAME = "Combined Graduate Level Examination (SSC CGL) 2024";
const BATCH_SIZE = 200;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* -------------------------
   Topics (kept from your original file)
   ------------------------- */

const tier1_GI = [
  { name: "Analogies (Semantic, Symbolic/Number, Figural)", code: "SSC_CGL_TI_GI_ANALOGIES", order: 1 },
  { name: "Similarities and differences (Semantic Classification)", code: "SSC_CGL_TI_GI_SIMILARITIES", order: 2 },
  { name: "Space visualization & Spatial orientation", code: "SSC_CGL_TI_GI_SPATIAL", order: 3 },
  { name: "Problem solving, Analysis, Judgment, Decision making", code: "SSC_CGL_TI_GI_PROBLEM_SOLVING", order: 4 },
  { name: "Visual memory, Discrimination & Observation", code: "SSC_CGL_TI_GI_VISUAL_MEMORY", order: 5 },
  { name: "Relationship concepts & Drawing inferences", code: "SSC_CGL_TI_GI_RELATIONSHIP", order: 6 },
  { name: "Arithmetical reasoning & Numerical operations", code: "SSC_CGL_TI_GI_ARITH_REASON", order: 7 },
  { name: "Figural classification & Figural series", code: "SSC_CGL_TI_GI_FIGURAL_CLASS", order: 8 },
  { name: "Arithmetic number series & Non-verbal series", code: "SSC_CGL_TI_GI_NUMBER_SERIES", order: 9 },
  { name: "Coding and decoding, Small & capital letters/number coding", code: "SSC_CGL_TI_GI_CODING_DECODING", order: 10 },
  { name: "Statement conclusion & Syllogistic reasoning", code: "SSC_CGL_TI_GI_SYLLOGISM", order: 11 },
  { name: "Venn diagrams, Symbolic operations & Trends", code: "SSC_CGL_TI_GI_VENN_TRENDS", order: 12 },
  { name: "Punched hole / pattern folding & un-folding", code: "SSC_CGL_TI_GI_PUNCHED_HOLE", order: 13 },
  { name: "Figural pattern-folding and completion", code: "SSC_CGL_TI_GI_PATTERN_COMPLETE", order: 14 },
  { name: "Indexing, Address matching, Date & city matching", code: "SSC_CGL_TI_GI_INDEXING_MATCH", order: 15 },
  { name: "Embedded figures & Critical thinking", code: "SSC_CGL_TI_GI_EMBEDDED_CRITICAL", order: 16 },
  { name: "Word building & Social/Emotional intelligence", code: "SSC_CGL_TI_GI_WORD_BUILDING", order: 17 },
  { name: "Other reasoning sub-topics (misc)", code: "SSC_CGL_TI_GI_MISC", order: 18 },
];

const tier1_GA = [
  { name: "General Awareness: Current Events (National & International)", code: "SSC_CGL_TI_GA_CURRENT", order: 101 },
  { name: "India – History", code: "SSC_CGL_TI_GA_HISTORY", order: 102 },
  { name: "India – Culture", code: "SSC_CGL_TI_GA_CULTURE", order: 103 },
  { name: "India – Geography", code: "SSC_CGL_TI_GA_GEOGRAPHY", order: 104 },
  { name: "India – Economic Scene", code: "SSC_CGL_TI_GA_ECONOMY", order: 105 },
  { name: "General Polity & Indian Constitution", code: "SSC_CGL_TI_GA_POLITY", order: 106 },
  { name: "Scientific Research & Everyday Science", code: "SSC_CGL_TI_GA_SCIENCE", order: 107 },
  { name: "Misc GK: Awards, Books, Abbreviations, Organizations", code: "SSC_CGL_TI_GA_MISC", order: 108 },
];

const tier1_QA = [
  { name: "Computation of whole numbers, Decimals & Fractions", code: "SSC_CGL_TI_QA_NUMBER_SYSTEMS", order: 201 },
  { name: "Relationships between numbers & Basic number theory", code: "SSC_CGL_TI_QA_RELATION_NUM", order: 202 },
  { name: "Percentages & Profit/Loss", code: "SSC_CGL_TI_QA_PERCENT_PNL", order: 203 },
  { name: "Ratio & Proportion & Partnership", code: "SSC_CGL_TI_QA_RATIO_PROP", order: 204 },
  { name: "Averages & Mixture and Alligation", code: "SSC_CGL_TI_QA_AVERAGES_MIX", order: 205 },
  { name: "Simple & Compound Interest", code: "SSC_CGL_TI_QA_INTEREST", order: 206 },
  { name: "Time, Speed & Distance", code: "SSC_CGL_TI_QA_TSD", order: 207 },
  { name: "Time & Work", code: "SSC_CGL_TI_QA_TW", order: 208 },
  { name: "Square roots, Surds & Indices", code: "SSC_CGL_TI_QA_SURDS", order: 209 },
  { name: "Basic Algebraic identities & Graphs of linear equations", code: "SSC_CGL_TI_QA_ALGEBRA", order: 210 },
  { name: "Geometry basics: Triangles, Congruence, Similarity", code: "SSC_CGL_TI_QA_GEOMETRY_TRI", order: 211 },
  { name: "Circle: chords, tangents, angles subtended", code: "SSC_CGL_TI_QA_CIRCLE", order: 212 },
  { name: "Polygons & 3D Mensuration (Prism, Cone, Cylinder, Sphere etc.)", code: "SSC_CGL_TI_QA_MENSURATION", order: 213 },
  { name: "Trigonometry: Ratios, Degree/Radian measures, Heights & Distances", code: "SSC_CGL_TI_QA_TRIGONOMETRY", order: 214 },
  { name: "Graphs and Data Interpretation basics: Histogram, Frequency polygon, Bar, Pie", code: "SSC_CGL_TI_QA_GRAPHS", order: 215 },
];

const tier1_ENG = [
  { name: "Basic English Comprehension & Reading", code: "SSC_CGL_TI_ENG_COMPREHENSION", order: 301 },
  { name: "Vocabulary: Synonyms, Antonyms, One-word substitution", code: "SSC_CGL_TI_ENG_VOCAB", order: 302 },
  { name: "Grammar: Error spotting, Sentence correction, Tenses", code: "SSC_CGL_TI_ENG_GRAMMAR", order: 303 },
  { name: "Cloze Test, Fill in the blanks, Para jumbles", code: "SSC_CGL_TI_ENG_CLOZE", order: 304 },
  { name: "Spelling & Detecting mis-spelt words", code: "SSC_CGL_TI_ENG_SPELLING", order: 305 },
  { name: "Idioms & Phrases, Phrasal verbs", code: "SSC_CGL_TI_ENG_IDIOMS", order: 306 },
];

const p2_p1_session1_math = [
  { name: "Number Systems: computation of whole numbers, decimals, fractions", code: "SSC_CGL_P2_MATH_NUMSYS", order: 401 },
  { name: "Fundamental arithmetic operations: Percentages", code: "SSC_CGL_P2_MATH_PERCENT", order: 402 },
  { name: "Fundamental arithmetic operations: Ratio & Proportion", code: "SSC_CGL_P2_MATH_RATIO", order: 403 },
  { name: "Fundamental arithmetic operations: Square roots, Averages", code: "SSC_CGL_P2_MATH_AVERAGE_SQRT", order: 404 },
  { name: "Interest: Simple & Compound", code: "SSC_CGL_P2_MATH_INTEREST", order: 405 },
  { name: "Profit & Loss, Discount", code: "SSC_CGL_P2_MATH_PNL_DISCOUNT", order: 406 },
  { name: "Partnership Business; Mixture & Alligation", code: "SSC_CGL_P2_MATH_PARTNERSHIP_MIX", order: 407 },
  { name: "Time & Distance, Time & Work", code: "SSC_CGL_P2_MATH_TSD_TW", order: 408 },
  { name: "Basic Algebra: identities, simple surds", code: "SSC_CGL_P2_MATH_ALGEBRA_BASIC", order: 409 },
  { name: "Graphs of linear equations", code: "SSC_CGL_P2_MATH_GRAPHS_LINEAR", order: 410 },
  { name: "Geometry: Triangles and centres, Congruence and similarity", code: "SSC_CGL_P2_MATH_GEO_TRI", order: 411 },
  { name: "Common tangents, circle properties", code: "SSC_CGL_P2_MATH_GEO_CIRCLE", order: 412 },
  { name: "Mensuration: 2D & 3D solids (prism, cone, cylinder, sphere etc.)", code: "SSC_CGL_P2_MATH_MENSURATION_2D3D", order: 413 },
  { name: "Trigonometry: ratios, standard identities, heights & distances", code: "SSC_CGL_P2_MATH_TRIG", order: 414 },
  { name: "Statistics basics: histogram, freq polygon, bar, pie charts", code: "SSC_CGL_P2_MATH_STATS_BASIC", order: 415 },
];

const p2_p1_session1_reasoning = [
  { name: "Semantic Analogy & Number Analogy", code: "SSC_CGL_P2_R_SEMANTIC_ANALOGY", order: 431 },
  { name: "Symbolic/Number Analogy & Symbolic operations", code: "SSC_CGL_P2_R_SYMBOLIC", order: 432 },
  { name: "Figural Analogy, Figural Classification & Figural series", code: "SSC_CGL_P2_R_FIGURAL", order: 433 },
  { name: "Space Orientation & Space Visualization", code: "SSC_CGL_P2_R_SPACE", order: 434 },
  { name: "Venn diagrams & Drawing inferences", code: "SSC_CGL_P2_R_VENN", order: 435 },
  { name: "Punched hole / pattern-folding/unfolding", code: "SSC_CGL_P2_R_PUNCHED_PATTERN", order: 436 },
  { name: "Number Series & Trends", code: "SSC_CGL_P2_R_NUMBER_SERIES", order: 437 },
  { name: "Embedded Figures & Indexing", code: "SSC_CGL_P2_R_EMBEDDED_INDEX", order: 438 },
  { name: "Critical Thinking, Problem Solving, Emotional & Social Intelligence", code: "SSC_CGL_P2_R_CRITICAL", order: 439 },
  { name: "Coding-Decoding & Word Building", code: "SSC_CGL_P2_R_CODING_WORD", order: 440 },
];

const p2_p1_session1_english = [
  { name: "Vocabulary & Grammar: Synonyms/Antonyms", code: "SSC_CGL_P2_ENG_VOCAB", order: 501 },
  { name: "Sentence Structure & Spot the Error", code: "SSC_CGL_P2_ENG_SENT_STR", order: 502 },
  { name: "Fill in the blanks, Cloze Test", code: "SSC_CGL_P2_ENG_FILL_CLOZE", order: 503 },
  { name: "One-word substitution; Idioms & Phrases", code: "SSC_CGL_P2_ENG_ONEWORD_IDIOM", order: 504 },
  { name: "Active/Passive Voice; Direct/Indirect Speech", code: "SSC_CGL_P2_ENG_VOICE_SPEECH", order: 505 },
  { name: "Paragraph comprehension (3+ paragraphs)", code: "SSC_CGL_P2_ENG_PARACOMP", order: 506 },
];

const p2_p1_session1_general_awareness = [
  { name: "GA: History (detailed)", code: "SSC_CGL_P2_GA_HISTORY", order: 531 },
  { name: "GA: Culture & Heritage", code: "SSC_CGL_P2_GA_CULTURE", order: 532 },
  { name: "GA: Geography (India & Neighbouring)", code: "SSC_CGL_P2_GA_GEOG", order: 533 },
  { name: "GA: Economic Scene & Basic Economics", code: "SSC_CGL_P2_GA_ECONOMY", order: 534 },
  { name: "GA: General Policy & Institutions", code: "SSC_CGL_P2_GA_POLICY", order: 535 },
  { name: "GA: Scientific Research & Recent Developments", code: "SSC_CGL_P2_GA_SCI_RESEARCH", order: 536 },
  { name: "GA: Current Affairs (national & international)", code: "SSC_CGL_P2_GA_CURRENT", order: 537 },
];

const p2_p1_session1_computer = [
  { name: "Computer Basics: CPU, Input/Output, Memory, Storage", code: "SSC_CGL_P2_COMP_CPU_MEMORY", order: 601 },
  { name: "Windows OS basics & File Management (Windows Explorer)", code: "SSC_CGL_P2_COMP_WINDOWS", order: 602 },
  { name: "Keyboard shortcuts & Productivity tips", code: "SSC_CGL_P2_COMP_SHORTCUTS", order: 603 },
  { name: "MS Word: Basics (create/edit/format)", code: "SSC_CGL_P2_COMP_MS_WORD", order: 604 },
  { name: "MS Excel: Basics (cells, formulas, sorting, filtering)", code: "SSC_CGL_P2_COMP_MS_EXCEL", order: 605 },
  { name: "MS PowerPoint: Basics (slides, transitions)", code: "SSC_CGL_P2_COMP_MS_PPT", order: 606 },
  { name: "Working with Internet & E-mail: Browsing, search, attachments, e-banking", code: "SSC_CGL_P2_COMP_INTERNET_EMAIL", order: 607 },
  { name: "Basics of Networking & common protocols (LAN, WAN, TCP/IP)", code: "SSC_CGL_P2_COMP_NETWORKING", order: 608 },
  { name: "Cyber security fundamentals: viruses, worms, trojans, preventive measures", code: "SSC_CGL_P2_COMP_CYBERSEC", order: 609 },
  { name: "Backup devices, Ports and peripheral basics", code: "SSC_CGL_P2_COMP_BACKUP_PORTS", order: 610 },
  { name: "Computer Knowledge – Misc / qualifying nature", code: "SSC_CGL_P2_COMP_MISC", order: 611 },
];

const p2_p1_session2_dest = [
  { name: "DEST: Data Entry Speed Test (2000 key depressions / 15 minutes) — procedure & practice", code: "SSC_CGL_P2_DEST", order: 620 },
];

const p2_paper2_statistics = [
  { name: "Collection & Classification of Data: primary & secondary", code: "SSC_CGL_P2_STATS_COLLECTION", order: 701 },
  { name: "Tabulation & Diagrammatic presentation of frequency distributions", code: "SSC_CGL_P2_STATS_TABULATION", order: 702 },
  { name: "Graphs & Charts: Histograms, Frequency polygon, Bar, Pie", code: "SSC_CGL_P2_STATS_GRAPHS", order: 703 },
  { name: "Measures of Central Tendency: Mean, Median, Mode", code: "SSC_CGL_P2_STATS_CENTRAL", order: 711 },
  { name: "Partition values: Quartiles, Deciles, Percentiles", code: "SSC_CGL_P2_STATS_PARTITION", order: 712 },
  { name: "Measures of Dispersion: Range, Quartile deviation, Mean deviation, Standard deviation", code: "SSC_CGL_P2_STATS_DISPERSION", order: 713 },
  { name: "Measures of relative dispersion", code: "SSC_CGL_P2_STATS_RELATIVE_DISP", order: 714 },
  { name: "Moments, Skewness & Kurtosis: concepts & measures", code: "SSC_CGL_P2_STATS_MOMENTS", order: 721 },
  { name: "Correlation & Regression: Scatterplots, Pearson's r, Spearman's rank", code: "SSC_CGL_P2_STATS_CORR_REG", order: 731 },
  { name: "Multiple & Partial correlation (introductory for 3 variables)", code: "SSC_CGL_P2_STATS_MULTIPLE_PARTIAL", order: 732 },
  { name: "Probability theory: definitions, conditional probability, Bayes' theorem", code: "SSC_CGL_P2_STATS_PROBABILITY", order: 741 },
  { name: "Random variable & distributions: Binomial, Poisson, Normal, Exponential", code: "SSC_CGL_P2_STATS_DISTS", order: 742 },
  { name: "Expectation, Variance and higher moments", code: "SSC_CGL_P2_STATS_MOMENT_FUNCS", order: 743 },
  { name: "Sampling theory: population vs sample; param & statistic", code: "SSC_CGL_P2_STATS_SAMPLING_CONCEPTS", order: 751 },
  { name: "Sampling techniques: simple random, stratified, multistage, cluster, systematic, purposive, convenience, quota", code: "SSC_CGL_P2_STATS_SAMPLING_TECH", order: 752 },
  { name: "Sampling distribution (statement only) & sample size decisions", code: "SSC_CGL_P2_STATS_SAMPLING_DISTR", order: 753 },
  { name: "Point & interval estimation; properties of estimators", code: "SSC_CGL_P2_STATS_ESTIMATION", order: 761 },
  { name: "Methods of estimation: Method of moments, Maximum Likelihood, Least Squares", code: "SSC_CGL_P2_STATS_EST_METHODS", order: 762 },
  { name: "Testing of hypotheses: basics & tests based on Z, t, chi-square, F", code: "SSC_CGL_P2_STATS_HYP_TEST", order: 763 },
  { name: "Analysis of Variance (one-way & two-way)", code: "SSC_CGL_P2_STATS_ANOVA", order: 771 },
  { name: "Time Series Analysis: components, trend estimation, seasonal variation methods", code: "SSC_CGL_P2_STATS_TIME_SERIES", order: 772 },
  { name: "Index Numbers: concepts, formulae, base shifting, cost of living index", code: "SSC_CGL_P2_STATS_INDEX", order: 781 },
  { name: "Correlation/Regression applications: multiple regression intro (3 vars)", code: "SSC_CGL_P2_STATS_APP_REG", order: 791 },
  { name: "Practical/statistical inference overview (application oriented)", code: "SSC_CGL_P2_STATS_PRACTICAL", order: 792 },
];

const allTopics = [
  ...tier1_GI,
  ...tier1_GA,
  ...tier1_QA,
  ...tier1_ENG,
  ...p2_p1_session1_math,
  ...p2_p1_session1_reasoning,
  ...p2_p1_session1_english,
  ...p2_p1_session1_general_awareness,
  ...p2_p1_session1_computer,
  ...p2_p1_session2_dest,
  ...p2_paper2_statistics,
];

/* -------------------------
   Sanitizer + insertion helpers
   ------------------------- */

function sanitizeRow(row, examId, idx) {
  const name = row.name != null ? String(row.name).trim() : `topic_${idx}`;
  let code = row.code == null ? null : row.code;
  if (typeof code === "number") code = String(code);
  if (code != null && typeof code !== "string") code = String(code);
  let order = null;
  if (row.order !== undefined && row.order !== null) {
    const n = Number(row.order);
    order = Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return {
    examCategoryId: examId,
    name,
    code,
    order,
    isActive: row.isActive === undefined ? true : Boolean(row.isActive),
  };
}

async function tryCreateManySafe(prisma, batch, batchIndex) {
  try {
    const res = await prisma.examTopic.createMany({
      data: batch,
      skipDuplicates: true,
    });
    const count = (res && typeof res.count === "number") ? res.count : batch.length;
    console.log(`Batch ${batchIndex}: inserted ${count} rows`);
    return { success: true, count };
  } catch (err) {
    console.error(`Batch ${batchIndex} failed:`, err.message || err);
    // fallback: per-row insert to identify problematic rows and continue
    let inserted = 0;
    for (let i = 0; i < batch.length; i++) {
      const row = batch[i];
      try {
        await prisma.examTopic.create({ data: row });
        inserted++;
      } catch (rowErr) {
        console.error(
          `  - Row ${i} failed to insert (code=${String(row.code).slice(0,50)} order=${row.order}):`,
          rowErr.message || rowErr
        );
      }
    }
    console.log(`Batch ${batchIndex} fallback inserted ${inserted}/${batch.length} rows (per-row attempts).`);
    return { success: false, inserted };
  }
}

/* -------------------------
   Exported seed function
   ------------------------- */

export default async function seed(prisma) {
  console.log("▶ Seeding SSC CGL 2024 full syllabus topics…");

  // Upsert exam category
  const exam = await prisma.examCategory.upsert({
    where: { code: EXAM_CODE },
    update: { name: EXAM_NAME, isActive: true },
    create: { name: EXAM_NAME, code: EXAM_CODE, isActive: true },
  });

  console.log("Using ExamCategory:", exam.name, exam.id);

  // Clear existing topics (idempotent)
  try {
    const del = await prisma.examTopic.deleteMany({ where: { examCategoryId: exam.id } });
    console.log(`Cleared existing topics for ${EXAM_CODE} (${del.count ?? del})`);
  } catch (err) {
    console.error("Error clearing existing topics:", err.message || err);
  }

  // Prepare sanitized rows
  const rows = allTopics.map((t, i) => sanitizeRow(t, exam.id, i));

  // Chunk and insert with safe fallback
  const batches = chunk(rows, BATCH_SIZE);
  let totalInserted = 0;
  for (let i = 0; i < batches.length; i++) {
    const result = await tryCreateManySafe(prisma, batches[i], i + 1);
    if (result.success) totalInserted += (typeof result.count === "number" ? result.count : batches[i].length);
    else totalInserted += result.inserted || 0;
  }

  console.log(`✅ Attempted ${rows.length} inserts for ${exam.name}. Estimated inserted: ${totalInserted}.`);
}
