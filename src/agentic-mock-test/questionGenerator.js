// questionGenerator.js
import { perplexity } from "./openaiClient.js";

/**
 * params:
 *  - examType: string
 *  - topics: string[]
 *  - numQuestions: number (1–60)
 *  - difficulty: string
 *  - sessionType: string
 *  - medium: string ("English" | "Hindi" | "Hinglish" | "Bilingual (English+Hindi)")
 */
export async function generateQuestionsAgent({
  examType,
  topics,
  numQuestions,
  difficulty,
  sessionType,
  medium = "English",
}) {
  if (!examType) {
    throw new Error("examType is required");
  }
  if (!Array.isArray(topics) || topics.length === 0) {
    throw new Error("topics[] is required and must have at least one topic");
  }

  let n = Number(numQuestions) || 10;
  if (n < 1) n = 1;
  if (n > 60) n = 60;

  const topicsList = topics.join(", ");

  const systemPrompt = `
You are an expert question-setter for Indian Sarkari / government exams.

You MUST follow these rules VERY STRICTLY:

1. Generate EXACTLY ${n} multiple-choice questions (MCQs).
2. Target exam: ${examType}
3. Allowed topics (ONLY choose from these): ${topicsList}
4. Difficulty level: ${difficulty}
5. Questions MUST be original and NOT copied word-for-word from real previous year papers.
6. Language / Medium: ${medium}   // "English", "Hindi", "Hinglish", or "Bilingual (English+Hindi)"
7. Session type: ${sessionType}
8. All questions in this set MUST be mutually different. Do NOT repeat the same question text, numbers, or structure with only minor wording changes.

Behavior specifics for medium:
- If medium is "English": Write every question and option entirely in clear English and use Latin letters for option markers (A), B), C), D)).
- If medium is "Hindi": Write every question and option entirely in Devanagari Hindi. Use Latin option markers (A), B), C), D)) to keep parsing consistent.
- If medium is "Hinglish": Use primarily English sentence structure but allow short, natural Hindi words/phrases (in Devanagari or Latin script) sparingly where it improves clarity; keep formal exam tone. Use Latin option markers.
- If medium is "Bilingual (English+Hindi)": Provide each question twice — first in English, then immediately in Hindi (Devanagari) — with identical meaning and same option order. Use Latin option markers. After both lines mark the correct option using "Correct: <letter>".

Session behavior:
- If sessionType is "practice":
  • Create mixed practice questions inspired by standard books and typical PYQ patterns of this exam.
  • Cover concepts broadly and include some exam-style tricks.
  • Do NOT copy any real PYQ exactly; make them original but similar in style and difficulty.

- If sessionType is "pyq":
  • Create questions that closely resemble actual previous year questions of this exam in style, pattern, and difficulty.
  • Still keep the wording, numbers, and exact text ORIGINAL (no direct copy from any actual past paper).
  • Focus more on exam-type patterns that are known to repeat (common formats, typical traps, etc.).

Each question should clearly follow this structure in plain text (do NOT use markdown):

Question 1 (Difficulty - Topic):
<question text on next line>
A) option
B) option
C) option
D) option
Correct: <correct option letter and/or text>

Then Question 2, Question 3, and so on.

Do NOT include explanations or anything outside the questions.
`.trim();

  const userPrompt = "Generate the questions now following the structure described.";

  let raw;

  try {
    const res = await perplexity.post("/chat/completions", {
      model: "sonar-reasoning",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 4000,
      temperature: 0.7,
    });

    raw = res.data?.choices?.[0]?.message?.content || "";
    console.log("RAW MODEL OUTPUT:\n", raw);
  } catch (err) {
    console.error("Perplexity API error:");
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Data:", err.response.data);
      throw new Error(
        `Perplexity API error ${err.response.status}: ${JSON.stringify(
          err.response.data
        )}`
      );
    } else {
      console.error(err.message);
      throw err;
    }
  }

  // Optional: strip code fences
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();

  // First, try old JSON-array method (future-proof)
  let questions = tryParseJsonArray(cleaned, n);
  if (!questions) {
    // Fallback: parse "Question 1 (Difficulty - Topic): ..." style text
    questions = parseQuestionsFromText(cleaned, {
      examType,
      defaultDifficulty: difficulty,
      maxQuestions: n,
      sessionType,
      medium,
    });
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("Could not extract any questions from model output.");
  }

  if (questions.length > n) {
    questions = questions.slice(0, n);
  }

  return questions;
}

// Try to extract [ ... ] JSON array if ever exists
function tryParseJsonArray(cleaned, n) {
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");

  if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
    return null;
  }

  const jsonSlice = cleaned.slice(firstBracket, lastBracket + 1);

  try {
    const arr = JSON.parse(jsonSlice);
    if (Array.isArray(arr)) {
      return arr.slice(0, n);
    }
    return null;
  } catch (e) {
    console.error("JSON parse error (array attempt). Raw slice was:\n", jsonSlice);
    return null;
  }
}

// Parse "Question 1 (Easy - Percentage):" style text
function parseQuestionsFromText(
  text,
  { examType, defaultDifficulty, maxQuestions, sessionType, medium = "English" }
) {
  // 1. Remove <think> ... part if present
  const thinkCloseIndex = text.indexOf("</think>");
  let body = text;
  if (thinkCloseIndex !== -1) {
    body = text.slice(thinkCloseIndex + "</think>".length).trim();
  }

  // Accept both English "Question" and Hindi "प्रश्न" headers (case-insensitive)
  // We'll look for blocks starting with either "Question <num>" or "प्रश्न <num>"
  const headerPattern = "(?:Question|प्रश्न)\\s+\\d+";
  const regex = new RegExp(
    `${headerPattern}\\s*(?:\\([^)]*\\))?\\s*:\\s*([\\s\\S]*?)(?=(?:${headerPattern}\\s*(?:\\(|:)|$))`,
    "gi"
  );

  const results = [];
  let match;
  // Alternative: a more liberal matcher that splits by Question/प्रश्न tokens
  const splitRegex = /(?:Question|प्रश्न)\s+\d+\s*(?:\([^\)]*\))?\s*:/gi;
  const parts = body.split(splitRegex).map((p) => p.trim()).filter(Boolean);

  // To get headers we extract all header tokens to pair with parts
  const headers = [];
  body.replace(/(?:Question|प्रश्न)\s+(\d+)\s*(?:\(([^)]*)\))?\s*:/gi, (m, num, meta) => {
    headers.push({ raw: m, num: Number(num), meta: meta || "" });
    return m;
  });

  // Use headers/parts pairing (safer)
  for (let i = 0; i < parts.length && results.length < maxQuestions; i++) {
    const header = headers[i] || {};
    const block = parts[i] || "";
    if (!block) continue;

    // Header meta parsing (like "(Easy - Percentage)")
    const metaText = header.meta ? header.meta : "";
    const [difficultyRaw, topicRaw] = (metaText || "").split("-").map((s) => s.trim());

    const difficulty =
      difficultyRaw && difficultyRaw.length > 0 ? difficultyRaw : defaultDifficulty;

    const topic = topicRaw && topicRaw.length > 0 ? topicRaw : "General";

    // Split block into lines and filter empty lines
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) continue;

    // Determine question text line:
    // - If medium is bilingual, model likely put English then Hindi. Prefer English (first non-Devanagari) line.
    // - If medium is English, pick first line that contains Latin characters.
    // - If medium is Hindi, pick first Devanagari-containing line.
    let questionText = "";
    const devanagariRegex = /[\u0900-\u097F]/;
    const latinRegex = /[A-Za-z0-9]/;

    if (medium && medium.toLowerCase().startsWith("bilingual")) {
      // prefer a Latin-containing line first
      questionText = lines.find((l) => latinRegex.test(l)) || lines[0];
    } else if (medium && medium.toLowerCase() === "hindi") {
      questionText = lines.find((l) => devanagariRegex.test(l)) || lines[0];
    } else {
      // English or Hinglish: pick first Latin-like line
      questionText = lines.find((l) => latinRegex.test(l)) || lines[0];
    }

    // Now find options and correct line
    let optionA = "";
    let optionB = "";
    let optionC = "";
    let optionD = "";
    let correctOption = "";
    let explanation = "";

    // The lines after questionText may include options and Correct:
    const remaining = lines.slice(lines.indexOf(questionText) + 1);

    for (const line of remaining) {
      // Match "A) ..." or "A. ..." or "A) " ignoring leading Devanagari markers if present
      if (/^[Aa]\)\s*/.test(line) || /^[Aa]\.\s*/.test(line)) {
        optionA = line.replace(/^[Aa][\)\.]\s*/i, "").trim();
      } else if (/^[Bb]\)\s*/.test(line) || /^[Bb]\.\s*/.test(line)) {
        optionB = line.replace(/^[Bb][\)\.]\s*/i, "").trim();
      } else if (/^[Cc]\)\s*/.test(line) || /^[Cc]\.\s*/.test(line)) {
        optionC = line.replace(/^[Cc][\)\.]\s*/i, "").trim();
      } else if (/^[Dd]\)\s*/.test(line) || /^[Dd]\.\s*/.test(line)) {
        optionD = line.replace(/^[Dd][\)\.]\s*/i, "").trim();
      } else if (/^Correct:/i.test(line) || /^Correct\s*[:\-]/i.test(line)) {
        const m = line.match(/Correct\s*[:\-]?\s*([ABCD])/i);
        if (m) correctOption = m[1].toUpperCase();
      } else if (/^सही उत्तर[:：]/i.test(line)) {
        // Hindi "सही उत्तर: A"
        const m = line.match(/सही उत्तर[:：]?\s*([A-DA-ड])/i);
        if (m) {
          // try to extract A/B/C/D from Devanagari or latin, normalize later
          const letter = m[1];
          // If letter is Latin A-D use it; otherwise try map Devanagari to Latin (not exhaustive)
          const devMap = { "A": "A", "B": "B", "C": "C", "D": "D" };
          if (devMap[letter]) correctOption = devMap[letter];
        }
      } else {
        // allow inline option like "A) option B) option C) option D) option" (rare)
        const inlineMatch = line.match(/A\)\s*([^B]+)\s*B\)\s*([^C]+)\s*C\)\s*([^D]+)\s*D\)\s*(.+)/i);
        if (inlineMatch) {
          optionA = inlineMatch[1].trim();
          optionB = inlineMatch[2].trim();
          optionC = inlineMatch[3].trim();
          optionD = inlineMatch[4].trim();
        }
      }
    }

    // If the model duplicated bilingual options (English + Hindi), options may have duplicates.
    // Prefer Latin options for English/Hinglish/bilingual; prefer Devanagari for Hindi medium.
    function preferOption(opt) {
      if (!opt) return "";
      if (medium && medium.toLowerCase() === "hindi") return opt;
      // strip trailing Devanagari if bilingual; prefer Latin-containing substring
      return opt;
    }

    optionA = preferOption(optionA);
    optionB = preferOption(optionB);
    optionC = preferOption(optionC);
    optionD = preferOption(optionD);

    // Basic validation
    if (!optionA || !optionB || !optionC || !optionD || !correctOption) {
      // Skip incomplete parsed blocks — but continue attempting others
      continue;
    }

    results.push({
      exam_type: examType,
      topic,
      difficulty,
      question_text: questionText,
      option_a: optionA,
      option_b: optionB,
      option_c: optionC,
      option_d: optionD,
      correct_option: correctOption,
      explanation,
    });
  }

  return results;
}
