// =========================
// Engineering Mathematics
// =========================
const mathTopics = [
  { name: "Linear Algebra: Matrices, systems of linear equations, eigenvalues & eigenvectors", code: "GATE_ME_MATH_LINEAR_ALG", order: 100 },
  { name: "Calculus: Limits, continuity, differentiation, integration, maxima & minima", code: "GATE_ME_MATH_CALCULUS", order: 101 },
  { name: "Differential Equations: First order, higher order linear ODEs", code: "GATE_ME_MATH_ODE", order: 102 },
  { name: "Probability & Statistics: Random variables, distributions, mean, variance", code: "GATE_ME_MATH_PROB_STAT", order: 103 },
  { name: "Numerical Methods: Root finding, interpolation, numerical integration", code: "GATE_ME_MATH_NUMERICAL", order: 104 },
];

// =========================
// Engineering Mechanics
// =========================
const mechanicsTopics = [
  { name: "Statics: Forces, moments, equilibrium, friction", code: "GATE_ME_MECH_STATICS", order: 200 },
  { name: "Dynamics: Kinematics, kinetics, work-energy, impulse-momentum", code: "GATE_ME_MECH_DYNAMICS", order: 201 },
  { name: "Vibrations: Free & forced vibrations, damping, resonance", code: "GATE_ME_MECH_VIBRATIONS", order: 202 },
];

// =========================
// Strength of Materials
// =========================
const somTopics = [
  { name: "Stress & Strain: Elastic constants, axial loading", code: "GATE_ME_SOM_STRESS_STRAIN", order: 300 },
  { name: "Bending & Shear: BMD, SFD, bending stress", code: "GATE_ME_SOM_BENDING", order: 301 },
  { name: "Torsion: Circular shafts, power transmission", code: "GATE_ME_SOM_TORSION", order: 302 },
  { name: "Buckling: Euler buckling, columns", code: "GATE_ME_SOM_BUCKLING", order: 303 },
];

// =========================
// Theory of Machines
// =========================
const tomTopics = [
  { name: "Kinematics of Machines: Mechanisms, velocity & acceleration analysis", code: "GATE_ME_TOM_KINEMATICS", order: 400 },
  { name: "Dynamics of Machines: Flywheel, governors, balancing", code: "GATE_ME_TOM_DYNAMICS", order: 401 },
  { name: "Cams & Gears: Cam mechanisms, gear trains", code: "GATE_ME_TOM_CAMS_GEARS", order: 402 },
];

// =========================
// Thermodynamics
// =========================
const thermoTopics = [
  { name: "Basic Concepts: Properties, laws of thermodynamics", code: "GATE_ME_THERMO_BASIC", order: 500 },
  { name: "Availability & Exergy: Second law analysis", code: "GATE_ME_THERMO_EXERGY", order: 501 },
  { name: "Gas Power Cycles: Otto, Diesel, Brayton", code: "GATE_ME_THERMO_GAS_CYCLES", order: 502 },
  { name: "Vapor Power Cycles: Rankine cycle", code: "GATE_ME_THERMO_VAPOR_CYCLES", order: 503 },
];

// =========================
// Heat Transfer
// =========================
const heatTransferTopics = [
  { name: "Conduction: Steady & unsteady heat conduction", code: "GATE_ME_HT_CONDUCTION", order: 600 },
  { name: "Convection: Free & forced convection", code: "GATE_ME_HT_CONVECTION", order: 601 },
  { name: "Radiation: Radiation properties, view factors", code: "GATE_ME_HT_RADIATION", order: 602 },
  { name: "Heat Exchangers: LMTD, NTU methods", code: "GATE_ME_HT_HEAT_EXCHANGERS", order: 603 },
];

// =========================
// Fluid Mechanics
// =========================
const fluidTopics = [
  { name: "Fluid Properties & Statics", code: "GATE_ME_FM_STATICS", order: 700 },
  { name: "Kinematics & Dynamics of Flow", code: "GATE_ME_FM_DYNAMICS", order: 701 },
  { name: "Flow Through Pipes: Losses, networks", code: "GATE_ME_FM_PIPES", order: 702 },
  { name: "Turbomachinery: Pumps & turbines", code: "GATE_ME_FM_TURBOMACHINERY", order: 703 },
];

// =========================
// Manufacturing Engineering
// =========================
const manufacturingTopics = [
  { name: "Casting & Forming Processes", code: "GATE_ME_MAN_CASTING_FORMING", order: 800 },
  { name: "Machining Processes", code: "GATE_ME_MAN_MACHINING", order: 801 },
  { name: "Joining Processes: Welding, brazing", code: "GATE_ME_MAN_JOINING", order: 802 },
  { name: "Metrology & Inspection", code: "GATE_ME_MAN_METROLOGY", order: 803 },
];

// =========================
// Industrial Engineering
// =========================
const industrialTopics = [
  { name: "Engineering Economics", code: "GATE_ME_IE_ECONOMICS", order: 900 },
  { name: "Operations Research", code: "GATE_ME_IE_OR", order: 901 },
  { name: "Production Planning & Control", code: "GATE_ME_IE_PPC", order: 902 },
  { name: "Quality Control & Reliability", code: "GATE_ME_IE_QUALITY", order: 903 },
];

// =========================
// ALL TOPICS (FINAL)
// =========================
const allTopics = [
  ...mathTopics,
  ...mechanicsTopics,
  ...somTopics,
  ...tomTopics,
  ...thermoTopics,
  ...heatTransferTopics,
  ...fluidTopics,
  ...manufacturingTopics,
  ...industrialTopics,
];


// src/test/test_gate_ce.js
// Safe and robust seeder for GATE CE (Civil Engineering) topics.
// Usage: master seeder should import and call seed(prisma)

const EXAM_CODE = "GATE_ME";
const EXAM_NAME = "GATE ME – Mechanical Engineering";
const BATCH_SIZE = 200;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}


// -------------------------
// Sanitizer + insertion helpers
// -------------------------
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
    // fallback to per-row
    let inserted = 0;
    for (let i = 0; i < batch.length; i++) {
      const row = batch[i];
      try {
        await prisma.examTopic.create({ data: row });
        inserted++;
      } catch (rowErr) {
        console.error(
          `  - Row ${i} failed (code=${String(row.code).slice(0, 80)} order=${row.order}):`,
          rowErr.message || rowErr
        );
      }
    }
    console.log(`Batch ${batchIndex} fallback inserted ${inserted}/${batch.length} rows.`);
    return { success: false, inserted };
  }
}

// -------------------------
// Exported API for master seeder
// -------------------------
export default async function seed(prisma) {
  console.log("▶ Seeding GATE CE topics…");

  // ensure ExamCategory exists
  const exam = await prisma.examCategory.upsert({
    where: { code: EXAM_CODE },
    update: { name: EXAM_NAME, isActive: true },
    create: { name: EXAM_NAME, code: EXAM_CODE, isActive: true },
  });

  console.log("Using ExamCategory:", exam.name, exam.id);

  // clear old topics
  try {
    const del = await prisma.examTopic.deleteMany({ where: { examCategoryId: exam.id } });
    console.log(`Cleared existing topics for ${EXAM_CODE} (${del.count ?? del})`);
  } catch (err) {
    console.error("Error clearing existing topics:", err.message || err);
  }

  // prepare rows
  const rows = allTopics.map((t, i) => sanitizeRow(t, exam.id, i));

  // chunk + insert
  const batches = chunk(rows, BATCH_SIZE);
  let totalInserted = 0;
  for (let i = 0; i < batches.length; i++) {
    const result = await tryCreateManySafe(prisma, batches[i], i + 1);
    if (result.success) totalInserted += (typeof result.count === "number" ? result.count : batches[i].length);
    else totalInserted += result.inserted || 0;
  }

  console.log(`✅ Attempted ${rows.length} inserts for ${exam.name}. Estimated inserted: ${totalInserted}.`);
}
