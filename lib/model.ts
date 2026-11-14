// Implied value for protocols that record no token.
//
// Traded tokens in this snapshot are grouped into families (Aave V2 and V3 share one
// market cap; TVL is summed). A log-log line is fit to those families:
//   log10(mcap) = a + b · log10(TVL)    so    value = 10^a × TVL^b
// with b below 1, so the multiple falls as TVL grows. Category residuals shrink
// toward the line when a category has fewer than five families. Seasoning, 7-day
// momentum, chain breadth and a kin penalty then scale the curve. CEX, bridge and
// liquid-staking rows are not launches and are not fit points. No name is special-cased.

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

export const MODEL_VERSION = 'northline-2';

export const MODEL = {
  peer_min: 5,
  airdrop_share: 0.05,
  momentum_weight: 0.5,
  momentum_cap: 40,
  chain_bump: 0.03,
  chain_cap: 10,
  season_floor: 0.85,
  season_span: 0.3,
  season_months: 36,
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
  'value = 10^a × TVL^b × category × seasoning × momentum × breadth × kin. ' +
  'a and b are the log-log fit of family market cap on family TVL for traded tokens that are not exchanges, bridges or liquid staking. ' +
  'Versions that share a symbol or a CoinGecko id are one family, and their TVL is summed so the market cap is not counted twice. ' +
  'The category factor is 10 to the median log residual of that category, shrunk as (n/5) toward 1 when fewer than five families are in the fit. ' +
  'seasoning = 0.85 + 0.30 × min(months, 36) / 36, months = age_days / 30.4375, unknown listing = 12. ' +
  'momentum = 1 + 0.5 × clamp(change_7d, −40, 40) / 100, missing change = 1. ' +
  'breadth = 1 + 3% × min(chains, 10). ' +
  'kin = 0.5 when the protocol\'s first word is the first word of a protocol that already records a token, else 1. ' +
  'The low/high band is the fit\'s residual interquartile range, widened when the category is thin.';

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
  in_fit: boolean;
}

export interface CategoryFit {
  category: string;
  n: number;
  factor: number;
  shrunk: boolean;
  peers: { name: string; tvl: number; mcap: number }[];
}

export interface CurveFit {
  n: number;
  a: number;
  b: number;
  r2: number;
  rmse: number;
  q25: number;
  q75: number;
  loo_median_ape: number;
  holdout_n: number;
  holdout_median_ape: number;
  points: FitPoint[];
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

function curveOf(protocols: SnapshotProtocol[]): { fit: CurveFit; categories: CategoryFit[]; inFit: Set<string> } {
  const families = buildFamilies(protocols).filter((f) => f.mcap > 0 && f.tvl > 0);
  const usable = (f: Family): boolean => f.primary.category === null || !EXCLUDED.has(f.primary.category);
  const fitFamilies = families.filter(usable);
  const held = families.filter((f) => !usable(f));
  const line = ols(fitFamilies.map((f) => ({ tvl: f.tvl, mcap: f.mcap })));
  const a = round6(line.a);
  const b = round6(line.b);
  const predict = (tvl: number): number => 10 ** (a + b * Math.log10(tvl));

  const looErrors: number[] = [];
  for (let i = 0; i < fitFamilies.length; i++) {
    const sample = fitFamilies.filter((_, j) => j !== i).map((f) => ({ tvl: f.tvl, mcap: f.mcap }));
    const left = ols(sample);
    const hat = 10 ** (round6(left.a) + round6(left.b) * Math.log10(fitFamilies[i]!.tvl));
    looErrors.push(Math.abs(hat - fitFamilies[i]!.mcap) / fitFamilies[i]!.mcap);
  }
  const holdoutErrors = held.map((f) => Math.abs(predict(f.tvl) - f.mcap) / f.mcap);

  const byCategory = new Map<string, { resid: number; name: string; tvl: number; mcap: number }[]>();
  for (const f of fitFamilies) {
    const category = f.primary.category ?? 'Uncategorized';
    const resid = Math.log10(f.mcap) - (a + b * Math.log10(f.tvl));
    const list = byCategory.get(category);
    const peer = { resid, name: f.primary.name, tvl: f.tvl, mcap: f.mcap };
    if (list === undefined) byCategory.set(category, [peer]);
    else list.push(peer);
  }
  const categories: CategoryFit[] = [];
  for (const category of [...byCategory.keys()].sort()) {
    const peers = byCategory.get(category)!;
    const residuals = peers.map((p) => p.resid).sort((p, q) => p - q);
    const n = residuals.length;
    const mid = median(residuals);
    const shrunk = n < MODEL.peer_min;
    const logFactor = shrunk ? (n / MODEL.peer_min) * mid : mid;
    categories.push({
      category,
      n,
      factor: round4(10 ** logFactor),
      shrunk,
      peers: peers
        .slice()
        .sort((p, q) => q.mcap - p.mcap || (p.name < q.name ? -1 : 1))
        .map((p) => ({ name: p.name, tvl: p.tvl, mcap: p.mcap })),
    });
  }

  const inFit = new Set(fitFamilies.map((f) => f.id));
  const points: FitPoint[] = families.map((f) => ({
    name: f.members.length > 1 ? `${f.primary.name} +${f.members.length - 1}` : f.primary.name,
    category: f.primary.category,
    tvl: f.tvl,
    mcap: f.mcap,
    in_fit: inFit.has(f.id),
  }));
  points.sort((p, q) => p.tvl - q.tvl || (p.name < q.name ? -1 : 1));

  return {
    fit: {
      n: line.n,
      a,
      b,
      r2: round4(line.r2),
      rmse: round4(line.rmse),
      q25: round4(line.q25),
      q75: round4(line.q75),
      loo_median_ape: round4(medianAbsPct(looErrors)),
      holdout_n: held.length,
      holdout_median_ape: held.length === 0 ? 0 : round4(medianAbsPct(holdoutErrors)),
      points,
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

/** Net airdrop per $1,000 of ticket after the plan's gas, also scaled per $1,000. */
export function verdictFor(dropPer1k: number, capital: number, gasTotal: number): Verdict {
  const netPer1k = dropPer1k - (gasTotal * 1000) / Math.max(capital, 1);
  if (netPer1k >= 6) return 'worth';
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
  const { fit, categories, inFit } = curveOf(snapshot.protocols);
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
    const seasoned = clamp(monthsExact, 0, MODEL.season_months);
    const seasoning = round4(MODEL.season_floor + MODEL.season_span * (seasoned / MODEL.season_months));
    const changeMissing = p.change_7d === null;
    const momentum = round4(1 + MODEL.momentum_weight * (clamp(changeMissing ? 0 : p.change_7d!, -MODEL.momentum_cap, MODEL.momentum_cap) / 100));
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
      verdict: verdictFor(drop, plan.capital_usd, plan.gas_total_usd),
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
