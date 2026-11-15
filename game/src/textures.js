// Procedural canvas textures. Nothing is fetched; wood, stone, tea and signs
// are painted once at boot.

import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function finish(c, repeatX, repeatY) {
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeatX || 1, repeatY || 1);
  return tex;
}

export function dirtTexture() {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#7a5a3e';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    g.fillStyle = i % 2 ? 'rgba(60,32,18,0.25)' : 'rgba(196,150,96,0.18)';
    g.fillRect((i * 47) % 256, (i * 29) % 256, 18, 8);
  }
  return finish(c, 3, 3);
}

export function teaTexture() {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#2f6a32';
  g.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++) {
    g.strokeStyle = row % 2 ? '#1e4a24' : '#63b45a';
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(0, 16 + row * 32);
    for (let x = 0; x <= 256; x += 32) g.quadraticCurveTo(x + 16, 4 + row * 32, x + 32, 16 + row * 32);
    g.stroke();
  }
  return finish(c, 2, 2);
}

export function bushTexture() {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#2f5a2c';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#1d3d1c';
  for (let i = 0; i < 18; i++) g.fillRect((i * 37) % 120, (i * 19) % 110, 22, 14);
  g.fillStyle = '#7dae62';
  for (let i = 0; i < 14; i++) g.fillRect((i * 23) % 110, (i * 41) % 100, 10, 8);
  return finish(c, 1, 1);
}

export function stoneTexture() {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#c9bfb2';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#5e564f';
  g.lineWidth = 4;
  for (let y = 0; y < 4; y++) {
    const off = y % 2 ? 40 : 0;
    for (let x = -1; x < 4; x++) {
      g.strokeRect(off + x * 86, y * 64 + 4, 78, 52);
      g.fillStyle = y % 2 ? '#d5cdc2' : '#b7aea2';
      g.fillRect(off + x * 86 + 6, y * 64 + 10, 66, 40);
    }
  }
  return finish(c, 1, 1);
}

export function woodTexture() {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#4a2e1c';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 7; i++) {
    g.fillStyle = i % 2 ? '#6b4228' : '#3a2416';
    g.fillRect(0, i * 36, 256, 32);
    g.fillStyle = 'rgba(255,220,170,0.08)';
    g.fillRect(20, i * 36 + 8, 180, 3);
  }
  return finish(c, 1, 2);
}

export function plankTexture() {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#a56b3e';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#7a4a2a';
  for (let i = 0; i < 6; i++) g.fillRect(i * 44, 0, 4, 256);
  return finish(c, 2, 2);
}

export function metalTexture() {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, '#8b939c');
  grad.addColorStop(1, '#4e565e');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#c5ccd4';
  for (let i = 0; i < 6; i++) g.fillRect(16 + (i % 3) * 36, 18 + ((i / 3) | 0) * 52, 6, 6);
  return finish(c, 1, 2);
}

export function crateTexture() {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#9a6236';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#5c3418';
  g.lineWidth = 8;
  g.strokeRect(8, 8, 112, 112);
  g.beginPath();
  g.moveTo(8, 8);
  g.lineTo(120, 120);
  g.moveTo(120, 8);
  g.lineTo(8, 120);
  g.stroke();
  return finish(c, 1, 1);
}

const signs = Object.create(null);

export function signTexture(letter, label) {
  const key = letter + '|' + label;
  if (signs[key]) return signs[key];
  const c = canvas(512, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#2a140e';
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#f0c36a';
  g.lineWidth = 12;
  g.strokeRect(14, 14, 484, 228);
  g.fillStyle = '#ff4d3a';
  g.font = '700 148px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 108, 132);
  g.fillStyle = '#f6f0e6';
  g.font = '700 42px Georgia, serif';
  g.textAlign = 'left';
  const words = label.split(' ');
  if (words.length > 1) {
    g.fillText(words[0], 196, 108);
    g.fillText(words.slice(1).join(' '), 196, 162);
  } else {
    g.fillText(label, 196, 136);
  }
  signs[key] = finish(c, 1, 1);
  return signs[key];
}
