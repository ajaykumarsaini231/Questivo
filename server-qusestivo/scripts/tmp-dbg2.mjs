// Raw OCR words on the option line of 2003 Q3.
import path from "node:path";
import { ocrBooklet, groupLines } from "./lib/bookletOcr.mjs";

const pdfPath = "C:/Users/LSE/Downloads/ch/gate-mt-1990-2014/GATE-2001-2004-papers-and-solutions.pdf";
const { pages } = ocrBooklet(pdfPath, path.join("data", "pyq", ".booklet-ocr"));
const page = pages.find((p) => p.index === 91);
for (const line of groupLines(page).sort((a, b) => a.y - b.y)) {
  if (line.y < 940 || line.y > 1050) continue;
  console.log(`line y=${line.y.toFixed(0)}`);
  for (const w of line.words) {
    console.log(`   ${JSON.stringify(w.text).padEnd(12)} x=${w.x.toFixed(0)} y=${w.y.toFixed(0)} w=${w.w.toFixed(0)} h=${w.h.toFixed(0)}`);
  }
}
