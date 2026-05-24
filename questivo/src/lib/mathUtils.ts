/**
 * src/lib/mathUtils.ts
 *
 * THE ULTIMATE MIXED HYBRID PARSER:
 * Combines the high-fidelity question text rendering of your 53-line core
 * with the robust option wrapping logic (applyToTextOnly + expanded commands) of Claude's version.
 */
export function preprocessMath(str: string): string {
  if (!str || typeof str !== 'string') return '';

  // ── Step 1: Clean network level double-escapes cleanly ───────────────────
  let cleaned = str
    .replace(/\\\\\(/g, '\\(')
    .replace(/\\\\\)/g, '\\)')
    .replace(/\\\\\[/g, '\\[')
    .replace(/\\\\\]/g, '\\]')
    .replace(/\\\\/g, '\\');

  // ── Step 2: Convert standard block macros ($$) ───────────────────────────
  cleaned = cleaned
    .replace(/\\\[\s*\\displaystyle([\s\S]*?)\\\]/g, '$$\n$1\n$$')
    .replace(/\\displaystyle\s*([\s\S]*?)(?=\n|$)/g, '$$\n$1\n$$')
    .replace(/\\\[/g, '$$\n')
    .replace(/\\\]/g, '\n$$');

  // ── Step 3: Handle LLM broken trailing fraction brackets ─────────────────
  cleaned = cleaned.replace(/\\(dfrac|frac)(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})(\s*[0-9a-zA-Z]+)/g, '\\$1$2{$3}');

  // ── Step 4: Extract & Encapsulate using your core Regex inside applyToTextOnly ──
  // We added cos, sin, tan, left, right, angle, circ, etc. directly into your core block regex
  const mixedMathBlockRegex = /\\(sum|frac|dfrac|infty|mathbf|vec|times|cdot|perp|ln|sin|cos|tan|text|alpha|beta|gamma|delta|theta|int|ge|le|left|right|angle|circ|degree)(?:(?:_[^{\s]+|^\^[^{\s]+)|(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})|[a-zA-Z0-9_\^\\\-\+\*\/\(\)\|\s\.,=])+/g;

  // CRITICAL MIX: We execute your regex ONLY on non-math text regions to prevent layout fragmentation!
  cleaned = applyToTextOnly(cleaned, (text) =>
    text.replace(mixedMathBlockRegex, (match) => {
      const trimmed = match.trim();
      if (!trimmed) return match;
      
      // Safety check: Don't encapsulate if it's purely conversational normal english text
      if (/^[a-zA-Z\s]+$/.test(trimmed) && !trimmed.includes('\\')) {
        return match; 
      }
      
      return ` $${trimmed}$ `;
    })
  );

  // ── Step 5: Normalize native inline brackets directly into symbols ───────
  cleaned = cleaned
    .replace(/\\\(/g, '$ ')
    .replace(/\\\)/g, ' $');

  // ── Step 6: Layout Sanitization ─────────────────────────────────────────
  return cleaned
    .replace(/\s{2,}/g, ' ')
    .replace(/\$\s*\$/g, '')
    .trim();
}

/**
 * Helper to process transformations ONLY on pure text nodes.
 * Existing math blocks are left untouched to prevent multi-token leakage.
 */
function applyToTextOnly(input: string, fn: (text: string) => string): string {
  const out: string[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    // $$ display math block bypass
    if (input[i] === '$' && input[i + 1] === '$') {
      const close = input.indexOf('$$', i + 2);
      if (close !== -1) {
        out.push(input.slice(i, close + 2));
        i = close + 2;
        continue;
      }
    }

    // $ inline math block bypass
    if (input[i] === '$' && input[i - 1] !== '\\') {
      let j = i + 1;
      while (j < len && !(input[j] === '$' && input[j - 1] !== '\\')) j++;
      if (j < len) {
        out.push(input.slice(i, j + 1));
        i = j + 1;
        continue;
      }
    }

    // Scan pure text segments up to the next raw math marker
    let end = i + 1;
    while (end < len && !(input[end] === '$' && input[end - 1] !== '\\')) end++;
    out.push(fn(input.slice(i, end)));
    i = end;
  }

  return out.join('');
}