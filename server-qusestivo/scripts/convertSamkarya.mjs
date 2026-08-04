#!/usr/bin/env node
// Convert Samkarya/online-exam-questions papers into the PYQ import format.
//
// ─────────────────────────────────────────────────────────────────────────
// LICENCE — read before running this
//
// The source repository is under the ExamOven Non-Commercial Open Source
// License (ENCOSL v1.0). It grants use, copy, modify and publish rights for
// "personal, educational, and non-commercial purposes" ONLY, and reserves ALL
// commercial use to ExamOven and its affiliates. It names, as prohibited:
// powering paid platforms, selling data access, and including the content in
// revenue-generating products — subscriptions, ADS, or one-time fees.
//
// So questions imported through this script are usable only while Questivo
// carries no advertising, no subscription and no paid tier. Turning any of
// those on later does not grandfather this content in; it puts it in breach
// from that day. If the business model changes, these rows must come out.
//
// ENCOSL also requires the notice to travel with the content. Every row this
// script emits therefore carries the licence in `sourceNote` and the exact
// file it came from in `sourceUrl`, both of which the API returns and the
// question card renders.
// ─────────────────────────────────────────────────────────────────────────
//
// Usage:
//   node scripts/convertSamkarya.mjs --dir <download-dir> --out data/pyq/jee-main-samkarya.json
//   node scripts/convertSamkarya.mjs --dir <download-dir> --out out.json --strict
//
// --strict exits non-zero if any row is dropped, for use in a pipeline.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const REPO = "https://github.com/Samkarya/online-exam-questions";
const RAW = "https://raw.githubusercontent.com/Samkarya/online-exam-questions/main";
const LICENCE_NOTE =
  "Samkarya/online-exam-questions, ExamOven Non-Commercial Open Source License (ENCOSL v1.0) — " +
  "non-commercial use only; commercial rights reserved to ExamOven. " +
  REPO;

/**
 * Where each subject sits in a JEE Main paper.
 *
 * NOT a guess. Every file in the source set that carries subject labels puts
 * Mathematics at 1-25, Physics at 26-50 and Chemistry at 51-75 — 225 labelled
 * rows across four papers, no exceptions — and that matches the section order
 * in src/lib/examSyllabus.js. One file has `subject: null` throughout, and this
 * is what recovers it.
 *
 * Position is used only as a FALLBACK. Where a row states its own subject that
 * value wins, and a disagreement between the two is reported rather than
 * silently resolved: a mislabelled subject corrupts every pattern later derived
 * from the table, so it must fail loudly instead of quietly.
 */
const JEE_MAIN_BLOCKS = [
  { from: 1, to: 25, subject: "Mathematics" },
  { from: 26, to: 50, subject: "Physics" },
  { from: 51, to: 75, subject: "Chemistry" },
];

const subjectByPosition = (n) =>
  JEE_MAIN_BLOCKS.find((b) => n >= b.from && n <= b.to)?.subject ?? null;

/** "jeeMain_2026_02April_shift1.json" -> { year: 2026, session: "02 April Shift 1" } */
function parseFilename(file) {
  const base = path.basename(file, ".json");
  const year = Number(base.match(/_(\d{4})_/)?.[1]) || null;
  const date = base.match(/_(\d{1,2})([A-Za-z]+)_/);
  const shift = base.match(/shift\s*(\d)/i)?.[1];
  const parts = [];
  if (date) parts.push(`${date[1]} ${date[2]}`);
  if (shift) parts.push(`Shift ${shift}`);
  return { year, session: parts.join(" ") || null };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    out[key] = !next || next.startsWith("--") ? true : (i++, next);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.dir || !args.out) {
  console.log(`
Convert Samkarya papers into the PYQ import format.

  --dir <path>   directory of downloaded jeeMain_*.json files
  --out <path>   output JSON
  --strict       exit non-zero if any row is dropped
`);
  process.exit(args.help ? 0 : 1);
}

const files = fs
  .readdirSync(args.dir)
  .filter((f) => /^jeeMain.*\.json$/i.test(f))
  .sort();

if (!files.length) {
  console.error(`No jeeMain*.json files in ${args.dir}`);
  process.exit(1);
}

const rows = [];
const dropped = [];
const mismatches = [];
let positional = 0;

for (const file of files) {
  const { year, session } = parseFilename(file);
  const src = JSON.parse(fs.readFileSync(path.join(args.dir, file), "utf8"));
  const items = Array.isArray(src) ? src : src.questions || src.data || [];

  for (const q of items) {
    const n = Number(q.question_number);
    const stated = q.subject && String(q.subject).trim() ? String(q.subject).trim() : null;
    const byPos = subjectByPosition(n);

    if (stated && byPos && stated !== byPos) {
      // Loud, not silent. See the note on JEE_MAIN_BLOCKS.
      mismatches.push(`${file} q${n}: file says ${stated}, position says ${byPos}`);
    }
    const subject = stated ?? byPos;
    if (!stated && byPos) positional++;

    if (!subject) {
      dropped.push(`${file} q${n}: no subject and question_number outside 1-75`);
      continue;
    }

    const o = q.options || {};
    const opts = ["a", "b", "c", "d"].map((k) => (o[k] == null ? null : String(o[k]).trim()));
    if (opts.some((v) => !v)) {
      dropped.push(`${file} q${n}: fewer than four options`);
      continue;
    }

    const answer = String(q.correct_answer || "").trim().toUpperCase();
    if (!/^[ABCD]$/.test(answer)) {
      dropped.push(`${file} q${n}: answer "${q.correct_answer}" is not one of A-D`);
      continue;
    }

    const text = String(q.question_text || "").trim();
    if (!text) {
      dropped.push(`${file} q${n}: empty question text`);
      continue;
    }

    rows.push({
      subject,
      topic: q.topic ? String(q.topic).trim() : null,
      year,
      session,
      questionText: text,
      optionA: opts[0],
      optionB: opts[1],
      optionC: opts[2],
      optionD: opts[3],
      correctAnswer: answer,
      questionType: "mcq_single",
      // JEE Main Section A marking, matching src/lib/examSyllabus.js.
      marksCorrect: 4,
      marksIncorrect: -1,
      // Shipped where the source provides one. Every pre-supplied solution is
      // one the site never pays a model to write.
      solution: q.explanation && String(q.explanation).trim() ? String(q.explanation).trim() : null,
      sourceUrl: `${RAW}/India/undergraduate/JEEMains/${file}`,
      sourceNote: LICENCE_NOTE,
    });
  }
}

fs.writeFileSync(args.out, JSON.stringify(rows, null, 2));

const bySubject = {};
const byYear = {};
let withSolution = 0;
for (const r of rows) {
  bySubject[r.subject] = (bySubject[r.subject] || 0) + 1;
  byYear[r.year] = (byYear[r.year] || 0) + 1;
  if (r.solution) withSolution++;
}

console.log(`\nfiles read        : ${files.length}`);
console.log(`rows written      : ${rows.length} -> ${args.out}`);
console.log(`subjects          : ${JSON.stringify(bySubject)}`);
console.log(`years             : ${JSON.stringify(byYear)}`);
console.log(`subject by position: ${positional} (file stated none)`);
console.log(`solutions included: ${withSolution}/${rows.length}`);
console.log(`dropped           : ${dropped.length}`);
for (const d of dropped.slice(0, 10)) console.log(`  - ${d}`);
if (dropped.length > 10) console.log(`  ...and ${dropped.length - 10} more`);

if (mismatches.length) {
  console.log(`\n!! SUBJECT MISMATCH on ${mismatches.length} row(s) — the file and the`);
  console.log(`   paper layout disagree. Resolve before importing.`);
  for (const m of mismatches.slice(0, 10)) console.log(`  - ${m}`);
  process.exit(1);
}

if (args.strict && dropped.length) process.exit(1);
