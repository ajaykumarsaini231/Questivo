#!/usr/bin/env node
// Import the paper manifest that the "pick a paper" screen lists and the
// NTA-style player runs.
//
// One row per shift, denormalised from the questions: listing 22 papers should
// not mean aggregating 1980 question rows on every page load, and a paper
// carries attributes its questions do not — duration, total marks, and whether
// the operator has published it.
//
// Papers import UNPUBLISHED. Nothing reaches students until the operator flips
// isPublished, which is deliberate: a paper whose figures are still missing
// would otherwise go live the moment it was ingested.
//
// Usage:
//   node scripts/importPyqPapers.mjs --file data/pyq/jee-main-2022-papers.json
//   node scripts/importPyqPapers.mjs --file <path> --publish     # go live now
//   node scripts/importPyqPapers.mjs --file <path> --dry-run

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import prisma from "../src/prismaClient.js";
import { resolvePyqExamCode } from "../src/lib/pyqPattern.js";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const DRY = Boolean(args["dry-run"]);
const PUBLISH = Boolean(args.publish);

if (args.help || !args.file || args.file === true) {
  console.log(`
Import a PYQ paper manifest.

  --file <path>   the *-papers.json emitted by a converter
  --publish       mark the papers published (default: import unpublished)
  --dry-run       validate and report, write nothing
`);
  process.exit(args.help ? 0 : 1);
}

/** "2022-06-24" → a UTC midnight Date, which is what @db.Date stores. */
function toDate(v) {
  if (!v) return null;
  const d = new Date(`${String(v).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function validate(p, i) {
  const where = `[${i}]`;
  if (!p.paperId && !p.id) return { error: `${where}: paperId is required` };

  const examCode = resolvePyqExamCode(p.examCode || p.examName || "");
  if (!examCode) return { error: `${where}: cannot resolve examCode from "${p.examCode}"` };

  const year = Number(p.year);
  if (!Number.isInteger(year)) return { error: `${where}: year "${p.year}" is not a number` };

  const counts = p.subjects || p.subjectCounts || {};
  const total = Object.values(counts).reduce((a, b) => a + Number(b || 0), 0);

  return {
    row: {
      id: String(p.paperId || p.id),
      examCode,
      examName: String(p.examName || examCode),
      stream: p.stream ?? null,
      year,
      sessionNumber: p.sessionNumber ?? null,
      sessionLabel: p.sessionLabel ?? null,
      paperDate: toDate(p.paperDate),
      dateLabel: p.dateLabel ?? null,
      shift: p.shift ?? null,
      shiftLabel: p.shiftLabel ?? null,
      shiftTime: p.shiftTime ?? null,
      durationMinutes: Number(p.durationMinutes ?? 180),
      totalQuestions: Number(p.totalQuestions ?? p.questionCount ?? total ?? 90),
      totalMarks: Number(p.totalMarks ?? 300),
      marksCorrect: Number(p.marksCorrect ?? 4),
      marksIncorrect: Number(p.marksIncorrect ?? -1),
      subjectCounts: counts,
      needsFigureCount: Number(p.needsFigureCount ?? 0),
      languages: Array.isArray(p.languages) && p.languages.length ? p.languages : ["en"],
      isPublished: PUBLISH,
    },
  };
}

async function main() {
  const file = args.file;
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const list = Array.isArray(parsed) ? parsed : parsed.papers;
  if (!Array.isArray(list)) throw new Error('expected a JSON array, or { "papers": [...] }');

  const rows = [];
  const errors = [];
  list.forEach((p, i) => {
    const res = validate(p, i);
    if (res.error) errors.push(res.error);
    else rows.push(res.row);
  });

  console.log(`\n${path.basename(file)}: ${rows.length} valid, ${errors.length} rejected`);
  for (const e of errors.slice(0, 10)) console.error(`  ✖ ${e}`);

  if (DRY) {
    console.log(`  (dry run — ${rows.length} paper(s) would be written)`);
    for (const r of rows.slice(0, 3)) {
      console.log(`    · ${r.id} — ${r.dateLabel} ${r.shiftLabel}, ${r.totalQuestions} questions` +
        (r.needsFigureCount ? `, ${r.needsFigureCount} awaiting a figure` : ""));
    }
    await prisma.$disconnect();
    process.exit(errors.length && !rows.length ? 1 : 0);
  }

  let written = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      // isPublished is left out of the update: re-importing a manifest must not
      // silently unpublish a paper the operator has already released.
      const { isPublished, ...rest } = row;
      await prisma.pyqPaper.upsert({
        where: { id: row.id },
        update: PUBLISH ? row : rest,
        create: row,
      });
      written++;
    } catch (err) {
      failed++;
      console.error(`  ✖ ${row.id}: ${err.message}`);
    }
  }

  console.log(`  ✔ wrote ${written} paper(s)${failed ? `, ${failed} failed` : ""}`);
  if (!PUBLISH) {
    console.log(`\n  Papers are unpublished. Release them with --publish once their\n` +
      `  figures are in place.`);
  }

  await prisma.$disconnect();
  process.exit(written === 0 && failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
