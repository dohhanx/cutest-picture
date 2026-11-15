// Weapon catalogue, recoil recovery and the trigger. Hitscan itself lives in combat.js.

import { state } from './state.js';
import { fireBullet } from './combat.js';
import { click } from './audio.js';

export const GUNS = {
  wick: {
    name: 'Wick', slot: 'secondary', auto: false, scope: false,
    price: 200, mag: 12, reserve: 36, rpm: 400, reload: 1.65,
    dmg: 24, pen: 0.4, head: 3.5, kill: 300, bloom: 0.15,
    spread: [0.28, 0.16, 1.5, 4.8],
    recoil: [1.6, 0.15, 1.8, -0.25, 1.7, 0.35, 1.5, -0.2],
  },
  ember: {
    name: 'Ember', slot: 'secondary', auto: false, scope: false,
    price: 500, mag: 8, reserve: 24, rpm: 340, reload: 1.9,
    dmg: 36, pen: 0.52, head: 3.3, kill: 300, bloom: 0.2,
    spread: [0.22, 0.12, 1.7, 5.2],
    recoil: [2.6, 0.2, 2.8, -0.35, 2.5, 0.4, 2.2, -0.15],
  },
  thresher: {
    name: 'Thresher', slot: 'primary', auto: true, scope: false,
    price: 1250, mag: 30, reserve: 90, rpm: 780, reload: 2.15,
    dmg: 17, pen: 0.46, head: 2.6, kill: 600, bloom: 0.12,
    spread: [0.4, 0.28, 1.15, 4.2],
    recoil: [0.7, 0.15, 0.85, -0.3, 0.9, 0.4, 0.8, -0.45, 0.75, 0.35, 0.7, -0.2],
  },
  terrace: {
    name: 'Terrace', slot: 'primary', auto: true, scope: false,
    price: 2700, mag: 25, reserve: 75, rpm: 600, reload: 2.3,
    dmg: 28, pen: 0.72, head: 4, kill: 300, bloom: 0.09,
    spread: [0.08, 0.045, 2.5, 6.4],
    recoil: [1.15, 0.05, 1.35, -0.12, 1.55, 0.22, 1.7, -0.28, 1.6, 0.34, 1.45, -0.3, 1.3, 0.18, 1.15, -0.1],
  },
  ridgefire: {
    name: 'Ridgefire', slot: 'primary', auto: true, scope: false,
    price: 3100, mag: 20, reserve: 60, rpm: 500, reload: 2.45,
    dmg: 34, pen: 0.8, head: 4, kill: 300, bloom: 0.11,
    spread: [0.07, 0.04, 2.7, 6.6],
    recoil: [1.45, 0.08, 1.7, -0.18, 1.9, 0.28, 2.0, -0.36, 1.8, 0.32, 1.6, -0.2],
  },
  longglass: {
    name: 'Longglass', slot: 'primary', auto: false, scope: true,
    price: 4750, mag: 5, reserve: 20, rpm: 48, reload: 2.9,
    dmg: 88, pen: 0.96, head: 2.55, kill: 100, bloom: 0.4,
    spread: [0.04, 0.02, 3.4, 8.5],
    recoil: [4.8, 0.15, 4.6, -0.1],
  },
};

export function gunId(actor) {
  if (actor.slot === 'primary') return actor.primary;
  if (actor.slot === 'secondary') return actor.secondary;
  return null;
}

export function ammoOf(actor, id) {
  if (!id) return null;
  let row = actor.ammo[id];
  if (!row) {
    const g = GUNS[id];
    row = { mag: g.mag, reserve: g.reserve };
    actor.ammo[id] = row;
  }
  return row;
}

export function giveGun(actor, id) {
  const g = GUNS[id];
  if (!g) return;
  if (g.slot === 'primary') actor.primary = id;
  else actor.secondary = id;
  actor.ammo[id] = { mag: g.mag, reserve: g.reserve };
  actor.slot = g.slot;
  actor.draw = 0.28;
  actor.recoilI = 0;
}

export function tickWeapons(dt) {
  const list = state.actors;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.alive) continue;
    const id = gunId(a);
    const gun = id ? GUNS[id] : null;
    if (gun && gun.scope && a.cmd.scope && a.grounded) a.scope = Math.min(1, a.scope + dt * 7);
    else a.scope = Math.max(0, a.scope - dt * 9);
    if (a.draw > 0) a.draw -= dt;
    if (a.dry > 0) a.dry -= dt;
    if (a.cooldown > 0) a.cooldown -= dt;
    recover(a, dt);
    if (!gun) continue;
    const ammo = ammoOf(a, id);
    if (a.reload > 0) {
      a.reload -= dt;
      if (a.cmd.fire && ammo.mag > 0) a.reload = 0;
      else if (a.reload <= 0) {
        const need = gun.mag - ammo.mag;
        const take = Math.min(need, ammo.reserve);
        ammo.mag += take;
        ammo.reserve -= take;
      }
      continue;
    }
    if (a.cmd.reload && ammo.mag < gun.mag && ammo.reserve > 0) {
      a.reload = gun.reload;
      a.recoilI = 0;
      continue;
    }
    const want = gun.auto ? a.cmd.fire : a.cmd.fireEdge;
    if (!want || a.draw > 0 || a.cooldown > 0) continue;
    a.cmd.fireEdge = false;
    if (ammo.mag <= 0) {
      if (a.dry <= 0) {
        a.dry = 0.24;
        if (!a.bot) click();
      }
      if (a.bot) a.cmd.reload = true;
      continue;
    }
    ammo.mag -= 1;
    a.cooldown = 60 / gun.rpm;
    fireBullet(a, gun, id);
    kick(a, gun);
    if (a.bot && ammo.mag === 0) a.cmd.reload = true;
  }
}

function kick(actor, gun) {
  const rec = gun.recoil;
  const shots = rec.length / 2;
  const i = (actor.recoilI % shots) * 2;
  const kp = rec[i] * 0.0174533;
  const ky = rec[i + 1] * 0.0174533;
  actor.pitch += kp;
  actor.yaw += ky;
  actor.recoilP += kp;
  actor.recoilY += ky;
  actor.recoilI += 1;
  actor.recoilT = 0;
}

function recover(actor, dt) {
  actor.recoilT += dt;
  if (actor.recoilP === 0 && actor.recoilY === 0) {
    if (actor.recoilT > 0.34) actor.recoilI = 0;
    return;
  }
  if (actor.recoilT < 0.08) return;
  const k = Math.min(1, dt * 8.5);
  actor.pitch -= actor.recoilP * k;
  actor.yaw -= actor.recoilY * k;
  actor.recoilP *= 1 - k;
  actor.recoilY *= 1 - k;
  if (actor.recoilT > 0.36) actor.recoilI = 0;
}
