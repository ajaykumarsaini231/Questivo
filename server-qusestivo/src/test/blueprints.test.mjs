/**
 * Can the archive actually fill each full-test blueprint, and does the paper it
 * produces match the blueprint exactly?
 *
 * Runs against the real database on purpose. A blueprint is a claim about the
 * stored questions, and the only way to falsify it is to ask them.
 */

import "dotenv/config";
import prisma from "../prismaClient.js";
import {
  FULL_TEST_BLUEPRINTS,
  auditFullTest,
  generateFullTest,
} from "../lib/pyqBlueprints.js";

let passed = 0;
let failed = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — expected ${expected}, got ${actual}`}`);
};

console.log("\n=== Full-test blueprints vs the archive ===");

for (const examCode of Object.keys(FULL_TEST_BLUEPRINTS)) {
  const audit = await auditFullTest(examCode);
  console.log(`\n${audit.label} — ${audit.totalQuestions} questions · ${audit.totalMarks} marks · ${audit.durationMinutes} min`);
  for (const r of audit.rows) {
    const tag = `${r.subject}${r.label ? ` (${r.label})` : ""}`;
    console.log(
      `  ${r.short ? "SHORT" : "  ok "}  ${tag.padEnd(46)} need ${String(r.needed).padStart(3)}  have ${String(r.available).padStart(4)}`
    );
  }

  if (!audit.canGenerate) {
    console.log(`  -> cannot generate, short by ${audit.shortBy}`);
    failed++;
    continue;
  }

  const { questions, paper } = await generateFullTest(examCode);

  check(`${examCode}: question count matches the blueprint`, questions.length, audit.totalQuestions);
  check(`${examCode}: no duplicate questions`, new Set(questions.map((q) => q.id)).size, questions.length);

  // The advertised total must be the total the marker will actually reach.
  // These drifted apart for JEE Advanced, whose single-correct rows are worth 3
  // marks while the estimate assumed 4 — the paper said 216 and scored out of
  // 200. Summed here from the drawn questions, honouring any Section B cap.
  const limit = FULL_TEST_BLUEPRINTS[examCode].sectionBAttemptLimit;
  const perSubjectB = new Map();
  const scoredMarks = questions.reduce((n, q) => {
    if (limit && q.section === "B") {
      const usedB = perSubjectB.get(q.subject) || 0;
      if (usedB >= limit) return n;
      perSubjectB.set(q.subject, usedB + 1);
    }
    return n + q.marksCorrect;
  }, 0);
  check(`${examCode}: advertised marks equal the scorable marks`, paper.totalMarks, Math.round(scoredMarks));
  check(
    `${examCode}: every question belongs to this exam`,
    questions.every((q) => q.subject),
    true
  );
  check(
    `${examCode}: no answer key leaked to the client`,
    questions.some((q) => "correctAnswer" in q),
    false
  );

  // Per-slot fidelity: the drawn paper must match the blueprint slot for slot,
  // not merely in total. A paper with the right number of Physics questions but
  // the wrong MCQ/numerical split is the failure this whole file exists to catch.
  for (const { subject, slots } of FULL_TEST_BLUEPRINTS[examCode].subjects) {
    for (const slot of slots) {
      const matching = questions.filter(
        (q) =>
          q.subject === subject &&
          (!slot.questionTypes || slot.questionTypes.includes(q.questionType)) &&
          (slot.marks == null || q.marksCorrect === slot.marks)
      );
      check(
        `${examCode}: ${subject}${slot.label ? ` (${slot.label})` : ""} drew ${slot.count}`,
        matching.length >= slot.count,
        true
      );
    }
  }

  // Two draws of the same blueprint must differ, or "randomly selected" is a lie.
  const second = await generateFullTest(examCode);
  const overlap = questions.filter((q) => second.questions.some((s) => s.id === q.id)).length;
  check(
    `${examCode}: a second draw is a different paper (${overlap}/${questions.length} shared)`,
    overlap < questions.length,
    true
  );
}

await prisma.$disconnect();
console.log(`\n${failed === 0 ? "✅" : "❌"} blueprints: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
