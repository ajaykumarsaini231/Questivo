// Parsers for the JEE Main 2023 PDFs.
//
// WHY 2023 NEEDS ITS OWN PAIR
//
// The 2022 parsers cannot read these files, for two reasons that have nothing
// to do with the extractor:
//
//   * 2022's ALLEN booklets label options (A)(B)(C)(D). The 2023 booklets — and
//     both years of MathonGo — label them (1)(2)(3)(4). A parser looking for an
//     ascending A-D run finds none and returns no options at all.
//   * 2022's booklets number each section from 1. The 2023 booklets number
//     across the whole paper, and the base depends on where the subject sits:
//     Mathematics 1-30, Physics 31-60, Chemistry 61-90. Anchoring on "^1." finds
//     nothing in a Physics file whose first question is "31.".
//
// Both parsers take the LINES produced by pdfLayout.extractLines, not
// pdf-parse's text. The geometry matters: these booklets are set two-up, and
// only the layout-aware reader keeps a question clear of the worked solution
// printed in the column beside it.

/* ------------------------------ shared bits ----------------------------- */

/** Page furniture that repeats and would otherwise land mid-question. */
const NOISE = [
  /^©?\s*(ALLEN\s*)?Digital\s*Pvt\.?\s*Ltd\.?/i,
  /^ALLEN\s*Digital/i,
  /FINAL\s+JEE\s*[–-]?\s*MAIN\s+EXAM/i,
  /^\(Held\s+On\b/i,
  /^TIME\s*:/i,
  /^TEST\s+PAPER\s+WITH/i,
  /^IN\s+ATION\s*[–-]/i,
  /^JEE\s*[-–]?\s*MAIN\s+EXAMINATION/i,
  /MEMORY\s+BASED/i,
  /^Join the Most Relevant Test Series/i,
  /^J\s?EE Main \d{4}.*Previous Year Paper/i,
  /^Question Paper\s*MathonGo\s*$/i,
  /^JEE Main Previous Year Paper\s*$/i,
  /^MathonGo\s*$/i,
  /^Page\s+\d+/i,
  /^\d+\s*$/,
];

const isNoise = (l) => NOISE.some((re) => re.test(l.trim()));

/** Join wrapped lines into one string. */
export function join(lines) {
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split a body into stem + four options, on (1)(2)(3)(4) labels.
 *
 * The labels are found as an ASCENDING RUN rather than individually, because
 * option text quotes numbers in brackets all the time — "(1) 1 (2) 1/2" has a
 * bare "1" right after the label, and statement questions carry "(1)" inside
 * their prose. A run of four in order, taken as the LAST such run in the body,
 * is the real option list.
 *
 * Returns null when there is no such run, which is the normal case for a
 * Section B numerical question.
 */
export function splitOptions(body) {
  // `(?<!\^)` and `(?<!_)` so a superscript/subscript brace the layout reader
  // emitted is never read as an option label.
  const marks = [...body.matchAll(/(?<![\^_]\{?)\((\d)\)/g)].filter((m) => "1234".includes(m[1]));
  if (marks.length < 4) return null;

  let start = -1;
  for (let i = 0; i + 3 < marks.length; i++) {
    if (marks.slice(i, i + 4).every((m, k) => m[1] === String(k + 1))) start = i;
  }
  if (start < 0) return null;

  const run = marks.slice(start, start + 4);
  const options = {};
  for (let i = 0; i < 4; i++) {
    const from = run[i].index + run[i][0].length;
    const to = i < 3 ? run[i + 1].index : body.length;
    options["ABCD"[i]] = body.slice(from, to).trim();
  }
  return { options, stem: body.slice(0, run[0].index).trim() };
}

/* ------------------------------ ALLEN 2023 ------------------------------ */

// Finding the answer line and reading the answer off it are two different jobs,
// and conflating them loses questions either way round:
//
//   * Anchored on the end of the line, "Official Ans. by NTA (4125) 54." fails —
//     two-up typesetting runs the next question's number onto the answer line —
//     and that question disappears from the paper.
//   * Anchored on the brackets, the shifts that print "Official Ans. by NTA 3"
//     with no brackets at all fail instead, and eight questions disappear.
//
// So detection is as loose as it can be (the phrase alone, which never occurs
// inside a worked solution) and extraction tries the bracketed form first, then
// the bare one. Empty brackets are meaningful and preserved: the question papers
// that carry no key print "( )", which reads as "no key in this source" rather
// than as a wrong answer.
const OFFICIAL_LINE = /Official\s*Ans\.?\s*by\s*NTA/i;
const OFFICIAL_PARENS = /Official\s*Ans\.?\s*by\s*NTA\s*\(\s*([^)\n]{0,24}?)\s*\)/i;
const OFFICIAL_BARE = /Official\s*Ans\.?\s*by\s*NTA\s*:?\s*([^\s(][^\n]{0,23}?)\s*$/i;

function officialAnswerOf(line) {
  const p = OFFICIAL_PARENS.exec(line);
  if (p) return p[1].trim();
  const b = OFFICIAL_BARE.exec(line);
  return b ? b[1].trim() : null;
}
const ALLEN_ANS = /^\s*Allen\s*Ans\.?\s*\(?\s*([^)\n]{1,24}?)\s*\)?\s*$/i;

/**
 * Every question in one ALLEN 2023 solution booklet (one subject, one shift).
 *
 * Segmentation anchors on "Official Ans. by NTA", which appears exactly once
 * per question and never inside a worked solution. Anchoring on "^N." instead
 * breaks: solutions are full of lines like "5. 0 10 cm" that are the tail of a
 * formula, and one false positive shifts every question after it.
 *
 * @param {string[]} lines  from pdfLayout.extractLines
 */
export function parseAllen2023(lines) {
  const secAt = [];
  lines.forEach((l, i) => {
    const m = /^SECTION\s*[-–—]?\s*([AB])\b/i.exec(l.trim());
    if (m) secAt.push({ i, section: m[1].toUpperCase() });
  });
  if (!secAt.length) return [];

  // The paper-wide base for this subject, e.g. 31 for Physics. Taken from the
  // first numbered line after SECTION-A rather than assumed, because the base
  // differs per subject and the subject order is not fixed across shifts.
  let base = null;
  for (let i = secAt[0].i + 1; i < Math.min(secAt[0].i + 12, lines.length); i++) {
    const m = /^(\d{1,3})\s*\./.exec(lines[i].trim());
    if (m) { base = Number(m[1]); break; }
  }
  if (base == null) base = 1;

  const out = [];

  for (let s = 0; s < secAt.length; s++) {
    const { i: secStart, section } = secAt[s];
    const secEnd = s + 1 < secAt.length ? secAt[s + 1].i : lines.length;

    const anchors = [];
    for (let i = secStart + 1; i < secEnd; i++) if (OFFICIAL_LINE.test(lines[i])) anchors.push(i);

    // Section A is the first 20, Section B the next 10, continuing the same
    // paper-wide run.
    const numberAt = (k) => (section === "A" ? base + k : base + 20 + k);

    const starts = anchors.map((anchor, k) => {
      const from = k === 0 ? secStart + 1 : anchors[k - 1] + 1;
      const want = new RegExp(`^${numberAt(k)}\\s*\\.`);
      for (let j = from; j < anchor; j++) if (want.test(lines[j].trim())) return j;
      return from;
    });

    anchors.forEach((anchor, k) => {
      const num = numberAt(k);
      const head = lines
        .slice(starts[k], anchor)
        .filter((l) => !isNoise(l))
        .map((l, idx) => (idx === 0 ? l.replace(new RegExp(`^\\s*${num}\\s*\\.\\s*`), "") : l));

      const body = join(head);
      const split = section === "A" ? splitOptions(body) : null;

      const tailTo = k + 1 < starts.length ? starts[k + 1] : secEnd;
      const solution = join(
        lines
          .slice(anchor + 1, tailTo)
          .filter((l) => !ALLEN_ANS.test(l) && !OFFICIAL_LINE.test(l) && !isNoise(l))
      ).replace(/^Sol\b\.?\s*/i, "").trim();

      const allenLine = lines
        .slice(anchor + 1, Math.min(anchor + 4, tailTo))
        .find((l) => ALLEN_ANS.test(l));

      out.push({
        section,
        paperNumber: num,
        numberInSubject: section === "A" ? k + 1 : 20 + k + 1,
        questionText: split ? split.stem : body,
        options: split ? split.options : null,
        officialAnswer: officialAnswerOf(lines[anchor]),
        allenAnswer: allenLine ? ALLEN_ANS.exec(allenLine)[1].trim() : null,
        solution: solution || null,
      });
    });
  }

  return out;
}

/* ---------------------------- MathonGo 2023 ----------------------------- */

/** MathonGo replaces a question it could not typeset with this placeholder. */
const DUMMY = /^\s*hello dummy text\s*$/i;

/**
 * One MathonGo compilation: all 90 questions of a shift, plus its answer key.
 *
 * Subject comes from the question number, not from a heading — the file prints
 * none. 1-30 Physics, 31-60 Chemistry, 61-90 Mathematics, and within each
 * subject the first 20 are Section A and the last 10 Section B.
 *
 * @param {string[]} lines  from pdfLayout.extractLines
 */
export function parseMathonGo2023(lines) {
  const keyStart = lines.findIndex((l) => /^ANSWER\s*KEYS?\b/i.test(l.trim()));
  const bodyEnd = keyStart >= 0 ? keyStart : lines.length;

  // The key is a grid; the column split hands it back in two runs, so the
  // question number in each entry is what identifies it, not its position.
  const key = new Map();
  if (keyStart >= 0) {
    const keyText = lines.slice(keyStart).join(" ");
    for (const m of keyText.matchAll(/\b(\d{1,2})\s*\.\s*\(\s*(-?[\d.]+)\s*\)/g)) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 90 && !key.has(n)) key.set(n, m[2]);
    }
  }

  const subjectOf = (n) => (n <= 30 ? "Physics" : n <= 60 ? "Chemistry" : "Mathematics");
  const sectionOf = (n) => (((n - 1) % 30) + 1 <= 20 ? "A" : "B");

  // Anchors are found in the JOINED text, not at line starts.
  //
  // Where a page sets its maths as vector outlines only the connecting prose
  // has a text layer, so a whole run of questions arrives as
  // "(1) (2) (3) (4) Q79. Let be real valued function defined as . Then range
  // of is (1) (2) (3) (4) Q80. ..." — several questions on one rendered line,
  // none of them starting one. Requiring "^Q79." loses all nine of them and the
  // paper quietly reports 81 questions.
  //
  // Consecutive numbering is what makes this safe to do mid-line: only a marker
  // that continues the run counts, so a "Q12." quoted inside prose is ignored.
  const body = join(lines.slice(0, bodyEnd).filter((l) => !isNoise(l)));
  const marks = [];
  let prev = 0;
  for (const m of body.matchAll(/Q\s*(\d{1,3})\s*\./g)) {
    const n = Number(m[1]);
    if (n === prev + 1) {
      marks.push({ n, at: m.index, len: m[0].length });
      prev = n;
    }
  }

  const found = marks.map((mk, k) => {
    const to = k + 1 < marks.length ? marks[k + 1].at : body.length;
    const raw = body.slice(mk.at + mk.len, to).trim();
    const placeholder = DUMMY.test(raw) || /hello dummy text/i.test(raw);
    const text = raw.replace(/hello dummy text/gi, "").trim();
    const section = sectionOf(mk.n);
    const split = section === "A" ? splitOptions(text) : null;

    return {
      section,
      paperNumber: mk.n,
      numberInSubject: ((mk.n - 1) % 30) + 1,
      subject: subjectOf(mk.n),
      questionText: split ? split.stem : text,
      options: split ? split.options : null,
      officialAnswer: key.get(mk.n) ?? null,
      placeholder,
      missingText: false,
    };
  });

  // NOTHING IS DROPPED.
  //
  // Some shifts print a run of questions as a scan with no text layer at all —
  // 31 Jan Shift 2 loses Q79-Q87, a whole page of them. There is no anchor to
  // find because there is no text on the page to anchor to, so walking the
  // anchors silently returns 81 questions and the paper looks complete.
  //
  // The answer key is printed as text even when the questions are not, so the
  // key is what says how many questions the paper really has. Every number it
  // lists that the walk did not reach is emitted here with its key intact and
  // flagged, and the figure pass renders the page it lives on.
  const byNumber = new Map(found.map((q) => [q.paperNumber, q]));
  const out = [];
  const highest = key.size ? Math.max(...key.keys()) : 0;
  const total = Math.max(highest, ...found.map((q) => q.paperNumber), 0);

  for (let n = 1; n <= total; n++) {
    const hit = byNumber.get(n);
    if (hit) { out.push(hit); continue; }
    out.push({
      section: sectionOf(n),
      paperNumber: n,
      numberInSubject: ((n - 1) % 30) + 1,
      subject: subjectOf(n),
      questionText: "",
      options: null,
      officialAnswer: key.get(n) ?? null,
      placeholder: false,
      missingText: true,
    });
  }

  return { questions: out, key };
}
