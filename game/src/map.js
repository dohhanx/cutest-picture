// Lantern Pass layout. Metres, +X east, +Z north, +Y up.
// Attackers spawn on the south court (y = 0). Terraces step up through the
// weighing station into a site plateau at y = 3: A Drying House to the west,
// B Ropeway Station to the east. Estate Guard holds the north knoll at y = 4.3.
// The west stone stair alley and the east cable lane are the long routes.

export const boxes = [];
export const props = [];
export const nodes = [];
export const links = [];

export const sites = [
  { id: 'A', name: 'Drying House', x: -20, z: 17, y: 3, r: 2.7 },
  { id: 'B', name: 'Ropeway Station', x: 21.5, z: 16.5, y: 3, r: 2.9 },
];

export const SPAWN = {
  attack: [[-3, 0, -34], [3, 0, -34], [-7, 0, -31.5], [7, 0, -31.5], [0, 0, -29]],
  defense: [[-3, 4.3, 35.5], [3, 4.3, 35.5], [-8, 4.3, 33.2], [8, 4.3, 33.2], [0, 4.3, 32]],
};

export const landmarks = {
  sun: { x: -6, y: 24, z: -42 },
  cabin: { x: 22, y: 6.55, z: 17.2 },
  pylons: [{ x: 16.5, z: 19.5 }, { x: 27.2, z: 12.4 }],
  cable: [
    { x: 14, y: 8.6, z: 22 },
    { x: 22, y: 8.15, z: 17 },
    { x: 34, y: 7.3, z: -6 },
    { x: 44, y: 6.4, z: -32 },
  ],
  mountains: [
    { x: -70, z: 130, h: 36, r: 46 },
    { x: 10, z: 150, h: 48, r: 54 },
    { x: 90, z: 120, h: 32, r: 40 },
    { x: -80, z: -130, h: 22, r: 36 },
  ],
};

function box(cx, cy, cz, w, h, d, mat, opt) {
  const o = opt || {};
  boxes.push({
    cx, cy, cz, w, h, d, mat,
    minx: cx - w / 2, maxx: cx + w / 2,
    miny: cy - h / 2, maxy: cy + h / 2,
    minz: cz - d / 2, maxz: cz + d / 2,
    block: o.block !== false,
    wood: !!o.wood,
  });
}

function solid(cx, top, cz, w, d, mat) {
  box(cx, top * 0.5, cz, w, top, d, 'stone');
}

function deck(cx, top, cz, w, d, mat) {
  solid(cx, top, cz, w, d, 'stone');
  box(cx, top + 0.004, cz, Math.max(0.4, w - 0.16), 0.02, Math.max(0.4, d - 0.16), mat, { block: false });
}

function propBox(cx, base, cz, w, h, d, mat, opt) {
  box(cx, base + h / 2, cz, w, h, d, mat, opt);
}

function flightZ(cx, z0, y0, z1, y1, w, steps) {
  const tread = (z1 - z0) / steps;
  const rise = (y1 - y0) / steps;
  for (let i = 0; i < steps; i++) {
    const top = y0 + rise * (i + 1);
    const zc = z0 + tread * (i + 0.5);
    solid(cx, top, zc, w, Math.abs(tread) + 0.22);
  }
}

function hedge(x, base, z, len, alongX) {
  if (alongX) propBox(x, base, z, len, 1.08, 0.72, 'bush');
  else propBox(x, base, z, 0.72, 1.08, len, 'bush');
}

function sign(x, y, z, yaw, letter, label) {
  props.push({ kind: 'sign', x, y, z, yaw, letter, label, w: 3.8, h: 1.7 });
}

function lantern(x, y, z, light) {
  props.push({ kind: 'lantern', x, y, z, light: !!light });
}

function build() {
  box(0, -0.35, -2, 92, 0.7, 96, 'dirt');

  deck(0, 1, -13.2, 26, 7.2, 'tea');
  deck(0, 2, -3.6, 22, 7.2, 'tea');
  deck(0, 3, 16.2, 58, 20, 'dirt');
  deck(0, 4.3, 34.6, 30, 11, 'dirt');

  // Stairs sit on the south lip of each rise, so the lane actually climbs.
  flightZ(0, -20.4, 0, -16.2, 1, 7.2, 3);
  flightZ(0, -11.4, 1, -7.2, 2, 6.2, 3);
  flightZ(0, -0.6, 2,0, 5.6, 3, 7.2, 3);
  flightZ(0, 25.4, 3, 30.2, 4.3, 5.4, 4);
  flightZ(-10, 25.6, 3, 30.0, 4.3, 3.2, 4);
  flightZ(10, 25.6, 3, 30.0, 4.3, 3.2, 4);

  // West stair alley: three flights, landings overlap the steps so nothing gaps.
  flightZ(-33, -30, 0, -26.2, 1, 3.6, 3);
  solid(-33, 1, -21.2, 3.6, 11);
  flightZ(-33, -16.2, 1, -12.4, 2, 3.6, 3);
  solid(-33, 2, -8.2, 3.6, 9.2);
  flightZ(-33, -4.2, 2, -0.4, 3, 3.6, 3);
  solid(-33, 3, 4.4, 3.6, 10);
  solid(-31.2, 3, 9.4, 7.2, 6.4);
  propBox(-35.15, 0, -15, 0.4, 4.6, 34, 'stone');
  propBox(-30.85, 0, -18, 0.4, 4.4, 26, 'stone');

  // East cable lane, wider, with a lower inner wall.
  flightZ(33, -28, 0, -23.4, 1, 4.4, 3);
  solid(33, 1, -18.2, 4.4, 11);
  flightZ(33, -13.4, 1, -9.6, 2, 4.4, 3);
  solid(33, 2, -5.6, 4.4, 8.4);
  flightZ(33, -2.0, 2, 1.8, 3, 4.4, 3);
  solid(33, 3, 5.6, 4.4, 8.4);
  solid(31.2, 3, 9.6, 7, 6.4);
  propBox(35.55, 0, -12, 0.35, 2.2, 40, 'stone');
  propBox(30.55, 0, -16, 0.35, 1.7, 24, 'stone');

  // Perimeter so a missed jump stays on the estate.
  propBox(0, 0, -40.2, 84, 1.4, 0.5, 'stone');
  propBox(0, 0, 41.2, 84, 2.2, 0.5, 'stone');
  propBox(-40.2, 0, 0, 0.5, 1.6, 84, 'stone');
  propBox(40.2, 0, 0, 0.5, 1.6, 84, 'stone');

  hedge(-8.5, 1, -12.5, 3.4, false);
  hedge(8.5, 1, -12.5, 3.4, false);
  hedge(-7.2, 2, -5.2, 2.8, true);
  hedge(7.4, 2, -2.6, 2.6, true);
  hedge(0, 0, -22, 4.2, true);
  hedge(-14, 0, -24, 3.2, false);
  hedge(14, 0, -23, 3.2, false);

  // Weighing station, off the centre stair so mid stays a lane.
  propBox(-8.2, 2, -4.2, 0.28, 2.4, 0.28, 'wood');
  propBox(-5.2, 2, -4.2, 0.28, 2.4, 0.28, 'wood');
  propBox(-6.7, 4.25, -4.2, 3.6, 0.16, 2.4, 'wood');
  propBox(-6.7, 2, -3.55, 2.6, 1.05, 0.55, 'wood');
  props.push({ kind: 'scale', x: -6.7, y: 3.05, z: -4.5 });
  sign(-6.7, 4.7, -2.7, Math.PI, 'W', 'WEIGHING');

  // Drying house. Doors face south and east; the north wall is shoot-through slats.
  const floor = 3;
  propBox(-25.7, floor, 16.6, 0.35, 2.7, 10.2, 'wood');
  propBox(-23.4, floor, 11.7, 4.4, 2.7, 0.32, 'wood');
  propBox(-16.6, floor, 11.7, 4.6, 2.7, 0.32, 'wood');
  propBox(-20, floor + 2.15, 11.7, 2.3, 0.55, 0.32, 'wood');
  propBox(-12.35, floor, 14.2, 0.32, 2.7, 4.6, 'wood');
  propBox(-12.35, floor, 19.6, 0.32, 2.7, 3.6, 'wood');
  propBox(-12.35, floor + 2.15, 17.1, 0.32, 0.55, 2.2, 'wood');
  for (let i = 0; i < 12; i++) {
    propBox(-25.3 + i * 1.05, floor, 21.55, 0.62, 2.55, 0.22, 'wood', { wood: true });
  }
  propBox(-19.2, floor + 2.55, 16.7, 13.2, 0.22, 10.4, 'wood');
  propBox(-23.6, floor, 18.4, 0.7, 1.35, 2.4, 'crate');
  propBox(-23.4, floor + 1.35, 18.4, 0.55, 0.7, 1.1, 'crate');
  propBox(-16.2, floor, 19.2, 1.3, 0.9, 0.8, 'crate');
  propBox(-18.4, floor, 14.4, 0.8, 1.5, 0.5, 'wood');
  box(-19.2, floor + 0.03, 16.8, 12.2, 0.05, 8.6, 'plank', { block: false });
  sign(-20, floor + 3.15, 10.55, Math.PI, 'A', 'DRYING HOUSE');
  sign(-10.7, floor + 2.5, 16.8, Math.PI / 2, 'A', 'DRYING HOUSE');
  lantern(-22.4, floor + 2.15, 13.2, true);
  lantern(-15.2, floor + 2.15, 13.4, true);
  lantern(-24.6, floor + 1.7, 20.2, true);

  // Ropeway station cover, pylons and a docked crate row.
  propBox(16.5, floor, 19.5, 0.55, 6.4, 0.55, 'metal');
  propBox(27.2, floor, 12.4, 0.55, 5.6, 0.55, 'metal');
  propBox(24.6, floor, 13.2, 1.5, 0.85, 1.1, 'crate');
  propBox(18.4, floor, 14.6, 1.1, 1.15, 0.8, 'crate');
  propBox(26.2, floor, 18.6, 2.2, 1.05, 0.7, 'metal');
  propBox(15.6, floor, 14.2, 0.4, 1.3, 3.2, 'stone');
  sign(21.5, floor + 3.2, 10.3, Math.PI, 'B', 'ROPEWAY');
  sign(13.6, floor + 2.55, 16.2, -Math.PI / 2, 'B', 'ROPEWAY');
  lantern(18.2, floor + 2.3, 11.4, true);
  lantern(25.4, floor + 2.2, 11.2, true);
  lantern(28.4, floor + 1.8, 18.8, true);

  // Mid cover on the plateau, staggered so the lane still reads.
  propBox(-4.2, floor, 12.4, 1.6, 1.15, 0.55, 'stone');
  propBox(4.4, floor, 14.8, 1.5, 1.15, 0.55, 'stone');
  propBox(-6.4, floor, 17.4, 1.4, 0.9, 0.55, 'crate');
  hedge(-8, floor, 10.2, 2.4, true);
  hedge(8.2, floor, 10.4, 2.4, true);

  // Alley and lane dressing.
  lantern(-33, 2.35, -21, true);
  lantern(-33, 3.35, -8.2, true);
  lantern(-33, 4.35, 3.2, false);
  lantern(33, 2.3, -18.5, true);
  lantern(33, 3.3, -6, false);
  lantern(33, 4.35, 4.6, true);
  lantern(0, 3.4, -4.2, true);
  lantern(-2.2, 1.2, -22.5, false);
  lantern(2.4, 1.2, -20.5, false);
  propBox(-18, 0, -27, 1.1, 0.8, 0.8, 'crate');
  propBox(16.5, 0, -26, 1.2, 0.75, 0.9, 'crate');
  propBox(-24, 0, -18, 0.9, 0.9, 0.9, 'crate');
  propBox(24, 0, -16, 0.9, 1.0, 0.9, 'crate');

  // Knoll lip.
  propBox(-6, 4.3, 30.2, 3.2, 1.0, 0.4, 'stone');
  propBox(7, 4.3, 30.4, 2.6, 1.0, 0.4, 'stone');
}

const idOf = Object.create(null);

function addNode(name, x, y, z, face) {
  const i = nodes.length;
  nodes.push({ name, x, y, z, i, face: face ?? null });
  links.push([]);
  idOf[name] = i;
  return i;
}

function link(a, b) {
  const i = idOf[a];
  const j = idOf[b];
  links[i].push(j);
  links[j].push(i);
}

function buildNav() {
  addNode('att', 0, 0, -32);
  addNode('attW', -8, 0, -28);
  addNode('attE', 8, 0, -28);
  addNode('south', 0, 0, -24);
  addNode('al0', -33, 0, -32);
  addNode('al1', -33, 1, -21);
  addNode('al2', -33, 2, -8.2);
  addNode('al3', -33, 3, 4.2);
  addNode('alJoin', -28.5, 3, 10);
  addNode('el0', 33, 0, -30);
  addNode('el1', 33, 1, -18.5);
  addNode('el2', 33, 2, -6);
  addNode('el3', 33, 3, 5.4);
  addNode('elJoin', 28.4, 3, 10.2);
  addNode('t1', 0, 1, -12.5);
  addNode('weigh', 0, 2, -4);
  addNode('stair', 0, 3, 8.2);
  addNode('mid', 0, 3, 14.5);
  addNode('conA', -10, 3, 12.5);
  addNode('conB', 10.5, 3, 12.8);
  addNode('aDoor', -20, 3, 9.6);
  addNode('aSite', -20, 3, 17, 0);
  addNode('aHold', -22.4, 3, 19.4, 0);
  addNode('bDoor', 21.5, 3, 10.2);
  addNode('bSite', 21.5, 3, 16.5, 0);
  addNode('bHold', 24.2, 3, 19.2, 0);
  addNode('dropM', 0, 3, 24.6);
  addNode('dropA', -10, 3, 24.8);
  addNode('dropB', 10, 3, 24.8);
  addNode('knollM', 0, 4.3, 31.2);
  addNode('knollA', -8, 4.3, 32.4);
  addNode('knollB', 8, 4.3, 32.4);
  addNode('def', 0, 4.3, 35);

  link('att', 'attW');
  link('att', 'attE');
  link('att', 'south');
  link('attW', 'al0');
  link('attW', 'south');
  link('attE', 'el0');
  link('attE', 'south');
  link('south', 't1');
  link('t1', 'weigh');
  link('weigh', 'stair');
  link('stair', 'mid');
  link('stair', 'aDoor');
  link('stair', 'bDoor');
  link('mid', 'conA');
  link('mid', 'conB');
  link('conA', 'aDoor');
  link('conB', 'bDoor');
  link('aDoor', 'aSite');
  link('aSite', 'aHold');
  link('bDoor', 'bSite');
  link('bSite', 'bHold');
  link('al0', 'al1');
  link('al1', 'al2');
  link('al2', 'al3');
  link('al3', 'alJoin');
  link('alJoin', 'aDoor');
  link('el0', 'el1');
  link('el1', 'el2');
  link('el2', 'el3');
  link('el3', 'elJoin');
  link('elJoin', 'bDoor');
  link('mid', 'dropM');
  link('aHold', 'dropA');
  link('bHold', 'dropB');
  link('dropM', 'knollM');
  link('dropA', 'knollA');
  link('dropB', 'knollB');
  link('knollM', 'def');
  link('knollA', 'def');
  link('knollB', 'def');
  link('knollA', 'knollM');
  link('knollB', 'knollM');
  link('conA', 'dropA');
  link('conB', 'dropB');
}

build();
buildNav();

export function overlap(x, y, z, r, h) {
  const minx = x - r;
  const maxx = x + r;
  const miny = y;
  const maxy = y + h;
  const minz = z - r;
  const maxz = z + r;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (!b.block) continue;
    if (maxx <= b.minx || minx >= b.maxx) continue;
    if (maxy <= b.miny || miny >= b.maxy) continue;
    if (maxz <= b.minz || minz >= b.maxz) continue;
    return true;
  }
  return false;
}

const _ray = { t: 0, box: null, x: 0, y: 0, z: 0 };

function slab(b, ox, oy, oz, dx, dy, dz, maxDist) {
  let tmin = 0;
  let tmax = maxDist;
  let t1;
  let t2;
  if (Math.abs(dx) < 1e-8) {
    if (ox < b.minx || ox > b.maxx) return -1;
  } else {
    t1 = (b.minx - ox) / dx;
    t2 = (b.maxx - ox) / dx;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (Math.abs(dy) < 1e-8) {
    if (oy < b.miny || oy > b.maxy) return -1;
  } else {
    t1 = (b.miny - oy) / dy;
    t2 = (b.maxy - oy) / dy;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (Math.abs(dz) < 1e-8) {
    if (oz < b.minz || oz > b.maxz) return -1;
  } else {
    t1 = (b.minz - oz) / dz;
    t2 = (b.maxz - oz) / dz;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  return tmin >= 0 ? tmin : -1;
}

// Reuses one result object. Callers must copy fields they need to keep.
export function raycast(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = maxDist;
  let boxHit = null;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (!b.block) continue;
    const t = slab(b, ox, oy, oz, dx, dy, dz, best);
    if (t < 0 || t >= best) continue;
    best = t;
    boxHit = b;
  }
  if (!boxHit) return null;
  _ray.t = best;
  _ray.box = boxHit;
  _ray.x = ox + dx * best;
  _ray.y = oy + dy * best;
  _ray.z = oz + dz * best;
  return _ray;
}

export function regionName(x, z) {
  if (x < -26 && z < 8) return 'the stair alley';
  if (x > 26 && z < 8) return 'the cable lane';
  if (z > 28) return 'the knoll';
  if (x < -10 && z > 8) return 'Drying House';
  if (x > 10 && z > 8) return 'Ropeway Station';
  if (z < 2) return 'the terraces';
  return 'mid';
}

export function nearestNode(x, z) {
  let best = 0;
  let bd = 1e12;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

export function nodeByName(name) {
  return idOf[name];
}

export function inSite(x, y, z, index) {
  const s = sites[index];
  if (Math.abs(y - s.y) > 1.3) return false;
  const dx = x - s.x;
  const dz = z - s.z;
  return dx * dx + dz * dz <= s.r * s.r;
}

export function siteIndexAt(x, y, z) {
  if (inSite(x, y, z, 0)) return 0;
  if (inSite(x, y, z, 1)) return 1;
  return -1;
}

export function auditMap() {
  const problems = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (overlap(n.x, n.y + 0.08, n.z, 0.32, 1.7)) problems.push('node ' + n.name);
  }
  const sp = SPAWN.attack.concat(SPAWN.defense);
  for (let i = 0; i < sp.length; i++) {
    const p = sp[i];
    if (overlap(p[0], p[1] + 0.08, p[2], 0.32, 1.7)) problems.push('spawn ' + i);
  }
  const seen = new Uint8Array(nodes.length);
  const q = [idOf.att];
  seen[idOf.att] = 1;
  for (let h = 0; h < q.length; h++) {
    const nbrs = links[q[h]];
    for (let k = 0; k < nbrs.length; k++) {
      if (!seen[nbrs[k]]) { seen[nbrs[k]] = 1; q.push(nbrs[k]); }
    }
  }
  if (!seen[idOf.aSite] || !seen[idOf.bSite] || !seen[idOf.def]) problems.push('nav broken');
  return problems;
}
