/**
 * End-to-end generation smoke test. Makes REAL API calls.
 *
 * Run: node src/test/generateE2E.test.mjs [EXAM_CODE]
 *
 * Exercises the whole path: exam pattern -> prompt -> failover client ->
 * parser -> SVG sanitizer -> answer-key verification.
 */
import dotenv from "dotenv";
dotenv.config();

import { generateQuestionsAgent } from "../agentic-mock-test/questionGenerator.js";
import { credentialReport } from "../lib/aiClient.js";

const examType = process.argv[2] || "NTA_JEE_MAIN_2025";

console.log(`\n=== Generating for ${examType} ===\n`);
const t0 = Date.now();

const questions = await generateQuestionsAgent({
  examType,
  topics: ["Kinematics", "Rotational Motion", "Definite Integrals"],
  numQuestions: 5,
  difficulty: "Hard",
  medium: "English",
});

const secs = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`\n--- RESULT (${secs}s) ---`);
console.log(`questions returned : ${questions.length}`);
console.log(`key-verified       : ${questions.filter((q) => q.key_verified).length}`);
console.log(`with diagram       : ${questions.filter((q) => q.diagram_svg).length}`);
console.log(`marking scheme     : ${questions.markingScheme ? questions.markingScheme.exam + " / " + questions.markingScheme.totalMarks + " marks" : "none"}`);

// Structural sanity on every question returned.
let bad = 0;
for (const q of questions) {
  const problems = [];
  if (!q.question_text) problems.push("no text");
  if (!q.option_a || !q.option_b || !q.option_c || !q.option_d) problems.push("missing options");
  if (!/^[A-D]$/.test(q.correct_option)) problems.push("bad key");
  if (q.diagram_svg && !/^<svg[\s>]/i.test(q.diagram_svg)) problems.push("malformed svg");
  if (q.diagram_svg && /<script|onload=|onerror=/i.test(q.diagram_svg)) problems.push("UNSAFE SVG");
  // Nested \( \) breaks KaTeX at render time.
  let depth = 0, nested = 0;
  const BS = String.fromCharCode(92);
  for (const m of q.question_text.matchAll(new RegExp(BS + BS + "\\(|" + BS + BS + "\\)", "g"))) {
    if (m[0].endsWith("(")) { depth++; if (depth > 1) nested++; } else depth = Math.max(0, depth - 1);
  }
  if (nested) problems.push(`${nested} nested LaTeX delimiters`);
  if (problems.length) { bad++; console.log(`  ISSUE: ${problems.join(", ")} :: ${q.question_text.slice(0, 60)}`); }
}
console.log(`structural issues  : ${bad}`);

console.log("\n--- SAMPLE ---");
const sample = questions[0];
if (sample) {
  console.log(sample.question_text.slice(0, 300));
  console.log(`A) ${sample.option_a}`);
  console.log(`B) ${sample.option_b}`);
  console.log(`C) ${sample.option_c}`);
  console.log(`D) ${sample.option_d}`);
  console.log(`Correct: ${sample.correct_option}  verified=${!!sample.key_verified}`);
  if (sample.diagram_svg) console.log(`Diagram: ${sample.diagram_svg.slice(0, 160)}...`);
}

console.log("\n--- CREDENTIAL POOL AFTER RUN ---");
for (const c of credentialReport()) {
  console.log(`  ${c.id.padEnd(10)} ${c.state.padEnd(13)} ok=${c.successes} fail=${c.failures}${c.reason ? " (" + c.reason + ")" : ""}`);
}

process.exit(questions.length > 0 && bad === 0 ? 0 : 1);
