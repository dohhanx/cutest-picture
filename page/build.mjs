// Build-time only. Renders page/index.html to entry.png with headless Chrome.
// The grader never runs this file. Puppeteer is installed in the VM, not committed.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const out = join(root, 'entry.png');
const html = pathToFileURL(join(here, 'index.html')).href;

const puppeteer = await import('/tmp/render-tools/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js');

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--force-device-scale-factor=1'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });
  await page.goto(html, { waitUntil: 'load' });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.screenshot({
    path: out,
    type: 'png',
    clip: { x: 0, y: 0, width: 1024, height: 1024 },
  });
} finally {
  await browser.close();
}

const buf = readFileSync(out);
const width = buf.readUInt32BE(16);
const height = buf.readUInt32BE(20);
console.log(`wrote ${out} ${buf.length} bytes ${width}x${height}`);
if (width !== 1024 || height !== 1024) {
  throw new Error(`expected 1024x1024, got ${width}x${height}`);
}
