import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const lines = [
  "Learner",
  "",
  "The car can drive itself. It has for years.",
  "My daughter, sixteen, asked me anyway",
  "to teach her, in the lot behind the church,",
  "the way my father taught me: badly, loud.",
  "",
  "It braked before her foot could find the brake.",
  "It held the lane she meant to drift across.",
  "She said, It's like I'm riding",
  "inside my own decision.",
  "",
  "So I found the setting, four screens deep,",
  "the one that says the risk is yours,",
  "and pressed it, and the wheel went heavy",
  "in her hands, the way a living thing is heavy.",
  "",
  "She stalled. She clipped a cone. She laughed.",
  "She took the corner wide and wrong and hers.",
  "Then, parked crooked across two spaces,",
  "she let go of the wheel and looked at her hands",
  "as if someone had just given them back.",
];

const poem = lines.join("\n") + "\n";
const codePoints = Array.from(poem).length;
if (codePoints > 1000) {
  throw new Error(`poem is ${codePoints} Unicode code points, over 1000`);
}
console.log(codePoints);

const outputDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, "entry.txt"), poem, "utf8");
