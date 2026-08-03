/**
 * Security and correctness tests for question diagrams + exam patterns.
 *
 * Run: node src/test/svgAndPattern.test.mjs
 *
 * The SVG cases matter because a model writes that markup and the browser
 * executes it in the user's origin. Treat any failure here as a live XSS.
 */
import { sanitizeSvg } from "../lib/sanitizeSvg.js";
import { getExamPattern, buildPatternBrief, getMarkingScheme } from "../agentic-mock-test/examPatterns.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`${cond ? "  PASS  " : "  FAIL  "}${label}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
};

console.log("\n=== SVG sanitizer: hostile input must not survive ===\n");

const OK = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="none" stroke="black"/><text x="50" y="55">R</text></svg>';

const clean = sanitizeSvg(OK);
check("keeps a legitimate diagram", !!clean && clean.includes("<circle"));
check("keeps text labels", !!clean && clean.includes("<text"));

const attacks = [
  ["inline script", '<svg viewBox="0 0 10 10"><script>alert(1)</script><rect x="1" y="1" width="5" height="5"/></svg>', "script"],
  ["onload handler", '<svg viewBox="0 0 10 10" onload="alert(1)"><rect x="1" y="1" width="5" height="5"/></svg>', "onload"],
  ["onclick on shape", '<svg viewBox="0 0 10 10"><rect x="1" y="1" width="5" height="5" onclick="steal()"/></svg>', "onclick"],
  ["foreignObject html", '<svg viewBox="0 0 10 10"><foreignObject><body><img src=x onerror=alert(1)></body></foreignObject><rect x="1" y="1" width="5" height="5"/></svg>', "foreignObject"],
  ["javascript: href", '<svg viewBox="0 0 10 10"><a href="javascript:alert(1)"><rect x="1" y="1" width="5" height="5"/></a></svg>', "javascript:"],
  ["external use", '<svg viewBox="0 0 10 10"><use href="https://evil.com/x.svg#a"/><rect x="1" y="1" width="5" height="5"/></svg>', "evil.com"],
  ["DOCTYPE entity", '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg viewBox="0 0 10 10"><rect x="1" y="1" width="5" height="5"/></svg>', "ENTITY"],
  ["animate attack", '<svg viewBox="0 0 10 10"><rect x="1" y="1" width="5" height="5"><animate attributeName="href" values="javascript:alert(1)"/></rect></svg>', "javascript:"],
  ["iframe", '<svg viewBox="0 0 10 10"><iframe src="https://evil.com"></iframe><rect x="1" y="1" width="5" height="5"/></svg>', "iframe"],
];

for (const [name, payload, needle] of attacks) {
  const out = sanitizeSvg(payload) || "";
  check(`strips ${name}`, !out.toLowerCase().includes(needle.toLowerCase()), out.slice(0, 70));
}

console.log("\n=== SVG sanitizer: rejects junk ===\n");
check("rejects empty", sanitizeSvg("") === null);
check("rejects non-svg", sanitizeSvg("just some text") === null);
check("rejects svg with no shapes", sanitizeSvg('<svg viewBox="0 0 1 1"></svg>') === null);
check("rejects oversized", sanitizeSvg('<svg viewBox="0 0 1 1"><rect ' + "x".repeat(25000) + '/></svg>') === null);
check(
  "adds viewBox when missing",
  (sanitizeSvg('<svg><rect x="1" y="1" width="5" height="5"/></svg>') || "").includes("viewBox")
);
check("unwraps markdown fence", !!sanitizeSvg('```svg\n' + OK + '\n```'));

console.log("\n=== Exam patterns ===\n");

const cases = [
  ["NTA_JEE_MAIN_2025", "JEE Main", 75],
  ["JEE_ADVANCED_2025", "JEE Advanced", 51],
  ["NEET_2025", "NEET UG", 180],
  ["GATE_MT", "GATE", 65],
  ["SSC_CGL_2024", "SSC CGL (Tier 1)", 100],
  ["RRB_NTPC_GRAD_06_2025", "RRB NTPC (CBT 1)", 100],
  ["UPSC_IAS_IFS_2024", "UPSC Civil Services (Prelims)", 100],
];

for (const [code, label, total] of cases) {
  const p = getExamPattern(code);
  check(`${code} -> ${label}`, p?.label === label, p?.label || "no match");
  check(`  ${label} totals ${total}Q`, p?.totalQuestions === total, String(p?.totalQuestions));
  const sum = p ? p.sections.reduce((a, s) => a + s.questions, 0) : -1;
  check(`  ${label} sections sum to total`, sum === total, `sections=${sum}`);
}

check("JEE Advanced is not matched by the generic JEE rule", getExamPattern("JEE_ADVANCED_2025").label === "JEE Advanced");
check("unknown exam returns null (no invented pattern)", getExamPattern("RANDOM_EXAM_9000") === null);
check("unknown exam brief is null", buildPatternBrief("RANDOM_EXAM_9000") === null);

const brief = buildPatternBrief("NEET_2025", { questionCount: 20 });
check("brief names the exam", brief.includes("NEET UG"));
check("brief carries marking", brief.includes("+4/-1"));
check("brief notes it is a short practice set", brief.includes("20-question practice set"));
check("brief includes style rules", brief.includes("NCERT"));

const ms = getMarkingScheme("SSC_CGL_2024");
check("marking scheme returned", ms?.totalMarks === 200, String(ms?.totalMarks));
check("marking scheme flags unverified data", ms?.verified === false);
check("marking scheme carries a source url", !!ms?.sourceUrl);

console.log(`\n${failures === 0 ? "All checks passed." : failures + " CHECK(S) FAILED"}\n`);
process.exit(failures === 0 ? 0 : 1);
