// Parse a GATE question paper and its official answer key.
//
// GATE is a much better-behaved source than the JEE compilations. Its key is a
// published table that states, per question, the TYPE and the MARKS:
//
//   Q. No. | Session | Question Type | Subject Name | Key/Range | Mark
//      1   |    6    |      MCQ      |      GA      |     B     |   1
//     26   |    6    |      MSQ      |      MT      |    A,B    |   1
//     30   |    6    |      NAT      |      MT      |  0 to 0   |   1
//
// So none of the content-based classification in lib/sectionKeys.mjs is needed
// here — that machinery exists only because the JEE sources interleave their
// numerical questions and print a key in a different order. Read the type.
//
// THE TABLE MUST BE READ WITHOUT COLUMN SPLITTING
//
// A table's cells sit in vertical bands with clear space between them, which is
// exactly the signature lib/pdfLayout.mjs looks for when deciding a page is
// two-column. Left to itself it tears the six columns apart and yields
// "1 6 MCQ" — Subject, Key and Mark silently gone, every answer lost, no error
// raised. Hence `{ columns: false }`.

/** "Q.12" at the start of a line. */
const QUESTION = /^Q\s*\.\s*(\d{1,3})\b/;

/** A section heading — "Q.1 – Q.5 Carry ONE mark Each" — not a question. */
const SECTION_HEADING = /^Q\s*\.\s*\d{1,3}\s*[–-]\s*Q\s*\.\s*\d{1,3}/;

/** "(A)" … "(D)", at a line start or after whitespace. */
const OPTION_MARK = /(?:^|\s)\(([A-D])\)/g;

/**
 * One row of the printed key.
 *
 *   "1 6 MCQ GA B 1"            → MCQ, GA, key "B", 1 mark
 *   "26 6 MSQ MT A,B 1"         → multiple-select, key "A,B"
 *   "30 6 NAT MT 0 to 0 1"      → numerical, answer anywhere in [0, 0]
 *   "31 6 NAT MT 1.5 to 1.7 2"  → numerical range
 */
const KEY_ROW =
  /^(\d{1,3})\s+\S+\s+(MCQ|MSQ|NAT)\s+([A-Za-z]{2,3})\s+(.+?)\s+(\d)\s*$/;

/**
 * Read the official key.
 *
 * @param {string[]} lines  from extractLines(buffer, { columns: false })
 * @returns {Map<number, {type, subject, key, marks}>}
 */
export function parseGateKey(lines) {
  const key = new Map();
  for (const line of lines) {
    const m = KEY_ROW.exec(line.trim());
    if (!m) continue;
    const n = Number(m[1]);
    if (n < 1 || n > 100 || key.has(n)) continue;
    key.set(n, {
      type: m[2].toUpperCase(),
      subject: m[3].toUpperCase(),
      key: m[4].trim(),
      marks: Number(m[5]),
    });
  }
  return key;
}

/** Split "(A) … (B) … (C) … (D) …" out of a question body. */
function splitOptions(text) {
  const marks = [...text.matchAll(OPTION_MARK)];
  if (marks.length < 4) return null;

  // Take the four that divide the text most evenly. An option's own text can
  // quote "(A)" — assertion-reason and match-the-column questions do it
  // constantly — and splitting at every marker produces slivers.
  const at = (d) => marks.filter((m) => m[1] === d);
  let run = null;
  let best = -1;
  for (const a of at("A")) {
    for (const b of at("B")) {
      if (b.index <= a.index) continue;
      for (const c of at("C")) {
        if (c.index <= b.index) continue;
        for (const d of at("D")) {
          if (d.index <= c.index) continue;
          const score = Math.min(
            b.index - a.index,
            c.index - b.index,
            d.index - c.index,
            text.length - d.index
          );
          if (score > best) { best = score; run = [a, b, c, d]; }
        }
      }
    }
  }
  if (!run) return null;

  const options = {};
  for (let i = 0; i < 4; i++) {
    const from = run[i].index + run[i][0].length;
    const to = i < 3 ? run[i + 1].index : text.length;
    options["ABCD"[i]] = text.slice(from, to).trim();
  }
  return { options, questionEnd: run[0].index };
}

/**
 * Page furniture that would otherwise land inside a question.
 *
 * The running footer is three separate lines and each one has to go. The
 * subject line was matched only when "GATE <year>" preceded it, which it does
 * not — so "Metallurgical Engineering (MT)" survived into the text and became
 * the whole of option D on four questions whose real options are figures.
 */
const STRIP = [
  /Organi[sz]ing Institute[^\n]*/gi,
  /^\s*(?:GATE\s*20\d\d\s*)?Metallurgical\s+Engineering\s*\(MT\)\s*$/gim,
  /^\s*Page\s+\d+\s+of\s+\d+\s*$/gim,
];

/** A line that is nothing but an option marker — the choice itself is a figure. */
const BARE_OPTION = /^\(\s*[A-D]\s*\)\s*$/;

/**
 * Every question in one GATE paper.
 *
 * @param {string[]} lines  from extractLines(buffer)
 * @returns {{number, questionText, options}[]}
 */
export function parseGatePaper(lines) {
  const clean = lines
    .map((l) => {
      let s = l;
      for (const re of STRIP) s = s.replace(re, " ");
      return s.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean);

  // Where each question starts. Section headings match the question pattern
  // too — "Q.1 – Q.5 Carry ONE mark Each" — and taking one as question 1 would
  // make the whole paper one question out.
  const starts = [];
  for (let i = 0; i < clean.length; i++) {
    if (SECTION_HEADING.test(clean[i])) continue;
    const m = QUESTION.exec(clean[i]);
    if (!m) continue;
    const n = Number(m[1]);
    if (n < 1 || n > 100) continue;
    // Numbers must not go backwards; a "Q.3" inside a later stem is not a
    // question start.
    if (starts.length && n <= starts[starts.length - 1].n) continue;
    starts.push({ n, line: i, rest: clean[i].replace(QUESTION, "").replace(/^\s*[.:]?\s*/, "").trim() });
  }

  // These papers are laid out as a table: the question number sits in a narrow
  // left cell and the question in a wide one beside it. When the text cell
  // wraps, its first line can be typeset a shade ABOVE the number's baseline,
  // and the extractor — which orders by baseline, correctly — emits
  //
  //     Which one of the following crystal structure changes occurs during
  //     Q.23
  //     the transformation of mild steel from austenite to martensite?
  //
  // Cut at the "Q.23" line, question 23 loses its opening clause and question
  // 22 gains it — and since 22's options were figures, that stray clause became
  // its option D. The tell is an anchor line carrying nothing but the number,
  // so the line above it is taken back.
  for (const s of starts) {
    s.from = s.line;
    if (s.rest || s.line === 0) continue;
    const above = clean[s.line - 1];
    if (!above || BARE_OPTION.test(above) || QUESTION.test(above)) continue;
    s.rest = above;
    s.from = s.line - 1;
  }

  return starts.map((s, idx) => {
    const to = idx + 1 < starts.length ? starts[idx + 1].from : clean.length;
    const body = [s.rest, ...clean.slice(s.line + 1, to)]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    // Footer residue is deliberately LEFT IN. A question printed beside a
    // figure, or a match-the-column table, is typeset in two columns with the
    // footer between them, so "Page 2 of 38" comes back cut in half with
    // question text wedged into the gap — and that is the only reliable signal
    // that the columns interleaved and the text cannot be trusted. Scrubbing it
    // here would leave a scrambled stem looking clean. The caller flags on it,
    // then cleans.
    const split = splitOptions(body);
    return {
      number: s.n,
      questionText: (split ? body.slice(0, split.questionEnd) : body).trim(),
      options: split?.options ?? null,
    };
  });
}
