#!/usr/bin/env node
/**
 * Point stored questions at the crops that already exist for them on disk.
 *
 * WHY THIS IS NEEDED AT ALL
 *
 * The converters cut the images and link them in the same pass, matching each
 * crop back to its row through an in-memory map keyed by the number printed on
 * the page. That key is fragile — a booklet that restarts numbering per
 * subject, a paper whose header repeats the question number, a re-run against a
 * slightly different PDF — and when it misses, the file is written and nothing
 * ever points at it. JEE Main 2023 has 7,460 crops on disk and 459 rows linked
 * to them; the other ~1,700 questions show their extracted text instead, and
 * that text is exactly what the extraction was worst at: stacked fractions and
 * surds, which come out as "2" where the paper printed "1/2".
 *
 * The filenames are derived from facts the row already carries — paper, subject
 * and question number — so the directory listing is a complete index and can be
 * rebuilt from it at any time. That makes this idempotent and safe to re-run,
 * and it never invents a link: a URL is written only when the file is there.
 *
 * Usage:
 *   node scripts/relinkFigures.mjs --exam JEE_MAIN --year 2023 --dry-run
 *   node scripts/relinkFigures.mjs --exam JEE_MAIN --year 2023 \
 *        --dir ../pyq-figures/2023 \
 *        --base https://cdn.jsdelivr.net/gh/ajaykumarsaini231/Questivo@main/pyq-figures/2023
 */

import "dotenv/config";
import fs from "node:fs";
import process from "node:process";
import prisma from "../src/prismaClient.js";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) {
      const next = all[i + 1];
      acc.push([a.slice(2), !next || next.startsWith("--") ? true : next]);
    }
    return acc;
  }, [])
);

const EXAM = args.exam && args.exam !== true ? String(args.exam) : "JEE_MAIN";
const YEAR = args.year && args.year !== true ? Number(args.year) : null;
const DIR = args.dir && args.dir !== true ? String(args.dir) : `../pyq-figures/${YEAR}`;
const BASE = (args.base && args.base !== true
  ? String(args.base)
  : `https://cdn.jsdelivr.net/gh/ajaykumarsaini231/Questivo@main/pyq-figures/${YEAR}`
).replace(/\/$/, "");
const DRY = Boolean(args["dry-run"]);

/**
 * Rebuild the crop's base name from the row.
 *
 * paperId  jee-main-2023-s1-2023-01-24-shift1
 * becomes  JEEMain_2023_S1_2023-01-24_Shift1_Physics_Q01
 *
 * Derived rather than stored because `figureBase` was never written to the
 * database — it lives only in the converter's intermediate JSON, which is
 * gitignored and may not survive. Everything needed is on the row.
 */
function baseNameFor(row) {
  const m = /^jee-main-(\d{4})-s(\d)-(\d{4}-\d{2}-\d{2})-shift(\d)$/.exec(row.paperId || "");
  if (m) {
    const [, year, session, date, shift] = m;
    return `JEEMain_${year}_S${session}_${date}_Shift${shift}_${row.subject}_Q${String(row.questionNumber).padStart(2, "0")}`;
  }
  const g = /^gate-mt-(\d{4})$/.exec(row.paperId || "");
  if (g) return `GATE_MT_${g[1]}_Q${String(row.questionNumber).padStart(2, "0")}`;
  return null;
}

if (!fs.existsSync(DIR)) {
  console.error(`No such directory: ${DIR}`);
  process.exit(1);
}
const onDisk = new Set(fs.readdirSync(DIR));
console.log(`\n${onDisk.size} files in ${DIR}`);

const rows = await prisma.previousYearQuestion.findMany({
  where: { examCode: EXAM, ...(YEAR ? { year: YEAR } : {}), paperId: { not: null } },
  select: {
    id: true, paperId: true, subject: true, questionNumber: true, questionType: true,
    questionImage: true, optionAImage: true, optionBImage: true,
    optionCImage: true, optionDImage: true, solutionImage: true,
  },
});
console.log(`${rows.length} stored questions for ${EXAM}${YEAR ? ` ${YEAR}` : ""}`);

const url = (name) => (onDisk.has(name) ? `${BASE}/${name}` : null);

let patched = 0;
let noBase = 0;
let noFiles = 0;
const counts = { questionImage: 0, options: 0, solutionImage: 0 };

for (const row of rows) {
  const base = baseNameFor(row);
  if (!base) {
    noBase++;
    continue;
  }

  const data = {};
  // Only ever FILLS a gap. A link written by the converter is left alone —
  // re-running this must not overwrite a correct link with a guess.
  if (!row.questionImage) {
    const q = url(`${base}_Q.png`);
    if (q) {
      data.questionImage = q;
      data.diagramImage = q;
      counts.questionImage++;
    }
  }
  if (!row.solutionImage) {
    const s = url(`${base}_S.png`);
    if (s) {
      data.solutionImage = s;
      counts.solutionImage++;
    }
  }
  // A numerical question has no choices; a stray _A crop must not become one.
  if (row.questionType !== "numerical" && row.questionType !== "integer") {
    let any = false;
    for (const L of ["A", "B", "C", "D"]) {
      const key = `option${L}Image`;
      if (row[key]) continue;
      const u = url(`${base}_${L}.png`);
      if (u) {
        data[key] = u;
        any = true;
      }
    }
    if (any) counts.options++;
  }

  if (!Object.keys(data).length) {
    noFiles++;
    continue;
  }
  patched++;
  if (!DRY) await prisma.previousYearQuestion.update({ where: { id: row.id }, data });
}

console.log(`\n${DRY ? "would patch" : "patched"} ${patched} row(s)`);
console.log(`  question images : ${counts.questionImage}`);
console.log(`  option sets     : ${counts.options}`);
console.log(`  solution images : ${counts.solutionImage}`);
if (noBase) console.log(`  ${noBase} row(s) whose paperId has no known naming rule — skipped`);
if (noFiles) console.log(`  ${noFiles} row(s) already linked or with no crop on disk`);

await prisma.$disconnect();
