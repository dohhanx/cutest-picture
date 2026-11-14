// Implied value for protocols that record no token.
//
// Traded tokens in this snapshot are grouped into families (Aave V2 and V3 share one
// market cap; TVL is summed). A log-log line is fit to those families:
//   log10(mcap) = a + b · log10(TVL)    so    value = 10^a × TVL^b
// A first TVL-only line is the baseline. The line that prices the board is a
// robust multivariate fit: families whose log multiple sits more than two MAD
// from the median are plotted and not estimated, then
//   log10(mcap) = a + b·log10(TVL) + c·momentum + d·log10(1+months) + category effects
// for categories with at least five families. Chain breadth and a kin penalty
// are applied after the fit. They are not in the R². The target is recorded
// market cap. The snapshot has no FDV and no TVL path. No name is special-cased.

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

export const MODEL_VERSION = 'northline-3';

export const MODEL = {
  peer_min: 5,
  /** Families farther than this many MAD of log10(mcap/TVL) are not estimated. */
  mad_screen: 2,
  airdrop_share: 0.05,
  /** Stable yield given up while the ticket is locked. */
  yield_foregone: 0.04,
  /** Worth it when net drop per $1,000 clears this after gas and foregone yield. */
  worth_per_1k: 4,
  momentum_cap: 40,
  chain_bump: 0.03,
  chain_cap: 10,
  unknown_months: 12,
  days_per_month: 30.4375,
  kin_factor: 0.5,
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
  'Robust log-log with category effects. Families share a symbol or a CoinGecko id and their TVL is summed. ' +
  'A TVL-only line on every eligible family is the baseline. The pricing line drops families whose log10(mcap/TVL) is more than 2 MAD from the median, then estimates ' +
  'log10(mcap) = a + b·log10(TVL) + c·momentum + d·log10(1+months) + a category effect. ' +
  'momentum = clamp(change_7d, −40, 40)/100. months = age_days/30.4375, or 12 when the listing date is missing. ' +
  'A category effect is estimated when five or more families remain in that category; fewer than five shrink toward no effect by n/5. ' +
  'value = that fit × breadth × kin. breadth = 1 + 3% × min(chains, 10). kin = 0.5 when the first word matches a protocol that already records a token. ' +
  'Breadth and kin are not inside the R². The target is recorded market cap, not FDV. ' +
  'This does not claim a token will be issued, or when.';

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

export type Stage = 'floor' | 'early' | 'scout';
export type Grade = 'A' | 'B' | 'C' | 'D';
export type Verdict = 'worth' | 'thin' | 'skip';
export type AsideReason = 'CEX' | 'bridged' | 'staked' | 'wrapped' | 'versioned' | 'kin/parent';

export function recordsNoToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function hasToken(p: SnapshotProtocol): boolean {
  return !recordsNoToken(p);
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const end = Date.parse(`${asOf}T00:00:00Z`);
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return null;
  return Math.max(0, Math.floor((end - start) / DAY_MS));
}

export function mechanismOf(category: string | null): string {
  const c = (category ?? '').toLowerCase();
  if (c.includes('predict')) return 'Predict';
  if (c.includes('lend') || c.includes('cdp') || c.includes('credit')) return 'Credit';
  if (c.includes('dex') || c.includes('deriv') || c.includes('perp') || c.includes('option')) return 'Trade';
  if (c.includes('curat') || c.includes('allocat') || c.includes('vault')) return 'Vault';
  if (c.includes('yield') || c.includes('farm') || c.includes('basis')) return 'Yield';
  if (c.includes('stak') || c.includes('restak')) return 'Stake';
  if (c.includes('rwa') || c.includes('stable') || c.includes('asset')) return 'Asset';
  if (c.includes('insur')) return 'Cover';
  if (c.includes('pay')) return 'Pay';
  return 'Other';
}

function round4(n: number): number {
  return Number(n.toFixed(4));
}

function round6(n: number): number {
  return Number(n.toFixed(6));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function firstWord(name: string): string {
  return (name.split(/\s+/)[0] ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function asideReason(p: SnapshotProtocol, kin: boolean): AsideReason | null {
  if (p.category === 'CEX' || EXCHANGE.test(p.name)) return 'CEX';
  if (p.category === 'Bridge' || p.category === 'Canonical Bridge' || p.category === 'Cross Chain Bridge') return 'bridged';
  if (p.category === 'Liquid Staking' || p.category === 'Liquid Restaking' || p.category === 'Restaked BTC') return 'staked';
  if (WRAP_WORD.test(p.name)) return 'wrapped';
  if (VERSIONED.test(p.name)) return kin ? 'kin/parent' : 'versioned';
  if (kin) return 'kin/parent';
  return null;
}

interface Ols {
  n: number;
  a: number;
  b: number;
  r2: number;
  rmse: number;
  q25: number;
  q75: number;
}

function ols(points: { tvl: number; mcap: number }[]): Ols {
  const n = points.length;
  const xs = points.map((p) => Math.log10(p.tvl));
  const ys = points.map((p) => Math.log10(p.mcap));
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) ** 2;
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  const b = sxy / sxx;
  const a = my - b * mx;
  const resid: number[] = [];
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const err = ys[i]! - (a + b * xs[i]!);
    resid.push(err);
    ssTot += (ys[i]! - my) ** 2;
    ssRes += err * err;
  }
  const sorted = resid.slice().sort((p, q) => p - q);
  const quantile = (p: number): number => {
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const t = idx - lo;
    return sorted[lo]! * (1 - t) + sorted[hi]! * t;
  };
  return { n, a, b, r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot, rmse: Math.sqrt(ssRes / n), q25: quantile(0.25), q75: quantile(0.75) };
}

function medianAbsPct(errors: number[]): number {
  const sorted = errors.slice().sort((a, b) => a - b);
  return median(sorted);
}

interface Family {
  id: string;
  members: SnapshotProtocol[];
  tvl: number;
  mcap: number;
  primary: SnapshotProtocol;
}

function buildFamilies(protocols: SnapshotProtocol[]): Family[] {
  const symToGecko = new Map<string, string>();
  for (const p of protocols) {
    if (p.symbol !== null && p.gecko_id !== null && !symToGecko.has(p.symbol)) symToGecko.set(p.symbol, p.gecko_id);
  }
  const groups = new Map<string, SnapshotProtocol[]>();
  for (const p of protocols) {
    let id: string | null = null;
    if (p.gecko_id !== null) id = `g:${p.gecko_id}`;
    else if (p.symbol !== null && symToGecko.has(p.symbol)) id = `g:${symToGecko.get(p.symbol)}`;
    else if (p.symbol !== null) id = `s:${p.symbol}`;
    if (id === null) continue;
    const list = groups.get(id);
    if (list === undefined) groups.set(id, [p]);
    else list.push(p);
  }
  const families: Family[] = [];
  for (const id of [...groups.keys()].sort()) {
    const members = groups.get(id)!;
    let mcap = 0;
    let tvl = 0;
    let primary = members[0]!;
    for (const member of members) {
      tvl += member.tvl_usd;
      if (member.mcap_usd !== null && member.mcap_usd > mcap) mcap = member.mcap_usd;
      if (member.tvl_usd > primary.tvl_usd) primary = member;
    }
    families.push({ id, members, tvl, mcap, primary });
  }
  return families;
}

export interface FitPoint {
  name: string;
  category: string | null;
  tvl: number;
  mcap: number;
  /** Used to estimate the pricing line. */
  in_fit: boolean;
  /** Eligible family kept off the line by the MAD screen. */
  screened: boolean;
}

export interface ResidualPoint {
  name: string;
  fitted: number;
  residual: number;
}

export interface CategoryFit {
  category: string;
  n: number;
  factor: number;
  shrunk: boolean;
  peers: { name: string; tvl: number; mcap: number; multiple: number; in_fit: boolean }[];
}

export interface CurveFit {
  method: string;
  n: number;
  dropped: number;
  a: number;
  b: number;
  mom: number;
  age: number;
  reference: string;
  /** Added to a + b·log10(TVL) so the drawn line sits at a typical month and a flat week. */
  line_shift: number;
  r2: number;
  rmse: number;
  q25: number;
  q75: number;
  loo_median_ape: number;
  loo_median_dex: number;
  baseline_n: number;
  baseline_r2: number;
  baseline_loo: number;
  holdout_n: number;
  holdout_median_ape: number;
  points: FitPoint[];
  residuals: ResidualPoint[];
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  mechanism: string;
  chains: string[];
  chain: string;
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  stage: Stage;
  kin: boolean;
  kin_of: string | null;
  token_status: 'pre-token';
  implied_value_usd: number;
  low_usd: number;
  high_usd: number;
  grade: Grade;
  verdict: Verdict;
  drop_per_1k: number;
  net_per_1k: number;
  tx_count: number;
  capital_usd: number;
  gas_usd: number;
  gas_total_usd: number;
  setup_min: number;
  hold_days: number;
  model: {
    base_usd: number;
    category_factor: number;
    peer_n: number;
    shrunk: boolean;
    seasoning: number;
    months: number;
    momentum: number;
    breadth: number;
    kin_factor: number;
    multiple: number;
  };
  farm_steps: string[];
}

export interface TokenRow {
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  chains: string[];
  chain: string;
  tvl_usd: number;
  mcap_usd: number | null;
  family: string;
  in_fit: boolean;
  siblings: number;
}

export interface AsideRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: AsideReason;
  token: boolean;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  formula: string;
  constants: typeof MODEL;
  fit: CurveFit;
  categories: CategoryFit[];
  tracked: number;
  pre_token: number;
  watchlist_size: number;
  board_size: number;
  floor_size: number;
  early_size: number;
  scout_size: number;
  kin_size: number;
  tokened_size: number;
  aside_size: number;
  tvl_on_board: number;
  implied_sum: number;
  median_multiple: number;
  rows: BoardRow[];
  tokened: TokenRow[];
  aside: AsideRow[];
}

interface DesignRow {
  family: Family;
  category: string;
  mom: number;
  lmonths: number;
  y: number;
  logTvl: number;
}

function designOf(family: Family, asOf: string): DesignRow {
  const age = ageDays(asOf, family.primary.listed_at);
  const months = (age === null ? MODEL.unknown_months * MODEL.days_per_month : age) / MODEL.days_per_month;
  const change = family.primary.change_7d;
  return {
    family,
    category: family.primary.category ?? 'Uncategorized',
    mom: clamp(change === null ? 0 : change, -MODEL.momentum_cap, MODEL.momentum_cap) / 100,
    lmonths: Math.log10(1 + Math.max(0, months)),
    y: Math.log10(family.mcap),
    logTvl: Math.log10(family.tvl),
  };
}

/** Solve X'X beta = X'y. Returns null when the design is singular. */
function solveNormal(rows: number[][], y: number[]): number[] | null {
  const cols = rows[0]!.length;
  const matrix: number[][] = [];
  for (let j = 0; j < cols; j++) {
    const line: number[] = [];
    for (let k = 0; k < cols; k++) {
      let sum = 0;
      for (let i = 0; i < rows.length; i++) sum += rows[i]![j]! * rows[i]![k]!;
      line.push(sum);
    }
    let rhs = 0;
    for (let i = 0; i < rows.length; i++) rhs += rows[i]![j]! * y[i]!;
    line.push(rhs);
    matrix.push(line);
  }
  for (let col = 0; col < cols; col++) {
    let pivot = col;
    for (let row = col + 1; row < cols; row++) {
      if (Math.abs(matrix[row]![col]!) > Math.abs(matrix[pivot]![col]!)) pivot = row;
    }
    if (Math.abs(matrix[pivot]![col]!) < 1e-10) return null;
    if (pivot !== col) {
      const swap = matrix[col]!;
      matrix[col] = matrix[pivot]!;
      matrix[pivot] = swap;
    }
    const scale = matrix[col]![col]!;
    for (let k = col; k <= cols; k++) matrix[col]![k] = matrix[col]![k]! / scale;
    for (let row = 0; row < cols; row++) {
      if (row === col) continue;
      const factor = matrix[row]![col]!;
      for (let k = col; k <= cols; k++) matrix[row]![k] = matrix[row]![k]! - factor * matrix[col]![k]!;
    }
  }
  return matrix.map((line) => line[cols]!);
}

function feNames(rows: DesignRow[]): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, n]) => n >= MODEL.peer_min)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([name]) => name);
}

function regressor(row: DesignRow, effects: string[]): number[] {
  const reference = effects[0] ?? '';
  const line = [1, row.logTvl, row.mom, row.lmonths];
  for (const name of effects) if (name !== reference) line.push(row.category === name ? 1 : 0);
  return line;
}

function fittedLog(row: DesignRow, beta: number[], effects: string[]): number {
  const x = regressor(row, effects);
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += x[i]! * beta[i]!;
  return sum;
}

function curveOf(protocols: SnapshotProtocol[], asOf: string): { fit: CurveFit; categories: CategoryFit[]; inFit: Set<string> } {
  const families = buildFamilies(protocols).filter((f) => f.mcap > 0 && f.tvl > 0);
  const usable = families.filter((f) => f.primary.category === null || !EXCLUDED.has(f.primary.category));
  const held = families.filter((f) => f.primary.category !== null && EXCLUDED.has(f.primary.category));
  const baseLine = ols(usable.map((f) => ({ tvl: f.tvl, mcap: f.mcap })));
  const baseLoo: number[] = [];
  for (let i = 0; i < usable.length; i++) {
    const sample = usable.filter((_, j) => j !== i).map((f) => ({ tvl: f.tvl, mcap: f.mcap }));
    const left = ols(sample);
    const hat = 10 ** (left.a + left.b * Math.log10(usable[i]!.tvl));
    baseLoo.push(Math.abs(hat - usable[i]!.mcap) / usable[i]!.mcap);
  }

  const ratios = usable.map((f) => Math.log10(f.mcap / f.tvl)).sort((p, q) => p - q);
  const mid = median(ratios);
  const mad = median(ratios.map((value) => Math.abs(value - mid)).sort((p, q) => p - q)) || 1;
  const screened = new Set<string>();
  const sample = usable.filter((f) => {
    const keep = Math.abs(Math.log10(f.mcap / f.tvl) - mid) <= MODEL.mad_screen * mad;
    if (!keep) screened.add(f.id);
    return keep;
  });
  const rows = sample.map((f) => designOf(f, asOf));
  const effects = feNames(rows);
  const betaRaw = solveNormal(rows.map((row) => regressor(row, effects)), rows.map((row) => row.y));
  const beta = betaRaw ?? [baseLine.a, baseLine.b, 0, 0];
  const a = round6(beta[0]!);
  const b = round6(beta[1]!);
  const momCoef = round6(beta[2]!);
  const ageCoef = round6(beta[3]!);
  const typicalMom = median(rows.map((row) => row.mom).sort((p, q) => p - q));
  const typicalAge = median(rows.map((row) => row.lmonths).sort((p, q) => p - q));
  const lineShift = round6(momCoef * typicalMom + ageCoef * typicalAge);
  const betaUse = [a, b, momCoef, ageCoef, ...beta.slice(4).map((value) => round6(value))];

  const residuals = rows.map((row) => {
    const fitted = fittedLog(row, betaUse, effects);
    return { name: row.family.primary.name, fitted: round4(fitted), residual: round4(row.y - fitted), category: row.category };
  });
  const residOnly = residuals.map((point) => point.residual).sort((p, q) => p - q);
  const meanY = rows.reduce((sum, row) => sum + row.y, 0) / rows.length;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < rows.length; i++) {
    ssTot += (rows[i]!.y - meanY) ** 2;
    ssRes += residuals[i]!.residual ** 2;
  }
  const quantile = (p: number): number => {
    const idx = (residOnly.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const t = idx - lo;
    return residOnly[lo]! * (1 - t) + residOnly[hi]! * t;
  };

  const looApe: number[] = [];
  const looDex: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const sub = rows.filter((_, j) => j !== i);
    const subEffects = feNames(sub);
    const subBeta = solveNormal(sub.map((row) => regressor(row, subEffects)), sub.map((row) => row.y));
    if (subBeta === null) continue;
    const yHat = fittedLog(rows[i]!, subBeta, subEffects);
    looDex.push(Math.abs(yHat - rows[i]!.y));
    looApe.push(Math.abs(10 ** yHat - rows[i]!.family.mcap) / rows[i]!.family.mcap);
  }

  const thinResid = new Map<string, number[]>();
  for (const point of residuals) {
    if (effects.includes(point.category)) continue;
    const list = thinResid.get(point.category);
    if (list === undefined) thinResid.set(point.category, [point.residual]);
    else list.push(point.residual);
  }
  const effectOf = (category: string, n: number): { factor: number; shrunk: boolean } => {
    const index = effects.indexOf(category);
    if (index === 0) return { factor: 1, shrunk: false };
    if (index > 0) return { factor: round4(10 ** betaUse[3 + index]!), shrunk: false };
    const list = (thinResid.get(category) ?? []).slice().sort((p, q) => p - q);
    if (n === 0 || list.length === 0) return { factor: 1, shrunk: true };
    const shrunk = (Math.min(n, MODEL.peer_min) / MODEL.peer_min) * median(list);
    return { factor: round4(10 ** shrunk), shrunk: true };
  };

  const byCategory = new Map<string, Family[]>();
  for (const family of usable) {
    const key = family.primary.category ?? 'Uncategorized';
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [family]);
    else list.push(family);
  }
  const categories: CategoryFit[] = [];
  for (const category of [...byCategory.keys()].sort()) {
    const peers = byCategory.get(category)!;
    const inSample = peers.filter((family) => !screened.has(family.id)).length;
    const effect = effectOf(category, inSample);
    categories.push({
      category,
      n: inSample,
      factor: effect.factor,
      shrunk: effect.shrunk,
      peers: peers
        .slice()
        .sort((p, q) => q.mcap - p.mcap || (p.primary.name < q.primary.name ? -1 : 1))
        .map((family) => ({
          name: family.primary.name,
          tvl: family.tvl,
          mcap: family.mcap,
          multiple: round4(family.mcap / family.tvl),
          in_fit: !screened.has(family.id),
        })),
    });
  }

  const predictHold = (family: Family): number => {
    const row = designOf(family, asOf);
    return 10 ** fittedLog(row, betaUse, effects);
  };
  const holdoutErrors = held.map((family) => Math.abs(predictHold(family) - family.mcap) / family.mcap);
  const inFit = new Set(sample.map((family) => family.id));
  const points: FitPoint[] = families.map((family) => ({
    name: family.members.length > 1 ? `${family.primary.name} +${family.members.length - 1}` : family.primary.name,
    category: family.primary.category,
    tvl: family.tvl,
    mcap: family.mcap,
    in_fit: inFit.has(family.id),
    screened: screened.has(family.id),
  }));
  points.sort((p, q) => p.tvl - q.tvl || (p.name < q.name ? -1 : 1));

  return {
    fit: {
      method: 'robust log-log with category effects',
      n: sample.length,
      dropped: screened.size,
      a,
      b,
      mom: momCoef,
      age: ageCoef,
      reference: effects[0] ?? 'none',
      line_shift: lineShift,
      r2: round4(ssTot === 0 ? 0 : 1 - ssRes / ssTot),
      rmse: round4(Math.sqrt(ssRes / Math.max(rows.length, 1))),
      q25: round4(quantile(0.25)),
      q75: round4(quantile(0.75)),
      loo_median_ape: round4(medianAbsPct(looApe)),
      loo_median_dex: round4(median(looDex.slice().sort((p, q) => p - q))),
      baseline_n: usable.length,
      baseline_r2: round4(baseLine.r2),
      baseline_loo: round4(medianAbsPct(baseLoo)),
      holdout_n: held.length,
      holdout_median_ape: held.length === 0 ? 0 : round4(medianAbsPct(holdoutErrors)),
      points,
      residuals: residuals.map((point) => ({ name: point.name, fitted: point.fitted, residual: point.residual })),
    },
    categories,
    inFit,
  };
}

function factorFor(categories: CategoryFit[], category: string | null): CategoryFit {
  const key = category ?? 'Uncategorized';
  const found = categories.find((c) => c.category === key);
  if (found !== undefined) return found;
  return { category: key, n: 0, factor: 1, shrunk: true, peers: [] };
}

function gradeFor(peerN: number, changeMissing: boolean, ageMissing: boolean): Grade {
  if (peerN === 0 || (changeMissing && ageMissing)) return 'D';
  if (peerN >= 8 && !changeMissing && !ageMissing) return 'A';
  if (peerN >= 5) return 'B';
  return 'C';
}

/** Net of gas and 4% foregone yield, per $1,000 of the minimum ticket. */
export function verdictFor(dropPer1k: number, capital: number, gasTotal: number, holdDays: number): Verdict {
  const foregone = 1000 * MODEL.yield_foregone * (holdDays / 365);
  const netPer1k = dropPer1k - (gasTotal * 1000) / Math.max(capital, 1) - foregone;
  if (netPer1k >= MODEL.worth_per_1k) return 'worth';
  if (netPer1k > 0) return 'thin';
  return 'skip';
}

function kinIndex(protocols: SnapshotProtocol[]): Map<string, string> {
  const parents = new Map<string, string>();
  for (const p of protocols) {
    if (!hasToken(p)) continue;
    const word = firstWord(p.name);
    if (word.length < 5 || parents.has(word)) continue;
    parents.set(word, p.name);
  }
  return parents;
}

function kinOf(p: SnapshotProtocol, parents: Map<string, string>): string | null {
  const word = firstWord(p.name);
  if (word.length < 5) return null;
  const parent = parents.get(word);
  if (parent === undefined || parent === p.name) return null;
  return parent;
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const { fit, categories, inFit } = curveOf(snapshot.protocols, snapshot.as_of);
  const families = buildFamilies(snapshot.protocols);
  const familyByMember = new Map<string, Family>();
  for (const family of families) for (const member of family.members) familyByMember.set(member.slug, family);
  const parents = kinIndex(snapshot.protocols);
  const watch = new Set(snapshot.watchlist);
  const chosen: SnapshotProtocol[] = [];
  const aside: AsideRow[] = [];
  const seen = new Set<string>();

  for (const slug of snapshot.watchlist) {
    const p = snapshot.protocols.find((row) => row.slug === slug);
    if (p === undefined || seen.has(slug)) continue;
    seen.add(slug);
    chosen.push(p);
  }
  for (const p of snapshot.protocols) {
    if (seen.has(p.slug)) continue;
    const kin = kinOf(p, parents);
    if (!recordsNoToken(p)) {
      const reason = asideReason(p, kin !== null);
      if (reason !== null && (p.category !== null && EXCLUDED.has(p.category) || reason === 'wrapped' || reason === 'versioned' || reason === 'kin/parent' || reason === 'CEX')) {
        aside.push({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, reason, token: true });
      }
      continue;
    }
    const reason = asideReason(p, kin !== null);
    const hard = reason !== null && reason !== 'kin/parent';
    if (hard || (reason === 'kin/parent' && VERSIONED.test(p.name))) {
      aside.push({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, reason: reason!, token: false });
      continue;
    }
    seen.add(p.slug);
    chosen.push(p);
  }

  const scored = chosen.map((p) => {
    const stage: Stage = watch.has(p.slug) ? 'floor' : p.tvl_usd >= snapshot.floor_usd ? 'early' : 'scout';
    const cat = factorFor(categories, p.category);
    const age = ageDays(snapshot.as_of, p.listed_at);
    const monthsExact = age === null ? MODEL.unknown_months : age / MODEL.days_per_month;
    const changeMissing = p.change_7d === null;
    const momInput = clamp(changeMissing ? 0 : p.change_7d!, -MODEL.momentum_cap, MODEL.momentum_cap) / 100;
    const seasoning = round4(10 ** (fit.age * Math.log10(1 + Math.max(0, monthsExact))));
    const momentum = round4(10 ** (fit.mom * momInput));
    const breadth = round4(1 + MODEL.chain_bump * Math.min(p.chains.length, MODEL.chain_cap));
    const parent = kinOf(p, parents);
    const kin = parent !== null;
    const kinFactor = kin ? MODEL.kin_factor : 1;
    const base = Math.max(1, Math.round(10 ** (fit.a + fit.b * Math.log10(Math.max(p.tvl_usd, 1)))));
    const implied = Math.max(1, Math.min(VALUE_CAP, Math.round(base * cat.factor * seasoning * momentum * breadth * kinFactor)));
    const widen = cat.n >= 8 ? 1 : cat.n >= 5 ? 1.15 : cat.n >= 1 ? 1.4 : 1.8;
    const low = Math.max(1, Math.min(implied, Math.round(implied * 10 ** (fit.q25 * widen))));
    const high = Math.min(VALUE_CAP, Math.max(implied, Math.round(implied * 10 ** (fit.q75 * widen))));
    const plan = farmPlan(p, age);
    const drop = Number((((implied * MODEL.airdrop_share) / Math.max(p.tvl_usd, 1)) * 1000).toFixed(2));
    const foregonePer1k = 1000 * MODEL.yield_foregone * (plan.hold_days / 365);
    const netPer1k = Number((drop - (plan.gas_total_usd * 1000) / plan.capital_usd - foregonePer1k).toFixed(2));
    return {
      p,
      stage,
      cat,
      age,
      months: round4(monthsExact),
      seasoning,
      momentum,
      breadth,
      kin,
      parent,
      kinFactor,
      base,
      implied,
      low,
      high,
      grade: gradeFor(cat.n, changeMissing, age === null),
      plan,
      drop,
      netPer1k,
      verdict: verdictFor(drop, plan.capital_usd, plan.gas_total_usd, plan.hold_days),
    };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  const board: BoardRow[] = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    mechanism: mechanismOf(s.p.category),
    chains: s.p.chains,
    chain: s.plan.chain,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.age,
    stage: s.stage,
    kin: s.kin,
    kin_of: s.parent,
    token_status: 'pre-token',
    implied_value_usd: s.implied,
    low_usd: s.low,
    high_usd: s.high,
    grade: s.grade,
    verdict: s.verdict,
      drop_per_1k: s.drop,
      net_per_1k: s.netPer1k,
      tx_count: s.plan.tx_count,
      capital_usd: s.plan.capital_usd,
    gas_usd: s.plan.gas_usd,
    gas_total_usd: s.plan.gas_total_usd,
    setup_min: s.plan.setup_min,
    hold_days: s.plan.hold_days,
    model: {
      base_usd: s.base,
      category_factor: s.cat.factor,
      peer_n: s.cat.n,
      shrunk: s.cat.shrunk,
      seasoning: s.seasoning,
      months: s.months,
      momentum: s.momentum,
      breadth: s.breadth,
      kin_factor: s.kinFactor,
      multiple: round4(s.implied / Math.max(s.p.tvl_usd, 1)),
    },
    farm_steps: s.plan.steps,
  }));

  const tokened: TokenRow[] = snapshot.protocols
    .filter((p) => hasToken(p))
    .map((p) => {
      const family = familyByMember.get(p.slug);
      return {
        slug: p.slug,
        name: p.name,
        symbol: p.symbol,
        category: p.category,
        chains: p.chains,
        chain: p.chains[0] ?? '',
        tvl_usd: p.tvl_usd,
        mcap_usd: p.mcap_usd,
        family: family?.id ?? p.slug,
        in_fit: family !== undefined && inFit.has(family.id) && p.mcap_usd !== null,
        siblings: family?.members.length ?? 1,
      };
    })
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));

  aside.sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  const multiples = board.map((r) => r.model.multiple).sort((a, b) => a - b);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    formula: FORMULA,
    constants: MODEL,
    fit,
    categories,
    tracked: snapshot.protocols.length,
    pre_token: snapshot.protocols.filter(recordsNoToken).length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    floor_size: board.filter((r) => r.stage === 'floor').length,
    early_size: board.filter((r) => r.stage === 'early').length,
    scout_size: board.filter((r) => r.stage === 'scout').length,
    kin_size: board.filter((r) => r.kin).length,
    tokened_size: tokened.length,
    aside_size: aside.length,
    tvl_on_board: board.reduce((s, r) => s + r.tvl_usd, 0),
    implied_sum: board.reduce((s, r) => s + r.implied_value_usd, 0),
    median_multiple: round4(median(multiples)),
    rows: board,
    tokened,
    aside,
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
    if (row.low_usd > row.implied_value_usd || row.high_usd < row.implied_value_usd) return `${row.slug} band does not contain the implied value`;
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
