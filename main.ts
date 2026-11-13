// Deterministic chibi painting for cutest-picture-01.
// Node 22, standard library only. Both runs write identical bytes to entry.png.
//
// Outside the grader: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const W = 1024;
const H = 1024;
const LIMIT = 1048576;

const HEAD_X = 512;
const HEAD_Y = 470;
const HEAD_R = 198;
const TILT = -0.14;
const CT = Math.cos(TILT);
const ST = Math.sin(TILT);

const BODY_X = 512;
const BODY_Y = 708;
const BODY_RX = 218;
const BODY_RY = 158;

const FUR_R = 255;
const FUR_G = 248;
const FUR_B = 242;

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(rgb: Uint8Array, filter: number): Buffer {
  const stride = W * 3;
  const raw = Buffer.alloc((stride + 1) * H);
  const prev = Buffer.alloc(stride);
  for (let y = 0; y < H; y++) {
    const src = y * stride;
    const dst = y * (stride + 1);
    raw[dst] = filter;
    for (let i = 0; i < stride; i++) {
      const cur = rgb[src + i];
      const left = i >= 3 ? rgb[src + i - 3] : 0;
      const up = prev[i];
      const ul = i >= 3 ? prev[i - 3] : 0;
      let pred = 0;
      if (filter === 1) pred = left;
      else if (filter === 2) pred = up;
      else if (filter === 4) {
        const p = left + up - ul;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - ul);
        pred = pa <= pb && pa <= pc ? left : pb <= pc ? up : ul;
      }
      raw[dst + 1 + i] = (cur - pred) & 255;
      prev[i] = cur;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const idat = deflateSync(raw, { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

function smallestPNG(rgb: Uint8Array): Buffer {
  let best = encodePNG(rgb, 4);
  for (const filter of [2, 1, 0]) {
    const png = encodePNG(rgb, filter);
    if (png.length < best.length) best = png;
  }
  return best;
}

function norm3(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

const LN = norm3(-0.4, -0.56, 0.72);
const HN = norm3(LN[0], LN[1], LN[2] + 1);

let PX = 0;
let PY = 0;
let LX = 0;
let LY = 0;
const C = new Float64Array(3);
let BUN = 1e9;
let CHICK = 1e9;
let PAW = 1e9;

function blend(r: number, g: number, b: number, a: number): void {
  if (a <= 0) return;
  if (a > 1) a = 1;
  C[0] += (r - C[0]) * a;
  C[1] += (g - C[1]) * a;
  C[2] += (b - C[2]) * a;
}

function cover(d: number): number {
  if (d <= -0.85) return 1;
  if (d >= 0.85) return 0;
  const u = (0.85 - d) / 1.7;
  return u * u * (3 - 2 * u);
}

function softCover(d: number, feather: number): number {
  if (d <= -feather) return 1;
  if (d >= feather) return 0;
  const u = (feather - d) / (feather * 2);
  return u * u * (3 - 2 * u);
}

function sdEllipse(px: number, py: number, rx: number, ry: number): number {
  const ux = px / rx;
  const uy = py / ry;
  const k = Math.hypot(ux, uy);
  if (k < 1e-8) return -Math.min(rx, ry);
  return (k - 1) * (Math.hypot(px, py) / k);
}

function sdHeart(px: number, py: number, s: number): number {
  const x = Math.abs(px / s);
  const y = -(py / s);
  let d: number;
  if (y + x > 1) d = Math.hypot(x - 0.25, y - 0.75) - Math.SQRT2 / 4;
  else {
    const d1 = x * x + (y - 1) * (y - 1);
    const m = 0.5 * Math.max(x + y, 0);
    const dx = x - m;
    const dy = y - m;
    const d2 = dx * dx + dy * dy;
    d = Math.sqrt(Math.min(d1, d2)) * Math.sign(x - y);
  }
  return d * s;
}

function sdCapsule(px: number, py: number, ax: number, ay: number, bx: number, by: number, rad: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  let t = ab2 > 0 ? (apx * abx + apy * aby) / ab2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(apx - abx * t, apy - aby * t) - rad;
}

function sdArc(px: number, py: number, r: number, a0: number, a1: number, thick: number): number {
  const ang = Math.atan2(py, px);
  const a = ang < 0 ? ang + Math.PI * 2 : ang;
  const rad = Math.hypot(px, py);
  if (a >= a0 && a <= a1) return Math.abs(rad - r) - thick;
  const x0 = Math.cos(a0) * r;
  const y0 = Math.sin(a0) * r;
  const x1 = Math.cos(a1) * r;
  const y1 = Math.sin(a1) * r;
  const d0 = Math.hypot(px - x0, py - y0);
  const d1 = Math.hypot(px - x1, py - y1);
  return (d0 < d1 ? d0 : d1) - thick;
}

function litLocal(ux: number, uy: number, br: number, bgc: number, bb: number, a: number): void {
  if (a < 0.003) return;
  let h2 = 1 - ux * ux - uy * uy;
  if (h2 < 0) {
    const inv = 1 / (Math.hypot(ux, uy) || 1);
    ux *= inv;
    uy *= inv;
    h2 = 0;
  }
  const nz = Math.sqrt(h2);
  const sxy = Math.sqrt(1 - h2);
  const glen = Math.hypot(ux, uy) || 1;
  const nx = (ux / glen) * sxy;
  const ny = (uy / glen) * sxy;
  const ndl = nx * LN[0] + ny * LN[1] + nz * LN[2];
  const light = ndl > 0 ? ndl : 0;
  const k = 0.9 + 0.16 * light;
  let r = br * k;
  let g = bgc * k;
  let b = bb * k;
  if (br > 236 && bgc > 220) {
    const warm = (1 - light) * (1 - light) * 0.22;
    r = r * (1 - warm) + 244 * warm;
    g = g * (1 - warm) + 204 * warm;
    b = b * (1 - warm) + 190 * warm;
  }
  const spec = Math.pow(Math.max(0, nx * HN[0] + ny * HN[1] + nz * HN[2]), 42);
  blend(r + spec * 48, g + spec * 42, b + spec * 38, a);
}

function touchSil(d: number, slot: number): void {
  if (slot === 0) {
    if (d < BUN) BUN = d;
  } else if (slot === 1) {
    if (d < CHICK) CHICK = d;
  } else if (slot === 2) {
    if (d < PAW) PAW = d;
  }
}

function paintEll(
  px: number,
  py: number,
  rx: number,
  ry: number,
  c: number,
  s: number,
  br: number,
  bgc: number,
  bb: number,
  slot: number,
): number {
  const rad = (rx > ry ? rx : ry) + 42;
  if (px * px + py * py > rad * rad) return 1e6;
  const lx = px * c + py * s;
  const ly = -px * s + py * c;
  const d = sdEllipse(lx, ly, rx, ry);
  touchSil(d, slot);
  litLocal(lx / rx, ly / ry, br, bgc, bb, cover(d));
  return d;
}

function paintGlow(cx: number, cy: number, rad: number, r: number, g: number, b: number, alpha: number): void {
  const dx = PX - cx;
  const dy = PY - cy;
  const t = (dx * dx + dy * dy) / (rad * rad);
  if (t >= 1) return;
  const u = 1 - t;
  blend(r, g, b, u * u * alpha);
}

function paintBackground(): void {
  const t = PY / (H - 1);
  let r = 255;
  let g = 198 + t * 32;
  let b = 216 + t * -12;
  const vx = (PX - 512) / 512;
  const vy = (PY - 500) / 512;
  const vig = vx * vx * 0.55 + vy * vy;
  r = r * (1 - vig * 0.07) + 236 * vig * 0.07;
  g = g * (1 - vig * 0.1) + 156 * vig * 0.1;
  b = b * (1 - vig * 0.08) + 176 * vig * 0.08;
  C[0] = r;
  C[1] = g;
  C[2] = b;
  paintGlow(512, 470, 460, 255, 252, 248, 0.62);
  paintGlow(180, 190, 150, 255, 255, 255, 0.28);
  paintGlow(860, 150, 170, 255, 236, 206, 0.3);
  paintGlow(120, 800, 140, 255, 214, 226, 0.26);
  paintGlow(900, 780, 160, 255, 255, 255, 0.22);
  paintGlow(720, 280, 90, 255, 228, 236, 0.2);
}

function paintHeartDecor(cx: number, cy: number, s: number, alpha: number): void {
  const d = sdHeart(PX - cx, PY - cy, s);
  const a = cover(d) * alpha;
  if (a < 0.004) return;
  blend(255, 126, 164, a);
  const hx = PX - (cx - s * 0.28);
  const hy = PY - (cy - s * 0.22);
  if (hx * hx + hy * hy < (s * 0.28) * (s * 0.28)) blend(255, 210, 224, a * 0.85);
}

function paintSparkle(cx: number, cy: number, r: number): void {
  const dx = PX - cx;
  const dy = PY - cy;
  if (dx * dx + dy * dy > (r * 3.2) * (r * 3.2)) return;
  const d = Math.min(sdEllipse(dx, dy, r, r * 0.16), sdEllipse(dx, dy, r * 0.16, r));
  const core = Math.hypot(dx, dy) - r * 0.2;
  const a = cover(Math.min(d, core));
  if (a > 0.01) blend(255, 255, 255, a);
  const g = Math.hypot(dx, dy) / (r * 2.4);
  if (g < 1) blend(255, 226, 176, (1 - g) * (1 - g) * 0.45);
}

function warmShadow(amount: number): void {
  if (amount <= 0) return;
  if (amount > 1) amount = 1;
  C[0] *= 1 - amount * 0.22;
  C[1] *= 1 - amount * 0.3;
  C[2] *= 1 - amount * 0.28;
}

function paintCushion(): void {
  const dx = PX - 512;
  const dy = PY - 918;
  const d = sdEllipse(dx, dy, 318, 74);
  const a = cover(d);
  if (a > 0.002) {
    const k = dy < -8 ? 1 : 0.9;
    blend(255 * k + 232 * (1 - k), 176 * k + 132 * (1 - k), 198 * k + 156 * (1 - k), a);
    const rim = Math.exp(-(d * d) / 8);
    blend(214, 104, 138, rim * 0.55 * a);
  }
  const top = sdEllipse(dx, PY - 896, 240, 36);
  if (top < 18) blend(255, 226, 234, softCover(top, 16) * 0.7);
  const sh = sdEllipse(PX - 512, PY - 868, 180, 30);
  if (sh < 16) warmShadow(softCover(sh, 14) * 0.34);
}

const EL_C = Math.cos(-0.3);
const EL_S = Math.sin(-0.3);
const ER_C = Math.cos(0.5);
const ER_S = Math.sin(0.5);
const EB_C = Math.cos(0.38);
const EB_S = Math.sin(0.38);

function paintEars(): void {
  paintEll(LX + 76, LY + 162, 56, 148, EL_C, EL_S, FUR_R, FUR_G, FUR_B, 0);
  paintEll(LX + 76, LY + 148, 28, 86, EL_C, EL_S, 255, 178, 198, -1);
  paintEll(LX - 146, LY - 6, 46, 72, EB_C, EB_S, FUR_R, FUR_G, FUR_B, 0);
  paintEll(LX - 196, LY - 128, 36, 102, ER_C, ER_S, FUR_R, FUR_G, FUR_B, 0);
  paintEll(LX - 194, LY - 122, 18, 56, ER_C, ER_S, 255, 176, 198, -1);
}

function paintEye(ex: number, ey: number, rot: number): void {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const dx = LX - ex;
  const dy = LY - ey;
  const exx = dx * c + dy * s;
  const eyy = -dx * s + dy * c;
  const sdEye = sdEllipse(exx, eyy, 60, 68);
  if (sdEye > 8) return;
  const aEye = cover(sdEye);
  blend(255, 252, 250, aEye);
  const sdIris = sdEllipse(exx, eyy + 1, 54, 62);
  const aIris = cover(sdIris) * aEye;
  if (aIris > 0.004) {
    const v = (eyy / 62 + 1) * 0.5;
    const ir = 78 + v * 124;
    const ig = 46 + v * 78;
    const ib = 40 + v * 36;
    blend(ir, ig, ib, aIris);
  }
  const sdPupil = sdEllipse(exx - 1, eyy - 8, 27, 32);
  blend(48, 26, 24, cover(sdPupil) * aIris);
  if (eyy < -8) {
    const sock = softCover(eyy + 18, 22) * aIris * 0.28;
    warmShadow(sock);
  }
  const shine = sdEllipse(exx, eyy - 34, 40, 16);
  blend(255, 255, 255, cover(shine) * aIris * 0.55);
  blend(255, 255, 255, cover(Math.hypot(exx + 18, eyy + 22) - 15) * aIris);
  blend(255, 255, 255, cover(Math.hypot(exx - 14, eyy - 8) - 6) * aIris);
  blend(255, 255, 255, cover(Math.hypot(exx + 4, eyy + 2) - 3.2) * aIris);
  const star = Math.min(sdEllipse(exx + 16, eyy + 20, 7, 1.4), sdEllipse(exx + 16, eyy + 20, 1.4, 7));
  blend(255, 255, 255, cover(star) * aIris);
  if (eyy < 8) {
    const outer = cover(sdEllipse(exx, eyy, 63, 71));
    const inner = cover(sdEllipse(exx, eyy, 54, 60));
    blend(92, 52, 56, outer * (1 - inner) * 0.95);
  }
  const ring = Math.exp(-(sdEye * sdEye) / 3.2);
  blend(120, 72, 74, ring * 0.9);
}

function paintFace(): void {
  const onHead = softCover(Math.hypot(LX, LY) - HEAD_R, 6);
  if (onHead < 0.02) return;
  const blushL = sdEllipse(LX + 118, LY - 108, 48, 28);
  blend(255, 142, 168, softCover(blushL, 18) * 0.55 * onHead);
  const blushR = sdEllipse(LX - 118, LY - 104, 48, 28);
  blend(255, 142, 168, softCover(blushR, 18) * 0.55 * onHead);
  blend(255, 236, 240, softCover(sdEllipse(LX + 104, LY - 122, 16, 9), 6) * 0.7 * onHead);
  blend(255, 236, 240, softCover(sdEllipse(LX - 104, LY - 118, 16, 9), 6) * 0.7 * onHead);
  const muzzle = sdEllipse(LX, LY - 102, 58, 40);
  blend(255, 253, 251, softCover(muzzle, 16) * 0.42 * onHead);
  paintEye(-80, 16, -0.08);
  paintEye(80, 16, 0.08);
  const nose = sdEllipse(LX, LY - 108, 15, 11);
  blend(255, 138, 162, cover(nose) * onHead);
  blend(255, 220, 228, cover(sdEllipse(LX + 4, LY - 112, 6, 4)) * onHead);
  if (Math.hypot(LX, LY - 128) < 46) {
    const tongue = sdEllipse(LX, LY - 142, 10, 8);
    blend(255, 128, 150, cover(tongue) * onHead * 0.95);
    const smile = sdArc(LX, LY - 116, 28, 0.38, Math.PI - 0.38, 3.6);
    blend(168, 86, 102, cover(smile) * onHead);
  }
}

function paintWhiskers(): void {
  const lines = [
    [-20, 112, -96, 96],
    [-18, 126, -102, 126],
    [-16, 140, -88, 158],
  ];
  for (let i = 0; i < lines.length; i++) {
    const w = lines[i];
    for (const sign of [-1, 1]) {
      const d = sdCapsule(LX, LY, w[0] * sign, w[1], w[2] * sign, w[3], 1.7);
      blend(186, 132, 128, cover(d) * 0.72);
    }
  }
}

function paintFlower(): void {
  const fx = -138;
  const fy = -148;
  paintEll(LX - (fx - 8), LY - (fy + 18), 12, 22, 0.82, 0.57, 132, 186, 122, 0);
  for (let i = 0; i < 5; i++) {
    const ang = -Math.PI / 2 + i * (Math.PI * 2 / 5);
    const cx = fx + Math.cos(ang) * 20;
    const cy = fy + Math.sin(ang) * 20;
    paintEll(LX - cx, LY - cy, 15, 15, 1, 0, 255, 246, 250, 0);
  }
  paintEll(LX - fx, LY - fy, 11, 11, 1, 0, 255, 206, 86, -1);
  blend(255, 236, 150, cover(Math.hypot(LX - fx + 3, LY - fy + 3) - 4) * 0.9);
}

function paintChick(): void {
  const cx = 408;
  const cy = 776;
  const dx = PX - cx;
  const dy = PY - cy;
  if (dx * dx + dy * dy > 190 * 190) return;
  paintEll(dx, dy - 78, 10, 16, 1, 0, 255, 214, 96, 1);
  paintEll(dx - 8, dy - 84, 8, 13, 0.88, 0.48, 255, 206, 84, 1);
  paintEll(dx + 9, dy - 82, 8, 12, 0.88, -0.48, 255, 206, 84, 1);
  paintEll(dx, dy, 86, 80, 1, 0, 255, 204, 78, 1);
  paintEll(dx, dy + 16, 46, 36, 1, 0, 255, 232, 176, -1);
  paintEll(dx - 62, dy + 4, 26, 16, 0.9, 0.45, 240, 170, 64, 1);
  paintEll(dx + 60, dy + 8, 24, 15, 0.9, -0.45, 240, 170, 64, 1);
  paintEll(dx - 16, dy + 74, 14, 8, 1, 0, 255, 148, 72, 1);
  paintEll(dx + 16, dy + 76, 14, 8, 1, 0, 255, 148, 72, 1);
  const eye = (ex: number) => {
    const a = cover(Math.hypot(dx - ex, dy + 14) - 11);
    blend(62, 36, 32, a);
    blend(255, 255, 255, cover(Math.hypot(dx - ex + 3.5, dy + 18) - 3.6) * a);
  };
  eye(-20);
  eye(20);
  const chickSmile = sdArc(dx, dy - 2, 16, 0.45, Math.PI - 0.45, 2.2);
  blend(184, 96, 48, cover(chickSmile));
  blend(255, 150, 168, softCover(sdEllipse(dx + 28, dy - 2, 12, 8), 5) * 0.6);
  blend(255, 150, 168, softCover(sdEllipse(dx - 28, dy - 2, 12, 8), 5) * 0.6);
  blend(255, 138, 70, cover(sdEllipse(dx, dy + 6, 11, 8)));
  blend(214, 96, 48, cover(sdEllipse(dx, dy + 7, 8, 1.6)) * 0.9);
}

function paintPaws(): void {
  paintEll(PX - 348, PY - 812, 48, 38, 1, 0, FUR_R, FUR_G, FUR_B, 2);
  paintEll(PX - 348, PY - 806, 16, 12, 1, 0, 255, 156, 178, -1);
  paintEll(PX - 364, PY - 824, 7, 6, 1, 0, 255, 170, 188, -1);
  paintEll(PX - 334, PY - 824, 7, 6, 1, 0, 255, 170, 188, -1);
  paintEll(PX - 476, PY - 806, 48, 38, 1, 0, FUR_R, FUR_G, FUR_B, 2);
  paintEll(PX - 476, PY - 800, 16, 12, 1, 0, 255, 156, 178, -1);
  paintEll(PX - 492, PY - 818, 7, 6, 1, 0, 255, 170, 188, -1);
  paintEll(PX - 462, PY - 818, 7, 6, 1, 0, 255, 170, 188, -1);
}

function paintCharacter(): void {
  paintEll(PX - 348, PY - 748, 34, 30, 1, 0, FUR_R, FUR_G, FUR_B, 0);
  paintEll(PX - 326, PY - 778, 24, 22, 1, 0, FUR_R, FUR_G, FUR_B, 0);
  paintEll(PX - 372, PY - 786, 22, 20, 1, 0, FUR_R, FUR_G, FUR_B, 0);
  paintEll(PX - BODY_X, PY - BODY_Y, BODY_RX, BODY_RY, 1, 0, FUR_R, FUR_G, FUR_B, 0);
  const belly = sdEllipse(PX - BODY_X, PY - (BODY_Y + 34), 108, 82);
  blend(255, 236, 240, softCover(belly, 26) * 0.62);
  paintEll(PX - 446, PY - 872, 64, 32, 1, 0, FUR_R, FUR_G, FUR_B, 0);
  paintEll(PX - 446, PY - 868, 18, 12, 1, 0, 255, 164, 184, -1);
  paintEll(PX - 428, PY - 860, 8, 7, 1, 0, 255, 176, 194, -1);
  paintEll(PX - 462, PY - 860, 8, 7, 1, 0, 255, 176, 194, -1);
  paintEll(PX - 590, PY - 876, 62, 31, 1, 0, FUR_R, FUR_G, FUR_B, 0);
  paintEll(PX - 590, PY - 872, 18, 12, 1, 0, 255, 164, 184, -1);
  paintEll(PX - 572, PY - 864, 8, 7, 1, 0, 255, 176, 194, -1);
  paintEll(PX - 606, PY - 864, 8, 7, 1, 0, 255, 176, 194, -1);
  paintEll(LX, LY, HEAD_R, HEAD_R, 1, 0, FUR_R, FUR_G, FUR_B, 0);
  paintEll(LX, LY + 198, 18, 34, 1, 0, FUR_R, FUR_G, FUR_B, 0);
  paintEars();
  paintFlower();
  const dHead = Math.hypot(LX, LY) - HEAD_R;
  const dBody = sdEllipse(PX - BODY_X, PY - BODY_Y, BODY_RX, BODY_RY);
  if (dHead > -2 && dHead < 32 && LY > 36 && dBody < 10) {
    warmShadow((1 - dHead / 32) * cover(dBody) * 0.32);
  }
  if (LY > 96 && dHead > -24 && dHead < 8 && dBody < 2) {
    const seam = 1 - Math.abs(dHead + 8) / 20;
    if (seam > 0) blend(255, 247, 242, seam * cover(dBody) * 0.8);
  }
  const chickShadow = sdEllipse(PX - 408, PY - 804, 74, 24);
  warmShadow(softCover(chickShadow, 12) * 0.3);
  paintFace();
  paintChick();
  paintPaws();
}

function paintOutline(): void {
  let d = BUN < CHICK ? BUN : CHICK;
  if (PAW < d) d = PAW;
  if (d > 26) return;
  if (d > 0.8) {
    const t = 1 - d / 22;
    const below = PY > 760 ? 1.35 : 1;
    warmShadow(t * t * 0.2 * below);
  }
  const a = Math.exp(-(d * d) / (2 * 2.15 * 2.15));
  if (a > 0.02) blend(176, 96, 112, a * 0.95);
}

function drawPixel(x: number, y: number, img: Uint8Array, i: number): void {
  PX = x;
  PY = y;
  const dx = x - HEAD_X;
  const dy = y - HEAD_Y;
  LX = dx * CT + dy * ST;
  LY = -dx * ST + dy * CT;
  BUN = 1e9;
  CHICK = 1e9;
  PAW = 1e9;
  paintBackground();
  paintHeartDecor(168, 250, 16, 0.78);
  paintHeartDecor(888, 390, 13, 0.72);
  paintHeartDecor(210, 620, 11, 0.66);
  paintSparkle(150, 150, 14);
  paintSparkle(890, 180, 18);
  paintSparkle(820, 520, 11);
  paintCushion();
  paintCharacter();
  paintOutline();
  paintWhiskers();
  paintSparkle(128, 860, 12);
  paintSparkle(910, 840, 15);
  let r = C[0];
  let g = C[1];
  let b = C[2];
  if (r < 0) r = 0;
  else if (r > 255) r = 255;
  if (g < 0) g = 0;
  else if (g > 255) g = 255;
  if (b < 0) b = 0;
  else if (b > 255) b = 255;
  img[i] = (r + 0.5) | 0;
  img[i + 1] = (g + 0.5) | 0;
  img[i + 2] = (b + 0.5) | 0;
}

function render(img: Uint8Array): void {
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) drawPixel(x, y, img, (row + x) * 3);
  }
}

function quantize(img: Uint8Array, mask: number): void {
  for (let i = 0; i < img.length; i++) img[i] = img[i] & mask;
}

function main(): void {
  const img = new Uint8Array(W * H * 3);
  render(img);
  let png = smallestPNG(img);
  if (png.length > LIMIT) {
    quantize(img, 0xfe);
    png = smallestPNG(img);
  }
  if (png.length > LIMIT) {
    quantize(img, 0xfc);
    png = smallestPNG(img);
  }
  if (png.length > LIMIT) {
    quantize(img, 0xf8);
    png = smallestPNG(img);
  }
  if (png.length > LIMIT) throw new Error(`entry.png too large: ${png.length}`);
  const dir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'entry.png'), png);
  console.log(`entry.png ${png.length} bytes`);
}

main();
