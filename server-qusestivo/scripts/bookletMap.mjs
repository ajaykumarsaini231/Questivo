#!/usr/bin/env node
// Print the paper/solution sections found in each booklet.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ocrBooklet } from "./lib/bookletOcr.mjs";
import { segmentBooklet } from "./lib/bookletStructure.mjs";

const DIR = process.argv[2] || "C:/Users/LSE/Downloads/ch/gate-mt-1990-2014";
const CACHE = path.join("data", "pyq", ".booklet-ocr");

for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".pdf")).sort()) {
  const { pages } = ocrBooklet(path.join(DIR, f), CACHE);
  const sections = segmentBooklet(pages);
  console.log(`\n${f}  (${pages.length} pages)`);
  if (!sections.length) console.log("  — no paper heading found —");
  for (const s of sections) {
    const sol = s.solutionFrom === null ? "none" : `${s.solutionFrom}-${s.solutionTo}`;
    console.log(
      `  ${s.year}: paper pages ${String(s.paperFrom).padStart(3)}-${String(s.paperTo).padEnd(3)}` +
        `  solutions ${sol}`
    );
  }
}
