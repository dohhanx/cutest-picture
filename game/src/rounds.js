// Buy, live, plant, defuse, halftime and the race to 9.

import {
  state, player, sideOf, assignSides, clearCmd, pushRadio, ORG,
  BUY_TIME, LIVE_TIME, END_TIME, CHARGE_TIME, PLANT_TIME, DEFUSE_KIT, DEFUSE_BARE, MATCH_TARGET,
} from './state.js';
import { SPAWN, sites, siteIndexAt } from './map.js';
import { ammoOf } from './weapons.js';
import { botBuy, awardRound, grantActor } from './economy.js';
import { assignGoals } from './bots.js';

export function startMatch(org) {
  assignSides(org);
  state.score.ridge = 0;
  state.score.guard = 0;
  state.loss.ridge = 0;
  state.loss.guard = 0;
  state.attackOrg = 'ridge';
  state.swapped = false;
  state.round = 1;
  state.banner.show = false;
  const list = state.actors;
  for (let i = 0; i < list.length; i++) {
    const actor = list[i];
    actor.money = 800;
    actor.kills = 0;
    actor.deaths = 0;
    actor.survived = false;
    actor.primary = null;
    actor.secondary = 'wick';
    actor.ammo = {};
    actor.kit = false;
    actor.armour = 0;
    actor.helmet = false;
  }
  beginRound();
}

export function beginRound() {
  if (state.round === 9 && !state.swapped) {
    state.attackOrg = state.attackOrg === 'ridge' ? 'guard' : 'ridge';
    state.swapped = true;
    const list = state.actors;
    for (let i = 0; i < list.length; i++) {
      const actor = list[i];
      actor.money = 800;
      actor.survived = false;
      actor.primary = null;
      actor.ammo = {};
    }
    pushRadio('Halftime. The two sides swap the estate.');
  }
  state.phase = 'buy';
  state.phaseT = BUY_TIME;
  state.buyOpen = state.shot === '' || state.shot === 'buy';
  state.paused = false;
  state.plan = state.rng.chance(0.5) ? 0 : 1;
  state.banner.show = false;
  clearWorld();
  const list = state.actors;
  for (let i = 0; i < list.length; i++) prepare(list[i]);
  const charge = state.charge;
  charge.state = 'carried';
  charge.plant = 0;
  charge.defuse = 0;
  charge.timer = 0;
  charge.site = -1;
  charge.told = false;
  charge.defuser = -1;
  charge.carrier = pickCarrier();
  assignGoals();
  for (let i = 0; i < list.length; i++) if (list[i].bot) botBuy(list[i]);
  const atk = ORG[state.attackOrg].short;
  pushRadio(atk + ' taking ' + sites[state.plan].name + '.');
}

function prepare(actor) {
  const side = sideOf(actor);
  const spots = SPAWN[side];
  const spot = spots[actor.order] || spots[0];
  actor.x = spot[0];
  actor.y = spot[1] + 0.05;
  actor.z = spot[2];
  actor.yaw = side === 'attack' ? Math.PI : 0;
  actor.pitch = 0;
  actor.vx = 0;
  actor.vy = 0;
  actor.vz = 0;
  actor.hp = 100;
  actor.alive = true;
  actor.grounded = true;
  actor.crouch = false;
  actor.blind = 0;
  actor.reload = 0;
  actor.cooldown = 0;
  actor.draw = 0;
  actor.recoilI = 0;
  actor.recoilP = 0;
  actor.recoilY = 0;
  actor.scope = 0;
  actor.target = -1;
  actor.goal = -1;
  actor.throw = '';
  clearCmd(actor.cmd);
  if (!actor.survived) {
    actor.primary = null;
    actor.secondary = 'wick';
    actor.slot = 'secondary';
    actor.armour = 0;
    actor.helmet = false;
    actor.kit = false;
    actor.nades.spark = 0;
    actor.nades.glimmer = 0;
    actor.nades.veil = 0;
    actor.ammo = {};
  } else {
    actor.slot = actor.primary ? 'primary' : 'secondary';
    if (!actor.secondary) actor.secondary = 'wick';
  }
  ammoOf(actor, actor.secondary || 'wick');
  if (actor.primary) ammoOf(actor, actor.primary);
}

function pickCarrier() {
  const list = state.actors;
  for (let i = 0; i < list.length; i++) {
    const actor = list[i];
    if (actor.bot && actor.alive && sideOf(actor) === 'attack') return actor.id;
  }
  const you = player();
  return sideOf(you) === 'attack' ? you.id : list[5].id;
}

function clearWorld() {
  const smokes = state.smokes;
  for (let i = 0; i < smokes.length; i++) smokes[i].life = 0;
  const nades = state.nades;
  for (let i = 0; i < nades.length; i++) nades[i].life = 0;
}

export function tickRound(dt) {
  const list = state.actors;
  for (let i = 0; i < list.length; i++) {
    if (list[i].blind > 0 && !list[i].bot) list[i].blind -= dt;
  }
  for (let i = 0; i < state.kills.length; i++) if (state.kills[i].life > 0) state.kills[i].life -= dt;
  if (state.hitMarker > 0) state.hitMarker -= dt;
  if (state.hurt > 0) state.hurt = Math.max(0, state.hurt - dt * 0.8);
  if (state.phase === 'buy') {
    state.phaseT -= dt;
    if (state.phaseT <= 0) goLive();
    return;
  }
  if (state.phase === 'live') {
    const charge = state.charge;
    if (charge.state === 'planted') {
      charge.timer -= dt;
      if (charge.timer <= 0) {
        endRound(state.attackOrg, 'explode');
        return;
      }
    } else {
      state.phaseT -= dt;
      if (state.phaseT <= 0) {
        endRound(defenseOrg(), 'time');
        return;
      }
    }
    tickObjective(dt);
    if (state.phase !== 'live') return;
    checkWipe();
    return;
  }
  if (state.phase === 'end') {
    state.phaseT -= dt;
    if (state.phaseT <= 0) {
      state.round += 1;
      beginRound();
    }
  }
}

function goLive() {
  state.phase = 'live';
  state.phaseT = LIVE_TIME;
  state.buyOpen = false;
  state.banner.show = false;
}

function defenseOrg() {
  return state.attackOrg === 'ridge' ? 'guard' : 'ridge';
}

export function endRound(winner, reason) {
  if (state.phase === 'end' || state.phase === 'match') return;
  state.score[winner] += 1;
  const pay = awardRound(winner, reason);
  const you = player();
  const mine = you.org === winner ? pay.winPay : pay.lossPay;
  state.banner.show = true;
  state.banner.title = titleFor(winner, reason);
  state.banner.sub = subFor(reason);
  state.banner.money = '+$' + mine + '  this round';
  const list = state.actors;
  for (let i = 0; i < list.length; i++) list[i].survived = list[i].alive;
  if (state.score[winner] >= MATCH_TARGET) {
    state.phase = 'match';
    state.banner.title = ORG[winner].name + ' take Lantern Pass';
    state.banner.sub = state.score.ridge + '  –  ' + state.score.guard;
  } else {
    state.phase = 'end';
    state.phaseT = END_TIME;
  }
}

function titleFor(winner, reason) {
  if (reason === 'explode') return 'The charge detonates';
  if (reason === 'defuse') return 'The charge is defused';
  if (reason === 'time') return 'Time. The estate holds';
  return ORG[winner].name + ' take the round';
}

function subFor(reason) {
  if (reason === 'explode') return 'Ridge or Guard, the planter\'s side wins';
  if (reason === 'defuse') return 'Defenders snuffed the fuse';
  if (reason === 'time') return 'No plant. Defenders keep the terraces';
  return 'The other side is down';
}

function tickObjective(dt) {
  const charge = state.charge;
  const list = state.actors;
  if (charge.state === 'carried') {
    const carrier = list[charge.carrier];
    if (!carrier || !carrier.alive) {
      charge.state = 'dropped';
      charge.carrier = -1;
      return;
    }
    charge.x = carrier.x;
    charge.y = carrier.y + 0.85;
    charge.z = carrier.z;
    const si = siteIndexAt(carrier.x, carrier.y, carrier.z);
    const speed = Math.hypot(carrier.vx, carrier.vz);
    if (si >= 0 && carrier.cmd.use && speed < 1.5) {
      charge.plant += dt;
      if (!charge.told && charge.plant > 0.25) {
        charge.told = true;
        pushRadio(carrier.name + ': Planting at ' + sites[si].name + '.');
      }
      if (charge.plant >= PLANT_TIME) {
        charge.state = 'planted';
        charge.site = si;
        charge.timer = CHARGE_TIME;
        charge.x = sites[si].x;
        charge.y = sites[si].y + 0.28;
        charge.z = sites[si].z;
        charge.carrier = -1;
        charge.defuse = 0;
        charge.told = false;
        grantActor(carrier, 300);
        pushRadio('Charge live at ' + sites[si].name + '.');
      }
    } else if (charge.plant > 0) charge.plant = Math.max(0, charge.plant - dt);
  } else if (charge.state === 'dropped') {
    for (let i = 0; i < list.length; i++) {
      const actor = list[i];
      if (!actor.alive || sideOf(actor) !== 'attack' || !actor.cmd.useEdge) continue;
      const dx = actor.x - charge.x;
      const dz = actor.z - charge.z;
      if (dx * dx + dz * dz <= 2.4) {
        charge.state = 'carried';
        charge.carrier = actor.id;
        charge.plant = 0;
        charge.told = false;
        break;
      }
    }
  } else if (charge.state === 'planted') {
    let who = null;
    for (let i = 0; i < list.length; i++) {
      const actor = list[i];
      if (!actor.alive || sideOf(actor) !== 'defense' || !actor.cmd.use) continue;
      const dx = actor.x - charge.x;
      const dz = actor.z - charge.z;
      if (dx * dx + dz * dz < 3.4 && Math.hypot(actor.vx, actor.vz) < 1.6) { who = actor; break; }
    }
    if (who) {
      charge.defuser = who.id;
      charge.defuse += dt;
      const need = who.kit ? DEFUSE_KIT : DEFUSE_BARE;
      if (charge.defuse >= need) {
        grantActor(who, 300);
        endRound(who.org, 'defuse');
      }
    } else {
      if (charge.defuse > 0) charge.defuse = Math.max(0, charge.defuse - dt * 1.4);
      charge.defuser = -1;
    }
  }
}

function checkWipe() {
  let attack = 0;
  let defense = 0;
  const list = state.actors;
  for (let i = 0; i < list.length; i++) {
    if (!list[i].alive) continue;
    if (sideOf(list[i]) === 'attack') attack += 1;
    else defense += 1;
  }
  if (defense === 0) endRound(state.attackOrg, 'eliminate');
  else if (attack === 0 && state.charge.state !== 'planted') endRound(defenseOrg(), 'eliminate');
}

export function clockText() {
  let t = state.phaseT;
  if (state.phase === 'live' && state.charge.state === 'planted') return state.charge.timer.toFixed(1);
  if (t < 0) t = 0;
  const s = Math.ceil(t);
  const m = (s / 60) | 0;
  const r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}
