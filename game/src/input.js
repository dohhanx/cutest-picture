// Keyboard and pointer-lock look. The simulation reads `held` and the mouse
// delta once per tick; nothing here allocates per frame.

import { state } from './state.js';

const down = Object.create(null);
const mouse = { x: 0, y: 0 };
let accX = 0;
let accY = 0;
let fireWas = false;
let useWas = false;

export function consumeLook() {
  mouse.x = accX;
  mouse.y = accY;
  accX = 0;
  accY = 0;
  return mouse;
}

const was = Object.create(null);

export function held(code) {
  return down[code] === true;
}

export function edge(code) {
  const now = down[code] === true;
  const hit = now && was[code] !== true;
  was[code] = now;
  return hit;
}

export function bindInput(canvas) {
  addEventListener('keydown', (event) => {
    down[event.code] = true;
    if (event.code === 'Tab' || event.code === 'Space') event.preventDefault();
  });
  addEventListener('keyup', (event) => {
    down[event.code] = false;
  });
  addEventListener('mousemove', (event) => {
    if (document.pointerLockElement !== canvas) return;
    accX += event.movementX;
    accY += event.movementY;
  });
  addEventListener('mousedown', (event) => {
    if (event.button === 0) down.Mouse0 = true;
    if (event.button === 2) down.Mouse2 = true;
  });
  addEventListener('mouseup', (event) => {
    if (event.button === 0) down.Mouse0 = false;
    if (event.button === 2) down.Mouse2 = false;
  });
  addEventListener('contextmenu', (event) => event.preventDefault());
  addEventListener('blur', () => {
    for (const key in down) down[key] = false;
  });
}

export function writePlayerCmd(cmd) {
  const you = state.actors[0];
  if (state.drive) {
    const d = state.drive;
    cmd.f = !!d.f; cmd.b = !!d.b; cmd.l = !!d.l; cmd.r = !!d.r;
    cmd.jump = !!d.jump; cmd.crouch = !!d.crouch; cmd.walk = !!d.walk;
    cmd.fire = !!d.fire; cmd.reload = !!d.reload; cmd.use = !!d.use; cmd.scope = !!d.scope;
    cmd.fireEdge = !!d.fireEdge; cmd.useEdge = !!d.useEdge;
    if (d.yaw != null) you.yaw = d.yaw;
    if (d.pitch != null) you.pitch = d.pitch;
    return;
  }
  if (!you.alive || state.phase === 'title' || state.phase === 'match' || state.paused || state.buyOpen) {
    cmd.f = cmd.b = cmd.l = cmd.r = false;
    cmd.jump = cmd.crouch = cmd.walk = false;
    cmd.fire = cmd.scope = false;
    cmd.fireEdge = false;
    cmd.useEdge = false;
    return;
  }
  cmd.f = held('KeyW');
  cmd.b = held('KeyS');
  cmd.l = held('KeyA');
  cmd.r = held('KeyD');
  cmd.jump = held('Space');
  cmd.crouch = held('ControlLeft') || held('KeyC');
  cmd.walk = held('ShiftLeft') || held('ShiftRight');
  cmd.fire = held('Mouse0');
  cmd.scope = held('Mouse2');
  cmd.reload = held('KeyR');
  cmd.use = held('KeyE');
  cmd.fireEdge = cmd.fire && !fireWas;
  cmd.useEdge = cmd.use && !useWas;
  fireWas = cmd.fire;
  useWas = cmd.use;
  const look = consumeLook();
  const sens = state.sens;
  you.yaw -= look.x * 0.00215 * sens;
  you.pitch -= look.y * 0.00215 * sens;
  if (you.pitch > 1.25) you.pitch = 1.25;
  if (you.pitch < -1.25) you.pitch = -1.25;
}

export function pointerLocked(canvas) {
  return document.pointerLockElement === canvas;
}

export function requestLook(canvas) {
  if (state.buyOpen || state.phase === 'title' || state.paused) return;
  canvas.requestPointerLock();
}
