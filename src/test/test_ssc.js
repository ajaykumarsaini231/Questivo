// test_ssc.js
// Seed script to create ExamCategory + ExamTopic rows for SSC GD syllabus.
// Usage: node test_ssc.js
import prisma from "../prismaClient.js";

const SSC_EXAM_CODE = "SSC_GD_2024";

// -------------------------
// SSC GD – TOPIC LISTS
// -------------------------

const giTopics = [
  { name: "Questions on analogies", code: "SSC_GD_GI_ANALOGIES", order: 1 },
  { name: "Similarities and differences", code: "SSC_GD_GI_SIMILARITIES", order: 2 },
  { name: "Spatial visualization", code: "SSC_GD_GI_SPATIAL_VIS", order: 3 },
  { name: "Spatial orientation", code: "SSC_GD_GI_SPATIAL_ORIENT", order: 4 },
  { name: "Visual Memory", code: "SSC_GD_GI_VISUAL_MEMORY", order: 5 },
  { name: "Discrimination observation", code: "SSC_GD_GI_DISCRIMINATION", order: 6 },
  { name: "Relationship Concepts", code: "SSC_GD_GI_RELATIONSHIP", order: 7 },
  { name: "Arithmetical Reasoning", code: "SSC_GD_GI_ARITH_REASON", order: 8 },
  { name: "Figural Classification", code: "SSC_GD_GI_FIGURAL_CLASS", order: 9 },
  { name: "Arithmetic Number Series", code: "SSC_GD_GI_NUMBER_SERIES", order: 10 },
  { name: "Non-Verbal Series", code: "SSC_GD_GI_NONVERBAL_SERIES", order: 11 },
  { name: "Coding and Decoding", code: "SSC_GD_GI_CODING_DECODING", order: 12 },
];

const gkTopics = [
  { name: "India & its neighbouring countries", code: "SSC_GD_GK_INDIA_NEIGH", order: 101 },
  { name: "Sports", code: "SSC_GD_GK_SPORTS", order: 102 },
  { name: "History", code: "SSC_GD_GK_HISTORY", order: 103 },
  { name: "Culture", code: "SSC_GD_GK_CULTURE", order: 104 },
  { name: "Geography", code: "SSC_GD_GK_GEOGRAPHY", order: 105 },
  { name: "Economic Scene", code: "SSC_GD_GK_ECONOMY", order: 106 },
  { name: "General Polity", code: "SSC_GD_GK_POLITY", order: 107 },
  { name: "Indian Constitution", code: "SSC_GD_GK_CONSTI", order: 108 },
  { name: "Scientific Research", code: "SSC_GD_GK_SCI_RESEARCH", order: 109 },
  { name: "Current Affairs", code: "SSC_GD_GK_CURRENT_AFFAIRS", order: 110 },
];

const mathElementaryTopics = [
  { name: "Number Systems", code: "SSC_GD_MATH_NUMBER_SYSTEMS", order: 201 },
  { name: "Computation of Whole Numbers", code: "SSC_GD_MATH_WHOLE_COMP", order: 202 },
  { name: "Decimals and Fractions", code: "SSC_GD_MATH_DECIMALS_FRACTIONS", order: 203 },
  { name: "Relationship between Numbers", code: "SSC_GD_MATH_RELATION_NUM", order: 204 },
  { name: "Fundamental arithmetical operations", code: "SSC_GD_MATH_ARITH_OPS", order: 205 },
  { name: "Percentages", code: "SSC_GD_MATH_PERCENTAGES", order: 206 },
  { name: "Ratio and Proportion", code: "SSC_GD_MATH_RATIO_PROPORTION", order: 207 },
  { name: "Averages", code: "SSC_GD_MATH_AVERAGES", order: 208 },
  { name: "Interest", code: "SSC_GD_MATH_INTEREST", order: 209 },
  { name: "Profit and Loss", code: "SSC_GD_MATH_PROFIT_LOSS", order: 210 },
  { name: "Discount", code: "SSC_GD_MATH_DISCOUNT", order: 211 },
  { name: "Mensuration", code: "SSC_GD_MATH_MENSURATION", order: 212 },
  { name: "Time and Distance", code: "SSC_GD_MATH_TIME_DISTANCE", order: 213 },
  { name: "Ratio and Time", code: "SSC_GD_MATH_RATIO_TIME", order: 214 },
  { name: "Time and Work", code: "SSC_GD_MATH_TIME_WORK", order: 215 },
];

const englishTopics = [
  { name: "Fill in the blanks", code: "SSC_GD_ENG_FILL_BLANKS", order: 301 },
  { name: "Error Spotting", code: "SSC_GD_ENG_ERROR_SPOTTING", order: 302 },
  { name: "Phrase Replacement", code: "SSC_GD_ENG_PHRASE_REPLACE", order: 303 },
  { name: "Synonyms & Antonyms", code: "SSC_GD_ENG_SYNONYMS_ANTONYMS", order: 304 },
  { name: "Cloze Test", code: "SSC_GD_ENG_CLOZE_TEST", order: 305 },
  { name: "Phrase and idioms meaning", code: "SSC_GD_ENG_IDIOMS", order: 306 },
  { name: "Spellings", code: "SSC_GD_ENG_SPELLINGS", order: 307 },
  { name: "One Word Substitution", code: "SSC_GD_ENG_ONE_WORD_SUB", order: 308 },
  { name: "Reading comprehension", code: "SSC_GD_ENG_READING_COMP", order: 309 },
];

const hindiTopics = [
  { name: "संधि और संधि विच्छेद", code: "SSC_GD_HIN_SANDHI", order: 401 },
  { name: "उपसर्ग", code: "SSC_GD_HIN_UPSARG", order: 402 },
  { name: "प्रत्यय", code: "SSC_GD_HIN_PRATYAY", order: 403 },
  { name: "पर्यायवाची शब्द", code: "SSC_GD_HIN_PARAYAVACHI", order: 404 },
  { name: "मुहावरे और लोकोक्तियाँ", code: "SSC_GD_HIN_MUHAVARE", order: 405 },
  { name: "समासिक पदों की रचना और समास विग्रह", code: "SSC_GD_HIN_SAMAS", order: 406 },
  { name: "विपरीतार्थक (विलोम) शब्द", code: "SSC_GD_HIN_VILOM", order: 407 },
  { name: "शब्द-युग्म", code: "SSC_GD_HIN_SHABD_YUGM", order: 408 },
  { name: "वाक्यांश के लिए एक सार्थक शब्द", code: "SSC_GD_HIN_VAKYASH", order: 409 },
  { name: "संज्ञा शब्दों से विशेषण बनाना", code: "SSC_GD_HIN_SANGYA_TO_VISHESHAN", order: 410 },
  { name: "अनेकार्थक शब्द", code: "SSC_GD_HIN_ANEKARTH", order: 411 },
  { name: "वाक्य-शुद्धि", code: "SSC_GD_HIN_VAKYA_SHUDDHI", order: 412 },
  { name: "वाच्य : कर्तृवाच्य, कर्मवाच्य और भाववाच्य प्रयोग", code: "SSC_GD_HIN_VACHYA", order: 413 },
  { name: "क्रिया : सकर्मक, अकर्मक और पूर्वकालिक क्रियाएँ", code: "SSC_GD_HIN_KRIYA", order: 414 },
  { name: "शब्द-शुद्धि : अशुद्ध शब्दों का शुद्धिकरण", code: "SSC_GD_HIN_SHABD_SHUDDHI", order: 415 },
  { name: "अंग्रेजी के पारिभाषिक शब्दों के समानार्थक हिंदी शब्द", code: "SSC_GD_HIN_PARIBHASHIK", order: 416 },
  { name: "वाक्य रूपांतरण (EN ↔ HI)", code: "SSC_GD_HIN_VAKYA_RUPANTAR", order: 417 },
  { name: "कार्यालयी पत्रों से संबंधित ज्ञान", code: "SSC_GD_HIN_OFFICE_LETTER", order: 418 },
];

const allTopics = [
  ...giTopics,
  ...gkTopics,
  ...mathElementaryTopics,
  ...englishTopics,
  ...hindiTopics,
];

async function main() {
  console.log("▶ Seeding SSC GD topics…");

  // Ensure SSC GD ExamCategory exists (safe if you already seeded via another script)
  const exam = await prisma.examCategory.upsert({
    where: { code: SSC_EXAM_CODE },
    update: {},
    create: {
      name: "SSC GD Syllabus",
      code: SSC_EXAM_CODE,
      isActive: true,
    },
  });

  console.log("Using ExamCategory:", exam.name, exam.id);

  // Optional: clear old topics for this exam, so script is idempotent
  await prisma.examTopic.deleteMany({
    where: { examCategoryId: exam.id },
  });

  // Insert topics
  // createMany is faster; if you need per-row processing or want to preserve some existing rows,
  // replace with upserts.
  await prisma.examTopic.createMany({
    data: allTopics.map((t) => ({
      examCategoryId: exam.id,
      name: t.name,
      code: t.code,
      order: t.order,
      isActive: true,
    })),
  });

  console.log(`✅ Inserted ${allTopics.length} topics for SSC GD.`);

  await prisma.$disconnect();
}

main()
  .catch((err) => {
    console.error("Error seeding SSC GD topics:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
