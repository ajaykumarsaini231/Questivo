#!/usr/bin/env node
// Convert the scanned "GATE papers and solutions" booklets into PYQ rows.
//
// WHY A THIRD CONVERTER
//
// convertGateMt.mjs reads a paper's text layer. convertGateScan.mjs handles a
// paper that has none, but assumes the modern shape: one year per PDF, exactly
// 65 questions, and a separate official answer-key PDF to read the key from.
//
// These volumes are none of those things. Each PDF is a compilation of up to
// five years; the papers run to 60, 65, 85 or 90 questions depending on the
// year; and there is no key file at all — the answer is printed at the head of
// each worked solution, in the second half of the same booklet.
//
// What they have that no other source here does is the SOLUTION, set out in
// full. That is why they are worth converting: it is cut out and attached, so a
// candidate reviewing an attempt sees the actual working rather than a model's
// reconstruction of it.
//
// WHAT IS AND IS NOT RECOVERED
//
// The pictures. Not the text — same rule convertGateScan.mjs established, for
// the same reason: OCR of a metallurgy paper's subscripts, Greek and equations
// produces plausible-looking wrong text, and wrong text is worse than a
// picture. Every row is `needsFigure` with a citation for a stem.
//
// The OCR IS used for two things it cannot get wrong in a damaging way:
// locating the question numbers (checked against a contiguous 1..N run), and
// guessing a syllabus topic (a wrong guess mis-files a question; it does not
// teach a wrong answer).
//
// Usage:
//   node scripts/convertGateBooklet.mjs --dir "<folder of booklet PDFs>"
//   node scripts/convertGateBooklet.mjs --dir <folder> --year 2008
//   node scripts/convertGateBooklet.mjs --dir <folder> --out data/pyq/x.json

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";

import { ocrBooklet, pageText, groupLines } from "./lib/bookletOcr.mjs";
import { segmentBooklet } from "./lib/bookletStructure.mjs";
import {
  findQuestionAnchors,
  findSolutionAnchors,
  sequenceAnchors,
  recoverMissingAnchors,
  resolveAnswers,
  findOptionMarks,
  optionBoxes,
  HEADER_FRAC,
  FOOTER_FRAC,
} from "./lib/bookletAnchors.mjs";
import { PageImages, stackCrop, spanRects, marginRuns } from "./lib/bookletCrop.mjs";
import { tagTopic } from "../src/lib/topicTagger.js";

/* ------------------------------- constants ------------------------------ */

const EXAM_CODE = "GATE_MT";
const EXAM_NAME = "GATE Metallurgical Engineering";
const STREAM = "Metallurgical Engineering";
const DURATION_MIN = 180;

const SUBJECT_MT = "Metallurgical Engineering";
const SUBJECT_GA = "General Aptitude";

/**
 * What each paper actually is, read off its own instructions page.
 *
 * Not inferred, and not shared between years: the shape changed repeatedly over
 * this period and every field here was verified against the printed page.
 *
 *   total       questions in the paper
 *   marks       maximum marks
 *   oneMark     ranges carrying one mark; everything else carries two
 *   negDiv      wrong answer costs marks/negDiv — 4 up to 2008, 3 from 2009
 *   ga          General Aptitude's range, introduced in 2010
 *   convertTo   last question this converter handles, when the tail of the
 *               paper is in a form the schema cannot hold
 *
 * Years before 2003 are absent on purpose. They are not objective papers: 1990
 * to 2002 set fill-in-the-blanks and five-mark descriptive questions, which
 * have neither options nor a numeric answer, so there is nothing for
 * `correctAnswer` to hold and nothing for the player to render as a choice.
 */
const PAPER_SPEC = {
  2003: { total: 90, marks: 150, oneMark: [[1, 30]], negDiv: 4 },
  2004: { total: 90, marks: 150, oneMark: [[1, 30]], negDiv: 4 },
  // Q.81-85 are two-part questions ("part a" and "part b"), numbered 81(a),
  // 81(b) — one row cannot hold two stems with two keys, so they are left out
  // and reported rather than flattened into something the paper did not ask.
  2005: { total: 85, marks: 150, oneMark: [[1, 30]], negDiv: 4, convertTo: 80 },
  2006: { total: 85, marks: 150, oneMark: [[1, 20]], negDiv: 4 },
  2007: { total: 85, marks: 150, oneMark: [[1, 20]], negDiv: 4 },
  2008: { total: 85, marks: 150, oneMark: [[1, 20]], negDiv: 4 },
  2009: { total: 60, marks: 100, oneMark: [[1, 20]], negDiv: 3 },
  2010: { total: 65, marks: 100, oneMark: [[1, 25], [56, 60]], negDiv: 3, ga: [56, 65] },
  2011: { total: 65, marks: 100, oneMark: [[1, 25], [56, 60]], negDiv: 3, ga: [56, 65] },
  2012: { total: 65, marks: 100, oneMark: [[1, 25], [56, 60]], negDiv: 3, ga: [56, 65] },
  2013: { total: 65, marks: 100, oneMark: [[1, 25], [56, 60]], negDiv: 3, ga: [56, 65] },
  2014: { total: 65, marks: 100, oneMark: [[1, 25], [56, 60]], negDiv: 3, ga: [56, 65] },
};

const SOURCE_NOTE =
  "GATE Metallurgical Engineering question paper with worked solutions, from a " +
  "coaching-institute compilation supplied by the operator. © GATE committee / the " +
  "compiler. This paper is an image scan; each question is shown as the original page. " +
  "The answer key is the compiler's, not the board's.";

/* -------------------------------- helpers ------------------------------- */

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const inRanges = (n, ranges) => ranges.some(([a, b]) => n >= a && n <= b);

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

/**
 * Recover anchors OCR missed, from the ink in the number column.
 *
 * Only inside a gap bounded by two anchors that WERE read, so a recovered
 * position cannot drift onto another question. Where the gap offers more than
 * one candidate the first is taken: the window opens just below the previous
 * question's own number and the number column carries that question's option
 * labels after it, so the first run in the window is the one being looked for.
 */
function fillAnchorGaps(anchors, pages, images, total) {
  const byN = new Map(anchors.map((a) => [a.n, a]));
  const pageOf = (i) => pages.find((p) => p.index === i);

  // Runs of consecutive missing numbers, not one at a time. Requiring a known
  // anchor on BOTH sides of each individual number — which is what this did —
  // cannot start on a gap wider than one: GATE 2012 loses questions 2 to 6
  // together, and every one of them was skipped for want of the neighbour that
  // was also missing.
  const gaps = [];
  for (let n = 2; n <= total; n++) {
    if (byN.has(n)) continue;
    const start = n;
    while (n + 1 <= total && !byN.has(n + 1)) n++;
    gaps.push({ from: start, to: n });
  }

  for (const gap of gaps) {
    const prev = byN.get(gap.from - 1);
    const next = byN.get(gap.to + 1);
    if (!prev || !next) continue;
    const wanted = gap.to - gap.from + 1;

    const windows = [];
    if (prev.page === next.page) {
      windows.push({ page: prev.page, from: prev.y + 12, to: next.y - 12 });
    } else {
      windows.push({ page: prev.page, from: prev.y + 12, to: pageOf(prev.page).height * FOOTER_FRAC });
      for (let mid = prev.page + 1; mid < next.page; mid++) {
        const p = pageOf(mid);
        if (p) windows.push({ page: mid, from: p.height * HEADER_FRAC, to: p.height * FOOTER_FRAC });
      }
      windows.push({ page: next.page, from: pageOf(next.page).height * HEADER_FRAC, to: next.y - 12 });
    }

    const hits = [];
    for (const win of windows) {
      const page = pageOf(win.page);
      if (!page) continue;
      // The option labels sit in this margin too, so the ones the recogniser
      // did identify are excluded; on a four-option question that leaves the
      // question number behind.
      const optionYs = findOptionMarks(page, win.from - 40, win.to + 40).map((o) => o.y);
      for (const [top] of marginRuns(images, win.page)) {
        if (top < win.from || top > win.to) continue;
        if (optionYs.some((y) => Math.abs(y - top) < 14)) continue;
        if (!startsAParagraph(page, top)) continue;
        hits.push({ page: win.page, y: top });
      }
    }
    hits.sort((a, b) => a.page - b.page || a.y - b.y);

    // A single missing number takes the FIRST mark in the window. The window
    // opens just below the previous question's own number and closes at the
    // next one's, and within it the number column carries the missing question
    // before that question's option labels — so the first mark is it. Demanding
    // exactly one candidate instead cost 28 questions, because where OCR loses
    // a marker it usually loses some of that question's option labels too and
    // they stay in the running as rivals.
    //
    // A RUN of missing numbers has no such argument available, so it is filled
    // only when the marks in the margin are exactly as many as the questions
    // known to be missing. Anything else is a guess, and a guess here gives
    // every question in the run its neighbour's picture.
    if (wanted === 1) {
      if (hits.length) byN.set(gap.from, { n: gap.from, ...hits[0], x: 0, recovered: true });
      continue;
    }
    if (hits.length !== wanted) continue;
    for (let k = 0; k < wanted; k++) {
      byN.set(gap.from + k, { n: gap.from + k, ...hits[k], x: 0, recovered: true });
    }
  }

  return [...byN.values()].sort((a, b) => a.page - b.page || a.y - b.y);
}

/**
 * Does a new block of text begin at `y` on this page?
 *
 * The ink in the number column is not proof on its own — a speckle, a binding
 * shadow or the edge of a scanned staple all read the same way, and one of them
 * put GATE 2010's question 10 at the second line of question 9, so its picture
 * opened with the tail of the question before it.
 *
 * What a question start always has is space above it: these booklets set a
 * clear gap between questions and none between the lines within one. So the
 * candidate must sit on a line whose gap from the line above is wider than the
 * page's own line spacing.
 */
function startsAParagraph(page, y) {
  const lines = groupLines(page).sort((a, b) => a.y - b.y);
  if (lines.length < 3) return false;

  const gaps = [];
  for (let i = 1; i < lines.length; i++) gaps.push(lines[i].y - lines[i - 1].y);
  const sorted = [...gaps].sort((a, b) => a - b);
  const normal = sorted[Math.floor(sorted.length / 2)] || 1;

  // The line the ink belongs to, and the one above it.
  let idx = -1;
  let best = Infinity;
  for (let i = 0; i < lines.length; i++) {
    const d = Math.abs(lines[i].y - y);
    if (d < best) { best = d; idx = i; }
  }
  if (idx <= 0 || best > normal) return false;
  return lines[idx].y - lines[idx - 1].y > normal * 1.35;
}

/** Text near a question, for the topic guess only — never for display. */
function nearbyText(pages, from, to) {
  let out = "";
  for (let i = from.page; i <= to.page && i <= from.page + 1; i++) {
    const page = pages.find((p) => p.index === i);
    if (!page) continue;
    for (const line of groupLines(page)) {
      const top = i === from.page ? from.y - 4 : 0;
      const bottom = i === to.page ? to.y : page.height;
      if (line.y >= top && line.y <= bottom) out += line.text + " ";
    }
  }
  return out;
}

/* --------------------------------- main --------------------------------- */

async function main() {
  const args = parseArgs(process.argv);
  const dir = args.dir;
  if (!dir) {
    console.error("--dir <folder of booklet PDFs> is required");
    process.exit(2);
  }
  const OUT = args.out || path.join("data", "pyq", "gate-mt-booklet.json");
  const ONLY = args.year ? Number(args.year) : null;
  const figDir =
    args.figures && args.figures !== true
      ? args.figures
      : path.join(path.dirname(OUT), "figures-gate-booklet");
  const CACHE = path.join("data", "pyq", ".booklet-ocr");

  fs.mkdirSync(figDir, { recursive: true });

  const rows = [];
  const skipped = [];
  const notes = [];

  for (const file of fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf")).sort()) {
    const pdfPath = path.join(dir, file);
    const { pages } = ocrBooklet(pdfPath, CACHE, {
      onProgress: (d, t) => process.stderr.write(`\r  ${file}: ocr ${d}/${t}   `),
    });
    process.stderr.write("\r" + " ".repeat(60) + "\r");

    const images = new PageImages(pdfPath);

    for (const section of segmentBooklet(pages)) {
      const year = section.year;
      if (ONLY && year !== ONLY) continue;

      const spec = PAPER_SPEC[year];
      if (!spec) {
        skipped.push(
          `${year}: not an objective paper — ${year <= 2002
            ? "fill-in-the-blank and descriptive sections have no options and no numeric key"
            : "no verified paper specification"}`
        );
        continue;
      }
      if (section.solutionFrom === null) {
        skipped.push(`${year}: no solutions section found in ${file} — nothing to take a key from`);
        continue;
      }

      const paperPages = pages.slice(section.paperFrom, section.paperTo + 1);
      const solPages = pages.slice(section.solutionFrom, section.solutionTo + 1);
      const last = spec.convertTo ?? spec.total;

      /* ----------------------------- anchors ---------------------------- */

      // Three passes, each less certain than the last, and each bounded by what
      // the previous one established: markers read outright, then bare numbers
      // in the number column, then ink where even the number was lost.
      let qAnchors = sequenceAnchors(findQuestionAnchors(paperPages), spec.total);
      qAnchors = sequenceAnchors(
        recoverMissingAnchors(paperPages, qAnchors, spec.total),
        spec.total
      );
      qAnchors = fillAnchorGaps(qAnchors, paperPages, images, spec.total);

      const solAnchors = sequenceAnchors(findSolutionAnchors(solPages), spec.total);

      // A second, larger recognition of the solution pages, to recover the
      // answers the first pass dropped — see resolveAnswers(). Restricted to
      // those pages and cached, so the cost is paid once per volume.
      const { pages: hiPages } = ocrBooklet(pdfPath, CACHE, {
        ocrScale: 4.5,
        pages: Array.from(
          { length: section.solutionTo - section.solutionFrom + 1 },
          (_, i) => section.solutionFrom + i
        ),
        onProgress: (d, t) => process.stderr.write(`\r  ${year} key pass ${d}/${t}   `),
      });
      process.stderr.write("\r" + " ".repeat(40) + "\r");
      resolveAnswers(solAnchors, hiPages);

      const solByN = new Map(solAnchors.map((a) => [a.n, a]));

      const qByN = new Map(qAnchors.map((a) => [a.n, a]));
      const missing = [];
      for (let n = 1; n <= last; n++) if (!qByN.has(n)) missing.push(n);

      // A question whose own number was never found cannot be cut, and neither
      // can the one BEFORE it: without a lower boundary that crop would run on
      // through its neighbour and show the candidate two questions as one.
      // Both are dropped rather than shipped wrong.
      const unusable = new Set();
      for (const n of missing) {
        unusable.add(n);
        if (n > 1) unusable.add(n - 1);
      }
      if (missing.length) {
        notes.push(
          `${year}: ${missing.length} question number(s) not found — ${missing.slice(0, 14).join(", ")}` +
            `${missing.length > 14 ? "…" : ""}. Those and the question before each are left out ` +
            `(${unusable.size} of ${last}).`
        );
      }
      if (spec.convertTo) {
        notes.push(
          `${year}: Q.${spec.convertTo + 1}-${spec.total} are two-part linked questions ` +
            `("part a"/"part b") and are not converted.`
        );
      }

      /* ------------------------------ rows ------------------------------ */

      const facets = {
        examCode: EXAM_CODE,
        examName: EXAM_NAME,
        stream: STREAM,
        year,
        paperId: `gate-mt-${year}`,
        paperLabel: `GATE MT ${year}`,
        sessionNumber: null,
        sessionLabel: null,
        paperDate: null,
        dateLabel: String(year),
        shift: null,
        shiftLabel: "Full paper",
        shiftTime: "3 hours",
        daySlot: null,
      };

      let cut = 0;
      const oversized = [];
      for (let n = 1; n <= last; n++) {
        if (unusable.has(n)) continue;
        const a = qByN.get(n);
        const next = qByN.get(n + 1);
        const page = paperPages.find((p) => p.index === a.page);
        if (!page) continue;

        // Where this question ends: the next question's number, or — for the
        // last one on the paper — the foot of its own page.
        const endsAt = next
          ? { page: next.page, y: next.y - 6 }
          : { page: a.page, y: page.height * FOOTER_FRAC };

        const base = `GATE_MT_${year}_Q${String(n).padStart(2, "0")}`;
        const subject = spec.ga && inRanges(n, [spec.ga]) ? SUBJECT_GA : SUBJECT_MT;
        const marks = inRanges(n, spec.oneMark) ? 1 : 2;

        // Options are looked for only on the page the question starts on, and
        // only below its number. A question that spills over a page break keeps
        // its choices with the stem, which is what the importer's
        // "options are inside the stem crop" path already handles.
        const bandBottom =
          endsAt.page === a.page ? endsAt.y : page.height * FOOTER_FRAC;
        const marks4 = findOptionMarks(page, a.y + 6, bandBottom);
        const boxes = optionBoxes(marks4, page, bandBottom);

        // The stem runs from the question number to its first option, across
        // however many pages that takes.
        const firstOption = boxes ? Math.min(boxes.A[1], boxes.B[1]) : null;
        const stemEnd =
          firstOption !== null && endsAt.page === a.page
            ? { page: a.page, y: firstOption }
            : endsAt;

        // A stem taller than a page and a half is not a long question, it is a
        // boundary that went wrong — an anchor matched something that is not a
        // question, and the crop ran on until the next real one. GATE 2010's
        // question 10 came out as the instructions page, the Useful Data table
        // and questions 1 to 10 in one picture before this check existed.
        // Refuse it rather than show a candidate ten questions at once.
        const stemSpan = spanRects(paperPages, { page: a.page, y: a.y - 6 }, stemEnd);
        const stemHeight = stemSpan.reduce((s, r) => s + (r.y1 - r.y0), 0);
        if (stemHeight > page.height * 1.5) {
          oversized.push(n);
          continue;
        }

        const stemPng = stackCrop(images, stemSpan);
        let stemName = null;
        if (stemPng) {
          stemName = `${base}_Q.png`;
          fs.writeFileSync(path.join(figDir, stemName), stemPng);
        }

        // The four choices, each cut to its own box. Written only when all four
        // came out: three beside a blank fourth reads as a question with three
        // choices, which is a different question.
        const optionFiles = {};
        if (boxes && stemEnd.page === a.page) {
          for (const L of ["A", "B", "C", "D"]) {
            const [x0, y0, x1, y1] = boxes[L];
            const png = stackCrop(images, [{ page: a.page, x0, y0, x1, y1 }], { minHeight: 10 });
            if (!png) continue;
            const name = `${base}_${L}.png`;
            fs.writeFileSync(path.join(figDir, name), png);
            optionFiles[L] = name;
          }
        }
        if (Object.keys(optionFiles).length !== 4) {
          for (const name of Object.values(optionFiles)) {
            fs.rmSync(path.join(figDir, name), { force: true });
          }
          for (const k of Object.keys(optionFiles)) delete optionFiles[k];
          // The stem must then carry the choices, so re-cut it over the whole
          // question rather than stopping above where the first option was.
          const whole = stackCrop(images, spanRects(paperPages, { page: a.page, y: a.y - 6 }, endsAt));
          if (whole && stemName) fs.writeFileSync(path.join(figDir, stemName), whole);
        }

        /* --------------------------- solution --------------------------- */

        const sol = solByN.get(n);
        const solNext = solByN.get(n + 1);
        let solutionName = null;
        let answer = null;

        if (sol) {
          answer = sol.answer;
          const solPage = solPages.find((p) => p.index === sol.page);
          const solEnd = solNext
            ? { page: solNext.page, y: solNext.y - 6 }
            : solPage
              ? { page: sol.page, y: solPage.height * FOOTER_FRAC }
              : null;
          // A solution that runs to the next anchor several pages later is
          // almost always a missed anchor rather than a six-page derivation.
          // Cut it at two pages: too much working is a cosmetic fault, and the
          // alternative is a picture of somebody else's answer.
          if (solEnd && solEnd.page - sol.page <= 2) {
            const png = stackCrop(
              images,
              spanRects(solPages, { page: sol.page, y: sol.y - 6 }, solEnd)
            );
            if (png) {
              solutionName = `${base}_S.png`;
              fs.writeFileSync(path.join(figDir, solutionName), png);
            }
          }
        }

        /* ----------------------------- topic ---------------------------- */

        // From the recognised text, which is far too rough to show a candidate
        // but good enough to file a question under a chapter: the tagger needs
        // several keyword hits before it will commit, and a wrong guess here
        // mis-files a question rather than teaching a wrong answer.
        const guess = tagTopic(nearbyText(paperPages, a, endsAt), EXAM_CODE, subject);

        rows.push(
          toRow({
            n,
            facets,
            subject,
            marks,
            negDiv: spec.negDiv,
            answer,
            base,
            stemName,
            optionFiles,
            solutionName,
            topic: guess?.topic ?? null,
            topicScore: guess?.score ?? null,
            topicRunnerUp: guess?.runnerUp ?? null,
            sourceFile: file,
          })
        );
        cut++;
      }

      if (oversized.length) {
        notes.push(
          `${year}: ${oversized.length} question(s) refused for an over-long crop — ` +
            `${oversized.slice(0, 14).join(", ")}${oversized.length > 14 ? "…" : ""}. ` +
            `The boundary was wrong, so the picture would have shown more than one question.`
        );
      }

      const keyed = rows.filter((r) => r.year === year && r.correctAnswer !== null).length;
      const withSol = rows.filter((r) => r.year === year && r.solutionImage).length;
      console.log(
        `${year}: ${cut}/${last} questions cut, ${keyed} keyed, ${withSol} with a solution image`
      );
    }
  }

  /* --------------------------------- out -------------------------------- */

  rows.sort((a, b) => a.year - b.year || a.paperQuestionNumber - b.paperQuestionNumber);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2));
  fs.writeFileSync(OUT.replace(/\.json$/, "-papers.json"), JSON.stringify(buildManifest(rows), null, 2));

  const by = (fn) => rows.reduce((a, r) => ((a[fn(r)] = (a[fn(r)] || 0) + 1), a), {});
  console.log(`\n${rows.length} question(s) → ${OUT}`);
  console.log(`by year:     ${JSON.stringify(by((r) => r.year))}`);
  console.log(`by subject:  ${JSON.stringify(by((r) => r.subject))}`);
  console.log(`keyed:       ${rows.filter((r) => r.correctAnswer !== null).length}/${rows.length}`);
  console.log(`stem image:  ${rows.filter((r) => r.questionImage).length}`);
  console.log(`4 options:   ${rows.filter((r) => r.optionAImage).length}`);
  console.log(`solution:    ${rows.filter((r) => r.solutionImage).length}`);
  console.log(`topic tagged:${rows.filter((r) => r.topic).length}`);
  if (notes.length) {
    console.log(`\nnotes:`);
    for (const n of notes) console.log(`  ${n}`);
  }
  if (skipped.length) {
    console.log(`\nnot converted:`);
    for (const s of skipped) console.log(`  ${s}`);
  }
}

function toRow({
  n, facets, subject, marks, negDiv, answer, base, stemName, optionFiles,
  solutionName, topic, topicScore, topicRunnerUp, sourceFile,
}) {
  return {
    ...facets,
    subject,
    subjectId: slug(subject),
    topic,
    chapter: topic,
    chapterId: topic ? slug(topic) : null,
    topicConfidence: topicScore,
    topicRunnerUp,
    section: null,
    sectionLabel: subject,
    questionNumber: n,
    paperQuestionNumber: n,

    // The picture is the question. Saying so is better than an OCR transcript
    // of a metallurgy paper's subscripts and equations, which would look right
    // and be wrong.
    questionText: `[Shown as an image] ${EXAM_NAME} ${facets.year}, question ${n}.`,
    optionA: null, optionB: null, optionC: null, optionD: null,
    correctAnswer: answer,
    questionType: "mcq_single",
    marksCorrect: marks,
    marksIncorrect: -Number((marks / negDiv).toFixed(4)),

    solution: null, solutionQuality: null, solutionModel: null, answerNote: null,
    // No key, no serving. A question shown with a wrong answer teaches the
    // mistake, so one whose solution the reader could not find is imported for
    // review rather than published.
    status: answer ? "ok" : "needs_review",
    voidReason: answer ? null : "the compiler's solution does not state a letter for this question",

    needsFigure: true,
    figureHint: `${EXAM_NAME} ${facets.year} Q${n} (the paper is an image scan)`,
    figureBase: base,
    questionImage: stemName,
    optionAImage: optionFiles.A ?? null,
    optionBImage: optionFiles.B ?? null,
    optionCImage: optionFiles.C ?? null,
    optionDImage: optionFiles.D ?? null,
    solutionImage: solutionName,
    diagramImage: null, diagramSource: null,
    languages: ["en"],
    sourceUrl: sourceFile,
    sourceNote: SOURCE_NOTE,
    // The text cannot identify these rows — every stem is the same citation
    // line — so the hash is built from what does: the paper and the number.
    questionHash: crypto
      .createHash("sha1")
      .update(`${facets.paperId}|${subject}|${n}`)
      .digest("hex"),
  };
}

function buildManifest(rows) {
  const byPaper = new Map();
  for (const r of rows) {
    if (!byPaper.has(r.paperId)) {
      const spec = PAPER_SPEC[r.year] ?? {};
      byPaper.set(r.paperId, {
        paperId: r.paperId, examCode: r.examCode, examName: r.examName, stream: r.stream,
        year: r.year, sessionNumber: null, sessionLabel: null, paperDate: null,
        dateLabel: String(r.year), shift: null, shiftLabel: "Full paper", shiftTime: "3 hours",
        label: `GATE Metallurgical Engineering ${r.year}`,
        durationMinutes: DURATION_MIN,
        totalQuestions: 0,
        totalMarks: 0,
        // The paper-level defaults. Per-question marks differ within a paper and
        // are carried on each row; markPaper() reads those, not these.
        marksCorrect: 1,
        marksIncorrect: -Number((1 / (spec.negDiv ?? 3)).toFixed(4)),
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
