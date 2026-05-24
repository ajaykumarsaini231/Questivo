import Groq from "groq-sdk";

if (!process.env.GROQ_API_KEY) {
  throw new Error("GROQ_API_KEY is missing in .env file");
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODEL_NAME = "llama-3.3-70b-versatile";


/* ================= CONFIGURATION ================= */
// Reduced batch size to stay under rate limits (Safe Zone)
const MAX_BATCH_SIZE = 15;
const MAX_TOTAL_RETRIES = 5;

export async function generateQuestionsAgent({
  examType,
  topics,
  numQuestions,
  difficulty,
  sessionType,
  medium = "English",
}) {
  let totalTarget = Number(numQuestions) || 10;
  if (totalTarget > 100) totalTarget = 100;

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

  const finalQuestions = deduplicateQuestions(allQuestions).slice(
    0,
    totalTarget
  );
  return finalQuestions.map((q, i) => ({
    ...q,
    question_text: `Question ${i + 1}: ${q.question_text}`,
  }));
}

/* ================= COMPRESSED PROMPT (TOKEN SAVER) ================= */

async function fetchBatchFromGroq({
  examType,
  topics,
  count,
  difficulty,
  medium,
}) {
  // 🔥 COMPRESSED PROMPT (Saves ~40% Tokens)
  // We removed lengthy examples but kept strict rules.
  const systemPrompt = `
ACT: Chief Examiner for competitive exams (${examType}).
GOAL: Create ${count} TOUGH, multi-step MCQs to filter top 1% candidates.
TOPICS: ${topics.join(", ")}
LEVEL: ${difficulty} (Very Hard)
LANG: ${medium}

⛔ RULES:
1. NO direct "What is X?" questions.
2. Options MUST be close distractors (e.g. 10.2 vs 10.5).
3. REQUIRED TYPES: Statement Analysis (I, II, III), Assertion-Reason, Match Columns, Scenario.

FORMAT (STRICT PLAIN TEXT, Separator: "---"):
Question: <Text>
Topic: <Topic>
A) <Opt>
B) <Opt>
C) <Opt>
D) <Opt>
Correct: <A/B/C/D>
Explanation: <Reasoning>
---
`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          // Very short user prompt to save tokens
          content: `Generate ${count} hard questions now.`,
        },
      ],
      model: MODEL_NAME,
      temperature: 0.5,
      max_tokens: 4000, // Reduced slightly to force conciseness
      stop: ["<END_OF_BATCH>"],
    });

    const raw = completion.choices[0]?.message?.content || "";
    return parseBatchQuestions(raw, {
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
  };

  for (const block of rawBlocks) {
    if (block.trim().length < 10) continue;
    const lines = block.split(/\r?\n/);
    
    let currentKey = null;
    const fields = { question: [], topic: [], optA: [], optB: [], optC: [], optD: [], correct: [], explanation: [] };

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

    if (!rawQuestion || !rawOptA || !rawOptB) continue;

    const correctMatch = fields.correct.join(' ').match(/\b([A-D])\b/i);
    const correct = correctMatch ? correctMatch[1].toUpperCase() : 'A';
    
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


