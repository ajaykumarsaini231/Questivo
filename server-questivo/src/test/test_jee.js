// src/test/test_jee.js
// Safe seeder for JEE Main topics. Exports default async function seed(prisma).
// Designed to be called by your master all_test.js which provides a single PrismaClient.

const JEE_EXAM_CODE = "NTA_JEE_MAIN_2025";
const JEE_EXAM_NAME = "NTA JEE Mains";

// =========================
// JEE MAIN – TOPIC LISTS
// =========================

const mathTopics = [
  { name: "Math – Sets, Relations and Functions", code: "MATH_UNIT_1", order: 1 },
  { name: "Math – Complex Numbers and Quadratic Equations", code: "MATH_UNIT_2", order: 2 },
  { name: "Math – Matrices and Determinants", code: "MATH_UNIT_3", order: 3 },
  { name: "Math – Permutations and Combinations", code: "MATH_UNIT_4", order: 4 },
  { name: "Math – Binomial Theorem and its Simple Applications", code: "MATH_UNIT_5", order: 5 },
  { name: "Math – Sequence and Series", code: "MATH_UNIT_6", order: 6 },
  { name: "Math – Limit, Continuity and Differentiability", code: "MATH_UNIT_7", order: 7 },
  { name: "Math – Integral Calculus", code: "MATH_UNIT_8", order: 8 },
  { name: "Math – Differential Equations", code: "MATH_UNIT_9", order: 9 },
  { name: "Math – Coordinate Geometry", code: "MATH_UNIT_10", order: 10 },
  { name: "Math – Three Dimensional Geometry", code: "MATH_UNIT_11", order: 11 },
  { name: "Math – Vector Algebra", code: "MATH_UNIT_12", order: 12 },
  { name: "Math – Statistics and Probability", code: "MATH_UNIT_13", order: 13 },
  { name: "Math – Trigonometry", code: "MATH_UNIT_14", order: 14 },
];

const physicsTopics = [
  { name: "Physics – Units and Measurements", code: "PHY_UNIT_1", order: 101 },
  { name: "Physics – Kinematics", code: "PHY_UNIT_2", order: 102 },
  { name: "Physics – Laws of Motion", code: "PHY_UNIT_3", order: 103 },
  { name: "Physics – Work, Energy and Power", code: "PHY_UNIT_4", order: 104 },
  { name: "Physics – Rotational Motion", code: "PHY_UNIT_5", order: 105 },
  { name: "Physics – Gravitation", code: "PHY_UNIT_6", order: 106 },
  { name: "Physics – Properties of Solids and Liquids", code: "PHY_UNIT_7", order: 107 },
  { name: "Physics – Thermodynamics", code: "PHY_UNIT_8", order: 108 },
  { name: "Physics – Kinetic Theory of Gases", code: "PHY_UNIT_9", order: 109 },
  { name: "Physics – Oscillations and Waves", code: "PHY_UNIT_10", order: 110 },
  { name: "Physics – Electrostatics", code: "PHY_UNIT_11", order: 111 },
  { name: "Physics – Current Electricity", code: "PHY_UNIT_12", order: 112 },
  { name: "Physics – Magnetic Effects of Current and Magnetism", code: "PHY_UNIT_13", order: 113 },
  { name: "Physics – Electromagnetic Induction and Alternating Currents", code: "PHY_UNIT_14", order: 114 },
  { name: "Physics – Electromagnetic Waves", code: "PHY_UNIT_15", order: 115 },
  { name: "Physics – Optics", code: "PHY_UNIT_16", order: 116 },
  { name: "Physics – Dual Nature of Matter and Radiation", code: "PHY_UNIT_17", order: 117 },
  { name: "Physics – Atoms and Nuclei", code: "PHY_UNIT_18", order: 118 },
  { name: "Physics – Electronic Devices", code: "PHY_UNIT_19", order: 119 },
  { name: "Physics – Experimental Skills", code: "PHY_UNIT_20", order: 120 },
];

const chemistryTopics = [
  { name: "Chemistry – Some Basic Concepts in Chemistry", code: "CHEM_UNIT_1", order: 201 },
  { name: "Chemistry – Atomic Structure", code: "CHEM_UNIT_2", order: 202 },
  { name: "Chemistry – Chemical Bonding and Molecular Structure", code: "CHEM_UNIT_3", order: 203 },
  { name: "Chemistry – Chemical Thermodynamics", code: "CHEM_UNIT_4", order: 204 },
  { name: "Chemistry – Solutions", code: "CHEM_UNIT_5", order: 205 },
  { name: "Chemistry – Equilibrium", code: "CHEM_UNIT_6", order: 206 },
  { name: "Chemistry – Redox Reactions and Electrochemistry", code: "CHEM_UNIT_7", order: 207 },
  { name: "Chemistry – Chemical Kinetics", code: "CHEM_UNIT_8", order: 208 },
  { name: "Chemistry – Classification of Elements and Periodicity in Properties", code: "CHEM_UNIT_9", order: 209 },
  { name: "Chemistry – p-Block Elements", code: "CHEM_UNIT_10", order: 210 },
  { name: "Chemistry – d- and f-Block Elements", code: "CHEM_UNIT_11", order: 211 },
  { name: "Chemistry – Coordination Compounds", code: "CHEM_UNIT_12", order: 212 },
  { name: "Chemistry – Purification and Characterisation of Organic Compounds", code: "CHEM_UNIT_13", order: 213 },
  { name: "Chemistry – Some Basic Principles of Organic Chemistry", code: "CHEM_UNIT_14", order: 214 },
  { name: "Chemistry – Hydrocarbons", code: "CHEM_UNIT_15", order: 215 },
  { name: "Chemistry – Organic Compounds containing Halogens", code: "CHEM_UNIT_16", order: 216 },
  { name: "Chemistry – Organic Compounds containing Oxygen", code: "CHEM_UNIT_17", order: 217 },
  { name: "Chemistry – Organic Compounds containing Nitrogen", code: "CHEM_UNIT_18", order: 218 },
  { name: "Chemistry – Biomolecules", code: "CHEM_UNIT_19", order: 219 },
  { name: "Chemistry – Principles related to Practical Chemistry", code: "CHEM_UNIT_20", order: 220 },
];

const allTopics = [...mathTopics, ...physicsTopics, ...chemistryTopics];

const BATCH_SIZE = 200;

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export default async function seed(prisma) {
  console.log("▶ Seeding JEE Main topics (safe batched seeder)...");

  // 1) ensure exam category exists (upsert)
  const exam = await prisma.examCategory.upsert({
    where: { code: JEE_EXAM_CODE },
    update: { name: JEE_EXAM_NAME, isActive: true },
    create: { name: JEE_EXAM_NAME, code: JEE_EXAM_CODE, isActive: true },
  });

  const examId = exam.id;
  console.log("Using ExamCategory:", exam.name, exam.id);

  // 2) clear previous topics for this exam (idempotent)
  try {
    await prisma.examTopic.deleteMany({ where: { examCategoryId: examId } });
    console.log("Cleared existing topics for", JEE_EXAM_CODE);
  } catch (err) {
    console.warn("Warning: failed to clear old topics (continuing):", err.message || err);
  }

  // 3) prepare payload
  const rows = allTopics.map((t) => ({
    examCategoryId: examId,
    name: t.name,
    code: t.code,
    order: t.order,
    isActive: true,
  }));

  // 4) batch insert with try/catch and skipDuplicates
  const batches = chunkArray(rows, BATCH_SIZE);
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    try {
      const res = await prisma.examTopic.createMany({
        data: batch,
        skipDuplicates: true, // safe if some already exist
      });
      console.log(`Inserted batch ${i + 1}/${batches.length}: ${res.count ?? "?"} rows`);
    } catch (err) {
      // Log the error for diagnostics but continue with next batches
      console.error(`Error inserting batch ${i + 1}:`, err.message || err);
      // If you want to stop on first failure, uncomment:
      // throw err;
    }
  }

  console.log(`✅ Finished seeding JEE topics (attempted ${rows.length} inserts in ${batches.length} batches).`);
}
