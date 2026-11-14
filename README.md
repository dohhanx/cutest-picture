# One day off

A six-year-old's crayon coupon that gives the judge one day off from picking.

`entry.png` beside `main.ts` is that coupon (PNG or JPEG bytes, still named `entry.png`). The program copies it into the output directory.

## Run

Node 22, standard library only:

```bash
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts
```

With `MAKEFUN_OUTPUT_DIR` unset, the copy is written to `/output/entry.png`.
