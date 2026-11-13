// Quantile fan for the NVIDIA CEO Polymarket. Last YES price is now.
// Node 22 runs this file with type stripping. Standard library only; no network.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const QUANTILES = [0.05, 0.25, 0.5, 0.75, 0.95];

const P = {
  k05: 4.452,
  k25: 0.673,
  k75: 0.3254,
  k95: 3.809,
  pIn: 0.6195,
  pOut: 0.4857,
  b: 0.7748,
  c: 0.008709,
  a0: 2.481,
  a15: 0.8426,
  a60: 1.174,
  a240: 0.0003355,
  a1440: 0.7074,
  r1: 0,
  tauR: 13.43,
  kmed: 0,
  kmed15: -0.08409,
};

interface Market {
  id: string;
  prices: number[];
}

interface TaskFile {
  horizon_minutes: number;
  quantiles: number[];
  markets: Market[];
}

interface Forecast {
  id: string;
  q: number[][];
}

function price6(v: number): number {
  return Math.round(v * 1e6) / 1e6 + 0;
}

function moveMean(prices: number[], window: number): number {
  const n = prices.length;
  if (n < 2) return 0;
  const start = Math.max(1, n - window);
  let total = 0;
  let count = 0;
  for (let t = start; t < n; t++) {
    total += Math.min(Math.abs(prices[t] - prices[t - 1]), 0.01);
    count += 1;
  }
  return count === 0 ? 0 : total / count;
}

function priceMean(prices: number[], window: number): number {
  const n = prices.length;
  const start = Math.max(0, n - window);
  let total = 0;
  let count = 0;
  for (let i = start; i < n; i++) {
    total += prices[i];
    count += 1;
  }
  return count === 0 ? 0 : total / count;
}

function forecast(prices: number[], horizon: number): number[][] {
  const n = prices.length;
  const x = prices[n - 1];
  const level =
    P.a0 * 1e-3 +
    P.a15 * moveMean(prices, 15) +
    P.a60 * moveMean(prices, 60) +
    P.a240 * moveMean(prices, 240) +
    P.a1440 * moveMean(prices, 1440);
  const s0 = Math.pow(x + P.c, P.b) * level;
  const drift =
    P.r1 * (priceMean(prices, 240) - x) +
    P.kmed * (x - prices[Math.max(0, n - 61)]) +
    P.kmed15 * (x - prices[Math.max(0, n - 16)]);
  const rows: number[][] = [];
  for (let h = 1; h <= horizon; h++) {
    const med = x + drift * (1 - Math.exp(-h / P.tauR));
    const hin = Math.pow(h, P.pIn);
    const hout = Math.pow(h, P.pOut);
    const q = [
      med - P.k05 * s0 * hout,
      med - P.k25 * s0 * hin,
      med,
      med + P.k75 * s0 * hin,
      med + P.k95 * s0 * hout,
    ];
    for (let j = 0; j < q.length; j++) {
      let v = q[j];
      if (v < 0) v = 0;
      if (v > 1) v = 1;
      if (j > 0 && v < q[j - 1]) v = q[j - 1];
      q[j] = price6(v);
    }
    rows.push(q);
  }
  return rows;
}

function quantilesMatch(got: number[]): boolean {
  if (!Array.isArray(got) || got.length !== QUANTILES.length) return false;
  for (let i = 0; i < QUANTILES.length; i++) {
    if (got[i] !== QUANTILES[i]) return false;
  }
  return true;
}

function main(): void {
  mkdirSync(outputDir, { recursive: true });
  const names = readdirSync(inputDir)
    .filter((name) => name.endsWith('.in'))
    .sort();
  for (const name of names) {
    const task = JSON.parse(readFileSync(join(inputDir, name), 'utf8')) as TaskFile;
    if (!quantilesMatch(task.quantiles)) {
      throw new Error(`${name} quantiles differ from 0.05, 0.25, 0.5, 0.75, 0.95`);
    }
    const forecasts: Forecast[] = [];
    for (const market of task.markets) {
      if (!Array.isArray(market.prices) || market.prices.length === 0) {
        throw new Error(`market ${market.id} has no prices`);
      }
      forecasts.push({
        id: market.id,
        q: forecast(market.prices, task.horizon_minutes),
      });
    }
    const id = name.slice(0, -3);
    writeFileSync(join(outputDir, `${id}.out`), `${JSON.stringify({ forecasts })}\n`);
  }
}

main();
