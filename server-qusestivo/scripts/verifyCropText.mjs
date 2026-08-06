#!/usr/bin/env node
// Does each crop actually SHOW the question it is stored against?
//
// scripts/auditFigures.mjs asks whether a crop is a usable image — ink, size,
// shape. It cannot ask the only question that matters: is it a picture of THIS
// question? A crop cut from the wrong region is a perfectly good PNG of a
// perfectly good question, just not the one on the row. 2026 Paper-1 Maths Q4
// was published for weeks as a picture of Q3's worked solution under an ALLEN
// advert, with the right stem and options stored in the same row.
//
// So this compares the two independent records of one question: the text the
// converter EXTRACTED into `questionText`, and the text that physically falls
// inside the rectangle the converter CROPPED. They come from the same page by
// two different routes, and a disagreement means one of them is wrong.
//
// WHICH one is wrong is then settled against the page rather than guessed. The
// whole file is searched for the stem: printed somewhere the crop is not, the
// rectangle is over the wrong part of the paper — printed nowhere at all, the
// stored text is not a transcription of this paper and the crop is not what is
// broken. Both are defects; they want opposite repairs.
//
// NO OCR. The source PDFs have a text layer — the whole pipeline is built on
// it — so the text inside a crop is read straight out of mupdf's structured
// text, filtered to the crop's own rectangle. That is exact rather than
// probable, costs nothing, and needs no model.
//
// HOW THE RECTANGLE IS RECOVERED
//
// It is recorded nowhere: `extractFigures` derives it, renders it and throws it
// away, and the JSON keeps only the filename. Re-deriving it by eye from the
// same page would be a SECOND implementation of 600 lines of boundary rules,
// and the first disagreement between the two would be indistinguishable from a
// defect in the crop. So the converter's own code is asked instead:
// lib/figures.mjs is loaded through an ESM load hook that inserts one additive
// line — `mine.regions = ...` beside the existing `parts.set(...)` — and
// nothing else. The file on disk is never modified, and if the anchor line ever
// moves this exits rather than guessing.
//
// AND THE RECTANGLE IS PROVED, NOT ASSUMED
//
// Re-deriving needs the same `wanted` entry the converter passed, and that is
// rebuilt from the row (the printed number and the source file it came from are
// stripped before the JSON is written). A rebuild that got it wrong would
// locate a different question and report a mismatch that does not exist.
//
// So every crop is re-rendered in memory and compared BYTE FOR BYTE with the
// PNG on disk. Identical bytes mean the rectangle re-derived here is the
// rectangle that produced the published crop — there is nothing left to assume.
// Rows that fail to reproduce are reported apart and kept out of the rate.
//
// Nothing is written: the render is intercepted in memory, so pyq-figures/ is
// only ever read.
//
// Usage:
//   node scripts/verifyCropText.mjs --file data/pyq/jee-advanced-allen.json \
//        --dir "C:/Users/LSE/Downloads/ch/jee questions"
//   node scripts/verifyCropText.mjs --file data/pyq/jee-main-2025.json \
//        --dir "C:/Users/LSE/Downloads/ch/jee questions" --year 2025 --sample 300
//
//   --figures <dir>   where the crops are (default: ../pyq-figures/<year>, or
//                     ../pyq-figures/jee-advanced for JEE Advanced)
//   --year <list>     only these years, comma separated
//   --sample <n>      at most n rows per year, spread evenly across the year
//   --examples <n>    how many mismatches to print in full (default 10)
//   --json <path>     write every finding out for a later pass

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as mupdf from "mupdf";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    const v = argv[i + 1];
    if (v && !v.startsWith("--")) { out[k] = v; i++; } else out[k] = true;
  }
  return out;
}

const args = parseArgs(process.argv);
if (!args.file || !args.dir) {
  console.error("--file <converted json> and --dir <pdf folder> are required");
  process.exit(2);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIGURES_ROOT = path.resolve(HERE, "..", "..", "pyq-figures");
const EXAMPLES = Number(args.examples ?? 10);
const YEARS = args.year && args.year !== true
  ? new Set(String(args.year).split(",").map((s) => Number(s.trim())))
  : null;
const SAMPLE = args.sample && args.sample !== true ? Number(args.sample) : null;

/**
 * How much of the stored stem has to be found inside the crop.
 *
 * Significant characters, so "Let f(x) = 3x + 2" and "Let f (x) = 3x+2" are the
 * same forty. Forty of them is about six words: long enough that no other
 * question on the page shares them, short enough to survive the extractor
 * mangling a symbol halfway through the sentence.
 */
const SIG_PREFIX = 40;
/**
 * Below this a stem cannot be tested at all.
 *
 * A whole section of JEE Advanced is numerical answers to a stem printed once
 * for two questions — "The value of x is _______." is the entire stored stem of
 * four questions in 2021 Paper 1 Chemistry alone. Thirteen significant
 * characters would be found inside the crop of the question NEXT to it just as
 * readily, so a match there proves nothing. They are counted and named, never
 * scored.
 */
const MIN_SIG = 12;
/** A stem this short is tested, but the pass is too cheap to headline. */
const WEAK_SIG = SIG_PREFIX;

/* ------------------------- the converter's own code ----------------------- */

/**
 * The line `extractFigures` ends every question with, and the capture inserted
 * in front of it.
 *
 * `regions` is the list of page rectangles that were just rendered into
 * `<base>_Q.png` — one for an ordinary question, three where a shared stem, the
 * question's own band and an overleaf continuation were stacked. The page
 * objects are looked back up in `pageCache`, which is the only place their
 * index survives.
 */
const ANCHOR = "    parts.set(w.baseName, mine);";
const CAPTURE = `    mine.regions = regions.map((r) => ({
      pageIndex: [...pageCache].find(([, pg]) => pg === r.page)?.[0] ?? a.page,
      rect: r.rect,
    }));
    mine.anchorNumber = a.n;
`;

const FIGURES = path.join(HERE, "lib", "figures.mjs");
if (!fs.readFileSync(FIGURES, "utf8").includes(ANCHOR)) {
  console.error(
    `scripts/lib/figures.mjs no longer contains the anchor line\n  ${ANCHOR}\n` +
      "so the crop rectangles cannot be captured. Update ANCHOR/CAPTURE in this file."
  );
  process.exit(2);
}

// An in-process ESM load hook. figures.mjs is read from disk as it is, one line
// is inserted, and the result is handed to the module loader — the file itself
// is never touched, so nothing about the converter changes.
const hook = `
export async function load(url, context, next) {
  const r = await next(url, context);
  if (!url.replace(/\\\\/g, "/").endsWith("/lib/figures.mjs")) return r;
  const src = String(r.source);
  const anchor = ${JSON.stringify(ANCHOR)};
  if (!src.includes(anchor)) throw new Error("figures.mjs: capture anchor not found");
  return { ...r, source: src.replace(anchor, ${JSON.stringify(CAPTURE)} + anchor) };
}
`;
register("data:text/javascript;base64," + Buffer.from(hook).toString("base64"), import.meta.url);
const { extractFigures } = await import(pathToFileURL(FIGURES).href);

/* ---------------------------- the write sandbox --------------------------- */

// extractFigures writes PNGs. Here they are wanted only to be compared with the
// ones already published, so every write inside the sandbox is caught in memory
// and pyq-figures/ is never opened for writing.
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "verifyCropText-"));
const inSandbox = (p) => path.resolve(String(p)).toLowerCase().startsWith(SANDBOX.toLowerCase());
/** filename → the bytes extractFigures just rendered for it. */
let rendered = new Map();

const realWriteFileSync = fs.writeFileSync;
fs.writeFileSync = function (file, data, ...rest) {
  if (inSandbox(file)) { rendered.set(path.basename(String(file)), Buffer.from(data)); return undefined; }
  return realWriteFileSync.call(this, file, data, ...rest);
};
const realUnlinkSync = fs.unlinkSync;
fs.unlinkSync = function (file, ...rest) {
  // `discard()` deletes option crops it decided against. Nothing is on disk to
  // delete, so the memory copy goes instead — otherwise a discarded crop would
  // be compared against a file that was never published.
  if (inSandbox(file)) { rendered.delete(path.basename(String(file))); return undefined; }
  return realUnlinkSync.call(this, file, ...rest);
};

/* ------------------------------ text in a rect ---------------------------- */

/**
 * Every text line of a page, with its box, exactly as figures.mjs reads them.
 *
 * Cached per document because a page is asked for once per question that lands
 * on it, and a mupdf page held per question is what once took 1,176 questions
 * down with it — see the note in regionInk.documentFurniture.
 */
function linesOf(doc, cache, index) {
  if (!cache.has(index)) {
    const out = [];
    try {
      const page = doc.loadPage(index);
      const st = JSON.parse(page.toStructuredText().asJSON());
      for (const block of st.blocks || []) {
        for (const line of block.lines || []) {
          const b = line.bbox || {};
          const text = (line.text ?? "").trim();
          if (!text) continue;
          out.push({ x: b.x ?? 0, y: b.y ?? 0, w: b.w ?? 0, h: b.h ?? 0, text });
        }
      }
    } catch { /* a page whose text layer will not parse contributes nothing */ }
    cache.set(index, out);
  }
  return cache.get(index);
}

/**
 * The text a reader can see inside a crop.
 *
 * A line counts when its MIDPOINT is inside the rectangle, which is what
 * "visible in the picture" means: the renderer clips, so a line straddling the
 * boundary is printed as a half-height sliver nobody can read, and counting it
 * would let a crop that stops just above the stem claim the stem anyway.
 *
 * The crop is trimmed to its ink after rendering, and trimming only removes
 * blank margins — it can move no text out of the picture, so the rectangle and
 * the PNG hold the same words.
 */
function textInRegions(doc, cache, regions) {
  const lines = [];
  const byBlock = [];
  for (const { pageIndex, rect } of regions) {
    const [x0, y0, x1, y1] = rect;
    const hits = linesOf(doc, cache, pageIndex).filter((l) => {
      const cx = l.x + l.w / 2;
      const cy = l.y + l.h / 2;
      return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
    });
    // Two readings of the same crop, because a stem is not always laid out in
    // the order it is read down the page. These booklets print the question
    // number in its own cell and a diagonal "ALLEN" watermark across the sheet,
    // and both sit at a y INSIDE the stem's lines: down the page, 2021 Paper-1
    // Maths Q15 reads "For any positive integer n, let Sn : (0, ) ALLEN 15. be
    // defined by", which no transcription of that question will ever contain.
    // Block order keeps each cell's lines together and reads it correctly.
    for (const l of [...hits].sort((p, q) => p.y - q.y || p.x - q.x)) lines.push(l.text);
    for (const l of hits) byBlock.push(l.text);
  }
  return { text: lines.join(" "), blockOrder: byBlock.join(" "), lines };
}

/**
 * The whole file as one significant-character string, with a page index.
 *
 * This is what settles WHICH record is wrong when a crop and its stem disagree.
 * A stem printed somewhere in this document but not inside the crop means the
 * two are looking at different parts of the paper, and the page it IS printed
 * on can be named — the crop text then says which of them is on the question.
 * A stem printed nowhere in the document at all is not a transcription of this
 * paper, and the crop cannot be judged against it: a defect in the parse.
 *
 * Lines are ordered exactly as textInRegions orders them, so a stem broken
 * across two lines or two pages reads as one run of characters in both.
 */
function documentText(doc, cache) {
  let text = "";
  const marks = [];
  for (let p = 0; p < doc.countPages(); p++) {
    marks.push({ start: text.length, page: p });
    const lines = [...linesOf(doc, cache, p)].sort((a, b) => a.y - b.y || a.x - b.x);
    text += sig(lines.map((l) => l.text).join(" "));
  }
  return { text, marks };
}

/** Which page a run of significant characters is printed on, 1-based. */
function pageOf(index, marks) {
  let page = null;
  for (const m of marks) if (m.start <= index) page = m.page;
  return page === null ? null : page + 1;
}

/**
 * Does the crop OPEN with the answer line?
 *
 * A question ends at "Ans. (3)" / "Official Ans. by NTA (C)"; a picture that
 * starts with one is a picture of the answer and the working under it, which is
 * the worst possible crop — it hands the candidate the key. 2023 Paper-2 Maths
 * Q13 is published as "13. Ans. (2) Radical", because that row's only source is
 * the solution booklet and the booklet prints nothing else for it.
 *
 * Tested on the first two lines only. "Ans." further down is the ordinary case
 * of a band that ran a little past the question, not a crop of the wrong thing.
 */
const ANSWER_HEAD = /^\s*(?:Q\s*\.?\s*)?\d{1,3}\s*[.)]?\s*(?:Official\s+|Allen\s+)?(?:Ans|Answer)\b/i;
function opensWithAnswer(lines) {
  const head = lines.slice(0, 2);
  // The number and the answer are their own cells as often as they are one
  // line, so both readings are tried: "13." + "Ans. (2)" is the same crop as
  // "13. Ans. (2)".
  return ANSWER_HEAD.test(head.join(" ")) ||
    head.some((l) => /^\s*(?:Official\s+|Allen\s+)?Ans(?:wer)?\b/i.test(l));
}

/**
 * Is the number the converter anchored on actually inside the crop?
 *
 * Deliberately weak evidence, and worth stating why. A crop is cut FROM its
 * anchor, so the number is normally in the picture by construction — which
 * makes a "no" strong and a "yes" only corroborating. The "no" is the case that
 * matters: it means the band was lifted or pushed clear of the line it was
 * anchored to, and what the picture shows is whatever was there instead.
 *
 * Asked of the number extractFigures LOCATED, not the one the caller asked for.
 * An ALLEN per-subject booklet numbers its 25 chemistry questions 51-75 and the
 * base is read off the page, so asking after "question 6" of a crop headed
 * "56." would answer no for every question in the file.
 */
function anchorInCrop(lines, mode, printedNumber) {
  const pattern =
    mode === "gate" ? /^Q\s*\.\s*(\d{1,3})\b/
    : mode === "mathongo" ? /^Q\s*(\d{1,3})\s*\./
    : /^(\d{1,3})\s*\.(?!\d)/;
  return lines.some((l) => Number(pattern.exec(l.trim())?.[1]) === printedNumber);
}

/* ------------------------------- comparison ------------------------------- */

/** Whitespace, case and punctuation removed — what is left is what is compared. */
const sig = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/** A PNG's pixel size, read off its IHDR — enough to say HOW two crops differ. */
function pngSize(buf) {
  if (!buf || buf.length < 24 || buf.readUInt32BE(12) !== 0x49484452) return "?";
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
}

/**
 * The stem as a sentence, with the citation wrapper taken off.
 *
 * Rows too thin to import carry "[Shown as an image] JEE Advanced 2021 · Paper 1
 * · Chemistry Q5 (Section 2) — The value of x is_____." — sixty characters of
 * paper coordinates that appear nowhere on the page, followed by whatever stem
 * there was. Comparing the wrapper would fail every one of them for saying
 * something the printed page never said.
 */
function storedStem(row) {
  const raw = String(row.questionText ?? "");
  const m = /^\[Shown as an image\][^—]*—\s*/.exec(raw);
  if (m) return { text: raw.slice(m[0].length), citation: true };
  if (/^\[Shown as an image\]/.test(raw)) return { text: "", citation: true };
  return { text: raw, citation: false };
}

/** Word tokens, for saying HOW different a mismatch is rather than only that it is. */
const tokens = (s) =>
  String(s ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);

/** How long a run of the stem has to be found for the find to mean anything. */
const PROBE = 24;
/**
 * A handful of runs taken from across the stem, not only its opening.
 *
 * The prefix test alone cannot say which record is wrong when the stem is
 * garbled, because mupdf does its worst damage at the HEAD of a sentence: 2026
 * Paper-2 Maths Q2 is stored as "ar (Lpd(A) (C) | a |ieastrta…" and ends "…on
 * the parabola. If L and T are perpendicular", the same words the crop shows.
 * Probing across the whole stem finds the parts that survived, wherever they
 * are, and asking where each one is PRINTED separates a crop over the wrong
 * region from a transcription that came out as noise.
 */
function probesOf(want) {
  if (want.length < PROBE) return want.length >= MIN_SIG ? [want] : [];
  const n = Math.min(6, Math.floor(want.length / PROBE));
  const out = [];
  for (let i = 0; i < n; i++) {
    const start = n === 1 ? 0 : Math.round((i * (want.length - PROBE)) / (n - 1));
    out.push(want.slice(start, start + PROBE));
  }
  return [...new Set(out)];
}

/**
 * Compare one crop against one stem.
 *
 * The test is containment of a prefix, not equality: the crop legitimately holds
 * MORE than the stem — the four options are inside the same picture by design
 * for JEE Advanced — and the extractor legitimately mangles a symbol in the
 * middle of a sentence. What it may never hold is a different question's opening
 * words.
 */
function compare(stem, cropText, cropAlt = "") {
  const want = sig(stem);
  const have = sig(cropText);
  const alt = sig(cropAlt);
  /** Present in the crop under either reading of its layout. */
  const inCrop = (s) => have.includes(s) || alt.includes(s);
  const prefix = want.slice(0, SIG_PREFIX);
  if (want.length < MIN_SIG) return { verdict: "untestable", prefix, want, have, inCrop };
  if (inCrop(prefix)) {
    return { verdict: want.length < WEAK_SIG ? "match-weak" : "match", prefix, want, have, inCrop };
  }
  // How far into the stem the crop does agree, and how much of the stem's
  // vocabulary is in there at all. A crop of a DIFFERENT question shares almost
  // no words; a crop of the right question whose text came out garbled shares
  // most of them, and the two need telling apart by eye.
  let agrees = 0;
  while (agrees < prefix.length && inCrop(prefix.slice(0, agrees + 1))) agrees++;
  const want12 = tokens(stem).slice(0, 12);
  const hereTokens = new Set([...tokens(cropText), ...tokens(cropAlt)]);
  const overlap = want12.length ? want12.filter((t) => hereTokens.has(t)).length / want12.length : 0;
  // The END of the stem, which survives what the beginning does not: mupdf
  // interleaves the two columns of a two-up booklet and the damage is worst at
  // the head of the sentence. 2026 Paper-2 Maths Q2 is stored as "ar (Lpd(A)
  // (C) | a |ieastrta..." and finishes "...on the parabola. If L and T are
  // perpendicular" — the same words the crop shows, in the same order.
  const tailIn = inCrop(want.slice(-SIG_PREFIX));
  return { verdict: "mismatch", prefix, want, have, inCrop, agrees, overlap, tailIn };
}

/* ------------------------- rebuilding `wanted` ---------------------------- */

// What the two converters pass to extractFigures, rebuilt from the row. The
// numbers below are not chosen here — they are read off the call sites, and the
// byte comparison afterwards is what proves the rebuild right.

/** JEE Advanced — convertJeeAdvancedAllen.mjs:653-696. */
function advancedPlans(rows) {
  // `describe()` there reads the kind out of the filename: "_Paper.pdf" prints
  // the questions, everything else prints the solutions.
  const kindOf = (file) => (/_Paper(?:_v\d+)?\.pdf$/i.test(file) ? "questions" : "solutions");
  const solutionPass = new Map();
  const questionPass = new Map();
  const add = (map, file, row) => {
    if (!map.has(file)) map.set(file, []);
    map.get(file).push(row);
  };

  for (const row of rows) {
    const sources = String(row.sourceUrl ?? "").split(" + ").map((s) => s.trim()).filter(Boolean);
    const sol = sources.find((f) => kindOf(f) === "solutions");
    const paper = sources.find((f) => kindOf(f) === "questions");
    const first = sol ?? paper ?? sources[0];
    if (first) add(solutionPass, first, row);
    if (paper && (!sol || paper !== sol)) add(questionPass, paper, row);
  }

  // Both passes write `<base>_Q.png` and the question pass runs second, so its
  // crop is the one on disk wherever a 2023 paper was split across two PDFs.
  const plans = [];
  for (const [pass, wantSolution] of [[solutionPass, true], [questionPass, false]]) {
    for (const [file, group] of pass) {
      plans.push({
        file, mode: "allen", fullWidth: true,
        // Every source of a row printed it under the same number: the merge key
        // in convertJeeAdvancedAllen.mjs:441 IS that number, and `printed` beside
        // it in :457 is the same value.
        entries: group.map((r) => ({
          row: r,
          want: {
            printedNumber: r.questionNumber,
            baseName: r.figureBase,
            wantOptions: false,
            wantSolution,
          },
        })),
      });
    }
  }
  return plans;
}

/** JEE Main — convertJeeMain.mjs:787-838. */
function mainPlans(rows) {
  // convertJeeMain.mjs:197 — an ALLEN solution booklet or a MathonGo paper.
  const kindOf = (file) => (/_Solution\.pdf$/i.test(file) ? "allen" : "mathongo");
  const bySource = new Map();
  for (const row of rows) {
    if (!row.sourceUrl) continue;
    if (!bySource.has(row.sourceUrl)) bySource.set(row.sourceUrl, []);
    bySource.get(row.sourceUrl).push(row);
  }

  const plans = [];
  for (const [file, group] of bySource) {
    const kind = kindOf(file);
    plans.push({
      file, mode: kind, fullWidth: false,
      entries: group.map((r) => ({
        row: r,
        want: {
          printedNumber: kind === "mathongo"
            ? r.paperQuestionNumber
            : r.questionNumber - (r.section === "B" ? 20 : 0),
          occurrence: kind === "allen" && r.section === "B" ? 2 : 1,
          subjectNumber: kind === "allen" ? r.questionNumber : undefined,
          baseName: r.figureBase,
          wantOptions: r.questionType === "mcq_single",
          wantSolution: kind === "allen",
          // Only ever read by classifyRegion, which decides whether a region
          // NEEDS to be a picture. No rectangle depends on it.
          stemText: r.questionText ?? "",
          solutionText: r.solution ?? "",
        },
      })),
    });
  }
  return plans;
}

/* --------------------------------- the run -------------------------------- */

const all = JSON.parse(fs.readFileSync(args.file, "utf8"));
const isAdvanced = all.some((r) => r.examCode === "JEE_ADVANCED");

let rows = all.filter((r) => r.figureBase && r.questionImage);
if (YEARS) rows = rows.filter((r) => YEARS.has(Number(r.year)));

if (SAMPLE) {
  // Spread across the year rather than the first n, so a sample cannot be all
  // one paper of one subject — which is exactly the shape a defect hides in.
  const byYear = new Map();
  for (const r of rows) {
    if (!byYear.has(r.year)) byYear.set(r.year, []);
    byYear.get(r.year).push(r);
  }
  const keep = new Set();
  for (const list of byYear.values()) {
    const stride = Math.max(1, Math.ceil(list.length / SAMPLE));
    for (let i = 0; i < list.length; i += stride) keep.add(list[i]);
  }
  rows = rows.filter((r) => keep.has(r));
}

const figuresDirFor = (row) =>
  args.figures && args.figures !== true
    ? path.resolve(String(args.figures))
    : path.join(FIGURES_ROOT, isAdvanced ? "jee-advanced" : String(row.year));

const plans = isAdvanced ? advancedPlans(rows) : mainPlans(rows);
console.log(
  `${rows.length} row(s) with a crop, from ${new Set(rows.map((r) => r.year)).size} year(s), ` +
    `across ${plans.length} figure pass(es) over ${new Set(plans.map((p) => p.file)).size} PDF(s)`
);

/** figureBase → every candidate rendering of its `_Q.png`, latest pass last. */
const candidates = new Map();
const notLocated = new Set();

for (const [i, plan] of plans.entries()) {
  const pdfPath = path.join(String(args.dir), plan.file);
  if (!fs.existsSync(pdfPath)) {
    console.log(`  [${i + 1}/${plans.length}] ${plan.file} — NOT FOUND, skipped`);
    continue;
  }
  rendered = new Map();
  let parts, missing;
  try {
    ({ parts, missing } = extractFigures({
      pdfPath, outDir: SANDBOX, mode: plan.mode, fullWidth: plan.fullWidth,
      wanted: plan.entries.map((e) => e.want),
    }));
  } catch (e) {
    console.log(`  [${i + 1}/${plans.length}] ${plan.file} — figure pass failed: ${e.message}`);
    continue;
  }
  for (const base of missing ?? []) notLocated.add(base);

  for (const { row, want } of plan.entries) {
    const mine = parts.get(row.figureBase);
    if (!mine?.regions?.length) continue;
    const bytes = rendered.get(`${row.figureBase}_Q.png`);
    if (!candidates.has(row.figureBase)) candidates.set(row.figureBase, []);
    candidates.get(row.figureBase).push({
      file: plan.file, mode: plan.mode,
      // The number the converter actually ANCHORED on, not the one asked for.
      // An ALLEN per-subject booklet numbers its 25 chemistry questions 51-75
      // and extractFigures reads that base off the page, so asking "is question
      // 6's number in this crop" of a crop headed "56." would answer no for
      // every question in the file.
      printedNumber: mine.anchorNumber ?? want.printedNumber,
      regions: mine.regions, bytes,
    });
  }
  process.stdout.write(`  [${i + 1}/${plans.length}] ${plan.file}\r`);
}
console.log(`\nrectangles re-derived for ${candidates.size} row(s)`);

/* ------------------------------ read the crops ---------------------------- */

const findings = [];
const docs = new Map();
const caches = new Map();
const whole = new Map();
const openDoc = (file) => {
  const full = path.join(String(args.dir), file);
  if (!docs.has(file)) {
    docs.set(file, mupdf.Document.openDocument(fs.readFileSync(full), "application/pdf"));
    caches.set(file, new Map());
  }
  return { doc: docs.get(file), cache: caches.get(file) };
};
const wholeOf = (file) => {
  if (!whole.has(file)) {
    const { doc, cache } = openDoc(file);
    whole.set(file, documentText(doc, cache));
  }
  return whole.get(file);
};

for (const row of rows) {
  const name = String(row.questionImage).split(/[\\/]/).pop();
  const onDisk = path.join(figuresDirFor(row), name);
  const list = candidates.get(row.figureBase) ?? [];

  const finding = { row, name, verdict: null, detail: "" };
  if (!list.length) {
    finding.verdict = notLocated.has(row.figureBase) ? "not-located" : "no-rect";
    findings.push(finding);
    continue;
  }

  // The published crop is whichever pass wrote it last — but "last" is an
  // assumption, and the bytes are not. Take the candidate that reproduces the
  // file on disk exactly; where none does, keep the last and say so.
  const published = fs.existsSync(onDisk) ? fs.readFileSync(onDisk) : null;
  const exact = published ? list.find((c) => c.bytes && c.bytes.equals(published)) : null;
  const chosen = exact ?? list[list.length - 1];
  finding.source = chosen.file;
  finding.reproduced = Boolean(exact);
  // Re-cutting today does not give back the published crop. The rectangle has
  // moved since it was cut — figures.mjs changed after the run that wrote it —
  // so the text read below is the text of the crop this code would produce NOW,
  // and the sizes say how far the two are apart.
  if (published && !exact) finding.size = `${pngSize(chosen.bytes)} now, ${pngSize(published)} published`;
  if (!published) { finding.verdict = "crop-missing"; findings.push(finding); continue; }

  const { doc, cache } = openDoc(chosen.file);
  const { text: cropText, blockOrder, lines } = textInRegions(doc, cache, chosen.regions);
  const { text: stem, citation } = storedStem(row);
  const r = compare(stem, cropText, blockOrder);

  finding.verdict = opensWithAnswer(lines) ? "crop-shows-answer"
    : citation && sig(stem).length < MIN_SIG ? "citation-only"
    : r.verdict;
  finding.stem = stem;
  finding.cropText = cropText;
  finding.cropAlt = blockOrder;
  finding.agrees = r.agrees;
  finding.overlap = r.overlap;
  finding.tailIn = r.tailIn;
  finding.anchorIn = anchorInCrop(lines, chosen.mode, chosen.printedNumber);
  finding.pages = chosen.regions.map((g) => g.pageIndex + 1).join("+");

  // A disagreement is only evidence against the CROP if some part of the stem
  // is printed somewhere this crop is not.
  if (finding.verdict === "mismatch") {
    const { text, marks } = wholeOf(chosen.file);
    const probes = probesOf(r.want);
    const outside = probes.filter((p) => !r.inCrop(p));
    finding.coverage = probes.length ? (probes.length - outside.length) / probes.length : 0;
    const found = outside.map((p) => text.indexOf(p)).filter((i) => i >= 0);
    finding.elsewhere = found.length ? pageOf(Math.min(...found), marks) : null;
    finding.verdict = found.length ? "mismatch-elsewhere" : "mismatch-unprinted";
  }
  findings.push(finding);
}

/* --------------------------------- report --------------------------------- */

const SCORED = new Set(["match", "match-weak", "mismatch-elsewhere", "mismatch-unprinted"]);
const years = [...new Set(findings.map((f) => f.row.year))].sort();
const tally = (list, v) => list.filter((f) => f.verdict === v).length;

console.log(
  "\nYEAR   checked  matched  mismatched   rate   stem outside crop  weak-stem  not-reproduced  other"
);
let totChecked = 0, totMatch = 0, totMiss = 0, totRegion = 0;
for (const y of years) {
  const list = findings.filter((f) => f.row.year === y);
  const scored = list.filter((f) => SCORED.has(f.verdict));
  const matched = scored.filter((f) => f.verdict.startsWith("match")).length;
  const missed = scored.length - matched;
  // The stem IS printed in this file, and the crop does not contain it: the
  // rectangle is over the wrong part of the paper.
  const region = tally(list, "mismatch-elsewhere");
  const weak = tally(list, "match-weak");
  const unrep = scored.filter((f) => f.reproduced === false).length;
  const other = list.length - scored.length;
  totChecked += scored.length; totMatch += matched; totMiss += missed; totRegion += region;
  const rate = scored.length ? ((matched / scored.length) * 100).toFixed(1) : "—";
  console.log(
    `${String(y).padEnd(6)} ${String(scored.length).padStart(7)} ${String(matched).padStart(8)} ` +
      `${String(missed).padStart(11)} ${String(rate + "%").padStart(7)} ${String(region).padStart(19)} ` +
      `${String(weak).padStart(10)} ${String(unrep).padStart(15)} ${String(other).padStart(6)}`
  );
}
console.log(
  `TOTAL  ${String(totChecked).padStart(7)} ${String(totMatch).padStart(8)} ${String(totMiss).padStart(11)} ` +
    `${String(((totMatch / Math.max(1, totChecked)) * 100).toFixed(1) + "%").padStart(7)} ` +
    `${String(totRegion).padStart(19)}`
);

/* --------------------------- what a pass is worth -------------------------- */

// The same test, run against the WRONG stem on purpose: each crop measured
// against the next question's text in the same paper and subject. A crop
// legitimately holds more than its own stem — the whole of a JEE Advanced
// question including its choices, and often the number of the question below —
// so "the stored text is in there somewhere" is only evidence if the text of a
// DIFFERENT question is not. Whatever this line reports is the rate at which a
// pass above means nothing.
{
  const scored = findings.filter((f) => SCORED.has(f.verdict) && f.cropText != null);
  const groups = new Map();
  for (const f of scored) {
    const k = `${f.row.paperId ?? f.row.year}|${f.row.subject}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  let tried = 0, wrongPassed = 0;
  for (const list of groups.values()) {
    list.sort((p, q) => p.row.questionNumber - q.row.questionNumber);
    for (let i = 0; i + 1 < list.length; i++) {
      const other = compare(list[i + 1].stem, list[i].cropText, list[i].cropAlt);
      if (other.verdict === "untestable") continue;
      tried++;
      if (other.verdict.startsWith("match")) wrongPassed++;
    }
  }
  if (tried) {
    console.log(
      `\ncontrol: the same test against the NEXT question's stem passes ${wrongPassed}/${tried} ` +
        `(${((wrongPassed / tried) * 100).toFixed(1)}%) — that is what a match above is worth.`
    );
  }
}

const skipped = findings.filter((f) => !SCORED.has(f.verdict));
if (skipped.length) {
  const by = {};
  for (const f of skipped) by[f.verdict] = (by[f.verdict] || 0) + 1;
  console.log(`\nnot scored: ${JSON.stringify(by)}`);
  console.log(
    "  crop-shows-answer — the picture OPENS with the answer line: it is a crop of the key, not\n" +
      "                  the question. Listed in full below.\n" +
      "  untestable    — the stored stem is under " + MIN_SIG + " significant characters\n" +
      "  citation-only — the stem is the citation written over a row too thin to import\n" +
      "  not-located   — extractFigures found no anchor for it in the PDF\n" +
      "  no-rect       — the figure pass produced no rectangle for it\n" +
      "  crop-missing  — the row names a crop that is not in the figures folder"
  );
}

const moved = findings.filter((f) => f.reproduced === false);
if (moved.length) {
  // Not a defect in the published crop — a warning that the pipeline no longer
  // reproduces it. Every rectangle here was derived by the CURRENT figures.mjs
  // and differs from the PNG that was published, so re-running the converter
  // would rewrite these crops.
  console.log(
    `\n${moved.length} crop(s) that the CURRENT figures.mjs no longer reproduces byte for byte ` +
      `(the other ${findings.length - moved.length} are identical):`
  );
  for (const f of moved.slice(0, EXAMPLES)) {
    const r = f.row;
    console.log(
      `  ${r.year} ${r.sessionLabel ?? ""} ${r.subject} Q${r.questionNumber} [${f.name}] ` +
        `${f.size ?? ""} — verdict ${f.verdict}`
    );
  }
  if (moved.length > EXAMPLES) console.log(`  … and ${moved.length - EXAMPLES} more`);
}

const answerCrops = findings.filter((f) => f.verdict === "crop-shows-answer");
if (answerCrops.length) {
  console.log(
    `\n${answerCrops.length} CROP(S) OF THE ANSWER RATHER THAN THE QUESTION — the picture opens ` +
      `with the answer line:`
  );
  for (const f of answerCrops.slice(0, EXAMPLES)) {
    const r = f.row;
    console.log(
      `  ${r.year} ${r.sessionLabel ?? ""} ${r.subject} Q${r.questionNumber} [${f.name}] ` +
        `page ${f.pages} of ${f.source}\n    crop: ` +
        String(f.cropText).replace(/\s+/g, " ").trim().slice(0, 140)
    );
  }
  if (answerCrops.length > EXAMPLES) console.log(`  … and ${answerCrops.length - EXAMPLES} more`);
}

const wrongRegion = findings.filter((f) => f.verdict === "mismatch-elsewhere");
const unprinted = findings.filter((f) => f.verdict === "mismatch-unprinted");
if (wrongRegion.length || unprinted.length) {
  // WHICH RECORD IS WRONG. The prefix test only says the two disagree, and
  // "disagree" has two causes that want opposite repairs. The document search
  // separates them on evidence rather than on a threshold: the stem is either
  // printed somewhere this crop is not — the crop is over the wrong region —
  // or it is printed nowhere in the paper, in which case it is not a
  // transcription of anything and the crop cannot be judged against it.
  console.log(
    `\n${wrongRegion.length + unprinted.length} MISMATCH(ES): ` +
      `${wrongRegion.length} where the stem IS printed in this file but OUTSIDE the crop — ` +
      `either the crop is over the wrong region\n` +
      `                 or the stored stem was scraped from one, and the crop text below says ` +
      `which;\n` +
      `                 ${unprinted.length} where the stem is printed nowhere in the file, so it ` +
      `is not a transcription of this paper\n` +
      `                 and the crop cannot be judged against it.`
  );

  const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const show = (list, title) => {
    if (!list.length) return;
    // Worst first: the ones with the least of their stem inside their crop.
    list.sort((p, q) => (p.coverage ?? 0) - (q.coverage ?? 0) || p.agrees - q.agrees);
    console.log(`\n${title}\n`);
    for (const f of list.slice(0, EXAMPLES)) {
      const r = f.row;
      console.log(
        `${r.year} ${r.sessionLabel ?? r.session ?? ""} ${r.subject} Q${r.questionNumber}  [${f.name}]`
      );
      console.log(
        `  crop is page ${f.pages} of ${f.source}${f.reproduced ? "" : "  (crop NOT reproduced)"}` +
          (f.elsewhere ? `; the stem is printed on page ${f.elsewhere}` : "")
      );
      console.log(`  stored: ${clip(f.stem, 200)}`);
      console.log(`  crop  : ${clip(f.cropText, 200)}`);
      console.log(
        `  agrees on ${f.agrees}/${Math.min(SIG_PREFIX, sig(f.stem).length)} leading characters; ` +
          `${((f.coverage ?? 0) * 100).toFixed(0)}% of the stem's ${PROBE}-character runs are inside ` +
          `the crop; own number in crop: ${f.anchorIn ? "yes" : "no"}\n`
      );
    }
    if (list.length > EXAMPLES) console.log(`  … and ${list.length - EXAMPLES} more\n`);
  };
  show(wrongRegion, "── THE STEM IS PRINTED IN THIS FILE, OUTSIDE THIS CROP ──");
  show(unprinted, "── the stored text is printed nowhere in the file ──");
}

if (args.json && args.json !== true) {
  fs.writeFileSync(
    String(args.json),
    JSON.stringify(
      findings.map((f) => ({
        year: f.row.year, paper: f.row.sessionLabel ?? f.row.session, subject: f.row.subject,
        questionNumber: f.row.questionNumber, figureBase: f.row.figureBase, image: f.name,
        verdict: f.verdict, reproduced: f.reproduced ?? null, size: f.size ?? null,
        source: f.source ?? null,
        pages: f.pages ?? null, stemPrintedOnPage: f.elsewhere ?? null,
        agrees: f.agrees ?? null, overlap: f.overlap ?? null, coverage: f.coverage ?? null,
        ownNumberInCrop: f.anchorIn ?? null, stemTailInCrop: f.tailIn ?? null,
        stored: f.stem ?? null, crop: f.cropText ?? null,
      })),
      null, 2
    )
  );
  console.log(`\nfindings written to ${args.json}`);
}

try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch { /* nothing was written into it */ }
// Straight out, without waiting on the WASM finalisers: mupdf 1.28 crashes in
// fz_drop_stext_page on the way down once a run has held this many pages, and
// the report is already printed by then.
process.exit(totMiss ? 1 : 0);
