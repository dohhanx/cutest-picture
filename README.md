# Capitulation ladder

Paper bot for the cbBTC/USDC one-minute race. After the trailing low washes out under the trailing high and price bounces a little, it buys a first slice, then the rest of the cash if the dip deepens. It sells the stack on a small gain, a hard stop, or a long hold, then waits out a short cooldown.

Runtime is `node main.ts` against the bars-replay harness (`agent-fun/bars-replay/v1` on stdin and stdout).
