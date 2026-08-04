#!/usr/bin/env node
// Import previous year questions from a file you control.
//
// ─────────────────────────────────────────────────────────────────────────
// PROVENANCE — read this before using the script
//
// This tool does NOT download anything. It reads a local file that you supply.
// JEE, NEET and GATE question papers are the copyright of NTA and the IITs;
// harvesting them into a commercial product is a real legal exposure, so the
// pipeline is built as "operator supplies the source", not "crawler fetches
// the source".
//
// Legitimate sources for the file you pass in:
//   - papers you are licensed or permitted to republish
//   - questions authored in-house by your own faculty
//   - a dataset whose licence permits redistribution (record it in --source)
//
// --source is written onto every row and surfaced in the API, so the origin of
// any published question can always be traced back.
// ─────────────────────────────────────────────────────────────────────────
//
// Usage:
//   node scripts/importPyq.mjs --file data/pyq/jee-2024.json --exam JEE_MAIN --year 2024 \
//        --source "https://example.org/licensed-archive" --note "licensed 2026-08"
//   node scripts/importPyq.mjs --file data/pyq/jee-2024.txt --exam JEE_MAIN --year 2024
//   node scripts/importPyq.mjs --dir data/pyq            # every json/txt in a folder
//   node scripts/importPyq.mjs --file x.json --exam NEET --year 2023 --dry-run
//
// With --dir, exam and year are read from each filename when they are not
// passed explicitly, so "neet-2019.json" imports without extra flags.
//
// JSON format — an array, or { "questions": [ ... ] }:
//   {
//     "subject": "Physics",            // required, must match the exam's subjects
//     "topic": "Rotational Motion",    // strongly recommended: the AI pattern is
//                                      // derived from these
//     "questionText": "...",           // required
//     "optionA".."optionD": "...",     // omit for numerical/integer questions
//     "correctAnswer": "B",            // "B" | "A,C" | "12.5"
//     "questionType": "mcq_single",    // mcq_single|mcq_multiple|numerical|integer
//     "marksCorrect": 4, "marksIncorrect": -1,
//     "solution": "...",               // optional; generated on demand if absent
//     "session": "Jan Shift 1",        // optional
//     "year": 2024                     // optional, overrides --year for this row
//   }
//
// TXT format — block per question, separated by a line of ---:
//   Subject: Physics
//   Topic: Rotational Motion
//   Question: ...
//   A) ...
//   B) ...
//   C) ...
//   D) ...
//   Correct: B
//   Explanation: ...
//   ---

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import prisma from "../src/prismaClient.js";
import { resolvePyqExamCode } from "../src/lib/pyqPattern.js";
import { clearPyqProfileCache } from "../src/lib/pyqProfile.js";
import { parseTxt, validatePyqRow } from "../src/lib/pyqImport.js";

/* ------------------------------- CLI args ------------------------------- */

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const DRY = Boolean(args["dry-run"]);

/** Written together or not at all — see the upsert below. */
const SOLUTION_FIELDS = new Set(["solution", "solutionModel", "solutionQuality"]);

const USAGE = `
Import previous year questions.

  --file <path>     one json/txt file
  --dir  <path>     every json/txt file in a folder
  --exam <code>     JEE_MAIN | NEET | GATE_ME  (inferred from the filename if omitted)
  --year <yyyy>     exam year (inferred from the filename if omitted)
  --session <name>  e.g. "Jan Shift 1"
  --source <url>    provenance, written onto every row
  --note <text>     free-text provenance note
  --format txt      force the text parser regardless of extension
  --dry-run         validate and report, write nothing

This script never downloads anything. Supply a file you are licensed to use.
`;

if (args.help || (!args.file && !args.dir)) {
  console.log(USAGE);
  process.exit(args.help ? 0 : 1);
}

/* ------------------------------ file input ------------------------------ */

function loadFile(file) {
  const raw = fs.readFileSync(file, "utf8");
  const ext = String(args.format === true ? "" : args.format || path.extname(file).slice(1))
    .toLowerCase();

  if (ext === "txt" || ext === "md") return parseTxt(raw);

  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed) ? parsed : parsed.questions;
  if (!Array.isArray(rows)) {
    throw new Error('expected a JSON array, or an object with a "questions" array');
  }
  return rows;
}

/* --------------------------------- run ---------------------------------- */

async function importFile(file) {
  const base = path.basename(file);
  const yearFromName = base.match(/(?:19|20)\d{2}/)?.[0];
  // --exam wins; otherwise infer from the filename so a whole directory of
  // "neet-2019.json" style files imports in one command.
  const examCode = resolvePyqExamCode(args.exam === true ? base : args.exam || base);

  const empty = { inserted: 0, wouldWrite: 0, writeErrors: 0, rejected: 0 };

  if (!examCode) {
    console.error(`✖ ${base}: cannot tell which exam this is. Pass --exam JEE_MAIN|NEET|GATE_ME.`);
    return { ...empty, rejected: 1 };
  }

  const ctx = {
    file: base,
    examCode,
    year: args.year === true ? yearFromName : args.year || yearFromName,
    session: args.session === true ? null : args.session,
    sourceUrl: args.source === true ? null : args.source,
    sourceNote: args.note === true ? null : args.note,
  };

  let raw;
  try {
    raw = loadFile(file);
  } catch (err) {
    console.error(`✖ ${base}: ${err.message}`);
    return { ...empty, rejected: 1 };
  }

  const good = [];
  const errors = [];
  const warnings = [];
  raw.forEach((r, i) => {
    const res = validatePyqRow(r, ctx, i);
    if (res.error) errors.push(res.error);
    else {
      good.push(res.row);
      if (res.warning) warnings.push(res.warning);
    }
  });

  // Duplicates inside one file would each collide on the same upsert key;
  // collapse them first so the count reported is the count written.
  const seen = new Set();
  const unique = good.filter((r) => {
    if (seen.has(r.questionHash)) return false;
    seen.add(r.questionHash);
    return true;
  });
  const dupInFile = good.length - unique.length;

  console.log(
    `\n${base} → ${examCode}: ${unique.length} valid, ${errors.length} rejected` +
      (dupInFile ? `, ${dupInFile} duplicate within the file` : "")
  );
  for (const w of warnings.slice(0, 5)) console.warn(`  ⚠ ${w}`);
  if (warnings.length > 5) console.warn(`  ⚠ ...and ${warnings.length - 5} more without a topic`);
  for (const e of errors.slice(0, 10)) console.error(`  ✖ ${e}`);
  if (errors.length > 10) console.error(`  ✖ ...and ${errors.length - 10} more`);

  if (DRY) {
    console.log(`  (dry run — ${unique.length} row(s) would be written)`);
    return { ...empty, wouldWrite: unique.length, rejected: errors.length };
  }

  let inserted = 0;
  let writeErrors = 0;
  for (const row of unique) {
    try {
      // Upsert on (examCode, questionHash): re-running an import updates the
      // row instead of duplicating the question.
      await prisma.previousYearQuestion.upsert({
        where: {
          examCode_questionHash: { examCode: row.examCode, questionHash: row.questionHash },
        },
        // A re-import must not wipe a solution that was generated and cached
        // since the first run.
        //
        // That means the whole solution, not just its text. An earlier version
        // excluded only `solution`, so re-importing a file whose rows carry no
        // solution kept the cached text but reset `solutionModel` to null —
        // and the provenance of 148 generated solutions was lost, leaving no
        // way to tell a model's working from a publisher's.
        update: Object.fromEntries(
          Object.entries(row).filter(([k]) => !(row.solution === null && SOLUTION_FIELDS.has(k)))
        ),
        create: row,
      });
      inserted++;
    } catch (err) {
      writeErrors++;
      console.error(`  ✖ write failed for "${row.questionText.slice(0, 60)}…": ${err.message}`);
    }
  }

  console.log(`  ✔ wrote ${inserted} row(s)${writeErrors ? `, ${writeErrors} failed` : ""}`);
  return { inserted, wouldWrite: 0, writeErrors, rejected: errors.length };
}

async function main() {
  const files =
    args.dir && args.dir !== true
      ? fs
          .readdirSync(args.dir)
          .filter((f) => /\.(json|txt|md)$/i.test(f))
          .sort()
          .map((f) => path.join(args.dir, f))
      : [args.file];

  if (!files.length || !files[0]) {
    console.error("No importable files found.");
    process.exit(1);
  }

  if (!args.source && !args.note && !DRY) {
    console.warn(
      "\n⚠ No --source given. Every published question should record where it came from.\n" +
        '  Re-run with --source "<url or licence>" unless these are your own questions.\n'
    );
  }

  const totals = { inserted: 0, wouldWrite: 0, writeErrors: 0, rejected: 0 };
  for (const f of files) {
    const r = await importFile(f);
    for (const k of Object.keys(totals)) totals[k] += r[k];
  }

  console.log(
    DRY
      ? `\n════ dry run: ${totals.wouldWrite} would be imported, ${totals.rejected} rejected ════`
      : `\n════ ${totals.inserted} imported, ${totals.rejected} rejected, ${totals.writeErrors} write errors ════`
  );

  if (totals.inserted && !DRY) {
    clearPyqProfileCache();
    const coverage = await prisma.previousYearQuestion.groupBy({
      by: ["examCode"],
      _count: { _all: true },
    });
    console.log("\nCoverage now:");
    for (const c of coverage) console.log(`  ${c.examCode}: ${c._count._all} questions`);
    console.log(
      "\nThe AI paper generator picks this up on its next run — no restart needed\n" +
        "(a running server's profile cache expires within 10 minutes)."
    );
  }

  await prisma.$disconnect();
  // Non-zero only when the run achieved nothing, so a broken file fails CI but
  // a mostly-good import with a few bad rows still succeeds.
  const achieved = DRY ? totals.wouldWrite : totals.inserted;
  process.exit(achieved === 0 && (totals.rejected || totals.writeErrors) ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
