// A* over the estate graph. Scratch buffers are reused so a search allocates nothing.

import { nodes, links } from './map.js';

const MAX = 48;
const gScore = new Float32Array(MAX);
const parent = new Int16Array(MAX);
const inOpen = new Uint8Array(MAX);
const open = new Int16Array(MAX);
const rev = new Int16Array(MAX);

function heur(a, b) {
  const na = nodes[a];
  const nb = nodes[b];
  const dx = na.x - nb.x;
  const dz = na.z - nb.z;
  return Math.hypot(dx, dz);
}

export function route(start, goal, out) {
  if (start < 0 || goal < 0) { out[0] = 0; return 1; }
  if (start === goal) { out[0] = start; return 1; }
  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    gScore[i] = 1e9;
    parent[i] = -1;
    inOpen[i] = 0;
  }
  gScore[start] = 0;
  let count = 0;
  open[count++] = start;
  inOpen[start] = 1;
  while (count > 0) {
    let bi = 0;
    let bf = 1e9;
    for (let i = 0; i < count; i++) {
      const idn = open[i];
      const f = gScore[idn] + heur(idn, goal);
      if (f < bf) { bf = f; bi = i; }
    }
    const cur = open[bi];
    open[bi] = open[--count];
    inOpen[cur] = 0;
    if (cur === goal) break;
    const nbrs = links[cur];
    for (let k = 0; k < nbrs.length; k++) {
      const nb = nbrs[k];
      const step = heur(cur, nb);
      const ng = gScore[cur] + step;
      if (ng < gScore[nb]) {
        gScore[nb] = ng;
        parent[nb] = cur;
        if (!inOpen[nb]) {
          open[count++] = nb;
          inOpen[nb] = 1;
        }
      }
    }
  }
  if (gScore[goal] > 1e8) { out[0] = start; return 1; }
  let len = 0;
  let c = goal;
  while (c !== -1 && len < rev.length) {
    rev[len++] = c;
    if (c === start) break;
    c = parent[c];
  }
  for (let i = 0; i < len; i++) out[i] = rev[len - 1 - i];
  return len;
}
