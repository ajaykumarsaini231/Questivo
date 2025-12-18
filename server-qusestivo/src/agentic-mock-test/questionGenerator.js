import Groq from "groq-sdk";

if (!process.env.GROQ_API_KEY) {
  throw new Error("GROQ_API_KEY is missing in .env file");
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ✅ MODEL: Llama 3.3 (High Quality, Fast)
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

/* ================= PARSER (Standard) ================= */

function normalizeStatements(text) {
  if (!text) return text;

  return (
    text
      // Ensure each Statement is on a new line
      .replace(/\s*(Statement\s+I\s*:)/gi, "\n$1")
      .replace(/\s*(Statement\s+II\s*:)/gi, "\n$1")
      .replace(/\s*(Statement\s+III\s*:)/gi, "\n$1")
      .replace(/\n{2,}/g, "\n") // extra newlines clean
      .trim()
  );
}

function parseBatchQuestions(
  text,
  { examType, difficulty, defaultTopic, validTopics }
) {
  let cleanText = text.replace(/\*\*/g, "").replace(/Here are.*?:\n/i, "");

  let rawBlocks = cleanText.split("---");
  if (rawBlocks.length < 2) rawBlocks = cleanText.split(/Question:/i);

  rawBlocks = rawBlocks.filter((b) => b.trim().length > 20);

  const parsed = [];
  for (const block of rawBlocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    let qText = "";
    const qLineIndex = lines.findIndex((l) =>
      /^(Question|Q|प्रश्न)[:\-\.]/i.test(l)
    );

    if (qLineIndex !== -1) {
      const questionLines = [];

      for (let i = qLineIndex; i < lines.length; i++) {
        if (
          /^(Topic:|A[\)\.\:\-]|B[\)\.\:\-]|C[\)\.\:\-]|D[\)\.\:\-])/i.test(
            lines[i]
          )
        ) {
          break;
        }
        questionLines.push(lines[i]);
      }

      qText = questionLines
        .join(" ")
        .replace(/^(Question|Q|प्रश्न)[:\-\.]\s*/i, "")
        .trim();

      qText = normalizeStatements(qText);
    } else if (lines.length > 0) {
      qText = lines[0].replace(/^\d+[\.:\)]\s*/, "");
    }

    let topic = defaultTopic;
    let optA = "",
      optB = "",
      optC = "",
      optD = "",
      correct = "",
      exp = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.match(/^Topic:/i)) {
        let extractedTopic = line.replace(/^Topic:\s*/i, "").trim();
        if (
          validTopics &&
          validTopics.some((t) =>
            extractedTopic.toLowerCase().includes(t.toLowerCase())
          )
        ) {
          topic = extractedTopic;
        } else {
          topic = defaultTopic;
        }
      } else if (/^A[\)\.\:\-\s]/i.test(line))
        optA = line.replace(/^A[\)\.\:\-\s]\s*/i, "");
      else if (/^B[\)\.\:\-\s]/i.test(line))
        optB = line.replace(/^B[\)\.\:\-\s]\s*/i, "");
      else if (/^C[\)\.\:\-\s]/i.test(line))
        optC = line.replace(/^C[\)\.\:\-\s]\s*/i, "");
      else if (/^D[\)\.\:\-\s]/i.test(line))
        optD = line.replace(/^D[\)\.\:\-\s]\s*/i, "");
      else if (/^(Correct|Ans|Answer|Correct Answer)/i.test(line)) {
        const m = line.match(/\b([A-D])\b/i);
        if (m) correct = m[1].toUpperCase();
      } else if (/^(Explanation|Exp|Reason)/i.test(line)) {
        exp = line.replace(/^(Explanation|Exp|Reason)[:\-\.]\s*/i, "");
      }
    }

    if (qText && optA && optB && correct) {
      parsed.push({
        exam_type: examType,
        topic: topic,
        difficulty: difficulty,
        question_text: qText,
        option_a: optA,
        option_b: optB,
        option_c: optC,
        option_d: optD,
        correct_option: correct,
        explanation: exp || "See solution.",
      });
    }
  }
  return parsed;
}

function deduplicateQuestions(questions) {
  const seen = new Set();
  return questions.filter((q) => {
    const key = q.question_text
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deduplicateAgainstList(newBatch, existingList) {
  const existingKeys = new Set(
    existingList.map((q) =>
      q.question_text
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 80)
    )
  );
  return newBatch.filter((q) => {
    const key = q.question_text
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 80);
    if (existingKeys.has(key)) return false;
    existingKeys.add(key);
    return true;
  });
}
