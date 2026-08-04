#!/usr/bin/env node
// Convert a third-party question dataset (Kaggle CSV/JSON, an export, a
// spreadsheet) into the import format that scripts/importPyq.mjs expects.
//
// Public question datasets all invent their own column names — question /
// question_text / problem / Question, answer / correct_option / label / key,
// chapter / topic / category. Rather than hand-editing each one, this detects
// the columns, SHOWS YOU the mapping it inferred plus a sample row, and only
// writes once you are satisfied.
//
// No Python and no dependencies: plain Node, so it runs wherever the server does.
//
// Usage:
//   node scripts/convertDataset.mjs --file data/raw/questions.csv
//        → prints the detected mapping and 3 sample rows, writes nothing
//
//   node scripts/convertDataset.mjs --file data/raw/questions.csv \
//        --exam JEE_MAIN --year 2024 --write data/pyq/jee-2024.json
//
// Override a mis-detected column with --map:
//   --map question=Problem_Statement --map correct=Ans --map topic=chapter_name
//
// Then validate and import:
//   node scripts/importPyq.mjs --file data/pyq/jee-2024.json --dry-run
//
// Supported inputs: .csv  .tsv  .json (array or {questions:[]})  .jsonl
// A .zip must be extracted first — Windows does this from the right-click menu.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { tagTopic } from "../src/lib/topicTagger.js";

/* ------------------------------ CLI args -------------------------------- */

function parseArgs(argv) {
  const out = { _: [], map: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    const value = !next || next.startsWith("--") ? true : (i++, next);
    if (key === "map" && typeof value === "string") {
      const eq = value.indexOf("=");
      if (eq > 0) out.map[value.slice(0, eq).trim()] = value.slice(eq + 1).trim();
    } else out[key] = value;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.file) {
  console.log(`
Convert a third-party question dataset into Questivo's import format.

  --file <path>        .csv | .tsv | .json | .jsonl  (extract .zip first)
  --exam <code>        JEE_MAIN | NEET | GATE_MT
  --year <yyyy>        fallback when the data has no year column
  --source <text>      provenance: dataset URL and licence. Recorded per row.
  --map k=column       force a column, e.g. --map correct=Ans
  --limit <n>          convert only the first n rows (useful for a trial run)
  --write <path>       write the result; omit to preview only

Detectable fields: question, optionA..optionD, options, correct, subject,
topic, year, session, type, solution
`);
  process.exit(args.help ? 0 : 1);
}

/* ------------------------------- parsing -------------------------------- */

/** RFC 4180 CSV: quoted fields, embedded commas, newlines and "" escapes. */
function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function loadRows(file) {
  // Strip a UTF-8 BOM: Excel writes one and it corrupts the first header name.
  const raw = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  const ext = path.extname(file).toLowerCase();

  if (ext === ".json") {
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : parsed.questions || parsed.data;
    if (!Array.isArray(rows)) throw new Error('JSON must be an array, or have a "questions" array');
    return rows;
  }

  if (ext === ".jsonl" || ext === ".ndjson") {
    return raw
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l, i) => {
        try {
          return JSON.parse(l);
        } catch {
          throw new Error(`line ${i + 1} is not valid JSON`);
        }
      });
  }

  const grid = parseDelimited(raw, ext === ".tsv" ? "\t" : ",");
  if (grid.length < 2) throw new Error("file has no data rows");
  const header = grid[0].map((h) => h.trim());
  return grid.slice(1).map((cells) => {
    const o = {};
    header.forEach((h, i) => (o[h] = cells[i] ?? ""));
    return o;
  });
}

/* --------------------------- column detection --------------------------- */

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

/** Ordered: earlier aliases win, so "questiontext" beats a bare "text". */
const ALIASES = {
  question: ["questiontext", "question", "questions", "problemstatement", "problem", "ques", "qtext", "body", "text", "stem"],
  optionA: ["optiona", "opta", "option1", "opt1", "choicea", "choice1", "a"],
  optionB: ["optionb", "optb", "option2", "opt2", "choiceb", "choice2", "b"],
  optionC: ["optionc", "optc", "option3", "opt3", "choicec", "choice3", "c"],
  optionD: ["optiond", "optd", "option4", "opt4", "choiced", "choice4", "d"],
  options: ["options", "choices", "alternatives"],
  // "correctoptions" (plural, an array of indices) is checked before the
  // singular forms: datasets that have both use the array as the real key and
  // leave "answer" as display text, which is not always the same thing.
  correctIndices: ["correctoptions", "correctindices", "answerindices", "correctidx"],
  correct: ["correctoption", "correctanswer", "correctans", "correct", "answerkey", "answer", "ans", "key", "label", "target", "solutionoption"],
  subject: ["subject", "subjectname", "sub", "stream", "paper"],
  topic: ["topic", "chapter", "chaptername", "chapters", "category", "concept", "unit", "tag", "topicname"],
  year: ["year", "examyear", "paperyear", "yr"],
  session: ["session", "shift", "slot", "sitting", "attempt"],
  type: ["questiontype", "qtype", "type"],
  solution: ["solution", "explanation", "detailedsolution", "reason", "answerdescription", "sol"],
};

function detectColumns(sample, overrides) {
  const headers = Object.keys(sample);
  const byNorm = new Map(headers.map((h) => [norm(h), h]));
  const mapping = {};
  const taken = new Set();

  for (const [field, aliases] of Object.entries(ALIASES)) {
    if (overrides[field]) {
      mapping[field] = overrides[field];
      taken.add(overrides[field]);
      continue;
    }
    for (const alias of aliases) {
      const hit = byNorm.get(alias);
      // A single-letter header like "A" is only an option column if it has not
      // already been claimed by something more specific.
      if (hit && !taken.has(hit)) {
        mapping[field] = hit;
        taken.add(hit);
        break;
      }
    }
  }
  return mapping;
}

/* --------------------------- answer normalising ------------------------- */

const LETTERS = ["A", "B", "C", "D"];
const VALID_TYPES = new Set(["mcq_single", "mcq_multiple", "numerical", "integer"]);

/**
 * Datasets encode the answer key three different ways and never say which:
 * a letter ("B"), an index (0-3 or 1-4), or the full text of the right option.
 * Guessing per row is unreliable, so the scheme is decided once from the whole
 * column and then applied uniformly.
 */
function detectAnswerScheme(rawAnswers) {
  const values = rawAnswers.filter((v) => v !== undefined && v !== null && String(v).trim() !== "");
  if (!values.length) return "none";

  const allLetters = values.every((v) => /^[a-d]$/i.test(String(v).trim()));
  if (allLetters) return "letter";

  const nums = values.map((v) => Number(String(v).trim()));
  if (nums.every((n) => Number.isInteger(n))) {
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    if (min >= 0 && max <= 3) return "index0";
    if (min >= 1 && max <= 4) return "index1";
    return "numeric"; // NAT-style answers
  }

  // Anything else is probably the option text itself; resolved per row.
  return "text";
}

function resolveAnswer(raw, scheme, options) {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  switch (scheme) {
    case "letter":
      return s.toUpperCase();
    case "index0":
      return LETTERS[Number(s)] ?? null;
    case "index1":
      return LETTERS[Number(s) - 1] ?? null;
    case "numeric":
      return s;
    case "text": {
      const target = norm(s);
      const i = options.findIndex((o) => o && norm(o) === target);
      if (i >= 0) return LETTERS[i];
      // A bare letter can still show up in a mostly-text column.
      if (/^[a-d]$/i.test(s)) return s.toUpperCase();
      // No options and a plain number: this is a numerical-answer question,
      // not a broken MCQ. JEE Main's Section B is entirely these, so dropping
      // them would lose a quarter of the paper.
      if (!options.some(Boolean) && /^-?\d+(?:\.\d+)?$/.test(s)) return s;
      return null;
    }
    default:
      return null;
  }
}

/** Some datasets pack the four choices into one cell as a list or JSON array. */
function splitOptions(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s.replace(/'/g, '"'));
      if (Array.isArray(arr)) return arr.map((x) => String(x).trim());
    } catch {
      /* fall through to delimiter splitting */
    }
  }
  // "(a) foo (b) bar" or "A. foo B. bar" or newline/pipe separated.
  const labelled = s.split(/\s*(?:\(|\b)[a-dA-D][).]\s+/).filter((p) => p.trim());
  if (labelled.length === 4) return labelled.map((p) => p.trim());
  const parts = s.split(/\s*[|\n;]\s*/).filter((p) => p.trim());
  return parts.length >= 2 ? parts.map((p) => p.trim()) : [];
}

/* --------------------------------- run ---------------------------------- */

let rows;
try {
  rows = loadRows(args.file);
} catch (err) {
  console.error(`✖ ${path.basename(args.file)}: ${err.message}`);
  process.exit(1);
}

if (!rows.length) {
  console.error("✖ no rows found");
  process.exit(1);
}

const limit = Number(args.limit) || rows.length;
const working = rows.slice(0, limit);
const cols = detectColumns(working[0], args.map);

console.log(`\n${path.basename(args.file)}: ${rows.length} row(s)`);
console.log(`Columns present: ${Object.keys(working[0]).join(", ")}\n`);
console.log("Detected mapping (override with --map field=column):");
for (const field of Object.keys(ALIASES)) {
  const hit = cols[field];
  console.log(`  ${field.padEnd(9)} → ${hit ? hit : "(not found)"}`);
}

if (!cols.question) {
  console.error(
    "\n✖ No question column found. Pass one explicitly:\n" +
      "    --map question=<column name>\n"
  );
  process.exit(1);
}

// Decide the answer encoding from the whole column before converting any row.
const rawAnswers = cols.correct ? working.map((r) => r[cols.correct]) : [];
const scheme = detectAnswerScheme(rawAnswers);
console.log(`\nAnswer key encoding: ${scheme}${scheme === "none" ? "  ← no answers in this file" : ""}`);

const out = [];
const skipped = { noQuestion: 0, noAnswer: 0, noOptions: 0 };
// Keyword topic tagging, for datasets that ship without a topic column.
const examForTagging = args["tag-topics"] && args["tag-topics"] !== true
  ? String(args["tag-topics"])
  : args.exam && args.exam !== true
    ? String(args.exam)
    : null;
let tagged = 0;
let untagged = 0;
let repaired = 0;
let blankDistractor = 0;

for (const r of working) {
  const questionText = String(r[cols.question] ?? "").trim();
  if (questionText.length < 10) {
    skipped.noQuestion++;
    continue;
  }

  let options = [
    cols.optionA ? r[cols.optionA] : undefined,
    cols.optionB ? r[cols.optionB] : undefined,
    cols.optionC ? r[cols.optionC] : undefined,
    cols.optionD ? r[cols.optionD] : undefined,
  ].map((v) => (v == null ? "" : String(v).trim()));

  if (!options.some(Boolean) && cols.options) {
    const raw = r[cols.options];
    // Already an array when the source was JSON rather than a flat CSV cell.
    options = Array.isArray(raw) ? raw.map((x) => String(x).trim()) : splitOptions(raw);
  }

  // An explicit index array wins over any text answer column.
  let correctAnswer = null;
  if (cols.correctIndices) {
    const idx = r[cols.correctIndices];
    const list = Array.isArray(idx) ? idx : String(idx ?? "").match(/\d+/g) || [];
    const letters = list.map((n) => LETTERS[Number(n)]).filter(Boolean);
    if (letters.length) correctAnswer = [...new Set(letters)].sort().join(",");
  }
  if (!correctAnswer && cols.correct) {
    correctAnswer = resolveAnswer(r[cols.correct], scheme, options);
  }
  if (!correctAnswer) {
    skipped.noAnswer++;
    continue;
  }

  const numeric = /^-?\d+(\.\d+)?$/.test(correctAnswer);

  // ---- Repair a blanked-out correct option -------------------------------
  // Several datasets blank the correct choice in `options` and keep its value
  // only in a separate `answer` column, e.g.
  //     options: ["", "13", "15", "9"]   answer: "11"   correct_options: [0]
  // Slot A is empty and 11 is the answer that belongs there. Dropping these
  // would silently bias the derived pattern, because the rows lost are not a
  // random sample — they cluster in whichever chapters the exporter mangled.
  // This is also the cause of the answer/options mismatches counted earlier.
  if (!numeric && cols.correct) {
    const answerText = String(r[cols.correct] ?? "").trim();
    for (const L of correctAnswer.split(",")) {
      const slot = LETTERS.indexOf(L);
      if (slot >= 0 && !options[slot] && answerText) {
        options[slot] = answerText;
        repaired++;
      }
    }
  }

  // Keep anything still answerable: the correct option must be present, and
  // there must be at least two choices to pick between. A question with one
  // blank distractor is degraded but perfectly practisable — the earlier rule
  // demanded options A and B specifically and threw those away.
  if (!numeric) {
    const correctPresent = correctAnswer
      .split(",")
      .every((L) => options[LETTERS.indexOf(L)]);
    if (!correctPresent || options.filter(Boolean).length < 2) {
      skipped.noOptions++;
      continue;
    }
    if (options.filter(Boolean).length < 4) blankDistractor++;
  }

  const yearRaw = cols.year ? Number(String(r[cols.year]).match(/(?:19|20)\d{2}/)?.[0]) : NaN;

  // --subject fills a constant when the file has no subject column, which is
  // normal for single-subject datasets.
  const subject =
    (cols.subject ? String(r[cols.subject] ?? "").trim() : "") ||
    (args.subject && args.subject !== true ? String(args.subject) : "") ||
    undefined;

  let topic = cols.topic ? String(r[cols.topic] ?? "").trim() || undefined : undefined;
  if (!topic && args["tag-topics"] && examForTagging && subject) {
    // Options carry strong signals too ("Argand", vector hats), so classify on
    // the whole item rather than the stem alone.
    const hit = tagTopic([questionText, ...options].join(" "), examForTagging, subject);
    if (hit) {
      topic = hit.topic;
      tagged++;
    } else untagged++;
  }

  out.push({
    subject,
    topic,
    questionText,
    ...(numeric
      ? { questionType: "numerical" }
      : {
          optionA: options[0] || undefined,
          optionB: options[1] || undefined,
          optionC: options[2] || undefined,
          optionD: options[3] || undefined,
          // Only trust a type column when it actually names a type we support.
          // Datasets routinely encode it as an opaque integer (0/1/2), which
          // would otherwise be written through as a bogus questionType.
          questionType:
            correctAnswer.includes(",")
              ? "mcq_multiple"
              : VALID_TYPES.has(String(r[cols.type] ?? "").trim())
                ? String(r[cols.type]).trim()
                : "mcq_single",
        }),
    correctAnswer,
    solution: cols.solution ? String(r[cols.solution] ?? "").trim() || undefined : undefined,
    session: cols.session ? String(r[cols.session] ?? "").trim() || undefined : undefined,
    year: Number.isFinite(yearRaw) ? yearRaw : args.year ? Number(args.year) : undefined,
    sourceNote: args.source && args.source !== true ? String(args.source) : undefined,
  });
}

console.log(
  `\nConverted ${out.length} of ${working.length}` +
    ` (skipped: ${skipped.noQuestion} no question, ${skipped.noAnswer} no usable answer, ${skipped.noOptions} unanswerable)`
);
if (repaired) {
  console.log(
    `Repaired ${repaired} blanked-out correct option(s) from the answer column.`
  );
}
if (blankDistractor) {
  console.log(
    `${blankDistractor} question(s) kept with a blank distractor — the correct option is present, so they are still practisable.`
  );
}

console.log("\n─── sample ───");
for (const q of out.slice(0, 3)) {
  console.log(JSON.stringify(q, null, 2).split("\n").slice(0, 14).join("\n"));
  console.log("  …");
}

// Subject and topic drive the pattern derivation, so their coverage is the
// number that decides whether this dataset is actually worth importing.
const withTopic = out.filter((q) => q.topic).length;
const withSubject = out.filter((q) => q.subject).length;
console.log(
  `\nCoverage: ${withSubject}/${out.length} have a subject, ${withTopic}/${out.length} have a topic.`
);

if (tagged || untagged) {
  console.log(`Keyword topic tagging: ${tagged} classified, ${untagged} left blank (below confidence).`);
  const dist = {};
  for (const q of out) if (q.topic) dist[q.topic] = (dist[q.topic] || 0) + 1;
  console.log("\nTopic distribution — this is what the AI paper pattern is built from:");
  for (const [t, n] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
    const pct = Math.round((n / out.length) * 100);
    console.log(`  ${String(n).padStart(4)}  ${String(pct).padStart(3)}%  ${t}`);
  }
}
if (withTopic < out.length * 0.5) {
  console.warn(
    "⚠ Under half the rows carry a topic. Topics are what the AI paper pattern is\n" +
      "  derived from — without them these questions display but teach the generator nothing."
  );
}

if (!args.write || args.write === true) {
  console.log("\n(preview only — pass --write <path> to save)\n");
  process.exit(0);
}

fs.mkdirSync(path.dirname(args.write), { recursive: true });
fs.writeFileSync(args.write, JSON.stringify({ questions: out }, null, 2));
console.log(`\n✔ wrote ${out.length} question(s) to ${args.write}`);
console.log(`\nNext:\n  node scripts/importPyq.mjs --file ${args.write} --exam ${args.exam && args.exam !== true ? args.exam : "<JEE_MAIN|NEET|GATE_MT>"} --dry-run\n`);
