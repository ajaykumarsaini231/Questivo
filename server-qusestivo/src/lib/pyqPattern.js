// Turn previous year questions into a paper pattern a prompt can use.
//
// ─────────────────────────────────────────────────────────────────────────
// WHY THE MODEL NEVER SEES THE PYQs THEMSELVES
//
// The obvious way to "generate a paper based on PYQs" is to put the PYQs in
// the prompt. Ten years of JEE Main is ~750 questions; at roughly 120 tokens
// each that is ~90,000 input tokens on EVERY generation, and the generator
// already makes one call per section. Against the measured Groq limits
// (compound-mini: 70,000 TPM, 250 requests/day/key) one mock test would blow
// the per-minute token budget before finishing its first section.
//
// Almost none of those tokens carry information the generator needs. What
// makes a paper "JEE-like" is the distribution — which topics recur, how
// often, in what proportion, with what question types. That is a frequency
// table. A frequency table is computed in SQL for zero tokens and serialises
// to a few hundred:
//
//   PYQ rows --(aggregate, 0 tokens)--> profile --(brief, ~250 tokens)--> prompt
//
// The second saving is topic selection. Without this, each section prompt
// carries that section's full syllabus topic list. With it, the prompt carries
// only the topics that actually repeat — fewer tokens AND a better paper,
// because the model stops sampling uniformly from a syllabus the examiner
// never samples uniformly from.
//
// This module is deliberately free of database imports so the pattern maths is
// testable on its own. The query and cache live in pyqProfile.js.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Exams with PYQ coverage. Everything else routes to the course request form.
 *
 * `subjects` is enforced at import: a row whose subject is not on this list is
 * rejected, because a mislabelled subject silently corrupts every pattern
 * derived from the table afterwards. It must therefore stay in step with
 * questivo/src/lib/exams.ts.
 *
 * GATE here is the Metallurgical Engineering paper (code MT, also written
 * "MME" — Metallurgical and Materials Engineering). That is the only GATE
 * paper the site carries; GATE CS, ME, EE and the rest are different syllabi
 * and belong in the course request queue, not in this table.
 *
 * `paperShare` is the REAL exam's subject split, as a percentage, taken from
 * the section plans in src/agentic-mock-test/examPatterns.js. It exists so the
 * archive can be compared against the paper it claims to represent — see
 * aggregatePyqProfile. Omit it for an exam whose split is not settled; the
 * comparison is then skipped rather than guessed.
 */
export const PYQ_EXAMS = {
  JEE_MAIN: {
    label: "JEE Main",
    slug: "jee-main",
    subjects: ["Physics", "Chemistry", "Mathematics"],
    // 25 questions each of 75.
    paperShare: { Physics: 33, Chemistry: 33, Mathematics: 33 },
  },
  JEE_ADVANCED: {
    label: "JEE Advanced",
    slug: "jee-advanced",
    subjects: ["Physics", "Chemistry", "Mathematics"],
    paperShare: { Physics: 33, Chemistry: 33, Mathematics: 33 },
  },
  NEET: {
    label: "NEET UG",
    slug: "neet-ug",
    subjects: ["Physics", "Chemistry", "Biology"],
    // Botany + Zoology are 45 each of 180, so Biology is half the paper.
    paperShare: { Physics: 25, Chemistry: 25, Biology: 50 },
  },
  GATE_MT: {
    label: "GATE Metallurgical Engineering (MT)",
    slug: "gate-metallurgy",
    // What the paper and the official key actually print. GATE's key has a
    // "Subject Name" column and it holds exactly two values, GA and MT — the
    // paper is 10 General Aptitude questions and 55 metallurgy ones, and it
    // never says which branch of metallurgy a question belongs to.
    //
    // The syllabus areas — Physical Metallurgy, Extractive Metallurgy and the
    // rest — used to be listed here, which meant no real GATE row could be
    // imported: its subject is "MT", and every question was rejected against a
    // list of names the source never uses. They are TOPICS, and live in
    // topicTagger.js under GATE_MT:Metallurgical Engineering.
    subjects: ["General Aptitude", "Metallurgical Engineering"],
    // 10 of 65 questions, worth 15 of 100 marks — the marks split, since that
    // is what a candidate is actually allocating time against.
    paperShare: { "General Aptitude": 15, "Metallurgical Engineering": 85 },
  },
};

/**
 * Map anything the client might send — a landing-page slug, a database exam
 * code with a year suffix, a display name — onto one of the canonical PYQ
 * buckets. Returns null for everything else, which is the signal to show the
 * course request form instead of an empty PYQ shelf.
 *
 * Order matters: JEE Advanced must not fall into the JEE Main bucket. It is a
 * different paper, and serving it JEE Main history would be worse than serving
 * none at all.
 *
 * The same trap, worse, applied to GATE. This used to return GATE_MT for any
 * code containing "GATE", but the category table carries 20+ GATE papers —
 * CSE, ME, EE, CY, MA and the rest. A GATE CSE candidate asking for previous
 * year questions was handed metallurgy questions labelled as their own paper.
 * Only the metallurgy paper resolves now; every other GATE code returns null
 * and lands in the course request queue, which is the honest answer.
 */
export function resolvePyqExamCode(input = "") {
  const c = String(input).toUpperCase().replace(/[\s-]+/g, "_");
  if (!c) return null;
  // Advanced is checked first and has its own bucket. It is a different paper
  // from JEE Main — multiple-correct options, partial credit, a marking scheme
  // that changes year to year — so mixing the two would corrupt both patterns.
  if (c.includes("ADVANCED") || c.includes("JEE_ADV")) return "JEE_ADVANCED";
  if (c.includes("JEE")) return "JEE_MAIN";
  if (c.includes("NEET")) return "NEET";
  // MT is the official paper code; MME ("Metallurgical and Materials
  // Engineering") is the same paper written out.
  if (c.includes("METALLURG") || /\bGATE_?(MT|MME)\b/.test(c)) return "GATE_MT";
  return null;
}

/* ------------------------------- profile -------------------------------- */

/** How many topics per subject reach the prompt. Beyond this is a long tail
 *  of one-offs that costs tokens without changing the paper's shape. */
const TOP_TOPICS = 12;

/**
 * How far a stored subject share may sit from the real paper's before the
 * archive stops being quotable as the paper's shape, in percentage points.
 *
 * 10 is deliberately loose. An archive is a sample and will never land exactly
 * on the official split; the point is to catch an archive that is lopsided
 * enough to mislead — 71% against a 33% target — not to demand precision.
 */
const SHARE_TOLERANCE = 10;

/**
 * Aggregate raw PYQ rows into a distribution. Pure — takes rows, returns a
 * profile, no I/O. Returns null for an empty set so callers fall back to the
 * static exam pattern rather than pretending to have data.
 *
 * @param {{subject:string, topic?:string|null, questionType:string, year:number}[]} rows
 */
export function aggregatePyqProfile(rows, examCode = null) {
  if (!rows?.length) return null;

  const bySubject = {};
  const byType = {};
  for (const r of rows) {
    if (!r?.subject) continue;
    bySubject[r.subject] ||= { total: 0, topics: {} };
    bySubject[r.subject].total++;
    if (r.topic) {
      bySubject[r.subject].topics[r.topic] = (bySubject[r.subject].topics[r.topic] || 0) + 1;
    }
    const t = r.questionType || "mcq_single";
    byType[t] = (byType[t] || 0) + 1;
  }

  const counted = Object.values(bySubject).reduce((a, s) => a + s.total, 0);
  if (!counted) return null;
  const pct = (n) => Math.round((n / counted) * 100);

  const subjects = Object.entries(bySubject)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([subject, s]) => ({
      subject,
      share: pct(s.total),
      topTopics: Object.entries(s.topics)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, TOP_TOPICS)
        .map(([topic, count]) => ({ topic, count })),
    }));

  const yearsCovered = [...new Set(rows.map((r) => r.year).filter(Number.isFinite))].sort(
    (a, b) => b - a
  );

  // Which of the exam's real subjects we actually hold questions for.
  //
  // This matters more than it looks. `share` is a share of what is STORED, not
  // of the exam. Holding only Mathematics makes it read "Mathematics: 100%",
  // and a reader — human or model — takes that as the paper's subject split.
  // JEE Main is 25 Physics + 25 Chemistry + 25 Mathematics, so acting on that
  // 100% would produce an all-Mathematics paper. Recording the gap lets
  // profileToBrief refuse to state shares it cannot support.
  const meta = PYQ_EXAMS[examCode];
  const expected = meta?.subjects || [];
  const held = new Set(subjects.map((s) => s.subject.toLowerCase()));
  const missingSubjects = expected.filter((s) => !held.has(s.toLowerCase()));

  // PRESENCE IS NOT REPRESENTATIVENESS.
  //
  // The check above only asks whether a subject appears at all, and that is not
  // enough. A JEE Main archive of 599 Mathematics questions plus 125 each of
  // Physics and Chemistry has all three subjects present — so the gap check
  // passes — while reading "Mathematics 71%, Physics 15%, Chemistry 15%" for a
  // paper that is 25/25/25. Stating that as the paper's split produces exactly
  // the Maths-heavy paper the gap check was added to prevent, just further
  // along. So the archive is also compared against the real split, and shares
  // are only claimed when it is close enough to stand behind.
  const share = meta?.paperShare;
  const skewedSubjects = share
    ? subjects
        .filter((s) => {
          const target = share[s.subject];
          return typeof target === "number" && Math.abs(s.share - target) > SHARE_TOLERANCE;
        })
        .map((s) => ({ subject: s.subject, stored: s.share, paper: share[s.subject] }))
    : [];

  const representative =
    expected.length > 0 && missingSubjects.length === 0 && skewedSubjects.length === 0;

  return {
    examCode,
    sampled: counted,
    yearsCovered,
    missingSubjects,
    /** Subjects whose stored share is too far from the real paper's to quote. */
    skewedSubjects,
    /** True only when every subject of the real paper is represented. */
    subjectCoverageComplete: expected.length > 0 && missingSubjects.length === 0,
    /**
     * True only when the archive is complete AND proportioned like the real
     * paper. This, not subjectCoverageComplete, is what gates quoting shares.
     */
    representative,
    subjects,
    questionTypes: Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .map(([type, n]) => ({ type, share: pct(n) })),
  };
}

/* ----------------------------- prompt text ------------------------------ */

const yearRange = (p) =>
  p.yearsCovered.length ? `${p.yearsCovered.at(-1)}-${p.yearsCovered[0]}` : "all years";

/**
 * Whole-paper brief.
 *
 * Only claims a subject SPLIT when the archive is REPRESENTATIVE of the real
 * paper — every subject present, and each within tolerance of its true share.
 * Otherwise the percentages describe the archive rather than the exam, and
 * stating them as the paper's shape is actively harmful: a Mathematics-only
 * archive reads "Mathematics: 100%", and a Maths-heavy one reads 71% against a
 * true 33%. Either would turn a JEE Main practice set into a Mathematics set.
 * In both cases the brief reports per-subject topic weightings only and hands
 * the subject split back to the official exam pattern, which is the authority
 * for it. Topic weighting stays trustworthy throughout — a lopsided archive
 * still tells you which topics recur WITHIN a subject.
 */
export function profileToBrief(profile) {
  if (!profile) return null;

  // `representative` covers both failure modes. The missingSubjects fallback
  // keeps briefs correct for a profile built before that flag existed.
  const partial =
    profile.representative === false || profile.missingSubjects?.length > 0;
  const lines = [
    `PREVIOUS-YEAR TOPIC WEIGHTING — from ${profile.sampled} real questions (${yearRange(profile)}):`,
  ];

  for (const s of profile.subjects) {
    const topics = s.topTopics.map((t) => `${t.topic} (${t.count})`).join(", ");
    lines.push(
      partial
        ? `- ${s.subject} — most repeated: ${topics || "n/a"}.`
        : `- ${s.subject}: ${s.share}% of the paper. Most repeated: ${topics || "n/a"}.`
    );
  }

  if (partial) {
    const gap = profile.missingSubjects?.length
      ? `covers ${profile.subjects.map((s) => s.subject).join(", ")} only — nothing is stored yet for ${profile.missingSubjects.join(", ")}`
      : `is unevenly sampled — ${(profile.skewedSubjects || [])
          .map((s) => `${s.subject} is ${s.stored}% of the archive but ${s.paper}% of the paper`)
          .join("; ")}`;
    lines.push(
      `NOTE: this archive ${gap}.`,
      "The archive's subject proportions are NOT the paper's subject split. Keep the",
      "official subject and section split for this exam, and use the topic weighting",
      "only within each subject."
    );
  } else {
    lines.push(
      `Question types actually used: ${profile.questionTypes
        .map((t) => `${t.type} ${t.share}%`)
        .join(", ")}.`,
      "Weight this paper toward the repeated topics above, in roughly these proportions."
    );
  }

  lines.push(
    "Write NEW questions at previous-year difficulty. Never reproduce a previous year question."
  );
  return lines.join("\n");
}

/**
 * Section-scoped brief: only the subject this section covers.
 *
 * The generator calls once per section, so sending the whole-paper table every
 * time would repeat two other subjects' rows for nothing.
 */
export function profileToSectionBrief(profile, subject) {
  if (!profile || !subject) return null;
  const s = profile.subjects.find((x) => x.subject.toLowerCase() === String(subject).toLowerCase());
  if (!s?.topTopics.length) return null;
  return [
    `PREVIOUS-YEAR WEIGHTING for ${s.subject} (${yearRange(profile)}, ${profile.sampled} questions analysed):`,
    s.topTopics.map((t) => `${t.topic} x${t.count}`).join(", "),
    "Those counts are how often each topic appeared in real papers. Match that emphasis.",
    "Write NEW questions at previous-year difficulty. Never reproduce a previous year question.",
  ].join("\n");
}

/**
 * Topics for a section, ordered by how often they actually appear in real
 * papers and capped so the prompt does not carry a whole syllabus.
 *
 * Returns null when the history is too thin to be a pattern, so the caller
 * keeps using the syllabus list rather than over-fitting to three questions.
 */
export function pyqTopicsForSubject(profile, subject, limit = TOP_TOPICS) {
  if (!profile || !subject) return null;
  const s = profile.subjects.find((x) => x.subject.toLowerCase() === String(subject).toLowerCase());
  if (!s || s.topTopics.length < 3) return null;
  return s.topTopics.slice(0, limit).map((t) => t.topic);
}
