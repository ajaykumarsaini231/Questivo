#!/usr/bin/env node
// Print what each page of a booklet looks like, so its structure can be read
// before anything is written that depends on it.
//
// Usage:
//   node scripts/bookletRecon.mjs --pdf "<file.pdf>"
//   node scripts/bookletRecon.mjs --pdf "<file.pdf>" --full   # whole page text

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ocrBooklet, pageText } from "./lib/bookletOcr.mjs";

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  if (!process.argv[i].startsWith("--")) continue;
  const k = process.argv[i].slice(2);
  const v = process.argv[i + 1];
  if (v && !v.startsWith("--")) { args[k] = v; i++; } else args[k] = true;
}

const CACHE = path.join("data", "pyq", ".booklet-ocr");
const { pages } = ocrBooklet(args.pdf, CACHE, {
  onProgress: (done, total) => process.stderr.write(`\r  ocr ${done}/${total}`),
});
process.stderr.write("\n");

for (const p of pages) {
  const text = pageText(p);
  if (args.full) {
    console.log(`\n───── page ${p.index} (${p.width}x${p.height}) ─────`);
    console.log(text);
  } else {
    // The head of the page carries the running header and any heading, which
    // is what year and section boundaries are read from.
    const head = [...p.words].sort((a, b) => a.y - b.y || a.x - b.x).slice(0, 18).map((w) => w.text).join(" ");
    console.log(`${String(p.index).padStart(3)} | ${head.slice(0, 150)}`);
  }
}
