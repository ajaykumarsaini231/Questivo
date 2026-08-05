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
    if (/^SECTION\s*[-–—]?\s*\d/i.test(l.trim())) secAt.push(i);
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
      const m = /^(\d{1,2})\s*\./.exec(lines[i].trim());
      if (m && Number(m[1]) === prev + 1) { starts.push({ i, n: Number(m[1]) }); prev = Number(m[1]); }
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
  const problems = [];

  for (const d of usable) {
    let parsed;
    try { parsed = parseBooklet(await extractLines(fs.readFileSync(path.join(dir, d.file)))); }
    catch (e) { problems.push(`${d.file}: ${e.message}`); continue; }
    if (!parsed.length) { problems.push(`${d.file}: no questions parsed`); continue; }

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

      subject: d.subject, subjectId: slug(d.subject),
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
      __srcFile: (q.sources.find((s) => s.kind === "solutions") || q.sources[0]).file,
    };
  });

  /* ---------------------------- figure cutting --------------------------- */

  let cut = 0;
  if (!args["no-figures"]) {
    fs.mkdirSync(FIG_DIR, { recursive: true });
    const bySource = new Map();
    for (const r of rows) {
      if (!bySource.has(r.__srcFile)) bySource.set(r.__srcFile, []);
      bySource.get(r.__srcFile).push(r);
    }
    for (const [file, group] of bySource) {
      try {
        const { written, parts } = extractFigures({
          pdfPath: path.join(dir, file),
          outDir: FIG_DIR,
          mode: "allen",
          wanted: group.map((r) => ({
            printedNumber: r.__printed,
            baseName: r.figureBase,
            wantOptions: r.questionType !== "numerical",
            wantSolution: true,
          })),
        });
        cut += written;
        for (const r of group) {
          const p = parts.get(r.__printed);
          if (!p) continue;
          const url = (f) => (f ? (BASE ? `${BASE}/${f}` : f) : null);
          r.questionImage = url(p.stem);
          r.optionAImage = url(p.options?.A);
          r.optionBImage = url(p.options?.B);
          r.optionCImage = url(p.options?.C);
          r.optionDImage = url(p.options?.D);
          r.solutionImage = url(p.solution);
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

  rows.forEach((r) => { delete r.__printed; delete r.__srcFile; });
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
