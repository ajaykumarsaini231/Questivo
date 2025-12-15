// src/test/test_gate_ce.js
// Safe and robust seeder for GATE CE (Civil Engineering) topics.
// Usage: master seeder should import and call seed(prisma)

const EXAM_CODE = "GATE_CE";
const EXAM_NAME = "GATE CE – Civil Engineering";
const BATCH_SIZE = 200;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// -------------------------
// Section topics
// -------------------------
const mathTopics = [
  { name: "Linear Algebra: Matrix algebra; Systems of linear equations; Eigen values & vectors", code: "GATE_CE_MATH_LINEAR_ALG", order: 100 },
  { name: "Calculus: Single variable, limits, continuity, differentiability, Taylor series, integrals, vector calculus", code: "GATE_CE_MATH_CALCULUS", order: 101 },
  { name: "Ordinary Differential Equations: First order, higher order linear, Euler-Cauchy, IVP & BVP", code: "GATE_CE_MATH_ODE", order: 102 },
  { name: "Partial Differential Equations: Fourier series, separation of variables, diffusion, wave & Laplace equations", code: "GATE_CE_MATH_PDE", order: 103 },
  { name: "Probability & Statistics: Sampling theorems, conditional probability, descriptive statistics, distributions, regression", code: "GATE_CE_MATH_PROB_STAT", order: 104 },
  { name: "Numerical Methods: Error analysis, root finding, interpolation, numeric differentiation/integration, ODE methods", code: "GATE_CE_MATH_NUMERICAL", order: 105 },
];

const structuralTopics = [
  { name: "Engineering Mechanics: Forces, FBD, equilibrium, internal forces, friction, centre of mass, SDOF vibrations", code: "GATE_CE_STRUCT_MECH", order: 200 },
  { name: "Solid Mechanics: Bending moment & shear in beams; stress-strain; bending & shear stresses; torsion; buckling", code: "GATE_CE_SOLID_MECH", order: 201 },
  { name: "Structural Analysis: Determinate/indeterminate structures, energy methods, superposition, trusses, arches, frames", code: "GATE_CE_STRUCT_ANALYSIS", order: 202 },
  { name: "Displacement Methods: Slope-deflection, moment distribution, stiffness & flexibility methods, influence lines", code: "GATE_CE_DISP_METHODS", order: 203 },
  { name: "Construction Materials & Management: Steel properties, concrete constituents, mix design, project planning, PERT/CPM", code: "GATE_CE_MATERIALS_MGMT", order: 204 },
  { name: "Concrete Structures: Working stress & limit state, design of beams, slabs, columns, bond, prestressed concrete", code: "GATE_CE_CONCRETE", order: 205 },
  { name: "Steel Structures: Design of tension/compression members, beams, beam-columns, connections, plate girders, plastic analysis", code: "GATE_CE_STEEL", order: 206 },
];

const geotechTopics = [
  { name: "Soil Mechanics: Three-phase system, index properties, soil classification", code: "GATE_CE_SOIL_BASIC", order: 300 },
  { name: "Permeability & Seepage: 1D & 2D flow, flow nets, uplift, piping, seepage forces", code: "GATE_CE_SEEPAGE", order: 301 },
  { name: "Effective Stress & Consolidation: Principle of effective stress, consolidation theory, time rate", code: "GATE_CE_EFFECTIVE_CONSOL", order: 302 },
  { name: "Shear Strength & Stress-Strain: Mohr's circle, strength parameters, stress paths", code: "GATE_CE_SHEAR_STRENGTH", order: 303 },
  { name: "Compaction & Properties: Compaction, index properties, behavior of clays & sands", code: "GATE_CE_COMPACTION", order: 304 },
  { name: "Subsurface Investigations: Boreholes, sampling, plate load, SPT, CPT", code: "GATE_CE_SUBSURF_INVEST", order: 305 },
  { name: "Earth Pressure & Slope Stability: Rankine, Coulomb, slope methods, Bishop's method", code: "GATE_CE_EARTH_PRESSURE", order: 306 },
  { name: "Bearing Capacity & Shallow Foundations: Terzaghi, Meyerhof, effect of water table, combined footing, raft", code: "GATE_CE_BEARING_SHALLOW", order: 307 },
  { name: "Settlement Analysis & Deep Foundations: Settlement in sands/clays, piles: axial capacity, group efficiency, lateral loading", code: "GATE_CE_SETTLEMENT_PILES", order: 308 },
];

const waterTopics = [
  { name: "Fluid Mechanics: Properties, fluid statics, continuity, momentum, energy, potential flow, boundary layer", code: "GATE_CE_FLUID_MECH", order: 400 },
  { name: "Hydraulics: Immersed body forces, flow measurement, dimensional analysis, channel hydraulics, hydraulic jump", code: "GATE_CE_HYDRAULICS", order: 401 },
  { name: "Hydrology: Hydrologic cycle, precipitation, infiltration, unit hydrographs, reservoir capacity, flood estimation", code: "GATE_CE_HYDROLOGY", order: 402 },
  { name: "Irrigation Engineering: Irrigation systems, crop water requirements, gravity dams, spillways, canal design, weirs", code: "GATE_CE_IRRIGATION", order: 403 },
  { name: "Pipes & Networks: Flow in pipes, networks, laminar/turbulent flow, pump and pipe design basics", code: "GATE_CE_PIPES_NETWORKS", order: 404 },
];

const envTopics = [
  { name: "Water Quality & Treatment: Water quality parameters, unit processes, drinking water treatment, distribution", code: "GATE_CE_ENV_WATER", order: 500 },
  { name: "Waste Water & Sewage: Sewage quantity, primary & secondary treatment, sludge disposal, reuse", code: "GATE_CE_ENV_WASTEWATER", order: 501 },
  { name: "Air Pollution: Pollutants, sources, impacts, control, air quality index", code: "GATE_CE_ENV_AIR", order: 502 },
  { name: "Solid Waste Management: Generation, collection, transport, treatment, disposal, recycling & energy recovery", code: "GATE_CE_ENV_SW", order: 503 },
];

const transportTopics = [
  { name: "Geometric Design of Highways: Cross-section, sight distances, horizontal & vertical alignment", code: "GATE_CE_TRANS_GEOMETRIC_HIGHWAY", order: 600 },
  { name: "Railway Geometric Design: Track geometry, speed, cant", code: "GATE_CE_TRANS_RAILWAY", order: 601 },
  { name: "Airport Runway Design Basics: Runway length calculations, taxiway design", code: "GATE_CE_TRANS_AIRPORT", order: 602 },
  { name: "Highway Pavements: Materials, properties, flexible & rigid pavement design (IRC methods)", code: "GATE_CE_TRANS_PAVEMENTS", order: 603 },
  { name: "Traffic Engineering: Flow & speed, peak hour factor, capacity, signal design, intersections", code: "GATE_CE_TRANS_TRAFFIC", order: 604 },
];

const geomaticsTopics = [
  { name: "Surveying Principles: Levelling, traversing, triangulation, errors & adjustments", code: "GATE_CE_GEOM_SURVEY", order: 700 },
  { name: "Distance & Angle Measurement: Total station, electronic distance measurement, levelling", code: "GATE_CE_GEOM_MEASUREMENT", order: 701 },
  { name: "Curves & Traverses: Horizontal & vertical curves, coordinate systems, map scales", code: "GATE_CE_GEOM_CURVES", order: 702 },
  { name: "Photogrammetry & Remote Sensing: Scale, flying height, basics of RS and GIS", code: "GATE_CE_GEOM_PHOTOGRAM", order: 703 },
];

const allTopics = [
  ...mathTopics,
  ...structuralTopics,
  ...geotechTopics,
  ...waterTopics,
  ...envTopics,
  ...transportTopics,
  ...geomaticsTopics,
];

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
