// Scene, lights and mesh sync. Built once; the per-frame path only writes
// positions on pools that already exist.

import {
  Scene, PerspectiveCamera, WebGLRenderer, Color, Fog,
  DirectionalLight, HemisphereLight, AmbientLight, PointLight,
  Mesh, Group, BoxGeometry, SphereGeometry, CylinderGeometry, ConeGeometry, PlaneGeometry,
  MeshStandardMaterial, MeshBasicMaterial,
  PCFShadowMap, ACESFilmicToneMapping, SRGBColorSpace, DoubleSide,
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
  renderer.toneMappingExposure = 1.22;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  canvas.appendChild(renderer.domElement);

  scene.background = new Color(0xf0a86a);
  scene.fog = new Fog(0xe7a36a, 42, 140);

  scene.add(new HemisphereLight(0xffd7b0, 0x4a5530, 1.05));
  scene.add(new AmbientLight(0x6a4030, 0.55));

  const sun = new DirectionalLight(0xffb15e, 4.2);
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

  const fill = new DirectionalLight(0x9eb7d8, 0.55);
  fill.position.set(-20, 18, 30);
  scene.add(fill);
  const drying = new PointLight(0xffb070, 36, 16, 2);
  drying.position.set(-20, 4.7, 16.5);
  scene.add(drying);
  const rope = new PointLight(0xffb070, 28, 14, 2);
  rope.position.set(22, 4.8, 16);
  scene.add(rope);

  const sunBall = new Mesh(new SphereGeometry(4.2, 16, 12), new MeshBasicMaterial({ color: 0xffe0b0, fog: false }));
  sunBall.position.set(landmarks.sun.x, landmarks.sun.y, landmarks.sun.z);
  scene.add(sunBall);

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

function addMountains() {
  const mat = new MeshStandardMaterial({ color: 0x7e96b4, roughness: 1, metalness: 0, fog: false });
  const geo = new ConeGeometry(1, 1, 6);
  const list = landmarks.mountains;
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    const mesh = new Mesh(geo, mat);
    mesh.position.set(m.x, m.h * 0.35, m.z);
    mesh.scale.set(m.r, m.h, m.r);
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
  const wood = new MeshStandardMaterial({ color: 0x8a5434, roughness: 0.75 });
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
  const ridge = new MeshStandardMaterial({ color: 0xd24a2c, roughness: 0.6, emissive: 0x5a1a0c, emissiveIntensity: 0.45 });
  const guard = new MeshStandardMaterial({ color: 0x3d88b0, roughness: 0.55, emissive: 0x12384c, emissiveIntensity: 0.5 });
  const skin = new MeshStandardMaterial({ color: 0xe0b090, roughness: 0.6 });
  const cloth = new MeshStandardMaterial({ color: 0x2a2420, roughness: 0.8 });
  const torso = new Mesh(boxGeo, ridge);
  torso.position.y = 1.15;
  torso.scale.set(0.46, 0.52, 0.28);
  torso.castShadow = true;
  group.add(torso);
  const head = new Mesh(boxGeo, skin);
  head.position.y = 1.58;
  head.scale.set(0.24, 0.24, 0.24);
  head.castShadow = true;
  group.add(head);
  const armL = new Mesh(boxGeo, ridge);
  armL.position.set(-0.34, 1.16, 0);
  armL.scale.set(0.12, 0.46, 0.12);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.34;
  group.add(armR);
  const legL = new Mesh(boxGeo, cloth);
  legL.position.set(-0.12, 0.4, 0);
  legL.scale.set(0.14, 0.8, 0.16);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.12;
  group.add(legR);
  group.userData = { torso, head, armL, armR, legL, legR, ridge, guard, skin };
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

function addImpactMesh() {
  const mesh = new Mesh(new SphereGeometry(0.06, 6, 5), new MeshBasicMaterial({ color: 0x2a2118 }));
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}

function gunMesh(color, length) {
  const group = new Group();
  const mat = new MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.35 });
  const body = new Mesh(boxGeo, mat);
  body.scale.set(0.07, 0.09, length);
  body.position.set(0, 0, -length * 0.35);
  group.add(body);
  const grip = new Mesh(boxGeo, new MeshStandardMaterial({ color: 0x3a2418, roughness: 0.7 }));
  grip.scale.set(0.05, 0.12, 0.06);
  grip.position.set(0, -0.08, 0.02);
  group.add(grip);
  return group;
}

function addViewmodel() {
  const root = new Group();
  root.position.set(0.26, -0.24, -0.42);
  viewBySlot.wick = gunMesh(0xc8c2b4, 0.28);
  viewBySlot.ember = gunMesh(0x8a2e22, 0.32);
  viewBySlot.thresher = gunMesh(0x6e5a3a, 0.46);
  viewBySlot.terrace = gunMesh(0xd7c4a2, 0.62);
  viewBySlot.ridgefire = gunMesh(0x9a3b28, 0.66);
  viewBySlot.longglass = gunMesh(0x2c3338, 0.84);
  const names = Object.keys(viewBySlot);
  for (let i = 0; i < names.length; i++) root.add(viewBySlot[names[i]]);
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
    camera.position.set(-4.5, 5.4, -8);
    camera.lookAt(-18, 4.6, 14);
    camera.fov = 64;
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
    parts.armL.material = jacket;
    parts.armR.material = jacket;
    const crouch = actor.crouch ? 0.72 : 1;
    parts.torso.position.y = 0.85 + 0.3 * crouch;
    parts.head.position.y = 1.15 + 0.43 * crouch;
    if (!actor.alive) {
      group.visible = state.phase !== 'title';
      group.rotation.z = 1.35;
      group.position.y = actor.y + 0.15;
    }
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
    const len = Math.hypot(t.x2 - t.x, t.y2 - t.y, t.z2 - t.z) || 0.01;
    mesh.position.set((t.x + t.x2) / 2, (t.y + t.y2) / 2, (t.z + t.z2) / 2);
    mesh.scale.set(0.028, 0.028, len);
    mesh.lookAt(t.x2, t.y2, t.z2);
    mesh.material.color.setHex(t.crit ? 0xff4d3a : 0xfff6d0);
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
    viewRoot.position.y = -0.24 + Math.sin(state.time * 9) * speed * 0.004;
    viewRoot.rotation.x = -you.recoilP * 0.8;
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
