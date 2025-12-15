// src/test/test_gate_mt.js
// Safe and robust seeder for GATE MT (Metallurgical Engineering) topics.
// Exports default async function seed(prisma) which accepts a PrismaClient instance.

const EXAM_CODE = "GATE_MT";
const EXAM_NAME = "GATE MT – Metallurgical Engineering";

const BATCH_SIZE = 200;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// -------------------------
// Topics (sections)
// -------------------------
const mathTopics = [
  { name: "Linear Algebra: Matrices, determinants, systems of linear equations, eigenvalues & eigenvectors", code: "GATE_MT_MATH_LINEAR_ALG", order: 100 },
  { name: "Calculus: Limits, continuity, differentiability, maxima/minima, sequences & series, Fourier series", code: "GATE_MT_MATH_CALCULUS", order: 101 },
  { name: "Vector Calculus: Gradient, divergence, curl, line/surface/volume integrals; Stokes/Gauss/Green theorems", code: "GATE_MT_MATH_VECTOR_CALC", order: 102 },
  { name: "Differential Equations: ODEs (first order, higher order), Cauchy/Euler, Laplace transforms, PDEs (Laplace, heat, wave)", code: "GATE_MT_MATH_DIFF_EQ", order: 103 },
  { name: "Probability & Statistics: Probability, sampling theorems, mean/median/mode, distributions, least squares", code: "GATE_MT_MATH_PROB_STAT", order: 104 },
  { name: "Numerical Methods: Root-finding (Bisection, Secant, Newton), numerical integration, ODE methods", code: "GATE_MT_MATH_NUMERICAL", order: 105 },
];

const thermoTopics = [
  { name: "Laws of Thermodynamics: First & Second law, entropy, enthalpy, Gibbs/Helmholtz free energy", code: "GATE_MT_THERMO_LAWS", order: 200 },
  { name: "Chemical Potential & Maxwell Relations; Thermodynamic identities", code: "GATE_MT_THERMO_MAXWELL", order: 201 },
  { name: "Phase Equilibria & Diagrams: Gibbs phase rule, binary phase diagrams, lever rule, free-energy vs composition", code: "GATE_MT_THERMO_PHASE", order: 202 },
  { name: "Solution Thermodynamics: Ideal & regular solutions, activity, equilibrium constant", code: "GATE_MT_THERMO_SOLUTIONS", order: 203 },
  { name: "Ellingham & Stability Diagrams; Thermodynamics of defects, surfaces, adsorption & segregation", code: "GATE_MT_THERMO_ELLINGHAM", order: 204 },
  { name: "Electrochemistry: Electrode potentials, Nernst equation, Pourbaix (E-pH) diagrams", code: "GATE_MT_THERMO_ELECTRO", order: 205 },
];

const transportTopics = [
  { name: "Momentum Transfer: Viscosity, shell balances, Bernoulli, flow past surfaces/pipes", code: "GATE_MT_TRANSPORT_MOMENTUM", order: 300 },
  { name: "Heat Transfer: Conduction, 1-D steady conduction", code: "GATE_MT_TRANSPORT_HEAT_COND", order: 301 },
  { name: "Convection & Radiation: Forced convection correlations, Stefan-Boltzmann", code: "GATE_MT_TRANSPORT_CONV_RAD", order: 302 },
  { name: "Mass Transfer: Diffusion, Fick's laws, mass transfer coefficients", code: "GATE_MT_TRANSPORT_MASS", order: 303 },
  { name: "Dimensional Analysis: Buckingham Pi, dimensionless numbers", code: "GATE_MT_TRANSPORT_DIM_ANAL", order: 304 },
  { name: "Kinetics: First order reactions, Arrhenius, heterogeneous kinetics", code: "GATE_MT_TRANSPORT_KINETICS", order: 305 },
  { name: "Electrochemical Kinetics: Polarization, electrode reaction rates", code: "GATE_MT_TRANSPORT_ELEC_KIN", order: 306 },
];

const extractiveTopics = [
  { name: "Comminution & Size Classification", code: "GATE_MT_EXTR_COMMINUTION", order: 400 },
  { name: "Beneficiation Methods", code: "GATE_MT_EXTR_BENEFICIATION", order: 401 },
  { name: "Agglomeration: Sintering, Pelletizing, Briquetting", code: "GATE_MT_EXTR_AGGLOMERATION", order: 402 },
  { name: "Material & Energy Balances", code: "GATE_MT_EXTR_BALANCES", order: 403 },
  { name: "Extraction of Non-Ferrous Metals", code: "GATE_MT_EXTR_NONFERROUS", order: 404 },
  { name: "Iron Making: Blast Furnace, Coke, Slag", code: "GATE_MT_EXTR_IRON_MAKING", order: 405 },
  { name: "Alternative Iron Making", code: "GATE_MT_EXTR_ALT_IRON", order: 406 },
  { name: "Primary Steelmaking (BOF, EAF)", code: "GATE_MT_EXTR_PRIMARY_STEEL", order: 407 },
  { name: "Secondary Steelmaking", code: "GATE_MT_EXTR_SECONDARY_STEEL", order: 408 },
  { name: "Continuous Casting", code: "GATE_MT_EXTR_CONT_CAST", order: 409 },
];

const physicalTopics = [
  { name: "Chemical Bonding & Crystal Structures", code: "GATE_MT_PHYS_BOND_STRUCT", order: 500 },
  { name: "XRD & Microstructure Characterization", code: "GATE_MT_PHYS_XRD", order: 501 },
  { name: "Crystal Defects: Point, Line, Surface", code: "GATE_MT_PHYS_DEFECTS", order: 502 },
  { name: "Diffusion in Solids", code: "GATE_MT_PHYS_DIFFUSION", order: 503 },
  { name: "Phase Transformations & Solidification", code: "GATE_MT_PHYS_PHASE_TRANS", order: 504 },
  { name: "Solid State Transformations", code: "GATE_MT_PHYS_SOLID_STATE", order: 505 },
  { name: "Heat Treatment (TTT, CCT, Hardening)", code: "GATE_MT_PHYS_HEAT_TREAT", order: 506 },
  { name: "Electronic, Magnetic & Optical Properties", code: "GATE_MT_PHYS_PROPERTIES", order: 507 },
  { name: "Corrosion & Prevention", code: "GATE_MT_PHYS_CORROSION", order: 508 },
];

const mechTopics = [
  { name: "Stress & Strain; Mohr's Circle", code: "GATE_MT_MECH_STRESS_STRAIN", order: 600 },
  { name: "Dislocation Theory", code: "GATE_MT_MECH_DISLOC", order: 601 },
  { name: "Strengthening Mechanisms", code: "GATE_MT_MECH_STRENGTHEN", order: 602 },
  { name: "Fracture Mechanics", code: "GATE_MT_MECH_FRACTURE", order: 603 },
  { name: "Fatigue", code: "GATE_MT_MECH_FATIGUE", order: 604 },
  { name: "Creep & High Temperature Deformation", code: "GATE_MT_MECH_CREEP", order: 605 },
];

const manufTopics = [
  { name: "Metal Casting", code: "GATE_MT_MANUF_CASTING", order: 700 },
  { name: "Metal Forming", code: "GATE_MT_MANUF_FORMING", order: 701 },
  { name: "Metal Joining & Welding Metallurgy", code: "GATE_MT_MANUF_JOINING", order: 702 },
  // FIXED: powder metallurgy had incorrect shape previously (code as number and missing order).
  { name: "Powder Metallurgy: Powder production, compaction, sintering", code: "GATE_MT_MANUF_POWDER", order: 703 },
  { name: "NDT Techniques", code: "GATE_MT_MANUF_NDT", order: 704 },
];

const allTopics = [
  ...mathTopics,
  ...thermoTopics,
  ...transportTopics,
  ...extractiveTopics,
  ...physicalTopics,
  ...mechTopics,
  ...manufTopics,
];

// -------------------------
// Helpers: sanitize + insertion with fallback
// -------------------------
function sanitizeRow(row, examId, idx) {
  // Ensure required shape: examCategoryId, name (string), code (string|null), order (int|null), isActive (bool)
  const name = row.name != null ? String(row.name).trim() : `topic_${idx}`;
  let code = row.code == null ? null : row.code;
  // convert numeric codes to strings
  if (typeof code === "number") code = String(code);
  if (code != null && typeof code !== "string") code = String(code);

  // ensure order is number or null
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
    const count = (res && typeof res.count === "number") ? res.count : "(unknown)";
    console.log(`Batch ${batchIndex}: inserted ${count} rows`);
    return { success: true, count };
  } catch (err) {
    console.error(`Batch ${batchIndex} failed:`, err.message || err);
    // fallback: try per-row inserts to identify problematic rows, continue on errors
    let inserted = 0;
    for (let i = 0; i < batch.length; i++) {
      const row = batch[i];
      try {
        // use create with skipDuplicates logic by catching unique constraint errors
        await prisma.examTopic.create({ data: row });
        inserted++;
      } catch (rowErr) {
        // log problematic row (avoid huge dumps; show code + name + order)
        console.error(
          `  - Row ${i} failed to insert (code=${String(row.code).slice(0,50)} order=${row.order}):`,
          rowErr.message || rowErr
        );
        // continue to next row
      }
    }
    console.log(`Batch ${batchIndex} fallback inserted ${inserted}/${batch.length} rows (per-row attempts).`);
    return { success: false, inserted };
  }
}

// -------------------------
// Exported seed function
// -------------------------
export default async function seed(prisma) {
  console.log("▶ Seeding GATE MT topics…");

  // Ensure ExamCategory exists (upsert)
  const exam = await prisma.examCategory.upsert({
    where: { code: EXAM_CODE },
    update: { name: EXAM_NAME, isActive: true },
    create: { name: EXAM_NAME, code: EXAM_CODE, isActive: true },
  });

  console.log("Using ExamCategory:", exam.name, exam.id);

  // Clear old topics for this category
  try {
    const del = await prisma.examTopic.deleteMany({ where: { examCategoryId: exam.id } });
    console.log(`Cleared existing topics for ${EXAM_CODE} (${del.count ?? del})`);
  } catch (err) {
    console.error("Error clearing existing topics:", err.message || err);
    // continue anyway
  }

  // Prepare rows and sanitize
  const rows = allTopics.map((t, i) => sanitizeRow(t, exam.id, i));

  // Chunk and insert with safe fallback
  const batches = chunk(rows, BATCH_SIZE);
  let totalInserted = 0;
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const result = await tryCreateManySafe(prisma, batch, i + 1);
    if (result.success) {
      totalInserted += result.count && typeof result.count === "number" ? result.count : batch.length;
    } else {
      totalInserted += result.inserted || 0;
    }
  }

  console.log(`✅ Attempted ${rows.length} inserts for ${exam.name}. Estimated inserted: ${totalInserted}.`);
}
