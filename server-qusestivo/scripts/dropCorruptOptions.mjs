#!/usr/bin/env node
/**
 * Silence option TEXT that the extractor got wrong, where the crop is right.
 *
 * THE BUG THIS FIXES
 *
 * JEE Main 2023 Q13 printed four options: √2, 1/√2, 2, 1/2. What came out of
 * the text layer was:
 *
 *   A  $\sqrt 2$              ✓
 *   B  $_{\sqrt }\frac{1}{2} 1$   ← garbage
 *   C  2                      ✓
 *   D  2                      ← should be 1/2
 *
 * D is not merely ugly, it is WRONG, and B renders as raw LaTeX on the page.
 * The key for that question is B, so a candidate reading the options as shown
 * cannot pick the right answer at all.
 *
 * The cause is stacked fractions and surds: a PDF sets 1/√2 as a numerator, a
 * rule and a denominator at three different positions, and a linear text
 * extraction reassembles them in the wrong order or drops a glyph. This is not
 * fixable by better parsing of the same text layer — the information is not in
 * it.
 *
 * What IS right is the crop. The converters cut the printed question, options
 * included, straight off the page. So where a row has its picture and its text
 * disagrees with itself, the text is dropped and the renderer falls back to
 * "choice (B) is in the question image above" — which is true, and points the
 * candidate at the authoritative rendering.
 *
 * SAFETY
 *
 * Nothing is dropped unless the row has a questionImage or a per-option crop to
 * fall back on, so no question ever loses its options entirely. The key is
 * never touched. Detection is deliberately conservative — see CORRUPT below —
 * because wrongly blanking a correct option costs a candidate a readable
 * question, and the fallback text is a slightly worse experience than good text.
 *
 * Usage:
 *   node scripts/dropCorruptOptions.mjs --exam JEE_MAIN --dry-run
 *   node scripts/dropCorruptOptions.mjs --exam JEE_MAIN --year 2023
 */

import "dotenv/config";
import process from "node:process";
import prisma from "../src/prismaClient.js";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) {
      const n = all[i + 1];
      acc.push([a.slice(2), !n || n.startsWith("--") ? true : n]);
    }
    return acc;
  }, [])
);

const EXAM = args.exam && args.exam !== true ? String(args.exam) : "JEE_MAIN";
const YEAR = args.year && args.year !== true ? Number(args.year) : null;
const DRY = Boolean(args["dry-run"]);

const txt = (v) => String(v ?? "").trim();

/**
 * Signals that an option SET came out of the extractor broken.
 *
 * Each one is something a correctly typeset multiple-choice question cannot
 * legitimately have. Judged on the set, not on single options: "2" is a
 * perfectly good option on its own, and only becomes evidence when it is also
 * the text of another option in the same question.
 */
function corruptionOf(row) {
  const opts = { A: txt(row.optionA), B: txt(row.optionB), C: txt(row.optionC), D: txt(row.optionD) };
  const filled = Object.values(opts).filter(Boolean);
  if (filled.length < 2) return null;

  // 1. Two options with identical text. A real paper never prints the same
  //    choice twice — it would have two correct answers or two wrong ones, and
  //    the board's key could not distinguish them.
  if (new Set(filled).size < filled.length) return "duplicate option text";

  // 2. LaTeX the renderer cannot make sense of. `_{\sqrt }` is a subscript
  //    containing a bare \sqrt with no argument; `\frac{1}{2} 1` is a fraction
  //    followed by an orphaned numeral that belonged inside it. Both are
  //    reassembly damage, not notation.
  const broken =
    /_\{\s*\\sqrt\s*\}|\\sqrt\s*\}|\\frac\s*\{\s*\}|\\frac\{[^}]*\}\{[^}]*\}\s+\d+\s*\$?$/;
  for (const v of filled) if (broken.test(v)) return "malformed LaTeX";

  return null;
}

const rows = await prisma.previousYearQuestion.findMany({
  where: {
    examCode: EXAM,
    ...(YEAR ? { year: YEAR } : {}),
    questionType: { in: ["mcq_single", "mcq_multiple"] },
  },
  select: {
    id: true, year: true, paperId: true, paperQuestionNumber: true,
    optionA: true, optionB: true, optionC: true, optionD: true,
    questionImage: true, optionAImage: true, optionBImage: true,
    optionCImage: true, optionDImage: true,
  },
});

let corrupt = 0;
let fixed = 0;
let strandedNoImage = 0;
const byYear = {};
const samples = [];

for (const row of rows) {
  const why = corruptionOf(row);
  if (!why) continue;
  corrupt++;
  byYear[row.year] = (byYear[row.year] || 0) + 1;

  // A fallback must exist. Without a picture the broken text is still the only
  // thing the candidate has, and blanking it would leave four empty options —
  // strictly worse. Those rows are reported so they can be re-cut instead.
  const hasFallback =
    row.questionImage || row.optionAImage || row.optionBImage || row.optionCImage || row.optionDImage;
  if (!hasFallback) {
    strandedNoImage++;
    continue;
  }

  if (samples.length < 4) {
    samples.push(`${row.paperId} Q${row.paperQuestionNumber} — ${why}: ` +
      [row.optionA, row.optionB, row.optionC, row.optionD].map((o) => JSON.stringify(txt(o))).join(" "));
  }

  fixed++;
  if (!DRY) {
    // Only the text. The crops, the key and the stem are untouched.
    await prisma.previousYearQuestion.update({
      where: { id: row.id },
      data: { optionA: null, optionB: null, optionC: null, optionD: null },
    });
  }
}

console.log(`\n${rows.length} multiple-choice rows for ${EXAM}${YEAR ? ` ${YEAR}` : ""}`);
console.log(`  corrupt option sets      : ${corrupt}`);
console.log(`  ${DRY ? "would drop" : "dropped"} (crop to fall back on) : ${fixed}`);
console.log(`  left alone (no crop yet) : ${strandedNoImage}`);
if (Object.keys(byYear).length) {
  console.log(`  by year: ${Object.entries(byYear).sort().map(([y, n]) => `${y}:${n}`).join("  ")}`);
}
if (samples.length) {
  console.log("\n  examples:");
  for (const s of samples) console.log(`    ${s}`);
}

await prisma.$disconnect();
