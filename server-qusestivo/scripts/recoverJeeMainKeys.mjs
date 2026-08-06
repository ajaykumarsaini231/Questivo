#!/usr/bin/env node
// Recover the answer keys the converters could not reach — from ALLEN
// solution booklets (JEE Main AND JEE Advanced), from MathonGo's whole-paper
// answer-key table, and from answers left stranded inside a question's own
// text.
//
// WHY A SECOND PASS EXISTS
//
// parseAllenSolution walks a booklet as a sequence of lines, and where that
// sequence breaks the whole file is lost: an answer printed twice splits one
// question into two and shifts every key after it, so the converter discards
// that file's keys rather than publish a wrong one. The answers are still on
// those pages. What failed was the ordering, not the reading.
//
// So this pass ignores reading order and pairs GEOMETRICALLY: every printed
// key is attributed to the nearest question number standing above it in the
// same column of the same page. A page that interleaves two columns, drops a
// line or repeats an answer cannot disturb that, because nothing depends on
// what came before.
//
// WHAT THIS PASS LEARNED THE HARD WAY
//
// Geometry alone is not enough, because the ARCHIVE's rows are not guaranteed
// to line up with the printed numbering. JEEMain_2025_Session2_03-Apr_Shift1_
// Chemistry is the case that proved it: the line parse lost printed question
// 55, so stored row 5 holds question 56's text and question 56's key, and every
// row after it is shifted one place. Reading the page correctly and then
// filling row 5 from printed question 55 would have written a correct answer
// onto the wrong question — a wrong key, produced carefully.
//
// The fix is the checksum in lib/printedKeys.mjs: before a file is filled,
// every key it ALREADY holds must reproduce what the page prints. Keys that
// survived the first parse are used as evidence ABOUT the alignment, and are
// never overwritten. A file that fails is left completely alone and named in
// the report, because half-filling a misaligned file is the failure this pass
// exists to avoid.
//
// THE THREE SOURCES
//
//   allen     ALLEN booklets, one subject per file, for both JEE Main and JEE
//             Advanced. Advanced numbers from 1 and brackets a letter —
//             "Ans. (C)", "Ans. (A,B,D)"; Main numbers by the subject's
//             position in the paper (2025 Chemistry runs 51-75) and brackets
//             an option number. Both are the same geometry.
//
//   mathongo  Whole-paper compilations with no worked solutions. Their key is
//             a separate table at the end, and the exam's numerical questions
//             are printed among the multiple-choice ones while that table keeps
//             the exam's order. See the long note above the mathongo pass.
//
//   in-stem   "The value of n is ______. Ans. 11.00" — the key was read, but
//             it was left inside the question. Cut it out and store it.
//
// Usage:
//   node scripts/recoverJeeMainKeys.mjs --file data/pyq/jee-main-2025.json \
//     --dir "C:/Users/LSE/Downloads/ch/jee questions" [--dry-run]

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { readPrinted, pairPrinted, longestRun, alignmentOf } from "./lib/printedKeys.mjs";
import { extractLines } from "./lib/pdfLayout.mjs";
import { parseMathonGoPaper } from "./lib/parseMathonGoPaper.mjs";

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
if (args.help || !args.file || args.file === true || !args.dir || args.dir === true) {
  console.log(`
Recover missing answer keys from the printed sources.

  --file <path>       a converted JSON file (array, or { questions: [...] })
  --dir <path>        folder holding the source PDFs
  --dry-run           report what would change and write nothing
  --fix-interleaved   also CORRECT numerical keys that a MathonGo paper's
                      interleaving provably mis-assigned (off by default)
`);
  process.exit(args.help ? 0 : 1);
}

const DRY = Boolean(args["dry-run"]);
const FIX_INTERLEAVED = Boolean(args["fix-interleaved"]);

/* ------------------------------ stored form ------------------------------ */

/**
 * What the page prints, in the form the archive stores.
 *
 * A JEE Main booklet names the winning choice by its position — "Ans. (3)" —
 * while the row stores the letter, because that is what the player scores
 * against and what optionC holds. A JEE Advanced booklet already brackets
 * letters, and a multiple-correct question brackets several. A numerical
 * question has no letter: its printed answer IS the answer, and a range or a
 * list of accepted values is kept whole, because the marker understands both
 * and taking only the first number would narrow the key.
 *
 * Getting this wrong is not a formatting slip. "3" against a row whose options
 * are A-D matches nothing, so every recovered question would mark every
 * candidate wrong — worse than the missing key it replaced.
 */
const OPTION_LETTERS = { 1: "A", 2: "B", 3: "C", 4: "D" };

function storedForm(printed, row) {
  const value = String(printed ?? "").trim();
  if (!value) return null;
  const type = row.questionType;

  if (type === "numerical" || type === "integer") {
    if (/^(?:bonus|dropped)$/i.test(value)) return null;
    if (/^[-\d.\s]*\d[-\d.\s]*(?:(?:to|or)[-\d.\s]*\d[-\d.\s]*)+$/i.test(value)) {
      return value.replace(/\s+/g, " ").trim();
    }
    const n = value.match(/-?\d+(?:\.\d+)?/);
    return n ? n[0] : null;
  }

  // A question the board voided has no single key. It is left empty on
  // purpose — `status: bonus` already says everybody scores it.
  if (/^(?:bonus|dropped)$/i.test(value)) return null;

  // The WHOLE printed value has to be a choice, not merely contain one.
  //
  // Scanning for option characters instead read "Ans. (200)" as option 2 and
  // put "B" on a question whose real answer is the number 200 — the printed
  // key was a numerical answer against a row the converter had mistyped as
  // multiple choice. Anything that is not exactly an option, or a list of
  // options for a multiple-correct question, is refused here; the caller then
  // gets its chance to notice that the row's TYPE is what is wrong.
  if (!/^[A-D1-4](?:\s*[,;]?\s*[A-D1-4])*$/i.test(value)) return null;

  const tokens = [...new Set(value.toUpperCase().match(/[A-D1-4]/g) || [])];
  const letters = [...new Set(tokens.map((t) => OPTION_LETTERS[t] ?? t))].sort();
  if (!letters.length) return null;
  if (type === "mcq_single" && letters.length > 1) return null;
  return letters.join(",");
}

/* --------------------------------- input --------------------------------- */

const raw = JSON.parse(fs.readFileSync(args.file, "utf8"));
const rows = Array.isArray(raw) ? raw : raw.questions;
if (!Array.isArray(rows)) {
  console.error("expected a JSON array, or an object with a questions array");
  process.exit(1);
}

const before = rows.filter((r) => !r.correctAnswer).length;
console.log(`${rows.length} row(s); ${before} without a key.\n`);

/** Rows grouped by the file they came from. A row can name two. */
const byFile = new Map();
for (const r of rows) {
  if (!r.sourceUrl) continue;
  for (const f of String(r.sourceUrl).split(" + ")) {
    if (!byFile.has(f)) byFile.set(f, []);
    byFile.get(f).push(r);
  }
}

const isMathonGo = (f) => /_AllSubjects_QuestionPaper\.pdf$/i.test(f);

/**
 * A row the converter built from the paper's shape rather than from text.
 *
 * Nothing of the question survived extraction, so the row carries only the
 * crop and a caption. It matters here because such a row's number is the
 * converter's own counter, which cannot have slipped against the page — see
 * the reasoning in alignmentOf.
 */
const isPlaceholder = (r) =>
  Boolean(r.needsFigure) && /^\[Shown as an image\]/.test(String(r.questionText ?? ""));

/**
 * A row that now has a key is no longer waiting for one.
 *
 * `bonus` needs saying out loud, because in this archive it means two
 * different things. The converter marks a question bonus when the board voided
 * it AND when no key could be read — same status, opposite meanings, and the
 * player scores the first as full marks for everybody. A question the page
 * turns out to answer was never voided, so it goes back to ok. A question the
 * page really does print "Ans. (Bonus)" against never reaches here: storedForm
 * returns null for it and it keeps both its empty key and its status.
 */
function reinstate(row) {
  if (row.status === "needs_review" || row.status === "bonus") row.status = "ok";
  row.voidReason = row.voidReason ?? null;
}

/**
 * Does the paper's own shape say this question is numerical?
 *
 * Not a guess about the question — a reading of where the paper's numerical
 * section starts, taken from the sibling rows of the very same file. A row
 * above that line, carrying no options at all, is in Section B whatever its
 * type field says.
 */
function numericalByShape(row) {
  if (row.examCode !== "JEE_MAIN") return false;
  if (row.optionA || row.optionB || row.optionC || row.optionD) return false;
  // Every JEE Main paper since 2020 puts twenty multiple-choice questions
  // first and its numerical ones after, whether the subject has thirty
  // questions (2021-2024) or twenty-five (2020, 2025-). The split moved; its
  // position did not. The archive's own `section` field cannot be used for
  // this — the files that need the repair are exactly the ones whose sections
  // came out wrong, one of them labelling all thirty questions Section A.
  return row.questionNumber >= 21;
}

/** Why a row could not be filled — collected so the report can say. */
const stuck = new Map();
const because = (row, reason) => {
  if (!stuck.has(reason)) stuck.set(reason, []);
  stuck.get(reason).push(row);
};

let filled = 0;
let corrected = 0;
let retyped = 0;
const refused = [];
const notes = [];

/* ------------------------ pass 1: ALLEN booklets ------------------------- */

for (const [file, group] of byFile) {
  if (isMathonGo(file)) continue;
  const pdfPath = path.join(String(args.dir), file);
  if (!fs.existsSync(pdfPath)) { refused.push(`${file}: not found`); continue; }
  if (!group.some((r) => !r.correctAnswer)) continue; // nothing to do here

  // A row that names two files is keyed once; count each file's own rows only.
  const own = group.filter((r) => String(r.sourceUrl).split(" + ")[0] === file || !String(r.sourceUrl).includes(" + "));
  const scope = own.length ? own : group;

  let printed;
  try { printed = readPrinted(pdfPath); }
  catch (e) { refused.push(`${file}: ${e.message}`); continue; }

  const keys = pairPrinted(printed.anchors, printed.answers);
  // The run is taken over the QUESTION NUMBERS, not over the keys: a question
  // whose key the page does not print still occupies its place in the
  // numbering, and indexing on keys alone would make one unreadable answer
  // look like a break in the paper.
  const run = longestRun(printed.anchors.map((a) => a.n));
  const align = alignmentOf(scope, keys, run, storedForm, { isPlaceholder });

  if (!align.ok) {
    const missing = scope.filter((r) => !r.correctAnswer).length;
    refused.push(`${file}: ${align.why} — ${missing} row(s) left unkeyed`);
    if (align.clashes) for (const c of align.clashes.slice(0, 4)) notes.push(`    ${file} ${c}`);
    continue;
  }

  let here = 0;
  for (const r of scope) {
    if (r.correctAnswer) continue;
    const hit = keys.get(align.base + r.questionNumber - 1);
    if (!hit) { because(r, "the page prints no answer line under this question"); continue; }
    let value = storedForm(hit.value, r);

    // A numerical question the converter filed as multiple choice.
    //
    // Three rows read "Ans. (07)", "Ans. (8)", "Ans. (5)" against a row typed
    // mcq_single with no options at all — and sitting in the paper's numerical
    // section, which this file's own rows say where it starts. The page is
    // printing a value, not a choice; the row's type is what is wrong. Correct
    // it from the paper's shape rather than dropping a key that is plainly
    // there.
    if (value === null && numericalByShape(r) && /^\d+(?:\.\d+)?$/.test(hit.value.trim())) {
      r.questionType = "numerical";
      r.section = "B";
      r.sectionLabel = "Section B (Numerical)";
      r.optionA = r.optionB = r.optionC = r.optionD = null;
      value = storedForm(hit.value, r);
      retyped++;
    }

    if (value === null) {
      because(r, /bonus|dropped/i.test(hit.value)
        ? `the board voided it — the page prints "${hit.text.trim().slice(0, 30)}"`
        : `the printed key "${hit.value}" is not a form this question can hold`);
      continue;
    }
    r.correctAnswer = value;
    r.answerNote =
      `key read from the printed page ("${hit.text.trim().slice(0, 40)}"), paired to question ` +
      `${align.base + r.questionNumber - 1} by position; this file's other ${align.checked} key(s) ` +
      `reproduce the page exactly, which is what makes the pairing safe`;
    reinstate(r);
    here++;
  }
  filled += here;
  if (here) console.log(`  +${String(here).padStart(3)}  ${file}`);
}

/* --------------------- pass 2: MathonGo whole papers --------------------- */
//
// These files print the exam's 20 multiple-choice questions and its 10
// numerical ones INTERLEAVED, while the answer key at the end keeps the exam's
// own order: slots 1-20 of a subject are its choices, slots 21-30 its values.
// So the k-th numerical question ON THE PAGE is answered by slot 20+k, and
// reading key[position] hands a numerical question an option number.
//
// The converter already knew this (lib/sectionKeys.mjs) but could only act
// when it could classify all 30 questions, and it classified by whether option
// TEXT came out of the PDF. In these papers a question whose choices are drawn
// rather than typeset yields four EMPTY options — the markers "(1) (2) (3) (4)"
// are there, the text is not — so it was filed as "unknown", the subject's
// shape could not be reproduced, and every numerical key in it was dropped.
// Counting the MARKERS instead resolves those, which is what `numericalsOf`
// does below.
//
// Only numerical answers are taken from these files. Their multiple-choice key
// indexes the board's option order, not the order MathonGo re-typesets the
// choices in — 11 Apr 2023 Shift 2 Physics Q13 is the proof: the key says 2,
// the board's second choice is 421 Hz (which is the answer), and MathonGo
// prints 421 Hz first. A letter derived from that key would be wrong.

/** The 30 printed questions of one subject, or null if the block is short. */
function subjectBlock(questions, base) {
  const found = new Map(
    questions.filter((q) => q.number > base && q.number <= base + 30).map((q) => [q.number, q])
  );
  if (found.size !== 30) return null;
  const block = [];
  for (let n = base + 1; n <= base + 30; n++) block.push(found.get(n));
  return block;
}

/**
 * Which of a subject's printed questions are numerical, in printed order.
 *
 * A multiple-choice question carries four option markers even when the choices
 * themselves are pictures; a numerical one carries none. Returns null unless
 * exactly ten come out, because the exam's shape is the check: nine or eleven
 * means a question was misread, and the ordinal mapping would then be wrong
 * for everything after it.
 */
function numericalsOf(block) {
  const numerical = block.filter((q) => !q.options);
  return numerical.length === 10 ? numerical : null;
}

for (const [file, group] of byFile) {
  if (!isMathonGo(file)) continue;
  const pdfPath = path.join(String(args.dir), file);
  if (!fs.existsSync(pdfPath)) { refused.push(`${file}: not found`); continue; }
  if (!group.some((r) => !r.correctAnswer)) continue;

  let parsed;
  try { parsed = parseMathonGoPaper(await extractLines(fs.readFileSync(pdfPath))); }
  catch (e) { refused.push(`${file}: ${e.message}`); continue; }
  const { questions, key } = parsed;
  if (key.size !== 90) {
    refused.push(`${file}: answer key table has ${key.size} of 90 entries — not used`);
    continue;
  }

  for (const [subject, base] of [["Physics", 0], ["Chemistry", 30], ["Mathematics", 60]]) {
    const wanted = group.filter((r) => r.subject === subject && !r.correctAnswer);
    if (!wanted.length) continue;

    const block = subjectBlock(questions, base);
    if (!block) {
      refused.push(`${file} ${subject}: only some of the 30 questions could be read — ${wanted.length} row(s) left unkeyed`);
      continue;
    }
    const numerical = numericalsOf(block);
    if (!numerical) {
      const n = block.filter((q) => !q.options).length;
      refused.push(`${file} ${subject}: ${n} question(s) look numerical, the paper has 10 — ${wanted.length} row(s) left unkeyed`);
      continue;
    }

    // printed position within the subject -> the key slot that answers it
    const slotOf = new Map();
    numerical.forEach((q, i) => slotOf.set(q.number, base + 20 + i + 1));

    const interleaved = numerical.some((q) => ((q.number - 1) % 30) + 1 <= 20);

    let here = 0, fixed = 0;
    for (const q of numerical) {
      const within = ((q.number - 1) % 30) + 1;
      const row = group.find((r) => r.subject === subject && r.questionNumber === within);
      if (!row) continue;
      // The page and the archive must agree that this is a numerical question
      // before a value is written into it. Where they disagree, one of the two
      // classifications is wrong and writing "6" into a row whose options are
      // A-D would mark every candidate wrong.
      if (row.questionType !== "numerical" && row.questionType !== "integer") {
        notes.push(`    ${file} ${subject} Q${within}: page reads it as numerical, the archive types it ${row.questionType} — left alone`);
        continue;
      }
      const value = storedForm(key.get(slotOf.get(q.number)), row);
      if (value === null) continue;

      if (!row.correctAnswer) {
        row.correctAnswer = value;
        row.answerNote =
          `key read from this paper's ANSWER KEYS table. The paper prints its numerical questions ` +
          `among the multiple-choice ones while the table keeps the exam's order, so this question — ` +
          `the ${numerical.indexOf(q) + 1}${["st", "nd", "rd"][numerical.indexOf(q)] || "th"} numerical one on the page — ` +
          `is answered by key slot ${slotOf.get(q.number)}, not by its printed position`;
        reinstate(row);
        here++;
      } else if (String(row.correctAnswer) !== String(value) && interleaved) {
        if (!FIX_INTERLEAVED) {
          notes.push(`    ${file} ${subject} Q${within}: page says ${value}, archive holds ${row.correctAnswer} (re-run with --fix-interleaved)`);
          continue;
        }
        row.answerNote =
          `key corrected from this paper's ANSWER KEYS table: the paper interleaves its numerical ` +
          `questions and the previous value was read from the printed position rather than from the ` +
          `exam's order (slot ${slotOf.get(q.number)})`;
        row.correctAnswer = value;
        fixed++;
      }
    }
    filled += here;
    corrected += fixed;
    if (here || fixed) console.log(`  +${String(here).padStart(3)}${fixed ? ` ~${fixed}` : ""}  ${file} ${subject}`);
  }
}

/* ------------------ pass 3: an answer left inside the stem ---------------- */
//
// "The value of n is ______. Ans. 11.00" — the booklet's answer line ended up
// on the question's side of the split, so the key was published as part of the
// question and the answer field stayed empty. The value is printed, it is
// simply in the wrong field: move it, and cut it off the stem.

const IN_STEM =
  /\s*(?:Official\s+Ans\.?\s*by\s*NTA|Allen\s+Ans\.?|Ans(?:wer)?)\s*\.?\s*(?:\(\s*([A-D0-9][^)\n]{0,20}?)\s*\)|(-?\d+(?:\.\d+)?))\s*$/i;

let moved = 0;
for (const r of rows) {
  if (r.correctAnswer || !r.questionText) continue;
  const m = IN_STEM.exec(r.questionText);
  if (!m) continue;
  const value = storedForm(m[1] ?? m[2], r);
  if (value === null) continue;
  r.correctAnswer = value;
  r.questionText = r.questionText.slice(0, m.index).trimEnd();
  r.answerNote = `key moved out of the question text, where the printed answer line had been left`;
  if (r.status === "needs_review") r.status = "ok";
  moved++;
}
if (moved) console.log(`  +${String(moved).padStart(3)}  answers moved out of the question text`);
filled += moved;

/* --------------------------------- report -------------------------------- */

const after = rows.filter((r) => !r.correctAnswer).length;
console.log(
  `\n${DRY ? "[dry run] " : ""}recovered ${filled} key(s)` +
    (corrected ? `, corrected ${corrected}` : "") +
    (retyped ? `, retyped ${retyped} row(s) as numerical` : "") +
    `; ${before} → ${after} still without one.`
);

if (notes.length) {
  console.log(`\nkeys the page and the archive disagree on (nothing written):`);
  for (const n of notes.slice(0, 25)) console.log(n);
  if (notes.length > 25) console.log(`    ...and ${notes.length - 25} more`);
}
if (refused.length) {
  console.log(`\nfiles left alone, and why:`);
  for (const p of refused) console.log(`  · ${p}`);
}
if (stuck.size) {
  console.log(`\nrows the page itself could not answer:`);
  for (const [reason, list] of [...stuck].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(list.length).padStart(3)}  ${reason}`);
    for (const r of list.slice(0, 3)) console.log(`         ${r.sourceUrl} ${r.subject} Q${r.questionNumber}`);
    if (list.length > 3) console.log(`         ...and ${list.length - 3} more`);
  }
}

if (!DRY && (filled || corrected)) {
  fs.writeFileSync(args.file, JSON.stringify(raw, null, 2));
  console.log(`\nwrote ${args.file}`);
}
