/**
 * The admin question bank: does it show the broken rows, count the queues
 * honestly, and refuse an edit that would break the marker?
 *
 * Runs against the real database, like the other PYQ suites. The whole claim
 * this screen makes is about rows that actually exist — a mocked one would
 * prove nothing about whether the 1,300-odd flagged questions are reachable.
 *
 * The write test patches one real row and puts it back exactly as found.
 */

import "dotenv/config";
import prisma from "../prismaClient.js";
import { buildBrowseWhere, buildQuestionWhere } from "../lib/pyqFilters.js";
import {
  keyProblem,
  listAdminPyqs,
  getAdminPyqFacets,
  updateAdminPyq,
} from "../controllers/adminPyqController.js";

let passed = 0;
let failed = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? passed++ : failed++;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`
  );
};
const ok = (label, condition, detail = "") => {
  condition ? passed++ : failed++;
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${label}${condition ? "" : ` — ${detail}`}`);
};

/** Enough of an Express response for a controller to answer into. */
const mockRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (body) => ((res.body = body), res);
  return res;
};
const call = async (handler, req) => {
  const res = mockRes();
  await handler(req, res);
  return res;
};

/* ───────────────────────── the shared filter builder ───────────────────── */

console.log("\n=== buildBrowseWhere — one filter, one meaning ===");
{
  const where = buildBrowseWhere({ examCode: "JEE_MAIN", session: "January" });
  check("exam is a plain equality", where.examCode, "JEE_MAIN");
  ok(
    "a session matches either column",
    JSON.stringify(where.AND).includes("sessionLabel"),
    "sessionLabel is not in the clause, so converted papers would be missed"
  );

  const chapter = buildBrowseWhere({ chapter: "Rotational Motion" });
  ok(
    "a chapter matches topic as well",
    JSON.stringify(chapter.AND).includes("topic"),
    "chapter-only match misses every row the JEE importers wrote"
  );

  check("nothing selected is no clause at all", buildBrowseWhere({}), {});
  check(
    "a junk year is ignored rather than 500ing Postgres",
    buildBrowseWhere({ year: "not-a-year" }),
    {}
  );
}

/* ──────────────────────────── the list endpoint ────────────────────────── */

console.log("\n=== GET /api/admin/pyq ===");

const priority = await call(listAdminPyqs, { query: { view: "priority", limit: "50" } });
check("answers 200", priority.statusCode, 200);
ok("returns rows", priority.body.data.length > 0, "the priority queue is empty");
ok(
  "every row in the priority queue is actually broken",
  priority.body.data.every((r) => r.needsFigure || r.correctAnswer === null),
  "a healthy question is being shown as needing attention"
);
ok(
  "the queue total matches the priority count",
  priority.body.meta.total === priority.body.counts.priority,
  `total ${priority.body.meta.total} vs count ${priority.body.counts.priority}`
);

console.log(
  `\n  queues now: ${priority.body.counts.priority} need attention ` +
    `(${priority.body.counts.needsFigure} unreadable, ${priority.body.counts.missingAnswer} unkeyed)`
);

// The point of the screen: these rows exist and no candidate-facing query
// returns them.
{
  const drawable = await prisma.previousYearQuestion.count({
    where: {
      AND: [
        buildQuestionWhere({ examCode: null }),
        { OR: [{ needsFigure: true }, { correctAnswer: null }] },
      ],
    },
  });
  check("no broken row can reach a generated paper", drawable, 0);
}

// Counts are scoped to the filters but not to the view, or every chip reads
// either "the number you are looking at" or zero.
{
  const inAnswerQueue = await call(listAdminPyqs, { query: { view: "missingAnswer", limit: "5" } });
  /**
   * Compared with slack, not for equality.
   *
   * The two numbers come from two requests, and an import may be writing to
   * this table between them — which it was, and the suite failed on a genuine
   * four-row difference. What is being tested is that the chip is scoped to the
   * FILTERS and not to the VIEW; a stricter comparison tests how quiet the
   * database happened to be.
   */
  const a = inAnswerQueue.body.counts.needsFigure;
  const b = priority.body.counts.needsFigure;
  ok(
    "the figure chip still counts from inside the answer queue",
    a > 0 && Math.abs(a - b) <= Math.max(50, b * 0.02),
    `${a} vs ${b} — more than a concurrent import could explain`
  );
  ok(
    "the answer queue only holds unkeyed rows",
    inAnswerQueue.body.data.every((r) => r.correctAnswer === null),
    "a keyed question is in the missing-answer queue"
  );
}

// An exam filter narrows; an unknown one matches nothing rather than everything.
{
  const neet = await call(listAdminPyqs, { query: { examCode: "NEET", view: "all", limit: "5" } });
  ok(
    "an exam filter narrows to that exam",
    neet.body.data.every((r) => r.examCode === "NEET"),
    "another exam's rows are in a NEET filter"
  );

  const bogus = await call(listAdminPyqs, { query: { examCode: "NOT_AN_EXAM", view: "all" } });
  check("an unknown exam matches nothing", bogus.body.meta.total, 0);
}

// Paging is clamped — ?limit=abc used to reach Prisma as take: NaN.
{
  const junk = await call(listAdminPyqs, { query: { limit: "abc", page: "-4", view: "all" } });
  check("a junk limit falls back to the default", junk.body.meta.limit, 25);
  check("a negative page is clamped to the first", junk.body.meta.page, 1);
  const huge = await call(listAdminPyqs, { query: { limit: "100000", view: "all" } });
  check("a huge limit is capped", huge.body.meta.limit, 100);
}

/* ─────────────────────────────── the facets ────────────────────────────── */

console.log("\n=== GET /api/admin/pyq/facets ===");
{
  const all = await call(getAdminPyqFacets, { query: {} });
  check("answers 200", all.statusCode, 200);
  ok("offers every exam held", all.body.data.exams.length >= 4, JSON.stringify(all.body.data.exams));

  const narrowed = await call(getAdminPyqFacets, { query: { examCode: "GATE_MT" } });
  ok(
    "picking an exam narrows the subjects",
    narrowed.body.data.subjects.length < all.body.data.subjects.length,
    "subjects did not narrow"
  );
  ok(
    "picking an exam still lists the other exams",
    narrowed.body.data.exams.length === all.body.data.exams.length,
    "the exam dropdown narrowed to itself, so there is no way back"
  );
}

/* ─────────────────────────── the answer validator ──────────────────────── */

console.log("\n=== a key the marker can actually score ===");
{
  const bad = (type, key) => Boolean(keyProblem(type, key));
  check("an empty key is allowed — absent is a known state", bad("mcq_single", ""), false);
  check("null is allowed", bad("mcq_single", null), false);
  check("A is a single-answer key", bad("mcq_single", "A"), false);
  check("E is not an option", bad("mcq_single", "E"), true);
  check("two letters is not a single answer", bad("mcq_single", "A,C"), true);
  check("two letters IS a multi-answer key", bad("mcq_multiple", "A,C"), false);
  check("a number is a numerical key", bad("numerical", "4.5"), false);
  check("GATE's range form is a numerical key", bad("numerical", "0.14 to 0.16"), false);
  check("an alternatives key is numerical", bad("numerical", "0.14 to 0.16 or 14 to 16"), false);
  check("a unicode minus is still a number", bad("numerical", "−5"), false);
  check("words are not a numerical key", bad("numerical", "four point five"), true);
  check("an option letter is not a numerical key", bad("integer", "A"), true);
}

/* ────────────────────────────── the write path ─────────────────────────── */

console.log("\n=== PATCH /api/admin/pyq/:id ===");

const subject = await prisma.previousYearQuestion.findFirst({
  where: { correctAnswer: null, questionType: "mcq_single" },
  select: { id: true, questionText: true, correctAnswer: true, status: true, needsFigure: true },
});

if (!subject) {
  console.log("  SKIP  no unkeyed mcq_single row to exercise the write path on");
} else {
  const patch = (body) => call(updateAdminPyq, { params: { id: subject.id }, body });

  check("a missing row is a 404", (await call(updateAdminPyq, { params: { id: "nope" }, body: { status: "ok" } })).statusCode, 404);
  check("an unknown status is refused", (await patch({ status: "published" })).statusCode, 400);
  check("an unknown type is refused", (await patch({ questionType: "essay" })).statusCode, 400);
  check("an empty stem is refused", (await patch({ questionText: "  " })).statusCode, 400);
  check("a non-boolean flag is refused", (await patch({ needsFigure: "yes" })).statusCode, 400);
  check("an unscoreable key is refused", (await patch({ correctAnswer: "Z" })).statusCode, 400);
  check("no editable field is refused", (await patch({ examCode: "NEET" })).statusCode, 400);

  // A field outside the allow-list is ignored, not written — this is the
  // mass-assignment hole the four `data: req.body` handlers still have.
  const sneaky = await patch({ correctAnswer: "B", examCode: "NEET", questionHash: "forged" });
  check("a real edit is accepted", sneaky.statusCode, 200);
  check("the key was written", sneaky.body.data.correctAnswer, "B");
  ok(
    "examCode was NOT written",
    sneaky.body.data.examCode !== "NEET",
    "an edit moved the question into another exam's archive"
  );
  ok(
    "questionHash was NOT written",
    sneaky.body.data.questionHash !== "forged",
    "an edit broke the uniqueness that stops a re-import duplicating the row"
  );
  check("only the allowed field is reported", sneaky.body.meta.updated, ["correctAnswer"]);

  // Put it back exactly as found.
  const restored = await prisma.previousYearQuestion.update({
    where: { id: subject.id },
    data: { correctAnswer: subject.correctAnswer },
    select: { correctAnswer: true },
  });
  check("the row is left as it was found", restored.correctAnswer, subject.correctAnswer);
}

console.log(`\n${failed ? "FAILED" : "OK"} — ${passed} passed, ${failed} failed\n`);
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
