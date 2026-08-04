#!/usr/bin/env node
// Convert the JEE Main 2023 question paper PDFs into the PYQ import format.
//
// ─────────────────────────────────────────────────────────────────────────
// PROVENANCE — read this before running it
//
// JEE Main papers are the copyright of the NTA, and the two PDF families this
// reads are third-party republications of them:
//
//   * ALLEN Career Institute solution booklets — carry ALLEN's own worked
//     solutions, which are ALLEN's copyright separately from the questions.
//   * MathonGo "JEE Main Previous Year Paper" compilations.
//
// Neither is licensed to Questivo. This script reads only files the operator
// has already obtained and stamps every row with the exact PDF it came from, so
// anything published can be traced and withdrawn. Clearing the rights is the
// operator's job; the script only makes the provenance impossible to lose.
// ─────────────────────────────────────────────────────────────────────────
//
// Usage:
//   node scripts/convertJeeMain2023.mjs --dir "<folder of PDFs>" \
//        --out data/pyq/jee-main-2023.json
//
// WHAT COVERS WHAT
//
//   Session 2 (April)  — ALLEN booklets, one per subject/shift, WITH worked
//                        solutions and both the NTA and ALLEN answer keys.
//   Session 1 (Jan/Feb)— MathonGo compilations, all 90 questions of a shift in
//                        one file, question paper and answer key only.
//
// ALLEN wins wherever it exists; MathonGo fills the rest. Neither is dropped
// for the other, so a shift ALLEN did not cover is still a complete paper.
//
// TEXT IS READ WITH THE LAYOUT, NOT WITHOUT IT
//
// These booklets are set two-up. Read without geometry, a question acquires
// lines from the worked solution printed in the column beside it and arrives as
// half a question — which is exactly the failure this file exists to avoid. So
// everything goes through pdfLayout.extractLines, which orders by baseline
// within a column and keeps superscripts as ^{...}.
//
// NOTHING IS DROPPED. Where the source draws its maths as vector outlines there
// is no text layer to recover: the stem arrives as connecting prose with the
// quantities missing ("Let be real valued function defined as . Then range of
// is") and all four options come out empty. Those rows are still emitted — the
// answer key, section, subject and every facet are correct — and flagged
// `needsFigure` so the renderer shows the scan instead of the broken text.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";

import { extractLines } from "./lib/pdfLayout.mjs";
import { parseAllen2023, parseMathonGo2023 } from "./lib/parse2023.mjs";
import { extractFigures } from "./lib/figures.mjs";
import { wrapMath, splitBlocks } from "./lib/mathMarkup.mjs";
import { assignSectionsAndKeys } from "./lib/sectionKeys.mjs";
import { tagTopic } from "../src/lib/topicTagger.js";

/* ------------------------------- constants ------------------------------ */

const EXAM_CODE = "JEE_MAIN";
const EXAM_NAME = "JEE Main";
const STREAM = "B.E./B.Tech";
const YEAR = 2023;

/** JEE Main 2023: +4 / -1 in BOTH sections. */
const MARKS_CORRECT = 4;
const MARKS_INCORRECT = -1;
/** 10 numerical questions per subject are printed; any 5 count. */
const SECTION_B_ATTEMPT_LIMIT = 5;

const SHIFT_TIMES = {
  1: { label: "Shift 1", time: "9:00 AM – 12:00 PM", slot: "Morning" },
  2: { label: "Shift 2", time: "3:00 PM – 6:00 PM", slot: "Evening" },
};

const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const MONTH_NAME = Object.fromEntries(Object.entries(MONTHS).map(([k, v]) => [v, k]));
/** 2023 ran two sessions: January (with two February days) and April. */
const SESSION_MONTH_LABEL = { 1: "January", 2: "April" };

const SOURCE_NOTES = {
  allen:
    "ALLEN Career Institute solution booklet for the NTA JEE Main 2023 paper. " +
    "Questions © NTA; worked solutions © ALLEN Career Institute. Supplied by the operator.",
  mathongo:
    "MathonGo 'JEE Main Previous Year Paper' compilation of the NTA JEE Main 2023 paper. " +
    "Questions © NTA. Supplied by the operator.",
};

const VOID_ANSWER = /^(bonus|dropped|all|none|cancelled|marks to all)$/i;

/* --------------------------------- CLI ---------------------------------- */

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
if (args.help || !args.dir || args.dir === true) {
  console.log(`
Convert JEE Main 2023 paper PDFs to the PYQ import format.

  --dir <path>    folder holding the PDFs
  --out <path>    output JSON (default data/pyq/jee-main-2023.json)
  --strict        exit non-zero if any paper fails to parse

Reads only local files. Nothing is downloaded.
`);
  process.exit(args.help ? 0 : 1);
}

const OUT = args.out && args.out !== true ? args.out : "data/pyq/jee-main-2023.json";

/* ----------------------------- file metadata ---------------------------- */

const SUBJECT_OF = { maths: "Mathematics", mathematics: "Mathematics", physics: "Physics", chemistry: "Chemistry" };

function describe(file) {
  const m = /^JEEMain_(\d{4})_Session(\d)_(\d{2})-([A-Za-z]{3})_Shift(\d)_(.+?)_(QuestionPaper|Solution|Paper)\.pdf$/i.exec(file);
  if (!m) return null;
  const [, year, session, day, mon, shift, subjectPart, kind] = m;
  if (Number(year) !== YEAR) return null;

  const month = MONTHS[mon[0].toUpperCase() + mon.slice(1).toLowerCase()];
  if (!month) return null;

  const subject = SUBJECT_OF[subjectPart.toLowerCase()] ?? null;
  // "QuestionPaper" is the MathonGo compilation (all three subjects). Both
  // "Solution" and "Paper" are ALLEN booklets for a single subject — a handful
  // of shifts were only ever published as the paper without worked solutions,
  // but the layout, the (1)-(4) options and the "Official Ans. by NTA" line are
  // identical, so they parse the same way. Treating "Paper" as unrecognised
  // silently lost 11 April Shift 1 Physics.
  const isAllen = kind.toLowerCase() === "solution" || kind.toLowerCase() === "paper";
  // An ALLEN booklet is one subject; a MathonGo file is all three.
  if (isAllen && !subject) return null;

  return {
    file,
    kind: isAllen ? "allen" : "mathongo",
    year: Number(year),
    sessionNumber: Number(session),
    paperDate: `${year}-${String(month).padStart(2, "0")}-${day}`,
    day: Number(day),
    month,
    shift: Number(shift),
    subject,
  };
}

function paperFacets(d) {
  const st = SHIFT_TIMES[d.shift];
  const dateLabel = `${d.day} ${MONTH_NAME[d.month]} ${d.year}`;
  return {
    examCode: EXAM_CODE,
    examName: EXAM_NAME,
    stream: STREAM,
    year: d.year,
    sessionNumber: d.sessionNumber,
    sessionLabel: `Session ${d.sessionNumber} (${SESSION_MONTH_LABEL[d.sessionNumber] ?? ""})`.trim(),
    paperDate: d.paperDate,
    dateLabel,
    shift: d.shift,
    shiftLabel: st.label,
    shiftTime: st.time,
    shiftSlot: st.slot,
    paperId: `jee-main-2023-s${d.sessionNumber}-${d.paperDate}-shift${d.shift}`,
    session: `Session ${d.sessionNumber} · ${dateLabel} · ${st.label}`,
  };
}

/* ------------------------------- helpers -------------------------------- */

const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const tidy = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

const hashQuestion = (coords) =>
  crypto.createHash("sha256").update(`jee-main|${coords}`).digest("hex");

function normaliseAnswer(raw, { section }) {
  const value = tidy(raw);
  if (!value) return { answer: null, void: false };
  if (VOID_ANSWER.test(value)) return { answer: null, void: true, reason: value };

  if (section === "A") {
    // Both 2023 families print the option's NUMBER, 1-4.
    const n = Number(value);
    if (n >= 1 && n <= 4) return { answer: "ABCD"[n - 1], void: false };
    const m = /\b([A-D])\b/.exec(value.toUpperCase());
    return m ? { answer: m[1], void: false } : { answer: null, void: false };
  }
  const num = value.match(/-?\d+(?:\.\d+)?/);
  return num ? { answer: num[0], void: false } : { answer: null, void: false };
}

function solutionQuality(text) {
  if (!text) return null;
  const letters = (text.match(/[a-zA-Z]/g) || []).length;
  const words = text.split(/\s+/).filter((w) => /^[a-zA-Z]{3,}$/.test(w)).length;
  if (text.length < 24) return "sparse";
  return letters / text.length > 0.45 && words >= 6 ? "prose" : "symbolic";
}

/**
 * Does this stem read as a sentence with its quantities missing?
 *
 * The 2022 output shipped rows like
 *
 *   "The cell potential for the following cell is at. The of the solution is
 *    (Nearest integer) (Given: and)"
 *
 * which passed the old check — it is long enough and its options extracted —
 * but is not a question anyone can answer. What gives it away is grammatical,
 * not statistical: a preposition or copula with nothing after it, an empty
 * bracket, a space before a full stop. Each of those is where a symbol used to
 * be. One such artefact can be a typo in the source; two mean the text layer
 * lost content and the scan has to be shown instead.
 */
function looksTruncated(text) {
  const t = tidy(text);
  if (!t) return true;

  const signals = [
    /\(\s*\)/,                                   // "( )" — the contents were drawn
    /\s[.,;]/,                                   // " ." — a symbol stood there
    /\b(is|are|was|were|be|of|to|for|and|or|with|than|between|equals?|gives?)\s*[.,)]/i,
    /\b(Given|where|If|Let)\s*:?\s*(and|,|\)|$)/i, // "(Given: and)"
    /[=+\-×÷/^_]\s*$/,                           // ends on a dangling operator
    /\b(is|are|of|to|and|or|the|a|an)\s*$/i,     // ends mid-phrase
    /^\s*(Then|Hence|So|Therefore)\b/i,          // starts mid-sentence
  ];
  const hits = signals.reduce((n, re) => n + (re.test(t) ? 1 : 0), 0);
  return hits >= 2;
}

/* -------------------------------- convert ------------------------------- */

function toRow(q, facets, o) {
  const { answer, void: isVoid, reason } = normaliseAnswer(o.answerRaw, { section: o.section });
  // Type follows the question, not its position. A fill-in blank with no
  // options is numerical however it is numbered — these papers interleave the
  // two — and calling it multiple choice put four empty radio buttons under a
  // question that has none.
  const looksNumerical =
    /_{3,}/.test(q.questionText || "") &&
    !Object.values(q.options || {}).some((o2) => o2 && String(o2).trim());
  const questionType = o.section === "B" || looksNumerical ? "numerical" : "mcq_single";
  const stem = tidy(q.questionText);

  const tagged =
    tagTopic(stem, EXAM_CODE, o.subject) ??
    tagTopic(`${stem} ${Object.values(q.options || {}).join(" ")}`, EXAM_CODE, o.subject);

  return {
    ...facets,
    subject: o.subject,
    subjectId: slug(o.subject),
    topic: tagged?.topic ?? null,
    chapter: tagged?.topic ?? null,
    chapterId: tagged ? slug(tagged.topic) : null,
    topicConfidence: tagged?.score ?? null,
    topicRunnerUp: tagged?.runnerUp ?? null,

    section: o.section,
    sectionLabel: o.section === "A" ? "Section A (MCQ)" : "Section B (Numerical)",
    questionNumber: o.numberInSubject,
    paperQuestionNumber: o.paperNumber,
    // The number as PRINTED in the source PDF. Not the same as the palette
    // number — ALLEN's 2023 booklets number across the paper from wherever the
    // subject sat, so Physics starts at 31. The figure pass has to find the
    // question on the page, and the page says 31.
    printedNumber: o.printedNumber,

    // Delimited so KaTeX renders the notation the extractor recovered, and
    // broken into blocks so an assertion-reason question is not one wall of
    // text. Without wrapMath a bare "\frac{1}{2}" reaches the page as those
    // literal characters — which is what 1314 of these rows were doing.
    questionText: splitBlocks(wrapMath(stem)),
    optionA: wrapMath(q.options?.A ?? null),
    optionB: wrapMath(q.options?.B ?? null),
    optionC: wrapMath(q.options?.C ?? null),
    optionD: wrapMath(q.options?.D ?? null),
    correctAnswer: answer,
    questionType,
    marksCorrect: MARKS_CORRECT,
    marksIncorrect: MARKS_INCORRECT,

    solution: wrapMath(o.solution) || null,
    solutionQuality: solutionQuality(o.solution),
    solutionModel: o.solution ? "imported" : null,
    answerNote:
      o.allenAnswer && answer && String(o.allenAnswer).toUpperCase() !== String(answer).toUpperCase()
        ? `ALLEN's key for this question was "${o.allenAnswer}"; the NTA key is used here.`
        : null,

    status: isVoid ? "bonus" : "ok",
    voidReason: isVoid ? reason : null,
    needsFigure: false,
    figureHint: null,
    // Base name for this question's crops; the figure pass appends _Q, _A.._D
    // and _S. Deterministic so a re-run overwrites rather than accumulates.
    figureBase:
      `JEEMain_${facets.year}_S${facets.sessionNumber}_${facets.paperDate}_Shift${facets.shift}_` +
      `${o.subject}_Q${String(o.numberInSubject).padStart(2, "0")}`,
    questionImage: null,
    optionAImage: null,
    optionBImage: null,
    optionCImage: null,
    optionDImage: null,
    solutionImage: null,
    diagramImage: null,
    diagramSource: null,
    languages: ["en"],

    sourceUrl: o.sourceFile,
    sourceNote: SOURCE_NOTES[o.sourceKind],
    // Position, never text.
    //
    // Hashing the text means every improvement to the extraction rewrites the
    // key, so a re-import inserts a second copy of the paper instead of
    // updating it — that is what left 239 orphans here and 1980 in 2022.
    // Section is excluded as well: it is derived, and the interleaving fix
    // reclassifies questions between A and B.
    questionHash: hashQuestion(`${facets.paperId}|${o.subject}|${o.numberInSubject}`),
  };
}

async function linesOf(dir, file) {
  return extractLines(fs.readFileSync(path.join(dir, file)));
}

async function main() {
  const dir = args.dir;
  const files = fs.readdirSync(dir).filter((f) => /^JEEMain_2023_.*\.pdf$/i.test(f)).sort();
  const described = files.map(describe);
  const usable = described.filter(Boolean);
  const skipped = files.filter((f, i) => !described[i]);

  console.log(`Found ${files.length} JEE Main 2023 PDFs — ${usable.length} recognised, ${skipped.length} skipped.`);
  for (const s of skipped) console.log(`  · skipped (not a dated shift paper): ${s}`);

  const allenBySlot = new Set();
  for (const d of usable.filter((x) => x.kind === "allen")) {
    allenBySlot.add(`${d.paperDate}|${d.shift}|${d.subject}`);
  }

  const rows = [];
  const problems = [];
  // A key the SOURCE never printed is not a question the board voided. The
  // 11 April Shift 1 Physics paper prints "Official Ans. by NTA ( )" for all
  // ten of its Section B questions — the key simply is not in that file. Calling
  // those "bonus" would tell a candidate the board awarded marks to everyone,
  // which is a different and wrong claim, so they are tracked separately.
  const noKey = [];
  /** date|shift|paperNumber -> raw key, from every MathonGo file read. */
  const mgKeys = new Map();
  let voided = 0;

  /* --------------------------- ALLEN booklets --------------------------- */

  for (const d of usable.filter((x) => x.kind === "allen")) {
    let parsed;
    try { parsed = parseAllen2023(await linesOf(dir, d.file)); }
    catch (e) { problems.push(`${d.file}: ${e.message}`); continue; }

    if (parsed.length !== 30) problems.push(`${d.file}: parsed ${parsed.length} questions, expected 30`);
    const facets = paperFacets(d);

    for (const q of parsed) {
      const row = toRow(q, facets, {
        subject: d.subject,
        section: q.section,
        numberInSubject: q.numberInSubject,
        paperNumber: q.paperNumber,
        printedNumber: q.paperNumber,
        answerRaw: q.officialAnswer,
        solution: q.solution,
        allenAnswer: q.allenAnswer,
        sourceFile: d.file,
        sourceKind: "allen",
      });
      if (!row.correctAnswer) noKey.push(row);
      rows.push(row);
    }
  }

  /* ------------------------- MathonGo compilations ---------------------- */

  for (const d of usable.filter((x) => x.kind === "mathongo")) {
    let parsed;
    try { parsed = parseMathonGo2023(await linesOf(dir, d.file)); }
    catch (e) { problems.push(`${d.file}: ${e.message}`); continue; }

    const { questions, key } = parsed;
    if (questions.length !== 90) problems.push(`${d.file}: parsed ${questions.length} questions, expected 90`);
    if (key.size !== 90) problems.push(`${d.file}: answer key has ${key.size} entries, expected 90`);

    // Keep every MathonGo key, even for a slot ALLEN already covers. Some ALLEN
    // files are the question paper rather than the solution booklet and print
    // "Official Ans. by NTA ( )" — an empty key — for all ten of their Section B
    // questions. The same shift's MathonGo compilation prints the real ones, so
    // the keys are indexed here and used to fill those blanks below.
    for (const [n, v] of key) mgKeys.set(`${d.paperDate}|${d.shift}|${n}`, v);

    const facets = paperFacets(d);

    // Match each question to its real key slot before building any rows. These
    // files interleave the exam's numerical questions among its multiple-choice
    // ones while the answer key keeps the exam's order, so reading the key at
    // the printed position hands a numerical question an option number. See
    // lib/sectionKeys.mjs — it was verified against two questions whose answers
    // were computed by hand.
    const keyed = new Map();
    for (const [base, lo, hi] of [[0, 1, 30], [30, 31, 60], [60, 61, 90]]) {
      const block = questions.filter((q) => q.paperNumber >= lo && q.paperNumber <= hi);
      if (!block.length) continue;
      const { assigned, interleaved, trustworthy, mcqCount, numCount } = assignSectionsAndKeys(
        block.map((q) => ({ ...q, number: q.paperNumber })),
        base,
        key
      );
      if (interleaved && !trustworthy) {
        problems.push(
          `${d.file}: ${block[0].subject} interleaves numericals and its shape could not be ` +
            `reproduced (${mcqCount} MCQ + ${numCount} numerical of ${block.length}, expected ` +
            `20 + 10) — keys that cannot be matched are dropped rather than guessed`
        );
      }
      for (const a of assigned) keyed.set(a.number, a);
    }

    for (const q of questions) {
      // ALLEN already carries this subject for this shift, with solutions.
      if (allenBySlot.has(`${d.paperDate}|${d.shift}|${q.subject}`)) continue;

      const k = keyed.get(q.paperNumber);
      const row = toRow(q, facets, {
        subject: q.subject,
        section: k?.section ?? q.section,
        numberInSubject: k?.numberInSubject ?? q.numberInSubject,
        paperNumber: q.paperNumber,
        printedNumber: q.paperNumber,
        answerRaw: k ? k.answerRaw : q.officialAnswer,
        solution: null,
        allenAnswer: null,
        sourceFile: d.file,
        sourceKind: "mathongo",
      });
      if (q.placeholder || q.missingText) row.__forceFigure = true;

      // A key that could not be matched is left absent and said so, rather than
      // filled from the printed position — that position holds an option number
      // and this is a numerical question, so it would mark a candidate who
      // answered correctly as wrong.
      if (k?.keyUnreliable) {
        row.status = "needs_review";
        row.answerNote =
          "This paper prints its numerical questions among the multiple-choice ones while its " +
          "answer key keeps the exam's order, and too little of the subject survived extraction " +
          "to match them up. The printed key for this position is an option number, which is not " +
          "this question's answer, so no key is shown rather than a wrong one.";
      } else if (!row.correctAnswer) {
        noKey.push(row);
      }
      rows.push(row);
    }
  }

  /* -------------------------- palette numbering -------------------------- */

  // The NTA palette runs 1-90 across the paper. MathonGo already numbers that
  // way. ALLEN's booklets number across the paper too in 2023, but the base
  // depends on where the subject sat in that shift's booklet set, so a shift
  // assembled from three separate files can repeat or skip numbers. Renumber
  // from the fixed section order so the palette is identical for every paper.
  const SUBJECT_OFFSET = { Physics: 0, Chemistry: 30, Mathematics: 60 };
  for (const r of rows) r.paperQuestionNumber = SUBJECT_OFFSET[r.subject] + r.questionNumber;

  // Fill any key the ALLEN file left blank from the same shift's MathonGo
  // compilation. Once the palette is derived both sources number the paper
  // identically, so the slot maps exactly. The swap is recorded on the row
  // rather than done silently — a candidate reviewing a contested question
  // should be able to see which publication the key came from.
  let keysFilled = 0;
  for (const r of rows) {
    if (r.correctAnswer) continue;
    const raw = mgKeys.get(`${r.paperDate}|${r.shift}|${r.paperQuestionNumber}`);
    if (raw == null) continue;
    const { answer } = normaliseAnswer(raw, { section: r.section });
    if (!answer) continue;
    r.correctAnswer = answer;
    r.answerNote =
      "The ALLEN paper for this shift printed no answer key for this question; " +
      "the key shown is the one published in the MathonGo compilation of the same shift.";
    keysFilled++;
  }

  /* ---------------------------- figure flagging -------------------------- */

  let needsFigureCount = 0;
  for (const r of rows) {
    const optionsIncomplete =
      r.questionType === "mcq_single" &&
      ![r.optionA, r.optionB, r.optionC, r.optionD].every((o) => o && o.trim());
    const stemThin = tidy(r.questionText).length < 40;
    const broken = looksTruncated(r.questionText);

    if (r.__forceFigure || optionsIncomplete || stemThin || broken) {
      r.needsFigure = true;
      if (r.status === "ok") r.status = "needs_figure";
      r.figureHint = `JEE Main ${r.year} ${r.dateLabel} ${r.shiftLabel} ${r.subject} Q${r.questionNumber}`;
      // Deterministic name so the Drive lookup is an exact match rather than a
      // full-text guess. The figure pass writes this file; the operator uploads
      // the folder as-is.
      needsFigureCount++;

      if (tidy(r.questionText).length < 25) {
        r.questionText =
          `[Shown as an image] ${r.examName} ${r.year} · ${r.dateLabel} ${r.shiftLabel} · ` +
          `${r.subject} Q${r.questionNumber} (Section ${r.section})` +
          (tidy(r.questionText) ? ` — ${tidy(r.questionText)}` : "");
      }
    }
    delete r.__forceFigure;
  }

  for (const r of noKey.filter((x) => !x.correctAnswer)) {
    r.answerNote =
      "The source PDF for this shift printed no answer key for this question " +
      "(the key field is blank in the original). The question is kept so the " +
      "paper stays complete; the key has to come from another source.";
  }

  /* ---------------------------- figure cutting --------------------------- */

  // Cut each flagged question out of its own source page. The images go to one
  // flat folder, named deterministically, so the operator uploads that folder
  // to Drive as-is and src/lib/driveDiagrams.js matches on the exact filename
  // instead of guessing from a full-text search.
  const figDir = args.figures && args.figures !== true
    ? args.figures
    : path.join(path.dirname(OUT), "figures-2023");

  let figuresWritten = 0;
  const figuresMissing = [];
  if (!args["no-figures"]) {
    const bySource = new Map();
    // EVERY question, not only the ones whose text failed. The image is the
    // authoritative rendering of what the candidate actually saw.
    for (const r of rows) {
      if (!r.sourceUrl) continue;
      if (!bySource.has(r.sourceUrl)) bySource.set(r.sourceUrl, []);
      bySource.get(r.sourceUrl).push(r);
    }

    for (const [file, group] of bySource) {
      const d = usable.find((x) => x.file === file);
      if (!d) continue;
      try {
        const { written, missing, parts } = extractFigures({
          pdfPath: path.join(dir, file),
          outDir: figDir,
          mode: d.kind,
          wanted: group.map((r) => ({
            printedNumber: r.printedNumber,
            baseName: r.figureBase,
            // A numerical question prints no options.
            wantOptions: r.questionType === "mcq_single",
            // Only the solution booklets print one.
            wantSolution: d.kind === "allen",
          })),
        });
        figuresWritten += written;

        const lost = new Set(missing);
        for (const r of group) {
          // Keyed by figureBase — extractFigures stores parts under the base
          // name because a printed number is not unique in a booklet that
          // restarts its numbering at each section.
          if (lost.has(r.figureBase)) { figuresMissing.push(r.figureHint); continue; }
          const p = parts.get(r.figureBase);
          if (!p) continue;
          r.questionImage = p.stem ?? null;
          r.optionAImage = p.options?.A ?? null;
          r.optionBImage = p.options?.B ?? null;
          r.optionCImage = p.options?.C ?? null;
          r.optionDImage = p.options?.D ?? null;
          r.solutionImage = p.solution ?? null;
        }
      } catch (e) {
        problems.push(`${file}: figure pass failed — ${e.message}`);
        for (const r of group) figuresMissing.push(r.figureHint);
      }
    }
  }

  /* --------------------------------- out -------------------------------- */

  const ORDER = ["Physics", "Chemistry", "Mathematics"];
  rows.sort(
    (a, b) =>
      a.paperDate.localeCompare(b.paperDate) ||
      a.shift - b.shift ||
      ORDER.indexOf(a.subject) - ORDER.indexOf(b.subject) ||
      a.questionNumber - b.questionNumber
  );

  const seen = new Set();
  const unique = rows.filter((r) => (seen.has(r.questionHash) ? false : seen.add(r.questionHash)));
  const dupes = rows.length - unique.length;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(unique, null, 2));

  // One manifest row per shift, for the "pick a paper" screen.
  const papers = new Map();
  for (const row of unique) {
    if (!papers.has(row.paperId)) {
      papers.set(row.paperId, {
        paperId: row.paperId, examCode: row.examCode, examName: row.examName, stream: row.stream,
        year: row.year, sessionNumber: row.sessionNumber, sessionLabel: row.sessionLabel,
        paperDate: row.paperDate, dateLabel: row.dateLabel, shift: row.shift,
        shiftLabel: row.shiftLabel, shiftTime: row.shiftTime,
        durationMinutes: 180, marksCorrect: MARKS_CORRECT, marksIncorrect: MARKS_INCORRECT,
        totalMarks: 300, sectionBAttemptLimit: SECTION_B_ATTEMPT_LIMIT,
        languages: ["en"], subjects: {}, questionCount: 0, needsFigureCount: 0, withSolution: 0,
      });
    }
    const p = papers.get(row.paperId);
    p.subjects[row.subject] = (p.subjects[row.subject] || 0) + 1;
    p.questionCount++;
    if (row.needsFigure) p.needsFigureCount++;
    if (row.solution) p.withSolution++;
  }
  const manifest = [...papers.values()].sort(
    (a, b) => a.paperDate.localeCompare(b.paperDate) || a.shift - b.shift
  );
  const manifestPath = OUT.replace(/\.json$/, "-papers.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const figPath = OUT.replace(/\.json$/, "-needs-figures.json");
  const figList = unique.filter((r) => r.needsFigure).map((r) => ({
    questionHash: r.questionHash, paperId: r.paperId, dateLabel: r.dateLabel, shiftLabel: r.shiftLabel,
    subject: r.subject, questionNumber: r.questionNumber, paperQuestionNumber: r.paperQuestionNumber,
    section: r.section, figureHint: r.figureHint,
    sourceUrl: r.sourceUrl, questionText: r.questionText, correctAnswer: r.correctAnswer,
  }));
  fs.writeFileSync(figPath, JSON.stringify(figList, null, 2));

  /* ------------------------------- report ------------------------------- */

  const by = (fn) => unique.reduce((a, r) => ((a[fn(r)] = (a[fn(r)] || 0) + 1), a), {});
  const tagged = unique.filter((r) => r.topic).length;
  const withSolution = unique.filter((r) => r.solution).length;
  const prose = unique.filter((r) => r.solutionQuality === "prose").length;
  const complete = unique.filter(
    (r) => !r.needsFigure && r.correctAnswer && (r.questionType === "numerical" ||
      [r.optionA, r.optionB, r.optionC, r.optionD].every((o) => o && o.trim()))
  ).length;

  console.log(`\n✔ ${unique.length} questions → ${OUT}`);
  console.log(`✔ ${manifest.length} papers    → ${manifestPath}`);
  if (dupes) console.log(`  (${dupes} duplicate question text collapsed)`);
  console.log("\nBy subject:", by((r) => r.subject));
  console.log("By session:", by((r) => r.sessionLabel));
  console.log("By type:   ", by((r) => r.questionType));
  console.log("By status: ", by((r) => r.status));
  console.log(
    `\nFully renderable from text: ${complete}/${unique.length} (${Math.round((complete / unique.length) * 100)}%)` +
      `\nServed as a cut-out image:  ${needsFigureCount} flagged, ${figuresWritten} rendered → ${figDir}` +
      (figuresMissing.length ? `\n  (${figuresMissing.length} could not be located on the page)` : "") +
      `\n  worklist: ${figPath}` +
      `\nAnswer key present:         ${unique.filter((r) => r.correctAnswer).length}/${unique.length}` +
      `\nTopic tagged:               ${tagged}/${unique.length} (${Math.round((tagged / unique.length) * 100)}%)` +
      `\nWith worked solution:       ${withSolution} (${prose} readable prose, ${withSolution - prose} symbolic)`
  );
  if (voided) console.log(`${voided} question(s) were voided by the board — kept with status "bonus".`);
  if (keysFilled) {
    console.log(`\n${keysFilled} blank ALLEN key(s) filled from the MathonGo compilation of the same shift.`);
  }
  const stillNoKey = noKey.filter((r) => !r.correctAnswer);
  if (stillNoKey.length) {
    const where = [...new Set(stillNoKey.map((r) => `${r.dateLabel} ${r.shiftLabel} ${r.subject}`))];
    console.log(
      `\n${stillNoKey.length} question(s) have no answer key because no source printed one:\n  ` +
        where.map((w) => `· ${w}`).join("\n  ") +
        "\n  They are kept and annotated, not dropped."
    );
  }

  if (problems.length) {
    console.log(`\n⚠ ${problems.length} issue(s):`);
    for (const p of problems.slice(0, 25)) console.log(`  · ${p}`);
    if (problems.length > 25) console.log(`  · ...and ${problems.length - 25} more`);
  }

  const gaps = [];
  for (const p of manifest) {
    for (const s of ORDER) if (!p.subjects[s]) gaps.push(`${p.dateLabel} ${p.shiftLabel} — ${s}`);
  }
  if (gaps.length) {
    console.log(`\n⚠ ${gaps.length} subject-paper(s) missing from the source PDFs:`);
    for (const g of gaps) console.log(`  · ${g}`);
  }

  if (args.strict && (problems.length || gaps.length)) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
