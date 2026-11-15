// Deterministic frames for the dossier screenshots. Each one is a real
// simulation state: guns fire through fireBullet, smoke pops through the
// grenade fuse, and the HUD reads the same fields as a live match.

import { state, player, bootRng, pushKill, pushRadio } from './state.js';
import { startMatch } from './rounds.js';
import { giveGun, ammoOf, GUNS } from './weapons.js';
import { fireBullet } from './combat.js';
import { tickGrenades } from './grenades.js';
import { grant, buy } from './economy.js';
import { sites } from './map.js';

export function applyShot(name, seed) {
  bootRng(seed || 7);
  state.shot = name;
  state.time = 2.8;
  state.frozen = false;
  if (name === 'title') {
    state.phase = 'title';
    state.frozen = true;
    return;
  }
  if (name === 'buy') setupBuy();
  else if (name === 'plant') setupPlant();
  else setupCover();
  state.frozen = true;
}

function setupBuy() {
  startMatch('ridge');
  state.round = 6;
  state.score.ridge = 3;
  state.score.guard = 2;
  grant('ridge', 4200);
  const you = player();
  buy(you, 'ember');
  buy(you, 'armour');
  state.phase = 'buy';
  state.phaseT = 12.4;
  state.buyOpen = true;
  state.banner.show = false;
  you.x = 0.4;
  you.y = 2.05;
  you.z = -4.6;
  you.yaw = 2.35;
  you.pitch = -0.08;
  you.grounded = true;
}

function setupCover() {
  startMatch('ridge');
  state.phase = 'live';
  state.phaseT = 74;
  state.round = 8;
  state.score.ridge = 4;
  state.score.guard = 3;
  state.buyOpen = false;
  state.banner.show = false;
  const you = player();
  you.x = -5.2;
  you.y = 3.05;
  you.z = 8.6;
  you.yaw = 1.92;
  you.pitch = 0.02;
  you.money = 3150;
  you.grounded = true;
  giveGun(you, 'terrace');
  const ammo = ammoOf(you, 'terrace');
  ammo.mag = 18;
  ammo.reserve = 64;
  you.secondary = 'ember';
  ammoOf(you, 'ember');
  you.nades.spark = 1;
  you.nades.glimmer = 1;
  you.nades.veil = 1;
  you.slot = 'primary';

  placeFighter(state.actors[5], -14.2, 3.05, 10.35, you.x + 0.6, you.y + 1.3, you.z - 0.4);
  placeFighter(state.actors[6], -16.8, 3.05, 10.7, -12.5, 4.4, 9.4);
  placeFighter(state.actors[7], -12.4, 3.05, 10.9, -18.6, 4.2, 10.2);
  state.actors[5].muzzleT = 1;
  state.actors[1].alive = false;
  state.actors[4].alive = false;
  state.actors[8].alive = false;
  state.actors[9].alive = false;

  const nade = state.nades[0];
  nade.life = 1;
  nade.kind = 'veil';
  nade.fuse = 0.02;
  nade.owner = 1;
  nade.org = 'ridge';
  nade.x = -9.2;
  nade.y = 3.4;
  nade.z = 6.6;
  nade.vx = 0;
  nade.vy = 0;
  nade.vz = 0;
  tickGrenades(0.05);

  fireBullet(state.actors[5], GUNS.terrace, 'terrace');
  aim(state.actors[5], you.x + 0.6, you.y + 1.3, you.z - 0.4);
  fireBullet(state.actors[7], GUNS.terrace, 'terrace');
  aim(state.actors[7], -8.4, 4.3, 9.6);
  you.alive = true;
  you.hp = 72;
  you.armour = 86;
  you.helmet = true;
  state.hitMarker = 0.5;
  state.headMarker = false;

  pushKill('MOSS   Terrace   IVO', 'ridge');
  pushKill('NESSA   Ember   BRAM', 'guard');
  pushKill('JUNIPER   Terrace   CALDER', 'ridge');
  pushRadio('JUNIPER: Contact, Drying House.');
  pushRadio('MOSS: Veil smoke, mid.');
  pushRadio('IVO: Rotating to Drying House.');
  state.charge.carrier = 2;
  state.charge.state = 'carried';
  const carrier = state.actors[2];
  carrier.x = -2;
  carrier.y = 3.05;
  carrier.z = 18;
  state.charge.x = carrier.x;
  state.charge.y = carrier.y + 0.85;
  state.charge.z = carrier.z;
}

function setupPlant() {
  startMatch('guard');
  state.phase = 'live';
  state.phaseT = 40;
  state.round = 7;
  state.score.ridge = 3;
  state.score.guard = 3;
  state.buyOpen = false;
  state.banner.show = false;
  const you = player();
  you.x = 21.35;
  you.y = 3.05;
  you.z = 14.9;
  you.yaw = Math.PI - 0.42;
  you.pitch = -0.06;
  you.hp = 64;
  you.armour = 48;
  you.helmet = true;
  you.kit = true;
  you.money = 2400;
  you.grounded = true;
  giveGun(you, 'ridgefire');
  const ammo = ammoOf(you, 'ridgefire');
  ammo.mag = 14;
  ammo.reserve = 40;
  you.nades.glimmer = 1;
  you.slot = 'primary';
  const site = sites[1];
  const charge = state.charge;
  charge.state = 'planted';
  charge.site = 1;
  charge.carrier = -1;
  charge.timer = 27.4;
  charge.defuse = 1.6;
  charge.x = site.x;
  charge.y = site.y + 0.28;
  charge.z = site.z;
  placeFighter(state.actors[5], 18.6, 3.05, 16.4, you.x, 4.1, you.z);
  state.actors[5].org = 'ridge';
  state.actors[6].alive = true;
  state.actors[6].x = 17.4;
  state.actors[6].y = 3.05;
  state.actors[6].z = 17.2;
  state.actors[6].yaw = 0.4;
  pushRadio('SAFFRON: Charge live at Ropeway Station.');
  pushRadio('NESSA: Cabin side, I have it.');
  pushKill('LINEN   Ridgefire   YEW', 'ridge');
}

function placeFighter(actor, x, y, z, ax, ay, az) {
  actor.alive = true;
  actor.x = x;
  actor.y = y;
  actor.z = z;
  actor.hp = 78;
  actor.grounded = true;
  actor.crouch = false;
  giveGun(actor, actor.id === 6 ? 'thresher' : 'terrace');
  aim(actor, ax, ay, az);
}

function aim(actor, x, y, z) {
  const dx = x - actor.x;
  const dy = y - (actor.y + 1.56);
  const dz = z - actor.z;
  actor.yaw = Math.atan2(-dx, -dz);
  actor.pitch = Math.atan2(dy, Math.hypot(dx, dz));
}

function eye(actor) {
  return actor.y + 1.56;
}
