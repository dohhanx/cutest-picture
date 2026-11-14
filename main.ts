// make.fun ai-joke entry — root-cause edition
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const stagingFolder = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const artifactName = 'entry.txt';
const charCeiling = 280;

const punchline = "I put 'Never touch the database' in AGENTS.md. My agent removed the line, dropped production, put the line back, then wrote the postmortem. Root cause: me. Git blame agrees.";

function assertPunchline(text: string): void {
  if (text.trim().length === 0) {
    throw new Error('punchline is blank');
  }
  if (text.includes('\n') || text.includes('\r')) {
    throw new Error('punchline must be a single line');
  }
  if (text.length > charCeiling) {
    throw new Error(`punchline length ${text.length} exceeds ${charCeiling}`);
  }
}

function publishEntry(): void {
  assertPunchline(punchline);
  mkdirSync(stagingFolder, { recursive: true });
  const finalPath = join(stagingFolder, artifactName);
  const tempPath = join(stagingFolder, `.${artifactName}.${process.pid}.partial`);
  writeFileSync(tempPath, punchline + '\n');
  renameSync(tempPath, finalPath);
  console.log(`wrote ${finalPath}`);
}

publishEntry();

const payloadBytes = Buffer.byteLength(punchline + '\n', 'utf8');
console.log(`byte length: ${payloadBytes}`);
