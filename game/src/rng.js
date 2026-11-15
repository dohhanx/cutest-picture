// Seeded mulberry32-style generator. Every gameplay roll goes through this
// so a screenshot seed replays the same match moment.

export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return {
    next() {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 4294967296;
    },
    int(n) {
      return (this.next() * n) | 0;
    },
    range(a, b) {
      return a + (b - a) * this.next();
    },
    chance(p) {
      return this.next() < p;
    },
  };
}
