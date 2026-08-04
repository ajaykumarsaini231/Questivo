#!/usr/bin/env node
// Delete crops in a figures folder that no converted row refers to.
//
// The converters overwrite the crops they still produce and leave behind the
// ones they no longer do. That happens on every improvement: when partial
// option crops stopped being written, when a question started being stitched
// across a page break as one image instead of five. The leftovers are invisible
// — nothing links them — but they are committed, pushed and served, and the
// 2022 folder was carrying hundreds of images of a layout the code had stopped
// producing.
//
// Worse than the disk cost: a stale file makes a rerun look successful. The
// existence check in linkPyqFigures.mjs passes against a crop from two runs ago
// as readily as against a fresh one.
//
// Usage:
//   node scripts/pruneFigures.mjs --file data/pyq/jee-main-2022.json --dir ../pyq-figures/2022 --dry-run
//   node scripts/pruneFigures.mjs --file data/pyq/jee-main-2022.json --dir ../pyq-figures/2022

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

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
const DRY = Boolean(args["dry-run"]);

const files = String(args.file).split(",");
const referenced = new Set();
for (const f of files) {
  for (const row of JSON.parse(fs.readFileSync(f.trim(), "utf8"))) {
    for (const k of [
      "questionImage", "optionAImage", "optionBImage", "optionCImage", "optionDImage", "solutionImage",
    ]) {
      const v = row[k];
      // Rows already linked carry a full URL; take the last path segment so the
      // script works before or after linkPyqFigures has run.
      if (v) referenced.add(String(v).split(/[\\/]/).pop());
    }
  }
}

const onDisk = fs.readdirSync(args.dir).filter((f) => f.toLowerCase().endsWith(".png"));
const orphans = onDisk.filter((f) => !referenced.has(f));

console.log(`${onDisk.length} file(s) on disk, ${referenced.size} referenced by ${files.length} json file(s)`);
console.log(`${orphans.length} orphan(s)`);
for (const f of orphans.slice(0, 10)) console.log(`  ${f}`);
if (orphans.length > 10) console.log(`  ...and ${orphans.length - 10} more`);

// Referenced but absent is the dangerous direction — a row pointing at a file
// that is not there renders a broken image — so it is reported even though
// this script does not fix it.
const missing = [...referenced].filter((f) => !onDisk.includes(f));
if (missing.length) {
  console.log(`\n⚠ ${missing.length} file(s) are referenced but NOT on disk — rerun the converter:`);
  for (const f of missing.slice(0, 5)) console.log(`  ${f}`);
}

if (DRY) {
  console.log("\n(dry run — nothing deleted)");
  process.exit(0);
}
for (const f of orphans) fs.unlinkSync(path.join(args.dir, f));
console.log(`\n✔ deleted ${orphans.length} orphan(s) from ${args.dir}`);
