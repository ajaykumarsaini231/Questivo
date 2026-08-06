#!/usr/bin/env node
// Recover the answer keys the line-by-line parse could not reach.
//
// WHY A SECOND PASS EXISTS
//
// parseAllenSolution walks the booklet as a sequence of lines, and where that
// sequence breaks the whole file is lost: an answer printed twice splits one
// question into two and shifts every key after it, so convertJeeMain discards
// that file's keys rather than publish a wrong one. Eight 2025 files went that
// way, 25 questions each, and one more has a text layer so scrambled that no
// answer line survives reading order at all.
//
// The answers are still on those pages. They are printed in the SOLUTION block
// — "Ans. (3)" between the question and its working — which is what the source
// is for. What failed was the ordering, not the reading.
//
// So this pass ignores order entirely and pairs GEOMETRICALLY: every "Ans. (n)"
// is attributed to the nearest question number standing above it in the same
// column of the same page. A page that interleaves two columns, drops a line,
// or repeats an answer cannot disturb that, because nothing depends on what
// came before. It is the same lesson the GATE recovery learned — OCR and
// layout failures must produce a MISSING key, never a wrong one, and geometry
// is what makes the pairing independent of both.
//
// Only rows that have no key are touched. A key that survived the first parse
// is better evidence than this and is never overwritten.
//
// Usage:
//   node scripts/recoverJeeMainKeys.mjs --file data/pyq/jee-main-2025.json \
//     --dir "C:/Users/LSE/Downloads/ch/jee questions" [--dry-run]

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as mupdf from "mupdf";

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
Recover missing answer keys from the solution blocks of the source booklets.

  --file <path>   a converted JSON file
  --dir <path>    folder holding the source PDFs
  --dry-run       report what would change and write nothing
`);
  process.exit(args.help ? 0 : 1);
}

const DRY = Boolean(args["dry-run"]);

/** A question number at the head of a line. Never a decimal — see figures.mjs. */
const NUMBER_LINE = /^(\d{1,3})\s*\.(?!\d)/;
/** "Ans. (3)", wherever it sits on the line. The bracket keeps "Answer" out. */
const ANSWER = /(?:^|[^A-Za-z])Ans\.?\s*\(\s*([^)\n]{1,24}?)\s*\)/i;
/** Anything before SECTION-A is the instruction page, not the paper. */
const SECTION_A = /^SECTION\s*[-–]?\s*A\b/i;

/** Question anchors and answer lines on every page, with where they sit. */
function readGeometry(pdfPath) {
  const doc = mupdf.Document.openDocument(fs.readFileSync(pdfPath), "application/pdf");
  const anchors = [];
  const answers = [];
  let start = null;

  for (let p = 0; p < doc.countPages(); p++) {
    const page = doc.loadPage(p);
    let st;
    try { st = JSON.parse(page.toStructuredText().asJSON()); } catch { continue; }
    const [, , pageW] = page.getBounds();

    for (const block of st.blocks || []) {
      for (const line of block.lines || []) {
        const text = (line.text ?? "").trim();
        if (!text) continue;
        const b = line.bbox || {};
        const at = { page: p, x: b.x ?? 0, y: b.y ?? 0, pageW };

        if (!start && SECTION_A.test(text)) start = { page: p, y: at.y };

        const num = NUMBER_LINE.exec(text);
        if (num) {
          const n = Number(num[1]);
          if (n >= 1 && n <= 99) anchors.push({ ...at, n });
        }
        // A line can carry both — "(4) 0.441 g Ans. (3)" — so this is not
        // an else. The number test above already claimed what it claimed.
        const ans = ANSWER.exec(text);
        if (ans) answers.push({ ...at, value: ans[1].trim() });
      }
    }
  }

  const after = (o) => !start || o.page > start.page || (o.page === start.page && o.y >= start.y);
  return { anchors: anchors.filter(after), answers: answers.filter(after) };
}

/**
 * Pair each answer with the question it answers.
 *
 * Nearest number ABOVE it in the same column. Two-up booklets are the reason
 * the column matters: the answer to a left-column question and a number in the
 * right column can share a y, and without the column test the answer attaches
 * to whichever happens to be nearer.
 */
function pairByPosition(anchors, answers) {
  const keys = new Map();
  for (const a of answers) {
    const mid = a.pageW / 2;
    const sameColumn = (q) => (q.x < mid) === (a.x < mid);
    const above = anchors
      .filter((q) => q.page === a.page && q.y <= a.y + 2 && sameColumn(q))
      .sort((p, q) => q.y - p.y)[0];
    if (!above) continue;
    // First answer under a number wins: a repeated key is the same key, and
    // anything later belongs to whatever the page does next.
    if (!keys.has(above.n)) keys.set(above.n, a.value);
  }
  return keys;
}

/**
 * What the booklet prints, in the form the archive stores.
 *
 * A booklet names the winning choice by its position — "Ans. (3)" — while a
 * multiple-choice row stores the letter, because that is what the player scores
 * against and what optionC holds. A numerical question has no letter: its
 * printed answer IS the answer and is kept verbatim.
 *
 * Getting this wrong is not a formatting slip. "3" against a row whose options
 * are A-D matches nothing, so every recovered question would mark every
 * candidate wrong — which is worse than the missing key it replaced.
 */
const OPTION_LETTERS = { 1: "A", 2: "B", 3: "C", 4: "D" };

function storedForm(printed, row) {
  const value = String(printed).trim();
  if (row.questionType !== "mcq_single") return value;
  if (/^[A-D]$/i.test(value)) return value.toUpperCase();
  const letter = OPTION_LETTERS[value];
  // A multiple-choice answer that is neither a letter nor 1-4 is something
  // this pass does not understand — the board voiding a question, a range, a
  // scanning artefact. Left unkeyed rather than guessed.
  return letter ?? null;
}

/** The lowest number that starts the paper's own run, so 51 maps to Q1. */
function numberingBase(numbers) {
  const set = new Set(numbers);
  let base = null, best = 0;
  for (const b of [...set].sort((x, y) => x - y)) {
    let n = b, len = 0, gap = 0;
    while (gap <= 2) {
      if (set.has(n)) { len = n - b + 1; gap = 0; } else gap++;
      n++;
    }
    if (len > best) { best = len; base = b; }
  }
  return best >= 12 ? base : null;
}

/* --------------------------------- run ---------------------------------- */

const rows = JSON.parse(fs.readFileSync(args.file, "utf8"));
const unkeyed = rows.filter((r) => !r.correctAnswer && r.sourceUrl);
const byFile = new Map();
for (const r of unkeyed) {
  if (!byFile.has(r.sourceUrl)) byFile.set(r.sourceUrl, []);
  byFile.get(r.sourceUrl).push(r);
}

console.log(`${unkeyed.length} row(s) without a key, across ${byFile.size} file(s).\n`);

let filled = 0;
let unreachable = 0;
const problems = [];

for (const [file, group] of byFile) {
  const pdfPath = path.join(String(args.dir), file);
  if (!fs.existsSync(pdfPath)) { problems.push(`${file}: not found`); unreachable += group.length; continue; }

  let geometry;
  try { geometry = readGeometry(pdfPath); }
  catch (e) { problems.push(`${file}: ${e.message}`); unreachable += group.length; continue; }

  const keys = pairByPosition(geometry.anchors, geometry.answers);
  const base = numberingBase([...new Set(geometry.anchors.map((a) => a.n))]);
  if (base === null) { problems.push(`${file}: no numbering run found`); unreachable += group.length; continue; }

  let here = 0;
  for (const r of group) {
    // The row knows where it sits in its subject; the booklet numbers from
    // `base`. A 2025 Chemistry booklet running 51..75 answers Q1 at 51.
    const printed = base + r.questionNumber - 1;
    const value = keys.get(printed);
    if (value === undefined) continue;
    const stored = storedForm(value, r);
    if (stored === null) continue;
    r.correctAnswer = stored;
    r.answerNote = `key recovered from the printed solution block ("Ans. (${value})")`;
    here++;
  }
  filled += here;
  unreachable += group.length - here;
  console.log(`  ${String(here).padStart(3)}/${String(group.length).padStart(3)}  ${file.replace(/^JEEMain_|_Solution\.pdf$/g, "")}`);
}

console.log(`\n${DRY ? "[dry run] " : ""}recovered ${filled} key(s); ${unreachable} still without one.`);
if (problems.length) {
  console.log("\nfiles that could not be read:");
  for (const p of problems.slice(0, 10)) console.log(`  · ${p}`);
}
if (!DRY && filled) {
  fs.writeFileSync(args.file, JSON.stringify(rows, null, 2));
  console.log(`\nwrote ${args.file}`);
}
