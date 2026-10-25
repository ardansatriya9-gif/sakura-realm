// ============================================================
//  main.js — Sakura Realm: game loop, kontrol, kamera, skill,
//  HUD, peta + tracking, siklus waktu.
// ============================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, createSky, getHeight, resolveCollisions, pointBlocked, PLACES, LAKE, WATER_Y, WORLD, phaseName, nearRoad } from './world.js';
import { createHumanoid, animateHumanoid } from './character.js';
import { createNPCs, spawnSlimes, lerpAngle } from './entities.js';
import * as SND from './audio.js';

// ---------------- pengaturan kualitas (ubah sesuai GPU) ----------------
const Q = { shadow: 2048, bloom: true, maxPixelRatio: 2, trees: 1800, grassBlades: 8000, msaa: 4 };
const HOURS_PER_SEC = 24 / 480;           // 1 hari game = 8 menit nyata
const $ = (id) => document.getElementById(id);

// ---------------- renderer ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const PR = Math.min(window.devicePixelRatio || 1, Q.maxPixelRatio);
renderer.setPixelRatio(PR);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe9ff, 70, 900);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 3000);

const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(Q.shadow, Q.shadow);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 520 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xbfdcff, 0x55663a, 1);
scene.add(hemi);
const lantern = new THREE.PointLight(0xffd9a0, 0, 16, 2);
scene.add(lantern);

// post-processing (bloom + MSAA)
const rt = new THREE.WebGLRenderTarget(innerWidth * PR, innerHeight * PR, { type: THREE.HalfFloatType, samples: Q.msaa });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(PR); composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.6, 0.88);
if (Q.bloom) composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------- dunia ----------------
const world = buildWorld(scene, Q);
const sky = createSky(scene, sun, hemi);

// ---------------- pemain ----------------
const hero = createHumanoid({
  skin: 0xffe6d8, hair: 0xe4e7f3, hairEmissive: 0x1a1c2e, hairStyle: 'long', hairLength: 0.95,
  top: 0xffffff, skirt: true, skirtColor: 0x3d3d48, socks: true, bowtie: true, ribbon: true, ahoge: true, sword: true,
  eyeTop: '#3f86e0', eyeBottom: '#b5e6ff', shoes: 0x5a3a2c,
});
scene.add(hero.root);

const P = {
  pos: new THREE.Vector3(3, 0, 40), vel: new THREE.Vector3(), yaw: Math.PI, onGround: true,
  hp: 200, maxHp: 200, alive: true, invuln: 0, stepT: 0, deathT: 0, kills: 0,
  atk: { t: -1, dur: 0.42, hit: false },
  ult: { active: false, t: 0, dur: 2.6, tick: 0 },
  heal: { t: 0 },
  cd: { q: 0, e: 0, r: 0 },
};
const CD = { q: 25, e: 18, r: 0.55 };
P.pos.y = getHeight(P.pos.x, P.pos.z);

const cam = { yaw: 0, pitch: 0.3, dist: 7.5, shake: 0, target: new THREE.Vector3(), f: 1 };
const npcs = createNPCs(scene);
const slimes = spawnSlimes(scene, camera, 30);
const game = { running: false, paused: false, locked: false, dragMode: false, mapOpen: false, hour: 8, time: 0, dialog: null, track: null, player: P,
  hurtPlayer: (n, from) => hurtPlayer(n, from) };

// ---------------- efek (partikel, tebasan, angka damage) ----------------
function spriteTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
class Particles {
  constructor(max = 900) {
    this.max = max; this.i = 0;
    this.pos = new Float32Array(max * 3).fill(-9999); this.col = new Float32Array(max * 3); this.base = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.mx = new Float32Array(max).fill(1); this.grav = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo = g;
    const m = new THREE.PointsMaterial({ size: 0.45, map: spriteTex(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, life, r, g, b, grav = 0) {
    const i = this.i; this.i = (i + 1) % this.max; const k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z; this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.base[k] = r; this.base[k + 1] = g; this.base[k + 2] = b; this.col[k] = r; this.col[k + 1] = g; this.col[k + 2] = b;
    this.life[i] = life; this.mx[i] = life; this.grav[i] = grav;
  }
  burst(p, n, speed, life, rgb, grav = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, b = (Math.random() - 0.3) * 2, s = speed * (0.4 + Math.random());
      this.emit(p.x, p.y, p.z, Math.cos(a) * s, b * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), rgb[0], rgb[1], rgb[2], grav);
    }
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      const k = i * 3; this.life[i] -= dt;
      if (this.life[i] <= 0) { this.col[k] = this.col[k + 1] = this.col[k + 2] = 0; this.pos[k + 1] = -9999; continue; }
      this.vel[k + 1] -= this.grav[i] * dt;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const f = this.life[i] / this.mx[i];
      this.col[k] = this.base[k] * f; this.col[k + 1] = this.base[k + 1] * f; this.col[k + 2] = this.base[k + 2] * f;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
  }
}
const parts = new Particles();

const arcShape = new THREE.Shape();
arcShape.absarc(0, 0, 1.5, -1.05, 1.05, false);
arcShape.absarc(-0.6, 0, 1.871, 0.77, -0.77, true);
const arcGeo = new THREE.ShapeGeometry(arcShape, 24);
const arcs = [];
for (let i = 0; i < 56; i++) {
  const m = new THREE.Mesh(arcGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  m.visible = false; scene.add(m); arcs.push({ m, t: 0, dur: 0.2, s: 1, active: false });
}
function spawnArc(pos, scale, color, dur = 0.22) {
  const a = arcs.find((x) => !x.active) || arcs[0];
  a.active = true; a.t = 0; a.dur = dur; a.s = scale;
  a.m.position.copy(pos); a.m.quaternion.copy(camera.quaternion); a.m.rotateZ(Math.random() * 6.28);
  a.m.material.color.set(color); a.m.visible = true;
}
function updateArcs(dt) {
  for (const a of arcs) {
    if (!a.active) continue;
    a.t += dt; const k = a.t / a.dur;
    if (k >= 1) { a.active = false; a.m.visible = false; continue; }
    a.m.scale.setScalar(a.s * (0.6 + 0.9 * k)); a.m.material.opacity = 1 - k;
  }
}
function dmgNumber(pos, text, cls = '') {
  const v = pos.clone().project(camera);
  if (v.z > 1) return;
  const d = document.createElement('div'); d.className = 'dmg ' + cls; d.textContent = text;
  d.style.left = (v.x * 0.5 + 0.5) * innerWidth + 'px'; d.style.top = (-v.y * 0.5 + 0.5) * innerHeight + 'px';
  $('dmgLayer').appendChild(d); setTimeout(() => d.remove(), 900);
}
let toastTimer = 0;
function toast(text, ms = 2600) {
  const t = $('toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------------- peta ----------------
let mapCanvas = null;
function prerenderMap() {
  const S = 512; mapCanvas = document.createElement('canvas'); mapCanvas.width = mapCanvas.height = S;
  const g = mapCanvas.getContext('2d'); const img = g.createImageData(S, S); const d = img.data;
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const x = (px + 0.5) / S * WORLD.size - WORLD.size / 2, z = (py + 0.5) / S * WORLD.size - WORLD.size / 2;
    const h = getHeight(x, z), h2 = getHeight(x + 5, z + 5);
    let c;
    if (h < WATER_Y) c = [70, 150, 225];
    else if (h > 112) c = [245, 248, 255];
    else if (h > 72) c = [140, 135, 142];
    else if (h > 26) c = [72, 134, 72];
    else c = [112, 190, 92];
    const sh = 1 + Math.max(-0.35, Math.min(0.35, (h2 - h) * 0.06));
    const k = (py * S + px) * 4;
    d[k] = Math.min(255, c[0] * sh); d[k + 1] = Math.min(255, c[1] * sh); d[k + 2] = Math.min(255, c[2] * sh); d[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const k = S / WORLD.size, T = (v) => (v + WORLD.size / 2) * k;
  const disc = (p, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(T(p.x), T(p.z), r * k, 0, 7); g.fill(); };
  disc(PLACES.city, 66, '#c9c3d6'); disc(PLACES.kingdom, 62, '#f2d9e6'); disc(PLACES.village, 40, '#c9a878'); disc(PLACES.spawn, 9, '#d9d4e8');
  g.strokeStyle = '#c2a47a'; g.lineWidth = 6 * k; g.lineCap = 'round';
  for (const poly of world.roadPolys) { g.beginPath(); poly.forEach((p, i) => (i ? g.lineTo(T(p[0]), T(p[1])) : g.moveTo(T(p[0]), T(p[1])))); g.stroke(); }
}
const mini = $('minimap').getContext('2d'), big = $('bigmap').getContext('2d');
const WAYPOINTS = { Digit1: ['kingdom', 'Kerajaan Sakura'], Digit2: ['city', 'Kota Neo-Hikari'], Digit3: ['village', 'Desa Momiji'] };

function drawMap(ctx, size, cx, cz, span, full) {
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  if (!full) { ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, 7); ctx.clip(); }
  const k = mapCanvas.width / WORLD.size, sw = span * k;
  ctx.fillStyle = '#2b3b55'; ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(mapCanvas, (cx + WORLD.size / 2) * k - sw / 2, (cz + WORLD.size / 2) * k - sw / 2, sw, sw, 0, 0, size, size);
  const S = (x, z) => [((x - cx) / span + 0.5) * size, ((z - cz) / span + 0.5) * size];
  const dot = (x, z, r, col) => { const [sx, sy] = S(x, z); if (sx < -5 || sy < -5 || sx > size + 5 || sy > size + 5) return; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.5; ctx.stroke(); };
  const fs = full ? 16 : 13;
  ctx.font = `700 ${fs}px sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,15,35,.85)'; ctx.fillStyle = '#fff';
  for (const key in PLACES) {
    if (key === 'spawn') continue;
    const p = PLACES[key], [sx, sy] = S(p.x, p.z);
    if (sx > -40 && sy > -20 && sx < size + 40 && sy < size + 20) { ctx.strokeText(p.name, sx, sy); ctx.fillText(p.name, sx, sy); }
  }
  { const [sx, sy] = S(LAKE.x, LAKE.z); ctx.strokeText(LAKE.name, sx, sy); ctx.fillText(LAKE.name, sx, sy); }
  for (const n of npcs) dot(n.pos.x, n.pos.z, full ? 4 : 3.2, '#ffd54a');
  for (const s of slimes) if (s.alive) dot(s.pos.x, s.pos.z, full ? 4 : 3.2, '#ff5a6e');
  for (const it of world.interactables) if (it.kind === 'chest' && !it.opened) dot(it.x, it.z, full ? 4 : 3, '#7affd0');
  if (game.track) {
    const [sx, sy] = S(game.track.x, game.track.z);
    const inside = sx > 8 && sy > 8 && sx < size - 8 && sy < size - 8;
    let tx = sx, ty = sy;
    if (!inside) { const a = Math.atan2(sy - size / 2, sx - size / 2), r = size / 2 - 12; tx = size / 2 + Math.cos(a) * r; ty = size / 2 + Math.sin(a) * r; }
    ctx.fillStyle = '#ff7ac8'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(tx, ty, full ? 9 : 7, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(tx, ty, full ? 15 : 12, 0, 7); ctx.strokeStyle = 'rgba(255,122,200,.6)'; ctx.stroke();
  }
  // pemain (panah menghadap arah karakter)
  const [px, py] = S(P.pos.x, P.pos.z);
  ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI - P.yaw);
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#1a2a6a'; ctx.lineWidth = 2.5;
  const a = full ? 11 : 9;
  ctx.beginPath(); ctx.moveTo(0, -a * 1.2); ctx.lineTo(a * 0.8, a); ctx.lineTo(0, a * 0.5); ctx.lineTo(-a * 0.8, a); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.restore();
  if (!full) { ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 1.5, 0, 7); ctx.stroke(); }
}

// tracking & beacon
const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 160, 14, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xff7ac8, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, fog: false }));
beacon.visible = false; scene.add(beacon);
function setTrack(x, z, name) {
  game.track = { x, z, name };
  beacon.position.set(x, getHeight(x, z) + 80, z); beacon.visible = true;
  $('tracker').classList.remove('hidden'); SND.sfx('ui');
  toast('Tujuan: ' + name);
}
function clearTrack() { game.track = null; beacon.visible = false; $('tracker').classList.add('hidden'); }

// ---------------- input ----------------
const keys = {};
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
addEventListener('keydown', (e) => {
  if (e.repeat) { if (e.code === 'Space') e.preventDefault(); return; }
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (!game.running) return;
  switch (e.code) {
    case 'KeyQ': castUlt(); break;
    case 'KeyE': castHeal(); break;
    case 'KeyR': castSlash(); break;
    case 'KeyP': interact(); break;
    case 'KeyM': toggleMap(); break;
    case 'KeyT': skipTime(); break;
    case 'KeyN': toast(SND.toggleMute() ? 'Suara dimatikan' : 'Suara dinyalakan'); break;
    case 'KeyH': $('help').classList.toggle('hidden'); break;
    case 'KeyF': document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); break;
    case 'Digit0': clearTrack(); break;
    case 'Digit4': setTrack(LAKE.x, LAKE.z, LAKE.name); break;
    case 'Escape': if (game.mapOpen) toggleMap(); break;
    default:
      if (WAYPOINTS[e.code]) { const [k, n] = WAYPOINTS[e.code]; setTrack(PLACES[k].x, PLACES[k].z, n); }
  }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('mousemove', (e) => {
  if (!game.running || game.paused) return;
  if (game.locked || (game.dragMode && (e.buttons & 1))) {
    cam.yaw -= e.movementX * 0.0024; cam.pitch += e.movementY * 0.0024;
    cam.pitch = Math.max(-0.12, Math.min(1.3, cam.pitch));
  }
});
addEventListener('mousedown', (e) => {
  if (!game.running || game.paused || e.button !== 0) return;
  if (game.locked || game.dragMode) castSlash();
});
addEventListener('wheel', (e) => { if (game.running) cam.dist = Math.max(3, Math.min(14, cam.dist + Math.sign(e.deltaY) * 0.8)); }, { passive: true });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setPixelRatio(PR); composer.setSize(innerWidth, innerHeight);
});
document.addEventListener('pointerlockchange', () => {
  game.locked = document.pointerLockElement === renderer.domElement;
  if (game.locked) showOverlay(false);
  else if (game.running && !game.mapOpen && !game.dragMode) showOverlay(true, 'Jeda');
});
function lockPointer() { try { renderer.domElement.requestPointerLock(); } catch (e) { /* abaikan */ } }
function showOverlay(show, title) {
  $('overlay').style.display = show ? 'grid' : 'none';
  game.paused = show || game.mapOpen;
  if (show && title) { $('startBtn').textContent = '▶ Lanjutkan'; $('startBtn').classList.remove('hidden'); $('loading').textContent = title; }
}
$('startBtn').addEventListener('click', () => {
  SND.initAudio(); SND.resume();
  if (!game.running) { game.running = true; $('hud').classList.remove('hidden'); SND.speak('start', true); toast('Tekan M untuk peta · 1/2/3 untuk tracking · P untuk bicara'); }
  showOverlay(false); game.paused = false;
  lockPointer();
  setTimeout(() => { if (!game.locked && game.running && $('overlay').style.display === 'none') { game.dragMode = true; toast('Mode seret: tahan klik kiri & geser mouse untuk memutar kamera'); } }, 500);
});
$('bigmap').addEventListener('click', (e) => {
  const r = e.target.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width - 0.5) * WORLD.size, z = ((e.clientY - r.top) / r.height - 0.5) * WORLD.size;
  setTrack(x, z, 'Waypoint');
});
function toggleMap() {
  game.mapOpen = !game.mapOpen;
  $('mapOverlay').classList.toggle('hidden', !game.mapOpen);
  game.paused = game.mapOpen;
  if (game.mapOpen) document.exitPointerLock?.();
  else if (!game.dragMode) { lockPointer(); }
}

// ---------------- kombat ----------------
const fwd = () => new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
function nearestEnemy(range) {
  let best = null, bd = range;
  for (const s of slimes) { if (!s.alive) continue; const d = Math.hypot(s.pos.x - P.pos.x, s.pos.z - P.pos.z); if (d < bd) { bd = d; best = s; } }
  return best;
}
function hitSlime(s, dmg, big) {
  const p = s.pos.clone(); p.y += 1.0;
  const killed = s.hit(dmg, P.pos);
  dmgNumber(p, String(dmg));
  parts.burst(p, big ? 5 : 8, 5, 0.4, [1, 0.6, 0.85]);
  SND.sfx('hit');
  if (killed) {
    parts.burst(p, 26, 6, 0.8, [0.6, 1, 0.8], 5); SND.sfx('pop');
    P.kills++; $('kills').textContent = '· Slime: ' + P.kills;
  }
}
function castSlash() {
  if (!P.alive || P.cd.r > 0 || P.atk.t >= 0 || P.ult.active) return;
  P.cd.r = CD.r; P.atk.t = 0; P.atk.hit = false;
  const t = nearestEnemy(9);
  if (t) P.yaw = Math.atan2(t.pos.x - P.pos.x, t.pos.z - P.pos.z);
  else P.yaw = Math.atan2(-Math.sin(cam.yaw), -Math.cos(cam.yaw));
  SND.sfx('swoosh'); SND.speak('attack');
}
function castUlt() {
  if (!P.alive || P.cd.q > 0 || P.ult.active) return;
  P.ult.active = true; P.ult.t = 0; P.ult.tick = 0; P.cd.q = CD.q; P.atk.t = -1;
  SND.sfx('ult'); SND.speak('ult', true);
  cam.shake = 0.25;
}
function castHeal() {
  if (!P.alive || P.cd.e > 0) return;
  if (P.hp >= P.maxHp) { toast('HP sudah penuh!'); return; }
  const amount = Math.floor(P.maxHp / 2);
  P.hp = Math.min(P.maxHp, P.hp + amount); P.cd.e = CD.e; P.heal.t = 1.3;
  dmgNumber(P.pos.clone().add(new THREE.Vector3(0, 2.2, 0)), '+' + amount, 'heal');
  SND.sfx('heal'); SND.speak('heal', true);
}
function healPlayer(n, msg) {
  if (P.hp >= P.maxHp) { toast('HP sudah penuh!'); return false; }
  P.hp = Math.min(P.maxHp, P.hp + n); P.heal.t = 1.0;
  dmgNumber(P.pos.clone().add(new THREE.Vector3(0, 2.2, 0)), '+' + n, 'heal');
  SND.sfx('heal'); toast(msg); return true;
}
function hurtPlayer(n, from) {
  if (!P.alive || P.invuln > 0 || P.ult.active) return;
  P.hp = Math.max(0, P.hp - n); P.invuln = 0.7;
  dmgNumber(P.pos.clone().add(new THREE.Vector3(0, 2.0, 0)), '-' + n, 'hurt');
  const f = $('hurtflash'); f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 90);
  cam.shake = Math.max(cam.shake, 0.12);
  if (from) { const dx = P.pos.x - from.x, dz = P.pos.z - from.z, d = Math.hypot(dx, dz) || 1; P.vel.x += dx / d * 6; P.vel.z += dz / d * 6; }
  SND.sfx('hurt'); SND.speak('hurt');
  if (P.hp <= 0) die();
}
function die() {
  P.alive = false; P.deathT = 0; P.ult.active = false; P.atk.t = -1;
  SND.speak('die', true);
  $('banner').textContent = 'Yuki pingsan…'; $('banner').classList.remove('hidden');
}
function respawn() {
  P.alive = true; P.hp = P.maxHp; P.pos.set(3, 0, 40); P.vel.set(0, 0, 0); P.invuln = 2;
  hero.root.rotation.x = 0; $('banner').classList.add('hidden');
  toast('Kamu terbangun di Padang Awal.');
}
function updateCombat(dt) {
  for (const k of ['q', 'e', 'r']) if (P.cd[k] > 0) P.cd[k] = Math.max(0, P.cd[k] - dt);
  if (P.invuln > 0) P.invuln -= dt;
  const c = P.pos.clone(); c.y += 1.2;
  // tebasan biasa
  if (P.atk.t >= 0) {
    P.atk.t += dt;
    if (!P.atk.hit && P.atk.t >= 0.16) {
      P.atk.hit = true;
      const f = fwd(), arcPos = P.pos.clone().addScaledVector(f, 1.9); arcPos.y += 1.2;
      spawnArc(arcPos, 1.35, 0xbfe4ff, 0.25);
      parts.burst(arcPos, 6, 4, 0.3, [0.6, 0.85, 1], 0);
      for (const s of slimes) {
        if (!s.alive) continue;
        const dx = s.pos.x - P.pos.x, dz = s.pos.z - P.pos.z, d = Math.hypot(dx, dz);
        if (d < 4.8 && (d < 1.2 || (dx * f.x + dz * f.z) / d > 0.3)) hitSlime(s, 25, false);
      }
    }
    if (P.atk.t >= P.atk.dur) P.atk.t = -1;
  }
  // ultimate: tebasan brutal beruntun
  if (P.ult.active) {
    P.ult.t += dt; P.ult.tick -= dt;
    cam.shake = Math.max(cam.shake, 0.09);
    if (P.ult.tick <= 0) {
      P.ult.tick = 0.09;
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * 6.28, r = 1 + Math.random() * 2.6;
        const p = new THREE.Vector3(P.pos.x + Math.cos(a) * r, P.pos.y + 0.4 + Math.random() * 2.2, P.pos.z + Math.sin(a) * r);
        spawnArc(p, 1.1 + Math.random() * 1.6, Math.random() < 0.5 ? 0xff9ad8 : 0x9ad8ff, 0.2);
      }
      parts.burst(c, 10, 9, 0.5, [1, 0.8, 0.5], 4);
      for (const s of slimes) {
        if (!s.alive) continue;
        if (Math.hypot(s.pos.x - P.pos.x, s.pos.z - P.pos.z) < 9) {
          const p = s.pos.clone(); p.y += 1; spawnArc(p, 1.3, 0xffffff, 0.18);
          hitSlime(s, 14 + Math.floor(Math.random() * 7), true);
        }
      }
    }
    if (P.ult.t >= P.ult.dur) { P.ult.active = false; SND.speak('ultEnd', true); spawnArc(c, 4, 0xffffff, 0.4); parts.burst(c, 40, 12, 0.8, [1, 0.7, 0.9], 3); }
  }
  // regen visual
  if (P.heal.t > 0) {
    P.heal.t -= dt;
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * 6.28, r = 0.4 + Math.random() * 0.9;
      parts.emit(P.pos.x + Math.cos(a) * r, P.pos.y + 0.1, P.pos.z + Math.sin(a) * r, 0, 1.6 + Math.random() * 1.4, 0, 1.1, 0.5, 1, 0.65, 0);
    }
  }
  // tampilan HP + skill
  const pct = P.hp / P.maxHp * 100;
  $('hpfill').style.width = pct + '%'; $('hptext').textContent = Math.ceil(P.hp) + ' / ' + P.maxHp;
  for (const k of ['q', 'e', 'r']) {
    $('cd-' + k).style.height = (P.cd[k] / CD[k] * 100) + '%';
    $('cdt-' + k).textContent = P.cd[k] > 0.05 ? (P.cd[k] >= 1 ? Math.ceil(P.cd[k]) : P.cd[k].toFixed(1)) : '';
    $('sk-' + k).classList.toggle('ready', P.cd[k] <= 0);
  }
}

// ---------------- interaksi ----------------
let nearest = null;
function findInteractable() {
  let best = null, bd = 1e9;
  for (const n of npcs) { const d = Math.hypot(n.pos.x - P.pos.x, n.pos.z - P.pos.z); if (d < 3.4 && d < bd) { bd = d; best = { type: 'npc', npc: n, label: 'Bicara dengan ' + n.name }; } }
  for (const it of world.interactables) {
    if (it.kind === 'chest' && it.opened) continue;
    const d = Math.hypot(it.x - P.pos.x, it.z - P.pos.z);
    if (d < it.radius && d < bd) { bd = d; best = { type: 'obj', it, label: it.label }; }
  }
  return best;
}
function showDialog(name, text) { $('dName').textContent = name; $('dText').textContent = text; $('dialogue').classList.remove('hidden'); }
function closeDialog() { if (game.dialog) game.dialog.talking = false; game.dialog = null; $('dialogue').classList.add('hidden'); }
function skipTime() {
  const targets = [6.5, 12, 17, 21];
  const next = targets.find((t) => t > game.hour + 0.2) ?? targets[0];
  game.hour = next; toast('Waktu: ' + phaseName(next));
}
function interact() {
  if (!P.alive) return;
  if (game.dialog) {
    const n = game.dialog;
    if (n.lineIdx >= n.lines.length) closeDialog(); else showDialog(n.name, n.nextLine());
    return;
  }
  const f = nearest || findInteractable();
  if (!f) return;
  if (f.type === 'npc') {
    const n = f.npc; n.lineIdx = 0; n.talking = true; game.dialog = n;
    showDialog(n.name, n.nextLine()); SND.speak('hello'); SND.sfx('ui');
  } else {
    const it = f.it, now = game.time;
    switch (it.kind) {
      case 'well': if ((it.cd || 0) < now && healPlayer(40, 'Air sumur menyegarkan! +40 HP')) it.cd = now + 8; break;
      case 'fountain': if ((it.cd || 0) < now && healPlayer(20, 'Koin dilempar… semoga beruntung! +20 HP')) it.cd = now + 12; break;
      case 'sign': toast(it.text, 5500); break;
      case 'crystal': skipTime(); SND.sfx('heal'); break;
      case 'chest':
        it.opened = true; it.lid.rotation.x = -1.3; it.glow.visible = false;
        P.hp = Math.min(P.maxHp, P.hp + 60); SND.sfx('chest');
        parts.burst(new THREE.Vector3(it.x, it.group.position.y + 1, it.z), 40, 5, 1, [1, 0.85, 0.4], 2);
        toast('Peti terbuka! Potion ajaib: +60 HP'); dmgNumber(P.pos.clone().add(new THREE.Vector3(0, 2.2, 0)), '+60', 'heal'); break;
      default: break;
    }
  }
}

// ---------------- gerak pemain ----------------
const SPAWN_TIME = { v: 0 };
function slopeOK(nx, nz, len) { return (getHeight(nx, nz) - P.pos.y) / Math.max(len, 1e-4) < 1.25; }
function movePlayer(dt) {
  const ix = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), iz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  let mx = fx * iz + rx * ix, mz = fz * iz + rz * ix;
  const len = Math.hypot(mx, mz); if (len > 0) { mx /= len; mz /= len; }
  const input = P.alive && len > 0;
  const sprint = input && (keys.ShiftLeft || keys.ShiftRight);
  const gh0 = getHeight(P.pos.x, P.pos.z);
  let speed = sprint ? 10.5 : 5.4;
  if (P.ult.active) speed *= 0.35; else if (P.atk.t >= 0) speed *= 0.6;
  if (gh0 < WATER_Y) speed *= 0.55;
  const tvx = input ? mx * speed : 0, tvz = input ? mz * speed : 0;
  const a = Math.min(1, dt * (P.onGround ? 14 : 4));
  P.vel.x += (tvx - P.vel.x) * a; P.vel.z += (tvz - P.vel.z) * a;
  if (keys.Space && P.onGround && P.alive) { P.vel.y = 9.2; P.onGround = false; SND.sfx('jump'); SND.speak('jump'); }
  P.vel.y -= 26 * dt;
  // gerak horizontal + batas kemiringan
  const nx = P.pos.x + P.vel.x * dt, nz = P.pos.z + P.vel.z * dt;
  const step = Math.hypot(nx - P.pos.x, nz - P.pos.z);
  if (step > 1e-5) {
    if (!P.onGround || slopeOK(nx, nz, step)) { P.pos.x = nx; P.pos.z = nz; }
    else {
      if (Math.abs(nx - P.pos.x) > 1e-4 && slopeOK(nx, P.pos.z, Math.abs(nx - P.pos.x))) P.pos.x = nx;
      else if (Math.abs(nz - P.pos.z) > 1e-4 && slopeOK(P.pos.x, nz, Math.abs(nz - P.pos.z))) P.pos.z = nz;
      P.vel.x *= 0.5; P.vel.z *= 0.5;
    }
  }
  resolveCollisions(P.pos, 0.45);
  const r = Math.hypot(P.pos.x, P.pos.z);
  if (r > WORLD.limit) { P.pos.x *= WORLD.limit / r; P.pos.z *= WORLD.limit / r; }
  P.pos.y += P.vel.y * dt;
  const gh = getHeight(P.pos.x, P.pos.z);
  if (P.pos.y <= gh || (P.onGround && P.vel.y <= 0 && P.pos.y - gh < 0.4)) { P.pos.y = gh; P.vel.y = 0; P.onGround = true; } else P.onGround = false;
  // arah hadap
  if (P.alive) {
    if (P.atk.t < 0 && !P.ult.active && len > 0.01) P.yaw = lerpAngle(P.yaw, Math.atan2(mx, mz), 1 - Math.exp(-dt * 14));
  }
  // langkah kaki
  const hs = Math.hypot(P.vel.x, P.vel.z);
  if (P.onGround && hs > 1) { P.stepT += dt * (sprint ? 3.6 : 2.5); if (P.stepT >= 1) { P.stepT = 0; SND.sfx('step'); } }
  return { move: Math.min(1, hs / 5.4), sprint };
}

// ---------------- kamera ----------------
function updateCamera(dt) {
  const tx = P.pos.x, ty = P.pos.y + 1.45, tz = P.pos.z;
  cam.target.x += (tx - cam.target.x) * (1 - Math.exp(-dt * 14));
  cam.target.y += (ty - cam.target.y) * (1 - Math.exp(-dt * 10));
  cam.target.z += (tz - cam.target.z) * (1 - Math.exp(-dt * 14));
  const cp = Math.cos(cam.pitch);
  const ox = Math.sin(cam.yaw) * cp * cam.dist, oy = Math.sin(cam.pitch) * cam.dist + 0.2, oz = Math.cos(cam.yaw) * cp * cam.dist;
  let f = 1;
  for (; f > 0.2; f -= 0.1) { if (!pointBlocked(cam.target.x + ox * f, cam.target.y + oy * f, cam.target.z + oz * f)) break; }
  cam.f = f < cam.f ? f : cam.f + (f - cam.f) * (1 - Math.exp(-dt * 6));
  let cx = cam.target.x + ox * cam.f, cy = cam.target.y + oy * cam.f, cz = cam.target.z + oz * cam.f;
  const minY = Math.max(getHeight(cx, cz), WATER_Y) + 0.6; if (cy < minY) cy = minY;
  cam.shake = Math.max(0, cam.shake - dt * 0.6);
  const s = cam.shake;
  camera.position.set(cx + (Math.random() - 0.5) * s, cy + (Math.random() - 0.5) * s, cz + (Math.random() - 0.5) * s);
  camera.lookAt(cam.target.x, cam.target.y + 0.1, cam.target.z);
}

// ---------------- HUD periodik ----------------
let hudT = 0, lastPlace = '';
function updateHud(dt) {
  hudT -= dt;
  if (hudT <= 0) {
    hudT = 0.4;
    const h = game.hour, hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    const icon = sky.night > 0.6 ? '☾' : '☀';
    $('clock').textContent = `${icon} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${phaseName(h)}`;
    let place = 'Padang Hijau';
    for (const k in PLACES) { const p = PLACES[k]; if (Math.hypot(P.pos.x - p.x, P.pos.z - p.z) < p.r * 0.95) place = p.name; }
    if (Math.hypot(P.pos.x - LAKE.x, P.pos.z - LAKE.z) < LAKE.r * 1.1) place = LAKE.name;
    if (P.pos.y > 45) place = 'Pegunungan'; else if (P.pos.y > 25 && place === 'Padang Hijau') place = 'Kaki Gunung';
    if (place !== lastPlace) { $('place').textContent = place; lastPlace = place; }
    SND.setHour(h);
  }
  nearest = game.dialog ? null : findInteractable();
  const pr = $('prompt');
  if (nearest && P.alive) { pr.textContent = '[P] ' + nearest.label; pr.classList.remove('hidden'); } else pr.classList.add('hidden');
  if (game.dialog && Math.hypot(game.dialog.pos.x - P.pos.x, game.dialog.pos.z - P.pos.z) > 7) closeDialog();
  // tracker
  if (game.track) {
    const dx = game.track.x - P.pos.x, dz = game.track.z - P.pos.z, d = Math.hypot(dx, dz);
    const camA = Math.atan2(-Math.sin(cam.yaw), -Math.cos(cam.yaw));
    $('trackArrow').style.transform = `rotate(${-(Math.atan2(dx, dz) - camA)}rad)`;
    $('trackText').textContent = `${game.track.name} — ${Math.round(d)} m`;
    beacon.material.opacity = 0.25 + 0.15 * Math.sin(game.time * 3);
    if (d < 8) { toast('Kamu sudah sampai di ' + game.track.name + '!'); clearTrack(); }
  }
  drawMap(mini, 440, P.pos.x, P.pos.z, 260, false);
  if (game.mapOpen) drawMap(big, 760, 0, 0, WORLD.size, true);
}

// ---------------- loop utama ----------------
const clock = new THREE.Clock();
function update(dt) {
  game.time += dt;
  game.hour = (game.hour + dt * HOURS_PER_SEC) % 24;
  const m = movePlayer(dt);
  updateCombat(dt);
  for (const n of npcs) n.update(dt, P);
  for (const s of slimes) s.update(dt, game);
  world.update(dt, game.time, sky.night);
  world.grass.update(P.pos.x, P.pos.z, false);
  parts.update(dt); updateArcs(dt);
  sky.update(game.hour, P.pos, dt);

  // animasi karakter
  const ro = hero.root;
  ro.position.copy(P.pos); ro.rotation.y = P.yaw;
  if (P.alive) {
    ro.rotation.x = 0;
    animateHumanoid(hero, dt, {
      move: m.move, sprint: m.sprint, air: !P.onGround,
      attack: P.ult.active ? { kind: 'ult', t: P.ult.t / P.ult.dur } : (P.atk.t >= 0 ? { kind: 'slash', t: P.atk.t / P.atk.dur } : null),
      heal: P.heal.t > 0 && m.move < 0.2, mouth: P.ult.active ? 1 : (P.atk.t >= 0 ? 0.7 : 0),
    });
    ro.visible = !(P.invuln > 0 && Math.floor(game.time * 20) % 2 === 0 && !P.ult.active && P.invuln < 0.7);
  } else {
    P.deathT += dt; ro.visible = true;
    ro.rotation.x = Math.min(1, P.deathT * 2.5) * -Math.PI / 2; ro.position.y += 0.15 * Math.min(1, P.deathT * 2.5);
    if (P.deathT > 3.5) respawn();
  }
  // lentera malam
  lantern.intensity = sky.night * 45;
  lantern.position.set(P.pos.x, P.pos.y + 2.4, P.pos.z).addScaledVector(new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw)), 0.8);
  updateCamera(dt);
  updateHud(dt);
}
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (game.running && !game.paused) update(dt);
  else { sky.update(game.hour, game.running ? P.pos : cam.target, 0); if (!game.running) idleCamera(dt); }
  composer.render();
}
// kamera sinematik di layar judul
let idleT = 0;
function idleCamera(dt) {
  idleT += dt * 0.12;
  const x = Math.cos(idleT) * 70, z = 60 + Math.sin(idleT) * 30;
  camera.position.set(x, getHeight(x, z) + 14, z);
  camera.lookAt(0, 6, -30); cam.target.set(0, 6, 60);
  game.hour = (game.hour + dt * HOURS_PER_SEC) % 24;
  world.update(dt, idleT * 8, sky.night); world.grass.update(x, z, false);
}

// ---------------- inisialisasi ----------------
setTimeout(() => {
  $('loadpct').textContent = '(membuat peta…)';
  setTimeout(() => {
    prerenderMap();
    world.grass.update(0, 60, true);
    cam.target.set(P.pos.x, P.pos.y + 1.45, P.pos.z);
    $('loading').textContent = 'Dunia siap! ✨';
    $('startBtn').classList.remove('hidden');
  }, 30);
}, 30);
frame();
