// Small WebAudio synth. No samples, so the game stays offline and silent
// until the first click unlocks the context.

let ctx = null;
let lastShot = 0;
let nextBeep = 0;

function ac() {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function unlock() {
  try {
    const c = ac();
    if (c.state === 'suspended') c.resume();
  } catch (err) {
    ctx = null;
  }
}

function burst(freq, dur, gain, type) {
  try {
    const c = ac();
    if (c.state !== 'running') return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    g.gain.value = gain;
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + dur);
  } catch (err) {
    ctx = null;
  }
}

function noise(freq, dur, gain) {
  try {
    const c = ac();
    if (c.state !== 'running') return;
    const n = Math.max(1, (dur * c.sampleRate) | 0);
    const buffer = c.createBuffer(1, n, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(c.destination);
    src.start();
  } catch (err) {
    ctx = null;
  }
}

export function shot(fast) {
  const now = performance.now();
  if (now - lastShot < 40) return;
  lastShot = now;
  noise(fast ? 900 : 420, 0.09, 0.18);
  burst(fast ? 180 : 110, 0.07, 0.08, 'sawtooth');
}

export function click() {
  burst(1400, 0.03, 0.05, 'square');
}

export function step() {
  noise(180, 0.04, 0.04);
}

export function boom() {
  noise(120, 0.35, 0.28);
}

export function tickBeep(charge, time) {
  if (!charge || charge.state !== 'planted') { nextBeep = 0; return; }
  if (time < nextBeep) return;
  const left = Math.max(0.2, charge.timer);
  const gap = left > 15 ? 0.9 : left > 7 ? 0.45 : 0.22;
  nextBeep = time + gap;
  burst(left < 8 ? 880 : 620, 0.06, 0.06, 'sine');
}
