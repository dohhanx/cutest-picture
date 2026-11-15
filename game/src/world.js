// Scene, lights and mesh sync. Built once; the per-frame path only writes
// positions on pools that already exist.

import {
  Scene, PerspectiveCamera, WebGLRenderer, Color, Fog,
  DirectionalLight, HemisphereLight, AmbientLight, PointLight,
  Mesh, Group, BoxGeometry, SphereGeometry, CylinderGeometry, ConeGeometry, PlaneGeometry,
  MeshStandardMaterial, MeshBasicMaterial, CanvasTexture,
  PCFShadowMap, ACESFilmicToneMapping, SRGBColorSpace, DoubleSide, BackSide, AdditiveBlending,
} from 'three';
import { state, player } from './state.js';
import { boxes, props, landmarks } from './map.js';
import {
  dirtTexture, teaTexture, bushTexture, stoneTexture, woodTexture,
  plankTexture, metalTexture, crateTexture, signTexture,
} from './textures.js';
import { eyeY } from './combat.js';

export const scene = new Scene();
export const camera = new PerspectiveCamera(76, 1, 0.08, 220);
export const renderer = new WebGLRenderer({ antialias: true, alpha: false });

const boxGeo = new BoxGeometry(1, 1, 1);
const characters = [];
const tracers = [];
const smokeGroups = [];
const nadeMeshes = [];
const impactMeshes = [];
const dropMeshes = [];
let chargeMesh = null;
let chargeBulb = null;
let cabin = null;
let viewRoot = null;
const viewBySlot = {};

export function buildWorld(canvas) {
  renderer.setPixelRatio(1);
  renderer.setSize(canvas.clientWidth || 1280, canvas.clientHeight || 720);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  canvas.appendChild(renderer.domElement);

  scene.background = new Color(0x2a2458);
  scene.fog = new Fog(0xe8b48a, 58, 168);
  addSky();

  scene.add(new HemisphereLight(0x9eb6d4, 0x5c4636, 0.62));
  scene.add(new AmbientLight(0x3a2e28, 0.28));

  const sun = new DirectionalLight(0xffc48a, 2.7);
  sun.position.set(landmarks.sun.x, landmarks.sun.y, landmarks.sun.z);
  sun.target.position.set(-4, 2, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 130;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.045;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new DirectionalLight(0x7f96b8, 0.42);
  fill.position.set(24, 14, 18);
  scene.add(fill);
  const drying = new PointLight(0xffb070, 36, 16, 2);
  drying.position.set(-20, 4.7, 16.5);
  scene.add(drying);
  const rope = new PointLight(0xffb070, 28, 14, 2);
  rope.position.set(22, 4.8, 16);
  scene.add(rope);

  const sunDisc = new Mesh(new SphereGeometry(2.6, 18, 12), new MeshBasicMaterial({ color: 0xfff3c4, fog: false }));
  sunDisc.position.set(landmarks.sun.x, landmarks.sun.y, landmarks.sun.z);
  scene.add(sunDisc);
  const sunGlow = new Mesh(new SphereGeometry(6.5, 16, 12), new MeshBasicMaterial({
    color: 0xffb060, transparent: true, opacity: 0.28, fog: false, depthWrite: false, blending: AdditiveBlending,
  }));
  sunGlow.position.copy(sunDisc.position);
  scene.add(sunGlow);

  const mats = {
    dirt: standard(dirtTexture(), 0.92, 0),
    tea: standard(teaTexture(), 0.9, 0),
    bush: standard(bushTexture(), 0.95, 0),
    stone: standard(stoneTexture(), 0.88, 0.02),
    wood: standard(woodTexture(), 0.78, 0.02),
    plank: standard(plankTexture(), 0.8, 0.02),
    metal: standard(metalTexture(), 0.42, 0.7),
    crate: standard(crateTexture(), 0.82, 0.02),
  };

  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const mesh = new Mesh(boxGeo, mats[b.mat] || mats.stone);
    mesh.position.set(b.cx, b.cy, b.cz);
    mesh.scale.set(b.w, b.h, b.d);
    mesh.castShadow = b.block;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  let lights = 0;
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    if (p.kind === 'sign') addSign(p);
    else if (p.kind === 'lantern') addLantern(p, lights++ < 8);
    else if (p.kind === 'scale') addScale(p);
  }

  addMountains();
  addCable();
  cabin = addCabin();
  chargeMesh = addCharge();
  for (let i = 0; i < 10; i++) characters.push(addCharacter());
  for (let i = 0; i < state.tracers.length; i++) tracers.push(addTracerMesh());
  for (let i = 0; i < state.smokes.length; i++) smokeGroups.push(addSmoke());
  for (let i = 0; i < state.nades.length; i++) nadeMeshes.push(addNadeMesh());
  for (let i = 0; i < state.impacts.length; i++) impactMeshes.push(addImpactMesh());
  for (let i = 0; i < state.drops.length; i++) dropMeshes.push(addDropMesh());
  viewRoot = addViewmodel();
  camera.add(viewRoot);
  scene.add(camera);
}

function standard(map, rough, metal) {
  return new MeshStandardMaterial({ map, roughness: rough, metalness: metal });
}

function addSign(p) {
  const mat = new MeshBasicMaterial({ map: signTexture(p.letter, p.label), side: DoubleSide });
  const mesh = new Mesh(new PlaneGeometry(p.w, p.h), mat);
  mesh.position.set(p.x, p.y, p.z);
  mesh.rotation.y = p.yaw;
  scene.add(mesh);
}

function addLantern(p, withLight) {
  const pole = new Mesh(new CylinderGeometry(0.06, 0.08, 1.5, 6), new MeshStandardMaterial({ color: 0x4a3428, roughness: 0.7 }));
  pole.position.set(p.x, p.y - 0.2, p.z);
  pole.castShadow = true;
  scene.add(pole);
  const glow = new Mesh(new SphereGeometry(0.28, 10, 8), new MeshStandardMaterial({
    color: 0xff4a2a, emissive: 0xff2a14, emissiveIntensity: 2.2, roughness: 0.35,
  }));
  glow.position.set(p.x, p.y + 0.62, p.z);
  glow.userData.sway = p.x;
  scene.add(glow);
  if (withLight) {
    const light = new PointLight(0xff7a3c, 22, 12, 2);
    light.position.copy(glow.position);
    scene.add(light);
  }
}

function addScale(p) {
  const pan = new Mesh(new CylinderGeometry(0.38, 0.38, 0.08, 10), new MeshStandardMaterial({ color: 0xd7c4a2, metalness: 0.6, roughness: 0.35 }));
  pan.position.set(p.x, p.y, p.z);
  scene.add(pan);
}

function addSky() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#241c4e');
  grad.addColorStop(0.42, '#6a4a72');
  grad.addColorStop(0.7, '#d47848');
  grad.addColorStop(1, '#f3c48a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const sky = new Mesh(new SphereGeometry(200, 48, 32), new MeshBasicMaterial({
    map: tex, side: BackSide, fog: false, depthWrite: false,
  }));
  sky.position.y = 8;
  scene.add(sky);
}

function addMountains() {
  const geo = new ConeGeometry(1, 1, 7);
  const list = landmarks.mountains;
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    const mat = new MeshStandardMaterial({ color: m.c, roughness: 1, metalness: 0, fog: false });
    const mesh = new Mesh(geo, mat);
    mesh.position.set(m.x, m.h * 0.28, m.z);
    mesh.scale.set(m.r * 1.25, m.h * 0.5, m.r * 0.9);
    scene.add(mesh);
  }
}

function addCable() {
  const mat = new MeshStandardMaterial({ color: 0x3e4650, metalness: 0.8, roughness: 0.35 });
  const pts = landmarks.cable;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const mesh = new Mesh(boxGeo, mat);
    mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    mesh.scale.set(0.05, 0.05, len);
    mesh.lookAt(b.x, b.y, b.z);
    scene.add(mesh);
  }
}

function addCabin() {
  const group = new Group();
  const wood = new MeshStandardMaterial({ color: 0x6a3e28, roughness: 0.78 });
  const body = new Mesh(boxGeo, wood);
  body.scale.set(1.8, 1.35, 1.25);
  body.castShadow = true;
  group.add(body);
  const roof = new Mesh(boxGeo, new MeshStandardMaterial({ color: 0x6a2218, roughness: 0.6 }));
  roof.position.y = 0.85;
  roof.scale.set(2.1, 0.16, 1.5);
  group.add(roof);
  const window = new Mesh(boxGeo, new MeshBasicMaterial({ color: 0xffb15a }));
  window.position.set(0, 0.1, 0.64);
  window.scale.set(0.7, 0.45, 0.05);
  group.add(window);
  const rope = new Mesh(new CylinderGeometry(0.03, 0.03, 1.6, 6), new MeshStandardMaterial({ color: 0x2a2420 }));
  rope.position.y = 1.5;
  group.add(rope);
  const c = landmarks.cabin;
  group.position.set(c.x, c.y, c.z);
  scene.add(group);
  return group;
}

function addCharge() {
  const group = new Group();
  const body = new Mesh(new CylinderGeometry(0.22, 0.24, 0.42, 8), new MeshStandardMaterial({
    color: 0xc9a15a, metalness: 0.55, roughness: 0.4,
  }));
  group.add(body);
  chargeBulb = new Mesh(new SphereGeometry(0.08, 8, 6), new MeshBasicMaterial({ color: 0xff2a1a }));
  chargeBulb.position.y = 0.28;
  group.add(chargeBulb);
  scene.add(group);
  return group;
}

function addCharacter() {
  const group = new Group();
  const ridge = new MeshStandardMaterial({ color: 0xc4512a, roughness: 0.62, emissive: 0x4a1a0c, emissiveIntensity: 0.22 });
  const guard = new MeshStandardMaterial({ color: 0x1a4d62, roughness: 0.55, emissive: 0x0b3040, emissiveIntensity: 0.2 });
  const cloth = new MeshStandardMaterial({ color: 0x2c261e, roughness: 0.82 });
  const skin = new MeshStandardMaterial({ color: 0xe4b898, roughness: 0.55 });
  const gunMat = new MeshStandardMaterial({ color: 0x2a3034, metalness: 0.62, roughness: 0.38 });
  const helm = new Mesh(boxGeo, ridge);
  helm.position.y = 1.64;
  helm.scale.set(0.3, 0.14, 0.32);
  helm.castShadow = true;
  const head = new Mesh(boxGeo, skin);
  head.position.y = 1.5;
  head.scale.set(0.2, 0.18, 0.2);
  const torso = new Mesh(boxGeo, ridge);
  torso.position.y = 1.12;
  torso.scale.set(0.44, 0.46, 0.24);
  torso.castShadow = true;
  const vest = new Mesh(boxGeo, new MeshStandardMaterial({ color: 0x3d3428, roughness: 0.7 }));
  vest.position.set(0, 1.14, 0.1);
  vest.scale.set(0.3, 0.3, 0.08);
  const armL = new Mesh(boxGeo, ridge);
  armL.position.set(-0.3, 1.1, 0.06);
  armL.scale.set(0.1, 0.38, 0.1);
  const armR = armL.clone();
  armR.position.x = 0.3;
  const rifle = new Mesh(boxGeo, gunMat);
  rifle.position.set(0.2, 1.02, 0.28);
  rifle.scale.set(0.05, 0.06, 0.42);
  const legL = new Mesh(boxGeo, cloth);
  legL.position.set(-0.1, 0.4, 0);
  legL.scale.set(0.12, 0.4, 0.12);
  const legR = legL.clone();
  legR.position.x = 0.1;
  const flash = new Mesh(new SphereGeometry(0.22, 8, 6), new MeshBasicMaterial({ color: 0xfff0b0 }));
  flash.position.set(0.2, 1.05, 0.52);
  flash.visible = false;
  group.add(helm, head, torso, vest, armL, armR, rifle, legL, legR, flash);
  group.userData = { torso, helm, armL, armR, legL, legR, ridge, guard, flash, fall: 0 };
  scene.add(group);
  return group;
}

function addTracerMesh() {
  const mesh = new Mesh(boxGeo, new MeshBasicMaterial({ color: 0xffd2a0 }));
  mesh.visible = false;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

function addSmoke() {
  const group = new Group();
    const mat = new MeshBasicMaterial({ color: 0xe4ddd2, transparent: true, opacity: 0.36, depthWrite: false });
  const geo = new SphereGeometry(1, 10, 8);
  const offsets = [[0, 1.1, 0], [1.2, 0.8, 0.4], [-1.1, 1.3, 0.3], [0.3, 1.6, -1.1], [-0.4, 0.6, 1.2]];
  for (let i = 0; i < offsets.length; i++) {
    const puff = new Mesh(geo, mat);
    puff.position.set(offsets[i][0], offsets[i][1], offsets[i][2]);
    puff.scale.setScalar(1.65);
    group.add(puff);
  }
  group.visible = false;
  scene.add(group);
  return group;
}

function addNadeMesh() {
  const mesh = new Mesh(new SphereGeometry(0.12, 8, 6), new MeshStandardMaterial({ color: 0x222222, roughness: 0.5 }));
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}

function addDropMesh() {
  const mesh = new Mesh(boxGeo, new MeshStandardMaterial({ color: 0xc4b08a, metalness: 0.45, roughness: 0.4 }));
  mesh.scale.set(0.55, 0.12, 0.14);
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}

function addImpactMesh() {
  const mesh = new Mesh(new SphereGeometry(0.06, 6, 5), new MeshBasicMaterial({ color: 0x2a2118 }));
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}

function vmBox(group, mat, x, y, z, sx, sy, sz) {
  const mesh = new Mesh(boxGeo, mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  group.add(mesh);
  return mesh;
}

function vmTube(group, mat, x, y, z, r, len) {
  const mesh = new Mesh(new CylinderGeometry(1, 1, 1, 8), mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.scale.set(r, len, r);
  group.add(mesh);
  return mesh;
}

function buildViewGun(kind, metalHex, sleeveHex) {
  const group = new Group();
  const metal = new MeshStandardMaterial({ color: metalHex, metalness: 0.72, roughness: 0.32 });
  const wood = new MeshStandardMaterial({ color: 0x5a3824, roughness: 0.78 });
  const hand = new MeshStandardMaterial({ color: 0xe4b898, roughness: 0.55 });
  const sleeve = new MeshStandardMaterial({ color: sleeveHex, roughness: 0.7 });
  const barrel = kind === 'sniper' ? 0.62 : kind === 'rifle' ? 0.46 : kind === 'smg' ? 0.3 : 0.16;
  const stockLen = kind === 'pistol' ? 0.02 : 0.16;
  vmBox(group, metal, 0, 0, -0.06, 0.055, 0.075, kind === 'pistol' ? 0.16 : 0.22);
  vmTube(group, metal, 0, 0.012, -0.16 - barrel * 0.45, kind === 'sniper' ? 0.011 : 0.016, barrel);
  vmBox(group, wood, 0, -0.015, 0.1, 0.04, 0.055, stockLen);
  vmBox(group, metal, 0, -0.075, -0.02, 0.028, kind === 'pistol' ? 0.07 : 0.12, 0.04);
  if (kind !== 'pistol') vmBox(group, metal, 0, 0.055, -0.02, 0.016, 0.028, kind === 'sniper' ? 0.16 : 0.07);
  if (kind === 'sniper') vmTube(group, metal, 0, 0.08, -0.08, 0.016, 0.18);
  vmBox(group, hand, 0.02, -0.055, 0.02, 0.05, 0.045, 0.07);
  vmBox(group, sleeve, 0.04, -0.07, 0.1, 0.065, 0.05, 0.11);
  const flash = new Mesh(new SphereGeometry(0.045, 6, 5), new MeshBasicMaterial({ color: 0xfff0c0 }));
  flash.position.set(0, 0.012, -0.18 - barrel);
  flash.visible = false;
  group.add(flash);
  group.userData.flash = flash;
  return group;
}

function addViewmodel() {
  const root = new Group();
  root.position.set(0.24, -0.22, -0.38);
  viewBySlot.wick = buildViewGun('pistol', 0xc8c4b8, 0x8a3a24);
  viewBySlot.ember = buildViewGun('pistol', 0x6e2e28, 0x8a3a24);
  viewBySlot.thresher = buildViewGun('smg', 0x6a5a3a, 0x8a3a24);
  viewBySlot.terrace = buildViewGun('rifle', 0xd7c4a2, 0x8a3a24);
  viewBySlot.ridgefire = buildViewGun('rifle', 0x8a3a28, 0x8a3a24);
  viewBySlot.longglass = buildViewGun('sniper', 0x2c3338, 0x1a4d62);
  root.add(viewBySlot.wick, viewBySlot.ember, viewBySlot.thresher, viewBySlot.terrace, viewBySlot.ridgefire, viewBySlot.longglass);
  return root;
}

export function syncWorld() {
  const you = player();
  let subject = you;
  if (!you.alive && state.phase !== 'title') {
    if (state.spectate < 0 || !state.actors[state.spectate] || !state.actors[state.spectate].alive) {
      for (let i = 1; i < state.actors.length; i++) {
        if (state.actors[i].alive && state.actors[i].org === you.org) { state.spectate = i; break; }
      }
    }
    if (state.spectate >= 0 && state.actors[state.spectate].alive) subject = state.actors[state.spectate];
  }
  if (state.phase === 'title') {
    camera.position.set(2, 7.2, -14);
    camera.lookAt(-24, 6.5, 18);
    camera.fov = 60;
  } else {
    const bob = Math.sin(state.time * 9) * Math.min(0.04, Math.hypot(subject.vx, subject.vz) * 0.008);
    camera.position.set(subject.x, eyeY(subject) + bob, subject.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = subject.yaw;
    camera.rotation.x = subject.pitch;
    camera.fov = subject.scope > 0.45 ? 26 : 76;
  }
  camera.updateProjectionMatrix();

  const list = state.actors;
  for (let i = 0; i < list.length; i++) {
    const actor = list[i];
    const group = characters[i];
    group.visible = actor.alive && actor !== subject && state.phase !== 'title';
    if (!group.visible && actor.alive) continue;
    group.position.set(actor.x, actor.y, actor.z);
    group.rotation.set(0, actor.yaw, 0);
    const parts = group.userData;
    const jacket = actor.org === 'ridge' ? parts.ridge : parts.guard;
    parts.torso.material = jacket;
    parts.helm.material = jacket;
    parts.armL.material = jacket;
    parts.armR.material = jacket;
    const speed = Math.hypot(actor.vx, actor.vz);
    const swing = actor.alive ? Math.sin(state.time * 9 + actor.id) * Math.min(0.55, speed * 0.1) : 0;
    parts.legL.rotation.x = swing;
    parts.legR.rotation.x = -swing;
    parts.armL.rotation.x = -swing * 0.7;
    parts.armR.rotation.x = swing * 0.45;
    const crouch = actor.crouch ? 0.22 : 0;
    parts.torso.position.y = 1.12 - crouch;
    parts.helm.position.y = 1.64 - crouch;
    if (!actor.alive) {
      group.visible = state.phase !== 'title';
      parts.fall = state.frozen ? 1.25 : Math.min(1.25, parts.fall + 0.08);
      group.rotation.x = parts.fall;
      group.position.y = actor.y + 0.08;
    } else parts.fall = 0;
    parts.flash.visible = actor.alive && actor.muzzleT > 0;
  }

  if (cabin) cabin.rotation.z = Math.sin(state.time * 0.7) * 0.025;

  const charge = state.charge;
  const showCharge = state.phase !== 'title' && charge.state !== 'gone';
  chargeMesh.visible = showCharge;
  if (showCharge) {
    chargeMesh.position.set(charge.x, charge.y, charge.z);
    const blink = charge.state === 'planted' ? 0.45 + 0.55 * Math.abs(Math.sin(state.time * (charge.timer < 10 ? 10 : 4))) : 0.35;
    chargeBulb.material.color.setRGB(1, 0.15 * blink, 0.08);
  }

  for (let i = 0; i < tracers.length; i++) {
    const t = state.tracers[i];
    const mesh = tracers[i];
    mesh.visible = t.life > 0 && state.phase !== 'title';
    if (!mesh.visible) continue;
    let x2 = t.x2;
    let y2 = t.y2;
    let z2 = t.z2;
    const cdx = x2 - camera.position.x;
    const cdy = y2 - camera.position.y;
    const cdz = z2 - camera.position.z;
    if (cdx * cdx + cdy * cdy + cdz * cdz < 2.2) {
      x2 = t.x + (x2 - t.x) * 0.72;
      y2 = t.y + (y2 - t.y) * 0.72;
      z2 = t.z + (z2 - t.z) * 0.72;
    }
    const len = Math.hypot(x2 - t.x, y2 - t.y, z2 - t.z) || 0.01;
    mesh.position.set((t.x + x2) / 2, (t.y + y2) / 2, (t.z + z2) / 2);
    mesh.scale.set(0.02, 0.02, len);
    mesh.lookAt(x2, y2, z2);
    mesh.material.color.setHex(t.crit ? 0xff5a3a : 0xffe08a);
  }

  for (let i = 0; i < smokeGroups.length; i++) {
    const s = state.smokes[i];
    const group = smokeGroups[i];
    group.visible = s.life > 0;
    if (!group.visible) continue;
    group.position.set(s.x, s.y, s.z);
    const grow = 0.85 + Math.min(1, (16 - s.life) / 2) * 0.35;
    group.scale.setScalar(grow);
  }

  for (let i = 0; i < nadeMeshes.length; i++) {
    const n = state.nades[i];
    nadeMeshes[i].visible = n.life > 0;
    if (n.life > 0) nadeMeshes[i].position.set(n.x, n.y, n.z);
  }
  for (let i = 0; i < impactMeshes.length; i++) {
    const n = state.impacts[i];
    impactMeshes[i].visible = n.life > 0;
    if (n.life > 0) impactMeshes[i].position.set(n.x, n.y, n.z);
  }
  for (let i = 0; i < dropMeshes.length; i++) {
    const d = state.drops[i];
    dropMeshes[i].visible = d.life > 0;
    if (d.life > 0) dropMeshes[i].position.set(d.x, d.y, d.z);
  }

  const gunName = you.slot === 'primary' ? you.primary : you.slot === 'secondary' ? you.secondary : '';
  viewBySlot.wick.visible = gunName === 'wick';
  viewBySlot.ember.visible = gunName === 'ember';
  viewBySlot.thresher.visible = gunName === 'thresher';
  viewBySlot.terrace.visible = gunName === 'terrace';
  viewBySlot.ridgefire.visible = gunName === 'ridgefire';
  viewBySlot.longglass.visible = gunName === 'longglass';
  viewRoot.visible = state.phase !== 'title' && you.alive && subject === you && you.scope < 0.4 && !!gunName;
  if (viewRoot.visible) {
    const speed = Math.hypot(you.vx, you.vz);
    const bob = Math.sin(state.time * 9) * Math.min(0.02, speed * 0.004);
    const reloadDip = you.reload > 0 ? Math.sin((1 - you.reload) * 6.2) * 0.12 : 0;
    viewRoot.position.y = -0.22 + bob - Math.abs(reloadDip);
    viewRoot.position.x = 0.24 + Math.cos(state.time * 9) * bob;
    viewRoot.rotation.x = -you.recoilP * 1.4 + reloadDip;
    viewRoot.rotation.z = -you.recoilY * 0.4;
    const gun = viewBySlot[gunName];
    if (gun && gun.userData.flash) gun.userData.flash.visible = you.recoilI > 0 && you.recoilT < 0.045;
  }
}

export function resize() {
  const w = renderer.domElement.parentElement.clientWidth || innerWidth;
  const h = renderer.domElement.parentElement.clientHeight || innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

export function renderWorld() {
  renderer.render(scene, camera);
}
