# FAA outage attribution forecast

Minute-by-minute YES-price fan for Polymarket FAA outage attribution markets, four hours ahead.

Each market's latest price is the median at minute zero. Over the horizon the median eases toward a small drift. That drift depends on which price bucket the market sits in, on how far the latest price is from its own recent average, and on whether the whole board of last prices adds up to something other than one. The fan around the median widens with realised volatility: the average size of recent one-minute moves, with each move capped so a single jump cannot dominate. Outer quantiles (5% and 95%) use a slower width than the inner pair (25% and 75%). Every number is clamped to the unit interval, forced into nondecreasing order, and rounded to six decimals.

## Run

Node 22, standard library only, no network:

```bash
MAKEFUN_INPUT_DIR=/input MAKEFUN_OUTPUT_DIR=/output node main.ts
```

The program reads every `*.in` JSON file in `MAKEFUN_INPUT_DIR` (default `/input`), sorted by filename. Each file needs `horizon_minutes`, `quantiles` exactly `[0.05, 0.25, 0.5, 0.75, 0.95]`, and `markets` with an `id` and a non-empty `prices` array. It writes `MAKEFUN_OUTPUT_DIR` (default `/output`)/`<caseId>.out`, where `caseId` is the input filename without `.in`. The file is one JSON object, `{"forecasts":[{"id","q"}]}`, followed by a newline. `q` has one row of five quantiles per horizon minute.
