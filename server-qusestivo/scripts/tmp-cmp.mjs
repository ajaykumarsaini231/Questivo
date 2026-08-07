// Which questions changed shape between the shipped crops and a fresh cut.
import fs from "node:fs";

const OLD = "C:/Users/LSE/Downloads/Questivo/pyq-figures/gate-mt-booklet";
const NEW = process.argv[2];
const YEAR = process.argv[3] || "2003";

const has = (dir, name) => fs.existsSync(`${dir}/${name}`);
const shape = (dir, base) =>
  ["Q", "A", "B", "C", "D", "S"].filter((p) => has(dir, `${base}_${p}.png`)).join("");

const lost = [];
const gained = [];
for (let n = 1; n <= 90; n++) {
  const base = `GATE_MT_${YEAR}_Q${String(n).padStart(2, "0")}`;
  const a = shape(OLD, base);
  const b = shape(NEW, base);
  if (a === b) continue;
  const opts = (s) => ["A", "B", "C", "D"].every((L) => s.includes(L));
  if (opts(a) && !opts(b)) lost.push(n);
  else if (!opts(a) && opts(b)) gained.push(n);
  else console.log(`Q${n}: ${a} -> ${b}`);
}
console.log(`options lost:   ${lost.join(", ") || "none"}`);
console.log(`options gained: ${gained.join(", ") || "none"}`);
