// Wrap the mathematics in extracted text so KaTeX will render it.
//
// The layout extractor produces LaTeX notation — `^{2}`, `_{n}`,
// `\frac{14}{15}` — but leaves it bare in the sentence. remark-math only
// renders what is delimited, so bare notation reaches the page as the literal
// characters "\frac{14}{15}", which is worse than no markup at all.
//
// Wrapping the whole string is not an option either: the stems are prose with
// mathematics embedded in them, and `$...$` around an English sentence makes
// KaTeX render the words as italic variables.
//
// So this finds the mathematical spans and delimits only those. The rule for
// what counts is deliberately strict — a span must contain a fraction, a
// script or a Greek letter to qualify at all, and multi-letter English words
// break a span — because a false positive turns readable prose into gibberish,
// while a false negative merely leaves a superscript looking flat.

const GREEK = "αβγδεζηθικλμνξοπρςστυφχψωϑϕϖΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ";
const SYMBOLS = "∇∂∞∫∑∏√≤≥≠≈≡∼±∓×÷·⋅→←↔⇒⇐⇔∈∉⊂⊆⊃⊇∪∩∧∨°′″−";
/** Function names are the one multi-letter run allowed inside a span. */
const FUNCS = "sinh|cosh|tanh|sin|cos|tan|cot|sec|cosec|csc|log|ln|exp|lim|det|max|min";

const SCRIPTS = String.raw`(?:\^\{[^{}]*\}|_\{[^{}]*\})*`;

const ATOM = [
  String.raw`\\frac\{[^{}]*\}\{[^{}]*\}${SCRIPTS}`,
  `(?:${FUNCS})\\b${SCRIPTS}`,
  `[${GREEK}]${SCRIPTS}`,
  String.raw`\d+(?:\.\d+)?${SCRIPTS}`,
  // A short letter run that carries a script is a unit or a symbol, not a
  // word: Nm^{-2}, JK^{-1}, PA^{-1}. Without this the span breaks at the unit
  // and the exponent is orphaned outside the delimiters.
  String.raw`[A-Za-z]{2,4}(?=\^\{|_\{)${SCRIPTS}`,
  // A single letter is a variable; two together are a word.
  String.raw`(?<![A-Za-z])[A-Za-z](?![A-Za-z])${SCRIPTS}`,
  // A script with no base of its own. The typesetter sometimes leaves one
  // stranded — "the ratio is _{32}^{x}" — and without this it falls outside the
  // delimiters and reaches the page as the literal characters.
  String.raw`(?:\^|_)\{[^{}]*\}`,
  `[${SYMBOLS}]`,
  // Brackets take scripts too — "(16β^{2} + 50)^{2}".
  String.raw`[=+\-/()\[\]|,]${SCRIPTS}`,
].join("|");

const SPAN = new RegExp(`(?:${ATOM})(?:[ \\t]*(?:${ATOM}))*`, "g");

/**
 * A span is only mathematics if it carries one of these.
 *
 * Deliberately does NOT include the general operator set. A match-the-column
 * option — "(A) - (IV), (B) - (I), (C) - (II)" — is nothing but single letters,
 * brackets and dashes, and treating the dash as proof of mathematics wrapped
 * the whole thing, producing "($A) - ($IV$),(B) - (I)". Those characters may
 * appear INSIDE a span; they just cannot be the reason one exists.
 */
const IS_MATH = new RegExp(String.raw`\\frac|\^\{|_\{|[${GREEK}]|[∫∑∏√∂∇∞]`);

/**
 * Unicode → LaTeX, applied inside a math span.
 *
 * KaTeX accepts a lot of Unicode directly, but not all of it, and the failures
 * are silent-ish: U+2212 MINUS SIGN and U+00B7 MIDDLE DOT render as an error
 * box rather than an operator. The existing datasets in data/pyq are written in
 * LaTeX commands, so converting here also means every question on the site is
 * marked up the same way regardless of whether it came from a JSON feed or a
 * PDF.
 */
const TO_LATEX = [
  [/[−–—]/g, "-"],
  [/×/g, "\\times "],
  [/÷/g, "\\div "],
  [/[·⋅]/g, "\\cdot "],
  [/≤/g, "\\leq "],
  [/≥/g, "\\geq "],
  [/≠/g, "\\neq "],
  [/≈/g, "\\approx "],
  [/≡/g, "\\equiv "],
  [/∼/g, "\\sim "],
  [/±/g, "\\pm "],
  [/∓/g, "\\mp "],
  [/∞/g, "\\infty "],
  [/∫/g, "\\int "],
  [/∑/g, "\\sum "],
  [/∏/g, "\\prod "],
  [/√/g, "\\sqrt "],
  [/∂/g, "\\partial "],
  [/∇/g, "\\nabla "],
  [/→/g, "\\to "],
  [/←/g, "\\leftarrow "],
  [/↔/g, "\\leftrightarrow "],
  [/⇒/g, "\\Rightarrow "],
  [/⇐/g, "\\Leftarrow "],
  [/⇔/g, "\\Leftrightarrow "],
  [/∈/g, "\\in "],
  [/∉/g, "\\notin "],
  [/⊂/g, "\\subset "],
  [/⊆/g, "\\subseteq "],
  [/⊃/g, "\\supset "],
  [/⊇/g, "\\supseteq "],
  [/∪/g, "\\cup "],
  [/∩/g, "\\cap "],
  [/∧/g, "\\wedge "],
  [/∨/g, "\\vee "],
  [/∅/g, "\\emptyset "],
  [/∠/g, "\\angle "],
  [/⊥/g, "\\perp "],
  [/∴/g, "\\therefore "],
  [/°/g, "^\\circ "],
  [/′/g, "'"],
  [/″/g, "''"],
  [/Ω/g, "\\Omega "],
  [/α/g, "\\alpha "], [/β/g, "\\beta "], [/γ/g, "\\gamma "], [/δ/g, "\\delta "],
  [/ε/g, "\\epsilon "], [/ζ/g, "\\zeta "], [/η/g, "\\eta "], [/θ/g, "\\theta "],
  [/ι/g, "\\iota "], [/κ/g, "\\kappa "], [/λ/g, "\\lambda "], [/μ/g, "\\mu "],
  [/ν/g, "\\nu "], [/ξ/g, "\\xi "], [/π/g, "\\pi "], [/ρ/g, "\\rho "],
  [/[σς]/g, "\\sigma "], [/τ/g, "\\tau "], [/υ/g, "\\upsilon "],
  [/[φϕ]/g, "\\phi "], [/χ/g, "\\chi "], [/ψ/g, "\\psi "], [/ω/g, "\\omega "],
  [/Γ/g, "\\Gamma "], [/Δ/g, "\\Delta "], [/Θ/g, "\\Theta "], [/Λ/g, "\\Lambda "],
  [/Ξ/g, "\\Xi "], [/Π/g, "\\Pi "], [/Σ/g, "\\Sigma "], [/Φ/g, "\\Phi "],
  [/Ψ/g, "\\Psi "],
  // Function names must be commands or KaTeX sets them as a product of
  // variables — "sin" renders as s·i·n in italics.
  [/\b(sinh|cosh|tanh|sin|cos|tan|cot|sec|csc|log|ln|exp|lim|det|max|min)\b/g, "\\$1 "],
];

function toLatex(span) {
  let s = span;
  for (const [re, to] of TO_LATEX) s = s.replace(re, to);
  // "\alpha ^{2}" is legal but ugly, and a space before a script reads badly in
  // the source when someone comes to check it.
  return s.replace(/\s+([_^])/g, "$1").replace(/\s{2,}/g, " ").trim();
}

/** Trim punctuation that belongs to the sentence, not the formula. */
function tighten(span) {
  let s = span;
  // Leading operators with nothing to operate on.
  s = s.replace(/^[\s,=+\-/|]+/, "");
  // A trailing comma or full stop is the sentence's.
  s = s.replace(/[\s,.]+$/, "");
  // Unbalanced brackets read as broken LaTeX; drop them from the edges.
  while (s && (s.match(/\(/g) || []).length < (s.match(/\)/g) || []).length) {
    s = s.replace(/\)(?=[^)]*$)/, "").trim();
  }
  while (s && (s.match(/\(/g) || []).length > (s.match(/\)/g) || []).length) {
    s = s.replace(/\(/, "").trim();
  }
  return s.trim();
}

/**
 * Delimit the mathematical spans of a string with `$...$`.
 *
 * Idempotent: text that already contains `$` or `\(` delimiters is returned
 * untouched rather than double-wrapped.
 */
/**
 * Put the structural parts of a question on their own lines.
 *
 * The printed paper sets these as separate blocks, and the extractor correctly
 * joins wrapped lines back into one — which leaves an assertion-reason or
 * match-the-column question as a single unbroken wall:
 *
 *   "Given below are two statements: Statement-I: An elevator can go up or
 *    down... Statement-II: Force exerted by the floor... In the light of the
 *    above statements, choose the correct answer from the options given below:"
 *
 * A candidate has to compare the two statements, so they need to be visually
 * separable. A blank line is used rather than a single newline because
 * react-markdown collapses a lone newline into a space.
 */
const BLOCK_STARTS = [
  /\s*(Statement[- ]?(?:I{1,3}|1|2|3)\s*:)/gi,
  /\s*(Assertion\s*\(?A\)?\s*:)/gi,
  /\s*(Reason\s*\(?R\)?\s*:)/gi,
  /\s*(In the light of the above statements?,)/gi,
  /\s*(Choose the (?:most appropriate|correct)[^:]{0,40}:)/gi,
  /\s*(List[- ]?I{1,2}\s*:)/gi,
];

export function splitBlocks(text) {
  if (!text) return text;
  let s = text;
  for (const re of BLOCK_STARTS) s = s.replace(re, "\n\n$1");
  return s
    // "In the light of the above statements, choose the correct answer..." is
    // one sentence; both halves match a rule, so the break has to be undone.
    .replace(/(In the light of the above statements?,)\n\n/gi, "$1 ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .trim();
}

/**
 * Delimit any LaTeX the span pass left stranded outside `$...$`.
 *
 * The span rules are conservative by design, so an expression that straddles a
 * word boundary can end up with its fraction outside the span. Whatever the
 * cause, a bare `\frac{1}{2}` reaches the page as those literal characters,
 * which is the one outcome worse than not marking it up at all. This wraps each
 * orphan individually — ugly compared with a proper span, but rendered.
 */
const ORPHAN = /\\(?:frac|dfrac)\{[^{}]*\}\{[^{}]*\}|\\[a-zA-Z]+|[\^_]\{[^{}]*\}/g;

function mopUp(s) {
  let out = "";
  let i = 0;

  while (i < s.length) {
    // Skip over anything already inside delimiters.
    if (s[i] === "$") {
      const close = s.indexOf("$", i + 1);
      if (close === -1) { out += s.slice(i); break; }
      out += s.slice(i, close + 1);
      i = close + 1;
      continue;
    }
    let end = s.indexOf("$", i);
    if (end === -1) end = s.length;
    out += s.slice(i, end).replace(ORPHAN, (m) => `$${m}$`);
    i = end;
  }
  return out;
}

export function wrapMath(text) {
  if (!text) return text;
  if (/\$|\\\(|\\\[/.test(text)) return text;

  let out = "";
  let last = 0;

  for (const m of text.matchAll(SPAN)) {
    const raw = m[0];
    if (!IS_MATH.test(raw)) continue;

    const inner = tighten(raw);
    // A bare symbol on its own — a stray "−" or a lone "°" — is punctuation in
    // context, and wrapping it only adds noise.
    if (inner.length < 2 || !IS_MATH.test(inner)) continue;

    const at = m.index + raw.indexOf(inner);
    if (at < last) continue;

    out += text.slice(last, at) + `$${toLatex(inner)}$`;
    last = at + inner.length;
  }

  const wrapped = mopUp(out + text.slice(last));

  // Last line of defence. An odd number of delimiters means a span boundary
  // landed inside another one, and KaTeX will then swallow the rest of the
  // sentence looking for a closer. Better to ship the text unmarked than to
  // ship it broken.
  return (wrapped.match(/\$/g) || []).length % 2 === 0 ? wrapped : text;
}
