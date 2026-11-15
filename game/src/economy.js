// Round money, loss streak and the buy menu. Bots spend through the same buy().

import { state, sideOf, enemyOrg } from './state.js';
import { GUNS, giveGun } from './weapons.js';

export const NADE_CAP = { spark: 1, glimmer: 2, veil: 1 };

export const CATALOG = [
  { id: 'wick', name: 'Wick', kind: 'Pistol', price: 200, blurb: 'Light sidearm' },
  { id: 'ember', name: 'Ember', kind: 'Pistol', price: 500, blurb: 'Heavy sidearm' },
  { id: 'thresher', name: 'Thresher', kind: 'SMG', price: 1250, blurb: 'Holds together on the move' },
  { id: 'terrace', name: 'Terrace', kind: 'Rifle', price: 2700, blurb: 'First-shot rifle' },
  { id: 'ridgefire', name: 'Ridgefire', kind: 'Rifle', price: 3100, blurb: 'Harder hitting rifle' },
  { id: 'longglass', name: 'Longglass', kind: 'Marksman', price: 4750, blurb: 'Scope. Stand still' },
  { id: 'armour', name: 'Armour', kind: 'Gear', price: 650, blurb: 'Cuirass, 100 armour' },
  { id: 'helm', name: 'Armour + helmet', kind: 'Gear', price: 1000, blurb: 'Stops a pistol headshot' },
  { id: 'kit', name: 'Defuse kit', kind: 'Gear', price: 400, blurb: 'Snuff a charge in 5s' },
  { id: 'spark', name: 'Spark frag', kind: 'Grenade', price: 300, blurb: 'Fuse and a blast' },
  { id: 'glimmer', name: 'Glimmer flash', kind: 'Grenade', price: 200, blurb: 'Blinds anyone looking' },
  { id: 'veil', name: 'Veil smoke', kind: 'Grenade', price: 300, blurb: 'Blocks line of sight' },
];

function priceOf(actor, id) {
  if (id === 'helm') {
    if (actor.armour >= 100 && actor.helmet) return -1;
    return actor.armour >= 100 ? 350 : 1000;
  }
  const gun = GUNS[id];
  if (gun) return gun.price;
  const row = CATALOG.find((item) => item.id === id);
  return row ? row.price : -1;
}

export function buy(actor, id) {
  if (state.phase !== 'buy' || !actor.alive) return false;
  if (id === 'kit' && (sideOf(actor) !== 'defense' || actor.kit)) return false;
  if (id === 'armour' && actor.armour >= 100) return false;
  if (NADE_CAP[id] != null && actor.nades[id] >= NADE_CAP[id]) return false;
  const price = priceOf(actor, id);
  if (price < 0 || actor.money < price) return false;
  if (GUNS[id]) {
    if (id === 'wick' && actor.secondary === 'wick' && !actor.primary) return false;
    actor.money -= price;
    giveGun(actor, id);
    return true;
  }
  actor.money -= price;
  if (id === 'armour') actor.armour = 100;
  else if (id === 'helm') { actor.armour = 100; actor.helmet = true; }
  else if (id === 'kit') actor.kit = true;
  else actor.nades[id] += 1;
  return true;
}

export function botBuy(actor) {
  const side = sideOf(actor);
  if (side === 'defense' && actor.order === 0) buy(actor, 'kit');
  buy(actor, 'helm');
  if (actor.armour < 100) buy(actor, 'armour');
  if (side === 'defense' && actor.order === 1) buy(actor, 'longglass');
  if (!actor.primary) {
    if (!buy(actor, 'ridgefire') && !buy(actor, 'terrace')) buy(actor, 'thresher');
  }
  if (actor.secondary === 'wick') buy(actor, 'ember');
  buy(actor, 'glimmer');
  buy(actor, 'veil');
  buy(actor, 'spark');
  buy(actor, 'glimmer');
}

export function awardRound(winner, reason) {
  const loser = enemyOrg(winner);
  const objective = reason === 'explode' || reason === 'defuse';
  const winPay = objective ? 3500 : 3250;
  const streak = state.loss[loser];
  const lossPay = 1400 + 500 * Math.min(streak, 4);
  state.loss[loser] = Math.min(4, streak + 1);
  state.loss[winner] = 0;
  grant(winner, winPay);
  grant(loser, lossPay);
  return { winPay, lossPay };
}

export function grant(org, amount) {
  const list = state.actors;
  for (let i = 0; i < list.length; i++) {
    if (list[i].org === org) list[i].money += amount;
  }
}

export function grantActor(actor, amount) {
  actor.money += amount;
}
