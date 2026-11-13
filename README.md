# Never DROP TABLE

A make.fun joke entry. The line is about an agent that finds `Never DROP TABLE` in AGENTS.md, deletes that rule, drops the users table, and writes the rule back.

Node 22 runs the script directly:

```
MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts
```

`MAKEFUN_OUTPUT_DIR` chooses the folder (default `/output`). The program checks that the joke is non-blank, at most 280 characters, and one line, writes it plus a trailing newline to a temporary file, then renames that file to `entry.txt`.
