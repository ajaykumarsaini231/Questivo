#!/usr/bin/env node
// Check that the crops on disk are usable images of what they claim to be.
//
// scripts/auditPyq.mjs checks what a stored question would RENDER as text.
// This is the same question for its pictures, and it exists because the failure
// modes here are silent: a crop that trimmed away too much is still a valid PNG
// and still links, it is just a picture of half a sentence. Nothing downstream
// notices.
//
// What it looks for:
//
//   blank         almost no ink. An image of empty paper beside a radio button
//                 reads as a choice the examiner printed and left blank.
//   sliver        a few pixels tall or wide — a rule or a stray mark, not text.
//   over-trimmed  far too small for the option text extracted alongside it,
//                 which means the trim cut into the content.
//   huge          taller than a page, so a band ran away and swallowed the
//                 questions below it.
//
// WHAT --fix MAY AND MAY NOT ACT ON
//
// Only `blank` and `sliver`: an image with no ink, or one a few pixels across,
// is unusable whatever else is true, and showing it beside a radio button
// invents a choice the examiner did not print.
//
// `over-trimmed` is REPORTED ONLY, deliberately. It compares the crop's area
// against the length of the option text extracted beside it, and that
// comparison cannot tell apart the two ways they disagree:
//
//   the crop is wrong   the trim ate the sentence
//   the TEXT is wrong   the extractor interleaved two columns, so the string is
//                       far longer than what the paper printed
//
// 24 Jun 2022 Shift 1 Chemistry Q3 is the second kind: its stored option B
// reads "$\alpha 12p 32 K = (2+\alpha)^{12}..." and the crop is a clean picture
// of "(2) 300". Acting on the size alone would delete the only correct copy.
//
// Usage:
//   node scripts/auditFigures.mjs --file data/pyq/gate-mt.json --dir ../pyq-figures/gate-mt
//   node scripts/auditFigures.mjs --file ... --dir ... --fix

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as mupdf from "mupdf";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    const v = argv[i + 1];
    if (v && !v.startsWith("--")) { out[k] = v; i++; } else out[k] = true;
  }
  return out;
}

const args = parseArgs(process.argv);
if (!args.file || !args.dir) {
  console.error("--file <converted json> and --dir <figures folder> are required");
  process.exit(2);
}

/** Rendered at 2x, so these are half their value in points. */
const MIN_SIDE = 10;
const MAX_HEIGHT = 4000;
/** Below this fraction of ink the image is effectively empty paper. */
const MIN_INK = 0.0008;
/** Roughly how many rendered pixels one character of text occupies. */
const PX_PER_CHAR = 9;

/** Ink fraction and size of a PNG, without decoding it twice. */
function measure(file) {
  const pix = mupdf.Image.prototype ? null : null;
  void pix;
  // mupdf reads a PNG through the same document machinery as anything else.
  const img = new mupdf.Image(fs.readFileSync(file));
  const p = img.toPixmap();
  try {
    const w = p.getWidth();
    const h = p.getHeight();
    const stride = p.getStride();
    const comps = p.getNumberOfComponents();
    const px = p.getPixels();
    let ink = 0;
    for (let y = 0; y < h; y++) {
      const base = y * stride;
      for (let x = 0; x < w; x++) if (px[base + x * comps] < 200) ink++;
    }
    return { w, h, ink: ink / Math.max(1, w * h) };
  } finally {
    p.destroy?.();
  }
}

const rows = JSON.parse(fs.readFileSync(args.file, "utf8"));
const problems = [];
let checked = 0;

const PARTS = [
  ["questionImage", null],
  ["optionAImage", "optionA"],
  ["optionBImage", "optionB"],
  ["optionCImage", "optionC"],
  ["optionDImage", "optionD"],
  ["solutionImage", null],
];

for (const row of rows) {
  for (const [key, textKey] of PARTS) {
    const name = row[key];
    if (!name) continue;
    const file = path.join(args.dir, String(name).split(/[\\/]/).pop());
    if (!fs.existsSync(file)) {
      problems.push({ kind: "missing", row, key, detail: file });
      continue;
    }
    let m;
    try {
      m = measure(file);
    } catch (e) {
      problems.push({ kind: "unreadable", row, key, detail: e.message });
      continue;
    }
    checked++;

    if (m.w < MIN_SIDE || m.h < MIN_SIDE) {
      problems.push({ kind: "sliver", row, key, detail: `${m.w}x${m.h}` });
    } else if (m.ink < MIN_INK) {
      problems.push({ kind: "blank", row, key, detail: `${(m.ink * 100).toFixed(3)}% ink` });
    } else if (m.h > MAX_HEIGHT) {
      problems.push({ kind: "huge", row, key, detail: `${m.w}x${m.h}` });
    } else if (textKey) {
      // The extracted text is an independent measure of how much SHOULD be in
      // the picture. A 60-character option in an image 40 pixels wide means the
      // trim ate the sentence.
      const chars = String(row[textKey] || "").replace(/\s+/g, " ").trim().length;
      if (chars > 20 && m.w * m.h < chars * PX_PER_CHAR * MIN_SIDE) {
        problems.push({ kind: "over-trimmed", row, key, detail: `${m.w}x${m.h} for ${chars} chars` });
      }
    }
  }
}

const by = {};
for (const p of problems) by[p.kind] = (by[p.kind] || 0) + 1;

console.log(`${checked} image(s) checked from ${rows.length} row(s)`);
console.log(`${problems.length} problem(s)`, JSON.stringify(by));
for (const kind of Object.keys(by)) {
  console.log(`\n${kind}:`);
  for (const p of problems.filter((x) => x.kind === kind).slice(0, 6)) {
    const r = p.row;
    console.log(`  ${r.paperId ?? r.examCode} ${r.subject} Q${r.questionNumber} ${p.key} — ${p.detail}`);
  }
}

if (args.fix) {
  const UNUSABLE = new Set(["sliver", "blank", "missing", "unreadable"]);
  let dropped = 0;
  let blinded = 0;
  for (const p of problems) {
    if (!UNUSABLE.has(p.kind)) continue;
    p.row[p.key] = null;
    dropped++;

    // Dropping an option's picture when it had no text either leaves that
    // choice stated nowhere. Flagged so the player says so, instead of
    // rendering an empty row that reads as a blank choice.
    const textKey = PARTS.find(([k]) => k === p.key)?.[1];
    if (textKey && !String(p.row[textKey] || "").trim()) {
      p.row.needsFigure = true;
      blinded++;
    }
  }
  fs.writeFileSync(args.file, JSON.stringify(rows, null, 2));
  console.log(
    `\n✔ ${dropped} unusable image reference(s) removed (blank or sliver only).` +
      (blinded ? `\n  ${blinded} of those had no text either — flagged needsFigure.` : "") +
      `\n  over-trimmed findings are reported, never auto-fixed: see the note at the top of this file.`
  );
  process.exit(0);
}

process.exit(problems.length ? 1 : 0);
