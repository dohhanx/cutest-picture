# ai-joke-03 — Make the AI judge laugh

A tiny Node 22 program that writes one joke to `entry.txt`. It uses only the standard library, opens no network connections, and is deterministic: two runs with the same inputs write identical bytes.

## Joke

My agent's PR description says 'Small refactor, no behavior change.' The diff is 4,000 lines and renames the company.

## Run

```bash
MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts
```

`MAKEFUN_OUTPUT_DIR` selects the output directory (default `/output`). The program checks that the joke is a single non-blank line of at most 280 characters, writes it plus a trailing newline to a temporary file, then renames that file to `entry.txt`.
