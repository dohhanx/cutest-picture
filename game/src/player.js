// Acceleration, friction, jump, crouch and stair stepping. Bots use the same
// mover as the player so collision rules stay in one place.

import { overlap } from './map.js';
import { state, emitSound } from './state.js';
import { step } from './audio.js';

const R = 0.32;
const STAND = 1.7;
const CROUCH_H = 1.12;
const STEP_H = 0.42;

export function tickMovement(dt) {
  const list = state.actors;
  for (let i = 0; i < list.length; i++) {
    const actor = list[i];
    if (!actor.alive) continue;
    if (actor.cmd.crouch) actor.crouch = true;
    else if (actor.crouch && !overlap(actor.x, actor.y, actor.z, R, STAND)) actor.crouch = false;
    moveActor(actor, dt);
  }
}

function moveActor(actor, dt) {
  const h = actor.crouch ? CROUCH_H : STAND;
  const yaw = actor.yaw;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  let wx = 0;
  let wz = 0;
  if (actor.cmd.f) { wx += fx; wz += fz; }
  if (actor.cmd.b) { wx -= fx; wz -= fz; }
  if (actor.cmd.r) { wx += rx; wz += rz; }
  if (actor.cmd.l) { wx -= rx; wz -= rz; }
  const wish = Math.hypot(wx, wz);
  if (wish > 0) { wx /= wish; wz /= wish; }
  let max = actor.crouch ? 2.02 : actor.cmd.walk ? 2.28 : 5.55;
  if (actor.scope > 0.35) max *= 0.46;
  if (actor.grounded) {
    const drag = Math.exp(-9.6 * dt);
    actor.vx *= drag;
    actor.vz *= drag;
    actor.vx += wx * 50 * dt;
    actor.vz += wz * 50 * dt;
    cap(actor, max);
    if (actor.cmd.jump && !actor.crouch) {
      actor.vy = 6.35;
      actor.grounded = false;
    }
  } else {
    actor.vy -= 19.6 * dt;
    actor.vx += wx * 13 * dt;
    actor.vz += wz * 13 * dt;
    cap(actor, Math.max(max, 5.55));
  }
  nudge(actor, actor.vx * dt, 0, rHeight(actor), h);
  nudge(actor, 0, actor.vz * dt, rHeight(actor), h);
  const dy = actor.vy * dt;
  actor.y += dy;
  if (overlap(actor.x, actor.y, actor.z, R, h)) {
    actor.y -= dy;
    if (dy <= 0) actor.grounded = true;
    actor.vy = 0;
  } else if (dy <= 0) {
    const old = actor.y;
    actor.y = old - 0.58;
    if (overlap(actor.x, actor.y, actor.z, R, h)) {
      let lo = old - 0.58;
      let hi = old;
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) * 0.5;
        actor.y = mid;
        if (overlap(actor.x, actor.y, actor.z, R, h)) lo = mid;
        else hi = mid;
      }
      actor.y = hi;
      actor.grounded = true;
      actor.vy = 0;
    } else {
      actor.y = old;
      actor.grounded = false;
    }
  } else {
    actor.grounded = false;
  }
  if (actor.y < -2) {
    actor.y = 0.2;
    actor.vy = 0;
    actor.grounded = false;
  }
  const speed = Math.hypot(actor.vx, actor.vz);
  if (actor.grounded && speed > 0.9) {
    actor.stepAcc += dt * (actor.crouch ? 0.65 : actor.cmd.walk ? 0.8 : 1.2);
    if (actor.stepAcc > 0.46) {
      actor.stepAcc = 0;
      const radius = actor.crouch ? 4.2 : actor.cmd.walk ? 7.5 : 14;
      emitSound('step', actor.x, actor.z, actor.org, radius);
      if (actor.id === 0) step();
    }
  }
}

function rHeight() {
  return R;
}

function cap(actor, max) {
  const sp = Math.hypot(actor.vx, actor.vz);
  if (sp > max) {
    actor.vx = actor.vx / sp * max;
    actor.vz = actor.vz / sp * max;
  }
}

function nudge(actor, dx, dz, r, h) {
  if (dx) {
    actor.x += dx;
    if (overlap(actor.x, actor.y, actor.z, r, h)) {
      actor.x -= dx;
      if (actor.vy <= 0.2 && tryStep(actor, dx, 0, r, h)) return;
      actor.vx = 0;
    }
  }
  if (dz) {
    actor.z += dz;
    if (overlap(actor.x, actor.y, actor.z, r, h)) {
      actor.z -= dz;
      if (actor.vy <= 0.2 && tryStep(actor, 0, dz, r, h)) return;
      actor.vz = 0;
    }
  }
}

function tryStep(actor, dx, dz, r, h) {
  actor.y += STEP_H;
  actor.x += dx;
  actor.z += dz;
  if (overlap(actor.x, actor.y, actor.z, r, h)) {
    actor.x -= dx;
    actor.z -= dz;
    actor.y -= STEP_H;
    return false;
  }
  return true;
}
