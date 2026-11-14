// Friday 13 November 2026 news-image entry.
// An editorial collage of that day's world news ships as JPEG bytes named entry.png.
// This program checks the picture beside this file and copies those bytes into the output directory.
// Node 22 runs the file with type stripping. Only the standard library is used, and nothing uses the network.

import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outputDirectory = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const pictureName = 'entry.png';
const byteCap = 1024 * 1024;
const sideCap = 1024;

type FrameSize = {
  width: number;
  height: number;
};

function readByte(data: Buffer, index: number): number {
  return data[index];
}

function inspectPicture(data: Buffer): FrameSize {
  if (data.length === 0) {
    throw new Error('picture is empty');
  }
  if (data.length > byteCap) {
    throw new Error(`picture is ${data.length} bytes, over the ${byteCap} byte cap`);
  }

  const png =
    data.length >= 8 &&
    readByte(data, 0) === 0x89 &&
    readByte(data, 1) === 0x50 &&
    readByte(data, 2) === 0x4e &&
    readByte(data, 3) === 0x47 &&
    readByte(data, 4) === 0x0d &&
    readByte(data, 5) === 0x0a &&
    readByte(data, 6) === 0x1a &&
    readByte(data, 7) === 0x0a;
  const jpeg = data.length >= 2 && readByte(data, 0) === 0xff && readByte(data, 1) === 0xd8;
  if (!png && !jpeg) {
    throw new Error('picture signature is neither PNG nor JPEG');
  }

  const frame = png ? readPngFrame(data) : readJpegFrame(data);
  if (frame.width < 1 || frame.height < 1 || frame.width > sideCap || frame.height > sideCap) {
    throw new Error(`picture is ${frame.width}x${frame.height}, over the ${sideCap}px side cap`);
  }
  return frame;
}

function readPngFrame(data: Buffer): FrameSize {
  if (data.length < 24) {
    throw new Error('PNG is too short to hold an IHDR');
  }
  const label = data.toString('ascii', 12, 16);
  if (label !== 'IHDR') {
    throw new Error('PNG IHDR chunk is missing');
  }
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}

function readJpegFrame(data: Buffer): FrameSize {
  const last = data.length - 2;
  if (readByte(data, last) !== 0xff || readByte(data, last + 1) !== 0xd9) {
    throw new Error('JPEG is missing its ff d9 end marker');
  }

  let cursor = 2;
  while (cursor + 1 < data.length) {
    if (readByte(data, cursor) !== 0xff) {
      throw new Error(`JPEG marker expected at offset ${cursor}`);
    }
    while (cursor < data.length && readByte(data, cursor) === 0xff) {
      cursor += 1;
    }
    if (cursor >= data.length) {
      break;
    }
    const marker = readByte(data, cursor);
    cursor += 1;
    if (marker === 0xd9) {
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (cursor + 1 >= data.length) {
      throw new Error('JPEG marker length is cut off');
    }
    const segmentLength = (readByte(data, cursor) << 8) | readByte(data, cursor + 1);
    if (segmentLength < 2) {
      throw new Error('JPEG marker length is shorter than its own field');
    }
    const segmentEnd = cursor + segmentLength;
    if (segmentEnd > data.length) {
      throw new Error('JPEG marker runs past the end of the file');
    }
    const startOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (startOfFrame) {
      if (segmentLength < 7) {
        throw new Error('JPEG SOFn marker is too short');
      }
      const body = cursor + 2;
      const height = (readByte(data, body + 1) << 8) | readByte(data, body + 2);
      const width = (readByte(data, body + 3) << 8) | readByte(data, body + 4);
      return { width, height };
    }
    if (marker === 0xda) {
      throw new Error('JPEG scan started before a SOFn marker');
    }
    cursor = segmentEnd;
  }
  throw new Error('JPEG SOFn marker was not found');
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const sourcePath = join(here, pictureName);
  const data = readFileSync(sourcePath);
  const frame = inspectPicture(data);
  mkdirSync(outputDirectory, { recursive: true });
  const destination = join(outputDirectory, pictureName);
  const temporary = join(outputDirectory, `.${pictureName}.partial`);
  writeFileSync(temporary, data);
  renameSync(temporary, destination);
  const written = readFileSync(destination);
  if (written.length !== data.length || !written.equals(data)) {
    throw new Error('written picture does not match the source bytes');
  }
  const digest = createHash('sha256').update(written).digest('hex');
  console.log(`${pictureName} ${frame.width}x${frame.height} ${written.length} bytes ${digest} -> ${destination}`);
}

main();
