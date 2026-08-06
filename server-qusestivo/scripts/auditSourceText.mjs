#!/usr/bin/env node
// Which source PDFs can be read as TEXT, and which need a vision model.
//
// The whole extraction pipeline assumes a PDF has a text layer it can segment:
// question, answer line, worked solution. Where that assumption holds, text is
// free, exact, selectable and cheap. Where it does not, no amount of tuning the
// parser helps — the page is a picture and only OCR or a vision model can read
// it, and pretending otherwise produces empty stems and missing keys.
//
// Nobody had ever measured which files are which. This does, for every source
// file in one pass, so the decision "parse it / send it to a model" is made
// from evidence per file rather than discovered per bug.
//
// It reads only. Nothing is converted, written or uploaded.
//
// Usage:
//   node scripts/auditSourceText.mjs --dir "C:/Users/LSE/Downloads/ch" [--json out.json]

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as mupdf from "mupdf";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    const n = argv[i + 1];
    if (!n || n.startsWith("--")) out[k] = true;
    else { out[k] = n; i++; }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.dir || args.dir === true) {
  console.log(`
Report which source PDFs have a usable text layer.

  --dir <path>    folder to walk, recursively
  --json <path>   also write the full per-file table as JSON
`);
  process.exit(args.help ? 0 : 1);
}

/** A question number at the head of a line, in any of the three house styles. */
const ANCHOR = /^(?:Q\s*\.?\s*)?(\d{1,3})\s*\.(?!\d)/;
/** The printed key, in any of the wordings these publishers use. */
const ANSWER = /(?:^|[^A-Za-z])(?:Official\s*Ans|Allen\s*Ans|Ans)\.?\s*\(?\s*[^)\n]{1,24}?\s*(?:\)|$)/i;
/** Options, letters or digits. */
const OPTION = /(?:^|\s)\(\s*[1-4A-D]\s*\)/;

/**
 * Under this many characters per page and the page is a picture.
 *
 * A typeset exam page carries well over a thousand characters. A scan carries
 * whatever the producer left behind — a header, a page number, sometimes
 * nothing at all. There is a wide empty gap between the two in this archive,
 * so the exact threshold does not matter much; 250 sits in the middle of it.
 */
const CHARS_PER_PAGE_FLOOR = 250;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.pdf$/i.test(entry.name)) out.push(full);
  }
  return out;
}

/** Which exam this file belongs to, from its name or its folder. */
function family(file) {
  const base = path.basename(file);
  if (/^JEEMain_/i.test(base)) return "JEE Main";
  if (/^JEEAdv_/i.test(base)) return "JEE Advanced";
  if (/^NEET_/i.test(base)) return "NEET";
  if (/GATE/i.test(file)) return "GATE";
  return "other";
}

function yearOf(file) {
  const m = path.basename(file).match(/(?:^|_)(19|20)(\d{2})(?:_|$|\D)/);
  return m ? Number(m[1] + m[2]) : null;
}

function inspect(file) {
  const doc = mupdf.Document.openDocument(fs.readFileSync(file), "application/pdf");
  const pages = doc.countPages();
  let chars = 0, anchors = 0, answers = 0, options = 0;

  try {
    for (let p = 0; p < pages; p++) {
      let page, st;
      try {
        page = doc.loadPage(p);
        st = JSON.parse(page.toStructuredText().asJSON());
      } catch { continue; }
      finally {
        // Freed per page, not left to the finaliser. mupdf allocates on a WASM
        // heap that does not grow back, and an archive this size exhausts it
        // long before the walk ends: the first run read 720 GATE files and then
        // reported every JEE and NEET file as unreadable, which is an artefact
        // of this loop rather than anything about those PDFs.
        try { page?.destroy?.(); } catch { /* already gone */ }
      }
      for (const block of st.blocks || []) {
        for (const line of block.lines || []) {
          const t = (line.text ?? "").trim();
          if (!t) continue;
          chars += t.length;
          if (ANCHOR.test(t)) anchors++;
          if (ANSWER.test(t)) answers++;
          if (OPTION.test(t)) options++;
        }
      }
    }
  } finally {
    try { doc.destroy?.(); } catch { /* already gone */ }
  }

  const perPage = pages ? Math.round(chars / pages) : 0;
  // Three verdicts, and the middle one is the one worth knowing about.
  //   text    — parse it; the pipeline can do this today
  //   thin    — has a text layer but too little structure to segment safely;
  //             usually the maths is drawn and only the prose survives
  //   image   — no text layer worth the name; needs OCR or a vision model
  let verdict;
  if (perPage < CHARS_PER_PAGE_FLOOR) verdict = "image";
  else if (anchors < 5 || answers < 3) verdict = "thin";
  else verdict = "text";

  return { pages, chars, perPage, anchors, answers, options, verdict };
}

const files = walk(String(args.dir)).sort();
console.log(`${files.length} PDF(s) under ${args.dir}\n`);

const rows = [];
for (const f of files) {
  let r;
  try { r = inspect(f); }
  catch (e) { r = { pages: 0, chars: 0, perPage: 0, anchors: 0, answers: 0, options: 0, verdict: "unreadable", error: e.message }; }
  rows.push({ file: path.relative(String(args.dir), f), family: family(f), year: yearOf(f), ...r });
}

/* ------------------------------- report -------------------------------- */

const groups = new Map();
for (const r of rows) {
  const key = `${r.family}|${r.year ?? "?"}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}

console.log("exam / year          files   text   thin  image  unreadable   median chars/page");
console.log("─".repeat(84));
for (const key of [...groups.keys()].sort()) {
  const g = groups.get(key);
  const n = (v) => g.filter((r) => r.verdict === v).length;
  const med = g.map((r) => r.perPage).sort((a, b) => a - b)[g.length >> 1];
  const [fam, yr] = key.split("|");
  console.log(
    `${(fam + " " + yr).padEnd(20)} ${String(g.length).padStart(5)}  ${String(n("text")).padStart(5)}  ${String(n("thin")).padStart(5)}  ${String(n("image")).padStart(5)}  ${String(n("unreadable")).padStart(10)}   ${String(med).padStart(10)}`
  );
}

const needsModel = rows.filter((r) => r.verdict === "image" || r.verdict === "unreadable");
const thin = rows.filter((r) => r.verdict === "thin");

console.log("\n" + "═".repeat(84));
console.log(`${rows.filter((r) => r.verdict === "text").length} file(s) parse as text — the pipeline handles these.`);
console.log(`${thin.length} file(s) are THIN — a text layer exists but the structure is incomplete.`);
console.log(`${needsModel.length} file(s) have no usable text — these need OCR or a vision model.`);

if (needsModel.length) {
  console.log("\nNo usable text (send these to a model):");
  for (const r of needsModel.slice(0, 40)) console.log(`  ${String(r.perPage).padStart(5)} c/pg  ${r.file}`);
  if (needsModel.length > 40) console.log(`  …and ${needsModel.length - 40} more`);
}

if (thin.length) {
  console.log("\nThin (text present, structure incomplete — check before trusting):");
  for (const r of thin.slice(0, 25)) {
    console.log(`  ${String(r.perPage).padStart(5)} c/pg  anchors ${String(r.anchors).padStart(3)}  answers ${String(r.answers).padStart(3)}  ${r.file}`);
  }
  if (thin.length > 25) console.log(`  …and ${thin.length - 25} more`);
}

if (args.json && args.json !== true) {
  fs.writeFileSync(String(args.json), JSON.stringify(rows, null, 2));
  console.log(`\nfull table → ${args.json}`);
}
