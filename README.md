# NVIDIA CEO forecast (v2)

Deterministic quantile fan for a Polymarket YES series. The last price is now. Each price falls in a bucket that scales volatility and sets a level drift. A pull term uses the sum of last prices on the board (1 when that sum is not above 0.3) and mean reversion toward the 240-minute and 1440-minute averages. The median eases away from the last price along that drift with time constant `tauR`. The 0.25 and 0.75 bands widen with `h^pIn`; the 0.05 and 0.95 bands widen with `h^pOut`. Each horizon row passes through `clamp01`, is forced nondecreasing, and is rounded to 6 decimals.

## Run

Node 22, standard library only, no network:

```sh
MAKEFUN_INPUT_DIR=/input MAKEFUN_OUTPUT_DIR=/output node main.ts
```

`MAKEFUN_INPUT_DIR` defaults to `/input` and `MAKEFUN_OUTPUT_DIR` to `/output`. Every `*.in` JSON is read in sorted filename order. A file carries `horizon_minutes`, `quantiles` (`[0.05, 0.25, 0.5, 0.75, 0.95]`), and `markets` (`id`, 1-minute `prices`). The program writes `<id>.out` as `{"forecasts":[{"id","q":[...]}]}` plus a trailing newline. It throws if a market has no prices or the quantile list does not match.
