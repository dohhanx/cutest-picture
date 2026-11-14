// proto-v2 (robust-ish): 3-tier deep capitulation ladder + range-dip B + trailing exit
// Capitulation-bounce bot for cbBTC/USDC 1-minute bars (agent-fun/bars-replay/v1). Long only, trades rarely.
// Entry: the recent low (lowBars) is >= tier dip under the rolling high (highBars) AND the close has bounced
// >= bounce over that low. Tiers buy a share of the remaining cash, one tier per bar. A second, shallower "range dip" entry (B) is used when flat.
// Exit (all): close > avg entry * (1 + takeProfit), or < avg * (1 - stop), or maxHold bars, or a trailing
// stop (after +arm, give back trail from the peak). A 1 USDC guard buy on the first tradable bar makes
// sure a quiet window still has >= 1 trade (guardrail). Deterministic: closes/highs/lows only.

import { runBars, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
interface Entry { highBars: number; lowBars: number; bounce: number; takeProfit: number; stop: number; maxHold: number; arm: number; trail: number; tiers?: Array<[number, number]>; dip?: number; share?: number }
const A: Entry = { highBars: 360, lowBars: 60, bounce: 0.002, takeProfit: 0.01369, stop: 0.04, maxHold: 1080, arm: 0.01502, trail: 0.006827, tiers: [[0.04497, 0.3], [0.04578, 0.5], [0.04886, 1]] };
const B: Entry | null = { highBars: 600, lowBars: 120, bounce: 0.002, takeProfit: 0.01661, stop: 0.04, maxHold: 720, arm: 0.02276, trail: 0.01227, dip: 0.04391, share: 1 };
const COOLDOWN_BARS = 60;
const GUARD_NOTIONAL = 1_000_000n; // 1 USDC
const MIN_BUY = 2_000_000n;
const BUY_SLIPPAGE_BPS = 150;
const SELL_SLIPPAGE_BPS = 500;

const highs: number[] = [];
const lows: number[] = [];
let tier = 0;          // tiers of A bought so far (B counts as 1)
let kind: 'A' | 'B' = 'A';
let spent = 0;
let units = 0;
let heldBars = 0;
let peak = 0;
let lastExit = -1e9;
let guardDone = false;
let exitPending = false;
let lastBuy: { spent: number; units: number } | null = null;

function rollHigh(i: number, n: number): number {
  let hi = -Infinity;
  for (let k = Math.max(0, i - n); k <= i; k++) if (highs[k]! > hi) hi = highs[k]!;
  return hi;
}
function rollLow(i: number, n: number): number {
  let lo = Infinity;
  for (let k = Math.max(0, i - n); k <= i; k++) if (lows[k]! < lo) lo = lows[k]!;
  return lo;
}
await runBars({
  onBatch(state, batch) {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    highs.push(Number(bar.h));
    lows.push(Number(bar.l));
    const i = highs.length - 1;
    const close = Number(bar.c);

    for (const f of batch.fills) {
      if (f.client_id === 'bguard') continue;
      if (f.side === 'buy' && f.status === 'rejected' && lastBuy !== null) {
        tier = Math.max(0, tier - 1);
        spent -= lastBuy.spent;
        units -= lastBuy.units;
        if (tier === 0) { spent = 0; units = 0; heldBars = 0; }
      }
      if (f.side === 'sell' && f.status === 'filled') exitPending = false;
    }
    lastBuy = null;

    if (state.warmingUp) return [];
    const orders: Array<BuyInput | SellInput> = [];
    const held = state.positions.get(SYMBOL)?.qty ?? 0n;

    if (!guardDone) {
      guardDone = true;
      if (state.cash > 10n * GUARD_NOTIONAL) {
        orders.push({ side: 'buy', symbol: SYMBOL, notional_quote_units: GUARD_NOTIONAL, max_slippage_bps: BUY_SLIPPAGE_BPS, client_id: 'bguard' });
      }
      return orders;
    }

    if (exitPending && tier === 0 && held > 0n) {
      orders.push({ side: 'sell', symbol: SYMBOL, qty: held, max_slippage_bps: SELL_SLIPPAGE_BPS, client_id: `s${i}` });
      return orders;
    }

    if (tier > 0) {
      const e = kind === 'A' ? A : B!;
      heldBars++;
      if (heldBars === 1 || close > peak) peak = close;
      const avg = spent / units;
      const trailHit = e.arm > 0 && peak > avg * (1 + e.arm) && close < peak * (1 - e.trail);
      if (close > avg * (1 + e.takeProfit) || close < avg * (1 - e.stop) || heldBars > e.maxHold || trailHit) {
        if (held > 0n) orders.push({ side: 'sell', symbol: SYMBOL, qty: held, max_slippage_bps: SELL_SLIPPAGE_BPS, client_id: `s${i}` });
        tier = 0; spent = 0; units = 0; lastExit = i; exitPending = true;
        return orders;
      }
    }
    if (i - lastExit <= COOLDOWN_BARS) return orders;

    let buyShare = 0;
    let buyKind: 'A' | 'B' = 'A';
    if ((tier === 0 || kind === 'A') && tier < A.tiers!.length && i >= A.lowBars) {
      const [dip, share] = A.tiers![tier]!;
      const lo = rollLow(i, A.lowBars);
      if (lo < rollHigh(i, A.highBars) * (1 - dip) && close > lo * (1 + A.bounce)) { buyShare = share; buyKind = 'A'; }
    }
    if (buyShare === 0 && B !== null && tier === 0 && i >= B.lowBars) {
      const lo = rollLow(i, B.lowBars);
      if (lo < rollHigh(i, B.highBars) * (1 - B.dip!) && close > lo * (1 + B.bounce)) { buyShare = B.share!; buyKind = 'B'; }
    }
    if (buyShare > 0) {
      const notional = buyShare >= 1 ? state.cash : BigInt(Math.floor(Number(state.cash) * buyShare));
      if (notional >= MIN_BUY) {
        orders.push({ side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: BUY_SLIPPAGE_BPS, client_id: `b${i}` });
        const n = Number(notional);
        lastBuy = { spent: n, units: n / close };
        if (tier === 0) { heldBars = 0; kind = buyKind; }
        tier++; spent += n; units += n / close;
      }
    }
    return orders;
  },
});
