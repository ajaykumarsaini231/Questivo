#!/usr/bin/env node
// Audit a batch of previous year questions before you publish them.
//
// WHY THIS EXISTS
//
// Third-party question datasets are usually OCR'd from PDFs, and OCR of
// mathematics fails in ways that are invisible in a spot check: a lost
// superscript turns x² into x2, a dropped minus sign flips an answer, a
// mis-segmented column pairs question 12 with the answer to question 13. The
// dataset's stated key is an assertion, not a fact.
//
// A wrong answer key is worse than a missing question. The candidate marks
// their correct working wrong and re-learns it the broken way.
//
// So this samples N questions and, for each, independently re-solves it and
// compares against what the dataset claims. It also runs cheap structural
// checks that need no model at all — those catch most OCR damage for free.
//
// Usage:
//   node scripts/verifyPyq.mjs --file data/pyq/jee-2024.json --sample 20
//   node scripts/verifyPyq.mjs --exam JEE_MAIN --sample 20      (already imported)
//   node scripts/verifyPyq.mjs --file x.json --sample 20 --structural-only
//
// Exits non-zero when agreement falls below --threshold (default 80%), so it
// can gate an import in a script.

import fs from "node:fs";
import process from "node:process";
import { chat, ROLES } from "../src/lib/aiClient.js";

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
const SAMPLE = Number(args.sample) || 20;
const THRESHOLD = Number(args.threshold) || 80;
const CONCURRENCY = Number(args.concurrency) || 2;

if (args.help || (!args.file && !args.exam)) {
  console.log(`
Audit previous year questions before publishing them.

  --file <path>         a converted JSON file (before import)
  --exam <code>         audit rows already in the database
  --sample <n>          how many to check (default 20)
  --threshold <pct>     minimum agreement to pass (default 80)
  --structural-only     skip the model; run only the free checks
  --concurrency <n>     parallel solves (default 2)
`);
  process.exit(args.help ? 0 : 1);
}

/* ----------------------------- load the batch ---------------------------- */

async function load() {
  if (args.file && args.file !== true) {
    const parsed = JSON.parse(fs.readFileSync(args.file, "utf8"));
    const rows = Array.isArray(parsed) ? parsed : parsed.questions;
    if (!Array.isArray(rows)) throw new Error('expected an array or {questions:[...]}');
    return rows;
  }
  const { default: prisma } = await import("../src/prismaClient.js");
  const { resolvePyqExamCode } = await import("../src/lib/pyqPattern.js");
  const examCode = resolvePyqExamCode(args.exam);
  if (!examCode) throw new Error(`unknown exam "${args.exam}"`);
  const rows = await prisma.previousYearQuestion.findMany({ where: { examCode } });
  await prisma.$disconnect();
  return rows;
}

/* --------------------------- structural checks --------------------------- */

const LETTERS = ["A", "B", "C", "D"];
const opts = (q) => LETTERS.map((L) => q[`option${L}`]);

/**
 * Checks that need no model. These find the damage OCR actually causes, and
 * they run on the WHOLE batch rather than the sample, because they are free.
 */
function structuralIssues(q) {
  const found = [];
  const text = String(q.questionText || "");
  const options = opts(q);
  const type = q.questionType || "mcq_single";
  const optionless = type === "numerical" || type === "integer";

  if (text.length < 25) found.push("question text suspiciously short");

  // Truncation is detected from unbalanced markup, not from missing end
  // punctuation. Plenty of perfectly complete exam questions simply stop at
  // "...is equal to" with no terminator — an earlier version of this check
  // flagged 90 intact questions that way, which is worse than useless because
  // it buries the real defects.
  const dollars = (text.match(/(?<!\\)\$/g) || []).length;
  const openBrace = (text.match(/(?<!\\)\{/g) || []).length;
  const closeBrace = (text.match(/(?<!\\)\}/g) || []).length;
  if (dollars % 2 !== 0) found.push("unbalanced $ — LaTeX cut off mid-expression");
  if (openBrace !== closeBrace) found.push("unbalanced braces in LaTeX");
  if (/[\\-]\s*$/.test(text.trim())) found.push("ends on a dangling backslash or hyphen");
  // U+FFFD is what a bad encoding conversion leaves behind.
  if (text.includes("�") || options.some((o) => o && o.includes("�"))) {
    found.push("replacement characters (broken encoding)");
  }

  if (!optionless) {
    const filled = options.filter((o) => o && String(o).trim());
    if (filled.length < 2) found.push(`only ${filled.length} option(s)`);
    const seen = new Set(filled.map((o) => String(o).trim().toLowerCase()));
    if (seen.size !== filled.length) found.push("duplicate options");

    const key = String(q.correctAnswer || "").trim().toUpperCase();
    for (const letter of key.split(",").map((s) => s.trim())) {
      if (!LETTERS.includes(letter)) found.push(`answer "${letter}" is not A-D`);
      else if (!q[`option${letter}`]) found.push(`answer ${letter} points at an empty option`);
    }
  } else if (!/^-?\d+(\.\d+)?$/.test(String(q.correctAnswer || "").trim())) {
    found.push(`${type} answer "${q.correctAnswer}" is not a number`);
  }

  if (!q.topic) found.push("no topic (contributes nothing to the AI pattern)");
  return found;
}

/* ---------------------------- independent solve -------------------------- */

async function solve(q) {
  const body = [
    q.questionText,
    ...LETTERS.map((L) => (q[`option${L}`] ? `${L}) ${q[`option${L}`]}` : null)).filter(Boolean),
  ].join("\n");

  const res = await chat(ROLES.VERIFICATION, {
    messages: [
      {
        role: "system",
        content:
          "You solve exam multiple-choice questions. Work it out, then reply with ONLY a final line " +
          "'ANSWER: X' where X is A, B, C or D. If the question is garbled, incomplete, or no option " +
          "is correct, reply 'ANSWER: NONE'. Do not guess to be agreeable.",
      },
      { role: "user", content: body },
    ],
    temperature: 0,
    max_tokens: 3000,
  });

  const text = res.choices?.[0]?.message?.content || "";
  return text.match(/ANSWER:\s*(A|B|C|D|NONE)/i)?.[1]?.toUpperCase() ?? null;
}

/* --------------------------------- run ----------------------------------- */

const rows = await load();
if (!rows.length) {
  console.error("✖ nothing to verify");
  process.exit(1);
}

console.log(`\nAuditing ${rows.length} question(s)\n`);

console.log("═══ 1. Structural checks (whole batch, no model) ═══\n");
const flagged = [];
const counts = {};
for (const [i, q] of rows.entries()) {
  const issues = structuralIssues(q);
  if (!issues.length) continue;
  flagged.push({ i, q, issues });
  for (const issue of issues) counts[issue] = (counts[issue] || 0) + 1;
}

if (!flagged.length) {
  console.log("  ✔ no structural problems\n");
} else {
  for (const [issue, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    const pct = Math.round((n / rows.length) * 100);
    console.log(`  ${String(n).padStart(5)}  (${String(pct).padStart(3)}%)  ${issue}`);
  }
  console.log(`\n  Examples:`);
  for (const f of flagged.slice(0, 3)) {
    console.log(`   [${f.i}] ${f.issues.join("; ")}`);
    console.log(`        "${String(f.q.questionText).slice(0, 90)}…"`);
  }
  console.log("");
}

if (args["structural-only"]) {
  const clean = rows.length - flagged.length;
  console.log(`${clean}/${rows.length} clean (${Math.round((clean / rows.length) * 100)}%)\n`);
  process.exit(flagged.length > rows.length / 2 ? 1 : 0);
}

/* --- 2. Independent re-solve on a sample --- */

// Only single-correct MCQs can be checked by re-solving into one of A-D.
const checkable = rows.filter((q) => (q.questionType || "mcq_single") === "mcq_single");
const pool = [...checkable];
for (let i = pool.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [pool[i], pool[j]] = [pool[j], pool[i]];
}
const sample = pool.slice(0, Math.min(SAMPLE, pool.length));

console.log(`═══ 2. Independent re-solve of ${sample.length} sampled question(s) ═══`);
console.log(`    Each is solved from scratch, then compared to the stated key.\n`);

const results = [];
for (let i = 0; i < sample.length; i += CONCURRENCY) {
  const slice = sample.slice(i, i + CONCURRENCY);
  const verdicts = await Promise.all(
    slice.map((q) => solve(q).catch((e) => ({ error: e.message })))
  );
  slice.forEach((q, k) => {
    const v = verdicts[k];
    const stated = String(q.correctAnswer || "").trim().toUpperCase();
    let status;
    if (v && typeof v === "object") status = "error";
    else if (!v) status = "unparsed";
    else if (v === "NONE") status = "unsolvable";
    else status = v === stated ? "agree" : "disagree";
    results.push({ q, stated, got: typeof v === "string" ? v : null, status });
    process.stdout.write(
      { agree: "·", disagree: "✖", unsolvable: "?", unparsed: "~", error: "!" }[status]
    );
  });
}
console.log("\n");

const tally = results.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
const decided = (tally.agree || 0) + (tally.disagree || 0);
const agreement = decided ? Math.round(((tally.agree || 0) / decided) * 100) : 0;

console.log(`  agree      ${String(tally.agree || 0).padStart(3)}   model reached the stated answer`);
console.log(`  disagree   ${String(tally.disagree || 0).padStart(3)}   model reached a different answer`);
console.log(`  unsolvable ${String(tally.unsolvable || 0).padStart(3)}   model says no option fits (often OCR damage)`);
console.log(`  unparsed   ${String(tally.unparsed || 0).padStart(3)}   no verdict returned`);
console.log(`  error      ${String(tally.error || 0).padStart(3)}   request failed`);

const mismatches = results.filter((r) => r.status === "disagree" || r.status === "unsolvable");
if (mismatches.length) {
  console.log(`\n─── questions to look at by hand ───`);
  for (const m of mismatches.slice(0, 10)) {
    console.log(`\n  dataset says ${m.stated}, independent solve says ${m.got}`);
    // Print the question in full. Eliding it made intact questions look
    // truncated and sent an earlier reading of this report down the wrong path.
    console.log(`  "${String(m.q.questionText)}"`);
    for (const L of LETTERS) if (m.q[`option${L}`]) console.log(`    ${L}) ${m.q[`option${L}`]}`);
  }
  if (mismatches.length > 10) console.log(`\n  …and ${mismatches.length - 10} more`);
}

console.log(`\n════ agreement on decided questions: ${agreement}% (threshold ${THRESHOLD}%) ════`);
if (agreement >= THRESHOLD) {
  console.log("Good enough to publish. Spot-check the mismatches above anyway.\n");
} else {
  console.log(
    "Below threshold. On a sample this size that usually means the dataset's keys are\n" +
      "misaligned with its questions (a classic OCR column-offset), not that the model is\n" +
      "wrong 1-in-5 times. Do not publish these without checking the source.\n"
  );
}
process.exit(agreement >= THRESHOLD ? 0 : 1);
