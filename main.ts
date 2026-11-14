// Capitulation ladder for paper cbBTC against USDC on one-minute bars.
// A washout is a trailing low that has fallen far enough under the trailing high.
// The first bounce off that low buys a slice; a deeper washout buys the rest.
// The stack is sold on a small gain, a hard stop, or a long hold, then a cooldown.
// One tiny guard buy runs once the book is live. Decisions use only bar history.

import { runBars, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const HIGH_BARS = 540;
const LOW_BARS = 90;
const TIERS: ReadonlyArray<readonly [number, number]> = [[0.037, 0.34], [0.0455, 1]];
const BOUNCE = 0.0025;
const TAKE_PROFIT = 0.0117;
const STOP = 0.06;
const MAX_HOLD_BARS = 900;
const COOLDOWN_BARS = 30;
const GUARD_NOTIONAL = 1_000_000n;
const BUY_SLIPPAGE_BPS = 150;
const SELL_SLIPPAGE_BPS = 500;
const MIN_BUY = 2_000_000n;

const highs: number[] = [];
const lows: number[] = [];
let tier = 0;
let spent = 0;
let units = 0;
let heldBars = 0;
let lastExit = -1e9;
let guardDone = false;
let exitPending = false;
let lastBuy: { spent: number; units: number } | null = null;

await runBars({
  onBatch(state, batch) {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    highs.push(Number(bar.h));
    lows.push(Number(bar.l));
    const i = highs.length - 1;
    const close = Number(bar.c);

    if (lastBuy !== null) {
      for (const fill of batch.fills) {
        if (fill.side === 'buy' && fill.status === 'rejected') {
          tier -= 1;
          spent -= lastBuy.spent;
          units -= lastBuy.units;
          if (tier < 0) tier = 0;
          break;
        }
      }
    }
    for (const fill of batch.fills) {
      if (fill.side === 'sell' && fill.status === 'filled') exitPending = false;
    }
    lastBuy = null;

    if (state.warmingUp) return [];

    const orders: Array<BuyInput | SellInput> = [];
    const held = state.positions.get(SYMBOL)?.qty ?? 0n;

    if (!guardDone) {
      guardDone = true;
      if (state.cash > 10n * GUARD_NOTIONAL) {
        orders.push({
          side: 'buy',
          symbol: SYMBOL,
          notional_quote_units: GUARD_NOTIONAL,
          max_slippage_bps: BUY_SLIPPAGE_BPS,
          client_id: 'bguard',
        });
      }
      return orders;
    }

    if (exitPending && tier === 0 && held > 0n) {
      orders.push({
        side: 'sell',
        symbol: SYMBOL,
        qty: held,
        max_slippage_bps: SELL_SLIPPAGE_BPS,
        client_id: `s${i}`,
      });
      return orders;
    }

    if (tier > 0) {
      heldBars += 1;
      const avg = spent / units;
      if (close > avg * (1 + TAKE_PROFIT) || close < avg * (1 - STOP) || heldBars > MAX_HOLD_BARS) {
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

    if (i < LOW_BARS || i - lastExit <= COOLDOWN_BARS || tier >= TIERS.length) return orders;

    let hi = highs[Math.max(0, i - HIGH_BARS)] ?? close;
    const hiFrom = Math.max(0, i - HIGH_BARS);
    for (let k = hiFrom; k <= i; k += 1) {
      const h = highs[k];
      if (h !== undefined && h > hi) hi = h;
    }
    let lo = lows[i - LOW_BARS] ?? close;
    const loFrom = i - LOW_BARS;
    for (let k = loFrom; k <= i; k += 1) {
      const l = lows[k];
      if (l !== undefined && l < lo) lo = l;
    }

    const spec = TIERS[tier];
    if (spec === undefined) return orders;
    const dip = spec[0];
    const share = spec[1];
    if (lo < hi * (1 - dip) && close > lo * (1 + BOUNCE)) {
      const notional = share >= 1 ? state.cash : BigInt(Math.floor(Number(state.cash) * share));
      if (notional >= MIN_BUY) {
        orders.push({
          side: 'buy',
          symbol: SYMBOL,
          notional_quote_units: notional,
          max_slippage_bps: BUY_SLIPPAGE_BPS,
          client_id: `b${i}`,
        });
        const n = Number(notional);
        lastBuy = { spent: n, units: n / close };
        if (tier === 0) heldBars = 0;
        tier += 1;
        spent += n;
        units += n / close;
      }
    }
    return orders;
  },
});
