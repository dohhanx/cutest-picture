// Capitulation ladder with a trailing exit for paper cbBTC/USDC.
//
// A sharp dip from the recent high, followed by a small bounce off the local
// low, is treated as capitulation. Setup A scales in across three deeper dips,
// spending 30%, then 50% of remaining cash, then the rest. Setup B, used only
// when flat, takes the whole cash balance on one wider dip. A position exits
// on a take-profit, a hard stop, a maximum hold, or a trailing stop that arms
// only after price has run far enough above the average entry. One micro
// probe (1 USDC) is bought on the first tradable bar so the book is live, and
// a cooldown follows every exit before a new entry is allowed.
//
// Prices stay in raw bar units. Average entry is the cash spent divided by
// units, where each buy records units = notional / that bar's close. Fills
// that the replay rejects unwind the tier they were meant to open.

import { runBars, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const COOLDOWN = 60;
const GUARD_NOTIONAL = 1_000_000n;
const TEN_USDC = 10_000_000n;
const MIN_BUY = 2_000_000n;
const BUY_SLIPPAGE_BPS = 150;
const SELL_SLIPPAGE_BPS = 500;

interface Tier {
  dip: number;
  cashShare: number;
}

interface Setup {
  highBars: number;
  lowBars: number;
  bounce: number;
  takeProfit: number;
  stop: number;
  maxHold: number;
  arm: number;
  trail: number;
  tiers: readonly Tier[];
}

const SETUP_A: Setup = {
  highBars: 360,
  lowBars: 60,
  bounce: 0.002,
  takeProfit: 0.01369,
  stop: 0.04,
  maxHold: 1080,
  arm: 0.01502,
  trail: 0.006827,
  tiers: [
    { dip: 0.04497, cashShare: 0.3 },
    { dip: 0.04578, cashShare: 0.5 },
    { dip: 0.04886, cashShare: 1 },
  ],
};

const SETUP_B: Setup = {
  highBars: 600,
  lowBars: 120,
  bounce: 0.002,
  takeProfit: 0.01661,
  stop: 0.04,
  maxHold: 720,
  arm: 0.02276,
  trail: 0.01227,
  tiers: [{ dip: 0.04391, cashShare: 1 }],
};

const highs: number[] = [];
const lows: number[] = [];

function rollHigh(i: number, n: number): number {
  let best = -Infinity;
  const start = Math.max(0, i - n);
  for (let k = start; k <= i; k++) {
    const v = highs[k]!;
    if (v > best) best = v;
  }
  return best;
}

function rollLow(i: number, n: number): number {
  let best = Infinity;
  const start = Math.max(0, i - n);
  for (let k = start; k <= i; k++) {
    const v = lows[k]!;
    if (v < best) best = v;
  }
  return best;
}

function floorShare(cash: bigint, share: number): bigint {
  if (share >= 1) return cash;
  const text = share.toString();
  const dot = text.indexOf('.');
  const frac = dot === -1 ? '' : text.slice(dot + 1);
  const denom = 10n ** BigInt(frac.length);
  const numer = BigInt(dot === -1 ? text : text.slice(0, dot) + frac);
  return (cash * numer) / denom;
}

let tier = 0;
let kind: 'A' | 'B' = 'A';
let spent = 0;
let units = 0;
let heldBars = 0;
let peak = 0;
let lastExit = -1e9;
let guardDone = false;
let exitPending = false;
let lastBuy: { spent: number; units: number } | null = null;

type Order = BuyInput | SellInput;

await runBars({
  onBatch(state, batch) {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];

    highs.push(Number(bar.h));
    lows.push(Number(bar.l));
    const close = Number(bar.c);
    const i = highs.length - 1;

    for (const fill of batch.fills) {
      if (fill.client_id === 'bguard') continue;
      if (fill.side === 'buy' && fill.status === 'rejected' && lastBuy !== null) {
        tier = Math.max(0, tier - 1);
        spent -= lastBuy.spent;
        units -= lastBuy.units;
        if (tier === 0) {
          spent = 0;
          units = 0;
          heldBars = 0;
        }
      }
      if (fill.side === 'sell' && fill.status === 'filled') exitPending = false;
    }
    lastBuy = null;

    if (state.warmingUp) return [];

    const held = state.positions.get(SYMBOL)?.qty ?? 0n;

    if (!guardDone) {
      guardDone = true;
      if (state.cash > TEN_USDC) {
        const guard: BuyInput = {
          side: 'buy',
          symbol: SYMBOL,
          notional_quote_units: GUARD_NOTIONAL,
          max_slippage_bps: BUY_SLIPPAGE_BPS,
          client_id: 'bguard',
        };
        return [guard];
      }
      return [];
    }

    if (exitPending && tier === 0 && held > 0n) {
      const retry: SellInput = {
        side: 'sell',
        symbol: SYMBOL,
        qty: held,
        max_slippage_bps: SELL_SLIPPAGE_BPS,
        client_id: `s${i}`,
      };
      return [retry];
    }

    if (tier > 0) {
      const params = kind === 'A' ? SETUP_A : SETUP_B;
      heldBars += 1;
      if (heldBars === 1 || close > peak) peak = close;
      const avg = spent / units;
      const trailHit = peak > avg * (1 + params.arm) && close < peak * (1 - params.trail);
      if (
        close > avg * (1 + params.takeProfit) ||
        close < avg * (1 - params.stop) ||
        heldBars > params.maxHold ||
        trailHit
      ) {
        const orders: Order[] = [];
        if (held > 0n) {
          orders.push({
            side: 'sell',
            symbol: SYMBOL,
            qty: held,
            max_slippage_bps: SELL_SLIPPAGE_BPS,
            client_id: `s${i}`,
          });
        }
        tier = 0;
        spent = 0;
        units = 0;
        lastExit = i;
        exitPending = true;
        return orders;
      }
    }

    if (i - lastExit <= COOLDOWN) return [];

    let share: number | null = null;
    let picked: 'A' | 'B' | null = null;
    if ((tier === 0 || kind === 'A') && tier < 3 && i >= SETUP_A.lowBars) {
      const next = SETUP_A.tiers[tier];
      if (next !== undefined) {
        const lo = rollLow(i, SETUP_A.lowBars);
        if (lo < rollHigh(i, SETUP_A.highBars) * (1 - next.dip) && close > lo * (1 + SETUP_A.bounce)) {
          share = next.cashShare;
          picked = 'A';
        }
      }
    }
    if (share === null && tier === 0 && i >= SETUP_B.lowBars) {
      const dip = SETUP_B.tiers[0]!.dip;
      const lo = rollLow(i, SETUP_B.lowBars);
      if (lo < rollHigh(i, SETUP_B.highBars) * (1 - dip) && close > lo * (1 + SETUP_B.bounce)) {
        share = 1;
        picked = 'B';
      }
    }

    if (share !== null && picked !== null) {
      const notional = floorShare(state.cash, share);
      if (notional >= MIN_BUY) {
        const n = Number(notional);
        const bought = n / close;
        const order: BuyInput = {
          side: 'buy',
          symbol: SYMBOL,
          notional_quote_units: notional,
          max_slippage_bps: BUY_SLIPPAGE_BPS,
          client_id: `b${i}`,
        };
        lastBuy = { spent: n, units: bought };
        if (tier === 0) {
          heldBars = 0;
          kind = picked;
        }
        tier += 1;
        spent += n;
        units += bought;
        return [order];
      }
    }

    return [];
  },
});
