// Hitscan against per-part hitboxes. Head uses the weapon head multiplier,
// limbs use a reduced one, and armour (plus a helmet, on headshots) absorbs
// a share that shrinks as penetration rises. One thin wood surface can be
// shot through. Smoke does not stop bullets; it only blocks vision.

import { state, pushKill, pushRadio, emitSound, addTracer, addImpact } from './state.js';
import { raycast, regionName } from './map.js';
import { shot } from './audio.js';

const LIMB = { chest: 1, stomach: 1.12, arm: 0.72, leg: 0.55 };
const _o = { x: 0, y: 0, z: 0 };
const _d = { x: 0, y: 0, z: 0 };
const _dir = { x: 0, y: 0, z: 0 };
const _hit = { t: 0, actor: null, part: 'chest' };
let _partName = 'chest';

export function eyeY(actor) {
  return actor.y + (actor.crouch ? 0.94 : 1.56);
}

export function forward(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cp;
  return out;
}

export function smokeBlocks(x, y, z, x2, y2, z2) {
  const smokes = state.smokes;
  for (let i = 0; i < smokes.length; i++) {
    const s = smokes[i];
    if (s.life <= 0) continue;
    if (segSphere(x, y, z, x2, y2, z2, s.x, s.y + 1.15, s.z, s.r)) return true;
  }
  return false;
}

export function lineClear(x, y, z, x2, y2, z2) {
  const dx = x2 - x;
  const dy = y2 - y;
  const dz = z2 - z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.08) return true;
  if (smokeBlocks(x, y, z, x2, y2, z2)) return false;
  const inv = 1 / dist;
  const hit = raycast(x, y, z, dx * inv, dy * inv, dz * inv, dist);
  return !hit || hit.t > dist - 0.3;
}

export function fireBullet(actor, gun, id) {
  forward(actor.yaw, actor.pitch, _dir);
  const spread = cone(actor, gun);
  deflect(_dir.x, _dir.y, _dir.z, spread, _dir);
  const ox = actor.x + _dir.x * 0.35;
  const oy = eyeY(actor) + _dir.y * 0.35;
  const oz = actor.z + _dir.z * 0.35;
  emitSound('gun', actor.x, actor.z, actor.org, 40);
  if (actor.id === 0 || actor.target === 0) shot(gun.rpm > 500);
  let x = ox;
  let y = oy;
  let z = oz;
  let remain = 90;
  let pen = 1;
  let bored = false;
  const dx = _dir.x;
  const dy = _dir.y;
  const dz = _dir.z;
  for (let pass = 0; pass < 3 && remain > 0.2; pass++) {
    const world = raycast(x, y, z, dx, dy, dz, remain);
    const worldT = world ? world.t : 1e9;
    const who = rayActors(x, y, z, dx, dy, dz, Math.min(remain, worldT), actor.id);
    if (who) {
      const hx = x + dx * who.t;
      const hy = y + dy * who.t;
      const hz = z + dz * who.t;
      addTracer(ox, oy, oz, hx, hy, hz, who.part === 'head');
      if (who.actor.org !== actor.org) applyHit(who.actor, gun, who.part, pen, actor);
      return;
    }
    if (!world) {
      addTracer(ox, oy, oz, x + dx * remain, y + dy * remain, z + dz * remain, false);
      return;
    }
    const hx = world.x;
    const hy = world.y;
    const hz = world.z;
    const ht = world.t;
    const wood = world.box.wood;
    if (wood && !bored) {
      bored = true;
      pen *= 0.5;
      const step = ht + 0.12;
      x += dx * step;
      y += dy * step;
      z += dz * step;
      remain -= step;
      continue;
    }
    addTracer(ox, oy, oz, hx, hy, hz, false);
    addImpact(hx, hy, hz);
    return;
  }
}

export function applyHit(victim, gun, part, penMul, attacker) {
  const mul = part === 'head' ? gun.head : (LIMB[part] || 1);
  let amount = gun.dmg * mul * penMul;
  const armoured = victim.armour > 0 && (part !== 'head' || victim.helmet);
  if (armoured) {
    const ratio = (1 - gun.pen) * 0.66;
    const absorbed = Math.min(victim.armour, amount * ratio);
    victim.armour -= absorbed;
    amount -= absorbed;
    if (victim.armour <= 0) {
      victim.armour = 0;
      victim.helmet = false;
    }
  }
  if (attacker && attacker.id === 0) {
    state.hitMarker = 0.14;
    state.headMarker = part === 'head';
  }
  wound(victim, amount, attacker, gun.name, gun.kill);
}

export function wound(victim, amount, attacker, label, reward) {
  if (!victim.alive || amount <= 0) return;
  victim.hp -= amount;
  if (victim.id === 0) state.hurt = Math.min(1, state.hurt + amount / 90);
  if (victim.hp > 0) return;
  victim.hp = 0;
  victim.alive = false;
  victim.deaths += 1;
  victim.cmd.fire = false;
  if (victim.primary) {
    const drop = state.drops[state.dropN % state.drops.length];
    state.dropN += 1;
    drop.life = 18;
    drop.id = victim.primary;
    drop.x = victim.x;
    drop.y = victim.y + 0.25;
    drop.z = victim.z;
    victim.primary = null;
  }
  if (attacker && attacker !== victim) {
    attacker.kills += 1;
    attacker.money += reward || 300;
    pushKill(attacker.name + '   ' + label + '   ' + victim.name, attacker.org);
  } else {
    pushKill(victim.name + ' is down', victim.org);
  }
  const charge = state.charge;
  if (charge.carrier === victim.id && charge.state === 'carried') {
    charge.state = 'dropped';
    charge.carrier = -1;
    charge.x = victim.x;
    charge.y = victim.y;
    charge.z = victim.z;
    pushRadio('Charge dropped at ' + regionName(victim.x, victim.z) + '.');
  }
}

function cone(actor, gun) {
  const sp = gun.spread;
  const speed = Math.hypot(actor.vx, actor.vz);
  let deg = sp[0];
  if (!actor.grounded) deg = sp[3];
  else if (actor.crouch && speed < 1.1) deg = sp[1];
  else if (speed > 3.1) deg = sp[2];
  else if (speed > 0.85) deg = sp[0] * 0.45 + sp[2] * 0.55;
  if (actor.recoilI > 0) deg += gun.bloom * actor.recoilI;
  if (actor.scope > 0.45 && gun.scope) deg *= 0.1;
  if (actor.blind > 0.4) deg += actor.blind * 1.8;
  return deg * 0.0174533;
}

function deflect(dx, dy, dz, ang, out) {
  if (ang < 1e-5) { out.x = dx; out.y = dy; out.z = dz; return; }
  const rng = state.rng;
  const rad = Math.tan(ang) * Math.sqrt(rng.next());
  const th = rng.next() * 6.2831853;
  let sx;
  let sy;
  let sz;
  if (Math.abs(dy) < 0.92) { sx = dz; sy = 0; sz = -dx; }
  else { sx = 1; sy = 0; sz = 0; }
  const sl = Math.hypot(sx, sy, sz) || 1;
  sx /= sl; sy /= sl; sz /= sl;
  const ux = dy * sz - dz * sy;
  const uy = dz * sx - dx * sz;
  const uz = dx * sy - dy * sx;
  const c = Math.cos(th) * rad;
  const s = Math.sin(th) * rad;
  out.x = dx + sx * c + ux * s;
  out.y = dy + sy * c + uy * s;
  out.z = dz + sz * c + uz * s;
  const len = Math.hypot(out.x, out.y, out.z) || 1;
  out.x /= len; out.y /= len; out.z /= len;
}

function rayActors(ox, oy, oz, dx, dy, dz, maxDist, selfId) {
  _hit.actor = null;
  _hit.t = maxDist;
  const list = state.actors;
  for (let i = 0; i < list.length; i++) {
    const actor = list[i];
    if (!actor.alive || actor.id === selfId) continue;
    const t = rayBody(actor, ox, oy, oz, dx, dy, dz, _hit.t);
    if (t >= 0 && t < _hit.t) {
      _hit.t = t;
      _hit.actor = actor;
      _hit.part = _partName;
    }
  }
  return _hit.actor ? _hit : null;
}

function rayBody(actor, ox, oy, oz, dx, dy, dz, maxDist) {
  const cos = Math.cos(actor.yaw);
  const sin = Math.sin(actor.yaw);
  const rx = ox - actor.x;
  const rz = oz - actor.z;
  _o.x = rx * cos - rz * sin;
  _o.y = oy - actor.y;
  _o.z = rx * sin + rz * cos;
  _d.x = dx * cos - dz * sin;
  _d.y = dy;
  _d.z = dx * sin + dz * cos;
  const drop = actor.crouch ? 0.5 : 0;
  let best = maxDist;
  let part = '';
  const head = sphereT(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, 0, 1.56 - drop, 0, 0.145);
  if (head >= 0 && head < best) { best = head; part = 'head'; }
  let t = slab(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, -0.28, 1.12 - drop, -0.18, 0.28, 1.48 - drop, 0.18);
  if (t >= 0 && t < best) { best = t; part = 'chest'; }
  t = slab(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, -0.26, 0.78 - drop, -0.16, 0.26, 1.12 - drop, 0.16);
  if (t >= 0 && t < best) { best = t; part = 'stomach'; }
  t = slab(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, -0.22, 0.02, -0.16, 0.22, 0.8 - drop * 0.35, 0.16);
  if (t >= 0 && t < best) { best = t; part = 'leg'; }
  t = slab(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, 0.22, 1.02 - drop, -0.12, 0.5, 1.5 - drop, 0.12);
  if (t >= 0 && t < best) { best = t; part = 'arm'; }
  t = slab(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, -0.5, 1.02 - drop, -0.12, -0.22, 1.5 - drop, 0.12);
  if (t >= 0 && t < best) { best = t; part = 'arm'; }
  if (!part || best >= maxDist) return -1;
  _partName = part;
  return best;
}

function slab(ox, oy, oz, dx, dy, dz, minx, miny, minz, maxx, maxy, maxz) {
  let tmin = 0;
  let tmax = 1e9;
  if (Math.abs(dx) < 1e-8) {
    if (ox < minx || ox > maxx) return -1;
  } else {
    let t1 = (minx - ox) / dx;
    let t2 = (maxx - ox) / dx;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (Math.abs(dy) < 1e-8) {
    if (oy < miny || oy > maxy) return -1;
  } else {
    let t1 = (miny - oy) / dy;
    let t2 = (maxy - oy) / dy;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (Math.abs(dz) < 1e-8) {
    if (oz < minz || oz > maxz) return -1;
  } else {
    let t1 = (minz - oz) / dz;
    let t2 = (maxz - oz) / dz;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  return tmin >= 0 ? tmin : -1;
}

function sphereT(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = ox - cx;
  const ly = oy - cy;
  const lz = oz - cz;
  const b = lx * dx + ly * dy + lz * dz;
  const c = lx * lx + ly * ly + lz * lz - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  const t = -b - s;
  if (t > 0) return t;
  return -b + s > 0 ? -b + s : -1;
}

function segSphere(x, y, z, x2, y2, z2, cx, cy, cz, r) {
  const dx = x2 - x;
  const dy = y2 - y;
  const dz = z2 - z;
  const len2 = dx * dx + dy * dy + dz * dz;
  if (len2 < 1e-6) return (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 < r * r;
  let t = ((cx - x) * dx + (cy - y) * dy + (cz - z) * dz) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const px = x + dx * t - cx;
  const py = y + dy * t - cy;
  const pz = z + dz * t - cz;
  return px * px + py * py + pz * pz < r * r;
}
