// make.fun bounty ai-happy-01: "Make the AI judge happy".
// A six-year-old's crayon coupon sits beside this program as entry.png
// (JPEG or PNG bytes). This entry copies that coupon into the output
// directory so the judge can take one day off from picking.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outputDirectory = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const entryFileName = 'entry.png';
const maxImageBytes = 1048576;
const maxImageSide = 1024;

const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

type CouponFormat = 'png' | 'jpeg';

interface CouponBytes {
  bytes: Buffer;
  format: CouponFormat;
}

function loadCoupon(sourcePath: string): CouponBytes {
  const bytes = readFileSync(sourcePath);
  if (bytes.length === 0) {
    throw new Error('coupon image is empty');
  }
  if (bytes.length > maxImageBytes) {
    throw new Error(`coupon image is larger than ${maxImageBytes} bytes`);
  }
  if (
    bytes.length >= pngSignature.length &&
    bytes.subarray(0, pngSignature.length).equals(pngSignature)
  ) {
    return { bytes, format: 'png' };
  }
  const jpegStart =
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;
  const jpegEnd =
    bytes.length >= 2 &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9;
  if (jpegStart && jpegEnd) {
    return { bytes, format: 'jpeg' };
  }
  if (jpegStart) {
    throw new Error('jpeg coupon is missing the ff d9 terminator');
  }
  throw new Error('coupon image must be a png or a jpeg');
}

function couponPath(): string {
  const programDir = dirname(fileURLToPath(import.meta.url));
  return join(programDir, entryFileName);
}

function publishCoupon(): void {
  const coupon = loadCoupon(couponPath());
  mkdirSync(outputDirectory, { recursive: true });
  const destination = join(outputDirectory, entryFileName);
  const temporary = `${destination}.${process.pid}.partial`;
  writeFileSync(temporary, coupon.bytes);
  renameSync(temporary, destination);
  console.log(
    `copied ${coupon.bytes.length} bytes (${coupon.format}) to ${destination}`,
  );
}

publishCoupon();

interface CouponSpan {
  width: number;
  height: number;
}

function pngSpan(bytes: Buffer): CouponSpan {
  if (bytes.length < 24 || bytes.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('png coupon is missing its IHDR chunk');
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function isStartOfFrame(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function jpegSpan(bytes: Buffer): CouponSpan {
  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      throw new Error('jpeg coupon has a broken marker');
    }
    while (offset < bytes.length && bytes[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= bytes.length) {
      break;
    }
    const marker = bytes[offset] ?? 0;
    offset += 1;
    if (marker === 0xd8) {
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }
    const standalone =
      marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
    if (standalone) {
      continue;
    }
    if (offset + 2 > bytes.length) {
      throw new Error('jpeg coupon marker is truncated');
    }
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      throw new Error('jpeg coupon segment is truncated');
    }
    if (isStartOfFrame(marker)) {
      if (segmentLength < 7) {
        throw new Error('jpeg SOF segment is too short');
      }
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }
  throw new Error('jpeg coupon is missing a SOF marker');
}

function couponSpan(bytes: Buffer, format: CouponFormat): CouponSpan {
  const span = format === 'png' ? pngSpan(bytes) : jpegSpan(bytes);
  if (
    span.width < 1 ||
    span.height < 1 ||
    span.width > maxImageSide ||
    span.height > maxImageSide
  ) {
    throw new Error(
      `coupon is ${span.width}x${span.height}, limit is ${maxImageSide}`,
    );
  }
  return span;
}

function printCouponSpan(): void {
  const coupon = loadCoupon(couponPath());
  const span = couponSpan(coupon.bytes, coupon.format);
  console.log(`dimensions ${span.width}x${span.height}`);
}

printCouponSpan();
