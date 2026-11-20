import { copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const image = new URL('./entry.png', import.meta.url);
const bytes = readFileSync(image);

const signature = bytes.subarray(0, 8).toString('hex');
if (signature !== '89504e470d0a1a0a') {
  throw new Error('entry.png is not a PNG');
}

const width = bytes.readUInt32BE(16);
const height = bytes.readUInt32BE(20);
if (width > 1024 || height > 1024 || bytes.length > 1048576) {
  throw new Error(`entry.png is ${width}x${height} and ${bytes.length} bytes`);
}

copyFileSync(image, join(outputDir, 'entry.png'));
