// One place that turns a candidate's filter selection into a database query.
//
// WHY THIS IS A MODULE AND NOT A FEW LINES IN EACH CALLER
//
// Three things ask "which questions match?" — the filter picker that offers the
// options, the preview that says "412 questions found", and the generator that
// draws the paper. If any two of them build that query differently the platform
// lies: the preview promises 412 and the generator finds 38, or worse, the
// preview counts one topic and the generator draws from the whole subject.
//
// The generator did exactly that. When a chapter filter matched fewer questions
// than the paper needed it silently redrew from the WHOLE SUBJECT and carried
// on, so a candidate who asked for 30 questions on Phase Diagrams got a paper of
// general metallurgy with a note about it. That is not a narrower version of
// what was asked for, it is a different paper.
//
// So the rule this module exists to enforce: THE POOL IS THE FILTER. Nothing
// outside the selection may enter a paper, for any reason. Too few questions is
// reported as too few — the candidate can widen the filter, and only they can
// decide which way to widen it.

/** Rows that can be put in front of a candidate and scored. */
export const DRAWABLE = {
  // No key means we do not know the answer; scoring it would teach a guess.
  correctAnswer: { not: null },
  // "bonus" and "needs_review" are not wrong data, they are unscoreable data.
  status: "ok",
};

/**
 * How many values one filter may carry.
 *
 * Each becomes an SQL `IN (...)`, and these endpoints are public and
 * unauthenticated, so a query string with fifty thousand comma-separated
 * entries is a free way to make the database do work. No real selection is
 * anywhere near this: the deepest facet in the archive has a few hundred
 * chapters.
 */
const MAX_LIST = 500;

const list = (v) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [])
    .map((x) => (typeof x === "string" ? x.trim() : x))
    .filter((x) => x !== "" && x !== null && x !== undefined)
    .slice(0, MAX_LIST);

/**
 * Whole numbers only, and only plausible ones.
 *
 * `year`, `shift` and `marks` are Int columns; a fractional or astronomically
 * large value reaches Postgres as an out-of-range integer and the whole request
 * 500s rather than simply matching nothing.
 */
const ints = (v) =>
  list(v)
    .map(Number)
    .filter((n) => Number.isSafeInteger(n) && Math.abs(n) <= 100000);

/** A flag from a query string, where everything arrives as text. */
const truthy = (v) => {
  if (typeof v === "boolean") return v;
  if (v === null || v === undefined) return false;
  return !/^(0|false|no|off|)$/i.test(String(v).trim());
};

/**
 * Read a filter selection off a query string or a JSON body.
 *
 * Both forms reach the same shape: GET carries comma-joined strings, POST
 * carries real arrays.
 */
export function normalizeSpec(raw = {}) {
  // Number(null) is 0, not NaN — so an absent bound normalised twice became the
  // year 0, and `yearFrom` and `yearTo` together produced "between 0 and 0",
  // which matches nothing. Every facet came back empty for every exam. The
  // guard is on the value being present at all, not on it parsing.
  const num = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const yearFrom = num(raw.yearFrom);
  const yearTo = num(raw.yearTo);
  return {
    examCode: raw.examCode ?? null,
    years: ints(raw.years),
    yearFrom,
    yearTo,
    sessions: list(raw.sessions),
    shifts: ints(raw.shifts),
    papers: list(raw.papers ?? raw.paperIds),
    subjects: list(raw.subjects),
    topics: list(raw.topics),
    chapters: list(raw.chapters),
    sections: list(raw.sections),
    questionTypes: list(raw.questionTypes),
    marks: ints(raw.marks),
    difficulty: raw.difficulty || "mixed",
    totalQuestions: num(raw.totalQuestions),
    // Questions the extraction could not render as text and has no crop for.
    // Excluded by default: a paper is no use if a question in it cannot be read.
    //
    // NOT Boolean(): a query string carries strings, and Boolean("false") and
    // Boolean("0") are both true — so `?includeNeedsFigure=false` turned the
    // exclusion OFF, which is the opposite of what it says.
    includeNeedsFigure: truthy(raw.includeNeedsFigure),
  };
}

/**
 * The Prisma `where` for one filter selection.
 *
 * `extra` is merged as an additional AND clause, which is how the generator
 * adds its per-subject and per-section constraints without being able to
 * weaken anything the candidate chose.
 */
export function buildQuestionWhere(spec, extra = null) {
  const s = spec.examCode ? spec : normalizeSpec(spec);
  const and = [];

  // Year: an explicit list wins over a range, because a candidate who ticked
  // individual years meant those years.
  if (s.years.length) and.push({ year: { in: s.years } });
  else if (s.yearFrom !== null || s.yearTo !== null) {
    and.push({
      year: {
        ...(s.yearFrom !== null ? { gte: s.yearFrom } : {}),
        ...(s.yearTo !== null ? { lte: s.yearTo } : {}),
      },
    });
  }

  // A session is stored under two different names depending on which importer
  // wrote the row — `session` on the dataset imports, `sessionLabel` on the
  // converted papers — so a selection has to match either or a JEE Main
  // candidate filtering by "January" gets nothing.
  if (s.sessions.length) {
    and.push({ OR: [{ session: { in: s.sessions } }, { sessionLabel: { in: s.sessions } }] });
  }
  if (s.shifts.length) and.push({ shift: { in: s.shifts } });
  if (s.papers.length) and.push({ paperId: { in: s.papers } });
  if (s.subjects.length) and.push({ subject: { in: s.subjects } });

  // Topic and chapter are separate levels — GATE's topic is "Physical
  // Metallurgy" and its chapter "Phase Diagram" — but the JEE importers write
  // the same value into both. Matching either column keeps one selection
  // working across both conventions.
  if (s.topics.length) {
    and.push({ OR: [{ topic: { in: s.topics } }, { chapter: { in: s.topics } }] });
  }
  if (s.chapters.length) {
    and.push({ OR: [{ chapter: { in: s.chapters } }, { topic: { in: s.chapters } }] });
  }

  if (s.sections.length) {
    // GATE and NEET rows carry no section, so asking for "A" must not exclude
    // an exam that never had sections in the first place.
    and.push({
      OR: [
        { section: { in: s.sections } },
        ...(s.sections.includes("A") ? [{ section: null }] : []),
      ],
    });
  }
  if (s.questionTypes.length) and.push({ questionType: { in: s.questionTypes } });
  if (s.marks.length) and.push({ marksCorrect: { in: s.marks } });
  if (extra) and.push(extra);

  return {
    ...(s.examCode ? { examCode: s.examCode } : {}),
    ...DRAWABLE,
    ...(s.includeNeedsFigure ? {} : { needsFigure: false }),
    ...(and.length ? { AND: and } : {}),
  };
}

/**
 * The BROWSE filters — exam, year, session, subject, chapter — as one `where`.
 *
 * Separate from buildQuestionWhere above because the two answer different
 * questions. That one builds the pool a PAPER may be drawn from, so it folds in
 * DRAWABLE and excludes needsFigure rows: nothing unscoreable may reach a
 * candidate. This one builds a LIST, where the unscoreable rows are frequently
 * the whole point — the admin table exists to find them.
 *
 * Shared by the public list (listPyqs) and the admin table so a filter cannot
 * mean two things. The admin table is how a broken row gets fixed and the public
 * list is where the fix shows up; if "session=January" selected different rows
 * in each, an editor would fix a question the candidate never sees.
 *
 * `examCode` is expected already resolved by resolvePyqExamCode — the callers
 * differ on what an unknown exam means (the public list 404s, the admin table
 * shows every exam) and that decision does not belong here.
 */
export function buildBrowseWhere(raw = {}) {
  const and = [];
  const year = Number(raw.year);
  if (Number.isSafeInteger(year)) and.push({ year });
  if (raw.subject) and.push({ subject: raw.subject });

  // Matched against BOTH session columns, because which one is populated
  // depends on which importer wrote the row — 6,264 rows carry `session` and
  // 4,905 carry `sessionLabel`. Reading only `session`, as this used to, made
  // the filter silently miss every converted paper.
  if (raw.session) {
    and.push({ OR: [{ session: raw.session }, { sessionLabel: raw.session }] });
  }

  // Topic and chapter are separate levels for GATE and the same value for the
  // JEE importers, so a selection matches either column. Same rule as
  // buildQuestionWhere, for the same reason.
  const chapter = raw.chapter || raw.topic;
  if (chapter) and.push({ OR: [{ chapter }, { topic: chapter }] });

  return {
    ...(raw.examCode ? { examCode: raw.examCode } : {}),
    ...(and.length ? { AND: and } : {}),
  };
}

/**
 * Every facet the archive actually holds for one exam, with counts.
 *
 * Derived, never hardcoded. A hardcoded list of years goes stale the moment a
 * paper is added, and a hardcoded list of chapters offers the candidate a
 * chapter the bank cannot fill — which turns the picker into a way to produce
 * an error message.
 *
 * `scope` narrows the counts to the candidate's selection so far, so the
 * numbers beside each remaining option are what they would actually get.
 */
export async function examFacets(prisma, examCode, scope = {}) {
  const where = buildQuestionWhere({ ...normalizeSpec(scope), examCode });

  const [years, sessions, shifts, papers, tree, types, marks, total] = await Promise.all([
    prisma.previousYearQuestion.groupBy({
      by: ["year"], where, _count: { _all: true }, orderBy: { year: "desc" },
    }),
    prisma.previousYearQuestion.groupBy({
      by: ["sessionNumber", "sessionLabel"], where, _count: { _all: true },
    }),
    prisma.previousYearQuestion.groupBy({
      by: ["shift", "shiftLabel"], where, _count: { _all: true },
    }),
    prisma.previousYearQuestion.groupBy({
      by: ["paperId", "dateLabel", "shiftLabel", "year"], where, _count: { _all: true },
    }),
    prisma.previousYearQuestion.groupBy({
      by: ["subject", "topic", "chapter"], where, _count: { _all: true },
    }),
    prisma.previousYearQuestion.groupBy({
      by: ["questionType"], where, _count: { _all: true },
    }),
    prisma.previousYearQuestion.groupBy({
      by: ["marksCorrect"], where, _count: { _all: true },
    }),
    prisma.previousYearQuestion.count({ where }),
  ]);

  // subject → topic → chapter, counted at every level, so the UI can show
  // "Physical Metallurgy (48)" and "Phase Diagram (11)" under it.
  const subjects = new Map();
  for (const row of tree) {
    const n = row._count._all;
    const s = subjects.get(row.subject) ?? { subject: row.subject, count: 0, topics: new Map() };
    s.count += n;
    subjects.set(row.subject, s);
    if (!row.topic) continue;
    const t = s.topics.get(row.topic) ?? { topic: row.topic, count: 0, chapters: new Map() };
    t.count += n;
    s.topics.set(row.topic, t);
    // Where chapter merely repeats the topic there is no third level to show.
    if (!row.chapter || row.chapter === row.topic) continue;
    t.chapters.set(row.chapter, (t.chapters.get(row.chapter) ?? 0) + n);
  }

  const byCount = (a, b) => b.count - a.count || String(a.label ?? "").localeCompare(String(b.label ?? ""));

  return {
    total,
    years: years.map((y) => ({ year: y.year, count: y._count._all })),
    // Only sessions that carry a LABEL. buildQuestionWhere matches a chosen
    // session against the `session` and `sessionLabel` columns and never
    // against `sessionNumber`, so a row with a number but no label used to be
    // advertised as "Session 2" with a value of "2" — and picking it matched
    // nothing at all, which reads as an archive with a hole in it rather than
    // as a filter that does not work.
    sessions: dedupe(
      sessions
        .filter((x) => x.sessionLabel)
        .map((x) => ({
          value: x.sessionLabel,
          number: x.sessionNumber,
          label: x.sessionLabel,
          count: x._count._all,
        }))
    ).sort((a, b) => (a.number ?? 99) - (b.number ?? 99) || a.label.localeCompare(b.label)),
    shifts: shifts
      .filter((x) => x.shift !== null)
      .map((x) => ({ value: x.shift, label: x.shiftLabel ?? `Shift ${x.shift}`, count: x._count._all }))
      .sort((a, b) => a.value - b.value),
    papers: papers
      .filter((x) => x.paperId)
      .map((x) => ({
        paperId: x.paperId,
        year: x.year,
        label: [x.dateLabel, x.shiftLabel].filter(Boolean).join(" · ") || String(x.year),
        count: x._count._all,
      }))
      .sort((a, b) => b.year - a.year || a.label.localeCompare(b.label)),
    subjects: [...subjects.values()]
      .map((s) => ({
        subject: s.subject,
        count: s.count,
        topics: [...s.topics.values()]
          .map((t) => ({
            topic: t.topic,
            count: t.count,
            chapters: [...t.chapters.entries()]
              .map(([chapter, count]) => ({ chapter, count }))
              .sort((a, b) => b.count - a.count),
          }))
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.count - a.count),
    questionTypes: types
      .map((t) => ({ value: t.questionType, count: t._count._all }))
      .sort(byCount),
    marks: marks
      .map((m) => ({ value: m.marksCorrect, count: m._count._all }))
      .sort((a, b) => a.value - b.value),
  };
}

/** Collapse rows that differ only in a column we did not ask the UI to show. */
function dedupe(rows) {
  const out = new Map();
  for (const r of rows) {
    const hit = out.get(r.value);
    if (hit) hit.count += r.count;
    else out.set(r.value, { ...r });
  }
  return [...out.values()];
}
