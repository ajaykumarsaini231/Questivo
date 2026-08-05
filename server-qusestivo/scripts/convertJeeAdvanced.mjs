#!/usr/bin/env node
// Convert the JEE Bench archive into Questivo's PYQ import format.
//
// Source: https://huggingface.co/datasets/daman1209arora/jeebench  (MIT)
// Real JEE Advanced papers, 2016-2023, both papers of each year.
//
// This needs its own script rather than convertDataset.mjs because the shape is
// specific in three ways the generic detector cannot express:
//
//   1. Options are not a column. They live INSIDE the question text as
//      "(A) ... (B) ... (C) ... (D) ...", so they have to be parsed out and the
//      stem trimmed back to where the choices begin.
//   2. Year and paper are encoded in a prose field: "JEE Adv 2016 Paper 1".
//   3. `gold` is a run of letters for multiple-correct answers ("ABD"), a
//      single letter for single-correct, and a bare number for the rest.
//
// Marking is attached per question type, because JEE Advanced marks types
// differently within the same paper — that is the whole point of the exam's
// design and a scorer that assumes one rule per paper gets it wrong.
//
// Topics come from an optional companion file of the same papers tagged by
// chapter (MIT, see --tags), joined on the question text. Topic is what the AI
// pattern is derived from, and this archive has none of its own.
//
// Usage:
//   node scripts/convertJeeAdvanced.mjs --file data/raw/jeebench.json \
//        --tags data/raw/jee-adv-skilltags.csv \
//        --write data/pyq/jee-advanced.json

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    const n = argv[i + 1];
    out[k] = !n || n.startsWith("--") ? true : (i++, n);
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));

if (args.help || !args.file) {
  console.log(`
Convert the JEE Bench archive (MIT) into Questivo's PYQ import format.

  --file  <path>   jeebench test.json
  --tags  <path>   optional chapter-tagged CSV, joined for topics
  --write <path>   output; omit to preview
`);
  process.exit(args.help ? 0 : 1);
}

/* ------------------------------ marking --------------------------------- */

/**
 * JEE Advanced marks each question TYPE differently inside the same paper.
 * Mirrors examPatterns.js JEE_ADVANCED.
 *
 * Treat these as the modern template, not a per-year guarantee: JEE Advanced
 * deliberately changes its scheme between years, so a 2016 paper may not have
 * scored exactly this way. Correctness of the ANSWER KEY is unaffected — only
 * the marks attached to it — and `sourceNote` records the caveat on every row.
 */
const MARKING = {
  MCQ: { questionType: "mcq_single", marksCorrect: 3, marksIncorrect: -1 },
  "MCQ(multiple)": { questionType: "mcq_multiple", marksCorrect: 4, marksIncorrect: -2 },
  Integer: { questionType: "integer", marksCorrect: 4, marksIncorrect: 0 },
  Numeric: { questionType: "numerical", marksCorrect: 4, marksIncorrect: 0 },
};

const SUBJECTS = { phy: "Physics", chem: "Chemistry", math: "Mathematics" };

/* --------------------------- option extraction --------------------------- */

/**
 * Pull "(A) ... (B) ... (C) ... (D) ..." out of the stem.
 *
 * Returns the trimmed stem plus the four options. Anything that does not yield
 * a clean run of A-D is left alone and reported, rather than half-parsed — a
 * mangled option list is worse than an unsplit question.
 */
function splitInlineOptions(text) {
  // Strict first, loose only as a fallback.
  //
  // Line-anchored markers are unambiguous. Allowing a marker anywhere after
  // whitespace recovers questions whose choices run inline inside a paragraph,
  // but it also matches prose like "the reaction of Al2O3 with coke (C) at
  // 2500°C" — a bare (C) sitting before (B), which destroys the ascending run
  // and lost two chemistry questions when the loose form was used alone.
  //
  // Trying strict first keeps those working and still rescues the inline ones.
  return splitWith(text, /(?:^|\n)\s*[([]([A-D])[)\]]\s*/g)
      ?? splitWith(text, /(?:^|[\s\n])[([]([A-D])[)\]]\s*/g);
}

function splitWith(text, re) {
  // Round AND square brackets: the 2017 papers label their choices "[A] [B]"
  // while every other year uses "(A) (B)". Assuming round brackets silently
  // dropped almost the whole of 2017 — 39 of 41 unparsed questions came from
  // that single year, which is exactly the kind of loss that skews a
  // year-over-year pattern without looking like a bug.
  //
  // Markers may also run inline inside a paragraph rather than each starting a
  // line — chemistry statement questions in particular read
  // "...equation, (A) ... (B) ...". Requiring a line start lost those too.
  //
  // Whitespace before the bracket is still required, so a formula such as
  // "f(A)" cannot register, and the ascending-run check below is what actually
  // rejects stray brackets.
  const marks = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    marks.push({ letter: m[1], start: m.index, textStart: re.lastIndex });
  }
  if (marks.length < 2) return null;

  // Use the LAST clean ascending A,B,C,D run: some stems quote an earlier
  // "(A)" in passing, and the real choices are always the final block.
  let run = [];
  for (const mk of marks) {
    const expected = String.fromCharCode(65 + run.length);
    if (mk.letter === expected) run.push(mk);
    else if (mk.letter === "A") run = [mk];
    else run = [];
  }
  if (run.length < 2) return null;

  const options = run.map((mk, i) => {
    const end = i + 1 < run.length ? run[i + 1].start : text.length;
    return text.slice(mk.textStart, end).trim();
  });
  const stem = text.slice(0, run[0].start).trim();
  if (stem.length < 15 || options.some((o) => !o)) return null;
  return { stem, options };
}

/* ------------------------------- topic join ------------------------------ */

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Key on a normalised prefix: the two files differ in whitespace and LaTeX spacing. */
const key = (s) => String(s).replace(/\s+/g, " ").trim().toLowerCase().slice(0, 90);

/**
 * Clean a chapter label from the tag file, or reject it.
 *
 * The tagger emitted a lot of labels that carry no information: the subject
 * name repeated back ("Mathematics" as the topic of a Mathematics question),
 * bare chapter numbers ("Chapter 23"), and class prefixes ("Class 11/12
 * Physics Gravitation"). Feeding those into the frequency table produces a
 * "most repeated topic" of "Mathematics", which tells the generator nothing
 * and crowds out the labels that do mean something.
 *
 * A blank is better than noise, so anything that reduces to nothing is dropped.
 */
function cleanTopic(raw, subject) {
  let t = String(raw || "").trim();
  if (!t) return null;

  // "Chapter 4: Some Basic Concepts" -> "Some Basic Concepts"
  t = t.replace(/^chapter\s*\d+\s*[:\-–]\s*/i, "");
  // "Class 11/12 Physics Gravitation" -> "Gravitation"
  t = t.replace(/^class\s*[\d/\s and]*\b/i, "");
  t = t.replace(new RegExp(`^${subject}\\s+`, "i"), "");
  // A trailing bare "Chapter 13" leaves nothing behind.
  t = t.replace(/\bchapter\s*\d+\s*$/i, "").trim();
  t = t.replace(/^[:\-–]\s*/, "").trim();

  if (t.length < 3) return null;
  if (t.toLowerCase() === String(subject).toLowerCase()) return null;
  // Generic single words that name a discipline, not a chapter.
  if (/^(physics|chemistry|mathematics|maths|science)$/i.test(t)) return null;
  if (/^chapter\s*\d*$/i.test(t)) return null;
  return t;
}

function loadTags(file) {
  const grid = parseCsv(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  const header = grid[0].map((h) => h.trim().toLowerCase());
  const qi = header.indexOf("question");
  const ci = header.indexOf("chapter");
  const ti = header.indexOf("topic");
  const di = header.indexOf("difficulty");
  const map = new Map();
  for (const cells of grid.slice(1)) {
    if (!cells[qi]) continue;
    map.set(key(cells[qi]), {
      chapter: (cells[ci] || "").trim(),
      topic: (cells[ti] || "").trim(),
      difficulty: (cells[di] || "").trim(),
    });
  }
  return map;
}

/* --------------------------------- run ----------------------------------- */

const rows = JSON.parse(fs.readFileSync(args.file, "utf8"));
const tags = args.tags && args.tags !== true ? loadTags(args.tags) : null;
if (tags) console.log(`Loaded ${tags.size} chapter tags for the topic join.\n`);

const out = [];
const stats = { noOptions: 0, noYear: 0, unknownType: 0, tagged: 0, tagRejected: 0, byPaper: {}, byType: {}, byYear: {} };

for (const r of rows) {
  const mark = MARKING[r.type];
  if (!mark) { stats.unknownType++; continue; }

  // "JEE Adv 2016 Paper 1" -> year 2016, paper 1
  const d = String(r.description || "");
  const year = Number(d.match(/(?:19|20)\d{2}/)?.[0]);
  const paper = d.match(/Paper\s*(\d)/i)?.[1];
  if (!Number.isInteger(year)) { stats.noYear++; continue; }

  const optionless = mark.questionType === "integer" || mark.questionType === "numerical";
  let questionText = String(r.question || "").trim();
  let options = [];

  if (!optionless) {
    const split = splitInlineOptions(questionText);
    if (!split) { stats.noOptions++; continue; }
    questionText = split.stem;
    options = split.options;
  }

  // gold: "B" | "ABD" (multiple correct) | "9" | "2.00"
  const gold = String(r.gold ?? "").trim();
  let correctAnswer;
  if (optionless) {
    const num = gold.match(/-?\d+(?:\.\d+)?/);
    if (!num) continue;
    correctAnswer = num[0];
  } else {
    const letters = [...new Set(gold.toUpperCase().match(/[A-D]/g) || [])].sort();
    if (!letters.length) continue;
    // Only letters that actually have an option behind them.
    const present = letters.filter((L) => options[L.charCodeAt(0) - 65]);
    if (!present.length) continue;
    correctAnswer = present.join(",");
  }

  const subject = SUBJECTS[r.subject] || r.subject;
  const t = tags?.get(key(r.question));
  const topic = t ? cleanTopic(t.chapter, subject) || cleanTopic(t.topic, subject) : null;
  if (topic) stats.tagged++;
  else if (t) stats.tagRejected++;

  // Named the way the ALLEN converter names its sittings, because the two
  // write into the same archive and the browse screen groups by this string.
  // "Paper 1" alone put eight different years under a chip reading "Paper 1"
  // and another eight under "Paper 2" — sixteen sittings the operator could
  // not tell apart, beside the ALLEN ones which say which year they are.
  const session = paper ? `JEE Advanced ${year} · Paper ${paper}` : null;
  const sessionLabel = paper ? `Paper ${paper}` : null;
  stats.byPaper[session || "unknown"] = (stats.byPaper[session || "unknown"] || 0) + 1;
  stats.byType[mark.questionType] = (stats.byType[mark.questionType] || 0) + 1;
  stats.byYear[year] = (stats.byYear[year] || 0) + 1;

  out.push({
    subject,
    topic: topic || undefined,
    year,
    session,
    sessionLabel,
    questionText,
    ...(optionless
      ? {}
      : {
          optionA: options[0],
          optionB: options[1],
          optionC: options[2],
          optionD: options[3],
        }),
    correctAnswer,
    questionType: correctAnswer.includes(",") ? "mcq_multiple" : mark.questionType,
    marksCorrect: mark.marksCorrect,
    marksIncorrect: mark.marksIncorrect,
    sourceUrl: "https://huggingface.co/datasets/daman1209arora/jeebench",
    sourceNote:
      "JEE Bench (MIT). Marks follow the modern JEE Advanced scheme per question type; " +
      "the exam varies its scheme between years, so per-year marks may differ.",
  });
}

console.log(`Converted ${out.length} of ${rows.length}`);
console.log(
  `  skipped: ${stats.noOptions} options not parseable, ${stats.noYear} no year, ${stats.unknownType} unknown type`
);
if (tags) console.log(`  topics joined: ${stats.tagged}/${out.length} (${stats.tagRejected} tag(s) rejected as uninformative)`);

const show = (label, obj) =>
  console.log(
    `\n${label}\n` +
      Object.entries(obj)
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
        .map(([k, v]) => `  ${String(k).padEnd(14)} ${v}`)
        .join("\n")
  );
show("By paper:", stats.byPaper);
show("By question type (with marks):", stats.byType);
show("By year:", stats.byYear);

console.log("\nMarking applied:");
for (const [src, m] of Object.entries(MARKING)) {
  console.log(
    `  ${src.padEnd(14)} -> ${m.questionType.padEnd(13)} +${m.marksCorrect} / ${m.marksIncorrect}`
  );
}

if (!args.write || args.write === true) {
  console.log("\n(preview only — pass --write <path> to save)\n");
  process.exit(0);
}
fs.mkdirSync(path.dirname(args.write), { recursive: true });
fs.writeFileSync(args.write, JSON.stringify({ questions: out }, null, 2));
console.log(`\n✔ wrote ${out.length} question(s) to ${args.write}`);
