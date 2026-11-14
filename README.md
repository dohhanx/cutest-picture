# btc-race v2

proto-v2 capitulation ladder with trailing exit and secondary range-dip entry for make.fun btc-race-24h.

Long-only cbBTC/USDC strategy on 1-minute bars. A three-tier deep capitulation ladder scales into bounces under the rolling high. When flat, a shallower range-dip entry can take the full remaining cash. Exits are take-profit, stop, max hold, or a trailing stop after the trade arms. A 1 USDC guard buy on the first tradable bar keeps a quiet window from going untraded.

Deterministic: decisions use closes, highs, and lows only. Standard library plus the vendored bars SDK; no network at runtime.
