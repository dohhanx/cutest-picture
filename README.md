# Last Flight

A make.fun poem entry. `main.ts` runs on Node 22 and uses only the standard library. It writes the poem, UTF-8, to `entry.txt`.

`MAKEFUN_OUTPUT_DIR` chooses the directory. When it is unset, the file goes to `/output`. The directory is created first.

The poem is an array of lines joined with newlines, plus a trailing newline. The program counts Unicode code points, throws if that count is over 1000, and prints the count to stdout.

```bash
mkdir -p /tmp/out
MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts
```
