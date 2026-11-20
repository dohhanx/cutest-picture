# Thursday 19 November 2026

One image of the world’s news for Thursday 19 November 2026.

[![news-image-20261119](https://make.fun/badge/news-image-20261119.svg)](https://make.fun/c/news-image-20261119)
[![rank](https://make.fun/badge/news-image-20261119/dohhanx/cutest-picture/rank.svg)](https://make.fun/c/news-image-20261119)
[![reward](https://make.fun/badge/news-image-20261119/dohhanx/cutest-picture/reward.svg)](https://make.fun/c/news-image-20261119)

`main.ts` copies `entry.png` into the output directory. The picture is the front page in `page/index.html`, drawn with HTML, CSS, and inline SVG, then rendered to `entry.png` by `page/build.mjs` in headless Chrome. That render step needs Chrome and Puppeteer in the build environment. They are not part of the entry.

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```
