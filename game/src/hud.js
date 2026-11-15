// DOM HUD. Reads match state; the only allocations are the one-time button list.

import { state, player, sideOf, ORG } from './state.js';
import { CATALOG, buy, NADE_CAP } from './economy.js';
import { GUNS, gunId, ammoOf } from './weapons.js';
import { clockText } from './rounds.js';
import { sites } from './map.js';

const el = {};
let mapCtx = null;
const buyButtons = [];

export function bindHud(root) {
  const ids = [
    'timer', 'round-no', 'n-ridge', 'n-guard', 'money', 'health', 'armour', 'helm',
    'weapon-name', 'ammo-mag', 'ammo-res', 'slot-line', 'killfeed', 'radio',
    'banner', 'banner-title', 'banner-sub', 'banner-money',
    'prompt', 'prompt-label', 'prompt-bar', 'prompt-sub',
    'buy', 'buy-grid', 'buy-cash', 'title', 'pause', 'scoreboard', 'score-body',
    'hint', 'flash', 'hurt', 'scope', 'crosshair', 'hitmarker', 'sens-label',
  ];
  for (let i = 0; i < ids.length; i++) el[ids[i]] = root.querySelector('#' + ids[i]);
  mapCtx = root.querySelector('#minimap').getContext('2d');
  buildPips(root.querySelector('#pips-ridge'));
  buildPips(root.querySelector('#pips-guard'));
  buildBuy(root.querySelector('#buy-grid'));
  buildScoreRows(root.querySelector('#score-body'));
  const sens = root.querySelector('#sens');
  const pauseSens = root.querySelector('#pause-sens');
  const stored = readSens();
  state.sens = stored;
  sens.value = String(stored);
  pauseSens.value = String(stored);
  el['sens-label'].textContent = stored.toFixed(2);
  sens.addEventListener('input', () => setSens(Number(sens.value), pauseSens, sens));
  pauseSens.addEventListener('input', () => setSens(Number(pauseSens.value), sens, pauseSens));
}

function buildPips(node) {
  for (let i = 0; i < 5; i++) node.appendChild(document.createElement('i'));
}

function buildBuy(node) {
  for (let i = 0; i < CATALOG.length; i++) {
    const item = CATALOG[i];
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = '<b></b><small></small><em></em><span></span>';
    button.querySelector('b').textContent = item.name;
    button.querySelector('small').textContent = item.kind;
    button.querySelector('span').textContent = item.blurb;
    button.addEventListener('click', () => {
      buy(player(), item.id);
      syncHud();
    });
    node.appendChild(button);
    buyButtons.push(button);
  }
}

function buildScoreRows(node) {
  for (let i = 0; i < 10; i++) {
    const row = document.createElement('tr');
    row.innerHTML = '<td></td><td></td><td></td><td></td><td></td>';
    node.appendChild(row);
  }
}

function setSens(value, other, source) {
  const v = Math.round(value * 100) / 100;
  state.sens = v;
  other.value = String(v);
  source.value = String(v);
  el['sens-label'].textContent = v.toFixed(2);
  try { localStorage.setItem('lantern-sens', String(v)); } catch (err) { /* private mode */ }
}

function readSens() {
  try {
    const n = Number(localStorage.getItem('lantern-sens'));
    if (n >= 0.4 && n <= 2.4) return n;
  } catch (err) { /* ignore */ }
  return 1.1;
}

function text(node, value) {
  if (node.textContent !== value) node.textContent = value;
}

export function syncHud() {
  const you = player();
  const titleOn = state.phase === 'title';
  el.title.hidden = !titleOn;
  el.pause.hidden = !state.paused || titleOn;
  el.buy.hidden = !state.buyOpen || titleOn;
  el.scoreboard.hidden = !state.scoreOpen || titleOn;
  el.banner.hidden = !state.banner.show;
  const again = document.getElementById('match-again');
  if (again) again.hidden = state.phase !== 'match';
  const playHud = document.getElementById('play-hud');
  if (playHud) playHud.hidden = titleOn;
  if (state.banner.show) {
    text(el['banner-title'], state.banner.title);
    text(el['banner-sub'], state.banner.sub);
    text(el['banner-money'], state.banner.money);
  }
  text(el.timer, state.phase === 'buy' ? clockText() : state.phase === 'title' ? '—:—' : clockText());
  text(el['round-no'], 'ROUND ' + state.round);
  text(el['n-ridge'], String(state.score.ridge));
  text(el['n-guard'], String(state.score.guard));
  text(el.money, '$' + you.money);
  text(el.health, String(Math.max(0, you.hp | 0)));
  text(el.armour, String(you.armour | 0));
  el.helm.hidden = !you.helmet;
  el.health.classList.toggle('low', you.hp <= 40);
  paintPips('pips-ridge', 'ridge');
  paintPips('pips-guard', 'guard');
  const id = gunId(you);
  const gun = id ? GUNS[id] : null;
  const ammo = gun ? ammoOf(you, id) : null;
  if (you.slot === 'spark' || you.slot === 'glimmer' || you.slot === 'veil') {
    text(el['weapon-name'], slotLabel(you.slot));
    text(el['ammo-mag'], String(you.nades[you.slot]));
    text(el['ammo-res'], 'HELD');
  } else if (gun && ammo) {
    text(el['weapon-name'], gun.name);
    text(el['ammo-mag'], String(ammo.mag));
    text(el['ammo-res'], String(ammo.reserve));
  } else {
    text(el['weapon-name'], '—');
    text(el['ammo-mag'], '0');
    text(el['ammo-res'], '0');
  }
  el['ammo-mag'].classList.toggle('empty', !ammo || ammo.mag === 0);
  text(el['slot-line'], slotLine(you));
  text(document.getElementById('nade-spark'), String(you.nades.spark));
  text(document.getElementById('nade-glimmer'), String(you.nades.glimmer));
  text(document.getElementById('nade-veil'), String(you.nades.veil));
  paintFeed(el.killfeed, state.kills, true);
  paintRadio();
  paintPrompt(you);
  paintMap(you);
  paintBuy(you);
  paintScore();
  const gap = 6 + (you.grounded ? Math.hypot(you.vx, you.vz) * 1.3 : 16) + (you.crouch ? -2 : 0);
  el.crosshair.style.setProperty('--gap', Math.max(4, gap | 0) + 'px');
  el.crosshair.hidden = titleOn || you.scope > 0.45;
  el.hitmarker.classList.toggle('on', state.hitMarker > 0);
  el.hitmarker.classList.toggle('head', state.headMarker);
  el.hurt.style.opacity = String(Math.min(0.7, state.hurt));
  el.flash.style.opacity = String(Math.min(1, you.blind / 2.2));
  el.scope.hidden = you.scope < 0.45;
  const locked = document.pointerLockElement != null;
  el.hint.hidden = titleOn || state.buyOpen || state.paused || locked || state.phase === 'match' || !!state.shot;
  el.timer.classList.toggle('planted', state.phase === 'live' && state.charge.state === 'planted');
}

function slotLabel(id) {
  if (id === 'spark') return 'Spark frag';
  if (id === 'glimmer') return 'Glimmer flash';
  return 'Veil smoke';
}

function slotLine(you) {
  const primary = you.primary ? GUNS[you.primary].name : '—';
  const secondary = GUNS[you.secondary || 'wick'].name;
  return '1 ' + secondary + '   2 ' + primary + '   4 frag  5 flash  6 smoke';
}

function paintPips(id, org) {
  const node = document.getElementById(id);
  const kids = node.children;
  let n = 0;
  for (let i = 0; i < state.actors.length && n < 5; i++) {
    if (state.actors[i].org !== org) continue;
    kids[n].className = state.actors[i].alive ? 'alive' : '';
    n += 1;
  }
}

function paintFeed(node, rows) {
  const lines = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].life > 0 && rows[i].text) lines.push('<i class="' + rows[i].org + '">' + rows[i].text + '</i>');
  }
  const html = lines.join('');
  if (node._html !== html) { node.innerHTML = html; node._html = html; }
}

function paintRadio() {
  const lines = [];
  for (let i = 0; i < state.radio.length; i++) if (state.radio[i]) lines.push(state.radio[i]);
  const html = lines.map((line) => '<i>' + line + '</i>').join('');
  if (el.radio._html !== html) { el.radio.innerHTML = html; el.radio._html = html; }
}

function paintPrompt(you) {
  const charge = state.charge;
  let show = false;
  let label = '';
  let sub = '';
  let pct = 0;
  if (state.phase === 'live' && you.alive && charge.state === 'carried' && charge.carrier === you.id) {
    const site = siteNear(you);
    if (site) {
      show = true;
      label = 'HOLD E TO PLANT';
      sub = site.name;
      pct = charge.plant / 3.2;
    }
  } else if (state.phase === 'live' && you.alive && charge.state === 'planted' && sideOf(you) === 'defense') {
    const dx = you.x - charge.x;
    const dz = you.z - charge.z;
    if (dx * dx + dz * dz < 4) {
      show = true;
      label = 'HOLD E TO DEFUSE';
      const need = you.kit ? 5 : 10;
      sub = (you.kit ? 'Kit  5.0s' : 'No kit  10s') + '   ' + charge.timer.toFixed(1);
      pct = charge.defuse / need;
    }
  } else if (state.phase === 'live' && you.alive && charge.state === 'dropped' && sideOf(you) === 'attack') {
    const dx = you.x - charge.x;
    const dz = you.z - charge.z;
    if (dx * dx + dz * dz < 3) {
      show = true;
      label = 'PRESS E TO TAKE THE CHARGE';
      sub = 'Carry it to a site';
      pct = 0;
    }
  }
  el.prompt.hidden = !show;
  if (!show) return;
  text(el['prompt-label'], label);
  text(el['prompt-sub'], sub);
  el['prompt-bar'].style.width = Math.max(0, Math.min(1, pct)) * 100 + '%';
}

function siteNear(you) {
  for (let i = 0; i < sites.length; i++) {
    const s = sites[i];
    const dx = you.x - s.x;
    const dz = you.z - s.z;
    if (dx * dx + dz * dz <= s.r * s.r && Math.abs(you.y - s.y) < 1.4) return s;
  }
  return null;
}

function paintBuy(you) {
  if (el.buy.hidden) return;
  text(el['buy-cash'], '$' + you.money + '   ' + (sideOf(you) === 'attack' ? 'ATTACK' : 'DEFEND'));
  for (let i = 0; i < CATALOG.length; i++) {
    const item = CATALOG[i];
    const button = buyButtons[i];
    const owned = owns(you, item.id);
    const price = item.id === 'helm' && you.armour >= 100 && !you.helmet ? 350 : item.price;
    button.querySelector('em').textContent = owned ? 'OWNED' : '$' + price;
    button.disabled = owned || you.money < price || (item.id === 'kit' && sideOf(you) !== 'defense');
    button.classList.toggle('owned', owned);
  }
}

function owns(you, id) {
  if (id === 'wick') return you.secondary === 'wick';
  if (id === 'ember') return you.secondary === 'ember';
  if (GUNS[id] && GUNS[id].slot === 'primary') return you.primary === id;
  if (id === 'armour') return you.armour >= 100 && !you.helmet;
  if (id === 'helm') return you.helmet && you.armour >= 100;
  if (id === 'kit') return you.kit;
  if (NADE_CAP[id] != null) return you.nades[id] >= NADE_CAP[id];
  return false;
}

function paintScore() {
  if (el.scoreboard.hidden) return;
  const rows = el['score-body'].children;
  for (let i = 0; i < state.actors.length; i++) {
    const actor = state.actors[i];
    const cells = rows[i].children;
    const side = sideOf(actor) === 'attack' ? 'ATK' : 'DEF';
    cells[0].textContent = actor.name + (actor.bot ? '' : ' (you)');
    cells[1].textContent = ORG[actor.org].short + ' ' + side;
    cells[2].textContent = String(actor.kills);
    cells[3].textContent = String(actor.deaths);
    cells[4].textContent = '$' + actor.money;
    rows[i].className = actor.org + (actor.alive ? '' : ' dead');
  }
}

function paintMap(you) {
  const ctx = mapCtx;
  const w = 168;
  const h = 168;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(28,16,12,0.82)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(240,195,106,0.85)';
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.fillStyle = '#f6f0e6';
  ctx.font = '700 16px Georgia, serif';
  ctx.textAlign = 'center';
  markSite(ctx, sites[0].x, sites[0].z, 'A', w, h);
  markSite(ctx, sites[1].x, sites[1].z, 'B', w, h);
  for (let i = 0; i < state.smokes.length; i++) {
    const s = state.smokes[i];
    if (s.life <= 0) continue;
    const p = worldToMap(s.x, s.z, w, h);
    ctx.fillStyle = 'rgba(230,230,230,0.35)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, 6.28);
    ctx.fill();
  }
  const charge = state.charge;
  if (state.phase !== 'title') {
    const c = worldToMap(charge.x, charge.z, w, h);
    ctx.fillStyle = '#ff4d3a';
    ctx.fillRect(c.x - 3, c.y - 3, 6, 6);
  }
  for (let i = 0; i < state.actors.length; i++) {
    const actor = state.actors[i];
    if (!actor.alive || actor.org !== you.org) continue;
    const p = worldToMap(actor.x, actor.z, w, h);
    ctx.fillStyle = actor.id === 0 ? '#f0c36a' : '#8fd0ea';
    ctx.beginPath();
    ctx.arc(p.x, p.y, actor.id === 0 ? 4 : 3, 0, 6.28);
    ctx.fill();
  }
}

const _mp = { x: 0, y: 0 };

function markSite(ctx, x, z, letter, w, h) {
  const p = worldToMap(x, z, w, h);
  ctx.fillText(letter, p.x, p.y);
}

function worldToMap(x, z, w, h) {
  _mp.x = ((x + 42) / 84) * (w - 24) + 12;
  _mp.y = (1 - (z + 42) / 84) * (h - 24) + 12;
  return _mp;
}
