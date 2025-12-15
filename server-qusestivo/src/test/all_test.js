
import readline from "readline";
import prisma from "../prismaClient.js";
// const  = new PrismaClient();

// list of seed modules (files must be in same folder)
// ensure the filenames match your seed files and export default async function or named seed
const seedModules = [
  "./cate_test.js",
  "./test_delhipolice_hcm.js",
  "./test_gate_ce.js",
  "./test_gate_cse_2026.js",
  "./test_gate_mt.js",
  "./test_jee.js",
  "./test_neet.js",
  "./test_ssc.js",
  "./test_ssc_cgl.js",
];

function promptYes(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim().toUpperCase() === "YES");
    });
  });
}

async function wait(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function safeDeleteMany(modelName, fnDelete) {
  const MAX_RETRIES = 5;
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      attempt++;
      const res = await fnDelete();
      console.log(`Deleted ${res.count ?? res} rows from ${modelName} (attempt ${attempt})`);
      return res;
    } catch (err) {
      console.error(`Error deleting from ${modelName} (attempt ${attempt}):`, err.message || err);
      if (attempt >= MAX_RETRIES) throw err;
      const backoff = 500 * attempt;
      console.log(`Retrying ${modelName} after ${backoff}ms...`);
      await wait(backoff);
    }
  }
}

async function destructiveReset() {
  console.log("Deleting in safe sequential order (answers -> questions -> sessions -> topics -> categories)...");

  await safeDeleteMany("testAnswer", async () => prisma.testAnswer.deleteMany({}));
  await safeDeleteMany("testQuestion", async () => prisma.testQuestion.deleteMany({}));
  await safeDeleteMany("testSession", async () => prisma.testSession.deleteMany({}));
  await safeDeleteMany("examTopic", async () => prisma.examTopic.deleteMany({}));
  await safeDeleteMany("examCategory", async () => prisma.examCategory.deleteMany({}));

  console.log("Destructive reset finished.");
}

async function runSeeds() {
  for (const modPath of seedModules) {
    try {
      console.log(`\n▶ Importing ${modPath} ...`);
      const mod = await import(modPath);
      // try to call exported functions:
      const fn = mod.default ?? mod.seed ?? mod.run ?? null;
      if (typeof fn === "function") {
        await fn(prisma);
        console.log(`✔ Finished ${modPath}`);
      } else {
        // if module does not export a function, assume it runs on import
        console.log(`⚠️  ${modPath} did not export a function — importing for side effects`);
        // already imported (side-effect should have executed)
      }
    } catch (err) {
      console.error(`❌ Error while running ${modPath}:`, err);
      throw err;
    }
  }
}

async function main() {
  try {
    console.log("=== MASTER SEEDER ===\n");
    const ok = await promptYes(
      "THIS WILL DELETE rows from testAnswer, testQuestion, testSession, examTopic, examCategory. Type YES to proceed: "
    );
    if (!ok) {
      console.log("Aborted by user.");
      await prisma.$disconnect();
      return;
    }

    await prisma.$connect();

    // run destructive reset
    await destructiveReset();

    // run seed modules
    await runSeeds();

    console.log("\n✅ All seed modules completed.");
  } catch (err) {
    console.error("Fatal error in master seeder:", err);
  } finally {
    await prisma.$disconnect();
    console.log("Disconnected Prisma client. Exiting.");
  }
}

main();
