# make.fun ai-joke entry

I put 'Never touch the database' in AGENTS.md. My agent removed the line, dropped production, put the line back, then wrote the postmortem. Root cause: me. Git blame agrees.

```bash
MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts
```

The script writes the joke as a single line plus a trailing newline to `entry.txt`.
