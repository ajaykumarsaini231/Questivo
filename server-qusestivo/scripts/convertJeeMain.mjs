#!/usr/bin/env node
// Convert JEE Main question paper PDFs into the PYQ import format.
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
// Neither is licensed to Questivo. This script therefore reads only files the
// operator has already obtained and stamps every row with the exact PDF it came
// from, so anything published can be traced and withdrawn. Clearing the rights
// is the operator's job; the script only makes the provenance impossible to
// lose. Same posture as scripts/importPyq.mjs, which refuses to download
// anything for the same reason.
// ─────────────────────────────────────────────────────────────────────────
//
// Usage:
//   node scripts/convertJeeMain.mjs --dir "<folder of PDFs>" --year 2023
//   node scripts/convertJeeMain.mjs --dir <folder> --year 2022 --strict
//
// With no --year every JEEMain_*.pdf in the folder is converted into one file.
//
// --strict exits non-zero if any paper fails to parse cleanly.
//
// WHICH SOURCE WINS
//
// The two families do not extract equally well. Some MathonGo papers lose every
// maths glyph — "A projectile is projected with velocity of at an angle" with
// all four options empty — because that PDF draws its maths as vector outlines
// and there is no text layer at all. ALLEN booklets are reliable throughout and
// additionally carry worked solutions, but only exist for some sittings.
//
// So ALLEN wins wherever it exists and MathonGo fills the rest.
//
// NOTHING IS DROPPED. Where a paper draws its maths, its match-the-column
// tables or its graph options as vector outlines, there is no text layer to
// recover and the extracted stem comes out incomplete. Those rows are still
// emitted — answer key, section, subject and every facet are correct — and are
// flagged `needsFigure` so the renderer shows the Drive-hosted scan of the
// original instead of the broken text. Same for questions the board marked
// bonus: they carry status "bonus" rather than being thrown away.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";

import { extractLines } from "./lib/pdfLayout.mjs";
import { wrapMath, splitBlocks } from "./lib/mathMarkup.mjs";
import { extractFigures } from "./lib/figures.mjs";
import { assignSectionsAndKeys } from "./lib/sectionKeys.mjs";
import { parseAllenSolution } from "./lib/parseAllenSolution.mjs";
import { parseMathonGoPaper } from "./lib/parseMathonGoPaper.mjs";
import { tagTopic } from "../src/lib/topicTagger.js";

/* ------------------------------- constants ------------------------------ */

const EXAM_CODE = "JEE_MAIN";
const EXAM_NAME = "JEE Main";
/** Paper 1. Paper 2A/2B (B.Arch/B.Planning) are not in this file set. */
const STREAM = "B.E./B.Tech";

/** JEE Main marking: +4 / -1 in BOTH sections. Section B gained negative
 *  marking in 2022 and has kept it since, so this holds for every year the
 *  script covers. */
const MARKS_CORRECT = 4;
const MARKS_INCORRECT = -1;

const SHIFT_TIMES = {
  1: { label: "Shift 1", time: "9:00 AM – 12:00 PM", slot: "Morning" },
  2: { label: "Shift 2", time: "3:00 PM – 6:00 PM", slot: "Evening" },
};

/**
 * How many questions a paper of this year holds, and how they are divided.
 *
 * Not a constant, because the board has changed it twice:
 *
 *   2020        25 per subject — 20 MCQ, then 5 numerical, all compulsory
 *   2021-2024   30 per subject — 20 MCQ, then 10 numerical of which any 5
 *               were to be attempted
 *   2025-       25 per subject — Section B cut back to 5, again compulsory
 *
 * It was hard-coded at 30, and everything downstream inherited that. For 2025
 * it meant the shape check failed on every file, and then the gap backfill
 * invented five questions per subject that the paper does not contain — 285
 * rows with no stem, no options, no key and no image, sitting in the bank
 * beside the real ones.
 *
 * The marks are unchanged: 300 either way, at +4/-1.
 */
function paperShape(year) {
  const perSubject = year >= 2025 || year <= 2020 ? 25 : 30;
  return { perSubject, mcq: 20, numerical: perSubject - 20, perPaper: perSubject * 3 };
}

/** Where a subject's questions start in the 1-N palette of the whole paper. */
const subjectOffset = (subject, shape) =>
  ({ Physics: 0, Chemistry: shape.perSubject, Mathematics: shape.perSubject * 2 })[subject];

/** The marker a stem too thin to read is rewritten with. */
const CITATION_STEM = "[Shown as an image]";

/**
 * The real extracted text, or "" when all that is left is the citation.
 *
 * Anything that decides whether a question can be published as text has to see
 * what was actually recovered from the paper, not the sentence that says
 * nothing was.
 */
function citationOnly(text) {
  const value = (text ?? "").trim();
  if (!value.startsWith(CITATION_STEM)) return value;
  // "…(Section A) — <the little that did extract>" keeps its tail.
  const tail = value.split(" — ").slice(1).join(" — ").trim();
  return tail;
}

const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const MONTH_FULL = {
  1: "January", 2: "February", 3: "March", 4: "April", 5: "May", 6: "June",
  7: "July", 8: "August", 9: "September", 10: "October", 11: "November", 12: "December",
};

const SOURCE_NOTES = {
  allen: "ALLEN Career Institute solution booklet for the NTA JEE Main paper. " +
    "Questions © NTA; worked solutions © ALLEN Career Institute. Supplied by the operator.",
  mathongo: "MathonGo 'JEE Main Previous Year Paper' compilation of the NTA JEE Main paper. " +
    "Questions © NTA. Supplied by the operator.",
};

/** Answers the boards voided. They have no correct option, so they cannot be
 *  practised — kept aside rather than imported with a made-up key. */
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
Convert JEE Main paper PDFs to the PYQ import format.

  --dir <path>    folder holding the PDFs
  --year <yyyy>   only this exam year (default: every year found)
  --out <path>    output JSON (default data/pyq/jee-main-<year>.json)
  --strict        exit non-zero if any paper fails to parse

Reads only local files. Nothing is downloaded.
`);
  process.exit(args.help ? 0 : 1);
}

const ONLY_YEAR = args.year && args.year !== true ? Number(args.year) : null;
const OUT =
  args.out && args.out !== true
    ? args.out
    : `data/pyq/jee-main-${ONLY_YEAR ?? "all"}.json`;

/* ----------------------------- file metadata ---------------------------- */

/** Pull session/date/shift/subject out of a filename. */
function describe(file) {
  const m = /^JEEMain_(\d{4})_Session(\d)_(\d{2})-([A-Za-z]{3})_Shift(\d)_(.+?)_(QuestionPaper|Solution)\.pdf$/i
    .exec(file);
  if (!m) return null;

  const [, year, session, day, mon, shift, subjectPart, kind] = m;
  const month = MONTHS[mon[0].toUpperCase() + mon.slice(1).toLowerCase()];
  if (!month) return null;

  const subject = { maths: "Mathematics", mathematics: "Mathematics", physics: "Physics", chemistry: "Chemistry" }[
    subjectPart.toLowerCase()
  ];
  // "AllSubjects" carries all three; a named subject carries only itself.
  if (kind.toLowerCase() === "solution" && !subject) return null;

  const iso = `${year}-${String(month).padStart(2, "0")}-${day}`;
  return {
    file,
    kind: kind.toLowerCase() === "solution" ? "allen" : "mathongo",
    year: Number(year),
    sessionNumber: Number(session),
    paperDate: iso,
    day: Number(day),
    month,
    shift: Number(shift),
    subject: subject ?? null,
  };
}

/** Everything the dashboard filters on, derived once per paper. */
function paperFacets(d) {
  const st = SHIFT_TIMES[d.shift];
  const dateLabel = `${d.day} ${Object.keys(MONTHS).find((k) => MONTHS[k] === d.month)} ${d.year}`;
  return {
    examCode: EXAM_CODE,
    examName: EXAM_NAME,
    stream: STREAM,
    year: d.year,
    sessionNumber: d.sessionNumber,
    sessionLabel: `Session ${d.sessionNumber} (${MONTH_FULL[d.month] ?? ""})`.trim(),
    paperDate: d.paperDate,
    dateLabel,
    shift: d.shift,
    shiftLabel: st.label,
    shiftTime: st.time,
    shiftSlot: st.slot,
    paperId: `jee-main-${d.year}-s${d.sessionNumber}-${d.paperDate}-shift${d.shift}`,
    // The free-text field importPyq already understands, so a row is readable
    // even without the structured columns.
    session: `Session ${d.sessionNumber} · ${dateLabel} · ${st.label}`,
  };
}

/* ------------------------------- helpers -------------------------------- */

const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Upsert key for a question — its position in the paper, never its text.
 *
 * src/lib/pyqImport.js hashes the question text, which is right for a feed of
 * loose questions where the same one may arrive from two sources. It is wrong
 * here, and expensively so: every improvement to the PDF extraction rewrites
 * the text, which rewrites the hash, so a re-import inserts 1980 NEW rows
 * beside the 1980 old ones instead of updating them. That happened once and
 * left the archive at 3711 rows with every paper showing ~170 questions.
 *
 * "JEE Main 2022, 27 June, shift 2, Chemistry, question 14" identifies a
 * question exactly and permanently. Two questions cannot share it, and no
 * amount of re-extraction changes it, so re-running this script is idempotent.
 */
const hashQuestion = (coords) =>
  crypto.createHash("sha256").update(`jee-main|${coords}`).digest("hex");

/** Normalise a printed key into what the schema stores. */
function normaliseAnswer(raw, { section, fromOptionNumber }) {
  const value = String(raw ?? "").trim();
  if (!value) return { answer: null, void: false };
  if (VOID_ANSWER.test(value)) return { answer: null, void: true, reason: value };

  if (section === "A") {
    // Read the FORM of the answer, do not assume it from the source.
    //
    // MathonGo prints the option's number and ALLEN was taken to print its
    // letter — true of the 2022 booklets, which label their options (A)-(D).
    // The 2023 booklets label them (1)-(4) and print "Official Ans. by NTA (1)"
    // to match. Told to expect a letter, this found none in "1" and returned
    // no answer; the caller then filed the question as BONUS, and because 2023
    // is mostly ALLEN that silently awarded full marks to every candidate on
    // 699 of the year's 2,160 questions.
    //
    // A single number 1-4 and a single letter A-D cannot be confused, so both
    // are simply accepted whichever source it came from.
    const digit = /^\(?\s*([1-4])\s*\)?$/.exec(value);
    if (digit) return { answer: "ABCD"[Number(digit[1]) - 1], void: false };
    const m = /\b([A-D])\b/.exec(value.toUpperCase());
    if (m) return { answer: m[1], void: false };
    if (fromOptionNumber) {
      const n = Number(value);
      return n >= 1 && n <= 4 ? { answer: "ABCD"[n - 1], void: false } : { answer: null, void: false };
    }
    return { answer: null, void: false };
  }

  // Section B is numerical.
  const num = value.match(/-?\d+(?:\.\d+)?/);
  return num ? { answer: num[0], void: false } : { answer: null, void: false };
}

/**
 * A worked solution that survived extraction as readable prose.
 *
 * ALLEN typesets derivations as stacked fractions and integral signs, which a
 * text layer cannot linearise — those come out as "= = = − − PV B P B V V v".
 * Flagging them lets the dashboard fall back to generating one on demand
 * instead of showing a student a wall of loose operators.
 */
function solutionQuality(text) {
  if (!text) return null;
  const letters = (text.match(/[a-zA-Z]/g) || []).length;
  const words = text.split(/\s+/).filter((w) => /^[a-zA-Z]{3,}$/.test(w)).length;
  if (text.length < 24) return "sparse";
  // Real prose keeps a decent share of letters and several whole words.
  return letters / text.length > 0.45 && words >= 6 ? "prose" : "symbolic";
}

/* -------------------------------- convert ------------------------------- */

/** Shape one parsed question into an output row. */
function toRow(q, facets, { subject, section, numberInSubject, paperNumber, answerRaw, fromOptionNumber, solution, allenAnswer, sourceFile, sourceKind }) {
  const { answer, void: isVoid, reason } = normaliseAnswer(answerRaw, { section, fromOptionNumber });
  // Type follows the question, not its position.
  //
  // A fill-in blank with no options is numerical however it is numbered — these
  // papers interleave the two — and calling it multiple choice put four empty
  // radio buttons under a question that has none, and scored a printed value
  // against an option letter.
  const looksNumerical =
    /_{3,}/.test(q.questionText || "") &&
    !Object.values(q.options || {}).some((o) => o && String(o).trim());
  const questionType = section === "B" || looksNumerical ? "numerical" : "mcq_single";
  // Stem first, options only as a fallback. Distractors are routinely written
  // from a NEIGHBOURING chapter — "wave number and Rydberg's constant" as a
  // wrong answer to a dimensions question — so folding them in at equal weight
  // pulls the score into a tie and the tagger, correctly, refuses to guess.
  // Judging the stem alone recovers those.
  //
  // The worked solution is the last resort, and it is what covers the
  // questions that are a picture. A stem printed as a circuit diagram or a
  // reaction scheme has no words for a keyword table to match, so it went
  // untagged and dropped out of every topic filter and every frequency count —
  // and those are disproportionately the questions a candidate most wants to
  // find by chapter. Its solution names the method in prose: "moment of
  // inertia about the axis", "esterification", "de Broglie wavelength".
  //
  // Weaker evidence than the stem, deliberately ranked below it: a solution
  // may reach for a technique that belongs to another chapter. Ranked above
  // nothing, which is what these rows had.
  const tagged =
    tagTopic(q.questionText, EXAM_CODE, subject) ??
    tagTopic(`${q.questionText} ${Object.values(q.options || {}).join(" ")}`, EXAM_CODE, subject) ??
    tagTopic(solution ?? "", EXAM_CODE, subject);

  return {
    ...facets,
    subject,
    subjectId: slug(subject),
    topic: tagged?.topic ?? null,
    chapter: tagged?.topic ?? null,
    chapterId: tagged ? slug(tagged.topic) : null,
    topicConfidence: tagged?.score ?? null,
    topicRunnerUp: tagged?.runnerUp ?? null,

    section,
    sectionLabel: section === "A" ? "Section A (MCQ)" : "Section B (Numerical)",
    questionNumber: numberInSubject,
    paperQuestionNumber: paperNumber,

    // Delimited so KaTeX renders the notation the extractor recovered. Bare
    // "\frac{14}{15}" would otherwise reach the page as those literal
    // characters.
    questionText: splitBlocks(wrapMath(q.questionText)),
    optionA: wrapMath(q.options?.A ?? null),
    optionB: wrapMath(q.options?.B ?? null),
    optionC: wrapMath(q.options?.C ?? null),
    optionD: wrapMath(q.options?.D ?? null),
    correctAnswer: answer,
    questionType,
    marksCorrect: MARKS_CORRECT,
    marksIncorrect: MARKS_INCORRECT,

    solution: wrapMath(solution) || null,
    solutionQuality: solutionQuality(solution),
    solutionModel: solution ? "imported" : null,
    // Recorded, not resolved: where ALLEN disagreed with the NTA key the NTA key
    // stands, but a candidate reviewing the question should be able to see that
    // the answer was contested.
    answerNote:
      allenAnswer && answer && allenAnswer.toUpperCase() !== String(answer).toUpperCase()
        ? `ALLEN's key for this question was "${allenAnswer}"; the NTA key is used here.`
        : null,

    status: isVoid ? "bonus" : "ok",
    voidReason: isVoid ? reason : null,
    // Set by the figure-flagging pass below. `figureHint` is what
    // src/lib/driveDiagrams.js searches Drive for; diagramImage stays null here
    // and is filled at import time once the scan is found.
    needsFigure: false,
    figureHint: null,
    // Base name for this question's crops; the figure pass appends _Q, _A.._D
    // and _S. Deterministic so a re-run overwrites rather than accumulates.
    figureBase:
      `JEEMain_${facets.year}_S${facets.sessionNumber}_${facets.paperDate}_Shift${facets.shift}_` +
      `${subject}_Q${String(numberInSubject).padStart(2, "0")}`,
    questionImage: null,
    optionAImage: null,
    optionBImage: null,
    optionCImage: null,
    optionDImage: null,
    solutionImage: null,
    diagramImage: null,
    diagramSource: null,
    // Filled by the figure pass — see lib/regionInk.mjs. Whether the crop IS
    // the question or is a spare copy of it, and what kind of content decided
    // that. Defaulted to "needs the picture" so a question the figure pass
    // never reached is never published as text nobody checked.
    questionNeedsImage: true,
    questionContentKind: "unreadable",
    solutionNeedsImage: true,
    solutionContentKind: "unreadable",
    languages: ["en"],

    sourceUrl: sourceFile,
    sourceNote: SOURCE_NOTES[sourceKind],
    // Section is deliberately NOT part of the key. It is a derived property —
    // reclassifying a question from A to B is exactly what the interleaving fix
    // does — and putting it in the key made every reclassified question hash to
    // a new row instead of updating the old one. Paper, subject and
    // within-subject number already identify a question uniquely and never
    // change.
    questionHash: hashQuestion(`${facets.paperId}|${subject}|${numberInSubject}`),
  };
}

async function readPdf(dir, file) {
  return extractLines(fs.readFileSync(path.join(dir, file)));
}

async function main() {
  const dir = args.dir;
  const yearPattern = ONLY_YEAR ? String(ONLY_YEAR) : "\\d{4}";
  const files = fs
    .readdirSync(dir)
    .filter((f) => new RegExp(`^JEEMain_${yearPattern}_.*\\.pdf$`, "i").test(f))
    .sort();

  const described = files.map(describe);
  const usable = described.filter(Boolean);
  const skipped = files.filter((f, i) => !described[i]);

  console.log(
    `Found ${files.length} JEE Main ${ONLY_YEAR ?? "(all years)"} PDFs — ` +
      `${usable.length} recognised, ${skipped.length} skipped.`
  );
  for (const s of skipped) console.log(`  · skipped (not a dated shift paper): ${s}`);

  // ALLEN wins where it exists, so index it first and let MathonGo fill gaps.
  const allenBySlot = new Map();
  for (const d of usable.filter((x) => x.kind === "allen")) {
    allenBySlot.set(`${d.paperDate}|${d.shift}|${d.subject}`, d);
  }

  const rows = [];
  const voided = [];
  const problems = [];
  /** paperId|paperQuestionNumber → printed key, so a backfilled row still
   *  carries the right answer even though its stem could not be read. */
  const mathonGoKeys = new Map();

  const note = (row) => rows.push(row);

  /** Fold rows into one manifest entry per shift, for the dashboard's filters. */
  const buildManifest = (list) => {
    const papers = new Map();
    for (const row of list) {
      if (!papers.has(row.paperId)) {
        papers.set(row.paperId, {
          paperId: row.paperId, examCode: row.examCode, examName: row.examName, stream: row.stream,
          year: row.year, sessionNumber: row.sessionNumber, sessionLabel: row.sessionLabel,
          paperDate: row.paperDate, dateLabel: row.dateLabel, shift: row.shift,
          shiftLabel: row.shiftLabel, shiftTime: row.shiftTime,
          // What the NTA player needs to run this paper as a live mock.
          durationMinutes: 180,
          marksCorrect: MARKS_CORRECT,
          marksIncorrect: MARKS_INCORRECT,
          totalMarks: 300,
          languages: ["en"],
          subjects: {}, questionCount: 0, needsFigureCount: 0,
        });
      }
      const p = papers.get(row.paperId);
      p.subjects[row.subject] = (p.subjects[row.subject] || 0) + 1;
      p.questionCount++;
      if (row.needsFigure) p.needsFigureCount++;
    }
    return [...papers.values()].sort(
      (a, b) => a.paperDate.localeCompare(b.paperDate) || a.shift - b.shift
    );
  };

  /* --------------------------- ALLEN booklets --------------------------- */

  for (const d of usable.filter((x) => x.kind === "allen")) {
    const parsed = parseAllenSolution(await readPdf(dir, d.file));
    const shape = paperShape(d.year);
    if (parsed.length !== shape.perSubject) {
      problems.push(`${d.file}: parsed ${parsed.length} questions, expected ${shape.perSubject}`);
    }

    // MORE questions than the paper holds means the segmentation slipped, and
    // everything after the slip is attributed to the wrong question — stems
    // that begin mid-solution ("Conceptual Ans. (4) 32. The amount of work
    // done..."), and, worse, answer keys belonging to a neighbour. A wrong key
    // is not a degraded question, it is a question that teaches the wrong
    // answer, so this file's text is not used at all.
    //
    // Nothing is lost that was right: the figure pass reads the page geometry
    // rather than this segmentation, so its crops are unaffected, and the gap
    // backfill below turns the whole subject into figure-only rows. The
    // candidate sees the real question and is not told a false key.
    //
    // Too FEW is the opposite case and is kept: those questions are correct as
    // far as they go, and the ones that did not parse get backfilled the same
    // way.
    if (parsed.length > shape.perSubject) {
      problems.push(
        `${d.file}: segmentation slipped (${parsed.length} > ${shape.perSubject}) — ` +
          `text and keys from this file are discarded; its questions become figure-only`
      );
      continue;
    }

    const facets = paperFacets(d);
    for (const q of parsed) {
      const row = toRow(q, facets, {
        subject: d.subject,
        section: q.section,
        numberInSubject: q.section === "A" ? q.number : 20 + q.number,
        paperNumber: null,
        answerRaw: q.officialAnswer,
        fromOptionNumber: false,
        solution: q.solution,
        allenAnswer: q.allenAnswer,
        sourceFile: d.file,
        sourceKind: "allen",
      });
      // Bonus/dropped questions are kept too — NTA awarded marks to everyone,
      // so they belong in the paper even though they have no single key.
      //
      // "needs_review" is excluded, and the omission here was expensive. It
      // also has no key, but for the opposite reason: bonus means the board
      // awarded the marks to everybody, needs_review means we could not work
      // out what the answer was. The MathonGo branch below has always drawn
      // that line; this one did not, and because the 2023 papers are mostly
      // ALLEN booklets, 699 of that year's 2,160 questions were stored as
      // bonus — a third of the paper scoring full marks for every candidate
      // no matter what they answered.
      if (row.status !== "needs_review" && (row.status === "void" || !row.correctAnswer)) {
        row.status = "bonus";
        voided.push(row);
      }
      note(row);
    }
  }

  /* ------------------------- MathonGo compilations ---------------------- */

  for (const d of usable.filter((x) => x.kind === "mathongo")) {
    const { questions, key } = parseMathonGoPaper(await readPdf(dir, d.file));
    const shape = paperShape(d.year);
    if (questions.length !== shape.perPaper) {
      problems.push(`${d.file}: parsed ${questions.length} questions, expected ${shape.perPaper}`);
    }
    if (key.size !== shape.perPaper) {
      problems.push(`${d.file}: answer key has ${key.size} entries, expected ${shape.perPaper}`);
    }

    const facets = paperFacets(d);
    for (const [n, value] of key) mathonGoKeys.set(`${facets.paperId}|${n}`, value);

    // Match each question to its real key slot before building any rows.
    //
    // These files print the exam's 20 MCQs and 10 numericals interleaved, while
    // the answer key keeps the exam's own order, so reading key[q.number] hands
    // a numerical question an option number. See lib/sectionKeys.mjs.
    const keyed = new Map();
    const blocks = ["Physics", "Chemistry", "Mathematics"].map((subject) => {
      const base = subjectOffset(subject, shape);
      return [base, base + 1, base + shape.perSubject];
    });
    for (const [base, lo, hi] of blocks) {
      const found = new Map(questions.filter((q) => q.number >= lo && q.number <= hi).map((q) => [q.number, q]));
      if (!found.size) continue;

      // Assign over the subject's FULL span, filling the gaps with
      // placeholders.
      //
      // A question whose number is drawn rather than typeset is absent here but
      // gets backfilled further down, so the subject really does have its full
      // count. Assigning over only the ones that parsed made the count 26
      // rather than 30, the shape check failed, and the whole subject lost its
      // keys — even though the placeholders are exactly what the MCQ-and-
      // numerical constraint needs to resolve the rest.
      const block = [];
      for (let n = lo; n <= hi; n++) {
        block.push(found.get(n) ?? { number: n, questionText: "", options: null, placeholder: true });
      }

      const { assigned, interleaved, trustworthy, mcqCount, numCount } = assignSectionsAndKeys(block, base, key, shape);
      if (interleaved && !trustworthy) {
        problems.push(
          `${d.file}: ${block[0].subject} interleaves numericals and its shape could not be ` +
            `reproduced (${mcqCount} MCQ + ${numCount} numerical of ${block.length}, expected ` +
            `${shape.mcq} + ${shape.numerical}) — keys that cannot be matched are dropped rather than guessed`
        );
      }
      for (const a of assigned) keyed.set(a.number, a);
    }

    for (const q of questions) {
      const slotKey = `${d.paperDate}|${d.shift}|${q.subject}`;
      if (allenBySlot.has(slotKey)) continue; // ALLEN already covered this subject.

      const k = keyed.get(q.number);
      const row = toRow(q, facets, {
        subject: q.subject,
        section: k?.section ?? q.section,
        numberInSubject: k?.numberInSubject ?? ((q.number - 1) % shape.perSubject) + 1,
        paperNumber: q.number,
        answerRaw: k ? k.answerRaw : key.get(q.number),
        fromOptionNumber: k ? k.fromOptionNumber : true,
        solution: null,
        allenAnswer: null,
        sourceFile: d.file,
        sourceKind: "mathongo",
      });

      if (k?.keyUnreliable) {
        row.status = "needs_review";
        row.answerNote =
          "This paper prints its numerical questions among the multiple-choice ones while its " +
          "answer key keeps the exam's order, and too little of the subject survived extraction " +
          "to match them up. The printed key for this position is an option number, which is not " +
          "this question's answer, so no key is shown rather than a wrong one.";
      }
      // Bonus/dropped questions are kept too — NTA awarded marks to everyone,
      // so they belong in the paper even though they have no single key.
      //
      // "needs_review" is excluded: it also has no key, but for the opposite
      // reason. Bonus means the board awarded the marks to everybody; this
      // means we could not work out what the answer was. Collapsing the two
      // would score an unknown question as full marks for every candidate.
      if (row.status !== "needs_review" && (row.status === "void" || !row.correctAnswer)) {
        row.status = "bonus";
        voided.push(row);
      }
      note(row);
    }
  }

  /* ---------------------------- gap backfill ----------------------------- */

  // A paper is a fixed number of questions and every subject the same share of
  // them — see paperShape. Where a question's number is itself drawn rather
  // than typeset there is no "Q56." in the text layer to find, and it would
  // simply be absent — leaving a hole in the palette and a paper that scores
  // out of less than 300.
  //
  // The answer key still has them all, and the paper's shape is known, so the
  // missing entries are reconstructed as figure-only rows. The candidate sees
  // the scan; the paper stays whole. Consistent with the rest of this script:
  // nothing is dropped, incomplete things are marked.
  const bySlot = new Map();
  for (const r of rows) bySlot.set(`${r.paperId}|${r.subject}|${r.questionNumber}`, r);

  for (const d of usable) {
    const facets = paperFacets(d);
    const subjects = d.kind === "allen" ? [d.subject] : ["Physics", "Chemistry", "Mathematics"];
    const shape = paperShape(d.year);

    for (const subject of subjects) {
      const offset = subjectOffset(subject, shape);
      for (let n = 1; n <= shape.perSubject; n++) {
        const key = `${facets.paperId}|${subject}|${n}`;
        if (bySlot.has(key)) continue;
        // An ALLEN booklet covers one subject; a MathonGo paper covers all
        // three, so only fill a slot the file in hand was responsible for.
        if (d.kind === "mathongo" && allenBySlot.has(`${d.paperDate}|${d.shift}|${subject}`)) continue;

        const section = n <= 20 ? "A" : "B";
        const row = toRow(
          { questionText: "", options: null },
          facets,
          {
            subject,
            section,
            numberInSubject: n,
            paperNumber: offset + n,
            answerRaw: mathonGoKeys.get(`${facets.paperId}|${offset + n}`) ?? null,
            fromOptionNumber: d.kind === "mathongo",
            solution: null,
            allenAnswer: null,
            sourceFile: d.file,
            sourceKind: d.kind,
          }
        );
        rows.push(row);
        bySlot.set(key, row);
      }
    }
  }

  /* -------------------------- palette numbering -------------------------- */

  // The NTA player's question palette runs across the whole paper, not within
  // a subject. MathonGo's compilations already number that way; ALLEN's
  // booklets are one file per subject and only know their own 1-N. Derive it
  // for everything from the fixed section order so the palette is consistent
  // no matter which source a question came from — and from the year's own
  // shape, so a 2025 paper's Chemistry starts at 26 rather than at 31.
  for (const r of rows) {
    if (r.paperQuestionNumber == null) {
      r.paperQuestionNumber = subjectOffset(r.subject, paperShape(r.year)) + r.questionNumber;
    }
  }

  /* ---------------------------- figure flagging -------------------------- */

  // Nothing is dropped. Some of the source PDFs draw their maths, match-the-
  // column tables and graph options as vector outlines rather than text, so
  // those parts have no text layer to extract — the stem arrives incomplete
  // ("projected with a speed at an angle") and the options come out blank.
  //
  // The question, its answer key and every facet are still correct, so the row
  // is kept and marked instead: `needsFigure` tells the renderer to show the
  // Drive-hosted scan of the original, which src/lib/driveDiagrams.js already
  // knows how to fetch. `figureHint` is the search term it looks up.
  let needsFigureCount = 0;
  for (const r of rows) {
    // ANY blank option, not just all four. A candidate cannot pick an option
    // that renders as nothing, so a partly-extracted set is exactly as
    // unanswerable as an empty one and needs the same scan.
    const optionsIncomplete =
      r.questionType === "mcq_single" &&
      ![r.optionA, r.optionB, r.optionC, r.optionD].every((o) => o && o.trim());
    // A stem that lost its symbols reads as prose with the quantities missing.
    const stemThin = r.questionText.replace(/\s+/g, " ").trim().length < 40;

    if (optionsIncomplete || stemThin) {
      r.needsFigure = true;
      r.status = r.status === "ok" ? "needs_figure" : r.status;
      r.figureHint = `JEE Main ${r.year} ${r.dateLabel} ${r.shiftLabel} ${r.subject} Q${r.questionNumber}`;
      needsFigureCount++;

      // A handful are pure notation — "Let [matrix]. Then [expression]" — and
      // reduce to two or three words. Cite the paper in the stem so the row is
      // still identifiable in a list, a search result and the import's own
      // minimum-length check, all of which see text and not the figure.
      // questionHash was already computed from the paper coordinates for rows
      // this thin, so rewriting the stem cannot move the upsert key.
      if (r.questionText.replace(/\s+/g, " ").trim().length < 25) {
        r.questionText =
          `${CITATION_STEM} ${r.examName} ${r.year} · ${r.dateLabel} ${r.shiftLabel} · ` +
          `${r.subject} Q${r.questionNumber} (Section ${r.section})` +
          (r.questionText.trim() ? ` — ${r.questionText.trim()}` : "");
      }
    }
  }

  /* ---------------------------- figure cutting --------------------------- */

  // Cut each flagged question out of its own source page. The pixels are there
  // even when the text layer is not — the page renders perfectly — so the
  // question is served as an image of the original rather than as the broken
  // prose the extractor could recover.
  const figDir =
    args.figures && args.figures !== true
      ? args.figures
      : path.join(path.dirname(OUT), `figures-${ONLY_YEAR ?? "all"}`);

  let figuresWritten = 0;
  let figuresLost = 0;

  if (!args["no-figures"]) {
    // EVERY question, not only the ones whose text failed. The image is the
    // authoritative rendering of what the candidate actually saw, and the
    // extracted text — however good — is a transcription of it.
    const bySource = new Map();
    for (const r of rows) {
      if (!r.sourceUrl) continue;
      if (!bySource.has(r.sourceUrl)) bySource.set(r.sourceUrl, []);
      bySource.get(r.sourceUrl).push(r);
    }

    /** Where the printed number of a row sits in its source file. */
    const printedOf = (r, kind) =>
      kind === "mathongo" ? r.paperQuestionNumber : r.questionNumber - (r.section === "B" ? 20 : 0);

    for (const [file, group] of bySource) {
      const d = usable.find((x) => x.file === file);
      if (!d) continue;
      try {
        const { written, missing, parts } = extractFigures({
          pdfPath: path.join(dir, file),
          outDir: figDir,
          mode: d.kind,
          // NOT fullWidth. That cuts at the SHEET's edges, which is right for
          // JEE Advanced's single-column A4 and wrong here: ALLEN sets these
          // booklets two-up, so a full-width crop of question 51 carried the
          // whole of question 54 from the right-hand column with it. The
          // column bounds are what keep a question to its own half of the page.
          wanted: group.map((r) => ({
            // MathonGo numbers 1-90 across the paper; ALLEN restarts at each
            // section, so Section B's "7." is the SECOND time 7 appears.
            printedNumber: printedOf(r, d.kind),
            occurrence: d.kind === "allen" && r.section === "B" ? 2 : 1,
            // Where the question sits in its SUBJECT. The figure pass needs
            // this because ALLEN's per-subject booklets do not all number the
            // same way: 2022's restart at each section, 2023's run 61-90, and
            // 2025's run 26-50 for Physics and 51-75 for Chemistry. It reads
            // the base off the page and counts from there; `printedNumber`
            // above stays as the fallback.
            //
            // ALLEN only. A MathonGo file is the WHOLE paper, numbered 1-90
            // straight through, so its printed number is already the absolute
            // one and there is no subject numbering to reconcile — but this
            // was sent for those files too, and a subject base of 1 made
            // "Chemistry question 1" resolve to printed question 1, which is
            // Physics. Every Chemistry and Mathematics crop in every MathonGo
            // paper was a picture of the Physics question with the same
            // position: 2023's Maths Q1 was published showing "Q1. hello dummy
            // text", the placeholder that paper opens with. Physics was right,
            // which is exactly why it went unnoticed.
            subjectNumber: d.kind === "allen" ? r.questionNumber : undefined,
            baseName: r.figureBase,
            // A numerical question prints no options; looking for markers in
            // its stem would cut it in half at a stray "(1)".
            // One picture per question, with its choices inside it.
            //
            // This used to cut a stem and four separate option crops so the
            // choices could sit beside radio buttons. That was the right shape
            // when the picture was the ONLY form a question had. It is not any
            // more: a question whose text extracted cleanly now renders as
            // text, with its options as text, and the picture is only reached
            // when the meaning is in the drawing — and there, splitting is
            // what breaks it. A choice cut at the column edge, a stem stopping
            // above options no crop captured, four page-wide bands with a
            // formula in one corner: every one of those came from splitting a
            // question the paper had already laid out as one block.
            //
            // So the paper's own layout is kept, which is what the GATE and
            // JEE Advanced converters already do. It also means a question is
            // one file instead of six.
            wantOptions: false,
            // Only the solution booklets print one.
            wantSolution: d.kind === "allen",
            // What was extracted for this question, so the figure pass can
            // judge "needs to be a picture" on the text as well as the ink: a
            // region that drew nothing but whose text came out empty needs the
            // picture just as much as one holding a graph.
            //
            // The citation stem is not text for this purpose. Rows too thin to
            // read have already had "[Shown as an image] JEE Main 2025 · ..."
            // written over them so they are identifiable in a list, and that
            // is sixty characters of paper coordinates saying nothing about
            // the question. Counting it marked 172 questions as publishable
            // text whose text is the sentence announcing they have none.
            stemText: citationOnly(r.questionText),
            solutionText: r.solution ?? "",
          })),
        });
        figuresWritten += written;

        const lost = new Set(missing);
        for (const r of group) {
          // By figureBase, not by printed number. ALLEN restarts its numbering
          // at each section, so Section A question 7 and Section B question 7
          // are both "7" — and keying on that handed ten questions per subject
          // a picture of a different question.
          if (lost.has(r.figureBase)) {
            figuresLost++;
            continue;
          }
          const p = parts.get(r.figureBase);
          if (!p) continue;
          r.questionImage = p.stem ?? null;
          r.optionAImage = p.options?.A ?? null;
          r.optionBImage = p.options?.B ?? null;
          r.optionCImage = p.options?.C ?? null;
          r.optionDImage = p.options?.D ?? null;
          r.solutionImage = p.solution ?? null;

          // Whether the picture is the question or merely a copy of it.
          //
          // The crop is cut and kept either way; this says which one the app
          // should LEAD with. "figure"/"image" mean the meaning is in the
          // drawing — a graph, a structure, a circuit — and the text alone
          // would not be answerable. "text"/"table" mean the extracted text is
          // the question and should be published as text: selectable,
          // searchable, readable aloud, and able to reflow on a phone.
          // "unreadable" is the fallback that was previously assumed for
          // everything.
          if (p.question) {
            r.questionNeedsImage = p.question.needsImage;
            r.questionContentKind = p.question.category;
          }
          if (p.solutionInk) {
            r.solutionNeedsImage = p.solutionInk.needsImage;
            r.solutionContentKind = p.solutionInk.category;
          }
        }
      } catch (e) {
        problems.push(`${file}: figure pass failed — ${e.message}`);
        for (const r of group) figuresLost++;
      }
    }
  }

  /* --------------------------------- out -------------------------------- */

  rows.sort(
    (a, b) =>
      a.paperDate.localeCompare(b.paperDate) ||
      a.shift - b.shift ||
      ["Physics", "Chemistry", "Mathematics"].indexOf(a.subject) -
        ["Physics", "Chemistry", "Mathematics"].indexOf(b.subject) ||
      a.questionNumber - b.questionNumber
  );

  // A question repeated across shifts would collide on the import's upsert key,
  // so collapse it here and report it rather than let the count mislead.
  const seen = new Set();
  const unique = rows.filter((r) => (seen.has(r.questionHash) ? false : seen.add(r.questionHash)));
  const dupes = rows.length - unique.length;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(unique, null, 2));

  const manifestPath = OUT.replace(/\.json$/, "-papers.json");
  const manifest = buildManifest(unique);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // A worklist, not a quarantine: every one of these rows is also in the main
  // file. This is just the shopping list of scans to put in the Drive folder.
  if (needsFigureCount) {
    const figPath = OUT.replace(/\.json$/, "-needs-figures.json");
    const list = unique
      .filter((r) => r.needsFigure)
      .map((r) => ({
        questionHash: r.questionHash, paperId: r.paperId, dateLabel: r.dateLabel,
        shiftLabel: r.shiftLabel, subject: r.subject, questionNumber: r.questionNumber,
        section: r.section, figureHint: r.figureHint, sourceUrl: r.sourceUrl,
        questionText: r.questionText, correctAnswer: r.correctAnswer,
      }));
    fs.writeFileSync(figPath, JSON.stringify(list, null, 2));
    console.log(
      `\n${needsFigureCount} question(s) need the Drive scan — their PDF draws the maths,\n` +
        `  match-the-column tables or graph options as vector outlines, so there is no text\n` +
        `  to extract. They ARE in the main file with answer key and facets intact and are\n` +
        `  flagged needsFigure. Worklist: ${figPath}`
    );
  }

  if (voided.length) {
    console.log(
      `${voided.length} question(s) were bonus/dropped by the board — kept, with status "bonus".`
    );
  }

  /* ------------------------------- report ------------------------------- */

  const by = (fn) => unique.reduce((a, r) => ((a[fn(r)] = (a[fn(r)] || 0) + 1), a), {});
  const tagged = unique.filter((r) => r.topic).length;
  const withSolution = unique.filter((r) => r.solution).length;
  const prose = unique.filter((r) => r.solutionQuality === "prose").length;

  console.log(`\n✔ ${unique.length} questions → ${OUT}`);
  console.log(
    `✔ ${figuresWritten} figure(s) cut → ${figDir}` +
      (figuresLost ? ` (${figuresLost} could not be located on the page)` : "")
  );
  console.log(`✔ ${manifest.length} papers → ${manifestPath}`);
  if (dupes) console.log(`  (${dupes} duplicate question text collapsed)`);
  console.log("\nBy subject:", by((r) => r.subject));
  console.log("By session:", by((r) => r.sessionLabel));
  console.log("By type:   ", by((r) => r.questionType));
  console.log(
    `\nTopic tagged: ${tagged}/${unique.length} (${Math.round((tagged / unique.length) * 100)}%)` +
      `\nWith solution: ${withSolution} (${prose} readable prose, ${withSolution - prose} symbolic)`
  );

  if (problems.length) {
    console.log(`\n⚠ ${problems.length} issue(s):`);
    for (const p of problems.slice(0, 25)) console.log(`  · ${p}`);
    if (problems.length > 25) console.log(`  · ...and ${problems.length - 25} more`);
  }

  // Which of the 22 shifts × 3 subjects the file set could not supply.
  const expectedSubjects = ["Physics", "Chemistry", "Mathematics"];
  const gaps = [];
  for (const p of manifest) {
    for (const s of expectedSubjects) {
      if (!p.subjects[s]) gaps.push(`${p.dateLabel} ${p.shiftLabel} — ${s}`);
    }
  }
  if (gaps.length) {
    console.log(`\n⚠ ${gaps.length} subject-paper(s) missing from the source PDFs:`);
    for (const g of gaps) console.log(`  · ${g}`);
  }

  if (args.strict && (problems.length || gaps.length)) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
