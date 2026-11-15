// Single match state for Lantern Pass. Simulation modules mutate this;
// rendering and the HUD only read it.

import { makeRng } from './rng.js';

export const STEP = 1 / 60;
export const MATCH_TARGET = 9;
export const BUY_TIME = 15;
export const LIVE_TIME = 90;
export const END_TIME = 5.5;
export const CHARGE_TIME = 35;
export const PLANT_TIME = 3.2;
export const DEFUSE_BARE = 10;
export const DEFUSE_KIT = 5;

export const ORG = {
  ridge: { name: 'Ridge Runners', short: 'RIDGE' },
  guard: { name: 'Estate Guard', short: 'GUARD' },
};

const RIDGE = ['JUNIPER', 'MOSS', 'BRAM', 'SAFFRON', 'LINEN'];
const GUARD = ['IVO', 'NESSA', 'CALDER', 'YEW', 'PEMA'];

function blankCmd() {
  return {
    f: false, b: false, l: false, r: false,
    jump: false, crouch: false, walk: false,
    fire: false, reload: false, use: false, scope: false,
  };
}

function makeActor(id) {
  return {
    id, name: '', org: 'ridge', bot: true, order: 0,
    x: 0, y: 0, z: 0, yaw: 0, pitch: 0,
    vx: 0, vy: 0, vz: 0,
    hp: 100, armour: 0, helmet: false, alive: false, survived: false,
    money: 800, kills: 0, deaths: 0,
    primary: null, secondary: 'wick', slot: 'secondary',
    ammo: {},
    nades: { spark: 0, glimmer: 0, veil: 0 },
    kit: false,
    crouch: false, walk: false, grounded: false,
    cmd: blankCmd(),
    reload: 0, cooldown: 0, draw: 0, dry: 0,
    recoilI: 0, recoilT: 0, recoilP: 0, recoilY: 0,
    blind: 0, scope: 0,
    path: new Int16Array(32), pathN: 0, pathI: 0,
    goal: -1, think: 0, stuck: 0, stuckX: 0, stuckZ: 0,
    aimYaw: 0, aimPitch: 0, target: -1, hold: -1, role: 'flex',
    utilCd: 0, radioCd: 0, burst: 0, burstCd: 0, scopeT: 0,
    stepAcc: 0, invest: -1, investT: 0, mode: 'path', throw: '',
    assists: 0, tagged: -1,
  };
}

function pool(n, fill) {
  const a = [];
  for (let i = 0; i < n; i++) a.push(fill());
  return a;
}

export const state = {
  phase: 'title',
  seed: 1,
  rng: makeRng(1),
  time: 0,
  phaseT: 0,
  round: 1,
  score: { ridge: 0, guard: 0 },
  loss: { ridge: 0, guard: 0 },
  attackOrg: 'ridge',
  swapped: false,
  plan: 0,
  frozen: false,
  paused: false,
  buyOpen: false,
  scoreOpen: false,
  difficulty: 1,
  toast: '',
  toastT: 0,
  playerOrg: 'ridge',
  actors: [],
  charge: {
    state: 'carried', carrier: -1, x: 0, y: 0, z: 0,
    site: -1, plant: 0, defuse: 0, defuser: -1, timer: 0, told: false,
  },
  smokes: pool(6, () => ({ life: 0, x: 0, y: 0, z: 0, r: 4.2 })),
  nades: pool(10, () => ({
    life: 0, kind: 'spark', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fuse: 0, org: 'ridge', owner: -1,
  })),
  tracers: pool(36, () => ({ life: 0, x: 0, y: 0, z: 0, x2: 0, y2: 0, z2: 0, crit: false })),
  tracerN: 0,
  impacts: pool(16, () => ({ life: 0, x: 0, y: 0, z: 0 })),
  impactN: 0,
  drops: pool(8, () => ({ life: 0, id: '', x: 0, y: 0, z: 0 })),
  dropN: 0,
  sounds: pool(16, () => ({ until: 0, x: 0, z: 0, kind: 'gun', org: 'ridge', r: 0 })),
  soundN: 0,
  radio: ['', '', '', ''],
  kills: pool(5, () => ({ text: '', org: 'ridge', life: 0 })),
  banner: { show: false, title: '', sub: '', money: '' },
  hitMarker: 0,
  hurt: 0,
  headMarker: false,
  sens: 1.1,
  spectate: -1,
  shot: '',
};

for (let i = 0; i < 10; i++) state.actors.push(makeActor(i));

export function player() {
  return state.actors[0];
}

export function sideOf(actor) {
  return actor.org === state.attackOrg ? 'attack' : 'defense';
}

export function enemyOrg(org) {
  return org === 'ridge' ? 'guard' : 'ridge';
}

export function assignSides(playerOrg) {
  state.playerOrg = playerOrg;
  const mates = playerOrg === 'ridge' ? RIDGE : GUARD;
  const foes = playerOrg === 'ridge' ? GUARD : RIDGE;
  const enemy = enemyOrg(playerOrg);
  const you = state.actors[0];
  you.name = 'ASH';
  you.org = playerOrg;
  you.bot = false;
  you.order = 0;
  for (let i = 0; i < 4; i++) {
    const a = state.actors[i + 1];
    a.name = mates[i];
    a.org = playerOrg;
    a.bot = true;
    a.order = i + 1;
  }
  for (let i = 0; i < 5; i++) {
    const a = state.actors[i + 5];
    a.name = foes[i];
    a.org = enemy;
    a.bot = true;
    a.order = i;
  }
}

export function clearCmd(cmd) {
  cmd.f = cmd.b = cmd.l = cmd.r = false;
  cmd.jump = cmd.crouch = cmd.walk = false;
  cmd.fire = cmd.reload = cmd.use = cmd.scope = false;
}

export function emitSound(kind, x, z, org, radius) {
  const s = state.sounds[state.soundN % state.sounds.length];
  state.soundN++;
  s.kind = kind;
  s.x = x;
  s.z = z;
  s.org = org;
  s.r = radius;
  s.until = state.time + (kind === 'gun' ? 1.35 : 0.7);
}

export function pushRadio(text) {
  const r = state.radio;
  r[0] = r[1];
  r[1] = r[2];
  r[2] = r[3];
  r[3] = text;
}

export function pushKill(text, org) {
  for (let i = state.kills.length - 1; i > 0; i--) {
    const a = state.kills[i];
    const b = state.kills[i - 1];
    a.text = b.text;
    a.org = b.org;
    a.life = b.life;
  }
  state.kills[0].text = text;
  state.kills[0].org = org;
  state.kills[0].life = 6;
}

export function addTracer(x, y, z, x2, y2, z2, crit) {
  const t = state.tracers[state.tracerN % state.tracers.length];
  state.tracerN++;
  t.life = 0.18;
  t.x = x;
  t.y = y;
  t.z = z;
  t.x2 = x2;
  t.y2 = y2;
  t.z2 = z2;
  t.crit = crit;
}

export function addImpact(x, y, z) {
  const t = state.impacts[state.impactN % state.impacts.length];
  state.impactN++;
  t.life = 0.35;
  t.x = x;
  t.y = y;
  t.z = z;
}

export function bootRng(seed) {
  state.seed = seed >>> 0 || 1;
  state.rng = makeRng(state.seed);
}
