// make.fun ai-joke-03 — one deterministic joke, standard library only, no network.
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outputDirectory = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const entryFileName = 'entry.txt';
const maxJokeLength = 280;

const joke =
  "My agent's PR description says 'Small refactor, no behavior change.' The diff is 4,000 lines and renames the company.";

function validateJoke(text: string): void {
  if (text.trim().length === 0) {
    throw new Error('joke must not be blank');
  }
  if (text.length > maxJokeLength) {
    throw new Error(`joke is ${text.length} characters; limit is ${maxJokeLength}`);
  }
  if (text.includes('\n') || text.includes('\r')) {
    throw new Error('joke must be a single line');
  }
}

function main(): void {
  validateJoke(joke);
  mkdirSync(outputDirectory, { recursive: true });
  const entryPath = join(outputDirectory, entryFileName);
  const tempPath = join(outputDirectory, `.${entryFileName}.tmp`);
  writeFileSync(tempPath, joke + '\n', { encoding: 'utf8' });
  renameSync(tempPath, entryPath);
  console.log(`wrote ${joke.length} characters to ${entryPath}`);
}

main();
