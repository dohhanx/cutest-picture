// Fixed-step loop. Simulation advances at 60 Hz; rendering only samples it.

import { state, player, STEP } from './state.js';
import { tickMovement } from './player.js';
import { tickWeapons } from './weapons.js';
import { tickBots } from './bots.js';
import { tickGrenades } from './grenades.js';
import { tickRound, startMatch, clockText } from './rounds.js';
import { bindHud, syncHud } from './hud.js';
import { buildWorld, syncWorld, renderWorld, resize } from './world.js';
import { bindInput, writePlayerCmd, edge, held } from './input.js';
import { tickBeep, unlock } from './audio.js';
import { applyShot } from './shots.js';
import { auditMap } from './map.js';
import { buy } from './economy.js';
import { giveGun } from './weapons.js';

const canvas = document.getElementById('game');
const params = new URLSearchParams(location.search);
const shotName = params.get('shot') || '';
const seedParam = Number(params.get('seed'));
const seed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam >>> 0 : ((Math.random() * 0xffffffff) >>> 0);

let acc = 0;
let last = performance.now();
let ready = false;

bindInput(canvas);
buildWorld(canvas);
bindHud(document);
resize();

const audit = auditMap();
if (audit.length) console.warn('map audit: ' + audit.join('; '));

if (shotName) applyShot(shotName, seed || 7);
else state.phase = 'title';

document.getElementById('diff').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const levels = [1.55, 1, 0.62];
  state.difficulty = levels[Number(button.dataset.d)] || 1;
  const all = document.querySelectorAll('#diff button');
  for (let i = 0; i < all.length; i++) all[i].classList.toggle('on', all[i] === button);
});
document.getElementById('play-ridge').addEventListener('click', () => begin('ridge'));
document.getElementById('play-guard').addEventListener('click', () => begin('guard'));
document.getElementById('resume').addEventListener('click', () => {
  state.paused = false;
  canvas.requestPointerLock();
});
document.getElementById('buy-close').addEventListener('click', () => {
  state.buyOpen = false;
  canvas.requestPointerLock();
});
document.getElementById('match-again').addEventListener('click', () => {
  state.phase = 'title';
  state.banner.show = false;
  state.paused = false;
});
canvas.addEventListener('click', () => {
  unlock();
  if (state.phase === 'title' || state.phase === 'match' || state.buyOpen || state.paused) return;
  canvas.requestPointerLock();
});
addEventListener('resize', resize);
addEventListener('error', (event) => {
  const node = document.getElementById('boot-error');
  node.hidden = false;
  node.textContent = event.message || 'error';
});

window.__lantern = {
  get ready() { return ready; },
  state,
  audit,
  start: begin,
  step(n) {
    const count = n || 1;
    for (let i = 0; i < count; i++) simulate(STEP);
    syncWorld();
    syncHud();
    renderWorld();
  },
  buy(id) { return buy(player(), id); },
  clock: clockText,
};

function begin(org) {
  unlock();
  state.shot = '';
  state.frozen = false;
  state.paused = false;
  startMatch(org);
  canvas.requestPointerLock();
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!state.frozen) {
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      simulate(STEP);
      acc -= STEP;
      steps += 1;
    }
  }
  syncWorld();
  syncHud();
  renderWorld();
  if (!ready) ready = true;
  requestAnimationFrame(frame);
}

function simulate(dt) {
  if (state.paused) return;
  state.time += dt;
  if (state.phase === 'title' || state.phase === 'match') return;
  writePlayerCmd(player().cmd);
  hotkeys();
  tickBots(dt);
  tickMovement(dt);
  tickGrenades(dt);
  tickWeapons(dt);
  tickRound(dt);
  tickDrops(dt);
  decay(dt);
  tickBeep(state.charge, state.time);
}

function hotkeys() {
  const you = player();
  if (!you.alive) return;
  if (edge('Digit1')) { you.slot = 'secondary'; you.draw = 0.25; }
  if (edge('Digit2') && you.primary) { you.slot = 'primary'; you.draw = 0.25; }
  if (edge('Digit4') && you.nades.spark > 0) you.slot = 'spark';
  if (edge('Digit5') && you.nades.glimmer > 0) you.slot = 'glimmer';
  if (edge('Digit6') && you.nades.veil > 0) you.slot = 'veil';
  if (edge('KeyB') && state.phase === 'buy') {
    state.buyOpen = !state.buyOpen;
    if (state.buyOpen) document.exitPointerLock();
  }
  if (edge('Escape')) state.paused = !state.paused;
  state.scoreOpen = held('Tab');
}

function tickDrops(dt) {
  const you = player();
  const drops = state.drops;
  for (let i = 0; i < drops.length; i++) {
    const drop = drops[i];
    if (drop.life <= 0) continue;
    drop.life -= dt;
    if (!you.alive) continue;
    const dx = you.x - drop.x;
    const dz = you.z - drop.z;
    if (dx * dx + dz * dz > 1.7 || Math.abs(you.y - drop.y) > 1.5) continue;
    if (!you.primary || you.cmd.useEdge) {
      giveGun(you, drop.id);
      drop.life = 0;
    }
  }
}

function decay(dt) {
  const tracers = state.tracers;
  for (let i = 0; i < tracers.length; i++) if (tracers[i].life > 0) tracers[i].life -= dt;
  const impacts = state.impacts;
  for (let i = 0; i < impacts.length; i++) if (impacts[i].life > 0) impacts[i].life -= dt;
}

requestAnimationFrame(frame);
