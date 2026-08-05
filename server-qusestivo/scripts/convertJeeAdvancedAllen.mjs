#!/usr/bin/env node
// Convert the ALLEN JEE Advanced booklets into the PYQ import format, with the
// question, each option and the solution cut out as separate images.
//
// Named ...Allen to sit beside the existing convertJeeAdvanced.mjs, which reads
// a different dataset. Both write JEE_ADVANCED rows, so reconcile before
// importing — questionHash is the upsert key and a collision overwrites.
//
// ─────────────────────────────────────────────────────────────────────────
// PROVENANCE
//
// JEE Advanced papers are the copyright of the IITs; the booklets are ALLEN's
// republication of them and the worked solutions are ALLEN's own. Neither is
// licensed to Questivo. Only local files the operator already holds are read,
// and every row records the exact PDF it came from.
// ─────────────────────────────────────────────────────────────────────────
//
// WHY ADVANCED CANNOT REUSE THE MAIN CONVERTER
//
//   * Marking is PER SECTION, not per paper, and is stated in prose:
//     "ONLY ONE of these four options is the correct answer" (+3/-1),
//     "ONE OR MORE THAN ONE ... is(are) correct" (+4/-2, partial credit),
//     "the answer is a NUMERICAL VALUE". Assuming Main's flat +4/-1 would
//     score every Advanced paper wrong, so each section's block is read.
//   * A numerical question must never be typed as an MCQ. Type comes from the
//     section's own declaration, never from whether options happened to parse.
//   * 2023 is SPLIT: _Paper.pdf carries the stems and options, _Solution.pdf
//     carries only "1. Ans. (A,C,D)" + "Sol. ...". Either file alone is half a
//     paper, so questions are keyed on (year, paper, subject, number) and the
//     two halves are merged.
//
// Usage:
//   node scripts/convertJeeAdvancedAllen.mjs --dir "<folder of PDFs>" \
//        --out data/pyq/jee-advanced-allen.json \
//        --figures ../questivo/public/pyq-figures/jee-advanced \
//        --base https://raw.githubusercontent.com/ajaykumarsaini231/Questivo/refs/heads/main/pyq-figures/jee-advanced

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";

import { extractLines } from "./lib/pdfLayout.mjs";
import { extractFigures } from "./lib/figures.mjs";

/* ------------------------------- constants ------------------------------ */

const EXAM_CODE = "JEE_ADVANCED";
const EXAM_NAME = "JEE Advanced";
const STREAM = "B.E./B.Tech";

const SOURCE_NOTE =
  "ALLEN Career Institute booklet for the JEE (Advanced) paper. " +
  "Questions © IITs; worked solutions © ALLEN Career Institute. Supplied by the operator.";

/* --------------------------------- CLI ---------------------------------- */

const args = (() => {
  const a = {};
  const v = process.argv.slice(2);
  for (let i = 0; i < v.length; i++) {
    if (!v[i].startsWith("--")) continue;
    const k = v[i].slice(2);
    a[k] = !v[i + 1] || v[i + 1].startsWith("--") ? true : v[++i];
  }
  return a;
})();

if (args.help || !args.dir || args.dir === true) {
  console.log(`
Convert ALLEN JEE Advanced booklets to the PYQ import format.

  --dir <path>      folder holding the JEEAdv_*.pdf files
  --out <path>      output JSON            (default data/pyq/jee-advanced-allen.json)
  --figures <path>  where to write crops   (default ../questivo/public/pyq-figures/jee-advanced)
  --base <url>      URL prefix stored in the DB for those crops
  --no-figures      parse only, cut no images
`);
  process.exit(args.help ? 0 : 1);
}

const OUT = args.out && args.out !== true ? args.out : "data/pyq/jee-advanced-allen.json";
const FIG_DIR = args.figures && args.figures !== true
  ? args.figures
  : path.resolve("../questivo/public/pyq-figures/jee-advanced");
const BASE = (args.base && args.base !== true ? String(args.base) : "").replace(/\/$/, "");

/* ----------------------------- file metadata ---------------------------- */

const SUBJ = { physics: "Physics", chemistry: "Chemistry", maths: "Maths", mathematics: "Maths" };

/**
 * The token used in filenames → the subject name the archive stores.
 *
 * Kept apart deliberately. "Maths" is baked into every crop already committed
 * and served, and renaming 300-odd files to fix a label would break every URL
 * in the database for the sake of a word.
 */
const SUBJECT_NAME = { Maths: "Mathematics" };

function describe(file) {
  // JEEAdv_2023_Paper1_04-Jun_Physics_Solution.pdf
  const m = /^JEEAdv_(\d{4})_Paper([12X])_(?:(\d{2})-([A-Za-z]{3})_)?(.+?)_(Solution|Paper|AnswerKey)(?:_v\d+)?\.pdf$/i.exec(file);
  if (!m) return null;
  const [, year, paper, day, mon, subjRaw, kind] = m;
  const subject = SUBJ[subjRaw.toLowerCase()] ?? null;
  if (!subject) return null;                     // AllSubjects answer-key grids
  if (paper === "X") return null;                // paper number never resolved
  return {
    file, year: Number(year), paper: Number(paper), subject,
    day: day || null, mon: mon || null,
    kind: kind.toLowerCase() === "paper" ? "questions" : "solutions",
  };
}

/* --------------------------- section semantics -------------------------- */

/**
 * What a section's instruction block declares.
 *
 * Read, never assumed: Advanced changes its marking scheme between sections and
 * between years, and the block is the only statement of it in the document.
 */
function readSection(lines) {
  const t = lines.join(" ").replace(/\s+/g, " ");
  const T = t.toUpperCase();

  let type = "mcq_single";
  if (/NUMERICAL\s+VALUE|NON[- ]?NEGATIVE\s+INTEGER|ROUNDED\s+OFF\s+TO/i.test(t)) type = "numerical";
  else if (/ONE\s+OR\s+MORE\s+THAN\s+ONE/i.test(t)) type = "mcq_multiple";
  else if (/MATCHING\s+LIST|LIST\s*-\s*I\b/i.test(t)) type = "mcq_single";
  else if (/ONLY\s+ONE\s+OF\s+THESE/i.test(t)) type = "mcq_single";

  const full = t.match(/Full\s*Marks\s*:?\s*\+?\s*(\d+)/i);
  const neg = t.match(/Negative\s*Marks\s*:?\s*[−–-]\s*(\d+)/i);
  const maxMark = T.match(/MAXIMUM\s+MARKS\s*:?\s*(\d+)/);

  return {
    questionType: type,
    marksCorrect: full ? Number(full[1]) : type === "numerical" ? 4 : 3,
    marksIncorrect: neg ? -Number(neg[1]) : 0,
    partial: /Partial\s*Marks/i.test(t),
    sectionMaxMarks: maxMark ? Number(maxMark[1]) : null,
  };
}

/* ------------------------------- parsing -------------------------------- */

/**
 * Every printed answer in a booklet, keyed by the number beside it.
 *
 * A second, structure-free pass over the same lines, and the reason it exists
 * is that the first one keeps losing keys to accidents of extraction rather
 * than to anything about the paper. In 2023's Paper 1 Chemistry solutions all
 * seventeen answers are present and legible, and the block parser recovered
 * ten: question 4's line doubles as the SECTION-2 heading, so it is consumed
 * as a section boundary; question 8's arrives as "Sol.8. Ans. (222)", which no
 * anchor pattern starting at a digit can match.
 *
 * Reading the answers on their own owes nothing to sections, to question
 * blocks, or to the numbering running unbroken. It only fills what the block
 * parser could not, so a key it did find always wins.
 */
function answerIndex(lines) {
  // A number, optionally with the "Sol." that the extractor sometimes welds
  // between it and its answer, then "Ans" and the value in brackets.
  const PATTERNS = [
    // "12. Ans. (B)", and the "4 Sol. . Ans. (C)" the extractor sometimes makes
    /(?:^|[\s.])(\d{1,2})\s*\.?\s*(?:Sol\s*\.?\s*\.?\s*)?Ans\s*\.?\s*[:(]\s*([^)]{1,40}?)\s*\)/gi,
    // "6Sol.. [C] is correctAns. (A,B) f(x)= ..." — the number, then working,
    // then the answer, all welded into one line. Anchored at the START of the
    // line and confined to it, so it can never reach across two questions.
    /^(\d{1,2})\s*Sol\b[^)]{0,120}?Ans\s*\.?\s*[:(]\s*([^)]{1,40}?)\s*\)/gi,
  ];
  const map = new Map();
  for (const line of lines) {
    for (const RE of PATTERNS) {
      RE.lastIndex = 0;
      let m;
      while ((m = RE.exec(line)) !== null) {
        const n = Number(m[1]);
        // These papers run to at most twenty questions a subject. A bigger
        // number is arithmetic inside somebody's working.
        if (n < 1 || n > MAX_QUESTION_NUMBER) continue;
        const value = m[2].trim();
        // Only a value that IS an answer. The looser pattern above reaches
        // through a worked solution to get there, and what it brings back is
        // sometimes wreckage — 2023's Paper 1 Maths yields "8y" and its Paper 2
        // Physics "8.Δfff = 664.20==06C". Read as a number those become 8, a
        // confident wrong key, and a wrong key is worse than none: it marks
        // the candidates who were right wrong, and teaches the mistake.
        if (!CLEAN_ANSWER.test(value)) continue;
        if (!map.has(n)) map.set(n, value);
      }
    }
  }
  return map;
}

/** Option letters, a number, or a range/list of numbers. Nothing else. */
const CLEAN_ANSWER =
  /^(?:[A-D](?:\s*,\s*[A-D])*|-?\d+(?:\.\d+)?(?:\s*(?:to|or)\s*-?\d+(?:\.\d+)?)*)$/i;

/** No JEE Advanced subject paper has run past this many questions. */
const MAX_QUESTION_NUMBER = 25;

/**
 * The handful of keys no reading of the booklet can recover, and where each
 * one comes from.
 *
 * Every other key in this archive is read off the operator's own PDFs. These
 * three are printed inside lines the extractor destroyed — "Ans. (8y)",
 * "Ans. (8.Δfff = 664.20==06C..." — where the digits that survive are as
 * likely to be part of the working as part of the answer. Guessing from that
 * wreckage is how a confidently wrong key gets stored, and a wrong key is
 * worse than an absent one: the absent one is skipped, the wrong one marks
 * the candidates who were right wrong and teaches them the mistake.
 *
 * So each is written down with its evidence, and each is corroborated twice.
 * Keyed year|paper|subject|number. Only ever fills a key that is missing.
 */
const MANUAL_KEYS = {
  // The booklet prints "Ans. (8y)" — the 8 is the answer, the y belongs to the
  // working beneath. Independently, the JEE Bench dataset (MIT) carries this
  // question at 72% text overlap with gold "8".
  "2023|1|Maths|9": "8",
  // The booklet's line survives as "Ans. (8.Δfff = 664.20==06C –t65oC−5668VH.
  // =4z$f02) 8 =.26H35z264", which still holds 664, 656 and 8.86. The Doppler
  // arithmetic is 656 × 300/(300−4) = 664.86, beat = 664.86 − 656 = 8.86 Hz.
  "2023|2|Physics|15": "8.86",
  // Paragraph II: a 6×6 square has 7×7 = 49 lattice points, and "friends" are
  // the row/column neighbours. Degrees are 4 corners × 2 + 20 edge × 3 + 25
  // interior × 4 = 168, so E(X) = 168/49 = 24/7 and 7E(X) = 24. Derived rather
  // than read, and stated here so it can be checked.
  "2023|2|Maths|16": "24",
};

const OPT_RUN = /(?<![\^_]\{?)\(\s*([A-D])\s*\)/g;
const tidy = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Split a body into stem + options on an ascending (A)(B)(C)(D) run. */
function splitOptions(body) {
  const marks = [...body.matchAll(OPT_RUN)];
  if (marks.length < 4) return null;
  let start = -1;
  for (let i = 0; i + 3 < marks.length; i++) {
    if (marks.slice(i, i + 4).every((m, k) => m[1] === "ABCD"[k])) start = i;
  }
  if (start < 0) return null;
  const run = marks.slice(start, start + 4);
  const options = {};
  for (let i = 0; i < 4; i++) {
    const from = run[i].index + run[i][0].length;
    const to = i < 3 ? run[i + 1].index : body.length;
    options["ABCD"[i]] = tidy(body.slice(from, to));
  }
  return { options, stem: tidy(body.slice(0, run[0].index)) };
}

const NOISE = [
  /^FINAL\s+JEE\s*\(ADVANCED\)/i, /^JEE\s*\(ADVANCED\)/i, /^\(HELD\s+ON/i,
  /^PAPER\s*-\s*[12]/i, /^TEST\s+PAPER/i, /^ALLEN/i, /^©/i,
  /^(PHYSICS|CHEMISTRY|MATHEMATICS|MATHS)\s*$/i, /^PART\s*-\s*[123]/i, /^\d+\s*$/,
];
const isNoise = (l) => NOISE.some((re) => re.test(l.trim()));

/**
 * Every question in one booklet.
 *
 * Sections are the frame: each SECTION header owns an instruction block (which
 * declares type and marks) and then its questions. Question starts are found as
 * a strictly ascending run of "N." at line start, so a "5." inside a worked
 * solution cannot shift the numbering.
 */
function parseBooklet(lines) {
  const secAt = [];
  lines.forEach((l, i) => {
    // Anywhere in the line, not only at its start. These papers have FOUR
    // sections and the strict test found three in almost every file — the
    // fourth header gets welded to whatever the extractor read beside it, as
    // "$/ SECTION-4 / (1". In 2023's Paper 2 Maths solutions BOTH were welded,
    // no section was found at all, and the file yielded nothing: 17 answer keys
    // sitting in a PDF that reported "no questions parsed".
    if (/SECTION\s*[-–—]?\s*\d/i.test(l)) secAt.push(i);
  });
  if (!secAt.length) return [];

  const out = [];
  // Numbering runs CONTINUOUSLY through the whole subject paper — Section 1 is
  // questions 1-4, Section 2 picks up at 5, and so on. Resetting the expected
  // number at each section header means every section after the first is looking
  // for a "1." that is not there, and silently yields nothing: the first run of
  // this found 100 questions where the papers hold roughly six times that.
  let prev = 0;
  for (let s = 0; s < secAt.length; s++) {
    const from = secAt[s];
    const to = s + 1 < secAt.length ? secAt[s + 1] : lines.length;

    const starts = [];
    for (let i = from + 1; i < to; i++) {
      const line = lines[i].trim();
      // "12." normally, and also "12 Ans." / "12 Sol." — a booklet that sets a
      // structure diagram beside the number loses the dot to the artwork, and
      // 2023's Chemistry solutions emit exactly that: "4 Sol. . Ans. (C) MnCl…"
      const m = /^(\d{1,2})\s*\./.exec(line) || /^(\d{1,2})\s+(?=Ans\b|Sol\b)/i.exec(line);
      if (!m) continue;
      const n = Number(m[1]);
      // "75." and "98." inside a worked solution are arithmetic, not questions.
      if (n > MAX_QUESTION_NUMBER) continue;
      // ASCENDING, not consecutive.
      //
      // Requiring prev + 1 means one number the extractor mangles takes every
      // question after it down with it: 2023 Paper 1 Chemistry lost its "4."
      // into a reaction scheme, so 5 was refused for not being 4, and 6 for not
      // being 4, and the paper yielded 3 keys out of 17. Ascending keeps the
      // guard that matters — a worked solution's own numbers never run
      // backwards past the question they belong to — without that cascade.
      if (n <= prev) continue;
      starts.push({ i, n });
      prev = n;
    }
    // Everything before the first question is the instruction block.
    const meta = readSection(lines.slice(from, starts.length ? starts[0].i : Math.min(from + 22, to)));

    starts.forEach((st, k) => {
      const end = k + 1 < starts.length ? starts[k + 1].i : to;
      const block = lines.slice(st.i, end).filter((l) => !isNoise(l));
      const joined = block.join(" ").replace(new RegExp(`^\\s*${st.n}\\s*\\.\\s*`), "");

      // "Ans." separates the question from its key; "Sol." starts the working.
      const ansAt = joined.search(/\bAns\.?\s*[:(]/i);
      const solAt = joined.search(/\bSol\b\.?\s/i);
      const qEnd = ansAt >= 0 ? ansAt : solAt >= 0 ? solAt : joined.length;

      const qBody = tidy(joined.slice(0, qEnd));
      const ansRaw = ansAt >= 0
        ? (joined.slice(ansAt).match(/Ans\.?\s*[:(]?\s*([^)\n]{1,30}?)\s*[)]/i) || [])[1] ?? null
        : null;
      const solution = solAt >= 0 ? tidy(joined.slice(solAt).replace(/^Sol\b\.?\s*/i, "")) : null;

      // Options are only looked for where the section says there are options.
      const split = meta.questionType === "numerical" ? null : splitOptions(qBody);

      out.push({
        sectionIndex: s + 1,
        number: st.n,
        ...meta,
        questionText: split ? split.stem : qBody,
        options: split ? split.options : null,
        answerRaw: ansRaw,
        solution: solution || null,
      });
    });
  }
  return out;
}

/* -------------------------------- convert ------------------------------- */

const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const hash = (t, coords) =>
  crypto.createHash("sha256").update(coords ? `${tidy(t).toLowerCase()}|${coords}` : tidy(t).toLowerCase()).digest("hex");

/** "A" | "A,C" for multi-correct | a number for numerical. */
function normaliseAnswer(raw, type) {
  const v = tidy(raw);
  if (!v) return null;
  if (type === "numerical") {
    // A range and a list of accepted values are kept WHOLE. markPaper reads
    // both — numericallyEqual splits on "or" and understands "a to b" — and
    // taking only the first number silently narrowed the key: 2023 Paper 1
    // Physics question 9 is "80 or 150 or 220" and would have been stored as
    // 80, marking two of its three official answers wrong. Likewise
    // "0.30 to 0.32" stored as 0.30 fails a candidate who answered 0.31.
    if (/^[-\d.\s]*\d[-\d.\s]*(?:(?:to|or)[-\d.\s]*\d[-\d.\s]*)+$/i.test(v)) {
      return v.replace(/\s+/g, " ").trim();
    }
    const n = v.match(/-?\d+(?:\.\d+)?/);
    return n ? n[0] : null;
  }
  const letters = [...new Set((v.toUpperCase().match(/[A-D]/g) || []))].sort();
  return letters.length ? letters.join(",") : null;
}

async function main() {
  const dir = args.dir;
  const files = fs.readdirSync(dir).filter((f) => /^JEEAdv_.*\.pdf$/i.test(f)).sort();
  const described = files.map(describe);
  const usable = described.filter(Boolean);

  console.log(`${files.length} JEEAdv PDFs — ${usable.length} usable, ${files.length - usable.length} skipped (answer-key grids / unresolved paper).`);

  // key: year|paper|subject|number  ->  merged question
  const merged = new Map();
  // key: year|paper|subject -> Map(number -> printed answer), see below
  const answerBank = new Map();
  const problems = [];

  for (const d of usable) {
    let parsed, printedAnswers;
    try {
      const lines = await extractLines(fs.readFileSync(path.join(dir, d.file)));
      parsed = parseBooklet(lines);
      printedAnswers = answerIndex(lines.map((l) => (typeof l === "string" ? l : l?.text ?? "")));
    }
    catch (e) { problems.push(`${d.file}: ${e.message}`); continue; }
    if (!parsed.length) { problems.push(`${d.file}: no questions parsed`); continue; }

    // Everything this booklet prints as an answer, banked against its paper.
    // Applied after every file has been read, because the block parser that
    // MISSED a question is usually in a different file from the one whose
    // answer index can supply it: 2023's Chemistry stems come from
    // Chemistry_Solution.pdf, which prints no answers at all, and the keys are
    // in Chemistry_Solution_v2.pdf, whose own block parse skips half of them.
    const bank = `${d.year}|${d.paper}|${d.subject}`;
    if (!answerBank.has(bank)) answerBank.set(bank, new Map());
    const into = answerBank.get(bank);
    for (const [n, value] of printedAnswers) if (!into.has(n)) into.set(n, value);

    for (const q of parsed) {
      const key = `${d.year}|${d.paper}|${d.subject}|${q.number}`;
      const prev = merged.get(key) || { d, number: q.number, sources: [] };
      // The questions file wins on stem/options; the solutions file wins on
      // key/working. Either may be absent, and 2023 splits them across two PDFs.
      const take = (a, b) => (a != null && a !== "" ? a : b);
      merged.set(key, {
        ...prev, d,
        sectionIndex: q.sectionIndex,
        questionType: q.questionType,
        marksCorrect: q.marksCorrect,
        marksIncorrect: q.marksIncorrect,
        partial: q.partial,
        questionText: d.kind === "questions" ? take(q.questionText, prev.questionText) : take(prev.questionText, q.questionText),
        options: d.kind === "questions" ? (q.options ?? prev.options) : (prev.options ?? q.options),
        answerRaw: take(prev.answerRaw, q.answerRaw) ?? q.answerRaw,
        solution: take(prev.solution, q.solution),
        sources: [...prev.sources, { file: d.file, kind: d.kind, printed: q.number }],
      });
    }
  }

  // The banked answers, applied to every question still without one. Runs
  // after all the booklets are in, so a key printed in one file reaches a
  // question whose stem came from another. Only fills; never overwrites.
  let banked = 0;
  for (const [key, q] of merged) {
    if (q.answerRaw != null && q.answerRaw !== "") continue;
    const [year, paper, subject] = key.split("|");
    const value = answerBank.get(`${year}|${paper}|${subject}`)?.get(q.number);
    if (value) { merged.set(key, { ...q, answerRaw: value }); banked++; }
  }
  if (banked) console.log(`${banked} key(s) recovered from the booklets' printed answers.`);

  let byHand = 0;
  for (const [key, q] of merged) {
    if (q.answerRaw != null && q.answerRaw !== "") continue;
    const [year, paper, subject] = key.split("|");
    const value = MANUAL_KEYS[`${year}|${paper}|${subject}|${q.number}`];
    if (value) { merged.set(key, { ...q, answerRaw: value }); byHand++; }
  }
  if (byHand) console.log(`${byHand} key(s) filled from MANUAL_KEYS — see the evidence beside each.`);

  /**
   * A section has ONE type and ONE marking rule; make every question in it
   * agree with the one the booklet actually stated.
   *
   * The type is read from a section's instruction block, and where a paper is
   * split across two PDFs the same section gets read twice — once from a page
   * the extractor mangled. 2023 Paper 1 Chemistry is the case: Section 3 is
   * "Non-Negative Integer", question 8 was parsed from the file that says so
   * and came out numerical, and questions 9-13 were parsed from the file that
   * did not and came out mcq_single. Their keys are 100, 5, 7, 8 and 28 —
   * which normaliseAnswer then read as option letters, found none, and stored
   * as no key at all. Five answerable questions, unanswerable.
   *
   * The evidence used is deliberately narrow: only a question whose printed
   * answer is a bare number, only where another question of the same section
   * is already numerical, and the marks come from that sibling rather than
   * being invented.
   */
  const sectionType = new Map();
  for (const q of merged.values()) {
    if (q.questionType !== "numerical" && q.questionType !== "integer") continue;
    const k = `${q.d.year}|${q.d.paper}|${q.d.subject}|${q.sectionIndex}`;
    if (!sectionType.has(k)) {
      sectionType.set(k, {
        questionType: q.questionType,
        marksCorrect: q.marksCorrect,
        marksIncorrect: q.marksIncorrect,
      });
    }
  }
  // The same, keyed without the subject. A paper's Section 3 is Section 3 in
  // all three subjects — the structure is the paper's, not the subject's — so
  // Chemistry's reading of it can settle Physics when Physics has only the one
  // booklet and that booklet's instruction page did not survive extraction.
  const paperSectionType = new Map();
  for (const q of merged.values()) {
    if (q.questionType !== "numerical" && q.questionType !== "integer") continue;
    const k = `${q.d.year}|${q.d.paper}|${q.sectionIndex}`;
    if (!paperSectionType.has(k)) {
      paperSectionType.set(k, {
        questionType: q.questionType,
        marksCorrect: q.marksCorrect,
        marksIncorrect: q.marksIncorrect,
      });
    }
  }

  let retyped = 0;
  for (const [key, q] of merged) {
    if (q.questionType === "numerical" || q.questionType === "integer") continue;
    // Digits and no option letter. An MCQ key is "A" or "B,D" and can never be
    // 121, "0.30 to 0.32" or "80 or 150 or 220", so whatever the section was
    // read as, this question is not multiple choice.
    const raw = String(q.answerRaw ?? "").trim();
    if (!/\d/.test(raw) || /[A-D]/.test(raw.toUpperCase().replace(/[^A-Z]/g, ""))) continue;
    const s =
      sectionType.get(`${q.d.year}|${q.d.paper}|${q.d.subject}|${q.sectionIndex}`) ??
      paperSectionType.get(`${q.d.year}|${q.d.paper}|${q.sectionIndex}`) ??
      // Nothing in the paper to copy from. The type is still wrong and is
      // corrected; Advanced marks its numerical sections +4/0, which is what
      // readSection would have defaulted to had it read the block at all.
      { questionType: "numerical", marksCorrect: 4, marksIncorrect: 0 };
    merged.set(key, { ...q, ...s });
    retyped++;
  }
  if (retyped) console.log(`${retyped} question(s) re-typed to match their section's stated marking.`);

  /**
   * A key of several letters is a several-answer question, whatever the
   * section was read as.
   *
   * Read as mcq_single it is unanswerable rather than merely mistyped: the
   * player draws radio buttons for a single-answer question, so a candidate
   * can submit "A" or "C" but never "A,C,D", and markPaper compares the whole
   * string — every candidate is marked wrong including the ones who knew it.
   * 2023 Paper 1 Physics opens with three of them.
   */
  let multi = 0;
  for (const [key, q] of merged) {
    if (q.questionType !== "mcq_single") continue;
    const letters = String(q.answerRaw ?? "").toUpperCase().match(/[A-D]/g);
    if (!letters || new Set(letters).size < 2) continue;
    merged.set(key, { ...q, questionType: "mcq_multiple" });
    multi++;
  }
  if (multi) console.log(`${multi} question(s) re-typed as multiple-answer — their key names more than one option.`);

  const rows = [...merged.values()].map((q) => {
    const { d } = q;
    const dateLabel = d.day && d.mon ? `${d.day} ${d.mon} ${d.year}` : String(d.year);
    const paperId = `jee-advanced-${d.year}-paper${d.paper}`;
    const figureBase = `JEEAdv_${d.year}_Paper${d.paper}_${d.subject}_Q${String(q.number).padStart(2, "0")}`;
    const stem = tidy(q.questionText);

    return {
      examCode: EXAM_CODE, examName: EXAM_NAME, stream: STREAM,
      year: d.year,
      sessionNumber: d.paper,
      sessionLabel: `Paper ${d.paper}`,
      paperDate: d.day && d.mon ? null : null,
      dateLabel,
      shift: d.paper, shiftLabel: `Paper ${d.paper}`, shiftTime: null,
      paperId,
      session: `${EXAM_NAME} ${d.year} · Paper ${d.paper}`,

      // The name the archive uses, which is not the token in the filenames.
      // pyqPattern.js lists JEE Advanced's subjects as Physics / Chemistry /
      // Mathematics, and the importer rejects anything else — 137 rows, every
      // Maths question of every year, were refused on exactly this. The crops
      // keep saying "Maths" because that is what is written on 300-odd files
      // already published to the CDN, and a subject name is not a filename.
      subject: SUBJECT_NAME[d.subject] ?? d.subject,
      subjectId: slug(SUBJECT_NAME[d.subject] ?? d.subject),
      topic: null, chapter: null, chapterId: null,

      section: String(q.sectionIndex),
      sectionLabel: `Section ${q.sectionIndex}`,
      questionNumber: q.number,
      paperQuestionNumber: q.number,

      questionText: stem,
      optionA: q.options?.A ?? null, optionB: q.options?.B ?? null,
      optionC: q.options?.C ?? null, optionD: q.options?.D ?? null,
      // Type is the SECTION's declaration. A numerical question is never an MCQ
      // just because a stray "(A)" parsed out of its stem.
      questionType: q.questionType,
      correctAnswer: normaliseAnswer(q.answerRaw, q.questionType),
      marksCorrect: q.marksCorrect,
      marksIncorrect: q.marksIncorrect,
      partialCredit: q.partial,

      solution: q.solution, solutionModel: q.solution ? "imported" : null,
      status: "ok",
      needsFigure: false,
      questionImage: null, optionAImage: null, optionBImage: null,
      optionCImage: null, optionDImage: null, solutionImage: null,
      figureBase,
      languages: ["en"],
      sourceUrl: q.sources.map((s) => s.file).join(" + "),
      sourceNote: SOURCE_NOTE,
      questionHash: hash(stem, stem.length < 60 ? `${paperId}|${d.subject}|${q.number}` : null),
      __printed: q.number,
      // Every file this question was seen in, with the number each one printed
      // it under. The figure pass needs them ALL, not one: for 2023 the stem
      // and the worked solution are in different PDFs.
      __sources: q.sources,
    };
  });

  /* ---------------------------- figure cutting --------------------------- */

  let cut = 0;
  if (!args["no-figures"]) {
    fs.mkdirSync(FIG_DIR, { recursive: true });

    /**
     * Which PDF each crop is cut from, which is not one PDF per question.
     *
     * A 2021, 2025 or 2026 booklet prints the question and the worked solution
     * together, so one file gives both. 2023 is SPLIT — _Paper.pdf holds the
     * stems, _Solution.pdf holds only "7. Ans. (A)" and the working — and
     * cutting from whichever file the row happened to prefer published 34 of
     * the 86 questions of 2023 as a picture of the words "7. Ans. (A)".
     *
     * So the passes are separated by what they are FOR, and the question pass
     * runs second: both write `_Q.png`, and the one cut from the paper is the
     * one that must survive.
     */
    const solutionPass = new Map();
    const questionPass = new Map();
    const add = (map, file, r, printed) => {
      if (!map.has(file)) map.set(file, []);
      map.get(file).push({ row: r, printed });
    };
    for (const r of rows) {
      const sources = r.__sources ?? [];
      const sol = sources.find((s) => s.kind === "solutions");
      const paper = sources.find((s) => s.kind === "questions");
      const first = sol ?? paper ?? sources[0];
      if (first) add(solutionPass, first.file, r, first.printed ?? r.__printed);
      // Only when the stems live somewhere else — otherwise the pass above
      // already cut the question from the file that prints it.
      if (paper && (!sol || paper.file !== sol.file)) {
        add(questionPass, paper.file, r, paper.printed ?? r.__printed);
      }
    }

    for (const [pass, wantSolution] of [[solutionPass, true], [questionPass, false]])
    for (const [file, entries] of pass) {
      const group = entries.map((e) => e.row);
      try {
        const { written, parts } = extractFigures({
          pdfPath: path.join(dir, file),
          outDir: FIG_DIR,
          mode: "allen",
          // One picture per question, cut at the sheet's own edges.
          //
          // These booklets set their choices as chemical structures, plots and
          // stacked fractions, and splitting those into four crops is where
          // every defect came from: a choice cut at the page midline, a stem
          // that stopped above options no crop had captured, four page-wide
          // bands with a formula in one corner. The paper already prints the
          // question and its choices as one block, so that is what is cut, and
          // the candidate picks A/B/C/D against it.
          fullWidth: true,
          wanted: entries.map((e) => ({
            // The number THIS file printed it under. A split 2023 paper and
            // its solution booklet do not always agree.
            printedNumber: e.printed,
            baseName: e.row.figureBase,
            wantOptions: false,
            wantSolution,
          })),
        });
        cut += written;
        for (const e of entries) {
          const p = parts.get(e.row.figureBase);
          if (!p) continue;
          const r = e.row;
          const url = (f) => (f ? (BASE ? `${BASE}/${f}` : f) : null);
          // The question pass runs last and its stem wins; the solution pass
          // is the only one that produces a solution, so neither overwrites
          // the other with a null.
          if (p.stem) r.questionImage = url(p.stem);
          if (p.solution) r.solutionImage = url(p.solution);
          if (r.questionImage) r.diagramImage = r.questionImage;
        }
      } catch (e) { problems.push(`${file}: figure pass — ${e.message}`); }
    }

    /* --------------------------- link from disk ---------------------------
     *
     * The loop above links from extractFigures' in-memory `parts` map, keyed by
     * the number printed on the page. That key does not always survive: a
     * booklet that restarts its numbering per subject, or prints "Q.1" where
     * the parser recorded 1, produces a crop on disk that the map cannot be
     * asked for. The first run wrote 940 images and linked none of them.
     *
     * The filenames are already derived from `figureBase`, which every row
     * carries, so the directory listing is the authoritative index — and it
     * cannot drift from what actually exists, because it IS what exists. This
     * pass fills in anything the map missed.
     */
    const onDisk = new Set(fs.readdirSync(FIG_DIR));
    const url = (name) => (onDisk.has(name) ? (BASE ? `${BASE}/${name}` : name) : null);

    for (const r of rows) {
      if (!r.figureBase) continue;
      r.questionImage ||= url(`${r.figureBase}_Q.png`);
      r.solutionImage ||= url(`${r.figureBase}_S.png`);
      // Options only where the question has them — a numerical answer has no
      // choices, and a stray crop named _A must not become one.
      if (r.questionType !== "numerical") {
        r.optionAImage ||= url(`${r.figureBase}_A.png`);
        r.optionBImage ||= url(`${r.figureBase}_B.png`);
        r.optionCImage ||= url(`${r.figureBase}_C.png`);
        r.optionDImage ||= url(`${r.figureBase}_D.png`);
      }
      if (r.questionImage) r.diagramImage ||= r.questionImage;
    }
  }

  /**
   * A stem too thin to import, replaced by a citation of where it came from.
   *
   * These booklets set some questions entirely as artwork — a reaction scheme,
   * a circuit, a match table — and what the text layer yields is "Zn, dil. HCl"
   * or nothing. The picture IS the question and the candidate sees it whole,
   * but the row still has to be identifiable in a list, in a search result and
   * to the importer's minimum-length check, none of which look at the figure:
   * 25 rows were being refused as "questionText missing or too short" with
   * their questions sitting complete in the crop beside them.
   *
   * The same citation the JEE Main converters write, so the player's
   * isPlaceholderStem hides it for both. Only ever applied where a crop
   * actually exists, and questionHash for a stem this short is already keyed
   * to the paper coordinates rather than the words, so rewriting it cannot
   * move the upsert key or duplicate the row.
   */
  let cited = 0;
  for (const r of rows) {
    if (!r.questionImage) continue;
    if (tidy(r.questionText).length >= 25) continue;
    const tail = tidy(r.questionText);
    r.questionText =
      `[Shown as an image] ${r.examName} ${r.year} · ${r.sessionLabel} · ` +
      `${r.subject} Q${r.questionNumber} (Section ${r.section})` +
      (tail ? ` — ${tail}` : "");
    cited++;
  }
  if (cited) console.log(`${cited} stem(s) too thin to stand alone now cite their paper.`);

  rows.forEach((r) => { delete r.__printed; delete r.__sources; });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2));

  /* ------------------------------- report -------------------------------- */

  const by = (f) => rows.reduce((a, r) => ((a[f(r)] = (a[f(r)] || 0) + 1), a), {});
  console.log(`\n✔ ${rows.length} questions → ${OUT}`);
  console.log("by year: ", JSON.stringify(by((r) => r.year)));
  console.log("by type: ", JSON.stringify(by((r) => r.questionType)));
  console.log("by marks:", JSON.stringify(by((r) => `${r.marksCorrect}/${r.marksIncorrect}`)));
  console.log(`with key: ${rows.filter((r) => r.correctAnswer).length}/${rows.length}` +
    ` | with solution: ${rows.filter((r) => r.solution).length}` +
    ` | 4 options: ${rows.filter((r) => r.optionA && r.optionB && r.optionC && r.optionD).length}`);
  console.log(`images cut: ${cut} | with a question image: ${rows.filter((r) => r.questionImage).length}` +
    ` | with option images: ${rows.filter((r) => r.optionAImage).length}` +
    ` | with a solution image: ${rows.filter((r) => r.solutionImage).length}`);
  if (problems.length) {
    console.log(`\n⚠ ${problems.length} issue(s):`);
    problems.slice(0, 15).forEach((p) => console.log("  · " + p));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
