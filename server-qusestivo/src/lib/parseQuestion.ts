/**
 * src/lib/parseQuestion.ts
 * * * BACKEND ISOLATED MARKUP PARSER UTILITY WITH PIECEWISE & STRING CORRECTIONS
 * Normalizes and encapsulates raw mathematical nodes before state storage commit.
 */

function enforceMathBoundaries(text) {
  if (!text || typeof text !== 'string') return text;

  let s = text;

  // 1. Clean escape arrays from transport data stream
  s = s.replace(/\\\\\(/g, '\\(').replace(/\\\\\)/g, '\\)')
       .replace(/\\\\\[/g, '\\[').replace(/\\\\\]/g, '\\]')
       .replace(/\\\\/g, '\\');

  // 2. CRITICAL CASES ENVIRONMENT FIX:
  // Automatically detects piecewise equations (\begin{cases} ... \end{cases})
  // and forces them into dedicated block math ($$) rows so they render beautifully.
  s = s.replace(/(?<!\$\$?)\\begin\{cases\}([\s\S]*?)\\end\{cases\}(?!\$\$?)/g, '\n$$\n\\begin{cases}$1\\end{cases}\n$$\n');

  // 3. FIX BROKEN LLM STRING LEAKS:
  // Clears malformed backslash-zero artifacts (e.g., "x \neq 0\0" becomes "x \neq 0, 0")
  s = s.replace(/\\0/g, ', 0');

  // 4. Fix trailing brace structural leakage from raw text generation (e.g. \dfrac{3\pi}64)
  s = s.replace(/\\(dfrac|frac)(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})(\s*[0-9a-zA-Z]+)/g, '\\$1$2{$3}');

  // 5. Balanced state scanner to catch naked LaTeX strings
  const result = [];
  let i = 0;
  const len = s.length;

  while (i < len) {
    if (s[i] === '\\' && i + 1 < len && /[a-zA-Z]/.test(s[i + 1])) {
      const currentProgress = result.join('');
      const lastDollar = currentProgress.lastIndexOf('$');
      let insideMath = false;
      
      if (lastDollar !== -1) {
        let count = 0;
        for (let idx = 0; idx < lastDollar; idx++) {
          if (currentProgress[idx] === '$' && (idx === 0 || currentProgress[idx - 1] !== '\\')) count++;
        }
        insideMath = (count % 2 === 1); // Odd count means the current position is safely inside a math block
      }

      // If already within math or currently processing a cases block layout, pass through natively
      if (insideMath || s.slice(0, i).lastIndexOf('\\begin{cases}') > s.slice(0, i).lastIndexOf('\\end{cases}')) {
        result.push(s[i]);
        i++;
        continue;
      }

      // Scan dynamic string limits natively to catch the whole mathematical block parameters
      const exprStart = i;
      i = scanExpressionLimits(s, i);
      const expr = s.slice(exprStart, i).trim();

      if (expr.length > 0) {
        if (expr.startsWith('$') || expr.startsWith('\\[')) {
          result.push(expr);
        } else {
          result.push(`$${expr}$`);
        }
      }
    } else {
      result.push(s[i]);
      i++;
    }
  }

  return result.join('')
    .replace(/\\\(/g, '$').replace(/\\\)/g, '$')
    .replace(/\s{2,}/g, ' ')
    .replace(/\$\s*\$/g, '');
}

function scanExpressionLimits(text, start) {
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
      if (j < len && (text[j] === '\\' || text[j] === '^' || text[j] === '_' || text[j] === '{' || text[j] === '=' || text[j] === '+')) {
        i = j; continue;
      }
      break;
    }
    if (ch === '\n' || /[a-zA-Z]{4,}/.test(text.slice(i, i + 4))) {
      // Break immediately on carriage returns or clear English words (length >= 4)
      break;
    }
    i++;
  }
  return i;
}

/* ================= THE PARSER CONTEXT PIPELINE LOOP ================= */
export function parseBatchQuestions(text, ctx) {
  let cleanText = text.replace(/Here are.*?:\n/i, "");
  let rawBlocks = cleanText.split("---");
  if (rawBlocks.length < 2) rawBlocks = cleanText.split(/(?=^(?:Question|Q)\s*[:\-\.])/im);

  const parsed = [];
  const KEY_PATTERNS = {
    question:    /^(?:Question|Q|प्रश्न)\s*[:\-\.]/i,
    topic:       /^Topic\s*:/i,
    optA:        /^A\s*[)\.\:\-]/i,
    optB:        /^B\s*[)\.\:\-]/i,
    optC:        /^C\s*[)\.\:\-]/i,
    optD:        /^D\s*[)\.\:\-]/i,
    correct:     /^(?:Correct|Ans|Answer|Correct\s+Answer)\s*[:\-\.\s]/i,
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

    // Wrap math structural fields dynamically via enforceMathBoundaries on backend server context
    parsed.push({
      id: `q_${Math.abs(rawQuestion.split('').reduce((h, c) => { h = ((h << 5) - h) + c.charCodeAt(0); return h | 0; }, 0)).toString(36)}`,
      exam_type: ctx.examType,
      topic,
      difficulty: ctx.difficulty,
      question_text: enforceMathBoundaries(rawQuestion),
      option_a:      enforceMathBoundaries(rawOptA),
      option_b:      enforceMathBoundaries(rawOptB),
      option_c:      enforceMathBoundaries(rawOptC),
      option_d:      enforceMathBoundaries(rawOptD),
      correct_option: correct,
      explanation:   enforceMathBoundaries(rawExplanation) || 'See solution.',
    });
  }
  return parsed;
}