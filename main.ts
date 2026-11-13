// Portrait painter for a cream lop bunny and a chick in its lap.
// Node 22 standard library. Every run emits the same PNG bytes.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SIDE = 1024;
const MAX_BYTES = 1048576;

const tone = new Float64Array(3);
let px = 0;
let py = 0;
let localX = 0;
let localY = 0;
let edge = 1e9;

const LEAN = -0.12;
const LEAN_C = Math.cos(LEAN);
const LEAN_S = Math.sin(LEAN);

const FACE_X = 518;
const FACE_Y = 458;
const FACE_R = 198;

const TORSO_X = 514;
const TORSO_Y = 716;
const TORSO_RX = 216;
const TORSO_RY = 154;

const WOOL: number[] = [255, 249, 243];
const BLUSH_PINK: number[] = [255, 146, 170];
const CHICK_GOLD: number[] = [255, 206, 82];
const CHICK_CREAM: number[] = [255, 232, 168];

const UP_EAR_C = Math.cos(-0.28);
const UP_EAR_S = Math.sin(-0.28);
const LOP_C = Math.cos(0.52);
const LOP_S = Math.sin(0.52);
const BRIDGE_C = Math.cos(0.34);
const BRIDGE_S = Math.sin(0.34);

function smoothGate(dist: number, band: number): number {
  if (dist <= -band) return 1;
  if (dist >= band) return 0;
  const u = (band - dist) / (band * 2);
  return u * u * (3 - 2 * u);
}

function over(r: number, g: number, b: number, a: number): void {
  if (a <= 0.001) return;
  const t = a > 1 ? 1 : a;
  tone[0] += (r - tone[0]) * t;
  tone[1] += (g - tone[1]) * t;
  tone[2] += (b - tone[2]) * t;
}

function dimWarm(amount: number): void {
  if (amount <= 0) return;
  const k = amount > 1 ? 1 : amount;
  tone[0] *= 1 - k * 0.2;
  tone[1] *= 1 - k * 0.28;
  tone[2] *= 1 - k * 0.26;
}

const LAMP = (() => {
  const x = -0.36;
  const y = -0.5;
  const z = 0.78;
  const n = Math.hypot(x, y, z);
  const lx = x / n;
  const ly = y / n;
  const lz = z / n;
  const hx = lx;
  const hy = ly;
  const hz = lz + 1;
  const hn = Math.hypot(hx, hy, hz);
  return { lx, ly, lz, hx: hx / hn, hy: hy / hn, hz: hz / hn };
})();

function shadeBlob(ux: number, uy: number, base: number[], alpha: number): void {
  if (alpha < 0.004) return;
  let lift = 1 - ux * ux - uy * uy;
  let nx = ux;
  let ny = uy;
  if (lift < 0) {
    const inv = 1 / (Math.hypot(ux, uy) || 1);
    nx *= inv;
    ny *= inv;
    lift = 0;
  }
  const nz = Math.sqrt(lift);
  const flat = Math.sqrt(1 - lift);
  const glen = Math.hypot(nx, ny) || 1;
  nx = (nx / glen) * flat;
  ny = (ny / glen) * flat;
  const ndot = nx * LAMP.lx + ny * LAMP.ly + nz * LAMP.lz;
  const lamp = ndot > 0 ? ndot : 0;
  const gain = 0.92 + 0.14 * lamp;
  let r = base[0] * gain;
  let g = base[1] * gain;
  let b = base[2] * gain;
  if (base[0] > 242 && base[1] > 226) {
    const warm = (1 - lamp) * (1 - lamp) * 0.18;
    r = r * (1 - warm) + 248 * warm;
    g = g * (1 - warm) + 208 * warm;
    b = b * (1 - warm) + 194 * warm;
  }
  const spec = Math.pow(Math.max(0, nx * LAMP.hx + ny * LAMP.hy + nz * LAMP.hz), 34);
  over(r + spec * 36, g + spec * 30, b + spec * 26, alpha);
}

function ellipseGap(x: number, y: number, rx: number, ry: number): number {
  const radial = Math.hypot(x / rx, y / ry);
  if (radial < 1e-8) return -Math.min(rx, ry);
  return (radial - 1) * (Math.hypot(x, y) / radial);
}

function stampOval(
  ox: number,
  oy: number,
  rx: number,
  ry: number,
  c: number,
  s: number,
  base: number[],
  recordEdge: boolean,
): number {
  const reach = (rx > ry ? rx : ry) + 34;
  if (ox * ox + oy * oy > reach * reach) return 1e6;
  const lx = ox * c + oy * s;
  const ly = -ox * s + oy * c;
  const gap = ellipseGap(lx, ly, rx, ry);
  if (recordEdge && gap < edge) edge = gap;
  shadeBlob(lx / rx, ly / ry, base, smoothGate(gap, 0.85));
  return gap;
}

function heartGap(x: number, y: number, scale: number): number {
  const ax = Math.abs(x / scale);
  const ay = -(y / scale);
  let d: number;
  if (ay + ax > 1) {
    d = Math.hypot(ax - 0.25, ay - 0.75) - Math.SQRT2 / 4;
  } else {
    const top = ax * ax + (ay - 1) * (ay - 1);
    const m = 0.5 * Math.max(ax + ay, 0);
    const qx = ax - m;
    const qy = ay - m;
    d = Math.sqrt(Math.min(top, qx * qx + qy * qy)) * Math.sign(ax - ay);
  }
  return d * scale;
}

function rodGap(
  x: number,
  y: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
): number {
  const abx = x1 - x0;
  const aby = y1 - y0;
  const apx = x - x0;
  const apy = y - y0;
  const len2 = abx * abx + aby * aby;
  let t = len2 > 0 ? (apx * abx + apy * aby) / len2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(apx - abx * t, apy - aby * t) - radius;
}

function bowGap(x: number, y: number, radius: number, a0: number, a1: number, thick: number): number {
  const ang = Math.atan2(y, x);
  const a = ang < 0 ? ang + Math.PI * 2 : ang;
  const dist = Math.hypot(x, y);
  if (a >= a0 && a <= a1) return Math.abs(dist - radius) - thick;
  const xA = Math.cos(a0) * radius;
  const yA = Math.sin(a0) * radius;
  const xB = Math.cos(a1) * radius;
  const yB = Math.sin(a1) * radius;
  const dA = Math.hypot(x - xA, y - yA);
  const dB = Math.hypot(x - xB, y - yB);
  return (dA < dB ? dA : dB) - thick;
}

const CRC_LUT = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_LUT[n] = c >>> 0;
}

function checksum(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_LUT[(crc ^ buf[i]) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(kind: string, payload: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(payload.length, 0);
  const tag = Buffer.from(kind);
  const body = Buffer.concat([tag, payload]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(checksum(body), 0);
  return Buffer.concat([head, body, tail]);
}

function filterRows(rgb: Uint8Array, mode: number): Buffer {
  const stride = SIDE * 3;
  const raw = Buffer.alloc((stride + 1) * SIDE);
  const above = Buffer.alloc(stride);
  for (let y = 0; y < SIDE; y++) {
    const src = y * stride;
    const dst = y * (stride + 1);
    raw[dst] = mode;
    for (let i = 0; i < stride; i++) {
      const here = rgb[src + i];
      const left = i >= 3 ? rgb[src + i - 3] : 0;
      const up = above[i];
      const ul = i >= 3 ? above[i - 3] : 0;
      let pred = 0;
      if (mode === 1) pred = left;
      else if (mode === 2) pred = up;
      else if (mode === 4) {
        const guess = left + up - ul;
        const pa = Math.abs(guess - left);
        const pb = Math.abs(guess - up);
        const pc = Math.abs(guess - ul);
        pred = pa <= pb && pa <= pc ? left : pb <= pc ? up : ul;
      }
      raw[dst + 1 + i] = (here - pred) & 255;
      above[i] = here;
    }
  }
  return raw;
}

function toPng(rgb: Uint8Array, mode: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIDE, 0);
  ihdr.writeUInt32BE(SIDE, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const zipped = deflateSync(filterRows(rgb, mode), { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", zipped), chunk("IEND", Buffer.alloc(0))]);
}

function tightestPng(rgb: Uint8Array): Buffer {
  let best = toPng(rgb, 4);
  for (const mode of [2, 1, 0]) {
    const candidate = toPng(rgb, mode);
    if (candidate.length < best.length) best = candidate;
  }
  return best;
}

function pinHead(): void {
  const dx = px - FACE_X;
  const dy = py - FACE_Y;
  localX = dx * LEAN_C + dy * LEAN_S;
  localY = -dx * LEAN_S + dy * LEAN_C;
}

function glow(cx: number, cy: number, rad: number, r: number, g: number, b: number, alpha: number): void {
  const dx = px - cx;
  const dy = py - cy;
  const t = (dx * dx + dy * dy) / (rad * rad);
  if (t >= 1) return;
  const u = 1 - t;
  over(r, g, b, u * u * alpha);
}

function washBackdrop(): void {
  const t = py / (SIDE - 1);
  const vx = (px - 512) / 540;
  const vy = (py - 490) / 540;
  const vig = vx * vx * 0.5 + vy * vy;
  let r = 255 * (1 - vig * 0.06) + 236 * vig * 0.06;
  let g = (196 + t * 34) * (1 - vig * 0.09) + 158 * vig * 0.09;
  let b = (218 - t * 14) * (1 - vig * 0.07) + 178 * vig * 0.07;
  tone[0] = r;
  tone[1] = g;
  tone[2] = b;
  glow(512, 460, 470, 255, 252, 248, 0.58);
  glow(170, 180, 150, 255, 255, 255, 0.26);
  glow(870, 150, 168, 255, 238, 210, 0.28);
  glow(130, 820, 140, 255, 214, 226, 0.24);
  glow(900, 790, 150, 255, 255, 255, 0.2);
}

function placeHeart(cx: number, cy: number, scale: number, alpha: number): void {
  const gap = heartGap(px - cx, py - cy, scale);
  const a = smoothGate(gap, 0.8) * alpha;
  if (a < 0.004) return;
  over(255, 128, 166, a);
  const hx = px - (cx - scale * 0.26);
  const hy = py - (cy - scale * 0.2);
  if (hx * hx + hy * hy < (scale * 0.26) * (scale * 0.26)) over(255, 214, 226, a * 0.8);
}

function placeSpark(cx: number, cy: number, radius: number): void {
  const dx = px - cx;
  const dy = py - cy;
  if (dx * dx + dy * dy > (radius * 3) * (radius * 3)) return;
  const cross = Math.min(ellipseGap(dx, dy, radius, radius * 0.15), ellipseGap(dx, dy, radius * 0.15, radius));
  const core = Math.hypot(dx, dy) - radius * 0.18;
  const a = smoothGate(Math.min(cross, core), 0.7);
  if (a > 0.01) over(255, 255, 255, a);
  const g = Math.hypot(dx, dy) / (radius * 2.3);
  if (g < 1) over(255, 228, 180, (1 - g) * (1 - g) * 0.4);
}

function layCushion(): void {
  const dx = px - 512;
  const dy = py - 922;
  const gap = ellipseGap(dx, dy, 312, 72);
  const a = smoothGate(gap, 0.9);
  if (a > 0.003) {
    const lift = dy < -6 ? 1 : 0.88;
    over(255 * lift + 228 * (1 - lift), 174 * lift + 128 * (1 - lift), 196 * lift + 152 * (1 - lift), a);
    const rim = Math.exp(-(gap * gap) / 9);
    over(210, 100, 136, rim * 0.5 * a);
  }
  const cap = ellipseGap(dx, py - 900, 230, 32);
  if (cap < 16) over(255, 228, 236, smoothGate(cap, 14) * 0.65);
  const contact = ellipseGap(px - 512, py - 870, 170, 28);
  if (contact < 14) dimWarm(smoothGate(contact, 12) * 0.32);
}

function layTorso(): void {
  stampOval(px - 352, py - 752, 32, 28, 1, 0, WOOL, true);
  stampOval(px - 330, py - 782, 22, 20, 1, 0, WOOL, true);
  stampOval(px - 376, py - 788, 20, 18, 1, 0, WOOL, true);
  stampOval(px - TORSO_X, py - TORSO_Y, TORSO_RX, TORSO_RY, 1, 0, WOOL, true);
  const belly = ellipseGap(px - TORSO_X, py - (TORSO_Y + 30), 102, 76);
  over(255, 238, 242, smoothGate(belly, 24) * 0.58);
  stampOval(px - 448, py - 874, 62, 30, 1, 0, WOOL, true);
  stampOval(px - 448, py - 870, 16, 11, 1, 0, [255, 166, 186], false);
  stampOval(px - 432, py - 862, 7, 6, 1, 0, [255, 178, 196], false);
  stampOval(px - 464, py - 862, 7, 6, 1, 0, [255, 178, 196], false);
  stampOval(px - 592, py - 878, 60, 29, 1, 0, WOOL, true);
  stampOval(px - 592, py - 874, 16, 11, 1, 0, [255, 166, 186], false);
  stampOval(px - 576, py - 866, 7, 6, 1, 0, [255, 178, 196], false);
  stampOval(px - 608, py - 866, 7, 6, 1, 0, [255, 178, 196], false);
}

function layEars(): void {
  stampOval(localX + 74, localY + 166, 54, 146, UP_EAR_C, UP_EAR_S, WOOL, true);
  stampOval(localX + 74, localY + 152, 26, 84, UP_EAR_C, UP_EAR_S, [255, 180, 200], false);
  stampOval(localX - 142, localY - 4, 44, 70, BRIDGE_C, BRIDGE_S, WOOL, true);
  stampOval(localX - 200, localY - 132, 34, 100, LOP_C, LOP_S, WOOL, true);
  stampOval(localX - 198, localY - 126, 16, 54, LOP_C, LOP_S, [255, 178, 200], false);
  stampOval(localX, localY + 202, 16, 30, 1, 0, WOOL, true);
}

function layFlower(): void {
  const fx = -142;
  const fy = -152;
  stampOval(localX - (fx - 10), localY - (fy + 16), 11, 20, 0.78, 0.62, [128, 184, 118], true);
  for (let i = 0; i < 5; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    const cx = fx + Math.cos(ang) * 18;
    const cy = fy + Math.sin(ang) * 18;
    stampOval(localX - cx, localY - cy, 14, 14, 1, 0, [255, 248, 252], true);
  }
  stampOval(localX - fx, localY - fy, 10, 10, 1, 0, [255, 204, 84], false);
  over(255, 238, 160, smoothGate(Math.hypot(localX - fx + 3, localY - fy + 3) - 3.5, 0.6) * 0.85);
}

function layHead(): void {
  stampOval(localX, localY, FACE_R, FACE_R, 1, 0, WOOL, true);
  layEars();
  layFlower();
  const skull = Math.hypot(localX, localY) - FACE_R;
  const torso = ellipseGap(px - TORSO_X, py - TORSO_Y, TORSO_RX, TORSO_RY);
  if (skull > -4 && skull < 30 && localY > 40 && torso < 8) {
    dimWarm((1 - skull / 30) * smoothGate(torso, 0.9) * 0.28);
  }
  if (localY > 100 && skull > -22 && skull < 6 && torso < 2) {
    const seam = 1 - Math.abs(skull + 8) / 18;
    if (seam > 0) over(255, 248, 244, seam * smoothGate(torso, 0.9) * 0.72);
  }
}

function gaze(ex: number, ey: number, tilt: number): void {
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  const dx = localX - ex;
  const dy = localY - ey;
  const exx = dx * c + dy * s;
  const eyy = -dx * s + dy * c;
  const socket = ellipseGap(exx, eyy, 58, 66);
  if (socket > 7) return;
  const aEye = smoothGate(socket, 0.8);
  over(255, 252, 250, aEye);
  const iris = ellipseGap(exx, eyy + 1, 52, 60);
  const aIris = smoothGate(iris, 0.75) * aEye;
  if (aIris > 0.004) {
    const v = (eyy / 60 + 1) * 0.5;
    over(74 + v * 122, 42 + v * 76, 36 + v * 32, aIris);
  }
  const pupil = ellipseGap(exx - 1, eyy - 7, 26, 31);
  over(46, 24, 22, smoothGate(pupil, 0.7) * aIris);
  if (eyy < -6) dimWarm(smoothGate(eyy + 16, 18) * aIris * 0.22);
  over(255, 255, 255, smoothGate(ellipseGap(exx, eyy - 32, 36, 14), 0.7) * aIris * 0.48);
  over(255, 255, 255, smoothGate(Math.hypot(exx + 16, eyy + 20) - 14, 0.65) * aIris);
  over(255, 255, 255, smoothGate(Math.hypot(exx - 12, eyy - 6) - 5.2, 0.55) * aIris);
  over(255, 255, 255, smoothGate(Math.hypot(exx + 3, eyy + 3) - 2.6, 0.45) * aIris);
  const twinkle = Math.min(ellipseGap(exx + 14, eyy + 18, 6, 1.2), ellipseGap(exx + 14, eyy + 18, 1.2, 6));
  over(255, 255, 255, smoothGate(twinkle, 0.45) * aIris);
  if (eyy < 6) {
    const outer = smoothGate(ellipseGap(exx, eyy, 61, 69), 0.55);
    const inner = smoothGate(ellipseGap(exx, eyy, 52, 58), 0.55);
    over(94, 52, 56, outer * (1 - inner) * 0.9);
  }
  const ring = Math.exp(-(socket * socket) / 3.3);
  over(116, 68, 72, ring * 0.82);
}

function layFace(): void {
  const onHead = smoothGate(Math.hypot(localX, localY) - FACE_R, 5);
  if (onHead < 0.02) return;
  over(BLUSH_PINK[0], BLUSH_PINK[1], BLUSH_PINK[2], smoothGate(ellipseGap(localX + 114, localY - 104, 46, 26), 15) * 0.5 * onHead);
  over(BLUSH_PINK[0], BLUSH_PINK[1], BLUSH_PINK[2], smoothGate(ellipseGap(localX - 114, localY - 100, 46, 26), 15) * 0.5 * onHead);
  over(255, 238, 242, smoothGate(ellipseGap(localX + 100, localY - 118, 14, 8), 5) * 0.62 * onHead);
  over(255, 238, 242, smoothGate(ellipseGap(localX - 100, localY - 114, 14, 8), 5) * 0.62 * onHead);
  over(255, 253, 251, smoothGate(ellipseGap(localX, localY - 98, 52, 34), 13) * 0.38 * onHead);
  gaze(-76, 12, -0.06);
  gaze(80, 12, 0.06);
  over(255, 134, 158, smoothGate(ellipseGap(localX, localY - 104, 13, 10), 0.65) * onHead);
  over(255, 222, 230, smoothGate(ellipseGap(localX + 4, localY - 108, 5, 3.4), 0.45) * onHead);
  if (Math.hypot(localX, localY - 124) < 42) {
    over(255, 128, 150, smoothGate(ellipseGap(localX, localY - 138, 9, 7), 0.55) * onHead * 0.9);
    const smile = bowGap(localX, localY - 112, 26, 0.42, Math.PI - 0.42, 3.3);
    over(164, 82, 98, smoothGate(smile, 0.65) * onHead);
  }
}

function layWhiskers(): void {
  const lines = [
    [-18, 108, -94, 92],
    [-16, 122, -100, 122],
    [-14, 136, -86, 154],
  ];
  for (let i = 0; i < lines.length; i++) {
    const w = lines[i];
    for (const sign of [-1, 1]) {
      const d = rodGap(localX, localY, w[0] * sign, w[1], w[2] * sign, w[3], 1.55);
      over(182, 128, 124, smoothGate(d, 0.65) * 0.68);
    }
  }
}

function layChick(): void {
  const cx = 404;
  const cy = 782;
  const dx = px - cx;
  const dy = py - cy;
  if (dx * dx + dy * dy > 196 * 196) return;
  stampOval(dx, dy - 74, 9, 14, 1, 0, [255, 216, 98], true);
  stampOval(dx - 7, dy - 80, 7, 12, 0.84, 0.54, [255, 208, 88], true);
  stampOval(dx + 8, dy - 78, 7, 11, 0.84, -0.54, [255, 208, 88], true);
  stampOval(dx, dy, 82, 76, 1, 0, CHICK_GOLD, true);
  stampOval(dx, dy + 12, 42, 32, 1, 0, CHICK_CREAM, false);
  stampOval(dx - 58, dy + 2, 22, 14, 0.9, 0.44, [236, 166, 60], true);
  stampOval(dx + 56, dy + 6, 20, 13, 0.9, -0.44, [236, 166, 60], true);
  stampOval(dx - 13, dy + 70, 12, 7, 1, 0, [255, 148, 72], true);
  stampOval(dx + 14, dy + 72, 12, 7, 1, 0, [255, 148, 72], true);
  const dot = (ex: number) => {
    const a = smoothGate(Math.hypot(dx - ex, dy + 10) - 9.5, 0.65);
    over(56, 32, 28, a);
    over(255, 255, 255, smoothGate(Math.hypot(dx - ex + 3, dy + 14) - 3, 0.45) * a);
  };
  dot(-17);
  dot(17);
  const grin = bowGap(dx, dy - 2, 13, 0.48, Math.PI - 0.48, 1.9);
  over(176, 90, 44, smoothGate(grin, 0.55));
  over(255, 150, 168, smoothGate(ellipseGap(dx + 24, dy, 10, 6), 4) * 0.5);
  over(255, 150, 168, smoothGate(ellipseGap(dx - 24, dy, 10, 6), 4) * 0.5);
  over(255, 134, 66, smoothGate(ellipseGap(dx, dy + 5, 9, 6.5), 0.55));
  over(206, 90, 44, smoothGate(ellipseGap(dx, dy + 6, 6.5, 1.3), 0.4) * 0.8);
}

function layPaws(): void {
  stampOval(px - 342, py - 820, 44, 34, 1, 0, WOOL, true);
  stampOval(px - 342, py - 814, 14, 10, 1, 0, [255, 156, 178], false);
  stampOval(px - 356, py - 832, 6, 5, 1, 0, [255, 172, 190], false);
  stampOval(px - 328, py - 832, 6, 5, 1, 0, [255, 172, 190], false);
  stampOval(px - 476, py - 814, 44, 34, 1, 0, WOOL, true);
  stampOval(px - 476, py - 808, 14, 10, 1, 0, [255, 156, 178], false);
  stampOval(px - 490, py - 826, 6, 5, 1, 0, [255, 172, 190], false);
  stampOval(px - 462, py - 826, 6, 5, 1, 0, [255, 172, 190], false);
}

function traceRim(): void {
  const d = edge;
  if (d > 24) return;
  if (d > 0.7) {
    const t = 1 - d / 20;
    const below = py > 770 ? 1.28 : 1;
    dimWarm(t * t * 0.17 * below);
  }
  const a = Math.exp(-(d * d) / (2 * 2.05 * 2.05));
  if (a > 0.02) over(170, 92, 108, a * 0.9);
}

function paintPixel(x: number, y: number, img: Uint8Array, i: number): void {
  px = x;
  py = y;
  edge = 1e9;
  pinHead();
  washBackdrop();
  placeHeart(158, 236, 15, 0.74);
  placeHeart(882, 372, 12, 0.68);
  placeHeart(198, 604, 10, 0.62);
  placeSpark(146, 146, 13);
  placeSpark(890, 172, 16);
  placeSpark(826, 508, 10);
  layCushion();
  layTorso();
  layHead();
  dimWarm(smoothGate(ellipseGap(px - 404, py - 810, 68, 20), 10) * 0.26);
  layFace();
  layChick();
  layPaws();
  traceRim();
  layWhiskers();
  placeSpark(122, 870, 11);
  placeSpark(910, 850, 13);
  let r = tone[0];
  let g = tone[1];
  let b = tone[2];
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

function raster(img: Uint8Array): void {
  for (let y = 0; y < SIDE; y++) {
    const row = y * SIDE;
    for (let x = 0; x < SIDE; x++) paintPixel(x, y, img, (row + x) * 3);
  }
}

function quantize(img: Uint8Array, mask: number): void {
  for (let i = 0; i < img.length; i++) img[i] = img[i] & mask;
}

function main(): void {
  const img = new Uint8Array(SIDE * SIDE * 3);
  raster(img);
  let png = tightestPng(img);
  if (png.length > MAX_BYTES) {
    quantize(img, 0xfe);
    png = tightestPng(img);
  }
  if (png.length > MAX_BYTES) {
    quantize(img, 0xfc);
    png = tightestPng(img);
  }
  if (png.length > MAX_BYTES) throw new Error(`picture is ${png.length} bytes`);
  const dir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "entry.png"), png);
  console.log(`entry.png ${png.length} bytes`);
}

main();
