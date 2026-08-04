/**
 * PYQ layer: exam resolution, pattern derivation, import validation.
 * Run: node src/test/pyq.test.mjs
 *
 * No database and no network — every module under test is pure by design, which
 * is why the query and cache live in pyqProfile.js rather than here.
 */
import {
  resolvePyqExamCode,
  aggregatePyqProfile,
  profileToBrief,
  profileToSectionBrief,
  pyqTopicsForSubject,
  PYQ_EXAMS,
} from "../lib/pyqPattern.js";
import { parseTxt, validatePyqRow, hashQuestion } from "../lib/pyqImport.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`${cond ? "  PASS  " : "  FAIL  "}${label}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
};

/* ============================ exam resolution ============================ */

console.log("\n=== Exam codes resolve to the right PYQ bucket ===\n");

check("landing-page slug jee-main", resolvePyqExamCode("jee-main") === "JEE_MAIN");
check("db code NTA_JEE_MAIN_2025", resolvePyqExamCode("NTA_JEE_MAIN_2025") === "JEE_MAIN");
check("neet-ug slug", resolvePyqExamCode("neet-ug") === "NEET");
check("NEET_2024", resolvePyqExamCode("NEET_2024") === "NEET");
// The site stocks exactly one GATE paper — Metallurgical (MT / MME) — but the
// category table offers 20+ of them, and every spelling of MT must reach the
// bucket without dragging the others in with it.
check("GATE_MT db code", resolvePyqExamCode("GATE_MT") === "GATE_MT");
check("gate-metallurgy slug", resolvePyqExamCode("gate-metallurgy") === "GATE_MT");
check("GATE MME spelling", resolvePyqExamCode("GATE MME") === "GATE_MT");
check(
  "GATE MT display name",
  resolvePyqExamCode("GATE MT – Metallurgical Engineering") === "GATE_MT"
);

// The GATE version of the JEE Advanced trap, and a worse one: "any code
// containing GATE" used to resolve to metallurgy, so a GATE CSE candidate
// asking for previous year questions got metallurgy questions presented as
// their own paper. Ambiguous or unstocked GATE papers must resolve to null.
check("bare GATE is ambiguous, not metallurgy", resolvePyqExamCode("GATE") === null);
for (const code of [
  "GATE_CSE_2026",
  "GATE_ME",
  "GATE_EE",
  "GATE_MA",
  "GATE CH – Chemical Engineering",
]) {
  check(`${code} does NOT fall into GATE_MT`, resolvePyqExamCode(code) === null);
}

// The distinction that matters: JEE Advanced is a different paper entirely —
// multiple-correct options and a marking scheme that moves year to year — so it
// carries its own bucket. What must never happen is it falling into JEE Main,
// which would corrupt both patterns and hand Advanced candidates Main papers.
check(
  "JEE Advanced gets its own bucket",
  resolvePyqExamCode("JEE_ADVANCED") === "JEE_ADVANCED"
);
check("jee-advanced slug too", resolvePyqExamCode("jee-advanced") === "JEE_ADVANCED");
check("JEE Adv shorthand", resolvePyqExamCode("JEE Adv 2024") === "JEE_ADVANCED");
check(
  "JEE Advanced does NOT fall into JEE Main",
  resolvePyqExamCode("JEE_ADVANCED") !== "JEE_MAIN"
);
check("SSC CGL has no PYQ bucket", resolvePyqExamCode("SSC_CGL") === null);
check("UPSC has no PYQ bucket", resolvePyqExamCode("UPSC_IAS") === null);
check("empty input", resolvePyqExamCode("") === null);
check("undefined input", resolvePyqExamCode() === null);

/* =========================== pattern derivation ========================== */

console.log("\n=== Pattern is derived from the rows, not guessed ===\n");

// A miniature JEE Main history: Mechanics is over-represented on purpose.
const rows = [
  ...Array(10).fill({ subject: "Physics", topic: "Mechanics", questionType: "mcq_single", year: 2024 }),
  ...Array(4).fill({ subject: "Physics", topic: "Optics", questionType: "mcq_single", year: 2023 }),
  ...Array(3).fill({ subject: "Physics", topic: "Thermodynamics", questionType: "numerical", year: 2022 }),
  ...Array(2).fill({ subject: "Physics", topic: "Modern Physics", questionType: "mcq_single", year: 2021 }),
  ...Array(6).fill({ subject: "Chemistry", topic: "Organic", questionType: "mcq_single", year: 2024 }),
  ...Array(5).fill({ subject: "Mathematics", topic: "Calculus", questionType: "mcq_single", year: 2024 }),
];

const profile = aggregatePyqProfile(rows, "JEE_MAIN");

check("empty input yields null, not a fake profile", aggregatePyqProfile([]) === null);
check("null input yields null", aggregatePyqProfile(null) === null);
check("sampled counts every row", profile.sampled === 30, String(profile.sampled));
check("years span oldest..newest", profile.yearsCovered.join(",") === "2024,2023,2022,2021", profile.yearsCovered.join(","));
check("three subjects", profile.subjects.length === 3, String(profile.subjects.length));

const phys = profile.subjects.find((s) => s.subject === "Physics");
check("Physics share = 19/30 = 63%", phys.share === 63, String(phys.share));
check(
  "topics ranked by real frequency",
  phys.topTopics.map((t) => t.topic).join(",") === "Mechanics,Optics,Thermodynamics,Modern Physics",
  phys.topTopics.map((t) => `${t.topic}:${t.count}`).join(" ")
);
check(
  "question types reflect the rows",
  profile.questionTypes.find((t) => t.type === "numerical")?.share === 10,
  JSON.stringify(profile.questionTypes)
);

/* ============================== prompt text ============================== */

console.log("\n=== The brief is small, and says what the data says ===\n");

const brief = profileToBrief(profile);
check("brief names the sample size", brief.includes("30 real questions"));
check("brief names the year range", brief.includes("2021-2024"), brief.split("\n")[0]);
check("brief carries the frequency counts", brief.includes("Mechanics (10)"));
check("brief forbids reproducing a PYQ", /never reproduce/i.test(brief));

// The whole point of the design: the pattern reaches the model as a table, not
// as 30 questions. Guard the size so nobody later "improves" this by inlining
// the questions and quietly 100x-ing the token cost of every generation.
const briefChars = brief.length;
check(`whole-paper brief stays compact (${briefChars} chars)`, briefChars < 1200, String(briefChars));

const sectionBrief = profileToSectionBrief(profile, "Physics");
check("section brief covers only its subject", !sectionBrief.includes("Organic") && !sectionBrief.includes("Calculus"));
check("section brief carries counts", sectionBrief.includes("Mechanics x10"));
check(
  `section brief smaller than whole-paper brief (${sectionBrief.length} < ${briefChars})`,
  sectionBrief.length < briefChars
);
check("section brief is case-insensitive on subject", profileToSectionBrief(profile, "physics") !== null);
check("unknown subject yields null", profileToSectionBrief(profile, "Biology") === null);
check("null profile yields null brief", profileToBrief(null) === null);

/* ============================ topic selection ============================ */

console.log("\n=== Topic list is ranked, capped, and refuses thin data ===\n");

const topics = pyqTopicsForSubject(profile, "Physics");
check("returns topics in frequency order", topics[0] === "Mechanics" && topics[1] === "Optics");
check("respects the limit", pyqTopicsForSubject(profile, "Physics", 2).length === 2);

// Chemistry has one topic here. Over-fitting a whole section to a single topic
// seen six times would be worse than falling back to the syllabus list.
check("too-thin history returns null so the syllabus is used", pyqTopicsForSubject(profile, "Chemistry") === null);
check("unknown subject returns null", pyqTopicsForSubject(profile, "Biology") === null);
check("null profile returns null", pyqTopicsForSubject(null, "Physics") === null);

/* =========================== import validation =========================== */

console.log("\n=== Import rejects what would corrupt the pattern ===\n");

const ctx = { file: "t.json", examCode: "JEE_MAIN", year: 2024 };
const base = {
  subject: "Physics",
  topic: "Mechanics",
  questionText: "A block of mass m slides down a frictionless incline of angle theta.",
  optionA: "g sin theta",
  optionB: "g cos theta",
  optionC: "g tan theta",
  optionD: "g",
  correctAnswer: "A",
};

const ok = validatePyqRow(base, ctx, 0);
check("a good row passes", !ok.error && ok.row.correctAnswer === "A");
check("hash is set", /^[a-f0-9]{64}$/.test(ok.row.questionHash));
check("defaults to +4/-1", ok.row.marksCorrect === 4 && ok.row.marksIncorrect === -1);
check("year falls back to ctx", ok.row.year === 2024);

// The failure that actually harms a candidate: a key pointing nowhere.
check(
  "answer key pointing at an empty option is rejected",
  Boolean(validatePyqRow({ ...base, optionC: "", correctAnswer: "C" }, ctx, 0).error)
);
check(
  "answer key that is not A-D is rejected",
  Boolean(validatePyqRow({ ...base, correctAnswer: "E" }, ctx, 0).error)
);
check(
  "missing answer key is rejected",
  Boolean(validatePyqRow({ ...base, correctAnswer: "" }, ctx, 0).error)
);
check(
  "a subject from another exam is rejected",
  Boolean(validatePyqRow({ ...base, subject: "Biology" }, ctx, 0).error)
);
check(
  "an implausible year is rejected",
  Boolean(validatePyqRow({ ...base, year: 1492 }, ctx, 0).error)
);
check(
  "an unknown question type is rejected",
  Boolean(validatePyqRow({ ...base, questionType: "essay" }, ctx, 0).error)
);
check(
  "a stub question is rejected",
  Boolean(validatePyqRow({ ...base, questionText: "why?" }, ctx, 0).error)
);
check(
  "an MCQ with no options is rejected",
  Boolean(validatePyqRow({ ...base, optionA: "", optionB: "" }, ctx, 0).error)
);

// A topic-less question is importable but flagged: it shows in the PYQ list and
// contributes nothing to the pattern, which is exactly what the warning says.
const noTopic = validatePyqRow({ ...base, topic: "" }, ctx, 3);
check("a topic-less row imports with a warning", !noTopic.error && Boolean(noTopic.warning));
check("the warning explains the consequence", /pattern/i.test(noTopic.warning));

console.log("\n--- question types ---\n");

const numerical = validatePyqRow(
  { ...base, questionType: "numerical", optionA: undefined, optionB: undefined, optionC: undefined, optionD: undefined, correctAnswer: "12.5" },
  ctx,
  0
);
check("numerical needs no options", !numerical.error);
check("numeric answer preserved with decimals", numerical.row.correctAnswer === "12.5");
check("numerical options are nulled out", numerical.row.optionA === null);
check("numerical defaults to no negative marking", numerical.row.marksIncorrect === 0);
check(
  "a non-numeric answer on a numerical question is rejected",
  Boolean(validatePyqRow({ ...base, questionType: "numerical", correctAnswer: "B" }, ctx, 0).error)
);
check(
  "a decimal answer on an integer question is rejected",
  Boolean(validatePyqRow({ ...base, questionType: "integer", correctAnswer: "7.5" }, ctx, 0).error)
);

const multi = validatePyqRow({ ...base, questionType: "mcq_multiple", correctAnswer: "c,a" }, ctx, 0);
check("multi-correct keys normalise to sorted A,C", multi.row.correctAnswer === "A,C", multi.row?.correctAnswer);
check(
  "multi-correct naming an empty option is rejected",
  Boolean(validatePyqRow({ ...base, questionType: "mcq_multiple", optionD: "", correctAnswer: "A,D" }, ctx, 0).error)
);

console.log("\n--- hashing and dedupe ---\n");

check(
  "whitespace and case differences hash the same",
  hashQuestion("What  is\nthe answer?") === hashQuestion("what is the answer?")
);
check("different text hashes differently", hashQuestion("a question here") !== hashQuestion("another question"));

/* ============================== txt parser =============================== */

console.log("\n=== Text format parses ===\n");

const txt = `Subject: Physics
Topic: Optics
Question: A ray of light strikes a plane mirror at 30 degrees.
What is the angle of reflection?
A) 30 degrees
B) 60 degrees
C) 90 degrees
D) 15 degrees
Correct: A
Explanation: Angle of incidence equals angle of reflection.
---
Subject: Chemistry
Topic: Organic
Question: Which reagent converts an alkene to an alcohol?
A) HBr
B) H2O/H+
C) NaOH
D) KMnO4
Correct: B
---`;

const parsed = parseTxt(txt);
check("both blocks parsed", parsed.length === 2, String(parsed.length));
check("subject captured", parsed[0].subject === "Physics");
check("topic captured", parsed[0].topic === "Optics");
check("multi-line question body kept", parsed[0].questionText.includes("angle of reflection"));
check("options captured", parsed[0].optionB === "60 degrees");
check("answer captured", parsed[0].correctAnswer === "A");
check("explanation captured", parsed[0].solution.includes("equals"));
check("a block without an explanation still parses", parsed[1].solution === undefined);
check("empty input yields no rows", parseTxt("").length === 0);

// A "D)" option line must not be mistaken for a Diagram/other D-prefixed key.
check("option D parsed as an option", parsed[0].optionD === "15 degrees");

const validatedTxt = parsed.map((r, i) => validatePyqRow(r, ctx, i));
check("parsed text rows validate", validatedTxt.every((r) => !r.error), JSON.stringify(validatedTxt.find((r) => r.error) || ""));

/* ============================== exam table =============================== */

console.log("\n=== Exam table is consistent ===\n");

for (const [code, meta] of Object.entries(PYQ_EXAMS)) {
  check(`${code} resolves to itself`, resolvePyqExamCode(code) === code);
  check(`${code} has a label, slug and subjects`, Boolean(meta.label && meta.slug && meta.subjects?.length));
}

console.log(
  failures === 0
    ? `\n✅ All PYQ checks passed.\n`
    : `\n❌ ${failures} check(s) failed.\n`
);
process.exit(failures === 0 ? 0 : 1);
