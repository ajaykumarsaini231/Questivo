// Adobe Symbol font → Unicode.
//
// WHY THIS EXISTS
//
// Coaching PDFs set Greek and maths operators in the Symbol font, whose glyphs
// have no Unicode mapping. Extractors emit them in the Private Use Area at
// U+F000 + the font's own character code, so "α" arrives as U+F061 — which is
// Symbol's slot for lowercase 'a'.
//
// Deleting the private-use range, which is the usual defensive move, therefore
// deletes the maths. A question reading "two tangents drawn from a point (α, β)
// lying on the ellipse" came out as "from a point (,) lying on the ellipse",
// with the variables it is about silently gone.
//
// The mapping below is Adobe's published Symbol encoding, so it is a lookup
// rather than a guess.
//
// SYMBOL IS NOT THE ONLY FONT IN THAT BLOCK
//
// A typesetter draws an accent — the arrow of a vector, the hat of a unit
// vector — as a separate glyph positioned over the letter, from a second
// symbol-encoded font. Those glyphs land in the SAME private-use block, and
// the two encodings collide: code 0x72 is Symbol's rho and the accent font's
// vector arrow, code 0x24 is Symbol's ∃ and the accent font's hat.
//
// Decoding by code alone therefore has to be wrong for one of them, and it was
// wrong for the accents. GATE MT 2026 Q32 — "a⃗ · (b⃗ × c⃗)", with hats on î ĵ k̂ —
// came out as
//
//     ρ ∃ ∃ ∃ a=2i-3j+4k ρ ∃ ∃ ∃ b=i+2j-3k ρ ...
//
// and its neighbour Q31 inherited three stray ρ, because an accent-only line
// sorts above the "Q.32" marker and so still counted as the previous question.
//
// Nothing in the character tells the two apart. The geometry does: an accent is
// drawn ON TOP OF the letter it modifies, whereas a Symbol letter is drawn
// after the one before it. So the accent codes are listed here and the decision
// is made in pdfLayout.mjs, which is where the positions live — see
// `attachAccents`. A glyph that no letter sits under is left to decode as
// Symbol, which is what a lone ρ (dislocation density, resistivity, the density
// of air) actually is.

/**
 * Accent code → the combining mark it draws, for glyphs confirmed in these
 * papers.
 *
 * Deliberately short. An accent that is not listed keeps its Symbol reading,
 * which is the same failure as before this existed — whereas guessing at codes
 * nobody has seen would corrupt Greek that is currently correct.
 */
export const ACCENT = {
  0x72: "⃗", // combining right arrow above — a vector
  0x24: "̂", // combining circumflex — a unit vector's hat
};

/**
 * The combining mark this character draws as an accent, or "" if it is not one.
 *
 * Answers only "could this be an accent"; whether it IS one is a question about
 * what sits beneath it, which only the caller can see.
 */
export function accentMark(ch) {
  if (!ch) return "";
  const cp = ch.codePointAt(0);
  if (cp < 0xf020 || cp > 0xf0ff) return "";
  return ACCENT[cp - 0xf000] || "";
}

/** Symbol character code → Unicode, for the codes these papers actually use. */
const SYMBOL = {
  0x22: "∀", 0x24: "∃", 0x27: "∋", 0x2a: "∗", 0x2d: "−", 0x40: "≅",
  // Uppercase Greek.
  0x41: "Α", 0x42: "Β", 0x43: "Χ", 0x44: "Δ", 0x45: "Ε", 0x46: "Φ", 0x47: "Γ",
  0x48: "Η", 0x49: "Ι", 0x4a: "ϑ", 0x4b: "Κ", 0x4c: "Λ", 0x4d: "Μ", 0x4e: "Ν",
  0x4f: "Ο", 0x50: "Π", 0x51: "Θ", 0x52: "Ρ", 0x53: "Σ", 0x54: "Τ", 0x55: "Υ",
  0x56: "ς", 0x57: "Ω", 0x58: "Ξ", 0x59: "Ψ", 0x5a: "Ζ",
  0x5c: "∴", 0x5e: "⊥", 0x60: "‾",
  // Lowercase Greek.
  0x61: "α", 0x62: "β", 0x63: "χ", 0x64: "δ", 0x65: "ε", 0x66: "φ", 0x67: "γ",
  0x68: "η", 0x69: "ι", 0x6a: "ϕ", 0x6b: "κ", 0x6c: "λ", 0x6d: "μ", 0x6e: "ν",
  0x6f: "ο", 0x70: "π", 0x71: "θ", 0x72: "ρ", 0x73: "σ", 0x74: "τ", 0x75: "υ",
  0x76: "ϖ", 0x77: "ω", 0x78: "ξ", 0x79: "ψ", 0x7a: "ζ", 0x7e: "∼",
  // Operators and relations.
  0xa2: "′", 0xa3: "≤", 0xa4: "⁄", 0xa5: "∞", 0xab: "↔", 0xac: "←", 0xad: "↑",
  0xae: "→", 0xaf: "↓", 0xb0: "°", 0xb1: "±", 0xb2: "″", 0xb3: "≥", 0xb4: "×",
  0xb5: "∝", 0xb6: "∂", 0xb7: "·", 0xb8: "÷", 0xb9: "≠", 0xba: "≡", 0xbb: "≈",
  0xbc: "…",
  0xc4: "⊗", 0xc5: "⊕", 0xc6: "∅", 0xc7: "∩", 0xc8: "∪", 0xc9: "⊃", 0xca: "⊇",
  0xcb: "⊄", 0xcc: "⊂", 0xcd: "⊆", 0xce: "∈", 0xcf: "∉",
  0xd0: "∠", 0xd1: "∇", 0xd5: "∏", 0xd6: "√", 0xd7: "⋅", 0xd8: "¬", 0xd9: "∧",
  0xda: "∨", 0xdb: "⇔", 0xdc: "⇐", 0xdd: "⇑", 0xde: "⇒", 0xdf: "⇓",
  0xe1: "⟨", 0xe5: "∑", 0xf1: "⟩", 0xf2: "∫",
};

/**
 * Pieces of a large delimiter, drawn as separate stacked glyphs.
 *
 * A tall bracket is assembled from a top, a middle repeated as often as needed,
 * and a bottom. Mapping each piece to "(" would produce "(((" for one bracket,
 * so the assembly pieces resolve to a single delimiter at the top and nothing
 * for the rest.
 */
const DELIMITER_PIECE = {
  0xe6: "(", 0xe7: "", 0xe8: "",     // parenleft  tp / ex / bt
  0xe9: "[", 0xea: "", 0xeb: "",     // bracketleft
  0xec: "{", 0xed: "", 0xee: "", 0xef: "", // braceleft + brace extender
  0xf3: "", 0xf4: "", 0xf5: "",      // integral tp / ex / bt — ∫ already emitted
  0xf6: ")", 0xf7: "", 0xf8: "",     // parenright
  0xf9: "]", 0xfa: "", 0xfb: "",     // bracketright
  0xfc: "}", 0xfd: "", 0xfe: "",     // braceright
};

/**
 * Rewrite Symbol-font private-use characters to real Unicode.
 *
 * Only U+F020–U+F0FF is touched, which is where the Symbol font lands. Other
 * private-use characters are genuinely unmappable and are left for the caller
 * to strip.
 */
export function decodeSymbolFont(s) {
  if (!s) return s;
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp >= 0xf020 && cp <= 0xf0ff) {
      const code = cp - 0xf000;
      if (code in DELIMITER_PIECE) out += DELIMITER_PIECE[code];
      else if (code in SYMBOL) out += SYMBOL[code];
      // ASCII slots (digits, letters, punctuation) mean themselves.
      else if (code >= 0x20 && code <= 0x7e) out += String.fromCharCode(code);
      // Anything else in the block is a glyph with no sensible text form.
    } else {
      out += ch;
    }
  }
  return out;
}
