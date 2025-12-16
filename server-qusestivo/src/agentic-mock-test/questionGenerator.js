import { perplexity } from "./openaiClient.js";

/* ================= CONFIGURATION ================= */

const MODEL_ID = "sonar-pro";
const CONCURRENCY_LIMIT = 7;     
const MIN_BATCH_SIZE = 3;        
const MAX_BATCH_SIZE = 20;       
const MAX_RETRIES = 2;           
const TOKENS_PER_QUESTION = 100;
/* ================= MAIN ENTRY POINT ================= */

export async function generateQuestionsAgent({
  examType,
  topics,
  numQuestions,
  difficulty,
  sessionType,
  medium = "English",
}) {
  // Validation
  if (!examType) throw new Error("examType is required");
  if (!Array.isArray(topics) || topics.length === 0) {
    throw new Error("topics[] is required");
  }

  // Normalize Count
  let totalTarget = Number(numQuestions) || 10;
  if (totalTarget < 1) totalTarget = 1;
  if (totalTarget > 100) totalTarget = 100;

  // Plan Batches
  let batches = planBatchesByTopic(topics, totalTarget);
  batches = mergeSmallBatches(batches, MIN_BATCH_SIZE);
  
  console.log(`[Generator] Planned ${batches.length} batches for ${totalTarget} questions using ${MODEL_ID}.`);

  // Task Creation
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

  // Parallel Execution
  const batchResults = await asyncPool(CONCURRENCY_LIMIT, tasks);
  let allQuestions = batchResults.flat();

  // Deduplication Phase 1
  allQuestions = deduplicateQuestions(allQuestions);

  // Final Guarantee Loop (Force Fill)
  let loopCount = 0;
  const MAX_LOOP_SAFETY = 5;

  while (allQuestions.length < totalTarget && loopCount < MAX_LOOP_SAFETY) {
    const missing = totalTarget - allQuestions.length;
    console.log(`[Generator] Loop ${loopCount + 1}: Missing ${missing} questions. Force filling...`);

    try {
      const leastUsedTopic = getLeastUsedTopic(allQuestions, topics);
      const requestCount = Math.max(missing, 5); // Request min 5 to provide context

      const filler = await fetchBatchWithRetry({
        examType,
        topics: [leastUsedTopic],
        count: requestCount,
        difficulty,
        sessionType,
        medium,
        batchIndex: `FORCE-FILL-${loopCount}`,
        temperature: 0.7,
      });

      if (filler.length === 0) {
          console.warn("[Generator] Force fill returned 0. Retrying...");
      }

      allQuestions.push(...filler);
      allQuestions = deduplicateQuestions(allQuestions);
      
    } catch (e) {
      console.warn(`[Generator] Loop ${loopCount} failed:`, e.message);
    }
    
    loopCount++;
  }

  // Final Normalization
  return allQuestions.slice(0, totalTarget).map((q, i) => ({
    ...q,
    question_text: `Question ${i + 1}: ${q.question_text.replace(/^(Question|प्रश्न)\s+\d+[:\-\s]*/i, "").trim()}`,
  }));
}

/* ================= HELPER: DEDUPLICATION ================= */

function deduplicateQuestions(questions) {
  const seen = new Set();
  return questions.filter((q) => {
    // Key based on Question + Option A + Option B (First 160 chars)
    const content = `${q.question_text} ${q.option_a} ${q.option_b}`;
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

    const sorted = [...allTopics].sort((a, b) => counts[a] - counts[b]);
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
        } else {
            optimized.push(current);
            current = next;
        }
    }
    
    if (current.count < minSize && optimized.length > 0) {
        const last = optimized[optimized.length - 1];
        last.count += current.count;
    } else {
        optimized.push(current);
    }

    return optimized;
}

/* ================= ASYNC POOL ================= */

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

/* ================= RETRY LOGIC ================= */

async function fetchBatchWithRetry(params) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const questions = await fetchBatch(params);
      
      if (questions.length > 0) {
         return questions;
      }
      
      throw new Error("Generated 0 valid questions");

    } catch (err) {
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

  const adjustedTemp = (medium === "Hindi" || medium === "Hinglish") ? 0.5 : temperature;

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
A) [Option A text]
B) [Option B text]
C) [Option C text]
D) [Option D text]
Correct: <A/B/C/D>
Explanation: <Text>
`.trim();

  const userPrompt = `Generate batch ${batchIndex} with ${count} questions.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000); 

  try {
    const res = await perplexity.post("/chat/completions", {
      model: MODEL_ID, 
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: dynamicTokens,
      temperature: adjustedTemp,
    }, { signal: controller.signal });
    
    clearTimeout(timeoutId);

    const raw = res.data?.choices?.[0]?.message?.content || "";
    const cleanRaw = stripReasoning(raw); 

    return parseQuestionsFromText(cleanRaw, { 
      examType,
      defaultDifficulty: difficulty,
      maxQuestions: count,
      medium,
      defaultTopic: topics[0] || "General"
    });

  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`[API Error] Batch ${batchIndex}:`, error.message);
    throw error;
  }
}

/* ================= ARTIFACT CLEANER ================= */

function stripReasoning(text) {
  if (!text) return "";
  
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^(Here are|I need to|Let me|Generating|Sure|Ok|Okay).*?(?=(Question|Q|प्रश्न)\s*\d+)/is, "")
    .replace(/^(मुझे|मैं|हमें|आवश्यकताएँ|आउटपुट|प्रश्नों).*?(?=(Question|Q|प्रश्न)\s*\d+)/is, "")
    .trim();
}

/* ================= PARSER ================= */

function parseQuestionsFromText(text, { examType, defaultDifficulty, maxQuestions, medium, defaultTopic }) {
  let body = text.replace(/\*\*/g, "").replace(/\*/g, ""); 

  const splitRegex = /(?:Question|Q|प्रश्न)\s*\d+[:\-\.]*/gi;
  const parts = body.split(splitRegex);

  if (parts.length > 0 && !parts[0].includes("A)")) parts.shift();

  const results = [];

  for (const block of parts) {
    if (results.length >= maxQuestions) break;

    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 3) continue;

    let questionTextLines = [];
    let optionStartIndex = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^A[\)\.]/i.test(line) || /^\[A\]/i.test(line)) {
            optionStartIndex = i;
            break;
        }
        
        const isMetadata = line.startsWith("(") && line.endsWith(")");
        const isHeader = /^(Question|Q|प्रश्न)\s*\d+/i.test(line);

        if (!isMetadata && !isHeader) {
            questionTextLines.push(line);
        }
    }

    let questionText = questionTextLines.join(" ");
    
    if (!questionText && lines.length > 0) {
        questionText = lines[0].replace(/^\(.*\)$/, "").trim(); 
    }

    // Skip Planning Leakage
    if (/I need to|Let me break|requirements|out loud|thinking|मुझे|आवश्यक|आउटपुट|मैं सोच/i.test(questionText)) {
       continue;
    }

    let optionA="", optionB="", optionC="", optionD="", correct="", exp="";

    if (optionStartIndex !== -1) {
        for (let i = optionStartIndex; i < lines.length; i++) {
            const line = lines[i];
            
            if (/^A[\)\.\]]/i.test(line)) optionA = line.replace(/^A[\)\.\]]\s*/i, "");
            else if (/^B[\)\.\]]/i.test(line)) optionB = line.replace(/^B[\)\.\]]\s*/i, "");
            else if (/^C[\)\.\]]/i.test(line)) optionC = line.replace(/^C[\)\.\]]\s*/i, "");
            else if (/^D[\)\.\]]/i.test(line)) optionD = line.replace(/^D[\)\.\]]\s*/i, "");
            
            else if (/^(Correct|Ans|Answer|Right Answer|सही उत्तर)/i.test(line)) {
                const m = line.match(/\b([A-D])\b/i);
                if (m) correct = m[1].toUpperCase();
            }
            else if (/^(Explanation|Exp|Reason|व्याख्या)/i.test(line)) {
                exp = line.replace(/^(Explanation|Exp|Reason|व्याख्या)[:\-\s]*/i, "");
            }
        }
    }

    // Validation
    const validOptionsCount = [optionA, optionB, optionC, optionD].filter(Boolean).length;
    const wordCount = questionText.split(/\s+/).length;

    if (validOptionsCount >= 3 && correct && wordCount >= 3) {
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