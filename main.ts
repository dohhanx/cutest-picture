// Northline token radar. Node 22, standard library only.
//
// Reads the sealed snapshot, scores pre-token protocols in lib/model.ts, and writes
// /output/board.json, /output/data.js, a copy of dashboard/ and screenshots/, then
// /output/dossier.json from vendor/makefun-board.ts.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((item) => item.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  copied.sort();
  return copied;
}

function millions(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const body = abs >= 1e9 ? `${(abs / 1e9).toFixed(2)}B` : `${(abs / 1e6).toFixed(1)}M`;
  return `${sign}$${body}`;
}

const inputArg = arg('input', process.env.MAKEFUN_INPUT_DIR ?? '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`northline: no snapshot at ${inputFile}\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`northline: board refused: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));
copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));

const lines = [
  `northline: ${radar.tracked} tracked, ${radar.pre_token} record no token, ${radar.board_size} on the board (${radar.floor_size} floor, ${radar.early_size} early, ${radar.scout_size} scout, ${radar.kin_size} kin), ${radar.tokened_size} tokened, ${radar.aside_size} set aside`,
  `northline: curve n=${radar.fit.n} a=${radar.fit.a} b=${radar.fit.b} R2=${radar.fit.r2} rmse=${radar.fit.rmse} loo=${radar.fit.loo_median_ape} holdout=${radar.fit.holdout_n}/${radar.fit.holdout_median_ape} sum=${millions(radar.implied_sum)} median×${radar.median_multiple}`,
];
for (const row of board.slice(0, 15)) {
  lines.push(
    `  #${String(row.rank).padStart(3, ' ')} ${millions(row.implied_value_usd).padStart(10)}  ${row.stage.padEnd(5)}  ${row.grade}  ${row.verdict.padEnd(5)}  $${String(row.drop_per_1k).padStart(7)}  ${(row.category ?? '-').padEnd(26)}  ${row.name}`,
  );
}
process.stdout.write(`${lines.join('\n')}\n`);

if (shots.length < 3) {
  process.stderr.write(`northline: screenshots/ has ${shots.length} files; need the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`northline: bad screenshot name ${name}\n`);
    process.exit(1);
  }
}

const dashFiles = readdirSync(join(out, 'dashboard')).filter((name) => !name.startsWith('.'));
const dashBytes = dashFiles.reduce((sum, name) => sum + statSync(join(out, 'dashboard', name)).size, 0);
if (dashBytes > TEXT_MAX_BYTES) {
  process.stderr.write(`northline: dashboard source is ${dashBytes} bytes, over ${TEXT_MAX_BYTES}, so the dossier text will cut it\n`);
}
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }),
);
process.stdout.write(
  `northline: wrote board.json, data.js, dashboard/ (${dashBytes} bytes), screenshots/ (${shots.length}) and dossier.json (${statSync(join(out, 'dossier.json')).size} bytes)\n`,
);
