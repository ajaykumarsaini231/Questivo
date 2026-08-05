#!/usr/bin/env node
/**
 * Derive the JEE Advanced paper manifest from the converted questions.
 *
 * WHY THIS EXISTS
 *
 * PreviousYearQuestion rows alone are not a sittable paper. The picker lists
 * PyqPaper rows — one per sitting, carrying the duration, the totals and the
 * published flag — and JEE Advanced had 513 questions in the database and zero
 * paper rows, which is exactly why "Previous year papers" showed nothing for it
 * while the generator could still draw on the same questions.
 *
 * gate-mt-papers.json and jee-main-*-papers.json are the same thing, written by
 * hand. This derives it instead, because the numbers that matter — how many
 * questions, worth how many marks, in which subjects — are facts about the
 * question set and a hand-written total drifts from it the moment the converter
 * is re-run.
 *
 * TWO JUDGEMENTS IT MAKES, BOTH DELIBERATE
 *
 * 1. Subject names are normalised. The ALLEN booklets head the paper "Maths";
 *    every other exam in this archive, the generator's blueprints and the
 *    player's SUBJECT_ORDER all say "Mathematics". Left alone, a JEE Advanced
 *    paper's maths questions sort last in the palette and match no subject
 *    filter.
 *
 * 2. A paper is published only if most of its questions can actually be
 *    marked. A sitting where two thirds of the answers are unknown scores a
 *    candidate on a third of the paper and tells them it was the whole thing.
 *    Those are imported but left unpublished, so the questions remain available
 *    to the generator and the operator can release them once the keys are in.
 *
 * Usage:
 *   node scripts/buildJeeAdvancedPapers.mjs \
 *     --in data/pyq/jee-advanced-allen.json \
 *     --out data/pyq/jee-advanced-papers.json
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1]?.startsWith("--") ? true : all[i + 1]]);
    return acc;
  }, [])
);

const IN = args.in || "data/pyq/jee-advanced-allen.json";
const OUT = args.out || "data/pyq/jee-advanced-papers.json";

/** Below this share of answerable questions a paper is not worth sitting. */
const PUBLISH_THRESHOLD = Number(args.threshold ?? 0.8);

/**
 * What the booklets call a subject → what this archive calls it.
 * Only the spellings actually seen; an unknown subject passes through
 * unchanged so a new one is visible rather than silently renamed.
 */
const SUBJECT_ALIASES = {
  Maths: "Mathematics",
  Math: "Mathematics",
  Mathematic: "Mathematics",
};
const normalizeSubject = (s) => SUBJECT_ALIASES[s] ?? s;
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const rows = JSON.parse(fs.readFileSync(IN, "utf8"));

// Normalise in place and write the questions back: the manifest's subject
// counts and the question rows have to agree, and fixing only one of them is
// how a paper ends up advertising three subjects and serving two.
let renamed = 0;
let flagged = 0;
for (const r of rows) {
  const fixed = normalizeSubject(r.subject);
  if (fixed !== r.subject) {
    r.subject = fixed;
    r.subjectId = slug(fixed);
    renamed++;
  }

  /**
   * A question whose key could not be read is "needs_review", not a reject.
   *
   * The importer requires a correctAnswer unless the row says why it has none,
   * so 87 questions — the ones whose ALLEN booklet printed the answer inside an
   * image the text layer could not reach — were being thrown away entirely.
   * They are perfectly good questions to READ, and markPaper already scores a
   * keyless row as "not counted" rather than marking the candidate wrong for an
   * answer nobody knows.
   *
   * Deliberately not "bonus": bonus means the board awarded the marks to
   * everyone, which is a claim about the real exam. This only means we could
   * not extract the key.
   */
  if (!r.correctAnswer && r.status === "ok") {
    r.status = "needs_review";
    flagged++;
  }
}

const byPaper = new Map();
for (const r of rows) {
  if (!r.paperId) continue;
  if (!byPaper.has(r.paperId)) byPaper.set(r.paperId, []);
  byPaper.get(r.paperId).push(r);
}

const papers = [...byPaper.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([paperId, qs]) => {
    const first = qs[0];
    const withKey = qs.filter((q) => q.correctAnswer != null && q.correctAnswer !== "").length;
    const subjects = {};
    for (const q of qs) subjects[q.subject] = (subjects[q.subject] || 0) + 1;

    // Summed from the questions, because JEE Advanced marks PER SECTION — 3 for
    // a single-correct, 4 for a multi-correct or numerical — so no single
    // marksCorrect describes the paper.
    const totalMarks = Math.round(qs.reduce((n, q) => n + (q.marksCorrect || 0), 0));

    return {
      paperId,
      examCode: "JEE_ADVANCED",
      examName: "JEE Advanced",
      stream: "B.E./B.Tech",
      year: first.year,
      sessionNumber: first.sessionNumber ?? null,
      sessionLabel: first.sessionLabel ?? null,
      paperDate: null,
      dateLabel: first.dateLabel ?? String(first.year),
      shift: first.shift ?? null,
      shiftLabel: first.shiftLabel ?? first.sessionLabel ?? "Paper",
      shiftTime: "3 hours",
      label: `JEE Advanced ${first.year} · ${first.sessionLabel ?? "Paper"}`,
      durationMinutes: 180,
      totalQuestions: qs.length,
      totalMarks,
      // The per-question marks are what the scorer reads; these are the paper's
      // headline figures and are the most common values, not a rule.
      marksCorrect: 4,
      marksIncorrect: -1,
      sectionBAttemptLimit: null,
      subjects,
      needsFigureCount: qs.filter((q) => q.needsFigure).length,
      isPublished: withKey / qs.length >= PUBLISH_THRESHOLD,
      // Kept in the file so the decision above is auditable rather than magic.
      _answerable: `${withKey}/${qs.length}`,
    };
  });

fs.writeFileSync(IN, JSON.stringify(rows, null, 2));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(papers, null, 2));

console.log(`\n✔ ${papers.length} papers → ${OUT}`);
if (renamed) console.log(`  renamed ${renamed} rows' subject to the archive's spelling`);
if (flagged) console.log(`  flagged ${flagged} keyless rows as needs_review so they still import`);
for (const p of papers) {
  console.log(
    `  ${p.isPublished ? "live  " : "held  "} ${p.paperId.padEnd(30)} ` +
      `${String(p.totalQuestions).padStart(3)}q  ${String(p.totalMarks).padStart(3)}m  ` +
      `answerable ${p._answerable.padStart(7)}  ${JSON.stringify(p.subjects)}`
  );
}
const held = papers.filter((p) => !p.isPublished);
if (held.length) {
  console.log(
    `\n  ${held.length} paper(s) held back: fewer than ${Math.round(PUBLISH_THRESHOLD * 100)}% of ` +
      `their questions have an answer key, so they cannot be marked honestly.\n` +
      `  Their questions are still imported and still feed the generator.`
  );
}
