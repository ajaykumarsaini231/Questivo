#!/usr/bin/env node
// Make a question with unreadable options say so, instead of showing blanks.
//
// Not every PYQ row came from a PDF this repo can crop. Several thousand were
// imported from public datasets — PhysicsWallahAI's JEE Main 2025 set and the
// jeebench collection — and a few of those lost option text in whatever step
// produced them. There is no source page to go back to, so no crop can be made.
//
// Two different states, and they are not interchangeable:
//
//   the KEYED option is blank   the candidate cannot pick the right answer, so
//                               the question is unscoreable. Marked
//                               needs_review, which the paper builder already
//                               excludes and the marker already skips.
//   some other option is blank  a degraded but practisable question. Flagged
//                               needsFigure so the player says "could not be
//                               read from the source paper" rather than
//                               rendering an empty radio row that looks like a
//                               choice the examiner never printed.
//
// Rows whose options were cropped are untouched: an image IS the option.
//
// Usage:
//   node scripts/flagUnreadableOptions.mjs --dry-run
//   node scripts/flagUnreadableOptions.mjs

import process from "node:process";
import prisma from "../src/prismaClient.js";

const DRY = process.argv.includes("--dry-run");
const LETTERS = ["A", "B", "C", "D"];
const empty = (s) => !s || !String(s).trim();

const rows = await prisma.previousYearQuestion.findMany({
  where: { questionType: { notIn: ["numerical", "integer"] } },
  select: {
    id: true, examCode: true, year: true, subject: true, status: true, needsFigure: true,
    correctAnswer: true, questionImage: true, diagramImage: true,
    optionA: true, optionB: true, optionC: true, optionD: true,
    optionAImage: true, optionBImage: true, optionCImage: true, optionDImage: true,
  },
});

const unscoreable = [];
const degraded = [];

for (const q of rows) {
  const blind = LETTERS.filter((L) => empty(q[`option${L}`]) && empty(q[`option${L}Image`]));
  if (!blind.length) continue;
  // The picture carries the choices — that is the whole point of the stem crop
  // covering the option band when the options could not be split out.
  const shown = Boolean(q.questionImage || q.diagramImage);

  const keyed = String(q.correctAnswer || "")
    .toUpperCase()
    .match(/[A-D]/g) ?? [];
  if (!shown && keyed.length && keyed.every((L) => blind.includes(L))) {
    if (q.status !== "needs_review") unscoreable.push(q);
    continue;
  }
  if (!shown && !q.needsFigure) degraded.push(q);
}

const by = (list) =>
  list.reduce((a, q) => ((a[`${q.examCode} ${q.year}`] = (a[`${q.examCode} ${q.year}`] || 0) + 1), a), {});

console.log(`${rows.length} multiple-choice rows checked`);
console.log(`\nunscoreable — the keyed option is blank and nothing on screen shows it: ${unscoreable.length}`);
console.log(by(unscoreable));
console.log(`\ndegraded — some other option is blank, question still practisable: ${degraded.length}`);
console.log(by(degraded));

if (DRY) {
  console.log("\n(dry run — nothing written)");
  await prisma.$disconnect();
  process.exit(0);
}

for (const q of unscoreable) {
  await prisma.previousYearQuestion.update({
    where: { id: q.id },
    // correctAnswer is kept. It is not wrong, it just points at an option whose
    // text did not survive — and clearing it would lose the one fact that makes
    // the row repairable if the option is ever recovered.
    data: { status: "needs_review", needsFigure: true },
  });
}
for (const q of degraded) {
  await prisma.previousYearQuestion.update({ where: { id: q.id }, data: { needsFigure: true } });
}

console.log(`\n✔ ${unscoreable.length} marked needs_review, ${degraded.length} flagged needsFigure`);
await prisma.$disconnect();
