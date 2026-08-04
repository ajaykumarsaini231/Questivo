#!/usr/bin/env node
// Point every needsFigure row at the image cut out of its source page.
//
// WHY A URL AND NOT A DATA URI
//
// The schema documents diagramImage as a data URI because that is what the
// Drive lookup produces at runtime. The renderer, though, only ever does
// <img src={diagramImage}> — PyqPaperRunner.tsx:326 — so a path works exactly
// the same and costs a great deal less: 737 figures inlined as base64 is ~38 MB
// of database text, and ~1.6 MB added to every paper the player loads. Served
// as files they are cached by the browser and the row stays a few dozen bytes.
//
// The files live in the frontend's public/ folder, which Vite serves in dev and
// Vercel serves as static assets in production, so no route is needed.
//
// Usage:
//   node --env-file=.env scripts/linkPyqFigures.mjs --file data/pyq/jee-main-2023.json
//   node --env-file=.env scripts/linkPyqFigures.mjs --file <path> --dry-run

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import prisma from "../src/prismaClient.js";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.file || args.file === true) {
  console.log(`
Link cut-out figures to their questions.

  --file <path>     the converter's *.json (rows carry figureFile)
  --base <url>      URL prefix for the images (default /pyq-figures/2023)
  --assets <path>   where the PNGs actually are, for the existence check
  --dry-run         report only
`);
  process.exit(args.help ? 0 : 1);
}

const BASE = args.base && args.base !== true ? String(args.base).replace(/\/$/, "") : "/pyq-figures/2023";

// Git Bash rewrites a leading "/" argument into a Windows path before Node sees
// it, so `--base /pyq-figures/2022` arrives as
// "C:/Program Files/Git/pyq-figures/2022". That silently wrote 1081 rows
// pointing at a path no browser can resolve, and the run reported success. The
// base is a URL path and can only start with "/", so anything else is that bug.
if (!BASE.startsWith("/")) {
  console.error(
    `✖ --base must be a URL path beginning with "/", got "${BASE}".\n` +
      `  On Git Bash the shell rewrites such arguments — prefix the command with\n` +
      `  MSYS_NO_PATHCONV=1, or run it from PowerShell.`
  );
  process.exit(1);
}
const ASSETS = args.assets && args.assets !== true
  ? args.assets
  : path.resolve("../questivo/public/pyq-figures/2023");
const DRY = Boolean(args["dry-run"]);

const rows = JSON.parse(fs.readFileSync(args.file, "utf8"));

/**
 * Which stored column each cropped part belongs in.
 *
 * One image per part, not one per question: a single picture of stem plus
 * options cannot be laid out beside radio buttons, and shows four choices under
 * a numerical question that has none.
 */
const PARTS = [
  ["questionImage", "questionImage"],
  ["optionAImage", "optionAImage"],
  ["optionBImage", "optionBImage"],
  ["optionCImage", "optionCImage"],
  ["optionDImage", "optionDImage"],
  ["solutionImage", "solutionImage"],
];

const present = new Set(fs.existsSync(ASSETS) ? fs.readdirSync(ASSETS) : []);
const wanted = rows.filter((r) => r.questionHash && PARTS.some(([f]) => r[f]));

let filesLinked = 0;
let filesMissing = 0;
const patches = [];

for (const r of wanted) {
  const data = {};
  for (const [field, column] of PARTS) {
    const file = r[field];
    if (!file) continue;
    // Never point a row at a file that is not on disk — that is a 404 in the
    // player, which reads as the question failing to load.
    if (!present.has(file)) { filesMissing++; continue; }
    data[column] = `${BASE}/${file}`;
    filesLinked++;
  }
  if (!Object.keys(data).length) continue;
  // The stem doubles as the legacy whole-question figure the renderer already
  // knows about, so old code paths keep working.
  if (data.questionImage) {
    data.diagramImage = data.questionImage;
    data.diagramSource = "pdf-crop";
  }
  patches.push({ examCode: r.examCode, questionHash: r.questionHash, data });
}

console.log(`${rows.length} rows | ${wanted.length} carry at least one crop | assets on disk: ${present.size}`);
console.log(`${filesLinked} file(s) matched, ${filesMissing} named but absent (skipped, so no row points at a 404)`);

let updated = 0;
let notFound = 0;

for (const patch of patches) {
  if (DRY) { updated++; continue; }
  // examCode + questionHash is the upsert key the import uses, so it addresses
  // exactly the row that was written.
  const res = await prisma.previousYearQuestion.updateMany({
    where: { examCode: patch.examCode, questionHash: patch.questionHash },
    data: patch.data,
  });
  if (res.count) updated += res.count;
  else notFound++;
}

console.log(
  `\n${DRY ? "[dry run] " : ""}${updated} row(s) linked to ${BASE}/…` +
    (notFound ? `\n${notFound} row(s) had no match in the database — import the JSON first.` : "")
);

if (!DRY && rows.length) {
  // Report on the year actually being linked, not a hard-coded one.
  const examCode = rows[0].examCode;
  const year = rows[0].year;
  const of = (where) => prisma.previousYearQuestion.count({ where: { examCode, year, ...where } });
  console.log(
    `\n${examCode} ${year}: ${await of({ NOT: { questionImage: null } })} with a question image, ` +
      `${await of({ NOT: { optionAImage: null } })} with option images, ` +
      `${await of({ NOT: { solutionImage: null } })} with a solution image ` +
      `(of ${await of({})} rows)`
  );
}

await prisma.$disconnect();
