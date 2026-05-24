/**
 * Dynamic Preprocessing Parser Utility
 * Cleans backslash leaks and translates block structures to explicit syntax tags
 */
export function preprocessMath(str) {
  if (!str || typeof str !== 'string') return '';

  return str
    // 1. Fix native JS double-escape artifacts leaking over network contexts
    .replace(/\\\\\(/g, '\\(')
    .replace(/\\\\\)/g, '\\)')
    .replace(/\\\\\[/g, '\\[')
    .replace(/\\\\\]/g, '\\]')
    
    // 2. Map structural block formulas to standard markdown notation
    .replace(/\\\[\s*\\displaystyle([\s\S]*?)\\\]/g, '$$\n$1\n$$')
    .replace(/\\displaystyle\s*([\s\S]*?)(?=\n|$)/g, '$$\n$1\n$$')
    
    // 3. Normalize structural blocks back to standard LaTeX blocks
    .replace(/\\\[/g, '$$\n')
    .replace(/\\\]/g, '\n$$')
    
    // 4. Convert inline delimiters to native KaTeX blocks
    .replace(/\\\(/g, '$ ')
    .replace(/\\\)/g, ' $')
    
    // 5. Final fallback sanitization for raw string literals
    .replace(/\\\\/g, '\\');
}