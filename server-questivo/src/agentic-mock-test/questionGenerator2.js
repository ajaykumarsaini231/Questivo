import { perplexity } from "./openaiClient.js";

/* ================= CONFIGURATION ================= */

// ⚡ SAFETY: Reasoning models are heavy. Limit concurrency.
const CONCURRENCY_LIMIT = 4; 

// ⚡ BATCHING: Never ask LLM for < 3 questions to avoid hallucinations.
const MIN_BATCH_SIZE = 3;
const MAX_BATCH_SIZE = 15; 

const MAX_RETRIES = 3;
// Tokens increased slightly to ensure full question text is generated
const TOKENS_PER_QUESTION = 150; 

/* ================= MAIN ENTRY POINT ================= */

export async function generateQuestionsAgent({
  examType,
  topics,
  numQuestions,
  difficulty,
  sessionType,
  medium = "English",
}) {
  // 1. Validation
  if (!examType) throw new Error("examType is required");
  if (!Array.isArray(topics) || topics.length === 0) {
    throw new Error("topics[] is required");
  }

  // 2. Normalize Count
  let totalTarget = Number(numQuestions) || 10;
  if (totalTarget < 1) totalTarget = 1;
  if (totalTarget > 100) totalTarget = 100;

  // 3. Plan Batches
  let batches = planBatchesByTopic(topics, totalTarget);
  
  // Merge Micro-Batches (Prevents asking for 1-2 questions)
  batches = mergeSmallBatches(batches, MIN_BATCH_SIZE);
  
  console.log(`[Generator] Planned ${batches.length} optimized batches for ${totalTarget} questions.`);

  // 4. Task Creation
  const tasks = batches.map((batch, idx) => () =>
    fetchBatchWithRetry({
      examType,
      topics: batch.topics,
      count: batch.count,
      difficulty,
      sessionType,
      medium,
      batchIndex: idx + 1,
    })
  );

  // 5. Parallel Execution
  const batchResults = await asyncPool(CONCURRENCY_LIMIT, tasks);
  let allQuestions = batchResults.flat();

  // 6. Deduplication Phase 1
  allQuestions = deduplicateQuestions(allQuestions);

  // 7. Final Hard Guarantee (Fill missing)
  if (allQuestions.length < totalTarget) {
    const missing = totalTarget - allQuestions.length;
    console.log(`[Generator] Short by ${missing}. Performing Smart Fill...`);

    try {
      const leastUsedTopic = getLeastUsedTopic(allQuestions, topics);
      
      // Never ask for < 3 questions, even if missing is 1
      const requestCount = Math.max(missing, 3);

      const filler = await fetchBatchWithRetry({
        examType,
        topics: [leastUsedTopic],
        count: requestCount,
        difficulty,
        sessionType,
        medium,
        batchIndex: "FINAL-FILL",
        temperature: 0.7, 
      });

      allQuestions.push(...filler.slice(0, missing));
      allQuestions = deduplicateQuestions(allQuestions);
      
    } catch (e) {
      console.warn("[Generator] Final filler failed:", e.message);
    }
  }

  // 8. Final Normalization
  return allQuestions.slice(0, totalTarget).map((q, i) => ({
    ...q,
    // Clean up Question Text just in case prefix remains
    question_text: `Question ${i + 1}: ${q.question_text.replace(/^(Question|प्रश्न)\s+\d+[:\-\s]*/i, "").trim()}`,
  }));
}

/* ================= HELPER: STRONG DEDUPLICATION ================= */

function deduplicateQuestions(questions) {
  const seen = new Set();
  return questions.filter((q) => {
    // Key = Question + Option A (First 160 chars)
    const content = `${q.question_text} ${q.option_a}`;
    const key = content.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 160);
    
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ================= HELPER: TOPIC BALANCER ================= */

function getLeastUsedTopic(currentQuestions, allTopics) {
    const counts = {};
    allTopics.forEach(t => counts[t] = 0); 
    
    currentQuestions.forEach(q => {
        const t = q.topic || allTopics[0];
        if (counts[t] !== undefined) counts[t]++;
    });

    const sorted = allTopics.sort((a, b) => counts[a] - counts[b]);
    return sorted[0];
}

/* ================= BATCH PLANNER + MERGER ================= */

function planBatchesByTopic(topics, total) {
  const batches = [];
  const perTopic = Math.floor(total / topics.length);
  let remainder = total % topics.length;

  for (const topic of topics) {
    let count = perTopic + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    if (count === 0) continue;

    while (count > 0) {
      const size = Math.min(count, MAX_BATCH_SIZE);
      batches.push({ topics: [topic], count: size });
      count -= size;
    }
  }
  return batches;
}

function mergeSmallBatches(batches, minSize) {
    if (batches.length === 0) return [];
    
    const optimized = [];
    let current = batches[0];

    for (let i = 1; i < batches.length; i++) {
        const next = batches[i];
        if (current.count < minSize) {
            current.count += next.count;
            current.topics = [...new Set([...current.topics, ...next.topics])]; 
        } else {
            optimized.push(current);
            current = next;
        }
    }
    
    if (current.count < minSize && optimized.length > 0) {
        const last = optimized[optimized.length - 1];
        last.count += current.count;
        last.topics = [...new Set([...last.topics, ...current.topics])];
    } else {
        optimized.push(current);
    }

    return optimized;
}

/* ================= SAFE ASYNC POOL ================= */

async function asyncPool(limit, tasks) {
  const results = [];
  const executing = [];

  for (const task of tasks) {
    const p = Promise.resolve().then(task);
    results.push(p);

    if (limit <= tasks.length) {
      const e = p.then(() => {
        const idx = executing.indexOf(e);
        if (idx !== -1) executing.splice(idx, 1);
      });
      executing.push(e);

      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(results);
}

/* ================= RETRY + RECURSION GUARD ================= */

async function fetchBatchWithRetry(params, isRecursive = false) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const questions = await fetchBatch(params);

      if (questions.length === params.count) return questions;

      // Stop recursion if asking for micro-updates
      if (params.count < 3 && questions.length > 0) return questions;

      if (!isRecursive && questions.length > 0 && questions.length < params.count && attempt < MAX_RETRIES) {
        const missing = params.count - questions.length;
        const reqCount = Math.max(missing, 3); // Ask for min 3
        
        console.log(`[Batch ${params.batchIndex}] Partial: Got ${questions.length}. Recursing for ${reqCount}...`);
        
        const filler = await fetchBatchWithRetry(
          { ...params, count: reqCount, batchIndex: `${params.batchIndex}-R` },
          true 
        );

        return [...questions, ...filler].slice(0, params.count);
      }
      
      if (questions.length === 0) throw new Error("Generated 0 valid questions");
      return questions; 

    } catch (err) {
      console.warn(`[Batch ${params.batchIndex}] Attempt ${attempt} failed: ${err.message}`);
      if (attempt === MAX_RETRIES) return []; 
      await new Promise((r) => setTimeout(r, 500 * (2 ** (attempt - 1))));
    }
  }
  return [];
}

/* ================= SINGLE BATCH CALL ================= */

async function fetchBatch({
  examType,
  topics,
  count,
  difficulty,
  sessionType,
  medium,
  batchIndex,
  temperature = 0.6 
}) {
  const topicsList = topics.join(", ");
  const dynamicTokens = Math.min(4000, 600 + (count * TOKENS_PER_QUESTION)); 

// 🔴 FIX 1: Updated Prompt to enforce newline for question text
  const systemPrompt = `
You are a senior exam question-setter. Generate EXACTLY ${count} MCQs.

RULES:
1. Count: EXACTLY ${count} questions.
2. Topics: ${topicsList}
3. Difficulty: ${difficulty}
4. Language: ${medium}
5. No Markdown (*, **). Plain text only.

OUTPUT FORMAT (STRICT):
Question X:
<Question Text MUST be on this new line>
A) <Op1>
B) <Op2>
C) <Op3>
D) <Op4>
Correct: <A/B/C/D>
Explanation: <Text>

IMPORTANT: 
- Do NOT write the question text on the same line as "Question X".
- Do NOT include (Difficulty - Topic) in the question title.
`.trim();

  const userPrompt = `Generate batch ${batchIndex} with ${count} questions.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000); 

  try {
    const res = await perplexity.post("/chat/completions", {
      model: "sonar-reasoning", 
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: dynamicTokens,
      temperature: temperature,
    }, { signal: controller.signal });
    
    clearTimeout(timeoutId);

    const raw = res.data?.choices?.[0]?.message?.content || "";
    
    return parseQuestionsFromText(raw, { 
      examType,
      defaultDifficulty: difficulty,
      maxQuestions: count,
      medium,
      defaultTopic: topics[0] || "General"
    });

  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
        console.error(`[API Error] Batch ${batchIndex}: Timeout after 90s`);
    } else {
        console.error(`[API Error] Batch ${batchIndex}:`, error.message);
    }
    throw error;
  }
}

/* ================= PARSER (FIXED FOR MISSING TEXT) ================= */

function parseQuestionsFromText(text, { examType, defaultDifficulty, maxQuestions, medium, defaultTopic }) {
  const thinkCloseIndex = text.indexOf("</think>");
  let body = thinkCloseIndex !== -1 ? text.slice(thinkCloseIndex + 8).trim() : text;

  // Clean Markdown
  body = body.replace(/\*\*/g, "").replace(/\*/g, ""); 

  // Split by Question Headers
  const splitRegex = /(?:Question|Q|प्रश्न)\s*\d+[:\-\.]*/gi;
  const parts = body.split(splitRegex);

  // Remove empty precursor
  if (parts.length > 0 && !parts[0].includes("A)")) parts.shift();

  const results = [];

  for (const block of parts) {
    if (results.length >= maxQuestions) break;

    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 3) continue;

    // 🔴 FIX 2: Smart Logic to find the ACTUAL Question Text
    // We look for everything BEFORE the first Option (A)
    let questionTextLines = [];
    let optionStartIndex = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check if this line is an option
        if (/^A[\)\.]/i.test(line)) {
            optionStartIndex = i;
            break;
        }

        // Filter out Metadata lines like "(Medium - Physics)" or just "Question 1"
        const isMetadata = line.startsWith("(") && line.endsWith(")");
        const isHeader = /^(Question|Q|प्रश्न)\s*\d+/i.test(line);

        if (!isMetadata && !isHeader) {
            questionTextLines.push(line);
        }
    }

    // Join all identified text lines
    let questionText = questionTextLines.join(" ");
    
    // Fallback: If empty, grab the first line (desperation move)
    if (!questionText && lines.length > 0) {
        questionText = lines[0].replace(/^\(.*\)$/, "").trim(); // Remove parens if only thing there
    }

    let optionA="", optionB="", optionC="", optionD="", correct="", exp="";

    // Parse Options (starting from where we found A)
    if (optionStartIndex !== -1) {
        for (let i = optionStartIndex; i < lines.length; i++) {
            const line = lines[i];
            
            if (/^A[\)\.]/i.test(line)) optionA = line.replace(/^A[\)\.]\s*/i, "");
            else if (/^B[\)\.]/i.test(line)) optionB = line.replace(/^B[\)\.]\s*/i, "");
            else if (/^C[\)\.]/i.test(line)) optionC = line.replace(/^C[\)\.]\s*/i, "");
            else if (/^D[\)\.]/i.test(line)) optionD = line.replace(/^D[\)\.]\s*/i, "");
            
            else if (/^(Correct|Ans|Answer|Right Answer|सही उत्तर)/i.test(line)) {
                const m = line.match(/\b([A-D])\b/i);
                if (m) correct = m[1].toUpperCase();
            }
            else if (/^(Explanation|Exp|Reason|व्याख्या)/i.test(line)) {
                exp = line.replace(/^(Explanation|Exp|Reason|व्याख्या)[:\-\s]*/i, "");
            }
        }
    }

    if (optionA && optionB && correct && questionText.length > 3) {
      results.push({
        exam_type: examType,
        topic: defaultTopic,
        difficulty: defaultDifficulty,
        question_text: questionText, 
        option_a: optionA,
        option_b: optionB,
        option_c: optionC,
        option_d: optionD,
        correct_option: correct,
        explanation: exp || "Explanation provided in solution.",
      });
    }
  }
  return results;
}