#!/usr/bin/env node
// Convert GATE Metallurgical Engineering (MT) papers into the PYQ import format.
//
// ─────────────────────────────────────────────────────────────────────────
// PROVENANCE
//
// GATE papers and their answer keys are published by the organising IIT and are
// the copyright of the GATE committee. This reads only files the operator has
// already obtained and stamps every row with the exact PDF it came from, same
// posture as convertJeeMain.mjs.
// ─────────────────────────────────────────────────────────────────────────
//
// Usage:
//   node scripts/convertGateMt.mjs --dir "<folder with MT*.pdf>"
//   node scripts/convertGateMt.mjs --dir <folder> --year 2023
//   node scripts/convertGateMt.mjs --dir <folder> --no-figures
//
// WHICH YEARS THIS CAN DO, AND WHY NOT THE REST
//
// The folder holds MT2007–MT2025 and seven files named "<year> answer key".
// Only 2022–2025 are convertible, and the reason is in the files rather than in
// this script:
//
//   2019  "MT-2019 answer key.pdf" is byte-for-byte MT2019.pdf — the same file
//         under a second name. There is no 2019 key here. Both are also image
//         scans with no text layer.
//   2020  The key is real and parses. The paper is a scan: 17 pages, 3,393
//         characters of text (headers and footers), and not one "Q.n".
//   2021  Both the paper and the key are image scans. Zero extractable text.
//
// Converting those needs OCR, which is a different and much less reliable
// pipeline — and for 2019 it would still leave the questions unanswerable. They
// are reported and skipped rather than half-converted, because a paper with
// invented answers is worse than no paper.
//
// WHAT GATE GIVES THAT JEE DOES NOT
//
// The key states each question's TYPE and MARKS. So none of
// scripts/lib/sectionKeys.mjs applies — that machinery exists only because the
// JEE sources interleave numericals and print keys in a different order. Here
// the type is read, not inferred.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";

import { extractLines } from "./lib/pdfLayout.mjs";
import { wrapMath, splitBlocks } from "./lib/mathMarkup.mjs";
import { extractFigures } from "./lib/figures.mjs";
import { parseGateKey, parseGatePaper } from "./lib/parseGate.mjs";
import { tagTopic } from "../src/lib/topicTagger.js";

/* ------------------------------- constants ------------------------------ */

const EXAM_CODE = "GATE_MT";
const EXAM_NAME = "GATE Metallurgical Engineering";
const STREAM = "Metallurgical Engineering";

/** One paper, one sitting, 65 questions, 100 marks, 3 hours. No shifts. */
const TOTAL_QUESTIONS = 65;
const TOTAL_MARKS = 100;
const DURATION_MIN = 180;

/**
 * GATE negative marking, which is a fraction of the question's own mark rather
 * than a flat figure like JEE's −1:
 *
 *   1-mark MCQ   wrong → −1/3
 *   2-mark MCQ   wrong → −2/3
 *   MSQ and NAT  wrong →  0     (the board has never negatively marked these)
 *
 * Stored to 4dp because the column is a float and −0.3333 scores the same as
 * −1/3 over a 65-question paper to well within a mark.
 */
function negativeFor(type, marks) {
  if (type !== "MCQ") return 0;
  return -Number((marks / 3).toFixed(4));
}

const SUBJECT_NAME = {
  GA: "General Aptitude",
  MT: "Metallurgical Engineering",
};

const TYPE_MAP = { MCQ: "mcq_single", MSQ: "mcq_multiple", NAT: "numerical" };

const SOURCE_NOTE =
  "GATE Metallurgical Engineering question paper and official answer key, " +
  "published by the organising institute. © GATE committee. Supplied by the operator.";

/* -------------------------------- helpers ------------------------------- */

const slug = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const hashQuestion = (s) => crypto.createHash("sha1").update(s).digest("hex");

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    const v = argv[i + 1];
    if (v && !v.startsWith("--")) { out[k] = v; i++; } else out[k] = true;
  }
  return out;
}

/* --------------------------------- main --------------------------------- */

async function main() {
  const args = parseArgs(process.argv);
  const dir = args.dir;
  if (!dir) {
    console.error("--dir <folder containing MT*.pdf and the answer keys> is required");
    process.exit(2);
  }
  const OUT = args.out || path.join("data", "pyq", "gate-mt.json");
  const ONLY = args.year ? Number(args.year) : null;

  const files = fs.readdirSync(dir);
  const papers = new Map();
  for (const f of files) {
    let m = /^MT(\d{4})\.pdf$/i.exec(f);
    if (m) {
      papers.set(Number(m[1]), { ...(papers.get(Number(m[1])) || {}), paper: f });
      continue;
    }
    m = /^MT[-_ ]?(\d{4})[^\d]*answer\s*key\.pdf$/i.exec(f);
    if (m) papers.set(Number(m[1]), { ...(papers.get(Number(m[1])) || {}), key: f });
  }

  const years = [...papers.keys()].filter((y) => !ONLY || y === ONLY).sort();
  const rows = [];
  const problems = [];
  const skipped = [];
  /** year → the crops to make, once the rows for that year are built. */
  const figureWork = new Map();

  for (const year of years) {
    const { paper, key } = papers.get(year);
    if (!paper) { problems.push(`${year}: no question paper`); continue; }
    if (!key) { skipped.push(`${year}: no answer key file — skipped`); continue; }

    // A key that is really a second copy of the paper. The 2019 pair is
    // byte-identical; comparing content rather than names is the only way to
    // catch it, and left uncaught it yields a paper with no answers at all.
    const paperBuf = fs.readFileSync(path.join(dir, paper));
    const keyBuf = fs.readFileSync(path.join(dir, key));
    if (paperBuf.equals(keyBuf)) {
      skipped.push(`${year}: "${key}" is a byte-identical copy of "${paper}", not a key — skipped`);
      continue;
    }

    // The key is a TABLE. lib/pdfLayout.mjs splits a page into columns before
    // reading it, which is right for a two-up booklet and destroys a table:
    // the six columns come apart and every row reads "1 6 MCQ", losing the
    // subject, the answer and the mark without raising anything.
    const keyMap = parseGateKey((await extractLines(keyBuf, { columns: false })).map(lineText));
    if (!keyMap.size) {
      skipped.push(`${year}: answer key has no readable text (image scan) — skipped`);
      continue;
    }

    const questions = parseGatePaper((await extractLines(paperBuf)).map(lineText));
    if (!questions.length) {
      skipped.push(
        `${year}: question paper has no text layer (image scan) — skipped. ` +
          `Its key parsed ${keyMap.size} answers, so only OCR is missing.`
      );
      continue;
    }

    const facets = {
      examCode: EXAM_CODE,
      examName: EXAM_NAME,
      stream: STREAM,
      year,
      // GATE MT is a single sitting, so these carry the shape the dashboard
      // filters expect without inventing a session or a shift.
      paperId: `gate-mt-${year}`,
      paperLabel: `GATE MT ${year}`,
      sessionNumber: null,
      sessionLabel: null,
      paperDate: null,
      dateLabel: String(year),
      shift: null,
      shiftLabel: null,
      shiftTime: null,
      daySlot: null,
    };

    const wanted = [];
    for (const q of questions) {
      const k = keyMap.get(q.number);
      const row = toRow(q, k, facets, paper);
      rows.push(row);
      wanted.push({
        printedNumber: q.number,
        baseName: row.figureBase,
        wantOptions: row.questionType !== "numerical",
        // GATE publishes no worked solutions with the paper.
        wantSolution: false,
      });
    }

    const missingKeys = questions.filter((q) => !keyMap.get(q.number)).length;
    if (missingKeys) {
      problems.push(`${year}: ${missingKeys} question(s) have no key row — kept as needs_review`);
    }
    if (questions.length !== TOTAL_QUESTIONS) {
      problems.push(`${year}: parsed ${questions.length} questions, expected ${TOTAL_QUESTIONS}`);
    }

    figureWork.set(year, { pdfPath: path.join(dir, paper), wanted });
  }

  /* ------------------------------- figures ------------------------------ */

  const figDir = args.figures && args.figures !== true
    ? args.figures
    : path.join(path.dirname(OUT), "figures-gate-mt");

  let figuresWritten = 0;
  let figuresLost = 0;

  if (!args["no-figures"]) {
    for (const [year, work] of figureWork) {
      try {
        const { written, missing, parts } = extractFigures({
          pdfPath: work.pdfPath,
          outDir: figDir,
          // GATE prints "Q.1"; neither of the JEE patterns matches it.
          mode: "gate",
          wanted: work.wanted,
        });
        figuresWritten += written;
        const lost = new Set(missing);
        for (const r of rows.filter((x) => x.year === year)) {
          if (lost.has(r.figureBase)) { figuresLost++; continue; }
          const p = parts.get(r.figureBase);
          if (!p) continue;
          r.questionImage = p.stem ?? null;
          r.optionAImage = p.options?.A ?? null;
          r.optionBImage = p.options?.B ?? null;
          r.optionCImage = p.options?.C ?? null;
          r.optionDImage = p.options?.D ?? null;
          // The choices could not be cut out separately, so the stem image
          // carries them. The player reads this to say where they are instead
          // of showing four blank rows.
          r.optionsInStem = Boolean(p.optionsInStem);
        }
      } catch (e) {
        problems.push(`${year}: figure pass failed — ${e.message}`);
      }
    }
  }

  // A question whose choices are drawn rather than written has no option text
  // to extract. That is what `needsFigure` means here, and it has to be set
  // before import: src/lib/pyqImport.js rejects a multiple-choice row with
  // fewer than two option strings unless the flag says the choices are in the
  // picture. The stem crop carries them — see the option-completeness rule in
  // lib/figures.mjs — so the question is answerable; it just is not text.
  let needsFigureCount = 0;
  let unanswerable = 0;
  let interleaved = 0;
  for (const r of rows) {
    const flag = (why) => {
      if (r.needsFigure) return;
      r.needsFigure = true;
      r.figureHint = `${EXAM_NAME} ${r.year} Q${r.paperQuestionNumber} (${why})`;
      needsFigureCount++;
      // No text, no crops and no stem image either: nothing on screen states
      // the question. Reported rather than served as though it were fine.
      if (!r.questionImage) unanswerable++;
    };

    // A question typeset beside its figure, or a match-the-column table, comes
    // out of the extractor with the two columns interleaved — the words are all
    // there but not in an order anyone can read, and a page number is stranded
    // in the middle of it. The tell is that footer residue. The crop is the
    // truthful rendering of these, so the flag points the UI at it.
    const FURNITURE = /Metallurgical Engineering \(MT\)|Organi[sz]ing Institute|Page\s+\d+\s+of/gi;
    const text = [r.questionText, r.optionA, r.optionB, r.optionC, r.optionD].join(" ");
    if (FURNITURE.test(text)) {
      interleaved++;
      flag("text interleaved with a figure or table");
      // Now that it has been recorded, take the footer back out so the stem
      // reads as well as it can for anyone who has images turned off.
      for (const f of ["questionText", "optionA", "optionB", "optionC", "optionD"]) {
        if (r[f]) r[f] = r[f].replace(FURNITURE, " ").replace(/\s{2,}/g, " ").trim() || null;
      }
      continue;
    }

    if (r.questionType === "numerical") continue;
    const withText = ["A", "B", "C", "D"].filter((L) => String(r[`option${L}`] || "").trim());
    const withCrop = ["A", "B", "C", "D"].filter((L) => r[`option${L}Image`]);
    if (withText.length >= 2 || withCrop.length === 4) continue;
    flag("choices are drawn, not written");
  }

  /* --------------------------------- out -------------------------------- */

  rows.sort((a, b) => a.year - b.year || a.paperQuestionNumber - b.paperQuestionNumber);

  const seen = new Set();
  const unique = rows.filter((r) => (seen.has(r.questionHash) ? false : seen.add(r.questionHash)));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(unique, null, 2));

  const manifestPath = OUT.replace(/\.json$/, "-papers.json");
  fs.writeFileSync(manifestPath, JSON.stringify(buildManifest(unique), null, 2));

  /* ------------------------------- report ------------------------------- */

  const by = (fn) => unique.reduce((a, r) => ((a[fn(r)] = (a[fn(r)] || 0) + 1), a), {});
  console.log(`\n${unique.length} question(s) → ${OUT}`);
  console.log(`papers → ${manifestPath}`);
  console.log(`by year:    ${JSON.stringify(by((r) => r.year))}`);
  console.log(`by type:    ${JSON.stringify(by((r) => r.questionType))}`);
  console.log(`by subject: ${JSON.stringify(by((r) => r.subject))}`);
  console.log(`keyed: ${unique.filter((r) => r.correctAnswer !== null).length}/${unique.length}`);
  console.log(`tagged with a topic: ${unique.filter((r) => r.topic).length}`);
  if (!args["no-figures"]) {
    console.log(`figures: ${figuresWritten} written to ${figDir}, ${figuresLost} question(s) not located`);
    console.log(`options inside the stem image: ${unique.filter((r) => r.optionsInStem).length}`);
  }
  if (needsFigureCount) {
    console.log(
      `${needsFigureCount} question(s) flagged needsFigure — the crop is authoritative` +
        (interleaved ? ` (${interleaved} because their text interleaves with a figure or table)` : "")
    );
  }
  if (unanswerable) {
    console.log(`⚠ ${unanswerable} question(s) have no option text, no option crop and no stem image`);
  }
  if (skipped.length) {
    console.log(`\nnot converted:`);
    for (const s of skipped) console.log(`  ${s}`);
  }
  if (problems.length) {
    console.log(`\nproblems:`);
    for (const p of problems) console.log(`  ${p}`);
  }
  if (args.strict && problems.length) process.exit(1);
}

/** extractLines returns objects on some paths and strings on others. */
const lineText = (l) => (typeof l === "string" ? l : (l.text ?? ""));

/* -------------------------------- row shape ------------------------------ */

function toRow(q, k, facets, sourceFile) {
  const subject = SUBJECT_NAME[k?.subject] ?? "Metallurgical Engineering";
  const questionType = k ? TYPE_MAP[k.type] ?? "mcq_single" : "mcq_single";
  const marks = k?.marks ?? 1;

  // The key column occasionally carries the subject glued onto the answer —
  // "MTA" where the table meant "MT" and "A" — so the letters are taken from
  // the end. Only for single-choice: an MSQ key is already several letters and
  // a NAT key is a range.
  let answer = null;
  if (k) {
    if (k.type === "MCQ") {
      const m = /([A-D])\s*$/.exec(k.key.toUpperCase());
      answer = m ? m[1] : null;
    } else if (k.type === "MSQ") {
      const letters = [...new Set(k.key.toUpperCase().match(/[A-D]/g) ?? [])].sort();
      answer = letters.length ? letters.join(",") : null;
    } else {
      answer = k.key; // "1.5 to 1.7" — scored as a range, see numericallyEqual
    }
  }

  const tagged =
    tagTopic(q.questionText, EXAM_CODE, subject) ??
    tagTopic(`${q.questionText} ${Object.values(q.options || {}).join(" ")}`, EXAM_CODE, subject);

  return {
    ...facets,
    subject,
    subjectId: slug(subject),
    topic: tagged?.topic ?? null,
    chapter: tagged?.topic ?? null,
    chapterId: tagged ? slug(tagged.topic) : null,
    topicConfidence: tagged?.score ?? null,
    topicRunnerUp: tagged?.runnerUp ?? null,

    // GATE has no lettered sections. Left null rather than forced into JEE's
    // A/B, which the player used to read to decide MCQ-vs-numerical and now
    // does not.
    section: null,
    sectionLabel: SUBJECT_NAME[k?.subject] ?? null,
    questionNumber: q.number,
    paperQuestionNumber: q.number,

    questionText: splitBlocks(wrapMath(q.questionText)),
    optionA: wrapMath(q.options?.A ?? null),
    optionB: wrapMath(q.options?.B ?? null),
    optionC: wrapMath(q.options?.C ?? null),
    optionD: wrapMath(q.options?.D ?? null),
    correctAnswer: answer,
    questionType,
    marksCorrect: marks,
    marksIncorrect: negativeFor(k?.type, marks),

    solution: null,
    solutionQuality: null,
    solutionModel: null,
    answerNote: null,

    // No key means no answer, and no answer means the question is kept but not
    // scored. Inventing one teaches the mistake.
    status: k ? "ok" : "needs_review",
    voidReason: k ? null : "no row for this question in the published key",

    needsFigure: false,
    figureHint: null,
    figureBase: `GATE_MT_${facets.year}_Q${String(q.number).padStart(2, "0")}`,
    questionImage: null,
    optionAImage: null,
    optionBImage: null,
    optionCImage: null,
    optionDImage: null,
    optionsInStem: false,
    solutionImage: null,
    diagramImage: null,
    diagramSource: null,
    languages: ["en"],

    sourceUrl: sourceFile,
    sourceNote: SOURCE_NOTE,
    questionHash: hashQuestion(`${facets.paperId}|${subject}|${q.number}`),
  };
}

/** One PyqPaper row per year, for scripts/importPyqPapers.mjs. */
function buildManifest(rows) {
  const byPaper = new Map();
  for (const r of rows) {
    if (!byPaper.has(r.paperId)) {
      byPaper.set(r.paperId, {
        paperId: r.paperId,
        examCode: r.examCode,
        examName: r.examName,
        stream: r.stream,
        year: r.year,
        sessionNumber: null,
        sessionLabel: null,
        paperDate: null,
        dateLabel: String(r.year),
        shift: null,
        shiftLabel: null,
        shiftTime: null,
        label: `GATE Metallurgical Engineering ${r.year}`,
        durationMinutes: DURATION_MIN,
        totalQuestions: 0,
        totalMarks: 0,
        // The paper-level pair is a summary only; scoring reads each question's
        // own marksCorrect/marksIncorrect, which is the whole point for GATE —
        // it mixes 1- and 2-mark questions, and negative marking applies to its
        // single-choice questions but never to MSQ or NAT. Left at the schema's
        // JEE defaults these cards would have advertised "+4 / −1", which is
        // not this exam's scheme in any section. The modal value is used.
        marksCorrect: 1,
        marksIncorrect: -Number((1 / 3).toFixed(4)),
        // A JEE Main idea: "attempt any 5 of the 10 numericals". GATE has no
        // such rule — every question counts.
        sectionBAttemptLimit: null,
        subjects: {},
        needsFigureCount: 0,
      });
    }
    const p = byPaper.get(r.paperId);
    p.totalQuestions++;
    p.totalMarks += r.marksCorrect;
    p.subjects[r.subject] = (p.subjects[r.subject] || 0) + 1;
    if (r.needsFigure) p.needsFigureCount++;
  }
  return [...byPaper.values()].sort((a, b) => a.year - b.year);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
