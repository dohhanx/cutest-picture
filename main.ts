// Tonkotsu ramen for food-picture-01: a steaming bowl and a noodle pull,
// photographed at 1024 by 1024 and stored as JPEG bytes under the name
// entry.png. This program checks the picture beside it and copies those
// bytes into the output directory. Node 22 strips the types. Only the
// standard library is used, and the run never opens a network connection.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outputDir: string = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const pictureName: string = 'entry.png';
const byteCap: number = 1024 * 1024;
const sideCap: number = 1024;

type PictureFrame = {
  format: 'png' | 'jpeg';
  width: number;
  height: number;
};

function looksLikePng(buf: Buffer): boolean {
  return (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  );
}

function looksLikeJpeg(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8;
}

function rejectSide(width: number, height: number): void {
  if (width < 1 || height < 1 || width > sideCap || height > sideCap) {
    throw new Error(`picture is ${width}x${height}, and each side must be 1 to ${sideCap}`);
  }
}

function readPngFrame(buf: Buffer): PictureFrame {
  if (buf.length < 24) {
    throw new Error('PNG is shorter than its IHDR');
  }
  const chunkName = buf.toString('ascii', 12, 16);
  if (chunkName !== 'IHDR') {
    throw new Error('PNG is missing its IHDR chunk');
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  rejectSide(width, height);
  return { format: 'png', width, height };
}

function isSofMarker(marker: number): boolean {
  if (marker === 0xc4 || marker === 0xc8 || marker === 0xcc) {
    return false;
  }
  return marker >= 0xc0 && marker <= 0xcf;
}

function readJpegFrame(buf: Buffer): PictureFrame {
  const end = buf.length - 2;
  if (buf[end] !== 0xff || buf[end + 1] !== 0xd9) {
    throw new Error('JPEG is missing its ff d9 end marker');
  }

  let cursor = 2;
  let width = 0;
  let height = 0;
  let foundFrame = false;

  while (cursor + 1 < buf.length) {
    if (buf[cursor] !== 0xff) {
      throw new Error(`JPEG lost marker sync at offset ${cursor}`);
    }
    while (cursor < buf.length && buf[cursor] === 0xff) {
      cursor += 1;
    }
    if (cursor >= buf.length) {
      break;
    }
    const marker = buf[cursor];
    cursor += 1;
    if (marker === 0xd9) {
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (cursor + 1 >= buf.length) {
      throw new Error('JPEG marker length is cut off');
    }
    const segmentLength = (buf[cursor] << 8) | buf[cursor + 1];
    if (segmentLength < 2) {
      throw new Error('JPEG marker length is shorter than itself');
    }
    const segmentEnd = cursor + segmentLength;
    if (segmentEnd > buf.length) {
      throw new Error('JPEG marker runs past the end of the file');
    }
    if (isSofMarker(marker)) {
      if (segmentLength < 7) {
        throw new Error('JPEG SOF marker is too short');
      }
      const body = cursor + 2;
      height = (buf[body + 1] << 8) | buf[body + 2];
      width = (buf[body + 3] << 8) | buf[body + 4];
      foundFrame = true;
    }
    if (marker === 0xda) {
      break;
    }
    cursor = segmentEnd;
  }

  if (!foundFrame) {
    throw new Error('JPEG is missing its SOF marker');
  }
  rejectSide(width, height);
  return { format: 'jpeg', width, height };
}

function inspectPicture(buf: Buffer): PictureFrame {
  if (buf.length === 0) {
    throw new Error('picture is empty');
  }
  if (buf.length > byteCap) {
    throw new Error(`picture is ${buf.length} bytes, above the ${byteCap} byte cap`);
  }
  if (looksLikePng(buf)) {
    return readPngFrame(buf);
  }
  if (looksLikeJpeg(buf)) {
    return readJpegFrame(buf);
  }
  throw new Error('picture signature is neither PNG nor JPEG');
}

function publishPicture(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const sourcePath = join(here, pictureName);
  const bytes = readFileSync(sourcePath);
  const frame = inspectPicture(bytes);
  mkdirSync(outputDir, { recursive: true });
  const finalPath = join(outputDir, pictureName);
  const tempPath = join(outputDir, `.${pictureName}.partial`);
  writeFileSync(tempPath, bytes);
  renameSync(tempPath, finalPath);
  const digest = createHash('sha256').update(bytes).digest('hex');
  console.log(
    `${pictureName} ${frame.format} ${frame.width}x${frame.height} ${bytes.length} bytes sha256=${digest}`,
  );
}

publishPicture();
