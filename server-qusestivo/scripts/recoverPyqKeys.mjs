#!/usr/bin/env node
// Recover the answer keys that the converter refused to guess.
//
// WHAT IS MISSING AND WHY
//
// The MathonGo papers interleave the exam's numerical questions among its
// multiple-choice ones while printing the answer key in the exam's own order,
// so a numerical question's printed position points at an option number rather
// than its answer. scripts/lib/sectionKeys.mjs matches them up wherever a
// subject's shape can be reproduced; where it cannot, the key is dropped and
// the row flagged `needs_review` — a missing key is recoverable, a wrong one
// teaches the mistake.
//
// 83 of the 84 dropped keys are on shifts that were only ever published as a
// question paper, so there is no solution booklet to read the answer from.
//
// WHAT MAKES THIS SAFE
//
// The answer is not unknown — it is unidentified. Every one of these questions
// is numerical, and the ten numerical answers for its subject ARE printed, at
// key slots 21-30. So the model is never asked "what is the answer"; it is
// asked to solve the question, and its result is then MATCHED against that
// printed set. A derivation that lands on none of the ten is discarded, and one
// that lands on a value already taken by a question we identified confidently
// is discarded too.
//
// That is the difference between a recovered key and an invented one: this
// cannot produce an answer the board did not print.
//
// Usage:
//   node scripts/recoverPyqKeys.mjs --dir "<folder of PDFs>" --dry-run
//   node scripts/recoverPyqKeys.mjs --dir "<folder of PDFs>"
//   node scripts/recoverPyqKeys.mjs --dir <folder> --limit 20

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import prisma from "../src/prismaClient.js";
import { chat, ROLES } from "../src/lib/aiClient.js";
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
const DRY = Boolean(args["dry-run"]);
const LIMIT = Number(args.limit) || 0;

if (args.help || !args.dir || args.dir === true) {
  console.log(`
Recover answer keys flagged needs_review, constrained to the printed key set.

  --dir <path>   folder holding the source PDFs (for the printed keys)
  --limit <n>    stop after n questions
  --dry-run      show the candidate set per question, call no model
`);
  process.exit(args.help ? 0 : 1);
}

/** Which key slots hold a subject's ten numerical answers. */
const SUBJECT_BASE = { Physics: 0, Chemistry: 30, Mathematics: 60 };

const numeric = (v) => {
  const m = String(v ?? "").match(/-?\d+(?:\.\d+)?/);
  return m ? m[0] : null;
};

/** The ten printed numerical answers for one subject of one paper. */
async function candidatesFor(dir, sourceFile, subject) {
  const { key } = parseMathonGoPaper(await extractLines(fs.readFileSync(path.join(dir, sourceFile))));
  const base = SUBJECT_BASE[subject];
  if (base === undefined) return [];
  const out = [];
  for (let i = 21; i <= 30; i++) {
    const v = numeric(key.get(base + i));
    if (v !== null) out.push(v);
  }
  return out;
}

const SYSTEM =
  "You are solving a numerical-answer question from an Indian engineering entrance exam. " +
  "Work it out step by step, then state the final numerical value on its own last line as " +
  "'ANSWER: <number>'. Give only the number on that line, no units and no words. " +
  "If you cannot solve it, make the last line exactly 'ANSWER: unknown'.";

async function solve(q) {
  const completion = await chat(ROLES.VERIFICATION, {
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: q.questionText },
    ],
    temperature: 0.1,
    max_tokens: 900,
  });
  const text = completion.choices?.[0]?.message?.content ?? "";
  const m = text.match(/ANSWER:\s*(-?\d+(?:\.\d+)?)/i);
  return { value: m ? m[1] : null, working: text.trim() };
}

/** Two printed answers are the same if they agree numerically. */
const same = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

async function main() {
  const rows = await prisma.previousYearQuestion.findMany({
    where: { status: "needs_review", correctAnswer: null },
    orderBy: [{ paperId: "asc" }, { paperQuestionNumber: "asc" }],
    take: LIMIT || undefined,
    select: {
      id: true, paperId: true, subject: true, paperQuestionNumber: true, questionNumber: true,
      questionText: true, sourceUrl: true, needsFigure: true,
    },
  });
  console.log(`${rows.length} question(s) flagged needs_review.\n`);

  // Answers already claimed by questions we identified confidently — the same
  // printed value cannot belong to two different questions.
  const takenByPaper = new Map();
  for (const paperId of new Set(rows.map((r) => r.paperId))) {
    const resolved = await prisma.previousYearQuestion.findMany({
      where: { paperId, section: "B", correctAnswer: { not: null } },
      select: { subject: true, correctAnswer: true },
    });
    takenByPaper.set(paperId, resolved);
  }

  let recovered = 0;
  let ambiguous = 0;
  let failed = 0;

  for (const r of rows) {
    const all = await candidatesFor(args.dir, r.sourceUrl, r.subject);
    const taken = (takenByPaper.get(r.paperId) || [])
      .filter((x) => x.subject === r.subject)
      .map((x) => numeric(x.correctAnswer))
      .filter(Boolean);
    const free = all.filter((c) => !taken.some((t) => same(t, c)));

    const where = `${r.paperId?.replace(/^jee-main-\d{4}-/, "")} ${r.subject} Q${r.paperQuestionNumber}`;

    if (!free.length) {
      console.log(`  ✖ ${where}: no unclaimed printed answer left`);
      failed++;
      continue;
    }

    if (DRY) {
      console.log(`  · ${where}\n      candidates: ${free.join(", ")}`);
      continue;
    }

    // A question served as an image has no readable text to solve from.
    if (r.needsFigure && r.questionText.startsWith("[Shown as an image]")) {
      console.log(`  – ${where}: served as an image, nothing to solve from`);
      failed++;
      continue;
    }

    let got;
    try {
      got = await solve(r);
    } catch (err) {
      console.log(`  ✖ ${where}: ${err.message}`);
      failed++;
      continue;
    }

    const hit = got.value === null ? null : free.find((c) => same(c, got.value));
    if (!hit) {
      console.log(`  ? ${where}: derived ${got.value ?? "nothing"}, not among ${free.join(", ")} — left flagged`);
      ambiguous++;
      continue;
    }

    await prisma.previousYearQuestion.update({
      where: { id: r.id },
      data: {
        correctAnswer: hit,
        status: "ok",
        solution: got.working,
        solutionModel: "key-recovery",
        solutionQuality: "prose",
        answerNote:
          "The printed answer key for this paper could not be matched to this question by " +
          "position, because the paper interleaves its numerical questions while the key keeps " +
          "the exam's order. The answer shown was derived and then matched against the ten " +
          `numerical answers the board printed for this subject (${all.join(", ")}); it is one of ` +
          "them, not a free guess.",
      },
    });
    console.log(`  ✔ ${where}: ${hit}`);
    recovered++;
  }

  if (!DRY) {
    console.log(`\n✔ recovered ${recovered}, left flagged ${ambiguous}, failed ${failed}.`);
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
