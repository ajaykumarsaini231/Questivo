// Model and credentials are resolved by the failover client, which rotates
// across every configured API key/provider. Adding another key to .env widens
// the pool with no change here. See src/lib/aiClient.js.
import { chat, ROLES } from "../lib/aiClient.js";
import {
  buildPatternBrief,
  getMarkingScheme,
  buildSectionPlan,
  describeSection,
} from "./examPatterns.js";
import { topicsForSubject, allTopics } from "./examSyllabus.js";
import { sanitizeSvg } from "../lib/sanitizeSvg.js";
import { findDiagramInDrive } from "../lib/driveDiagrams.js";

const NEWLINE = String.fromCharCode(10);


/* ================= CONFIGURATION ================= */
// Reduced batch size to stay under rate limits (Safe Zone)
const MAX_BATCH_SIZE = 15;
const MAX_TOTAL_RETRIES = 5;

// Independently re-solve each question and drop any whose stated answer does
// not survive. Benchmarking on 2026-08-03 caught both llama-3.3-70b-versatile
// and gpt-oss-120b confidently emitting an answer key that was not among the
// options at all — a wrong key is worse for a candidate than a missing
// question, because it teaches the mistake.
const VERIFY_ANSWER_KEYS = process.env.AI_VERIFY_ANSWER_KEYS !== "false";
// Verification runs concurrently, but the client is sticky — it sends every
// in-flight call to the same known-good credential, so a high fan-out just
// rate-limits that one key instantly. 2 measured better than 4 here.
const VERIFY_CONCURRENCY = Number(process.env.AI_VERIFY_CONCURRENCY || 2);

export async function generateQuestionsAgent({
  examType,
  topics,
  numQuestions,
  difficulty,
  sessionType,
  medium = "English",
}) {
  let totalTarget = Number(numQuestions) || 10;
  // A real full paper can exceed 100 (NEET is 180), so the cap only applies to
  // ad-hoc practice sets, not to a full mock test.
  if (totalTarget > 100 && sessionType !== "full") totalTarget = 100;

  // A full mock test must reproduce THIS exam's paper: its section split, its
  // question types, its marking. Anything else is a generic quiz wearing the
  // exam's name.
  const plan = buildSectionPlan(examType, totalTarget);
  const wantsFullPaper =
    plan && (sessionType === "full" || totalTarget >= plan.totalQuestions);

  if (plan && wantsFullPaper) {
    return generateFullPaper({ examType, plan, difficulty, medium, topics });
  }

  console.log(
    `[Groq] Generating Questions (Token Saver Mode). Target: ${totalTarget}`
  );

  let allQuestions = [];
  let loopCount = 0;
  const MAX_LOOPS = MAX_TOTAL_RETRIES + 5;

  while (allQuestions.length < totalTarget && loopCount < MAX_LOOPS) {
    const needed = totalTarget - allQuestions.length;
    // Ask for fewer questions at once to save per-minute tokens
    const currentBatchSize = Math.min(needed, MAX_BATCH_SIZE);

    if (currentBatchSize <= 0) break;

    try {
      const batchQuestions = await fetchBatchFromGroq({
        examType,
        topics,
        count: currentBatchSize,
        difficulty,
        medium,
        totalTarget,
      });

      const uniqueBatch = deduplicateAgainstList(batchQuestions, allQuestions);

      if (uniqueBatch.length > 0) {
        allQuestions.push(...uniqueBatch);
        console.log(`✅ Got ${uniqueBatch.length} questions.`);
      }

      // 🛑 CRITICAL: Wait 3 seconds to reset "Tokens per Minute" counter
      console.log("⏳ Cooling down for rate limit...");
      await new Promise((r) => setTimeout(r, 3000));
    } catch (err) {
      console.error(`❌ Batch Failed:`, err.message);
      // On error, wait longer (5s)
      await new Promise((r) => setTimeout(r, 5000));
    }
    loopCount++;
  }

  let finalQuestions = deduplicateQuestions(allQuestions).slice(0, totalTarget);

  if (VERIFY_ANSWER_KEYS && finalQuestions.length > 0) {
    finalQuestions = await verifyAnswerKeys(finalQuestions);
  }

  finalQuestions = await attachDriveDiagrams(finalQuestions);

  const numbered = finalQuestions.map((q, i) => ({
    ...q,
    question_text: `Question ${i + 1}: ${q.question_text}`,
  }));

  // Attach the exam's marking scheme so the result screen can score the paper
  // the way the real exam does instead of assuming +1/0.
  const marking = getMarkingScheme(examType);
  if (marking) {
    Object.defineProperty(numbered, "markingScheme", {
      value: marking,
      enumerable: false,
    });
  }
  return numbered;
}

/* ================= FULL PAPER (SECTION-AWARE) ================= */

/**
 * Generate a paper section by section, each with its own question type,
 * marking and syllabus topics.
 *
 * JEE Main comes out 20 MCQ + 5 numerical per subject; NEET comes out 45/45/90
 * single-correct; GATE mixes MCQ, MSQ and NAT with negative marking only on the
 * MCQs. The section plan drives all of it — no exam shares another's shape.
 */
async function generateFullPaper({ examType, plan, difficulty, medium, topics }) {
  console.log(
    `[Paper] ${plan.exam}: ${plan.totalQuestions} questions across ${plan.blocks.length} sections` +
      `${plan.isFullPaper ? " (full paper)" : " (scaled practice set)"}`
  );

  const collected = [];

  for (const block of plan.blocks) {
    // Topics come from the section's own subject, so a Physics section cannot
    // quietly fill itself with Chemistry.
    const subject = block.subjects?.[0];
    let blockTopics =
      (subject && topicsForSubject(plan.key, subject)) || allTopics(plan.key) || [];
    if (!blockTopics.length) blockTopics = topics?.length ? topics : [subject || "General"];

    let got = 0;
    let attempts = 0;
    while (got < block.count && attempts < 4) {
      const need = Math.min(block.count - got, MAX_BATCH_SIZE);
      try {
        const batch = await fetchBatchFromGroq({
          examType,
          topics: blockTopics,
          count: need,
          difficulty,
          medium,
          totalTarget: plan.totalQuestions,
          section: block,
        });
        const unique = deduplicateAgainstList(batch, collected);
        // Tag every question with the section it belongs to so the UI and the
        // scorer know which marking rule applies.
        for (const q of unique.slice(0, block.count - got)) {
          collected.push({
            ...q,
            section_name: block.name,
            question_type: block.type,
            marks_correct: block.marksCorrect,
            marks_incorrect: block.marksIncorrect,
          });
          got++;
        }
        console.log(`  ${block.name}: ${got}/${block.count}`);
      } catch (err) {
        console.error(`  ${block.name} batch failed: ${err.message}`);
      }
      attempts++;
      if (got < block.count) await new Promise((r) => setTimeout(r, 2500));
    }
  }

  let final = deduplicateQuestions(collected);
  if (VERIFY_ANSWER_KEYS && final.length > 0) {
    // Only single-correct MCQs can be checked by re-solving into A-D.
    const checkable = final.filter((q) => (q.question_type || "mcq_single") === "mcq_single");
    const rest = final.filter((q) => (q.question_type || "mcq_single") !== "mcq_single");
    const kept = await verifyAnswerKeys(checkable);
    // Preserve the section order rather than dumping verified ones first.
    const keptIds = new Set(kept.map((q) => q.id));
    final = final.filter((q) => keptIds.has(q.id) || rest.includes(q));
  }

  final = await attachDriveDiagrams(final);

  const numbered = final.map((q, i) => ({
    ...q,
    question_text: `Question ${i + 1}: ${q.question_text}`,
  }));

  const marking = getMarkingScheme(examType);
  Object.defineProperty(numbered, "markingScheme", {
    value: { ...marking, sectionPlan: plan },
    enumerable: false,
  });
  return numbered;
}

/* ================= DIAGRAM SOURCING ================= */

/**
 * Attach a figure to every question that needs one, preferring a real image
 * from Drive over a model-drawn SVG:
 *
 *   needs a diagram? -> search Drive -> found? -> download and use it
 *                                    -> not found -> keep the generated SVG
 *
 * "Needs a diagram" is taken from the model's own judgement: it was told to
 * emit a Diagram: line for figure-dependent topics, so a question carrying an
 * SVG is one it decided needed a figure. Drive is then given the chance to
 * beat it with something a human drew.
 *
 * Runs after generation so a slow Drive call never blocks question output, and
 * every failure path leaves the SVG in place.
 */
async function attachDriveDiagrams(questions) {
  const candidates = questions.filter((q) => q.diagram_svg);
  if (!candidates.length) return questions;

  let replaced = 0;
  for (const q of candidates) {
    const hit = await findDiagramInDrive(q.topic, q.question_text);
    if (!hit) continue; // keep the generated SVG
    q.diagram_image = hit.dataUri;
    q.diagram_source = "drive";
    q.diagram_name = hit.name;
    // Drop the SVG so the UI does not render two figures for one question.
    q.diagram_svg = null;
    replaced++;
  }
  if (replaced) {
    console.log(`🖼  Drive supplied ${replaced}/${candidates.length} diagrams; rest use generated SVG.`);
  }
  return questions;
}

/* ================= ANSWER-KEY VERIFICATION ================= */

/**
 * Re-solve every question with a different model family and drop the ones whose
 * stated key does not hold up.
 *
 * Deliberately conservative: a question is only discarded when the verifier
 * commits to a different option. An unparseable or errored verification keeps
 * the question, because losing a good question is a smaller harm than the
 * pipeline silently emptying itself when the verifier is rate limited.
 */
async function verifyAnswerKeys(questions) {
  const kept = [];
  let dropped = 0;

  for (let i = 0; i < questions.length; i += VERIFY_CONCURRENCY) {
    const slice = questions.slice(i, i + VERIFY_CONCURRENCY);
    const verdicts = await Promise.all(
      slice.map(async (q) => {
        try {
          const res = await chat(ROLES.VERIFICATION, {
            messages: [
              {
                role: "system",
                content:
                  "You solve multiple-choice questions. Work silently, then reply with ONLY the final line in the exact form 'ANSWER: X' where X is A, B, C or D. If the question is ambiguous or no option is correct, reply 'ANSWER: NONE'.",
              },
              {
                role: "user",
                content: `${q.question_text}\nA) ${q.option_a}\nB) ${q.option_b}\nC) ${q.option_c}\nD) ${q.option_d}`,
              },
            ],
            temperature: 0,
            max_tokens: 3000,
          });
          const text = res.choices?.[0]?.message?.content || "";
          const m = text.match(/ANSWER:\s*(A|B|C|D|NONE)/i);
          return m ? m[1].toUpperCase() : null;
        } catch {
          return null; // treated as "unknown" below
        }
      })
    );

    slice.forEach((q, idx) => {
      const verdict = verdicts[idx];
      if (verdict && verdict !== "NONE" && verdict !== q.correct_option) {
        dropped++;
        return;
      }
      if (verdict === "NONE") {
        dropped++;
        return;
      }
      kept.push(verdict ? { ...q, key_verified: true } : q);
    });
  }

  if (dropped > 0) {
    console.log(`🔍 Answer-key check: dropped ${dropped} of ${questions.length} (bad or unsolvable key).`);
  }
  return kept;
}

/* ================= COMPRESSED PROMPT (TOKEN SAVER) ================= */

async function fetchBatchFromGroq({
  examType,
  topics,
  count,
  difficulty,
  medium,
  totalTarget,
  section,
}) {
  // 🔥 COMPRESSED PROMPT (Saves ~40% Tokens)
  // We removed lengthy examples but kept strict rules.
  // Exam-specific structure and house style. Falls back to the generic brief
  // when the exam code is not one we have a pattern for, rather than inventing
  // a pattern for it.
  const patternBrief = buildPatternBrief(examType, { questionCount: totalTarget });

  // When generating a specific section of a real paper, that section's rules
  // override the generic MCQ format below.
  const sectionBrief = section ? describeSection(section) : null;
  const type = section?.type || "mcq_single";
  const optionless = type === "numerical" || type === "integer";

  const systemPrompt = `ACT: Chief Examiner (${examType}). GOAL: Create ${count} TOUGH, multi-step questions. TOPICS: ${topics.join(", ")}. LEVEL: ${difficulty}.
${patternBrief ? `\n${patternBrief}\n` : ""}${sectionBrief ? `\n${sectionBrief}\n` : ""}
⛔ STRICT RULES:
1. Every math symbol, constant, matrix, or variable (x, y, n, a_n, M, R) MUST be enclosed in delimiters.
2. INLINE expressions: Use \\( ... \\). (e.g. \\( f(x)=x^2 \\), \\( \\vec{a}=\\langle 2,3 \\rangle \\)).
3. NEVER nest delimiters. \\( 3 \\( t^2 \\) \\) is INVALID and breaks rendering. One \\( opens, the next \\) closes.
4. OPTIONS (A, B, C, D): Enclose whole content in \\( ... \\) if it has math/fractions. (e.g. A) \\( \\frac{1}{2} \\)). NO trailing raw $.
5. DISPLAY/PIECEWISE: Use \\[ \\begin{cases} ... \\end{cases} \\] for functions/cases on separate lines.
6. Spaces: Never clump text with math slashes (avoid "whereA(5,0)").

✅ ANSWER CORRECTNESS (most important rule):
7. Solve each question fully before writing the options. The value you compute MUST appear verbatim as one of A-D.
8. Distractors must be the results of plausible mistakes (sign error, missing factor, wrong formula) — never random numbers, and never an unevaluated expression.
9. Exactly one option is correct. If you cannot verify it, discard the question and write a different one.

🖼 DIAGRAM:
10. A "Diagram:" line is REQUIRED for any question involving ray optics, circuits, free-body diagrams / inclined planes, geometry, coordinate geometry, graphs, waves, or vectors. These questions are unfair to a candidate without a figure.
11. The Diagram line holds one complete inline SVG, all on ONE line:
    Diagram: <svg viewBox="0 0 400 260" xmlns="http://www.w3.org/2000/svg">...</svg>
    Use only <line>, <path>, <circle>, <rect>, <polygon>, <polyline>, <text>. Label every point, angle and axis with <text>. No <script>, no external images, no event handlers. Under 2000 characters.
12. Omit the Diagram line ONLY for questions that are pure algebra, recall or text reasoning, where a figure would add nothing.

${
    optionless
      ? `FORMAT (STRICT PLAIN TEXT, Separator: "---"). This section has NO OPTIONS — do not write A) B) C) D) at all:
Question: <Text>
Topic: <Topic>
Diagram: <optional single-line SVG>
Correct: <the numeric answer only, e.g. 12 or 3.75>
Explanation: <Reasoning>
---`
      : `FORMAT (STRICT PLAIN TEXT, Separator: "---"):
Question: <Text>
Topic: <Topic>
Diagram: <optional single-line SVG>
A) <Opt>
B) <Opt>
C) <Opt>
D) <Opt>
Correct: <${type === "mcq_multiple" ? "every correct letter, comma separated, e.g. A,C" : "A/B/C/D"}>
Explanation: <Reasoning>
---`
  }`;

  try {
    const completion = await chat(ROLES.GENERATION, {
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          // Very short user prompt to save tokens
          content: `Generate ${count} hard questions now.`,
        },
      ],
      temperature: 0.5,
      max_tokens: 4000, // Reduced slightly to force conciseness
      stop: ["<END_OF_BATCH>"],
    });

    const raw = completion.choices[0]?.message?.content || "";
    return parseBatchQuestions(raw, {
      optionless,
      questionType: type,
      examType,
      difficulty,
      defaultTopic: topics[0],
      validTopics: topics,
    });
  } catch (error) {
    throw error;
  }
}

// /* ================= CLAUDE CANONICAL LATEX NORMALIZER MIDDLEWARE ================= */
// export function normalizeLatex(input, options = {}) {
//   if (!input || typeof input !== 'string') return '';
//   const { fromRawLLM = true } = options;
//   let s = input;

//   if (fromRawLLM) {
//     s = s.replace(/\\\\\(/g, '\\(')
//          .replace(/\\\\\)/g, '\\)')
//          .replace(/\\\\\[/g, '\\[')
//          .replace(/\\\\\]/g, '\\]')
//          .replace(/\\\\([a-zA-Z]+)/g, '\\$1')
//          .replace(/\\\\_/g, '_')
//          .replace(/\\\\\^/g, '^');
//   }

//   // ✅ EDGE-CASE PIECEWISE REPAIR: Safely wrap un-isolated cases macro configurations into standard block tags
//   s = s.replace(/(?<!\$\$?)\\begin\{cases\}([\s\S]*?)\\end\{cases\}(?!\$\$?)/g, '\n$$\n\\begin{cases}$1\\end{cases}\n$$\n');

//   // ✅ STRING SANITATION: Clears common conversational character leak patterns (e.g. \0)
//   s = s.replace(/\\0/g, ', 0');

//   // Block markup translations to standard Markdown tags ($$)
//   s = s.replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_, content) => `$$\n${content.trim()}\n$$`);
//   s = s.replace(/(?<!\$)\\displaystyle\s+([\s\S]*?)(?=\n\n|\n[A-Z]|$)/g, (_, content) => `$$\n${content.trim()}\n$$`);
//   s = s.replace(/\微([\s\S]*?)\微/g, (_, content) => `$$\n${content.replace(/^\n+/, '').replace(/\n+$/, '')}\n$$`);

//   // Inline parsing normalization
//   s = s.replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_, content) => `$${content.trim()}$`);

//   // State-machine nesting tracker boundary wrapping
//   s = wrapUndelimitedExpressions(s);
//   return cleanOutsideMath(s).trim();
// }

// function wrapUndelimitedExpressions(s) {
//   const parts = splitOnMathRegions(s);
//   return parts.map((part) => {
//     if (part.type === 'math') return part.raw;
//     return wrapBalancedBareExpressions(part.raw);
//   }).join('');
// }

// function wrapBalancedBareExpressions(text) {
//   const result = [];
//   let i = 0;
//   const len = text.length;

//   while (i < len) {
//     if (text[i] === '\\' && i + 1 < len && /[a-zA-Z]/.test(text[i + 1])) {
//       const sofar = result.join('');
//       const lastDollar = sofar.lastIndexOf('$');
//       if (lastDollar !== -1 && isInsideInlineMath(sofar, lastDollar)) {
//         result.push(text[i]);
//         i++;
//         continue;
//       }
//       const exprStart = i;
//       i = scanMathExpression(text, i);
//       const expr = text.slice(exprStart, i).trim();
//       if (expr.length > 0) result.push(`$${expr}$`);
//     } else {
//       result.push(text[i]);
//       i++;
//     }
//   }
//   return result.join('');
// }

// function isInsideInlineMath(s, fromIndex) {
//   let count = 0;
//   for (let i = 0; i < fromIndex; i++) {
//     if (s[i] === '$' && (i === 0 || s[i - 1] !== '\\')) count++;
//   }
//   return count % 2 === 1;
// }

// function scanMathExpression(text, start) {
//   let i = start;
//   const len = text.length;
//   let braceDepth = 0;
//   let bracketDepth = 0;

//   while (i < len) {
//     const ch = text[i];
//     if (ch === '{') { braceDepth++; i++; continue; }
//     if (ch === '}') {
//       braceDepth--; i++;
//       if (braceDepth <= 0 && bracketDepth <= 0) {
//         let j = i;
//         while (j < len && text[j] === ' ') j++;
//         if (j < len && (text[j] === '\\' || text[j] === '^' || text[j] === '_' || text[j] === '{')) {
//           i = j; continue;
//         }
//         break;
//       }
//       continue;
//     }
//     if (ch === '[') { bracketDepth++; i++; continue; }
//     if (ch === ']') { bracketDepth--; i++; continue; }
//     if (ch === ' ' || ch === '\t') {
//       if (braceDepth > 0 || bracketDepth > 0) { i++; continue; }
//       let j = i + 1;
//       while (j < len && text[j] === ' ') j++;
//       if (j < len && (text[j] === '\\' || text[j] === '^' || text[j] === '_')) {
//         i = j; continue;
//       }
//       break;
//     }
//     if (ch === '\n') break;
//     i++;
//   }
//   return i;
// }

// function cleanOutsideMath(s) {
//   return splitOnMathRegions(s).map(part => part.type === 'math' ? part.raw : part.raw.replace(/[ \t]{2,}/g, ' ')).join('');
// }

// function splitOnMathRegions(s) {
//   const regions = [];
//   let i = 0; let textStart = 0; const len = s.length;
//   const flushText = (end) => { if (end > textStart) regions.push({ type: 'text', raw: s.slice(textStart, end) }); };

//   while (i < len) {
//     if (s[i] === '\\' && s[i + 1] === '[') {
//       flushText(i); const close = s.indexOf('\\]', i + 2); if (close === -1) { i++; continue; }
//       regions.push({ type: 'math', raw: s.slice(i, close + 2), display: true });
//       i = close + 2; textStart = i; continue;
//     }
//     if (s[i] === '\\' && s[i + 1] === '(') {
//       flushText(i); const close = s.indexOf('\\)', i + 2); if (close === -1) { i++; continue; }
//       regions.push({ type: 'math', raw: s.slice(i, close + 2), display: false });
//       i = close + 2; textStart = i; continue;
//     }
//     if (s[i] === '$' && s[i + 1] === '$') {
//       flushText(i); const close = s.indexOf('$$', i + 2); if (close === -1) { i++; continue; }
//       regions.push({ type: 'math', raw: s.slice(i, close + 2), display: true });
//       i = close + 2; textStart = i; continue;
//     }
//     if (s[i] === '$' && s[i - 1] !== '\\') {
//       flushText(i); let j = i + 1;
//       while (j < len) {
//         if (s[j] === '$' && s[j - 1] !== '\\' && s[j + 1] !== '$') break;
//         j++;
//       }
//       if (j >= len) { i++; continue; }
//       regions.push({ type: 'math', raw: s.slice(i, j + 1), display: false });
//       i = j + 1; textStart = i; continue;
//     }
//     i++;
//   }
//   flushText(len);
//   return regions;
// }

// /* ================= ISOLATED BLOCK MULTILINE ENGINE ================= */
// export function parseBatchQuestions(text, ctx) {
//   let cleanText = text.replace(/Here are.*?:\n/i, "");
//   let rawBlocks = cleanText.split("---");
//   if (rawBlocks.length < 2) rawBlocks = cleanText.split(/(?=^(?:Question|Q)\s*[:\-\.])/im);

//   const parsed = [];
//   const KEY_PATTERNS = {
//     question:    /^(?:Question|Q|प्रश्न)\s*[:\-\.]/i,
//     topic:       /^Topic\s*:/i,
//     optA:        /^A\s*[)\.\:\-]/i,
//     optB:        /^B\s*[)\.\:\-]/i,
//     optC:        /^C\s*[)\.\:\-]/i,
//     optD:        /^D\s*[)\.\:\-]/i,
//     correct:     /^(?:Correct|Ans|Answer|Correct\s+Answer)\s*[:\-\.\s]/i,
//     explanation: /^(?:Explanation|Exp|Reason)\s*[:\-\.]/i,
//   };

//   for (const block of rawBlocks) {
//     if (block.trim().length < 10) continue;

//     // 🛑 INTEGRATED THE IGNORE FILTER SAFELY: Checks for clumped corrupted structures
//     if (/([a-zA-Z]{12,})/g.test(block.replace(/\\(begin|end|cases|dfrac|frac|displaystyle|triangle|parallel|alpha|beta|gamma|theta|lambda|infty|mathbf)/g, ""))) {
//       console.log("⚠️ [Parser Guard] Discarded a corrupted layout block with squashed words.");
//       continue; 
//     }

//     const lines = block.split(/\r?\n/);
//     let currentKey = null;
//     const fields = { question: [], topic: [], optA: [], optB: [], optC: [], optD: [], correct: [], explanation: [] };

//     for (const line of lines) {
//       const trimmed = line.trimEnd();
//       let matched = false;
//       for (const key of Object.keys(KEY_PATTERNS)) {
//         if (KEY_PATTERNS[key].test(trimmed.trimStart())) {
//           currentKey = key;
//           const content = trimmed.trimStart().replace(KEY_PATTERNS[key], '').trim();
//           if (content.length > 0) fields[key].push(content);
//           matched = true; break;
//         }
//       }
//       if (!matched && currentKey !== null) fields[currentKey].push(trimmed);
//     }

//     const rawQuestion = fields.question.join('\n').trim();
//     const rawExplanation = fields.explanation.join('\n').trim();
//     const rawOptA = fields.optA.join(' ').trim();
//     const rawOptB = fields.optB.join(' ').trim();
//     const rawOptC = fields.optC.join(' ').trim();
//     const rawOptD = fields.optD.join(' ').trim();

//     if (!rawQuestion || !rawOptA || !rawOptB) continue;

//     const correctMatch = fields.correct.join(' ').match(/\b([A-D])\b/i);
//     const correct = correctMatch ? correctMatch[1].toUpperCase() : 'A';
    
//     let topic = ctx.defaultTopic;
//     const topicLine = fields.topic.join(' ').trim();
//     if (topicLine) {
//       const found = ctx.validTopics.find((t) => topicLine.toLowerCase().includes(t.toLowerCase()));
//       topic = found ? found : topicLine;
//     }

//     parsed.push({
//       id: `q_${Math.abs(rawQuestion.split('').reduce((h, c) => { h = ((h << 5) - h) + c.charCodeAt(0); return h | 0; }, 0)).toString(36)}`,
//       exam_type: ctx.examType,
//       topic,
//       difficulty: ctx.difficulty,
//       question_text: normalizeLatex(rawQuestion),
//       option_a:      normalizeLatex(rawOptA),
//       option_b:      normalizeLatex(rawOptB),
//       option_c:      normalizeLatex(rawOptC),
//       option_d:      normalizeLatex(rawOptD),
//       correct_option: correct,
//       explanation:   normalizeLatex(rawExplanation) || 'See solution.',
//     });
//   }
//   return parsed;
// }

// function deduplicateQuestions(questions) {
//   const seen = new Set();
//   return questions.filter((q) => {
//     const key = q.question_text.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 80);
//     if (seen.has(key)) return false;
//     seen.add(key);
//     return true;
//   });
// }

// function deduplicateAgainstList(newBatch, existingList) {
//   const existingKeys = new Set(existingList.map((q) => q.question_text.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 80)));
//   return newBatch.filter((q) => {
//     const key = q.question_text.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 80);
//     if (existingKeys.has(key)) return false;
//     existingKeys.add(key);
//     return true;
//   });
// }


/* ================= CLAUDE CANONICAL LATEX NORMALIZER MIDDLEWARE ================= */
export function normalizeLatex(input, options = {}) {
  if (!input || typeof input !== 'string') return '';
  const { fromRawLLM = true } = options;
  let s = input;

  if (fromRawLLM) {
    s = s.replace(/\\\\\(/g, '\\(')
         .replace(/\\\\\)/g, '\\)')
         .replace(/\\\\\[/g, '\\[')
         .replace(/\\\\\]/g, '\\]')
         .replace(/\\\\([a-zA-Z]+)/g, '\\$1')
         .replace(/\\\\_/g, '_')
         .replace(/\\\\\^/g, '^');
  }

  // Block markup translations to standard Markdown tags ($$)
  s = s.replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_, content) => `$$\n${content.trim()}\n$$`);
  s = s.replace(/(?<!\$)\\displaystyle\s+([\s\S]*?)(?=\n\n|\n[A-Z]|$)/g, (_, content) => `$$\n${content.trim()}\n$$`);
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (_, content) => `$$\n${content.replace(/^\n+/, '').replace(/\n+$/, '')}\n$$`);

  // Inline parsing normalization
  s = s.replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_, content) => `$${content.trim()}$`);

  // State-machine nesting tracker boundary wrapping
  s = wrapUndelimitedExpressions(s);
  return cleanOutsideMath(s).trim();
}

function wrapUndelimitedExpressions(s) {
  const parts = splitOnMathRegions(s);
  return parts.map((part) => {
    if (part.type === 'math') return part.raw;
    return wrapBalancedBareExpressions(part.raw);
  }).join('');
}

function wrapBalancedBareExpressions(text) {
  const result = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    if (text[i] === '\\' && i + 1 < len && /[a-zA-Z]/.test(text[i + 1])) {
      const sofar = result.join('');
      const lastDollar = sofar.lastIndexOf('$');
      if (lastDollar !== -1 && isInsideInlineMath(sofar, lastDollar)) {
        result.push(text[i]);
        i++;
        continue;
      }
      const exprStart = i;
      i = scanMathExpression(text, i);
      const expr = text.slice(exprStart, i).trim();
      if (expr.length > 0) result.push(`$${expr}$`);
    } else {
      result.push(text[i]);
      i++;
    }
  }
  return result.join('');
}

function isInsideInlineMath(s, fromIndex) {
  let count = 0;
  for (let i = 0; i < fromIndex; i++) {
    if (s[i] === '$' && (i === 0 || s[i - 1] !== '\\')) count++;
  }
  return count % 2 === 1;
}

function scanMathExpression(text, start) {
  let i = start;
  const len = text.length;
  let braceDepth = 0;
  let bracketDepth = 0;

  while (i < len) {
    const ch = text[i];
    if (ch === '{') { braceDepth++; i++; continue; }
    if (ch === '}') {
      braceDepth--; i++;
      if (braceDepth <= 0 && bracketDepth <= 0) {
        let j = i;
        while (j < len && text[j] === ' ') j++;
        if (j < len && (text[j] === '\\' || text[j] === '^' || text[j] === '_' || text[j] === '{')) {
          i = j; continue;
        }
        break;
      }
      continue;
    }
    if (ch === '[') { bracketDepth++; i++; continue; }
    if (ch === ']') { bracketDepth--; i++; continue; }
    if (ch === ' ' || ch === '\t') {
      if (braceDepth > 0 || bracketDepth > 0) { i++; continue; }
      let j = i + 1;
      while (j < len && text[j] === ' ') j++;
      if (j < len && (text[j] === '\\' || text[j] === '^' || text[j] === '_')) {
        i = j; continue;
      }
      break;
    }
    if (ch === '\n') break;
    i++;
  }
  return i;
}

function cleanOutsideMath(s) {
  return splitOnMathRegions(s).map(part => part.type === 'math' ? part.raw : part.raw.replace(/[ \t]{2,}/g, ' ')).join('');
}

function splitOnMathRegions(s) {
  const regions = [];
  let i = 0; let textStart = 0; const len = s.length;
  const flushText = (end) => { if (end > textStart) regions.push({ type: 'text', raw: s.slice(textStart, end) }); };

  while (i < len) {
    if (s[i] === '\\' && s[i + 1] === '[') {
      flushText(i); const close = s.indexOf('\\]', i + 2); if (close === -1) { i++; continue; }
      regions.push({ type: 'math', raw: s.slice(i, close + 2), display: true });
      i = close + 2; textStart = i; continue;
    }
    if (s[i] === '\\' && s[i + 1] === '(') {
      flushText(i); const close = s.indexOf('\\)', i + 2); if (close === -1) { i++; continue; }
      regions.push({ type: 'math', raw: s.slice(i, close + 2), display: false });
      i = close + 2; textStart = i; continue;
    }
    if (s[i] === '$' && s[i + 1] === '$') {
      flushText(i); const close = s.indexOf('$$', i + 2); if (close === -1) { i++; continue; }
      regions.push({ type: 'math', raw: s.slice(i, close + 2), display: true });
      i = close + 2; textStart = i; continue;
    }
    if (s[i] === '$' && s[i - 1] !== '\\') {
      flushText(i); let j = i + 1;
      while (j < len) {
        if (s[j] === '$' && s[j - 1] !== '\\' && s[j + 1] !== '$') break;
        j++;
      }
      if (j >= len) { i++; continue; }
      regions.push({ type: 'math', raw: s.slice(i, j + 1), display: false });
      i = j + 1; textStart = i; continue;
    }
    i++;
  }
  flushText(len);
  return regions;
}

/* ================= ISOLATED BLOCK MULTILINE ENGINE ================= */
export function parseBatchQuestions(text, ctx) {
  let cleanText = text.replace(/Here are.*?:\n/i, "");
  let rawBlocks = cleanText.split("---");
  if (rawBlocks.length < 2) rawBlocks = cleanText.split(/(?=^(?:Question|Q)\s*[:\-\.])/im);

  const parsed = [];
  const KEY_PATTERNS = {
    question:    /^(?:Question|Q|प्रश्न)\s*[:\-\.]/i,
    topic:       /^Topic\s*:/i,
    optA:        /^A\s*[)\.\:\-]/i,
    optB:        /^B\s*[)\.\:\-]/i,
    optC:        /^C\s*[)\.\:\-]/i,
    optD:        /^D\s*[)\.\:\-]/i,
    correct:     /^(?:Correct|Ans|Answer|Correct\s+Answer)\s*[:\-\.\s]/i,
    explanation: /^(?:Explanation|Exp|Reason)\s*[:\-\.]/i,
    // Checked after optD, which cannot match "Diagram:" - /^D\s*[)\.:\-]/
    // requires a delimiter immediately after the D.
    diagram:     /^(?:Diagram|Figure|Svg)\s*[:\-\.]/i,
  };

  for (const block of rawBlocks) {
    if (block.trim().length < 10) continue;
    const lines = block.split(/\r?\n/);
    
    let currentKey = null;
    const fields = { question: [], topic: [], optA: [], optB: [], optC: [], optD: [], correct: [], explanation: [], diagram: [] };

    for (const line of lines) {
      const trimmed = line.trimEnd();
      let matched = false;
      for (const key of Object.keys(KEY_PATTERNS)) {
        if (KEY_PATTERNS[key].test(trimmed.trimStart())) {
          currentKey = key;
          const content = trimmed.trimStart().replace(KEY_PATTERNS[key], '').trim();
          if (content.length > 0) fields[key].push(content);
          matched = true; break;
        }
      }
      if (!matched && currentKey !== null) fields[currentKey].push(trimmed);
    }

    const rawQuestion = fields.question.join('\n').trim();
    const rawExplanation = fields.explanation.join('\n').trim();
    const rawOptA = fields.optA.join(' ').trim();
    const rawOptB = fields.optB.join(' ').trim();
    const rawOptC = fields.optC.join(' ').trim();
    const rawOptD = fields.optD.join(' ').trim();

    // Numerical / integer sections carry no options at all, so requiring
    // them here would silently discard every question in those sections.
    if (!rawQuestion) continue;
    if (!ctx.optionless && (!rawOptA || !rawOptB)) continue;

    const rawCorrect = fields.correct.join(' ').trim();
    let correct;
    if (ctx.optionless) {
      // Keep the numeric answer verbatim, including decimals and sign.
      correct = (rawCorrect.match(/-?\d+(?:\.\d+)?/) || ['0'])[0];
    } else if (ctx.questionType === 'mcq_multiple') {
      // One or more correct options, normalised to 'A,C'.
      const letters = (rawCorrect.toUpperCase().match(/[A-D]/g) || ['A']);
      correct = [...new Set(letters)].sort().join(',');
    } else {
      const m = rawCorrect.match(/\b([A-D])\b/i);
      correct = m ? m[1].toUpperCase() : 'A';
    }

    
    let topic = ctx.defaultTopic;
    const topicLine = fields.topic.join(' ').trim();
    if (topicLine) {
      const found = ctx.validTopics.find((t) => topicLine.toLowerCase().includes(t.toLowerCase()));
      topic = found ? found : topicLine;
    }

    // Wrap fields via normalizeLatex before updating the collection array
    parsed.push({
      id: `q_${Math.abs(rawQuestion.split('').reduce((h, c) => { h = ((h << 5) - h) + c.charCodeAt(0); return h | 0; }, 0)).toString(36)}`,
      exam_type: ctx.examType,
      topic,
      difficulty: ctx.difficulty,
      question_text: normalizeLatex(rawQuestion),
      option_a:      normalizeLatex(rawOptA),
      option_b:      normalizeLatex(rawOptB),
      option_c:      normalizeLatex(rawOptC),
      option_d:      normalizeLatex(rawOptD),
      correct_option: correct,
      explanation:   normalizeLatex(rawExplanation) || 'See solution.',
      // Model-authored markup: sanitized here, never trusted downstream.
      // sanitizeSvg returns null for anything unsafe or non-drawing, so
      // the field is simply absent rather than carrying junk.
      diagram_svg:   sanitizeSvg(fields.diagram.join(NEWLINE).trim()) || null,
    });
  }
  return parsed;
}

// /* ================= ONLY REPLACE THIS FUNCTION IN YOUR BACKEND ================= */
// export function parseBatchQuestions(text, ctx) {
//   let cleanText = text.replace(/Here are.*?:\n/i, "");
//   let rawBlocks = cleanText.split("---");
//   if (rawBlocks.length < 2) rawBlocks = cleanText.split(/(?=^(?:Question|Q)\s*[:\-\.])/im);

//   const parsed = [];
//   const KEY_PATTERNS = {
//     question:    /^(?:Question|Q|प्रश्न)\s*[:\-\.]/i,
//     topic:       /^Topic\s*:/i,
//     optA:        /^A\s*[)\.\:\-]/i,
//     optB:        /^B\s*[)\.\:\-]/i,
//     optC:        /^C\s*[)\.\:\-]/i,
//     optD:        /^D\s*[)\.\:\-]/i,
//     correct:     /^(?:Correct|Ans|Answer|Correct\s+Answer)\s*[:\-\.\s]/i,
//     explanation: /^(?:Explanation|Exp|Reason)\s*[:\-\.]/i,
//   };

//   for (const block of rawBlocks) {
//     if (block.trim().length < 10) continue;

//     // 1. FILTER GUARD: Squashed words (Determinewhetherf) milenge toh block skip ho jayega
//     if (/([a-zA-Z]{12,})/g.test(block.replace(/\\(begin|end|cases|dfrac|frac|displaystyle|triangle|parallel|alpha|beta|gamma|theta|lambda|infty|mathbf|rangle|langle)/g, ""))) {
//       console.log("⚠️ [Parser Guard] Discarded a corrupted layout block with squashed words.");
//       continue; 
//     }

//     const lines = block.split(/\r?\n/);
//     let currentKey = null;
//     const fields = { question: [], topic: [], optA: [], optB: [], optC: [], optD: [], correct: [], explanation: [] };

//     for (const line of lines) {
//       const trimmed = line.trimEnd();
//       let matched = false;
//       for (const key of Object.keys(KEY_PATTERNS)) {
//         if (KEY_PATTERNS[key].test(trimmed.trimStart())) {
//           currentKey = key;
//           const content = trimmed.trimStart().replace(KEY_PATTERNS[key], '').trim();
//           if (content.length > 0) fields[key].push(content);
//           matched = true; break;
//         }
//       }
//       if (!matched && currentKey !== null) fields[currentKey].push(trimmed);
//     }

//     let rawQuestion = fields.question.join('\n').trim();
//     let rawExplanation = fields.explanation.join('\n').trim();
//     let rawOptA = fields.optA.join(' ').trim();
//     let rawOptB = fields.optB.join(' ').trim();
//     let rawOptC = fields.optC.join(' ').trim();
//     let rawOptD = fields.optD.join(' ').trim();

//     if (!rawQuestion || !rawOptA || !rawOptB) continue;

//     // 2. TARGETED FIX FOR PIECEWISE CASES: Forcing display block math safely
//     const casesRegex = /(?<!\$\$?)\\begin\{cases\}([\s\S]*?)\\end\{cases\}(?!\$\$?)/g;
//     rawQuestion = rawQuestion.replace(casesRegex, '\n$$\n\\begin{cases}$1\\end{cases}\n$$\n');
//     rawExplanation = rawExplanation.replace(casesRegex, '\n$$\n\\begin{cases}$1\\end{cases}\n$$\n');

//     // Clean network string leaks (\0)
//     rawQuestion = rawQuestion.replace(/\\0/g, ', 0');

//     const correctMatch = fields.correct.join(' ').match(/\b([A-D])\b/i);
//     const correct = correctMatch ? correctMatch[1].toUpperCase() : 'A';
    
//     let topic = ctx.defaultTopic;
//     const topicLine = fields.topic.join(' ').trim();
//     if (topicLine) {
//       const found = ctx.validTopics.find((t) => topicLine.toLowerCase().includes(t.toLowerCase()));
//       topic = found ? found : topicLine;
//     }

//     // 3. FIXED BYPASS: normalizeLatex completely removed to preserve original raw encoding data blocks
//     parsed.push({
//       id: `q_${Math.abs(rawQuestion.split('').reduce((h, c) => { h = ((h << 5) - h) + c.charCodeAt(0); return h | 0; }, 0)).toString(36)}`,
//       exam_type: ctx.examType,
//       topic,
//       difficulty: ctx.difficulty,
//       question_text: rawQuestion,
//       option_a:      rawOptA,
//       option_b:      rawOptB,
//       option_c:      rawOptC,
//       option_d:      rawOptD,
//       correct_option: correct,
//       explanation:   rawExplanation || 'See solution.',
//     });
//   }
//   return parsed;
// }

function deduplicateQuestions(questions) {
  const seen = new Set();
  return questions.filter((q) => {
    const key = q.question_text.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deduplicateAgainstList(newBatch, existingList) {
  const existingKeys = new Set(existingList.map((q) => q.question_text.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 80)));
  return newBatch.filter((q) => {
    const key = q.question_text.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 80);
    if (existingKeys.has(key)) return false;
    existingKeys.add(key);
    return true;
  });
} 


