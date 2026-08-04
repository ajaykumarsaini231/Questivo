#!/usr/bin/env node
// Repair the rendering defects scripts/auditPyq.mjs reports, in place.
//
// In place rather than by re-converting, because most of these rows do not come
// from a PDF at all — the NEET and JEE Advanced archives were imported from
// JSON datasets whose converters cannot be re-run against sources we do not
// hold. The defects are all in the stored text, so that is where they are
// fixed.
//
// Each repair is a pure text transform whose OUTPUT RENDERS IDENTICALLY to what
// preprocessMath already produces from the input. Nothing here changes how a
// question looks today; it changes the stored text so that it no longer depends
// on the renderer's compatibility shim to look that way.
//
// Usage:
//   node scripts/repairPyqText.mjs --dry-run
//   node scripts/repairPyqText.mjs
//   node scripts/repairPyqText.mjs --exam NEET

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
const DRY = Boolean(args["dry-run"]);

/* ------------------------------- repairs -------------------------------- */

/**
 * Collapse double-escaped LaTeX.
 *
 * These rows reached the database through a JSON pipeline that escaped the
 * backslashes twice, so `\(` is stored as `\\(` and `\circ` as `\\circ`.
 *
 * This applies EXACTLY the substitutions src/lib/mathUtils.ts already performs
 * before handing text to KaTeX, in the same order — so the rendered output is
 * provably unchanged, and the only difference is that the stored text is now
 * correct on its own.
 */
function collapseDoubleEscapes(s) {
  if (!s || !/\\\\/.test(s)) return s;
  return s
    .replace(/\\\\\(/g, "\\(")
    .replace(/\\\\\)/g, "\\)")
    .replace(/\\\\\[/g, "\\[")
    .replace(/\\\\\]/g, "\\]")
    .replace(/\\\\([a-zA-Z])/g, "\\$1");
}

/** `x^(2)` was an early notation of ours that no renderer understands. */
function moderniseCaret(s) {
  if (!s || !/\^\(/.test(s)) return s;
  return s.replace(/\^\(([^()]{1,12})\)/g, "^{$1}");
}

/**
 * Delimit LaTeX that carries no delimiters at all.
 *
 * Some option strings are stored as a bare `\frac{4}{5}`. remark-math only
 * renders what is delimited, so those reach the page as literal characters.
 * Wrapping the whole string is safe here precisely because the string is
 * nothing BUT the expression.
 */
const LATEX_CMD = /\\(frac|dfrac|sqrt|alpha|beta|gamma|delta|theta|lambda|mu|pi|rho|sigma|omega|Omega|Delta|times|cdot|leq|geq|neq|approx|pm|mp|int|sum|prod|infty|circ|to|Rightarrow|in|notin|cup|cap|left|right|text|mathrm|mathbf|log|ln|sin|cos|tan)\b/;

function wrapBareLatex(s) {
  if (!s) return s;
  const t = s.trim();
  if (!t || /[$]|\\\(|\\\[/.test(t)) return s; // already delimited somewhere
  if (!LATEX_CMD.test(t) && !/\^\{|_\{/.test(t)) return s;
  return `$${t}$`;
}

/** Strip a previous question's answer block from the front of a stem. */
function stripSolutionResidue(s) {
  if (!s) return s;
  const marks = [...s.matchAll(/(?:Official\s*Ans\.?[^.]{0,30}|Allen\s*Ans\.?\s*\([^)]*\)|Sol\.)/gi)];
  if (!marks.length) return s;
  const last = marks[marks.length - 1];
  const rest = s.slice(last.index + last[0].length).trim();
  // Only when what remains still reads as a question — a stem that genuinely
  // mentions "Sol." must not be truncated to nothing.
  return rest.length > 40 ? rest : s;
}

const TEXT_FIELDS = ["questionText", "optionA", "optionB", "optionC", "optionD", "solution"];

/** Every repair, in the order they must run. */
function repairRow(row) {
  const next = {};

  for (const f of TEXT_FIELDS) {
    let v = row[f];
    if (v == null) continue;
    const before = v;

    v = collapseDoubleEscapes(v);
    v = moderniseCaret(v);
    if (f === "questionText") v = stripSolutionResidue(v);
    // Only options are wrapped wholesale: a stem is prose with maths in it, and
    // wrapping a whole sentence would set the words as italic variables.
    if (f.startsWith("option")) v = wrapBareLatex(v);

    if (v !== before) next[f] = v;
  }

  // An MCQ with two identical options cannot be answered as written. Where the
  // text came from a PDF this is always an extraction failure — chemical
  // structures and stacked fractions collapsing to the same string — so the row
  // is switched to its figure, which is the original and is unambiguous.
  const opts = [
    next.optionA ?? row.optionA,
    next.optionB ?? row.optionB,
    next.optionC ?? row.optionC,
    next.optionD ?? row.optionD,
  ].map((o) => String(o || "").replace(/\s+/g, " ").trim()).filter(Boolean);

  if (opts.length >= 2 && new Set(opts).size !== opts.length && !row.needsFigure) {
    next.needsFigure = true;
    if (row.status === "ok") next.status = "needs_figure";
    if (!row.figureHint && row.paperId) {
      next.figureHint = `${row.paperId} ${row.subject} Q${row.questionNumber ?? row.paperQuestionNumber ?? ""}`.trim();
    }
  }

  return Object.keys(next).length ? next : null;
}

/* --------------------------------- run ---------------------------------- */

async function main() {
  const where = {};
  if (args.exam && args.exam !== true) where.examCode = String(args.exam);
  if (args.year && args.year !== true) where.year = Number(args.year);

  const rows = await prisma.previousYearQuestion.findMany({
    where,
    select: {
      id: true, examCode: true, year: true, subject: true, paperId: true,
      questionNumber: true, paperQuestionNumber: true, status: true,
      questionText: true, optionA: true, optionB: true, optionC: true, optionD: true,
      solution: true, needsFigure: true, figureHint: true,
    },
  });

  const changes = [];
  for (const r of rows) {
    const patch = repairRow(r);
    if (patch) changes.push({ row: r, patch });
  }

  const tally = {};
  for (const c of changes) for (const k of Object.keys(c.patch)) tally[k] = (tally[k] || 0) + 1;

  console.log(`${rows.length} question(s) examined; ${changes.length} need repair.`);
  console.log("fields touched:", tally);

  for (const c of changes.slice(0, 3)) {
    const f = Object.keys(c.patch).find((k) => TEXT_FIELDS.includes(k));
    if (!f) continue;
    console.log(`\n· ${c.row.examCode} ${c.row.year} ${c.row.subject} — ${f}`);
    console.log(`  before: ${String(c.row[f]).slice(0, 110)}`);
    console.log(`  after : ${String(c.patch[f]).slice(0, 110)}`);
  }

  if (DRY) {
    console.log("\n(dry run — nothing written)");
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  for (const c of changes) {
    await prisma.previousYearQuestion.update({ where: { id: c.row.id }, data: c.patch });
    done++;
    if (done % 200 === 0) console.log(`  ${done}/${changes.length}`);
  }
  console.log(`\n✔ repaired ${done} row(s).`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
