#!/usr/bin/env node
// Audit how every stored question would actually RENDER.
//
// The import validates that a row is well-formed — it has a subject, a key, two
// options. That is not the same as being readable. A question can pass every
// validation and still reach a candidate as "The value of is ______", or with
// "\frac{1}{2}" printed as those literal characters, or with the previous
// question's worked solution glued to its front.
//
// This checks the things a candidate would actually notice, reports counts per
// problem with examples, and exits non-zero if anything is found — so it can be
// run after every conversion rather than only when something looks wrong.
//
// Usage:
//   node scripts/auditPyq.mjs
//   node scripts/auditPyq.mjs --exam JEE_MAIN --year 2023
//   node scripts/auditPyq.mjs --samples 5
//   node scripts/auditPyq.mjs --json audit.json

import fs from "node:fs";
import process from "node:process";
import prisma from "../src/prismaClient.js";

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
const SAMPLES = Number(args.samples) || 3;

/* ------------------------------- helpers -------------------------------- */

const opts = (r) => [r.optionA, r.optionB, r.optionC, r.optionD];
const allText = (r) => [r.questionText, ...opts(r), r.solution].filter(Boolean).join("\n");
const tidy = (s) => String(s || "").replace(/\s+/g, " ").trim();

/**
 * Text with every maths span removed — what actually reaches the page as prose.
 *
 * All four delimiter styles have to go, not just `$...$`. The datasets in
 * data/pyq are written in `\( ... \)`, which remark-math renders exactly as
 * well, and an audit that only knew about `$` reported 591 perfectly good NEET
 * and JEE Advanced rows as broken. Double-escaped forms are stripped too so
 * they are reported once, by the check that is actually about them.
 */
const outsideMath = (s) =>
  String(s || "")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$]*\$/g, " ")
    .replace(/\\\\\[[\s\S]*?\\\\\]/g, " ")
    .replace(/\\\\\([\s\S]*?\\\\\)/g, " ")
    .replace(/\\\[[\s\S]*?\\\]/g, " ")
    .replace(/\\\([\s\S]*?\\\)/g, " ");

/**
 * Each check returns true when the row is BROKEN.
 *
 * Ordered roughly by how badly a candidate is affected: an unanswerable
 * question first, cosmetic noise last.
 */
const CHECKS = [
  {
    id: "stem-empty",
    what: "Question text is empty or under 10 characters",
    test: (r) => tidy(r.questionText).length < 10,
  },
  {
    id: "mcq-no-options",
    what: "Multiple-choice question with fewer than two options, and no figure to supply them",
    test: (r) =>
      r.questionType === "mcq_single" &&
      !r.needsFigure &&
      opts(r).filter((o) => tidy(o)).length < 2,
  },
  {
    id: "key-points-nowhere",
    what: "Answer key names an option that is empty",
    test: (r) =>
      r.questionType === "mcq_single" &&
      !r.needsFigure &&
      "ABCD".includes(r.correctAnswer || "") &&
      !tidy(opts(r)["ABCD".indexOf(r.correctAnswer)]),
  },
  {
    id: "no-key",
    what: "No answer key, and not marked bonus",
    test: (r) => !r.correctAnswer && r.status !== "bonus",
  },
  {
    id: "figure-missing",
    what: "Flagged as needing a figure, but no image is attached",
    test: (r) => r.needsFigure && !r.diagramImage && !r.diagramSvg,
  },
  {
    id: "unbalanced-math",
    what: "Odd number of $ delimiters — KaTeX will swallow the rest of the text",
    test: (r) => ((allText(r).match(/\$/g) || []).length % 2) !== 0,
  },
  {
    id: "latex-outside-math",
    what: "LaTeX commands outside any $...$, so they print as literal characters",
    test: (r) => /\\(frac|dfrac|sqrt|alpha|beta|gamma|theta|lambda|mu|omega|times|cdot|leq|geq|neq|pm|int|sum|infty|circ|Omega|Delta|to|Rightarrow|in|cup|cap)\b|\^\{|_\{/.test(outsideMath(allText(r))),
  },
  {
    id: "displaced-astral",
    what: "Maths letters left in the Hangul range — the lost-surrogate bug",
    test: (r) => /[가-힣]/.test(allText(r)),
  },
  {
    id: "unmapped-glyphs",
    what: "Private-use or replacement characters the font never mapped",
    test: (r) => /[-�]/.test(allText(r)),
  },
  {
    id: "solution-residue",
    what: "Previous question's answer or worked solution glued to the stem",
    test: (r) => /(Official\s*Ans|Allen\s*Ans\b|^\s*Sol\s*\.)/i.test(r.questionText || ""),
  },
  {
    id: "options-identical",
    what: "Two or more options are the same text",
    test: (r) => {
      const o = opts(r).map(tidy).filter(Boolean);
      return o.length >= 2 && new Set(o).size !== o.length;
    },
  },
  // NOTE: a "stem-truncated" check lived here, inferring truncation from the
  // last word of the stem. Removed rather than tuned, because the premise is
  // wrong: an MCQ stem is completed by its OPTIONS, so ending on a preposition
  // is normal and is evidence of nothing.
  //
  //   "Oxygen is not produced during photosynthesis by"
  //   "...stored for several years in liquid nitrogen having a temperature of"
  //   "The number of chlorine atoms in bithionol is"
  //
  // All three are complete questions. Successive tightenings took it from 839
  // hits to 127 and every sample stayed a false positive, so it produced no
  // actionable signal at any threshold. Genuinely unusable stems are caught by
  // stem-empty and mcq-no-options, which test facts rather than style.
  {
    id: "legacy-caret",
    what: "Old ^( ) superscript notation, which no renderer understands",
    test: (r) => /\^\(/.test(allText(r)),
  },
  {
    // Cosmetic, not broken: preprocessMath collapses `\\(` and `\\` before
    // KaTeX ever sees them, so these render correctly today. Reported anyway
    // because that compatibility shim is currently load-bearing for a quarter
    // of the archive, and data that needs a shim to be correct is data that
    // breaks the day someone simplifies the shim.
    id: "double-escaped",
    what: "Double-escaped backslashes (renders correctly, but only via the compatibility shim)",
    severity: "cosmetic",
    test: (r) => /\\\\[a-zA-Z(\[]/.test(allText(r)),
  },
];

/* --------------------------------- run ---------------------------------- */

async function main() {
  const where = {};
  if (args.exam && args.exam !== true) where.examCode = String(args.exam);
  if (args.year && args.year !== true) where.year = Number(args.year);

  const rows = await prisma.previousYearQuestion.findMany({
    where,
    select: {
      id: true, examCode: true, year: true, paperId: true, subject: true,
      paperQuestionNumber: true, questionNumber: true, questionType: true, status: true,
      questionText: true, optionA: true, optionB: true, optionC: true, optionD: true,
      correctAnswer: true, solution: true, needsFigure: true, diagramImage: true, diagramSvg: true,
    },
  });

  console.log(`Auditing ${rows.length} question(s)${where.examCode ? ` for ${where.examCode}` : ""}${where.year ? ` ${where.year}` : ""}.\n`);

  const hits = new Map(CHECKS.map((c) => [c.id, []]));
  for (const r of rows) {
    for (const c of CHECKS) {
      try { if (c.test(r)) hits.get(c.id).push(r); } catch { /* a check must never abort the audit */ }
    }
  }

  const where_ = (r) =>
    `${r.examCode} ${r.year} ${r.paperId ? r.paperId.replace(/^jee-main-\d{4}-/, "") : "-"} ` +
    `${r.subject} Q${r.paperQuestionNumber ?? r.questionNumber ?? "?"}`;

  let broken = 0;
  const report = [];

  for (const c of CHECKS) {
    const found = hits.get(c.id);
    if (!found.length) { console.log(`  ✔ ${c.id.padEnd(22)} clean`); continue; }
    broken += found.length;

    // Which years/exams it concentrates in — usually names the culprit pipeline.
    const by = {};
    for (const r of found) {
      const k = `${r.examCode} ${r.year}`;
      by[k] = (by[k] || 0) + 1;
    }

    console.log(`\n  ✖ ${c.id} — ${found.length} row(s)`);
    console.log(`    ${c.what}`);
    console.log(`    by source: ${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join(", ")}`);
    for (const r of found.slice(0, SAMPLES)) {
      console.log(`      · ${where_(r)}`);
      console.log(`        ${tidy(r.questionText).slice(0, 150)}`);
    }

    report.push({
      id: c.id, what: c.what, count: found.length, bySource: by,
      examples: found.slice(0, 20).map((r) => ({ id: r.id, where: where_(r), questionText: r.questionText })),
    });
  }

  const affected = new Set();
  for (const found of hits.values()) for (const r of found) affected.add(r.id);

  console.log(
    `\n${"─".repeat(64)}\n` +
      `${affected.size} of ${rows.length} question(s) have at least one problem ` +
      `(${Math.round((affected.size / rows.length) * 100)}%), ${broken} problem(s) in total.`
  );

  if (args.json && args.json !== true) {
    fs.writeFileSync(args.json, JSON.stringify(report, null, 2));
    console.log(`Full report → ${args.json}`);
  }

  await prisma.$disconnect();
  process.exit(affected.size ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
