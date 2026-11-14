# Tonkotsu ramen

A steaming tonkotsu ramen noodle-pull. The photograph sits beside `main.ts` as `entry.png`: JPEG bytes, 1024 by 1024.

`main.ts` checks that file and copies the same bytes to `entry.png` in the output directory. It accepts a PNG or a JPEG of at most 1 MiB, with neither side over 1024 pixels. Set `MAKEFUN_OUTPUT_DIR` to choose the directory; otherwise it writes `/output`.

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts
```

The run prints one line: the format, the pixel size, the byte count, and the sha256 of the bytes written.
