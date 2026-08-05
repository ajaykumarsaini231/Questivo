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
  /^\s*(?:MT\s+)?Page\s+\d+(?:\s+of\s+\d+)?\s*$/gim,
];

/**
 * The heading that opens a block — "Q.11 – Q.35 Carry ONE mark Each".
 *
 * It is skipped when looking for where a question STARTS, or the paper would
 * come out one question adrift. Nothing stopped it landing inside the question
 * BEFORE it, though: a body runs to the next question, so the last question of
 * every block swallowed the heading of the next one and it surfaced in that
 * question's option D — "(D) rhombus Q.11 – Q.35 Carry ONE mark Each". Nineteen
 * questions across five papers, always Q5, Q10 or Q35.
 */
const BLOCK_HEADING =
  /^Q\s*\.\s*\d{1,3}\s*[–—-]\s*Q\s*\.\s*\d{1,3}\b|^Carry\s+(?:ONE|TWO)\s+marks?\s+Each\b/i;

/**
 * One row of a match-the-column table, as the extractor flattens it.
 *
 * The paper sets these two columns wide apart, but the column gap is whitespace
 * and the extractor collapses it, so "(P) Paris Law" and "(1) Creep" arrive
 * welded into one line. Joined into a stem, that reads as though the paper had
 * already paired them — a candidate reading the transcription of GATE MT 2026
 * Q37 is told P–1, Q–2, R–3, S–4, when the answer is P–2, Q–4, R–1, S–3. The
 * columns are pulled apart again below and listed one after the other.
 */
const TABLE_ROW = /^\(\s*([P-S])\s*\)\s*(.+?)\s*\(\s*([1-4])\s*\)\s*(.+)$/;
/** Its heading, welded the same way: "Column I Column II". */
const TABLE_HEADING =
  /^((?:Column|Section|List|Group)\s+I)\s+((?:Column|Section|List|Group)\s+II)\s*$/i;

/**
 * Re-lay a welded match table as the two lists it is.
 *
 * Only where at least two rows agree on the shape: one "(P) x (1) y" line on
 * its own is as likely to be a sentence that quotes both markers.
 */
function unweldColumns(lines) {
  const out = [];
  for (let i = 0; i < lines.length; ) {
    const head = TABLE_HEADING.exec(lines[i]);
    const left = [];
    const right = [];
    let j = head ? i + 1 : i;
    for (; j < lines.length; j++) {
      const row = TABLE_ROW.exec(lines[j]);
      if (!row) break;
      left.push(`(${row[1]}) ${row[2].trim()}`);
      right.push(`(${row[3]}) ${row[4].trim()}`);
    }
    if (left.length < 2) { out.push(lines[i]); i++; continue; }
    if (head) out.push(head[1], ...left, head[2], ...right);
    else out.push(...left, ...right);
    i = j;
  }
  return out;
}

/**
 * A line that BEGINS with an option marker.
 *
 * Used to refuse the borrow below. The test used to be that the line was
 * nothing BUT a marker, which covers a figure-option but not "(D) decrease in
 * entropy" — so a question whose number sat alone annexed the previous
 * question's last choice, losing it from one and prefixing the other.
 */
const STARTS_OPTION = /^\(\s*[A-D]\s*\)/;

/**
 * Every question in one GATE paper.
 *
 * @param {string[]} lines  from extractLines(buffer)
 * @returns {{number, questionText, options, interleaved}[]}
 *   `interleaved` means the reading order broke around a figure and the words
 *   cannot be trusted, whatever they say — see below.
 */
export function parseGatePaper(lines) {
  // Furniture lines are dropped, as they always were, but the FACT of one is
  // kept: `afterBreak[i]` says a running header or footer stood between line
  // i and the line before it. That is the page break, and where a question's
  // own text resumes after it — below its options — the extractor has read a
  // figure's two columns out of order and nothing in the words says so.
  const clean = [];
  const afterBreak = [];
  let broke = false;
  for (const line of lines) {
    let s = line;
    for (const re of STRIP) s = s.replace(re, " ");
    const text = s.replace(/\s+/g, " ").trim();
    if (!text) {
      if (s !== line) broke = true;
      continue;
    }
    clean.push(text);
    afterBreak.push(broke);
    broke = false;
  }

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
  //
  // The number is not always alone on its line either. extractLines orders by
  // baseline and WELDS the number to whichever line shares its own — which,
  // for a number centred against two lines of question, is the SECOND of them:
  //
  //     Which one of the following dislocation dissociation reactions is feasible in
  //     Q.18 face-centered cubic metals?
  //
  // The anchor then carries text, and the rule below used to read that as
  // proof the question was whole. GATE MT 2026 asked five questions beginning
  // mid-sentence because of it.
  //
  // Letting ANY anchor take back the line above fixes those five and wrecks a
  // hundred others: measured over 2019-2026, it also swallows the "Given:"
  // line belonging to the question before, and page furniture like "17 of 51".
  // Both look exactly like a wrapped clause to a rule that only reads the line
  // above. What separates them is the anchor's OWN text — a welded second line
  // continues a sentence, so it begins in lower case, while a question that
  // merely follows a stray line begins like a question. That test, together
  // with the line above running on in lower case too, moves those five and
  // nothing else in the archive.
  const RUNS_ON = /[a-z]\s*$/;
  const CONTINUES = /^[a-z]/;
  for (const s of starts) {
    s.from = s.line;
    if (s.line === 0) continue;
    if (s.rest && !(CONTINUES.test(s.rest) && RUNS_ON.test(clean[s.line - 1] ?? ""))) continue;
    const above = clean[s.line - 1];
    if (!above || STARTS_OPTION.test(above) || QUESTION.test(above)) continue;
    // A completed sentence above a bare question number belongs to the
    // question before it. A wrapped opening clause — the case this exists for —
    // runs on into the line below and does not end in a full stop.
    if (/[.?:;]\s*$/.test(above)) continue;
    s.rest = s.rest ? `${above} ${s.rest}` : above;
    s.from = s.line - 1;
  }

  return starts.map((s, idx) => {
    let to = idx + 1 < starts.length ? starts[idx + 1].from : clean.length;
    // The next block's heading is not part of this question. It sits between
    // two questions and belongs to neither, and left in it became the tail of
    // the last option of whichever question preceded it.
    for (let i = s.line + 1; i < to; i++) {
      if (BLOCK_HEADING.test(clean[i])) { to = i; break; }
    }

    const own = clean.slice(s.line + 1, to);

    // The question's own words resume after a page break that follows its
    // options: the extractor has read a figure's columns out of order, so the
    // sentence is in pieces and the pieces are in the wrong places. GATE MT
    // 2026 Q10 asks "Which one of the patterns labelled P, Q, R, and S" and
    // completes itself, three lines below its option D, with "is used to
    // generate the following". No arrangement of that text is the question;
    // the crop is, and the caller is told so rather than left to guess from
    // furniture that this function has already scrubbed.
    let lastOption = -1;
    for (let i = 0; i < own.length; i++) if (STARTS_OPTION.test(own[i])) lastOption = i;
    const interleaved =
      lastOption >= 0 &&
      own.slice(lastOption + 1).some((_, k) => afterBreak[s.line + 1 + lastOption + 1 + k]);

    const body = unweldColumns([s.rest, ...own].filter(Boolean))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const split = splitOptions(body);
    return {
      number: s.n,
      questionText: (split ? body.slice(0, split.questionEnd) : body).trim(),
      options: split?.options ?? null,
      interleaved,
    };
  });
}
