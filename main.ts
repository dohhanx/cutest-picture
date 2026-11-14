import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const lines: string[] = [
  "First Crack",
  "",
  "I took my hand off the drop lever",
  "and let the first batch run.",
  "The digits reached four hundred ten.",
  "The gate opened.",
  "Beans slid out in one sheet,",
  "every one of them quiet,",
  "no click left in the pile.",
  "",
  "The diner on the ticket wants them bright,",
  "almost sour, loud in the cup.",
  "First crack had started and stuttered.",
  "I heard it from the sink",
  "and did not cross the floor.",
  "",
  "I wiped my palm on my apron,",
  "put my hand back on the lever,",
  "and pulled the next batch",
  "at four hundred six.",
  "A handful dropped still clicking.",
  "",
  "A split bean on the tray",
  "rocked, pale seam up,",
  "when the next click struck it.",
];

const poem = lines.join("\n");

const count = Array.from(poem).length;
if (count < 1 || count > 1000) {
  throw new Error(`poem length ${count} is outside 1-1000`);
}
if (poem.trim().length === 0) {
  throw new Error("poem is all whitespace");
}

const dir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "entry.txt"), poem, "utf8");
console.log(count);
