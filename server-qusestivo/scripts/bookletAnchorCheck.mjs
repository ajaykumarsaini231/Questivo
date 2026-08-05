#!/usr/bin/env node
// Report, per paper, what the anchor readers actually found.
//
// The converter refuses any paper whose questions do not run 1..N contiguously,
// so this is the report that decides which years are convertible at all — run
// it before trusting a single crop.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ocrBooklet } from "./lib/bookletOcr.mjs";
import { segmentBooklet } from "./lib/bookletStructure.mjs";
import { findQuestionAnchors, sequenceAnchors, findSolutionAnchors } from "./lib/bookletAnchors.mjs";

const DIR = process.argv[2] || "C:/Users/LSE/Downloads/ch/gate-mt-1990-2014";
const CACHE = path.join("data", "pyq", ".booklet-ocr");

/** Longest run 1,2,3,… present in a set of numbers. */
const runFrom1 = (nums) => {
  const s = new Set(nums);
  let n = 0;
  while (s.has(n + 1)) n++;
  return n;
};

const gaps = (nums, upto) => {
  const s = new Set(nums);
  const out = [];
  for (let i = 1; i <= upto; i++) if (!s.has(i)) out.push(i);
  return out;
};

for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".pdf")).sort()) {
  const { pages } = ocrBooklet(path.join(DIR, f), CACHE);
  for (const s of segmentBooklet(pages)) {
    const paperPages = pages.slice(s.paperFrom, s.paperTo + 1);
    const q = sequenceAnchors(findQuestionAnchors(paperPages), 200);
    const qMax = q.length ? q[q.length - 1].n : 0;

    let solLine = "  solutions —";
    if (s.solutionFrom !== null) {
      const solPages = pages.slice(s.solutionFrom, s.solutionTo + 1);
      const sol = sequenceAnchors(findSolutionAnchors(solPages), 200);
      const keyed = sol.filter((a) => a.answer).length;
      solLine =
        `  solutions ${String(sol.length).padStart(3)} found, ` +
        `run 1..${String(runFrom1(sol.map((a) => a.n))).padStart(3)}, ${keyed} keyed`;
    }

    const missing = gaps(q.map((a) => a.n), qMax);
    console.log(
      `${s.year}  questions ${String(q.length).padStart(3)} found, ` +
        `highest ${String(qMax).padStart(3)}, run 1..${String(runFrom1(q.map((a) => a.n))).padStart(3)}` +
        (missing.length ? ` (missing ${missing.slice(0, 10).join(",")}${missing.length > 10 ? "…" : ""})` : "") +
        solLine
    );
  }
}
