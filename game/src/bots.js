// Bots path on the nav graph, hold angles, and react to what they see and hear.
// Utility, planting and defusing go through the same commands as the player.

import { state, sideOf, pushRadio, clearCmd } from './state.js';
import { nodes, nodeByName, nearestNode, regionName, sites } from './map.js';
import { route } from './nav.js';
import { eyeY, lineClear } from './combat.js';
import { gunId, GUNS, ammoOf } from './weapons.js';

const TAU = 6.2831853;

export function tickBots(dt) {
  const list = state.actors;
  for (let i = 0; i < list.length; i++) {
    const actor = list[i];
    if (!actor.bot || !actor.alive) continue;
    if (actor.blind > 0) actor.blind -= dt;
    if (actor.utilCd > 0) actor.utilCd -= dt;
    if (actor.radioCd > 0) actor.radioCd -= dt;
    if (actor.investT > 0) actor.investT -= dt;
    actor.think -= dt;
    if (actor.think <= 0) {
      actor.think = 0.16;
      decide(actor);
    }
    steer(actor, dt);
  }
}

export function assignGoals() {
  const plan = state.plan;
  const list = state.actors;
  for (let i = 0; i < list.length; i++) {
    const actor = list[i];
    actor.goal = -1;
    actor.pathN = 0;
    actor.pathI = 0;
    actor.target = -1;
    actor.invest = -1;
    actor.investT = 0;
    if (!actor.bot) continue;
    if (sideOf(actor) === 'defense') {
      const holds = plan === 0
        ? ['aHold', 'bHold', 'mid', 'al3', 'conB']
        : ['bHold', 'aHold', 'mid', 'el3', 'conA'];
      actor.hold = nodeByName(holds[actor.order] || 'mid');
      actor.role = 'hold';
    } else {
      const roles = ['site', 'alley', 'mid', 'east', 'site'];
      actor.role = roles[actor.order] || 'site';
      actor.hold = nodeByName(plan === 0 ? 'aDoor' : 'bDoor');
    }
  }
}

function decide(actor) {
  clearCmd(actor.cmd);
  if (actor.blind > 0.85) {
    actor.target = -1;
    actor.mode = 'blind';
    return;
  }
  const seen = acquire(actor);
  if (seen >= 0 && seen !== actor.target && actor.radioCd <= 0) {
    const foe = state.actors[seen];
    pushRadio(actor.name + ': Contact, ' + regionName(foe.x, foe.z) + '.');
    actor.radioCd = 3.6;
    actor.burst = 0.42;
    actor.burstCd = 0;
  }
  actor.target = seen;
  if (seen >= 0) {
    const foe = state.actors[seen];
    const ey = eyeY(actor);
    const dx = foe.x - actor.x;
    const dy = (foe.y + 1.15) - ey;
    const dz = foe.z - actor.z;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const err = (actor.crouch ? 0.01 : 0.028) + Math.min(0.06, dist * 0.0012);
    const rng = state.rng;
    actor.aimYaw = Math.atan2(-dx, -dz) + (rng.next() - 0.5) * err;
    actor.aimPitch = Math.atan2(dy, Math.hypot(dx, dz)) + (rng.next() - 0.5) * err * 0.5;
    actor.mode = 'fight';
    maybeThrow(actor, foe, dist);
    return;
  }
  const heard = hear(actor);
  if (heard && actor.investT <= 0) {
    actor.invest = nearestNode(heard.x, heard.z);
    actor.investT = heard.kind === 'gun' ? 3.2 : 2;
    if (heard.kind === 'step' && actor.radioCd <= 0) {
      pushRadio(actor.name + ': Footsteps, ' + regionName(heard.x, heard.z) + '.');
      actor.radioCd = 4.5;
    }
  }
  actor.mode = objective(actor);
  const face = nodes[actor.goal];
  if (face) actor.aimYaw = Math.atan2(-(face.x - actor.x), -(face.z - actor.z));
  actor.aimPitch = 0;
}

function steer(actor, dt) {
  const cmd = actor.cmd;
  cmd.f = cmd.b = cmd.l = cmd.r = false;
  cmd.jump = false;
  cmd.fire = false;
  cmd.fireEdge = false;
  cmd.use = false;
  cmd.useEdge = false;
  cmd.scope = false;
  if (actor.mode === 'blind') {
    turn(actor, dt, 1.2);
    return;
  }
  if (actor.mode === 'fight') fight(actor, dt);
  else walkPath(actor, dt);
  if (actor.mode === 'plant') tryPlant(actor);
  if (actor.mode === 'defuse') tryDefuse(actor);
  if (actor.mode === 'pickup') tryPickup(actor);
  if (actor.mode === 'hold') holdAngle(actor);
  const id = gunId(actor);
  const ammo = id ? ammoOf(actor, id) : null;
  if (ammo && ammo.mag <= 0) {
    cmd.reload = true;
    cmd.fire = false;
  }
}

function fight(actor, dt) {
  const cmd = actor.cmd;
  const foe = state.actors[actor.target];
  if (!foe || !foe.alive) { actor.target = -1; actor.mode = 'path'; return; }
  const dist = Math.hypot(foe.x - actor.x, foe.z - actor.z);
  turn(actor, dt, 7.5);
  const gun = GUNS[gunId(actor) || 'wick'];
  if (gun && gun.scope) {
    cmd.scope = true;
    cmd.crouch = true;
    actor.scopeT += dt;
    if (actor.scopeT > 0.38 && aimed(actor)) cmd.fireEdge = true;
  } else if (aimed(actor) && actor.blind < 1.1) {
    if (actor.burstCd > 0) actor.burstCd -= dt;
    else {
      cmd.fire = true;
      cmd.fireEdge = true;
      actor.burst -= dt;
      if (actor.burst <= 0) {
        actor.burst = 0.3 + (actor.order % 3) * 0.1;
        actor.burstCd = 0.28 + (actor.id % 4) * 0.05;
      }
    }
  }
  if (dist > 16) cmd.f = true;
  else if (dist < 5) cmd.b = (actor.id + (state.time * 2 | 0)) % 2 === 0;
  else if (((state.time + actor.id) % 1.4) < 0.45) cmd.l = true;
  else cmd.r = true;
  if (dist > 8 && dist < 22) cmd.crouch = actor.order % 2 === 0;
}

function walkPath(actor, dt) {
  if (actor.pathI >= actor.pathN) {
    actor.aimPitch = 0;
    turn(actor, dt, 4);
    return;
  }
  const n = nodes[actor.path[actor.pathI]];
  const dx = n.x - actor.x;
  const dz = n.z - actor.z;
  if (dx * dx + dz * dz < 0.72) {
    actor.pathI += 1;
    return;
  }
  actor.aimYaw = Math.atan2(-dx, -dz);
  actor.aimPitch = 0;
  turn(actor, dt, 5);
  actor.cmd.f = true;
  if (n.y > actor.y + 0.34 && dx * dx + dz * dz < 3.4) actor.cmd.jump = true;
  const moved = Math.hypot(actor.x - actor.stuckX, actor.z - actor.stuckZ);
  if (moved < 0.05) actor.stuck += dt;
  else {
    actor.stuck = 0;
    actor.stuckX = actor.x;
    actor.stuckZ = actor.z;
  }
  if (actor.stuck > 0.75) {
    actor.cmd.jump = true;
    actor.goal = -1;
    actor.stuck = 0;
  }
}

function tryPlant(actor) {
  const site = sites[state.plan];
  const dx = actor.x - site.x;
  const dz = actor.z - site.z;
  if (dx * dx + dz * dz > (site.r - 0.15) * (site.r - 0.15)) return;
  if (actor.target >= 0) return;
  actor.cmd.f = false;
  actor.cmd.use = true;
}

function tryDefuse(actor) {
  const charge = state.charge;
  const dx = actor.x - charge.x;
  const dz = actor.z - charge.z;
  if (dx * dx + dz * dz > 2.6 || actor.target >= 0) return;
  actor.cmd.f = false;
  actor.cmd.use = true;
  actor.cmd.crouch = true;
}

function tryPickup(actor) {
  const charge = state.charge;
  const dx = actor.x - charge.x;
  const dz = actor.z - charge.z;
  if (dx * dx + dz * dz < 2.1) actor.cmd.useEdge = true;
}

function holdAngle(actor) {
  const n = nodes[actor.hold];
  if (!n || actor.target >= 0) return;
  const dx = actor.x - n.x;
  const dz = actor.z - n.z;
  if (dx * dx + dz * dz > 1.6) return;
  actor.cmd.f = false;
  actor.cmd.crouch = true;
  if (n.face != null) actor.aimYaw = n.face;
}

function objective(actor) {
  const charge = state.charge;
  if (sideOf(actor) === 'attack') {
    if (charge.state === 'carried' && charge.carrier === actor.id) {
      go(actor, nodeByName(state.plan === 0 ? 'aSite' : 'bSite'));
      return 'plant';
    }
    if (charge.state === 'dropped') {
      go(actor, nearestNode(charge.x, charge.z));
      return 'pickup';
    }
    if (charge.state === 'planted') {
      go(actor, nodeByName(charge.site === 0 ? 'aHold' : 'bHold'));
      return 'hold';
    }
    const route = actor.role === 'alley' ? 'al2' : actor.role === 'east' ? 'el2' : actor.role === 'mid' ? 'weigh' : (state.plan ? 'bDoor' : 'aDoor');
    const dest = nodeByName(route);
    const n = nodes[dest];
    const near = n && (actor.x - n.x) ** 2 + (actor.z - n.z) ** 2 < 5;
    if (near && actor.role !== 'site') go(actor, nodeByName(state.plan ? 'bDoor' : 'aDoor'));
    else go(actor, dest);
    return 'path';
  }
  if (charge.state === 'planted') {
    go(actor, nodeByName(charge.site === 0 ? 'aSite' : 'bSite'));
    return actor.order % 2 === 0 ? 'defuse' : 'hold';
  }
  if (actor.investT > 0 && actor.invest >= 0) {
    go(actor, actor.invest);
    return 'path';
  }
  go(actor, actor.hold);
  return 'hold';
}

function go(actor, index) {
  if (index == null || index < 0) return;
  if (actor.goal === index && actor.pathN > 0) return;
  actor.goal = index;
  const start = nearestNode(actor.x, actor.z);
  actor.pathN = route(start, index, actor.path);
  actor.pathI = 0;
}

function maybeThrow(actor, foe, dist) {
  if (actor.utilCd > 0 || dist < 5 || dist > 28) return;
  const rng = state.rng;
  if (actor.nades.glimmer > 0 && dist > 8 && rng.chance(0.22)) {
    actor.throw = 'glimmer';
    actor.utilCd = 8;
    pushRadio(actor.name + ': Glimmer flash, ' + regionName(foe.x, foe.z) + '.');
    return;
  }
  if (actor.nades.veil > 0 && dist > 10 && rng.chance(0.16)) {
    actor.throw = 'veil';
    actor.utilCd = 9;
    pushRadio(actor.name + ': Veil smoke, ' + regionName((actor.x + foe.x) * 0.5, (actor.z + foe.z) * 0.5) + '.');
    return;
  }
  if (actor.nades.spark > 0 && dist < 16 && rng.chance(0.14)) {
    actor.throw = 'spark';
    actor.utilCd = 7;
  }
}

function acquire(actor) {
  let best = -1;
  let bd = 1e9;
  const ey = eyeY(actor);
  const fx = -Math.sin(actor.yaw);
  const fz = -Math.cos(actor.yaw);
  const list = state.actors;
  for (let i = 0; i < list.length; i++) {
    const other = list[i];
    if (!other.alive || other.org === actor.org) continue;
    const dx = other.x - actor.x;
    const dz = other.z - actor.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 46 || dist < 0.05) continue;
    const dot = (fx * dx + fz * dz) / dist;
    if (dist > 6 && dot < 0.34) continue;
    const by = other.y + (other.crouch ? 0.9 : 1.3);
    if (!lineClear(actor.x, ey, actor.z, other.x, by, other.z)) continue;
    if (dist < bd) { bd = dist; best = other.id; }
  }
  return best;
}

function hear(actor) {
  let best = null;
  let bd = 1e9;
  const sounds = state.sounds;
  for (let i = 0; i < sounds.length; i++) {
    const s = sounds[i];
    if (s.until < state.time) continue;
    if (s.kind === 'step' && s.org === actor.org) continue;
    const d = Math.hypot(s.x - actor.x, s.z - actor.z);
    if (d > s.r || d < 0.8 || d >= bd) continue;
    bd = d;
    best = s;
  }
  return best;
}

function turn(actor, dt, rate) {
  let d = actor.aimYaw - actor.yaw;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  const max = rate * dt;
  if (d > max) d = max;
  else if (d < -max) d = -max;
  actor.yaw += d;
  let p = actor.aimPitch - actor.pitch;
  if (p > max) p = max;
  else if (p < -max) p = -max;
  actor.pitch += p;
  if (actor.pitch > 1.05) actor.pitch = 1.05;
  if (actor.pitch < -0.75) actor.pitch = -0.75;
}

function aimed(actor) {
  let d = actor.aimYaw - actor.yaw;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return Math.abs(d) < 0.1 && Math.abs(actor.aimPitch - actor.pitch) < 0.12;
}
