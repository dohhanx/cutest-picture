import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const lines = [
  'Last Flight',
  '',
  'Thirty-one years, and the airplane',
  'has landed itself for most of them.',
  'It is better at it than I am.',
  'It does not want anything from the runway.',
  '',
  'Tonight, my last, the tower clears us',
  'and I reach up and press the switch',
  'that tells it: mine.',
  'The yoke goes live, a little heavy,',
  'the way a sleeping child is heavy',
  'when you lift her from the car.',
  '',
  'My first officer says nothing.',
  'She has never seen it done',
  'outside a simulator.',
  '',
  'I fly it the way my instructor did,',
  'small corrections, talking to the wind.',
  'We touch down long and slightly left.',
  'Nobody in the back will ever know.',
  '',
  'At the gate she asks me why.',
  'I tell her: so that once more',
  'the landing was something I did,',
  'not something that happened to me.',
];

function unicodeCodePoints(text: string): number {
  let count = 0;
  for (let index = 0; index < text.length; ) {
    const point = text.codePointAt(index);
    if (point === undefined) break;
    count += 1;
    index += point > 0xffff ? 2 : 1;
  }
  return count;
}

const poem = `${lines.join('\n')}\n`;
const codePoints = unicodeCodePoints(poem);
const limit = 1000;

if (codePoints > limit) {
  throw new Error(`poem is ${codePoints} Unicode code points, over ${limit}`);
}

const outputDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'entry.txt'), poem, 'utf8');
console.log(codePoints);
