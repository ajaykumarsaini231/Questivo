#!/usr/bin/env node
// Fill in worked solutions for previous year questions that have none.
//
// WHY THIS IS NEEDED AT ALL
//
// The solutions in the archive come from the coaching booklets the operator
// supplied, and those only exist for some sittings — for JEE Main 2022 there
// are ALLEN booklets for the June session and nothing at all for July. So a
// candidate reviewing a July paper sees the right answer and no reasoning,
// which is the half that actually teaches.
//
// src/controllers/pyqController.js already generates a solution the first time
// anyone opens a question and caches it on the row, so this script is not a new
// mechanism — it is the same one, run ahead of time so the first candidate is
// not the one who waits.
//
// A generated solution is marked `solutionModel` so it is always
// distinguishable from a publisher's: the booklet ones are authoritative, these
// are a model's working and can be wrong.
//
// Usage:
//   node scripts/generatePyqSolutions.mjs --exam JEE_MAIN --year 2022 --dry-run
//   node scripts/generatePyqSolutions.mjs --exam JEE_MAIN --year 2022 --limit 50
//   node scripts/generatePyqSolutions.mjs --exam JEE_MAIN --year 2022   # all
//
//   --symbolic   also replace booklet solutions that extracted as loose
//                operators rather than prose (solutionQuality = "symbolic")
//
// Resumable: it only ever selects rows that still need one, so re-running after
// an interruption picks up where it stopped.

import process from "node:process";
import prisma from "../src/prismaClient.js";
import { chat, ROLES } from "../src/lib/aiClient.js";

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
const INCLUDE_SYMBOLIC = Boolean(args.symbolic);
const LIMIT = Number(args.limit) || 0;
/** Kept low on purpose — the provider pool is shared with live traffic. */
const CONCURRENCY = Math.max(1, Math.min(Number(args.concurrency) || 3, 8));

if (args.help) {
  console.log(`
Generate missing worked solutions.

  --exam <code>    JEE_MAIN | NEET | GATE_ME   (default: all)
  --year <yyyy>    restrict to one year
  --limit <n>      stop after n questions
  --symbolic       also redo booklet solutions that extracted as symbols
  --concurrency n  parallel requests (default 3, max 8)
  --dry-run        report what would be generated, call nothing
`);
  process.exit(0);
}

const SYSTEM =
  "You explain exam questions to a candidate. Give a concise step-by-step derivation ending at " +
  "the stated official answer. Wrap all mathematics in \\( ... \\), never nesting delimiters. " +
  "If the official answer looks wrong, say so explicitly rather than contriving a derivation for it.";

/** Build the prompt from the row, exactly as the on-demand endpoint does. */
function promptFor(q) {
  const options = [q.optionA, q.optionB, q.optionC, q.optionD].filter(Boolean);
  return (
    `${q.questionText}\n` +
    (options.length ? options.map((o, i) => `${"ABCD"[i]}) ${o}`).join("\n") + "\n" : "") +
    `Official answer: ${q.correctAnswer}`
  );
}

async function generate(q) {
  const completion = await chat(ROLES.VERIFICATION, {
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: promptFor(q) },
    ],
    temperature: 0.2,
    max_tokens: 900,
  });
  return completion.choices?.[0]?.message?.content?.trim() || null;
}

async function main() {
  const where = {
    // A question with no key cannot have a derivation written to it, and a
    // figure-only one has no readable stem to reason from. Both would produce
    // confident nonsense.
    correctAnswer: { not: null },
    needsFigure: false,
    status: "ok",
    ...(args.exam && args.exam !== true ? { examCode: String(args.exam) } : {}),
    ...(args.year && args.year !== true ? { year: Number(args.year) } : {}),
    ...(INCLUDE_SYMBOLIC
      ? { OR: [{ solution: null }, { solutionQuality: "symbolic" }] }
      : { solution: null }),
  };

  const total = await prisma.previousYearQuestion.count({ where });
  const rows = await prisma.previousYearQuestion.findMany({
    where,
    orderBy: [{ year: "desc" }, { paperId: "asc" }, { paperQuestionNumber: "asc" }],
    take: LIMIT || undefined,
    select: {
      id: true, questionText: true, optionA: true, optionB: true, optionC: true, optionD: true,
      correctAnswer: true, subject: true, paperId: true, paperQuestionNumber: true,
    },
  });

  console.log(
    `${total} question(s) need a solution` +
      (INCLUDE_SYMBOLIC ? " (including symbolic ones)" : "") +
      `; this run will attempt ${rows.length}.`
  );

  if (DRY || !rows.length) {
    if (DRY) console.log("(dry run — nothing was generated)");
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  let failed = 0;
  const started = Date.now();

  // A simple worker pool. Promise.all over 900 rows would open 900 sockets and
  // exhaust the provider's rate limit within seconds.
  const queue = [...rows];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const q = queue.shift();
        try {
          const solution = await generate(q);
          if (!solution) throw new Error("empty response");
          await prisma.previousYearQuestion.update({
            where: { id: q.id },
            data: { solution, solutionModel: "verification-chain", solutionQuality: "prose" },
          });
          done++;
        } catch (err) {
          failed++;
          console.error(`  ✖ ${q.paperId} Q${q.paperQuestionNumber}: ${err.message}`);
        }

        if ((done + failed) % 25 === 0) {
          const rate = (done + failed) / ((Date.now() - started) / 1000);
          const left = Math.round((rows.length - done - failed) / Math.max(rate, 0.01));
          console.log(
            `  ${done + failed}/${rows.length} — ${done} written, ${failed} failed, ~${left}s left`
          );
        }
      }
    })
  );

  console.log(`\n✔ ${done} solution(s) written${failed ? `, ${failed} failed` : ""}.`);
  const remaining = await prisma.previousYearQuestion.count({ where });
  console.log(`${remaining} still without one.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
