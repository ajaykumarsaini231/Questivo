import fs from "node:fs";
import { extractFigures } from "./lib/figures.mjs";
const D="C:/Users/LSE/Downloads/ch/jee questions/";
const out="/tmp/figtest";
fs.rmSync(out,{recursive:true,force:true});

// MathonGo: an MCQ (Q1) and a numerical (Q4) from 30-Jan-2023 Shift 2.
const r1 = extractFigures({
  pdfPath: D+"JEEMain_2023_Session1_30-Jan_Shift2_AllSubjects_QuestionPaper.pdf",
  outDir: out, mode: "mathongo",
  wanted: [
    { printedNumber: 1, baseName: "MG_Q01", wantOptions: true },
    { printedNumber: 4, baseName: "MG_Q04", wantOptions: false },
    { printedNumber: 3, baseName: "MG_Q03", wantOptions: true },
  ],
});
console.log("MATHONGO written:", r1.written, "missing:", r1.missing);
for (const [n,p] of r1.parts) console.log("  Q"+n, JSON.stringify(p));

// ALLEN: a question with options AND a worked solution.
const r2 = extractFigures({
  pdfPath: D+"JEEMain_2022_Session1_24-Jun_Shift1_Physics_Solution.pdf",
  outDir: out, mode: "allen",
  wanted: [{ printedNumber: 1, baseName: "AL_Q01", wantOptions: true, wantSolution: true }],
});
console.log("\nALLEN written:", r2.written, "missing:", r2.missing);
for (const [n,p] of r2.parts) console.log("  Q"+n, JSON.stringify(p));

console.log("\nfiles:", fs.readdirSync(out).sort().join("  "));
for (const f of fs.readdirSync(out).sort()) console.log("   ", f, fs.statSync(out+"/"+f).size, "bytes");
