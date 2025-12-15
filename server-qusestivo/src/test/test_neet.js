// src/test/test_neet.js
// Safe seeder for NEET UG 2026 topics. Exports default async function seed(prisma).

const EXAM_CODE = "NEET_2025";
const EXAM_NAME = "NEET";

const physicsTopics = [
  { name: "Physics and Measurements (Units and Measurements)", code: "NEET_PHY_MEASUREMENTS", order: 1 },
  { name: "Kinematics", code: "NEET_PHY_KINEMATICS", order: 2 },
  { name: "Laws of Motion", code: "NEET_PHY_LOM", order: 3 },
  { name: "Work, Energy and Power", code: "NEET_PHY_WEP", order: 4 },
  { name: "Rotational Motion", code: "NEET_PHY_ROTATIONAL", order: 5 },
  { name: "Gravitation", code: "NEET_PHY_GRAVITATION", order: 6 },
  { name: "Properties of Solids and Liquids", code: "NEET_PHY_SOLIDS_LIQUIDS", order: 7 },
  { name: "Thermodynamics", code: "NEET_PHY_THERMODYNAMICS", order: 8 },
  { name: "Kinetic Theory of Gases", code: "NEET_PHY_KTG", order: 9 },
  { name: "Oscillation and Waves", code: "NEET_PHY_OSCILLATION_WAVES", order: 10 },
  { name: "Electrostatics", code: "NEET_PHY_ELECTROSTATICS", order: 11 },
  { name: "Current Electricity", code: "NEET_PHY_CURRENT_ELECTRICITY", order: 12 },
  { name: "Magnetic Effects of Current & Magnetism", code: "NEET_PHY_MAGNETISM", order: 13 },
  { name: "Electromagnetic Induction & Alternating Currents", code: "NEET_PHY_EMI_AC", order: 14 },
  { name: "Electromagnetic Waves", code: "NEET_PHY_EM_WAVES", order: 15 },
  { name: "Optics", code: "NEET_PHY_OPTICS", order: 16 },
  { name: "Dual Nature of Matter and Radiation", code: "NEET_PHY_DUAL_NATURE", order: 17 },
  { name: "Atoms and Nuclei", code: "NEET_PHY_ATOMS_NUCLEI", order: 18 },
  { name: "Electronic Devices", code: "NEET_PHY_ELECTRONIC_DEVICES", order: 19 },
  { name: "Experimental Skills", code: "NEET_PHY_EXPERIMENTAL_SKILLS", order: 20 },
];

const chemistryTopics = [
  { name: "Some Basic Concepts in Chemistry", code: "NEET_CHEM_BASIC_CONCEPTS", order: 101 },
  { name: "Atomic Structure", code: "NEET_CHEM_ATOMIC_STRUCTURE", order: 102 },
  { name: "Chemical Bonding and Molecular Structure", code: "NEET_CHEM_BONDING", order: 103 },
  { name: "Chemical Thermodynamics", code: "NEET_CHEM_THERMODYNAMICS", order: 104 },
  { name: "Equilibrium", code: "NEET_CHEM_EQUILIBRIUM", order: 105 },
  { name: "Redox Reactions and Electrochemistry", code: "NEET_CHEM_REDOX_ELECTRO", order: 106 },
  { name: "Solutions (Liquid Solutions)", code: "NEET_CHEM_SOLUTIONS", order: 107 },
  { name: "Chemical Kinetics", code: "NEET_CHEM_KINETICS", order: 108 },

  { name: "Classification of Elements & Periodicity", code: "NEET_CHEM_PERIODICITY", order: 151 },
  { name: "p-block Elements", code: "NEET_CHEM_P_BLOCK", order: 152 },
  { name: "d- and f-block Elements", code: "NEET_CHEM_DF_BLOCK", order: 153 },
  { name: "Coordination Compounds", code: "NEET_CHEM_COORDINATION", order: 154 },

  { name: "Basic Principles of Organic Chemistry (GOC)", code: "NEET_CHEM_GOC", order: 201 },
  { name: "Purification & Characterization of Organic Compounds", code: "NEET_CHEM_PURIFICATION", order: 202 },
  { name: "Hydrocarbons", code: "NEET_CHEM_HYDROCARBONS", order: 203 },
  { name: "Organic Compounds Containing Halogens", code: "NEET_CHEM_HALOGENS", order: 204 },
  { name: "Organic Compounds Containing Oxygen", code: "NEET_CHEM_OXYGEN_COMPOUNDS", order: 205 },
  { name: "Organic Compounds Containing Nitrogen", code: "NEET_CHEM_NITROGEN_COMPOUNDS", order: 206 },
  { name: "Biomolecules", code: "NEET_CHEM_BIOMOLECULES", order: 207 },
  { name: "Principles Related to Practical Chemistry", code: "NEET_CHEM_PRACTICAL", order: 208 },
];

const biologyTopics = [
  { name: "Diversity in Living Organisms", code: "NEET_BIO_DIVERSITY", order: 301 },
  { name: "Structural Organisation in Plants & Animals", code: "NEET_BIO_STRUCT_ORG", order: 302 },
  { name: "Cell Structure and Function", code: "NEET_BIO_CELL", order: 303 },
  { name: "Plant Physiology", code: "NEET_BIO_PLANT_PHYS", order: 304 },
  { name: "Human Physiology", code: "NEET_BIO_HUMAN_PHYS", order: 305 },
  { name: "Reproduction", code: "NEET_BIO_REPRODUCTION", order: 306 },
  { name: "Genetics and Evolution", code: "NEET_BIO_GENETICS", order: 307 },
  { name: "Biology and Human Welfare", code: "NEET_BIO_WELFARE", order: 308 },
  { name: "Biotechnology and its Applications", code: "NEET_BIO_BIOTECH", order: 309 },
  { name: "Ecology and Environment", code: "NEET_BIO_ECOLOGY", order: 310 },
];

const allNeetTopics = [...physicsTopics, ...chemistryTopics, ...biologyTopics];

const BATCH_SIZE = 200;
function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default async function seed(prisma) {
  console.log("▶ Seeding NEET UG topics...");

  // 1) ensure exam category exists
  const exam = await prisma.examCategory.upsert({
    where: { code: EXAM_CODE },
    update: { name: EXAM_NAME, isActive: true },
    create: { name: EXAM_NAME, code: EXAM_CODE, isActive: true },
  });

  console.log("Using ExamCategory:", exam.name, exam.id);

  // 2) clear existing topics for idempotency
  try {
    await prisma.examTopic.deleteMany({ where: { examCategoryId: exam.id } });
    console.log("Cleared existing topics for", EXAM_CODE);
  } catch (err) {
    console.warn("Warning clearing existing topics (continuing):", err.message || err);
  }

  // 3) prepare rows and insert in batches
  const rows = allNeetTopics.map((t) => ({
    examCategoryId: exam.id,
    name: t.name,
    code: t.code,
    order: t.order,
    isActive: true,
  }));

  const batches = chunkArray(rows, BATCH_SIZE);
  for (let i = 0; i < batches.length; i++) {
    try {
      const res = await prisma.examTopic.createMany({
        data: batches[i],
        skipDuplicates: true,
      });
      console.log(`Inserted batch ${i + 1}/${batches.length}: ${res.count ?? "?"} rows`);
    } catch (err) {
      console.error(`Error inserting batch ${i + 1}:`, err.message || err);
      // continue to next batch
    }
  }

  console.log(`✅ Finished seeding NEET topics (attempted ${rows.length} inserts in ${batches.length} batches).`);
}
