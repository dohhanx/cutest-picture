// Realised-volatility quantile fan for Polymarket FAA outage attribution.
// Node 22 runs this file with type stripping. Standard library only. No network.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const expectedQuantiles = [0.05, 0.25, 0.5, 0.75, 0.95];

// Fitted constants. `b` is the price-level elasticity used in the scale, not a bucket id.
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

type MarketInput = {
  id: string | number;
  prices: number[];
};

type CaseInput = {
  horizonMinutes: number;
  markets: MarketInput[];
};

type Forecast = {
  id: string | number;
  q: number[][];
};

const moveCap = 0.01;

function price6(value: number): number {
  const rounded = Number(value.toFixed(6));
  return rounded === 0 ? 0 : rounded;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function moveMean(prices: number[], k: number): number {
  const count = prices.length;
  if (count < 2) return 0;
  const take = Math.min(k, count - 1);
  let sum = 0;
  for (let i = count - take; i < count; i++) {
    sum += Math.min(Math.abs(prices[i] - prices[i - 1]), moveCap);
  }
  return sum / take;
}

function priceMean(prices: number[], k: number): number {
  const count = prices.length;
  const take = Math.min(k, count);
  let sum = 0;
  for (let i = count - take; i < count; i++) sum += prices[i];
  return sum / take;
}

function bucket(x: number): number {
  if (x < 0.01) return 0;
  if (x < 0.05) return 1;
  if (x < 0.2) return 2;
  return 3;
}

function boardSumOf(markets: MarketInput[]): number {
  let sum = 0;
  for (const market of markets) {
    sum += market.prices[market.prices.length - 1];
  }
  if (!(sum > 0.3)) return 1;
  return sum;
}

function forecastMarket(prices: number[], horizon: number, boardSum: number): number[][] {
  const x = prices[prices.length - 1];
  const priceBucket = bucket(x);
  const level =
    P.a0 * 1e-3 +
    P.a15 * moveMean(prices, 15) +
    P.a60 * moveMean(prices, 60) +
    P.a1440 * moveMean(prices, 1440);
  const scale = Math.exp(P.sb[priceBucket]) * (x + P.c) ** P.b * level;
  const pull =
    P.rbs * x * (1 / boardSum - 1) +
    P.r1440 * (priceMean(prices, 1440) - x) +
    P.r240 * (priceMean(prices, 240) - x);
  const drift = P.d[priceBucket] * x + pull;
  const rows: number[][] = [];

  for (let h = 1; h <= horizon; h++) {
    const g = 1 - Math.exp(-h / P.tauR);
    const med = x + drift * g;
    const hin = h ** P.pIn;
    const hout = h ** P.pOut;
    const raw = [
      med - P.k05 * scale * hout,
      med - P.k25 * scale * hin,
      med,
      med + P.k75 * scale * hin,
      med + P.k95 * scale * hout,
    ];
    const ordered = raw.map(clamp01);
    for (let i = 1; i < ordered.length; i++) {
      if (ordered[i] < ordered[i - 1]) ordered[i] = ordered[i - 1];
    }
    rows.push(ordered.map(price6));
  }

  return rows;
}

function fail(source: string, message: string): never {
  throw new Error(`${source}: ${message}`);
}

function assertExactQuantiles(quantiles: unknown, source: string): void {
  if (!Array.isArray(quantiles) || quantiles.length !== expectedQuantiles.length) {
    fail(source, 'quantiles must be exactly [0.05, 0.25, 0.5, 0.75, 0.95]');
  }
  for (let i = 0; i < expectedQuantiles.length; i++) {
    if (quantiles[i] !== expectedQuantiles[i]) {
      fail(source, 'quantiles must be exactly [0.05, 0.25, 0.5, 0.75, 0.95]');
    }
  }
}

function readMarket(value: unknown, source: string, index: number): MarketInput {
  const label = `${source} market[${index}]`;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(label, 'market must be an object');
  }
  const market = value as Record<string, unknown>;
  const id = market.id;
  if (typeof id === 'number' && !Number.isFinite(id)) fail(label, 'market id must be finite');
  if (typeof id !== 'string' && typeof id !== 'number') {
    fail(label, 'market id must be a string or number');
  }
  if (!Array.isArray(market.prices) || market.prices.length === 0) {
    fail(label, 'market has no prices');
  }
  const prices: number[] = [];
  for (const price of market.prices) {
    if (typeof price !== 'number' || !Number.isFinite(price)) {
      fail(label, 'prices must be finite numbers');
    }
    prices.push(price);
  }
  return { id, prices };
}

function readCase(path: string): CaseInput {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail(path, 'input must be a JSON object');
  }
  const body = parsed as Record<string, unknown>;
  assertExactQuantiles(body.quantiles, path);
  const horizon = body.horizon_minutes;
  if (typeof horizon !== 'number' || !Number.isInteger(horizon) || horizon < 1) {
    fail(path, 'horizon_minutes must be a positive integer');
  }
  if (!Array.isArray(body.markets)) fail(path, 'markets must be an array');
  return {
    horizonMinutes: horizon,
    markets: body.markets.map((market, index) => readMarket(market, path, index)),
  };
}

function caseIdFromName(name: string): string {
  return name.endsWith('.in') ? name.slice(0, -'.in'.length) : name;
}

function forecastCase(input: CaseInput): Forecast[] {
  const boardSum = boardSumOf(input.markets);
  return input.markets.map((market) => ({
    id: market.id,
    q: forecastMarket(market.prices, input.horizonMinutes, boardSum),
  }));
}

function writeCase(caseId: string, forecasts: Forecast[]): void {
  mkdirSync(outputDir, { recursive: true });
  const payload = JSON.stringify({ forecasts }) + '\n';
  writeFileSync(join(outputDir, `${caseId}.out`), payload);
}

function listInputs(): string[] {
  const names = readdirSync(inputDir).filter((name) => name.endsWith('.in'));
  names.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return names;
}

function main(): void {
  for (const name of listInputs()) {
    const input = readCase(join(inputDir, name));
    writeCase(caseIdFromName(name), forecastCase(input));
  }
}

main();
