// Raw pixels around 2003 Q3's option line, no trimming.
import fs from "node:fs";
import * as mupdf from "mupdf";
import { PageImages } from "./lib/bookletCrop.mjs";

const OUT = "C:/Users/LSE/AppData/Local/Temp/claude/C--Users-LSE-Downloads-Questivo/9edb5016-dd0f-498b-bc7e-a4ad653163ea/scratchpad";
const images = new PageImages("C:/Users/LSE/Downloads/ch/gate-mt-1990-2014/GATE-2001-2004-papers-and-solutions.pdf");
const img = images.get(91);

function dump(name, x0, y0, x1, y1, zoom = 1) {
  const w = (x1 - x0) * zoom;
  const h = (y1 - y0) * zoom;
  const out = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, [0, 0, w, h], false);
  out.clear(255);
  const ds = out.getStride();
  const dp = out.getPixels();
  for (let y = 0; y < h; y++) {
    const sy = y0 + Math.floor(y / zoom);
    for (let x = 0; x < w; x++) {
      dp[y * ds + x] = img.px[sy * img.stride + (x0 + Math.floor(x / zoom)) * img.comps];
    }
  }
  fs.writeFileSync(`${OUT}/${name}`, out.asPNG());
}

// whole option line, generous margin
dump("raw_optline.png", 180, 920, 1010, 1000);
// option D only, 3x
dump("raw_optD.png", 820, 930, 1000, 995, 3);
