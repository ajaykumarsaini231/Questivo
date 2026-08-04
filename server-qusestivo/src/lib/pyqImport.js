// Parsing and validation for previous-year-question imports.
//
// Separated from scripts/importPyq.mjs so the rules are testable without a
// database or a file on disk.
//
// The validation is strict on purpose. A PYQ with a wrong answer key actively
// teaches a candidate the mistake, and a PYQ with no topic is invisible to the
// pattern derivation the whole feature rests on. Both are better caught loudly
// at import than discovered in production.

import crypto from "node:crypto";
import { PYQ_EXAMS } from "./pyqPattern.js";

/** Normalise before hashing so trivial whitespace edits are not a new question. */
export const hashQuestion = (text) =>
  crypto
    .createHash("sha256")
    .update(String(text).replace(/\s+/g, " ").trim().toLowerCase())
    .digest("hex");

export const VALID_TYPES = new Set(["mcq_single", "mcq_multiple", "numerical", "integer"]);

/**
 * Parse the plain-text block format — the same layout the question generator
 * already emits, so a paper can be typed up in a text file without JSON.
 *
 *   Subject: Physics
 *   Topic: Rotational Motion
 *   Question: ...
 *   A) ...   B) ...   C) ...   D) ...
 *   Correct: B
 *   Explanation: ...
 *   ---
 */
export function parseTxt(raw) {
  const PATTERNS = {
    subject: /^Subject\s*[:\-]/i,
    topic: /^Topic\s*[:\-]/i,
    questionText: /^(?:Question|Q)\s*[:\-.]/i,
    optionA: /^A\s*[)\].:\-]/i,
    optionB: /^B\s*[)\].:\-]/i,
    optionC: /^C\s*[)\].:\-]/i,
    optionD: /^D\s*[)\].:\-]/i,
    correctAnswer: /^(?:Correct|Answer|Ans)\s*[:\-.]/i,
    solution: /^(?:Explanation|Solution|Reason)\s*[:\-.]/i,
    year: /^Year\s*[:\-]/i,
    session: /^(?:Session|Shift)\s*[:\-]/i,
  };

  const rows = [];
  for (const block of String(raw).split(/^-{3,}$/m)) {
    if (block.trim().length < 20) continue;

    const fields = {};
    let key = null;
    for (const line of block.split(/\r?\n/)) {
      const t = line.trim();
      let matched = false;
      for (const [k, re] of Object.entries(PATTERNS)) {
        if (re.test(t)) {
          key = k;
          const rest = t.replace(re, "").trim();
          fields[k] = rest ? [rest] : [];
          matched = true;
          break;
        }
      }
      // Continuation line of whatever field we are inside.
      if (!matched && key && t) (fields[key] ||= []).push(t);
    }

    const one = (k) => (fields[k] || []).join(" ").trim() || undefined;
    const many = (k) => (fields[k] || []).join("\n").trim() || undefined;
    if (!many("questionText")) continue;

    rows.push({
      subject: one("subject"),
      topic: one("topic"),
      questionText: many("questionText"),
      optionA: one("optionA"),
      optionB: one("optionB"),
      optionC: one("optionC"),
      optionD: one("optionD"),
      correctAnswer: one("correctAnswer"),
      solution: many("solution"),
      year: one("year") ? Number(one("year")) : undefined,
      session: one("session"),
    });
  }
  return rows;
}

/**
 * Validate one raw row and shape it into a database row.
 *
 * @returns {{row: object, warning: string|null} | {error: string}}
 */
export function validatePyqRow(row, ctx = {}, index = 0) {
  const where = `${ctx.file || "input"}[${index}]`;
  const err = (m) => ({ error: `${where}: ${m}` });

  const questionText = String(row.questionText || row.question || "").trim();
  if (questionText.length < 10) return err("questionText missing or too short");

  const subject = String(row.subject || "").trim();
  if (!subject) return err("subject is required");

  // Guard against a Chemistry paper being imported under a Physics label — a
  // mislabelled subject silently corrupts the whole derived pattern.
  const known = PYQ_EXAMS[ctx.examCode]?.subjects || [];
  if (known.length && !known.some((s) => s.toLowerCase() === subject.toLowerCase())) {
    return err(`subject "${subject}" is not one of ${known.join(" / ")} for ${ctx.examCode}`);
  }

  const year = Number(row.year || ctx.year);
  const maxYear = new Date().getFullYear() + 1;
  if (!Number.isInteger(year) || year < 1990 || year > maxYear) {
    return err(`year "${row.year ?? ctx.year}" is not a plausible exam year (1990-${maxYear})`);
  }

  const questionType = String(row.questionType || "mcq_single").trim();
  if (!VALID_TYPES.has(questionType)) {
    return err(`questionType "${questionType}" must be one of ${[...VALID_TYPES].join(" / ")}`);
  }

  const opts = {
    A: row.optionA ?? row.option_a,
    B: row.optionB ?? row.option_b,
    C: row.optionC ?? row.option_c,
    D: row.optionD ?? row.option_d,
  };
  const optionless = questionType === "numerical" || questionType === "integer";

  const status = String(row.status || "ok").trim();
  // A question whose options are drawn, not written — a match-the-column table,
  // a set of graphs, an equation the PDF renders as vector outlines. The text
  // checks below cannot apply: the options exist, they are just in the figure.
  // The renderer shows the scan, so the row is valid without option strings.
  const needsFigure = Boolean(row.needsFigure) || status === "needs_figure";
  // Voided by the board, marks awarded to every candidate. There is no correct
  // option to store and inventing one would teach the candidate a wrong answer.
  const isBonus = status === "bonus";
  // Key could not be established. Distinct from bonus — that means the board
  // gave the marks to everyone; this means we do not know the answer — but both
  // legitimately have no key, so both must be importable without one.
  const needsReview = status === "needs_review";
  // Two or more choices, wherever they sit — not specifically A and B.
  //
  // Real exports sometimes lose a single distractor, leaving e.g.
  // ["", "0", "32/65", "33/65"] with the correct answer intact at B. That is a
  // degraded but perfectly practisable question, and demanding A and B threw it
  // away. What actually has to hold is checked below: the correct option must
  // be present. A question whose KEY is missing is the unusable one.
  if (
    !optionless &&
    !needsFigure &&
    Object.values(opts).filter((o) => o && String(o).trim()).length < 2
  ) {
    return err(`${questionType} question needs at least two options`);
  }

  let correctAnswer = String(row.correctAnswer ?? row.correct ?? "").trim().toUpperCase();
  if (!correctAnswer && !isBonus && !needsReview) return err("correctAnswer is required");

  if (isBonus || needsReview) {
    correctAnswer = null;
  } else if (optionless) {
    const num = correctAnswer.match(/-?\d+(?:\.\d+)?/);
    if (!num) return err(`${questionType} answer "${correctAnswer}" is not a number`);
    if (questionType === "integer" && !/^-?\d+$/.test(num[0])) {
      return err(`integer answer "${num[0]}" is not a whole number`);
    }
    correctAnswer = num[0];
  } else if (questionType === "mcq_multiple") {
    const letters = [...new Set(correctAnswer.match(/[A-D]/g) || [])].sort();
    if (!letters.length) return err(`correctAnswer "${correctAnswer}" has no option letters`);
    for (const l of letters) {
      if (!opts[l]) return err(`correctAnswer names ${l} but option${l} is empty`);
    }
    correctAnswer = letters.join(",");
  } else {
    const m = correctAnswer.match(/\b([A-D])\b/);
    if (!m) return err(`correctAnswer "${correctAnswer}" is not A, B, C or D`);
    correctAnswer = m[1];
    // The stated key must point at an option that actually exists — unless the
    // options live in the figure, where there is no string to point at.
    if (!needsFigure && !opts[correctAnswer]) {
      return err(`correctAnswer is ${correctAnswer} but option${correctAnswer} is empty`);
    }
  }

  const topic = String(row.topic || "").trim() || null;

  const str = (v) => {
    const s = v == null ? "" : String(v).trim();
    return s || null;
  };
  /** An image reference the browser can resolve on its own. */
  const served = (v) => {
    const s = str(v);
    return s && /^(\/|https?:|data:)/.test(s) ? s : null;
  };
  const int = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null);
  // A "YYYY-MM-DD" from the converter, or nothing. An unparseable value becomes
  // null rather than an Invalid Date, which Postgres would reject at write time.
  const date = (v) => {
    if (!v) return null;
    const d = new Date(`${String(v).slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  return {
    row: {
      examCode: ctx.examCode,
      year,
      session: row.session ? String(row.session).trim() : ctx.session || null,
      subject,
      topic,

      // Dashboard facets. Every one is optional, so a dataset that does not
      // carry them imports exactly as it did before this block existed.
      stream: str(row.stream) ?? ctx.stream ?? null,
      sessionNumber: int(row.sessionNumber),
      sessionLabel: str(row.sessionLabel),
      paperDate: date(row.paperDate),
      dateLabel: str(row.dateLabel),
      shift: int(row.shift),
      shiftLabel: str(row.shiftLabel),
      shiftTime: str(row.shiftTime),
      paperId: str(row.paperId),
      chapter: str(row.chapter) ?? topic,
      chapterId: str(row.chapterId),
      subjectId: str(row.subjectId),
      section: str(row.section),
      questionNumber: int(row.questionNumber),
      paperQuestionNumber: int(row.paperQuestionNumber),
      questionText,
      optionA: optionless || !opts.A ? null : String(opts.A).trim(),
      optionB: optionless || !opts.B ? null : String(opts.B).trim(),
      optionC: optionless || !opts.C ? null : String(opts.C).trim(),
      optionD: optionless || !opts.D ? null : String(opts.D).trim(),
      correctAnswer,
      questionType,
      marksCorrect: Number(row.marksCorrect ?? 4),
      marksIncorrect: Number(row.marksIncorrect ?? (optionless ? 0 : -1)),
      status: needsFigure && status === "ok" ? "needs_figure" : status,

      solution: row.solution ? String(row.solution).trim() : null,
      solutionModel: row.solution ? "imported" : null,
      solutionQuality: str(row.solutionQuality),
      answerNote: str(row.answerNote),

      diagramSvg: null,
      needsFigure,
      figureHint: str(row.figureHint),
      diagramImage: str(row.diagramImage),
      diagramSource: str(row.diagramSource),

      // The question as printed, in parts.
      //
      // Only a value the browser could actually load. The converter puts BARE
      // FILE NAMES here — "JEEMain_..._Q.png" — because it does not know what
      // URL they will be served from; scripts/linkPyqFigures.mjs supplies the
      // prefix after confirming each file is on disk. Writing the bare name
      // would leave every row pointing at a relative path that resolves against
      // whatever page the candidate happens to be on.
      questionImage: served(row.questionImage),
      optionAImage: served(row.optionAImage),
      optionBImage: served(row.optionBImage),
      optionCImage: served(row.optionCImage),
      optionDImage: served(row.optionDImage),
      solutionImage: served(row.solutionImage),
      languages: Array.isArray(row.languages) && row.languages.length ? row.languages : ["en"],

      sourceUrl: row.sourceUrl || ctx.sourceUrl || null,
      sourceNote: row.sourceNote || ctx.sourceNote || null,
      // The converter may have already computed a collision-safe hash for a
      // question whose text alone cannot identify it. Respect it when present.
      questionHash: str(row.questionHash) ?? hashQuestion(questionText),
    },
    warning: topic ? null : `${where}: no topic — this question cannot inform the AI pattern`,
  };
}
