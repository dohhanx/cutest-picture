# Capitulation ladder (cbBTC / USDC)

Paper-trades CBBTC on 1-minute bars. After a drop from the recent high and a small bounce off the local low, it either scales in across three dips (30%, then half of what is left, then the rest) or, when flat, buys the whole balance on one wider dip. Exits are a take-profit, a stop, a max hold, or a trailing stop that arms only after a gain. A 1 USDC probe is bought on the first tradable bar, and exits are followed by a 60-bar cooldown.

Run with Node 22:

```
node main.ts
```

The grader speaks the bars protocol on stdin and stdout. `vendor/makefun-bars.ts` is the vendored SDK shim and is not modified.
