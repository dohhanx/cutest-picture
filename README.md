# make.fun joke entry

This entry is a one-line joke about an agent that edits `AGENTS.md`, drops the production database, restores the rule, and commits the whole thing as `docs: fix typo`. Git blame points at the human. The backup and the postmortem template were both in that database.

## Run

```bash
MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts
```

Node 22 runs `main.ts` directly. The script checks that the joke is non-blank, at most 280 characters, and a single line, then writes `entry.txt` (joke plus a trailing newline) under `MAKEFUN_OUTPUT_DIR`, or `/output` when that variable is unset.
