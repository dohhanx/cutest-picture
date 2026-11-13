// Snow Hug ships a finished JPEG. This program only checks it and copies the bytes.
// Node 22 executes the file with type stripping. Nothing outside the standard library is used.

import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(scriptDir, 'art', 'snow-hug.jpg');
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const outputName = 'entry.png';
const maxBytes = 1048576;
const maxEdge = 1024;

function readPicture(): Buffer {
  return readFileSync(sourcePath);
}

function markerAt(bytes: Buffer, index: number): number {
  return bytes[index];
}

function inspectJpeg(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 4) {
    throw new Error('picture is too small to be a JPEG');
  }
  if (bytes.length > maxBytes) {
    throw new Error(`picture is ${bytes.length} bytes, above ${maxBytes}`);
  }
  if (markerAt(bytes, 0) !== 0xff || markerAt(bytes, 1) !== 0xd8) {
    throw new Error('JPEG start marker FFD8 is missing');
  }
  const tail = bytes.length - 2;
  if (markerAt(bytes, tail) !== 0xff || markerAt(bytes, tail + 1) !== 0xd9) {
    throw new Error('JPEG end marker FFD9 is missing');
  }

  let cursor = 2;
  let frameWidth = 0;
  let frameHeight = 0;
  let foundFrame = false;

  while (cursor + 1 < bytes.length) {
    if (markerAt(bytes, cursor) !== 0xff) {
      throw new Error(`expected a marker at offset ${cursor}`);
    }
    while (cursor < bytes.length && markerAt(bytes, cursor) === 0xff) cursor += 1;
    if (cursor >= bytes.length) break;
    const kind = markerAt(bytes, cursor);
    cursor += 1;
    if (kind === 0xd9) break;
    if (kind === 0x01 || (kind >= 0xd0 && kind <= 0xd7)) continue;
    if (cursor + 1 >= bytes.length) throw new Error('marker length is cut off');
    const segmentLength = (markerAt(bytes, cursor) << 8) | markerAt(bytes, cursor + 1);
    if (segmentLength < 2) throw new Error('marker length is shorter than itself');
    const segmentEnd = cursor + segmentLength;
    if (segmentEnd > bytes.length) throw new Error('marker runs past the end of the file');
    if (kind === 0xc0 || kind === 0xc2) {
      if (segmentLength < 7) throw new Error('frame header is too short');
      const body = cursor + 2;
      frameHeight = (markerAt(bytes, body + 1) << 8) | markerAt(bytes, body + 2);
      frameWidth = (markerAt(bytes, body + 3) << 8) | markerAt(bytes, body + 4);
      foundFrame = true;
    }
    if (kind === 0xda) break;
    cursor = segmentEnd;
  }

  if (!foundFrame) throw new Error('no SOF0 or SOF2 frame header was found');
  if (frameWidth < 1 || frameHeight < 1 || frameWidth > maxEdge || frameHeight > maxEdge) {
    throw new Error(`frame is ${frameWidth}x${frameHeight}, limit is ${maxEdge}`);
  }
  return { width: frameWidth, height: frameHeight };
}

function publish(): void {
  const bytes = readPicture();
  const frame = inspectJpeg(bytes);
  mkdirSync(outputDir, { recursive: true });
  const finalPath = join(outputDir, outputName);
  const tempPath = join(outputDir, `${outputName}.writing`);
  writeFileSync(tempPath, bytes);
  renameSync(tempPath, finalPath);
  console.log(`${outputName} ${frame.width}x${frame.height} ${bytes.length} bytes`);
}

publish();
