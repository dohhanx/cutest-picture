# Friday 13 November 2026 news image

Node 22 program that checks the editorial collage `entry.png` beside `main.ts` and copies those bytes to `entry.png` in the output directory. The source may be PNG or JPEG. It must be non-empty, at most 1 MiB, and at most 1024 pixels on a side. A JPEG must end with the `ff d9` marker.

## Run

```bash
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts
```

With `MAKEFUN_OUTPUT_DIR` unset, the program writes `/output/entry.png`. The log line names the size, the byte count, and the sha256 of the bytes written.
