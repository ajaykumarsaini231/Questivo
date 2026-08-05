#!/usr/bin/env node
// Print the words in the left margin of a page, with geometry.
//
// Anchoring a crop depends entirely on what the question number looks like to
// the recogniser — one word or two, where it sits, what it is misread as — so
// that is looked at directly rather than guessed from the reading-order dump.

import path from "node:path";
import process from "node:process";
import { ocrBooklet } from "./lib/bookletOcr.mjs";

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  if (!process.argv[i].startsWith("--")) continue;
  const k = process.argv[i].slice(2);
  const v = process.argv[i + 1];
  if (v && !v.startsWith("--")) { args[k] = v; i++; } else args[k] = true;
}

const { pages } = ocrBooklet(args.pdf, path.join("data", "pyq", ".booklet-ocr"));
const frac = Number(args.frac ?? 0.3);

for (const spec of String(args.pages).split(",")) {
  const [a, b] = spec.includes("-") ? spec.split("-").map(Number) : [Number(spec), Number(spec)];
  for (let i = a; i <= b; i++) {
    const p = pages[i];
    if (!p) continue;
    console.log(`\n──── page ${i}  ${p.width}x${p.height} ────`);
    const left = p.words
      .filter((w) => w.x < p.width * frac)
      .sort((x, y) => x.y - y.y || x.x - y.x);
    for (const w of left) {
      console.log(`  x=${String(Math.round(w.x)).padStart(4)} y=${String(Math.round(w.y)).padStart(4)} h=${String(Math.round(w.h)).padStart(3)}  ${JSON.stringify(w.text)}`);
    }
  }
}
