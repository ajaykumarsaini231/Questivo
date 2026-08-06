// Read the answer keys a source PDF actually prints, and say how far they can
// be trusted.
//
// WHY THIS IS A LIBRARY AND NOT A REGEX
//
// The keys are on the page. What is hard is not finding them, it is proving
// which question each one belongs to — and the archive's own rows are not
// automatically the right thing to trust for that. Three separate failures show
// up in these files:
//
//   * The BOOKLET does not always say "Ans.". A 2025 Chemistry family prints
//     the key on the solution header instead — "Sol.  (1)" — and a numerical
//     answer bare, "Ans. 900". A booklet read with only one marker in hand
//     comes back with nothing and looks unreadable when it is not.
//
//   * The ARCHIVE's rows can be off by one against the printed numbering. The
//     line-by-line parse of JEEMain_2025_Session2_03-Apr_Shift1_Chemistry
//     dropped printed question 55, so its stored row 5 holds question 56's
//     text and question 56's key, and every row after it is shifted. Filling
//     the gaps in a file like that BY NUMBER puts a correct key on the wrong
//     question — a wrong answer, produced carefully.
//
//   * A number at the head of a line is not always a question. Worked
//     solutions number their steps.
//
// So the reader below returns the printed pairing AND the evidence for it, and
// the caller is expected to refuse the file when the evidence is thin. The
// gates that matter are in `alignmentOf`: a complete, gapless run of question
// numbers, exactly one answer under each, and — where the archive already holds
// keys for that file — every one of them agreeing. A file that fails is left
// alone and reported, never half-filled.

import fs from "node:fs";
import * as mupdf from "mupdf";

/**
 * A question number at the head of a line: "51.", "7."
 *
 * The negative lookahead is the decimal guard the rest of this pipeline uses —
 * "1.5" opens no question. Solutions still number their steps, which is why a
 * number alone is never enough and `alignmentOf` insists on a clean run.
 */
const NUMBER_LINE = /^(\d{1,3})\s*\.(?!\d)/;

/**
 * Every way these booklets write down the key, most trusted first.
 *
 * `rank` decides who wins when one question carries more than one. NTA's own
 * key outranks ALLEN's reading of it — the archive already prefers the board
 * where a booklet prints both, and this keeps that choice rather than taking
 * whichever the page happens to put higher.
 *
 * `sol-paren` is last and deliberately narrow. "Sol." normally opens the
 * working, and only a bracketed option number straight after it is a key;
 * "Sol. (a – 5)" in a 2025 Maths booklet is an algebra step and is rejected by
 * CLEAN below, not by this pattern.
 */
const MARKERS = [
  { id: "official-nta", rank: 0, re: /Official\s*Ans\.?\s*by\s*NTA\s*\(\s*([^)\n]{1,24}?)\s*\)/i },
  { id: "ans-paren", rank: 1, re: /(?:^|[^A-Za-z])Ans\.?\s*\(\s*([^)\n]{1,24}?)\s*\)/i },
  { id: "ans-bare", rank: 2, re: /(?:^|[^A-Za-z])Ans(?:wer)?\s*\.?\s*[:=]?\s*(-?\d+(?:\.\d+)?)\s*$/i },
  { id: "answer-eq", rank: 3, re: /Answer\s*[:=]\s*\(?\s*([^)\n]{1,12}?)\s*\)?\s*$/i },
  { id: "sol-paren", rank: 4, re: /(?:^|[^A-Za-z])Sol\.?\s*\(\s*([^)\n]{1,24}?)\s*\)/i },
];

/**
 * What a printed key is allowed to look like.
 *
 * An option number or letter, possibly several for a multiple-correct
 * question; a number, with or without a decimal; or the board voiding the
 * question. Anything else is a line that merely resembled a key — an algebra
 * step, a citation, a fragment of a formula — and is dropped. This is the
 * guard that keeps "Sol." usable.
 */
const CLEAN =
  /^(?:[1-4](?:\s*[,;]\s*[1-4])*|[A-D](?:\s*[,;]?\s*[A-D])*|-?\d+(?:\.\d+)?|BONUS|Bonus|bonus|Dropped|DROPPED)$/;

/**
 * Read a PDF's question anchors and answer markers, with where they sit.
 *
 * Position is kept because a two-up booklet cannot be read as a stream: the
 * answer to a left-column question and the number of a right-column one share
 * a y, and only the column tells them apart.
 */
export function readPrinted(pdfPath) {
  const doc = mupdf.Document.openDocument(fs.readFileSync(pdfPath), "application/pdf");
  const anchors = [];
  const answers = [];

  for (let p = 0; p < doc.countPages(); p++) {
    const page = doc.loadPage(p);
    let st;
    try {
      st = JSON.parse(page.toStructuredText().asJSON());
    } catch {
      continue;
    }
    const [, , pageW] = page.getBounds();

    for (const block of st.blocks || []) {
      for (const line of block.lines || []) {
        const text = (line.text ?? "").trim();
        if (!text) continue;
        const b = line.bbox || {};
        const at = { page: p, x: b.x ?? 0, y: b.y ?? 0, pageW, text };

        const num = NUMBER_LINE.exec(text);
        if (num) {
          const n = Number(num[1]);
          if (n >= 1 && n <= 120) anchors.push({ ...at, n });
        }

        // Not an else: "(4) 0.441 g Ans. (3)" carries both, and the number
        // test above has already claimed whatever it claimed.
        for (const m of MARKERS) {
          const hit = m.re.exec(text);
          if (!hit) continue;
          const value = hit[1].trim();
          if (!CLEAN.test(value)) continue;
          answers.push({ ...at, value, via: m.id, rank: m.rank });
          break;
        }
      }
    }
  }
  return { anchors, answers, pages: doc.countPages() };
}

/**
 * Where a line sits in the booklet's reading order: page, then column, then y.
 *
 * The column term is what makes this a booklet reader rather than a page
 * reader. These are two-up pages read left column fully, then right; sorting
 * by y alone would interleave the two columns and hand every answer to
 * whichever question happened to share its height.
 */
const readingOrder = (a, b) =>
  a.page - b.page ||
  (a.x < a.pageW / 2 ? 0 : 1) - (b.x < b.pageW / 2 ? 0 : 1) ||
  a.y - b.y ||
  a.x - b.x;

/**
 * Attach each printed key to the question it answers: the last question number
 * before it in reading order.
 *
 * ACROSS COLUMNS AND PAGES, which is the whole point. An earlier version of
 * this looked only for a number above the answer in the same column of the
 * same page, and lost every question whose stem starts at the foot of one
 * column and whose answer line lands at the head of the next — four of the
 * twenty-five in the 24 Jan 2025 Physics booklet alone. A question ends at its
 * answer line, and neither a column break nor a page break ends it sooner.
 *
 * Nothing here depends on the questions being in order, only on each answer
 * following its own question, so a page that repeats an answer or drops a line
 * cannot shift the questions after it.
 */
export function pairPrinted(anchors, answers) {
  const stream = [
    ...anchors.map((a) => ({ ...a, kind: "q" })),
    ...answers.map((a) => ({ ...a, kind: "a" })),
  ].sort((a, b) => readingOrder(a, b) || (a.kind === "q" ? -1 : 1));

  // One segment per question number found, holding the keys printed after it
  // and before the next number.
  const segments = [];
  for (const item of stream) {
    if (item.kind === "q") { segments.push({ n: item.n, found: [] }); continue; }
    if (segments.length) segments[segments.length - 1].found.push(item);
  }

  const keys = new Map();
  const take = (n, marker) => {
    const held = keys.get(n);
    // Best-ranked marker wins — the board's own key outranks the publisher's.
    // Between equals the first one wins, because a repeated key is the same
    // key and anything later belongs to whatever the page does next.
    if (!held || marker.rank < held.rank) keys.set(n, marker);
  };

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const next = segments[i + 1];
    // A question number the extractor never saw still leaves its answer on the
    // page. The 30 Jan 2024 Chemistry booklet draws "79." through "82." rather
    // than typesetting them, so four questions vanish from the anchors while
    // their four "Ans." lines stay exactly where they were — between question
    // 78 and question 83.
    //
    // Because the numbering is contiguous, the size of that hole is known: the
    // gap between two consecutive anchors says how many questions are inside
    // it. When the number of keys sitting in the gap matches the number of
    // questions in it, the assignment is the only one possible and nothing is
    // being guessed. When it does not match, the segment keeps its first key
    // and the rest of the hole is left empty.
    const gap = next && next.n > seg.n ? next.n - seg.n : 1;
    if (gap > 1 && seg.found.length === gap) {
      seg.found.forEach((m, k) => take(seg.n + k, m));
      continue;
    }
    for (const m of seg.found) take(seg.n, m);
  }
  return keys;
}

/**
 * The longest run of consecutive question numbers, and where it starts.
 *
 * A subject booklet numbers by its position in the paper — 2025 Chemistry runs
 * 51-75 — so the run's first number is what the archive's question 1 means.
 * Stray numbers from worked solutions sit outside the run and are ignored by
 * it.
 */
export function longestRun(numbers) {
  const set = new Set(numbers);
  let best = { base: null, length: 0 };
  for (const b of [...set].sort((x, y) => x - y)) {
    let n = b;
    while (set.has(n)) n++;
    if (n - b > best.length) best = { base: b, length: n - b };
  }
  return best;
}

/**
 * Decide whether this file's printed numbering can be trusted to line up with
 * the archive's rows, and hand back the keys if it can.
 *
 * THE GATES, and why each one is there
 *
 *   run       The printed numbers must form one unbroken run at least as long
 *             as the archive's row count. A gap means a question number was
 *             not read, and every row after the gap would be attributed to the
 *             wrong printed question.
 *
 *   coverage  Every number in that run must carry exactly one key. A question
 *             with none is a hole; the run stops being a reliable index.
 *
 *   checksum  Every key the archive ALREADY holds for this file must match the
 *             printed one. This is the strongest gate and the reason the
 *             03-Apr Chemistry booklet is refused: its stored rows are shifted
 *             one place against the page, so filling its gaps by number would
 *             have put right answers on wrong questions. The keys that survived
 *             the first parse are used here as a checksum on the alignment, not
 *             as something to be overwritten.
 *
 * @param {object[]} rows       the archive's rows for this one file
 * @param {Map<number,object>} keys  printed keys by printed question number
 * @param {{base:number,length:number}} run
 * @param {(printed:string, row:object)=>string|null} storedForm
 */
export function alignmentOf(rows, keys, run, storedForm, options = {}) {
  const count = rows.length;
  // The run only has to be long enough to fix where the numbering STARTS —
  // 2025 Chemistry at 51, JEE Advanced at 1. It does not have to reach the end
  // of the paper: the 30 Jan 2024 Chemistry booklet draws four of its question
  // numbers rather than typesetting them, so its longest unbroken run is 18 of
  // 30, and refusing on that would have thrown away a file whose every stored
  // key the page reproduces.
  if (run.base === null || run.length < Math.min(count, 10)) {
    return { ok: false, why: `printed numbering runs ${run.length}, archive holds ${count} row(s)` };
  }

  /**
   * Two readings of the same key.
   *
   * Option 3 and option C are the same answer written two ways, and the
   * archive is not consistent about which it stores — four rows of the 1 Feb
   * 2024 Shift 2 Physics booklet are typed numerical but hold "C". Treating
   * that as a disagreement would condemn a file over the archive's own
   * bookkeeping rather than over anything on the page.
   */
  const LETTER_OF = { 1: "A", 2: "B", 3: "C", 4: "D" };
  const bothWays = (v) => {
    const s = String(v).trim().toUpperCase();
    const out = new Set([s]);
    if (LETTER_OF[s]) out.add(LETTER_OF[s]);
    for (const [d, l] of Object.entries(LETTER_OF)) if (s === l) out.add(d);
    return out;
  };
  const agrees = (mine, held) => {
    for (const a of bothWays(mine)) if (bothWays(held).has(a)) return true;
    return (
      Number.isFinite(Number(mine)) &&
      Number.isFinite(Number(held)) &&
      Math.abs(Number(mine) - Number(held)) < 1e-9
    );
  };

  /** Score one candidate alignment: how many stored keys it reproduces. */
  const score = (base) => {
    const clashes = [];
    let checked = 0;
    for (const r of rows) {
      if (!r.correctAnswer) continue;
      const printed = keys.get(base + r.questionNumber - 1);
      if (!printed) continue;
      const mine = storedForm(printed.value, r);
      if (mine === null) continue;
      checked++;
      if (!agrees(mine, r.correctAnswer)) {
        clashes.push(`Q${r.questionNumber}: page says ${mine}, archive holds ${r.correctAnswer}`);
      }
    }
    return { base, checked, clashes };
  };

  let best = score(run.base);

  // A file whose rows are shifted WHOLESALE against the page can still be
  // used, because the shift is discoverable. JEEMain_2025_Session1_23-Jan_
  // Shift1_Maths is one: its line parse lost a question early on, so every row
  // sits one place further down the page than its number says. If exactly one
  // offset reproduces EVERY stored key and the run still covers the rows, that
  // offset is the alignment — it is not a preference, it is the only reading
  // the file's own surviving keys allow.
  //
  // A file shifted only PART of the way through — right at the start, wrong
  // after question 5 — matches no single offset, fails here, and is refused.
  // That is the intended outcome: it cannot be filled without inventing the
  // boundary.
  if (best.clashes.length) {
    const span = options.searchOffsets ?? 4;
    const candidates = [];
    for (let d = -span; d <= span; d++) {
      if (d === 0) continue;
      const base = run.base + d;
      if (base < run.base || base + count - 1 > run.base + run.length - 1) continue;
      const s = score(base);
      if (!s.clashes.length && s.checked >= 8) candidates.push(s);
    }
    if (candidates.length === 1) best = { ...candidates[0], shifted: candidates[0].base - run.base };
  }

  const { clashes, checked } = best;
  if (clashes.length) {
    return { ok: false, why: `archive disagrees with the page on ${clashes.length} key(s)`, clashes, checked };
  }

  // A file whose rows carry no keys at all offers no checksum, so the run has
  // to stand on its own: exactly as many printed questions as there are rows,
  // and a key under every one of them. That is the 23 Jan 2025 Chemistry
  // booklet — 25 questions numbered 51-75, 25 keys, 25 rows, and nothing else
  // it could line up with.
  // How much evidence the checksum actually carries.
  //
  // Zero surviving keys means no checksum at all, and a handful means very
  // little — a run of four that happens to agree proves nothing about where
  // the file starts. Eight is the bar for accepting an alignment on the
  // strength of the archive's own keys.
  const MIN_CHECKED = 8;
  if (checked < MIN_CHECKED) {
    // Below the bar the alignment has to be argued from what the rows ARE.
    // These files parsed to nothing at all and every row is a placeholder the
    // converter generated from the paper's shape, numbered 1..N in order and
    // carrying the crop cut from the n-th printed question. There is no line
    // parse that could have slipped, and the page prints exactly N questions,
    // so row n is printed question base+n-1 and nothing else.
    const allPlaceholders = rows.every((r) => options.isPlaceholder?.(r));
    const covered = run.length === count && rows.every((r) => keys.has(run.base + r.questionNumber - 1) || true);
    if (!allPlaceholders || !covered || best.shifted) {
      return {
        ok: false,
        why:
          `only ${checked} stored key(s) to check the alignment against` +
          (allPlaceholders ? "" : `, and its rows are not all figure-only placeholders`) +
          (covered ? "" : `, and the page prints ${run.length} questions for ${count} row(s)`),
        checked,
      };
    }
  }

  return { ok: true, checked, base: best.base, shifted: best.shifted ?? 0 };
}

export { NUMBER_LINE, MARKERS, CLEAN as CLEAN_KEY };
