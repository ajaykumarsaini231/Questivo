/**
 * Section-plan tests: a full mock test must reproduce THAT exam's paper.
 * Run: node src/test/sectionPlan.test.mjs
 */
import { buildSectionPlan, describeSection, getExamPattern } from "../agentic-mock-test/examPatterns.js";
import { SYLLABI, topicsForSubject } from "../agentic-mock-test/examSyllabus.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`${cond ? "  PASS  " : "  FAIL  "}${label}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
};

console.log("\n=== Full papers reproduce the real exam ===\n");

const jee = buildSectionPlan("NTA_JEE_MAIN_2025");
check("JEE Main full paper = 75 questions", jee.totalQuestions === 75, String(jee.totalQuestions));
check("JEE Main duration 180 min", jee.durationMinutes === 180, String(jee.durationMinutes));
check("JEE Main has 6 sections (3 subjects x A/B)", jee.blocks.length === 6, String(jee.blocks.length));
check(
  "JEE Main每 subject is 20 MCQ + 5 numerical",
  jee.blocks.filter((b) => b.type === "mcq_single" && b.count === 20).length === 3 &&
    jee.blocks.filter((b) => b.type === "numerical" && b.count === 5).length === 3
);

const neet = buildSectionPlan("NEET_2025");
check("NEET full paper = 180 questions", neet.totalQuestions === 180, String(neet.totalQuestions));
check("NEET duration 180 min (not the old 200)", neet.durationMinutes === 180, String(neet.durationMinutes));
check(
  "NEET is 45 Physics / 45 Chemistry / 45+45 Bio",
  neet.blocks.map((b) => b.count).join(",") === "45,45,45,45",
  neet.blocks.map((b) => b.count).join(",")
);
check("NEET has no numerical section", !neet.blocks.some((b) => b.type === "numerical"));

const gate = buildSectionPlan("GATE_MT");
check("GATE full paper = 65 questions", gate.totalQuestions === 65, String(gate.totalQuestions));
check("GATE mixes MCQ, MSQ and NAT", new Set(gate.blocks.map((b) => b.type)).size === 3);
check(
  "GATE MSQ and NAT carry no negative marking",
  gate.blocks.filter((b) => b.type === "mcq_multiple" || b.type === "numerical").every((b) => b.marksIncorrect === 0)
);

const adv = buildSectionPlan("JEE_ADVANCED_2025");
check("JEE Advanced has a multiple-correct section", adv.blocks.some((b) => b.type === "mcq_multiple"));
check("JEE Advanced integer section has no negative marking",
  adv.blocks.filter((b) => b.type === "integer").every((b) => b.marksIncorrect === 0));

console.log("\n=== Papers differ from each other (not one shape reused) ===\n");
const shapes = ["NTA_JEE_MAIN_2025", "NEET_2025", "GATE_MT", "SSC_CGL_2024", "RRB_NTPC_GRAD_06_2025", "UPSC_IAS_IFS_2024"]
  .map((c) => {
    const p = buildSectionPlan(c);
    return `${p.totalQuestions}|${p.durationMinutes}|${p.blocks.map((b) => b.type + ":" + b.count).join(",")}`;
  });
check("all six exam shapes are distinct", new Set(shapes).size === 6, `${new Set(shapes).size}/6 unique`);

console.log("\n=== Scaled practice sets keep the paper's proportions ===\n");
const small = buildSectionPlan("NTA_JEE_MAIN_2025", 30);
check("30-question JEE set is not a full paper", small.isFullPaper === false);
check("30-question JEE set totals 30", small.totalQuestions === 30, String(small.totalQuestions));
check("still covers all 6 sections", small.blocks.length === 6, String(small.blocks.length));
check("still contains numerical questions", small.blocks.some((b) => b.type === "numerical"));
check("duration scales down", small.durationMinutes < 180 && small.durationMinutes > 0, String(small.durationMinutes));

const tiny = buildSectionPlan("NEET_2025", 8);
check("tiny NEET set totals 8", tiny.totalQuestions === 8, String(tiny.totalQuestions));
check("tiny set gives every section at least 1", tiny.blocks.every((b) => b.count >= 1));

console.log("\n=== Section briefs carry the right rules ===\n");
const numericalBlock = jee.blocks.find((b) => b.type === "numerical");
const brief = describeSection(numericalBlock);
check("numerical brief forbids options", /no options at all/i.test(brief));
check("numerical brief states the marking", /\+4 \/ -1/.test(brief), brief.split("\n")[2]);
const msq = gate.blocks.find((b) => b.type === "mcq_multiple");
check("MSQ brief says more than one may be correct", /one OR MORE/i.test(describeSection(msq)));
check("MSQ brief states no negative marking", /no negative marking/i.test(describeSection(msq)));

console.log("\n=== Syllabus wiring ===\n");
check("JEE Main syllabus is official", SYLLABI.JEE_MAIN.official === true);
check("NEET syllabus is official", SYLLABI.NEET.official === true);
check("JEE Physics has 20 official units", SYLLABI.JEE_MAIN.subjects.Physics.length === 20);
check("JEE Maths has 14 official units", SYLLABI.JEE_MAIN.subjects.Mathematics.length === 14);
check("JEE Chemistry has 20 official units", SYLLABI.JEE_MAIN.subjects.Chemistry.length === 20);
check("NEET Biology has 10 official units", SYLLABI.NEET.subjects["Biology (Botany & Zoology)"].length === 10);
check("Physics section resolves to Physics topics",
  topicsForSubject("JEE_MAIN", "Physics").includes("Rotational Motion"));
check("Biology section resolves via loose match",
  topicsForSubject("NEET", "Biology").includes("Human Physiology"));
check("unknown exam yields no topics", topicsForSubject("NOPE", "Physics").length === 0);

const p = getExamPattern("NEET_2025");
check("verified exams expose checkedOn", !!p.checkedOn, p.checkedOn);
check("pattern key is stamped for syllabus lookup", p.key === "NEET", p.key);

console.log(`\n${failures === 0 ? "All checks passed." : failures + " CHECK(S) FAILED"}\n`);
process.exit(failures === 0 ? 0 : 1);
