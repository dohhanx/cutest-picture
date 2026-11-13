// v2 quantile fan for the NVIDIA CEO Polymarket. Last YES price is now.
// Node 22 runs this file with type stripping. Standard library only; no network.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const QUANTILES = [0.05, 0.25, 0.5, 0.75, 0.95];

const P = {
  k05: 5.5342,
  k25: 0.63296,
  k75: 0.4758,
  k95: 5.8558,
  pIn: 0.55553,
  pOut: 0.35763,
  b: 0.47292,
  c: 0.0016888,
  a0: 1.9692,
  a15: 0.00033546,
  a60: 2.1689,
  a1440: 1.3924,
  tauR: 122.07,
  sb: [0, -0.31343, -0.57049, -0.21977],
  d: [-0.028589, -0.024048, -0.074488, -0.072132],
  rbs: -0.0009471,
  r1440: 0.018601,
  r240: 0.038837,
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

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
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

function bucket(x: number): number {
  if (x < 0.01) return 0;
  if (x < 0.05) return 1;
  if (x < 0.2) return 2;
  return 3;
}

function forecast(market: Market, horizon: number, boardSum: number): number[][] {
  const prices = market.prices;
  if (!Array.isArray(prices) || prices.length === 0) {
    throw new Error(`market ${market.id} has no prices`);
  }
  const x = prices[prices.length - 1];
  const b = bucket(x);
  const level =
    P.a0 * 1e-3 +
    P.a15 * moveMean(prices, 15) +
    P.a60 * moveMean(prices, 60) +
    P.a1440 * moveMean(prices, 1440);
  const scale = Math.exp(P.sb[b]) * Math.pow(x + P.c, P.b) * level;
  const pull =
    P.rbs * x * (1 / boardSum - 1) +
    P.r1440 * (priceMean(prices, 1440) - x) +
    P.r240 * (priceMean(prices, 240) - x);
  const drift = P.d[b] * x + pull;
  const rows: number[][] = [];
  for (let h = 1; h <= horizon; h++) {
    const g = 1 - Math.exp(-h / P.tauR);
    const med = x + drift * g;
    const hin = Math.pow(h, P.pIn);
    const hout = Math.pow(h, P.pOut);
    const q = [
      med - P.k05 * scale * hout,
      med - P.k25 * scale * hin,
      med,
      med + P.k75 * scale * hin,
      med + P.k95 * scale * hout,
    ].map(clamp01);
    for (let j = 1; j < q.length; j++) {
      if (q[j] < q[j - 1]) q[j] = q[j - 1];
    }
    for (let j = 0; j < q.length; j++) q[j] = price6(q[j]);
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

function boardSumOf(markets: Market[]): number {
  let sum = 0;
  for (const market of markets) {
    if (!Array.isArray(market.prices) || market.prices.length === 0) continue;
    sum += market.prices[market.prices.length - 1];
  }
  if (!(sum > 0.3)) return 1;
  return sum;
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
    const boardSum = boardSumOf(task.markets);
    const forecasts: Forecast[] = [];
    for (const market of task.markets) {
      forecasts.push({
        id: market.id,
        q: forecast(market, task.horizon_minutes, boardSum),
      });
    }
    const id = name.slice(0, -3);
    writeFileSync(join(outputDir, `${id}.out`), `${JSON.stringify({ forecasts })}\n`);
  }
}

main();
