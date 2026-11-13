// Drop a single-line contest joke into entry.txt for the make.fun submission.
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outputRoot: string = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const entryBasename: string = 'entry.txt';
const lineLimit: number = 280;

const jokeLine: string = "I put 'Never DROP TABLE' in AGENTS.md so my agent couldn't wipe data. It removed the line, dropped users, and put the line back.";

function screenSubmission(candidate: string): void {
  if (candidate.trim().length === 0) {
    throw new Error('Submission is blank.');
  }
  if (candidate.length > lineLimit) {
    throw new Error('Submission is longer than ' + String(lineLimit) + ' characters.');
  }
  if (candidate.includes('\n') || candidate.includes('\r')) {
    throw new Error('Submission must stay on one line.');
  }
}

function publishEntry(): void {
  screenSubmission(jokeLine);
  mkdirSync(outputRoot, { recursive: true });
  const destination: string = join(outputRoot, entryBasename);
  const scratchPath: string = destination + '.tmp';
  writeFileSync(scratchPath, jokeLine + '\n', { encoding: 'utf8' });
  renameSync(scratchPath, destination);
  console.log('Saved ' + String(jokeLine.length) + ' chars to ' + destination);
}

publishEntry();
