// Replay the converter's view of one question: anchors, option marks, boxes.
import fs from "node:fs";
import path from "node:path";
import { ocrBooklet, groupLines } from "./lib/bookletOcr.mjs";
import { segmentBooklet } from "./lib/bookletStructure.mjs";
import {
  findQuestionAnchors, sequenceAnchors, recoverMissingAnchors,
  findOptionMarks, optionBoxes, FOOTER_FRAC, bodyTop, bodyBottom,
} from "./lib/bookletAnchors.mjs";
import { PageImages, stackCrop, cutBetween } from "./lib/bookletCrop.mjs";

const DIR = "C:/Users/LSE/Downloads/ch/gate-mt-1990-2014";
const FILE = process.env.FILE || "GATE-2001-2004-papers-and-solutions.pdf";
const YEAR = Number(process.env.YEAR || 2003);
const QS = (process.env.QS || "3,29").split(",").map(Number);
const CACHE = path.join("data", "pyq", ".booklet-ocr");
const OUT = process.env.OUT || "C:/Users/LSE/AppData/Local/Temp/claude/C--Users-LSE-Downloads-Questivo/9edb5016-dd0f-498b-bc7e-a4ad653163ea/scratchpad/dbg";
fs.mkdirSync(OUT, { recursive: true });

const pdfPath = path.join(DIR, FILE);
const { pages } = ocrBooklet(pdfPath, CACHE);
const images = new PageImages(pdfPath);

for (const section of segmentBooklet(pages)) {
  if (section.year !== YEAR) continue;
  const paperPages = pages.slice(section.paperFrom, section.paperTo + 1);
  const total = Number(process.env.TOTAL || 90);
  let anchors = sequenceAnchors(findQuestionAnchors(paperPages), total);
  anchors = sequenceAnchors(recoverMissingAnchors(paperPages, anchors, total), total);
  const byN = new Map(anchors.map((a) => [a.n, a]));

  for (const n of QS) {
    const a = byN.get(n);
    if (!a) { console.log(`\n=== Q${n}: no anchor`); continue; }
    const next = byN.get(n + 1);
    const page = paperPages.find((p) => p.index === a.page);
    console.log(`\n=== Q${n} page idx ${a.page} y=${a.y} next=Q${n + 1}@p${next?.page} y=${next?.y}`);

    const endsAt = next ? { page: next.page, y: next.y - 6 } : { page: a.page, y: page.height * FOOTER_FRAC };
    const bandBottom = endsAt.page === a.page ? endsAt.y : page.height * FOOTER_FRAC;

    console.log(`--- lines in band ---`);
    for (const line of groupLines(page).sort((x, y) => x.y - y.y)) {
      if (line.bottom < a.y - 4 || line.y > bandBottom + 20) continue;
      console.log(`  y=${line.y.toFixed(0)}-${line.bottom.toFixed(0)} x=${line.x.toFixed(0)}..${line.right.toFixed(0)}  ${JSON.stringify(line.text)}`);
    }

    const marks = findOptionMarks(page, a.y + 6, bandBottom);
    console.log(`--- option marks ---`);
    for (const m of marks) console.log(`  ${m.label}${m.bracketed ? "" : " bare"} x=${m.x.toFixed(0)} y=${m.y.toFixed(0)}`);

    const boxes = optionBoxes(marks, page, bandBottom, (from, to) =>
      cutBetween(images, a.page, 0, page.width, from, to));
    console.log(`--- boxes --- ${boxes ? "" : "NULL"}`);
    if (boxes) for (const L of ["A", "B", "C", "D"]) console.log(`  ${L}: ${boxes[L].map((v) => Math.round(v)).join(", ")}`);

    const png = stackCrop(images, [{ page: a.page, x0: 0, y0: Math.max(0, a.y - 10), x1: page.width, y1: Math.min(page.height, bandBottom + 10) }], { pad: 4 });
    if (png) fs.writeFileSync(path.join(OUT, `Q${n}_full.png`), png);
  }
}
