// Implied value for protocols that record no token.
//
// Peers are live-token protocols in this same snapshot: market cap divided by TVL.
// A category multiple is the trimmed median of those ratios after each one is capped
// at five times the global 90th percentile. Fewer than five peers and the median shrinks
// toward the global trimmed median. Seven-day TVL growth and months listed with no
// token then scale the multiple. CEX, bridge and liquid-staking categories stay out of
// both the comps and the pre-token board. No protocol name is special-cased.

import { farmPlan } from './farm.ts';

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export const MODEL_VERSION = 'northline-1';

export const MODEL = {
  peer_min: 5,
  trim_frac: 0.1,
  winsor_lo: 0.1,
  winsor_hi: 0.9,
  /** A lone peer may sit above the 90th percentile, but not past this many times it. */
  ratio_cap_times_p90: 5,
  growth_weight: 0.35,
  growth_floor: -40,
  growth_cap: 80,
  days_per_month: 30.4375,
  maturity_months: 30,
  maturity_floor: 0.82,
  maturity_span: 0.36,
  unknown_months: 12,
  band_tight: 0.16,
  band_extra: 0.4,
  band_missing: 0.04,
};

/** Categories whose token is a wrapper, a bridge, or an exchange, not a launch comp. */
export const EXCLUDED_CATEGORIES = [
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
] as const;

const EXCLUDED = new Set<string>(EXCLUDED_CATEGORIES);
const VERSIONED = /\s(V\d+(?:\.\d+)?|v\d+(?:\.\d+)?|\d+\.\d+)$/;
const WRAP_WORD = /\b(?:wrapped|staked|staking)\b/i;
const EXCHANGE = /^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
const DAY_MS = 86_400_000;
const VALUE_CAP = 100_000_000_000_000;

export const FORMULA =
  'implied = round(tvl × category multiple × growth × seasoning). ' +
  'The category multiple is the 10% trimmed median of live-token mcap/TVL in that category. ' +
  'Each peer ratio is capped at 5× the global 90th percentile first, so one token whose float dwarfs a thin TVL cannot print a multiple in the hundreds. ' +
  'The global median clamps ratios to the 10th–90th percentile, then takes the same trimmed median. ' +
  'With fewer than 5 peers the category median shrinks: (n/5)×category + (1−n/5)×global. No peers uses the global median alone. ' +
  'growth = 1 + 0.35×clamp(change_7d, −40, 80)/100, and a missing change counts as 0. ' +
  'seasoning = 0.82 + 0.36×min(months, 30)/30, months = age_days/30.4375, unknown listing = 12 months. ' +
  'The low/high band is wider when the category is thin or a figure is missing.';

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

export function recordsNoToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isWrapperLike(p: SnapshotProtocol): boolean {
  if (p.category !== null && EXCLUDED.has(p.category)) return true;
  if (VERSIONED.test(p.name)) return true;
  if (WRAP_WORD.test(p.name)) return true;
  if (EXCHANGE.test(p.name)) return true;
  return false;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const end = Date.parse(`${asOf}T00:00:00Z`);
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return null;
  return Math.max(0, Math.floor((end - start) / DAY_MS));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function round4(n: number): number {
  return Number(n.toFixed(4));
}

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  const t = index - lo;
  return sorted[lo]! * (1 - t) + sorted[hi]! * t;
}

/** Drop the outer 10% (at least one each side) once a category has five ratios. */
function trimmedMedian(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n < MODEL.peer_min) return median(sorted);
  let cut = Math.max(1, Math.floor(n * MODEL.trim_frac));
  while (n - 2 * cut < 3) cut -= 1;
  return median(sorted.slice(cut, n - cut));
}

export interface GlobalFit {
  n: number;
  p10: number;
  p90: number;
  ratio_cap: number;
  trimmed_median: number;
}

export interface CategoryFit {
  category: string;
  n: number;
  /** Trimmed median before the ratio cap. Null when the category has no priced peer. */
  raw_median: number | null;
  trimmed_median: number;
  multiple: number;
  shrunk: boolean;
  cap_hit: boolean;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  ratio: number;
  ratio_winsor: number | null;
  used_in_comps: boolean;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  stage: 'floor' | 'early' | 'scout';
  token_status: 'pre-token';
  implied_value_usd: number;
  low_usd: number;
  high_usd: number;
  capital_usd: number;
  gas_usd: number;
  hold_days: number;
  chain: string;
  model: {
    multiple: number;
    peer_n: number;
    shrunk: boolean;
    raw_median: number | null;
    trimmed_median: number;
    cap_hit: boolean;
    growth_pct: number;
    growth_mult: number;
    months: number;
    maturity_mult: number;
    half_width: number;
  };
  farm_steps: string[];
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  formula: string;
  constants: typeof MODEL;
  global: GlobalFit;
  categories: CategoryFit[];
  watchlist_size: number;
  board_size: number;
  floor_size: number;
  early_size: number;
  scout_size: number;
  live_size: number;
  rows: BoardRow[];
  live: LiveRow[];
}

interface Scored {
  protocol: SnapshotProtocol;
  stage: BoardRow['stage'];
  implied: number;
  low: number;
  high: number;
  fit: CategoryFit;
  growthPct: number;
  growthMult: number;
  months: number;
  maturityMult: number;
  half: number;
  age: number | null;
}

function categoryKey(category: string | null): string {
  return category ?? 'Uncategorized';
}

export function fitComps(protocols: SnapshotProtocol[]): { global: GlobalFit; categories: CategoryFit[]; live: LiveRow[] } {
  const priced = protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const used = priced.filter((p) => p.category === null || !EXCLUDED.has(p.category));
  const raw = used.map((p) => p.mcap_usd! / p.tvl_usd).filter((r) => r > 0).sort((a, b) => a - b);
  const p10 = percentile(raw, MODEL.winsor_lo);
  const p90 = percentile(raw, MODEL.winsor_hi);
  const ratioCap = p90 * MODEL.ratio_cap_times_p90;
  const winsorAll = raw.map((r) => clamp(r, p10, p90)).sort((a, b) => a - b);
  const globalMedian = trimmedMedian(winsorAll);
  const global: GlobalFit = {
    n: raw.length,
    p10: round4(p10),
    p90: round4(p90),
    ratio_cap: round4(ratioCap),
    trimmed_median: round4(globalMedian),
  };

  const groups = new Map<string, number[]>();
  for (const p of used) {
    const ratio = p.mcap_usd! / p.tvl_usd;
    if (!(ratio > 0)) continue;
    const key = categoryKey(p.category);
    const list = groups.get(key);
    if (list === undefined) groups.set(key, [ratio]);
    else list.push(ratio);
  }

  const categories: CategoryFit[] = [];
  for (const [category, ratios] of groups) {
    const uncapped = ratios.slice().sort((a, b) => a - b);
    const capped = uncapped.map((r) => Math.min(r, ratioCap)).sort((a, b) => a - b);
    const n = capped.length;
    const rawMedian = trimmedMedian(uncapped);
    const trimmed = trimmedMedian(capped);
    const shrunk = n < MODEL.peer_min;
    const weight = shrunk ? n / MODEL.peer_min : 1;
    const multiple = weight * trimmed + (1 - weight) * globalMedian;
    categories.push({
      category,
      n,
      raw_median: round4(rawMedian),
      trimmed_median: round4(trimmed),
      multiple: round4(multiple),
      shrunk,
      cap_hit: round4(rawMedian) !== round4(trimmed),
    });
  }
  categories.sort((a, b) => b.n - a.n || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));

  const live: LiveRow[] = priced.map((p) => {
    const ratio = p.mcap_usd! / p.tvl_usd;
    const inComps = (p.category === null || !EXCLUDED.has(p.category)) && ratio > 0;
    return {
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      change_7d: p.change_7d,
      ratio: round4(ratio),
      ratio_winsor: inComps ? round4(Math.min(ratio, ratioCap)) : null,
      used_in_comps: inComps,
    };
  });
  live.sort((a, b) => b.mcap_usd - a.mcap_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return { global, categories, live };
}

function fitFor(categories: CategoryFit[], global: GlobalFit, category: string | null): CategoryFit {
  const found = categories.find((c) => c.category === categoryKey(category));
  if (found !== undefined) return found;
  return {
    category: categoryKey(category),
    n: 0,
    raw_median: null,
    trimmed_median: global.trimmed_median,
    multiple: global.trimmed_median,
    shrunk: true,
    cap_hit: false,
  };
}

function scoreOne(p: SnapshotProtocol, asOf: string, stage: BoardRow['stage'], fit: CategoryFit): Scored {
  const age = ageDays(asOf, p.listed_at);
  const growthMissing = p.change_7d === null;
  const growthPct = clamp(growthMissing ? 0 : p.change_7d!, MODEL.growth_floor, MODEL.growth_cap);
  const growthMult = round4(1 + (growthPct / 100) * MODEL.growth_weight);
  const ageMissing = age === null;
  const monthsExact = ageMissing ? MODEL.unknown_months : age / MODEL.days_per_month;
  const seasoned = clamp(monthsExact, 0, MODEL.maturity_months);
  const maturityMult = round4(MODEL.maturity_floor + (seasoned / MODEL.maturity_months) * MODEL.maturity_span);
  const implied = Math.max(1, Math.min(VALUE_CAP, Math.round(p.tvl_usd * fit.multiple * growthMult * maturityMult)));
  const nFrac = Math.min(fit.n, MODEL.peer_min) / MODEL.peer_min;
  let half = MODEL.band_tight + MODEL.band_extra * (1 - nFrac);
  if (growthMissing) half += MODEL.band_missing;
  if (ageMissing) half += MODEL.band_missing;
  half = Math.min(0.7, half);
  const low = Math.max(1, Math.round(implied * (1 - half)));
  const high = Math.min(VALUE_CAP, Math.max(implied, Math.round(implied * (1 + half))));
  return {
    protocol: p,
    stage,
    implied,
    low,
    high,
    fit,
    growthPct: round4(growthPct),
    growthMult,
    months: round4(monthsExact),
    maturityMult,
    half: round4(half),
    age,
  };
}

export function buildBoard(snapshot: Snapshot, fit: { global: GlobalFit; categories: CategoryFit[] }): BoardRow[] {
  const watch = new Set(snapshot.watchlist);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen: SnapshotProtocol[] = [];
  const seen = new Set<string>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p === undefined || seen.has(slug)) continue;
    seen.add(slug);
    chosen.push(p);
  }
  for (const p of snapshot.protocols) {
    if (seen.has(p.slug)) continue;
    if (!recordsNoToken(p) || isWrapperLike(p)) continue;
    seen.add(p.slug);
    chosen.push(p);
  }

  const scored = chosen.map((p) => {
    const stage: BoardRow['stage'] = watch.has(p.slug) ? 'floor' : p.tvl_usd >= snapshot.floor_usd ? 'early' : 'scout';
    return scoreOne(p, snapshot.as_of, stage, fitFor(fit.categories, fit.global, p.category));
  });
  scored.sort((a, b) => b.implied - a.implied || (a.protocol.slug < b.protocol.slug ? -1 : a.protocol.slug > b.protocol.slug ? 1 : 0));

  return scored.map((s, i) => {
    const plan = farmPlan(s.protocol, s.age);
    return {
      rank: i + 1,
      slug: s.protocol.slug,
      name: s.protocol.name,
      category: s.protocol.category,
      chains: s.protocol.chains,
      tvl_usd: s.protocol.tvl_usd,
      change_7d: s.protocol.change_7d,
      listed_at: s.protocol.listed_at,
      age_days: s.age,
      stage: s.stage,
      token_status: 'pre-token',
      implied_value_usd: s.implied,
      low_usd: s.low,
      high_usd: s.high,
      capital_usd: plan.capital_usd,
      gas_usd: plan.gas_usd,
      hold_days: plan.hold_days,
      chain: plan.chain,
      model: {
        multiple: s.fit.multiple,
        peer_n: s.fit.n,
        shrunk: s.fit.shrunk,
        raw_median: s.fit.raw_median,
        trimmed_median: s.fit.trimmed_median,
        cap_hit: s.fit.cap_hit,
        growth_pct: s.growthPct,
        growth_mult: s.growthMult,
        months: s.months,
        maturity_mult: s.maturityMult,
        half_width: s.half,
      },
      farm_steps: plan.steps,
    };
  });
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const fit = fitComps(snapshot.protocols);
  const board = buildBoard(snapshot, fit);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    formula: FORMULA,
    constants: MODEL,
    global: fit.global,
    categories: fit.categories,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    floor_size: board.filter((r) => r.stage === 'floor').length,
    early_size: board.filter((r) => r.stage === 'early').length,
    scout_size: board.filter((r) => r.stage === 'scout').length,
    live_size: fit.live.length,
    rows: board,
    live: fit.live,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not an object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string' || o.source.length === 0) throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist');
  const protocols = o.protocols.map((value, i) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new SnapshotError(`protocol ${i} is not an object`);
    const p = value as Record<string, unknown>;
    if (typeof p.slug !== 'string' || p.slug.length === 0 || /\s/.test(p.slug)) throw new SnapshotError(`protocol ${i} has a bad slug`);
    if (typeof p.name !== 'string' || p.name.length === 0) throw new SnapshotError(`protocol ${i} has no name`);
    if (typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) throw new SnapshotError(`protocol ${i} has no TVL`);
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board has ${board.length} rows`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'a slug is repeated';
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const row of board) if (!known.has(row.slug)) return `${row.slug} is not in the snapshot`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `missing watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  for (let i = 0; i < board.length; i++) if (board[i]!.rank !== i + 1) return `rank ${i + 1} is ${board[i]!.rank}`;
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i}`;
  }
  if (board.length >= 2 && board.every((r) => r.implied_value_usd === board[0]!.implied_value_usd)) return 'every implied value is the same';
  for (const row of board) {
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0 || row.implied_value_usd > VALUE_CAP) {
      return `${row.slug} has implied value ${row.implied_value_usd}`;
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `${row.slug} has ${row.farm_steps.length} farm steps`;
    for (const step of row.farm_steps) {
      const text = step.trim();
      if (text.length < 20 || text.length > 600) return `${row.slug} has a farm step of ${text.length} characters`;
    }
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
