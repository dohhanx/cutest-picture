// Spark frag, Glimmer flash and Veil smoke. Flash blinds by view angle,
// smoke is a volume that lineClear treats as opaque.

import { state } from './state.js';
import { overlap } from './map.js';
import { eyeY, forward, lineClear, wound } from './combat.js';
import { boom } from './audio.js';

const _dir = { x: 0, y: 0, z: 0 };

export function toss(actor, kind) {
  if (!actor.nades[kind]) return false;
  actor.nades[kind] -= 1;
  const slot = freeNade();
  forward(actor.yaw, actor.pitch, _dir);
  slot.life = 1;
  slot.kind = kind;
  slot.owner = actor.id;
  slot.org = actor.org;
  slot.x = actor.x + _dir.x * 0.55;
  slot.y = eyeY(actor);
  slot.z = actor.z + _dir.z * 0.55;
  slot.vx = _dir.x * 13.2;
  slot.vy = _dir.y * 13.2 + 4.4;
  slot.vz = _dir.z * 13.2;
  slot.fuse = kind === 'spark' ? 1.6 : 1.15;
  if (actor.slot === kind) actor.slot = actor.primary ? 'primary' : 'secondary';
  return true;
}

function freeNade() {
  const list = state.nades;
  for (let i = 0; i < list.length; i++) if (list[i].life <= 0) return list[i];
  return list[0];
}

export function tickGrenades(dt) {
  const actors = state.actors;
  for (let i = 0; i < actors.length; i++) {
    const actor = actors[i];
    if (!actor.alive) continue;
    const slot = actor.slot;
    if ((slot === 'spark' || slot === 'glimmer' || slot === 'veil') && actor.cmd.fireEdge) {
      if (!toss(actor, slot)) actor.dry = 0.2;
      actor.cmd.fireEdge = false;
    }
    if (actor.throw) {
      toss(actor, actor.throw);
      actor.throw = '';
    }
  }
  const nades = state.nades;
  for (let i = 0; i < nades.length; i++) {
    const g = nades[i];
    if (g.life <= 0) continue;
    g.fuse -= dt;
    g.vy -= 11.5 * dt;
    hop(g, g.vx * dt, 0, 0);
    hop(g, 0, g.vy * dt, 0);
    hop(g, 0, 0, g.vz * dt);
    if (g.fuse <= 0) explode(g);
  }
  const smokes = state.smokes;
  for (let i = 0; i < smokes.length; i++) {
    if (smokes[i].life > 0) smokes[i].life -= dt;
  }
}

function hop(g, dx, dy, dz) {
  if (dx) {
    g.x += dx;
    if (overlap(g.x, g.y, g.z, 0.16, 0.2)) { g.x -= dx; g.vx *= -0.38; }
  }
  if (dy) {
    g.y += dy;
    if (overlap(g.x, g.y, g.z, 0.16, 0.2)) {
      g.y -= dy;
      g.vy *= -0.32;
      if (Math.abs(g.vy) < 1.2) g.vy = 0;
    }
  }
  if (dz) {
    g.z += dz;
    if (overlap(g.x, g.y, g.z, 0.16, 0.2)) { g.z -= dz; g.vz *= -0.38; }
  }
}

function explode(g) {
  g.life = 0;
  if (g.kind === 'veil') {
    puff(g.x, g.y, g.z);
    return;
  }
  if (g.kind === 'glimmer') {
    flash(g.x, g.y + 0.4, g.z);
    return;
  }
  boom();
  const list = state.actors;
  for (let i = 0; i < list.length; i++) {
    const actor = list[i];
    if (!actor.alive) continue;
    const dx = actor.x - g.x;
    const dy = (actor.y + 0.9) - g.y;
    const dz = actor.z - g.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > 6.4) continue;
    if (!lineClear(g.x, g.y, g.z, actor.x, actor.y + 0.9, actor.z)) continue;
    const fall = 1 - dist / 6.4;
    let dmg = 110 * fall;
    if (actor.id === g.owner) dmg *= 0.45;
    else if (actor.org === g.org) dmg *= 0.2;
    const owner = list[g.owner];
    wound(actor, dmg, owner && owner !== actor ? owner : null, 'Spark', 300);
  }
}

function puff(x, y, z) {
  const smokes = state.smokes;
  let slot = smokes[0];
  for (let i = 0; i < smokes.length; i++) {
    if (smokes[i].life <= 0) { slot = smokes[i]; break; }
    if (smokes[i].life < slot.life) slot = smokes[i];
  }
  slot.life = 16;
  slot.x = x;
  slot.y = y;
  slot.z = z;
  slot.r = 4.25;
}

function flash(x, y, z) {
  const list = state.actors;
  for (let i = 0; i < list.length; i++) {
    const actor = list[i];
    if (!actor.alive) continue;
    const ey = eyeY(actor);
    const dx = x - actor.x;
    const dy = y - ey;
    const dz = z - actor.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > 30) continue;
    if (dist > 0.4 && !lineClear(actor.x, ey, actor.z, x, y, z)) continue;
    const inv = 1 / Math.max(0.4, dist);
    const fx = -Math.sin(actor.yaw) * Math.cos(actor.pitch);
    const fy = Math.sin(actor.pitch);
    const fz = -Math.cos(actor.yaw) * Math.cos(actor.pitch);
    const dot = fx * dx * inv + fy * dy * inv + fz * dz * inv;
    let mag = 1 - dist / 30;
    mag *= dot > 0.2 ? 0.55 + 0.45 * dot : 0.22;
    actor.blind = Math.max(actor.blind, mag * 3.5);
  }
}
