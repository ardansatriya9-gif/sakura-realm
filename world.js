// ============================================================
//  world.js — terrain, pegunungan, danau, kerajaan, kota, desa,
//  pohon, rumput, jalan, langit & siklus waktu.
// ============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const WORLD = { size: 1000, limit: 440 };
export const WATER_Y = -2.5;
export const PLACES = {
  spawn:   { x: 0,    z: 30,   r: 22, name: 'Padang Awal' },
  kingdom: { x: 0,    z: -150, r: 75, name: 'Kerajaan Sakura' },
  city:    { x: 165,  z: 70,   r: 75, name: 'Kota Neo-Hikari' },
  village: { x: -150, z: 90,   r: 60, name: 'Desa Momiji' },
};
export const LAKE = { x: -40, z: 205, r: 40, name: 'Danau Tenang' };

// ---------------- noise & util ----------------
export function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(ix, iy) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
const smooth = (t) => t * t * (3 - 2 * t);
export const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  const u = smooth(fx), v = smooth(fy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); f *= 2; a *= 0.5; }
  return s;
}

// ---------------- tinggi terrain ----------------
export function getHeight(x, z) {
  const d = Math.hypot(x, z);
  let h = (fbm(x * 0.007 + 11.3, z * 0.007 + 4.7, 4) - 0.44) * 34;
  const m = sstep(250, 430, d);
  if (m > 0) {
    const r = 1 - Math.abs(fbm(x * 0.0055 + 50, z * 0.0055 - 20, 5) * 2 - 1);
    h += m * (30 + Math.pow(r, 1.6) * 140);
  }
  let flat = 0;
  for (const k in PLACES) {
    const p = PLACES[k];
    flat = Math.max(flat, 1 - sstep(p.r, p.r * 1.55, Math.hypot(x - p.x, z - p.z)));
  }
  h *= 1 - flat;
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  h -= (1 - sstep(LAKE.r * 0.35, LAKE.r * 1.1, dl)) * 10 * (1 - flat);
  return h;
}

// ---------------- collider ----------------
export const colliders = { boxes: [], circles: [] };
export function addBox(x, z, w, d, h = 20) { colliders.boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h }); }
export function addCircle(x, z, r) { colliders.circles.push({ x, z, r }); }
export function resolveCollisions(p, rad) {
  for (const c of colliders.circles) {
    const dx = p.x - c.x, dz = p.z - c.z, m = c.r + rad;
    if (Math.abs(dx) > m || Math.abs(dz) > m) continue;
    const d = Math.hypot(dx, dz);
    if (d < m) { if (d < 1e-4) { p.x += m; continue; } p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; }
  }
  for (const b of colliders.boxes) {
    if (p.x < b.minX - rad || p.x > b.maxX + rad || p.z < b.minZ - rad || p.z > b.maxZ + rad) continue;
    const cx = Math.max(b.minX, Math.min(p.x, b.maxX)), cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= rad * rad) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x = cx + dx / d * rad; p.z = cz + dz / d * rad; }
    else {
      const l = p.x - b.minX, r = b.maxX - p.x, t = p.z - b.minZ, bt = b.maxZ - p.z, m = Math.min(l, r, t, bt);
      if (m === l) p.x = b.minX - rad; else if (m === r) p.x = b.maxX + rad; else if (m === t) p.z = b.minZ - rad; else p.z = b.maxZ + rad;
    }
  }
}
export function pointBlocked(x, y, z) {
  for (const b of colliders.boxes) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && y < b.h) return true;
  return false;
}

// ---------------- jalan ----------------
const roadCells = new Set();
const cellKey = (x, z) => Math.floor(x / 4) + ',' + Math.floor(z / 4);
export const nearRoad = (x, z) => roadCells.has(cellKey(x, z));
export function isPaved(x, z) {
  const P = PLACES;
  return Math.hypot(x - P.city.x, z - P.city.z) < 68 || Math.hypot(x - P.kingdom.x, z - P.kingdom.z) < 64 ||
    Math.hypot(x - P.village.x, z - P.village.z) < 30 || Math.hypot(x - P.spawn.x, z - P.spawn.z) < 9;
}

// ---------------- tekstur prosedural ----------------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}
function grassTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f0f0f0'; g.fillRect(0, 0, w, h);
    const r = rng(7);
    for (let i = 0; i < 5000; i++) {
      const v = 200 + Math.floor(r() * 55);
      g.fillStyle = `rgba(${v},${v},${v},${0.25 + r() * 0.4})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 2 + r() * 5);
    }
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(150,160,150,${0.12 + r() * 0.15})`; g.fillRect(r() * w, r() * h, 1, 3 + r() * 5); }
  }, [260, 260]);
}
function cobbleTexture(base, line, rep) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const r = rng(21), rows = 16, bh = h / rows;
    for (let y = 0; y < rows; y++) {
      const off = (y % 2) * 32, bw = 64;
      for (let x = -1; x < w / bw + 1; x++) {
        const v = Math.floor((r() - 0.5) * 26);
        g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 120})`;
        g.fillRect(x * bw + off, y * bh, bw, bh);
        g.strokeStyle = line; g.lineWidth = 2; g.strokeRect(x * bw + off, y * bh, bw, bh);
      }
    }
  }, [rep, rep]);
}
function dirtTexture(rep) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#b8946a'; g.fillRect(0, 0, w, h);
    const r = rng(33);
    for (let i = 0; i < 3500; i++) { const v = r() > 0.5 ? 255 : 0; g.fillStyle = `rgba(${v},${v},${v},${r() * 0.12})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
  }, [rep, rep]);
}
function fieldTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#6b4a2e'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      g.fillStyle = '#54381f'; g.fillRect(x, 0, 12, h);
      g.fillStyle = '#6fc24a';
      for (let y = 8; y < h; y += 22) { g.beginPath(); g.arc(x + 6, y, 6, 0, 7); g.fill(); }
    }
  }, [1, 1]);
}
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// tekstur jendela (siang: kaca, malam: lampu menyala)
const texCache = new Map();
function windowTex(kind, rx, ry) {
  const key = `${kind}-${rx}-${ry}`;
  if (texCache.has(key)) return texCache.get(key);
  if (!texCache.has('base-' + kind)) {
    const r = rng(kind === 'map' ? 5 : 9);
    const t = canvasTex(256, 256, (g) => {
      g.fillStyle = kind === 'map' ? '#ffffff' : '#000000'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const x = i * 64 + 14, y = j * 64 + 10;
        if (kind === 'map') {
          g.fillStyle = '#e4e8f0'; g.fillRect(x - 3, y - 3, 42, 48);
          g.fillStyle = '#5a7aa3'; g.fillRect(x, y, 36, 42);
          g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 3, y + 3, 10, 36);
        } else if (r() < 0.55) {
          g.fillStyle = r() < 0.8 ? '#ffd37a' : '#9fd8ff'; g.fillRect(x, y, 36, 42);
        }
      }
    });
    texCache.set('base-' + kind, t);
  }
  const t = texCache.get('base-' + kind).clone();
  t.needsUpdate = true; t.repeat.set(rx, ry);
  texCache.set(key, t);
  return t;
}

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o });
function mesh(geo, mat, x = 0, y = 0, z = 0, parent = null) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

// ============================================================
//  BUILD WORLD
// ============================================================
export function buildWorld(scene, Q = {}) {
  const rand = rng(1337);
  const world = { interactables: [], windowMats: [], flags: [], spinners: [], roadPolys: [], lampMat: null, water: null, crystal: null };
  const windowMats = world.windowMats;

  buildTerrain(scene);
  // ----- air -----
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.size, WORLD.size).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x4fb4ee, transparent: true, opacity: 0.78, roughness: 0.12, metalness: 0.15 }));
  water.position.y = WATER_Y; water.receiveShadow = true; scene.add(water); world.water = water;

  // ----- jalan -----
  const roadMat = std(0xc2a47a, { roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  function makeRoad(pts, width) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], 0, p[1])));
    const n = Math.max(8, Math.ceil(curve.getLength() / 2.5));
    const sp = curve.getSpacedPoints(n);
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const a = sp[Math.max(0, i - 1)], b = sp[Math.min(n, i + 1)];
      const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
      const sx = -tz / l * width / 2, sz = tx / l * width / 2;
      const p = sp[i];
      pos.push(p.x + sx, getHeight(p.x + sx, p.z + sz) + 0.14, p.z + sz, p.x - sx, getHeight(p.x - sx, p.z - sz) + 0.14, p.z - sz);
      uv.push(0, i * 0.3, 1, i * 0.3);
      if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) roadCells.add(cellKey(p.x + dx * 4, p.z + dz * 4));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, roadMat); m.receiveShadow = true; scene.add(m);
    world.roadPolys.push(sp.map((p) => [p.x, p.z]));
  }
  makeRoad([[0, 30], [8, -20], [-6, -70], [0, -114]], 6);
  makeRoad([[10, 32], [60, 50], [100, 48], [140, 66]], 6);
  makeRoad([[-10, 32], [-50, 68], [-90, 76], [-122, 88]], 6);

  buildSpawn(scene, world);
  buildKingdom(scene, world);
  buildCity(scene, world, rand);
  buildVillage(scene, world, rand);
  buildTrees(scene, rand, Q.trees || 1800);
  buildChests(scene, world, rand);
  const grass = buildGrass(scene, Q.grassBlades || 8000);
  world.grass = grass;

  world.update = (dt, t, night) => {
    grass.uniform.value = t;
    for (const f of world.flags) f.rotation.y = f.userData.base + Math.sin(t * 2.2 + f.userData.ph) * 0.25;
    for (const s of world.spinners) s.mesh.rotation[s.axis] += s.speed * dt;
    if (world.crystal) { world.crystal.rotation.y += dt * 0.8; world.crystal.position.y = world.crystal.userData.y0 + Math.sin(t * 1.5) * 0.25; }
    water.position.y = WATER_Y + Math.sin(t * 0.8) * 0.06;
    const e = night * 1.7;
    for (const m of windowMats) m.emissiveIntensity = e;
    if (world.lampMat) world.lampMat.emissiveIntensity = 0.25 + night * 3.2;
  };
  return world;
}

// ---------------- terrain ----------------
function buildTerrain(scene) {
  const seg = 400;
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, getHeight(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const C = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
  const grassA = C(0.36, 0.76, 0.27), grassB = C(0.46, 0.84, 0.32), forest = C(0.2, 0.52, 0.24),
    rock = C(0.5, 0.48, 0.52), snow = C(0.96, 0.98, 1.0), sand = C(0.86, 0.78, 0.55), mud = C(0.3, 0.34, 0.22);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const slope = 1 - nrm.getY(i);
    const nz = vnoise(x * 0.06, z * 0.06);
    c.copy(grassA).lerp(grassB, nz);
    c.lerp(forest, sstep(18, 60, y) * 0.8);
    c.lerp(rock, Math.min(1, sstep(0.16, 0.38, slope) + sstep(70, 105, y) * 0.8));
    c.lerp(snow, sstep(112, 140, y));
    if (y < -1.0) c.lerp(sand, sstep(-1.0, -2.6, y));
    if (y < -3.5) c.lerp(mud, sstep(-3.5, -7, y));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: grassTexture(), roughness: 0.96, metalness: 0 });
  const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; scene.add(m);
}

// ---------------- spawn ----------------
function buildSpawn(scene, world) {
  const P = PLACES.spawn;
  const disk = mesh(new THREE.CircleGeometry(9, 40).rotateX(-Math.PI / 2), std(0xd9d4e8, { map: cobbleTexture('#d8d2e6', '#a9a1bb', 3) }), P.x, 0.06, P.z);
  disk.castShadow = false; scene.add(disk);
  // kristal waktu
  const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), new THREE.MeshStandardMaterial({ color: 0x8ae6ff, emissive: 0x39c6ff, emissiveIntensity: 1.6, roughness: 0.1, transparent: true, opacity: 0.9 }));
  cr.scale.y = 1.5; cr.position.set(P.x, 2.2, P.z - 3); cr.userData.y0 = 2.2; cr.castShadow = true; scene.add(cr);
  const base = mesh(new THREE.CylinderGeometry(1.2, 1.5, 0.6, 8), std(0x9a95ad), P.x, 0.3, P.z - 3); scene.add(base);
  addCircle(P.x, P.z - 3, 1.5);
  world.crystal = cr;
  world.interactables.push({ x: P.x, z: P.z - 3, radius: 4, kind: 'crystal', label: 'Sentuh Kristal Waktu' });
  // papan petunjuk
  const sign = new THREE.Group(); sign.position.set(P.x + 6, 0, P.z + 2);
  sign.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 8), std(0x6b4a2b), 0, 1.5, 0));
  for (const [dy, ry, color] of [[2.6, -0.3, 0xe8d3a8], [2.0, 0.25, 0xe8d3a8], [1.4, -0.15, 0xe8d3a8]]) {
    const b = mesh(new THREE.BoxGeometry(1.5, 0.4, 0.08), std(color), 0.6, dy, 0.05); b.rotation.y = ry; sign.add(b);
  }
  scene.add(sign); addCircle(P.x + 6, P.z + 2, 0.4);
  world.interactables.push({ x: P.x + 6, z: P.z + 2, radius: 3.5, kind: 'sign', label: 'Baca papan petunjuk',
    text: 'Utara: Kerajaan Sakura · Timur: Kota Neo-Hikari · Barat: Desa Momiji · Selatan: Danau Tenang' });
}

// ---------------- kerajaan ----------------
function buildKingdom(scene, world) {
  const K = PLACES.kingdom;
  const plaza = mesh(new THREE.CircleGeometry(62, 64).rotateX(-Math.PI / 2), std(0xf0e6ee, { map: cobbleTexture('#efe4ec', '#c9b8c6', 16) }), K.x, 0.05, K.z);
  plaza.castShadow = false; scene.add(plaza);

  const stone = std(0xf1eef6), stoneDark = std(0xd9d3e6), roofBlue = std(0x4f7fe0, { roughness: 0.55 }),
    gold = std(0xf4c542, { metalness: 0.6, roughness: 0.3 });
  const wallH = 11, T = 3, W = 40, z1 = -195, z2 = -110;
  const box = (x, z, w, d, h, mat, y0 = 0, col = true) => {
    const m = mesh(new THREE.BoxGeometry(w, h, d), mat, x, y0 + h / 2, z); scene.add(m);
    if (col) addBox(x, z, w, d, y0 + h);
    return m;
  };
  box(0, z1, 2 * W + T, T, wallH, stone);
  box(-W, (z1 + z2) / 2, T, z2 - z1, wallH, stone);
  box(W, (z1 + z2) / 2, T, z2 - z1, wallH, stone);
  box(-(W + 7) / 2, z2, W - 7, T, wallH, stone);
  box((W + 7) / 2, z2, W - 7, T, wallH, stone);
  // gerigi tembok
  const merlonPos = [];
  const addMerlons = (x1, z1_, x2, z2_) => {
    const L = Math.hypot(x2 - x1, z2_ - z1_), n = Math.floor(L / 2.6);
    for (let i = 0; i <= n; i++) merlonPos.push([x1 + (x2 - x1) * i / n, z1_ + (z2_ - z1_) * i / n]);
  };
  addMerlons(-W, z1, W, z1); addMerlons(-W, z2, -7, z2); addMerlons(7, z2, W, z2);
  addMerlons(-W, z1, -W, z2); addMerlons(W, z1, W, z2);
  const merl = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 1.3, 1.4), stoneDark, merlonPos.length);
  const mm = new THREE.Matrix4();
  merlonPos.forEach((p, i) => { mm.setPosition(p[0], wallH + 0.65, p[1]); merl.setMatrixAt(i, mm); });
  merl.castShadow = true; scene.add(merl);

  // menara sudut
  const tower = (x, z, r, h, flag) => {
    scene.add(mesh(new THREE.CylinderGeometry(r, r * 1.05, h, 20), stone, x, h / 2, z));
    scene.add(mesh(new THREE.ConeGeometry(r * 1.3, h * 0.42, 20), roofBlue, x, h + h * 0.21, z));
    scene.add(mesh(new THREE.SphereGeometry(0.4, 8, 6), gold, x, h + h * 0.42 + 0.3, z));
    addCircle(x, z, r + 0.2);
    if (flag) addFlag(scene, world, x, h + h * 0.42 + 1.6, z, 0xff7ac8);
  };
  for (const [x, z] of [[-W, z1], [W, z1], [-W, z2], [W, z2]]) tower(x, z, 4.2, 20, true);
  tower(-8.5, z2, 2.8, 15, true); tower(8.5, z2, 2.8, 15, true);
  // lengkung gerbang
  box(0, z2, 14, T, 3.2, stone, 11, false);
  box(0, z2 + 0.3, 14.4, 0.6, 0.6, gold, 14, false);

  // benteng utama
  const keepTexX = windowTex('map', 4, 3), keepEmi = windowTex('emi', 4, 3);
  const keepMat = std(0xf5f0fa, { map: keepTexX, emissive: 0xffffff, emissiveMap: keepEmi, emissiveIntensity: 0 });
  world.windowMats.push(keepMat);
  const keep = mesh(new THREE.BoxGeometry(32, 26, 22), [keepMat, keepMat, stone, stone, keepMat, keepMat], 0, 13, -176); scene.add(keep);
  addBox(0, -176, 32, 22, 26);
  const mid = mesh(new THREE.BoxGeometry(12, 20, 12), [keepMat, keepMat, stone, stone, keepMat, keepMat], 0, 36, -180); scene.add(mid);
  { const rf = mesh(new THREE.ConeGeometry(9.5, 15, 4), roofBlue, 0, 53.5, -180); rf.rotation.y = Math.PI / 4; scene.add(rf); }
  scene.add(mesh(new THREE.SphereGeometry(0.7, 8, 6), gold, 0, 61.7, -180));
  addFlag(scene, world, 0, 64, -180, 0xff7ac8);
  for (const s of [-1, 1]) {
    scene.add(mesh(new THREE.CylinderGeometry(3.5, 3.7, 34, 18), stone, s * 14, 17, -170));
    scene.add(mesh(new THREE.ConeGeometry(4.6, 12, 18), roofBlue, s * 14, 40, -170));
    scene.add(mesh(new THREE.SphereGeometry(0.4, 8, 6), gold, s * 14, 46.3, -170));
    addCircle(s * 14, -170, 3.9);
  }
  // pintu istana
  scene.add(mesh(new THREE.BoxGeometry(6, 9, 0.5), std(0x6b3f2a), 0, 4.5, -164.8));
  scene.add(mesh(new THREE.BoxGeometry(7, 0.6, 0.6), gold, 0, 9.3, -164.7));
  // karpet merah
  const carpet = mesh(new THREE.PlaneGeometry(4.4, 56).rotateX(-Math.PI / 2), std(0xb8213a), 0, 0.09, -138); carpet.castShadow = false; scene.add(carpet);
  world.interactables.push({ x: 0, z: -164, radius: 3, kind: 'sign', label: 'Pintu istana', text: 'Pintu istana terkunci. "Hanya yang dipanggil Raja boleh masuk."' });

  // air mancur
  const fx = 0, fz = -132;
  scene.add(mesh(new THREE.CylinderGeometry(3.4, 3.6, 0.9, 24), stone, fx, 0.45, fz));
  const wMat = new THREE.MeshStandardMaterial({ color: 0x7fd6ff, emissive: 0x2a8bd0, emissiveIntensity: 0.3, roughness: 0.1, transparent: true, opacity: 0.85 });
  scene.add(mesh(new THREE.CylinderGeometry(3.0, 3.0, 0.1, 24), wMat, fx, 0.85, fz));
  scene.add(mesh(new THREE.CylinderGeometry(0.4, 0.6, 2.6, 10), stone, fx, 1.6, fz));
  scene.add(mesh(new THREE.SphereGeometry(0.9, 12, 8), wMat, fx, 3.2, fz));
  addCircle(fx, fz, 3.8);
  world.interactables.push({ x: fx, z: fz, radius: 5, kind: 'fountain', label: 'Lempar koin ke air mancur' });

  // pohon sakura hias + lampu
  for (const z of [-118, -128, -142, -152]) for (const s of [-1, 1]) decoTree(scene, s * 13, z, 0xffb7d0);
  for (const s of [-1, 1]) for (const z of [-120, -145, -160]) lamp(scene, s * 4, z);
}
function decoTree(scene, x, z, color) {
  scene.add(mesh(new THREE.CylinderGeometry(0.35, 0.5, 4, 8), std(0x6b4a2b), x, 2, z));
  const leaf = std(color, { flatShading: true });
  for (const [dx, dy, dz, r] of [[0, 5.2, 0, 2.6], [1.5, 4.4, 0.6, 1.9], [-1.3, 4.6, -0.8, 1.8]])
    scene.add(mesh(new THREE.IcosahedronGeometry(r, 1), leaf, x + dx, dy, z + dz));
  addCircle(x, z, 0.8);
}
function lamp(scene, x, z) {
  scene.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 4, 6), std(0x333344), x, 2, z));
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffeeaa, emissive: 0xffd27a, emissiveIntensity: 1 }));
  b.position.set(x, 4.1, z); scene.add(b);
}
function addFlag(scene, world, x, y, z, color) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6), std(0xdddddd), 0, 0, 0));
  const pen = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.2), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.6 }));
  pen.position.set(1.1, 0.9, 0); pen.castShadow = true;
  const holder = new THREE.Group(); holder.add(pen); holder.userData = { base: 0, ph: Math.random() * 6 };
  g.add(holder); scene.add(g); world.flags.push(holder);
}

// ---------------- kota ----------------
const CITY_COLORS = [0xf3d9e6, 0xd9e8f7, 0xfff0cf, 0xdcd4f5, 0xcfeee3, 0xf7d8cf, 0xe7e9ee];
function buildCity(scene, world, rand) {
  const C = PLACES.city, sp = 21;
  const ground = mesh(new THREE.CircleGeometry(66, 64).rotateX(-Math.PI / 2), std(0xcfc9d6, { map: cobbleTexture('#cdc7d5', '#9a93a8', 14) }), C.x, 0.05, C.z);
  ground.castShadow = false; scene.add(ground);
  const roofM = std(0x5a5f70);
  const neon = [0xff4fa8, 0x4fd7ff, 0xffd34f, 0x9d6bff];
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
    if (i === 0 && j === 0) continue;
    if (Math.hypot(i * sp, j * sp) > 58) continue;
    const w = 11 + rand() * 4, d = 11 + rand() * 4;
    const distK = Math.hypot(i, j) / 3;
    const h = 10 + (1 - distK) * 26 * rand() + rand() * 8;
    const bx = C.x + i * sp + (rand() - 0.5) * 2, bz = C.z + j * sp + (rand() - 0.5) * 2;
    const color = CITY_COLORS[Math.floor(rand() * CITY_COLORS.length)];
    const mk = (rw, rh) => {
      const m = std(color, { map: windowTex('map', Math.max(1, Math.round(rw / 8)), Math.max(1, Math.round(rh / 10))), emissive: 0xffffff,
        emissiveMap: windowTex('emi', Math.max(1, Math.round(rw / 8)), Math.max(1, Math.round(rh / 10))), emissiveIntensity: 0 });
      world.windowMats.push(m); return m;
    };
    const mx = mk(d, h), mz = mk(w, h);
    const b = mesh(new THREE.BoxGeometry(w, h, d), [mx, mx, roofM, roofM, mz, mz], bx, h / 2, bz); scene.add(b);
    addBox(bx, bz, w, d, h);
    if (rand() < 0.5) { // papan neon di atap
      const nc = neon[Math.floor(rand() * neon.length)];
      const s = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 1.6, 0.3), new THREE.MeshStandardMaterial({ color: nc, emissive: nc, emissiveIntensity: 1.8 }));
      s.position.set(bx, h + 1.4, bz + d / 2 - 0.5); scene.add(s);
      scene.add(mesh(new THREE.BoxGeometry(0.2, 1.5, 0.2), roofM, bx - w * 0.2, h + 0.7, bz + d / 2 - 0.5));
    } else scene.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 5, 5), roofM, bx, h + 2.5, bz));
  }
  // menara jam
  const clockMat = std(0xe9dfcf);
  scene.add(mesh(new THREE.BoxGeometry(5, 22, 5), clockMat, C.x, 11, C.z));
  { const rf = mesh(new THREE.ConeGeometry(4, 7, 4), std(0x7a3b4a), C.x, 25.5, C.z); rf.rotation.y = Math.PI / 4; scene.add(rf); }
  addBox(C.x, C.z, 5, 5, 22);
  const face = new THREE.Mesh(new THREE.CircleGeometry(1.7, 24), new THREE.MeshBasicMaterial({ color: 0xfffbe8 }));
  for (const [dx, dz, ry] of [[0, 2.55, 0], [0, -2.55, Math.PI], [2.55, 0, Math.PI / 2], [-2.55, 0, -Math.PI / 2]]) {
    const f = face.clone(); f.position.set(C.x + dx, 18, C.z + dz); f.rotation.y = ry; scene.add(f);
  }
  // lampu jalan (instanced)
  const lampPos = [];
  for (let i = -3; i <= 2; i++) for (let j = -3; j <= 2; j++) {
    const x = C.x + (i + 0.5) * sp, z = C.z + (j + 0.5) * sp;
    if (Math.hypot(x - C.x, z - C.z) < 56) lampPos.push([x, z]);
  }
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.12, 5, 6), std(0x2e2e3e), lampPos.length);
  world.lampMat = new THREE.MeshStandardMaterial({ color: 0xffeeaa, emissive: 0xffd27a, emissiveIntensity: 0.3 });
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.36, 8, 6), world.lampMat, lampPos.length);
  const m4 = new THREE.Matrix4();
  lampPos.forEach((p, i) => { m4.setPosition(p[0], 2.5, p[1]); poles.setMatrixAt(i, m4); m4.setPosition(p[0], 5.1, p[1]); bulbs.setMatrixAt(i, m4); });
  poles.castShadow = true; scene.add(poles, bulbs);
  // kios takoyaki
  const sx = C.x + 8, sz = C.z - 8;
  scene.add(mesh(new THREE.BoxGeometry(3.4, 1.2, 1.6), std(0xb86a3a), sx, 0.6, sz));
  const aw = mesh(new THREE.BoxGeometry(4, 0.2, 2.4), std(0xe0405a), sx, 2.8, sz); aw.rotation.x = 0.15; scene.add(aw);
  for (const dx of [-1.8, 1.8]) scene.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.8, 6), std(0xdddddd), sx + dx, 1.4, sz - 1));
  addBox(sx, sz, 3.4, 1.6, 1.2);
}

// ---------------- desa ----------------
function buildVillage(scene, world, rand) {
  const V = PLACES.village;
  const disk = mesh(new THREE.CircleGeometry(40, 48).rotateX(-Math.PI / 2), std(0xb8946a, { map: dirtTexture(10), roughness: 1 }), V.x, 0.05, V.z);
  disk.castShadow = false; scene.add(disk);

  const wallCols = [0xf5e9d0, 0xf0dcc0, 0xe9f0e2, 0xf6e0d8];
  const roofCols = [0xb5473a, 0x8a5a3a, 0x3f7f86, 0xa04a5a];
  function house(x, z, w, d, rotY, wc, rc) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY;
    const wh = 4.2;
    g.add(mesh(new THREE.BoxGeometry(w, wh, d), std(wc), 0, wh / 2, 0));
    const shape = new THREE.Shape(); shape.moveTo(-w / 2 - 0.7, 0); shape.lineTo(w / 2 + 0.7, 0); shape.lineTo(0, 3.2); shape.closePath();
    const rg = new THREE.ExtrudeGeometry(shape, { depth: d + 1.4, bevelEnabled: false }); rg.translate(0, 0, -(d + 1.4) / 2);
    g.add(mesh(rg, std(rc, { roughness: 0.7 }), 0, wh, 0));
    g.add(mesh(new THREE.BoxGeometry(1.3, 2.4, 0.2), std(0x6b3f2a), 0, 1.2, d / 2 + 0.05));
    const winM = new THREE.MeshStandardMaterial({ color: 0xcfe6ff, emissive: 0xffd37a, emissiveIntensity: 0 });
    world.windowMats.push(winM);
    for (const dx of [-w * 0.3, w * 0.3]) g.add(mesh(new THREE.BoxGeometry(1.1, 1.1, 0.2), winM, dx, 2.5, d / 2 + 0.05));
    g.add(mesh(new THREE.BoxGeometry(0.8, 2, 0.8), std(0x8a8a92), w * 0.25, wh + 2.4, -d * 0.2));
    scene.add(g);
    const swap = Math.abs(Math.sin(rotY)) > 0.5;
    addBox(x, z, swap ? d : w, swap ? w : d, wh + 3);
  }
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3, r = 31;
    const x = V.x + Math.cos(a) * r, z = V.z + Math.sin(a) * r;
    const dx = V.x - x, dz = V.z - z;
    const rotY = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? Math.PI / 2 : -Math.PI / 2) : (dz > 0 ? 0 : Math.PI);
    if (Math.hypot(x - V.x, z - (V.z - 0)) > 0 && !(x > V.x + 20 && z < V.z - 5)) // sisakan ruang utk kincir
      house(x, z, 7 + rand() * 2, 6, rotY, wallCols[i % 4], roofCols[(i * 3) % 4]);
  }
  // sumur
  scene.add(mesh(new THREE.CylinderGeometry(1.5, 1.6, 1.1, 14), std(0x9a9a9a), V.x, 0.55, V.z));
  scene.add(mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.12, 14), new THREE.MeshStandardMaterial({ color: 0x4aa8e8, roughness: 0.1 }), V.x, 0.95, V.z));
  for (const s of [-1, 1]) scene.add(mesh(new THREE.BoxGeometry(0.15, 2.6, 0.15), std(0x6b4a2b), V.x + s * 1.4, 1.8, V.z));
  const wr = mesh(new THREE.ConeGeometry(2.2, 1.2, 4), std(0xb5473a), V.x, 3.5, V.z); wr.rotation.y = Math.PI / 4; scene.add(wr);
  addCircle(V.x, V.z, 1.9);
  world.interactables.push({ x: V.x, z: V.z, radius: 4, kind: 'well', label: 'Minum air sumur' });
  // ladang
  const fieldMat = new THREE.MeshStandardMaterial({ map: fieldTexture(), roughness: 1 });
  fieldMat.map.repeat.set(5, 3);
  for (const [fx, fz] of [[V.x - 20, V.z + 62], [V.x + 4, V.z + 62], [V.x - 44, V.z + 40]]) {
    const f = mesh(new THREE.PlaneGeometry(20, 12).rotateX(-Math.PI / 2), fieldMat, fx, 0.1, fz); f.castShadow = false; scene.add(f);
  }
  // orang-orangan sawah
  const sc = new THREE.Group(); sc.position.set(V.x - 20, 0, V.z + 62);
  sc.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5), std(0x6b4a2b), 0, 1.2, 0));
  sc.add(mesh(new THREE.BoxGeometry(1.8, 0.08, 0.08), std(0x6b4a2b), 0, 1.8, 0));
  sc.add(mesh(new THREE.SphereGeometry(0.3, 8, 6), std(0xe8cf7a), 0, 2.5, 0));
  scene.add(sc);
  // kincir angin
  const mx = V.x + 38, mz = V.z - 20;
  scene.add(mesh(new THREE.CylinderGeometry(2.4, 3.6, 9, 12), std(0xf2ecdf), mx, 4.5, mz));
  scene.add(mesh(new THREE.ConeGeometry(3, 3.4, 12), std(0x8a3a3a), mx, 10.7, mz));
  addCircle(mx, mz, 3.8);
  const blades = new THREE.Group(); blades.position.set(mx, 8, mz + 3.4);
  for (let i = 0; i < 4; i++) {
    const b = mesh(new THREE.BoxGeometry(1.1, 8, 0.12), std(0xf6f2ea), 0, 0, 0);
    const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2; b.position.y = 4.4; arm.add(b); blades.add(arm);
  }
  scene.add(blades); world.spinners.push({ mesh: blades, axis: 'z', speed: 0.7 });
  // jerami
  for (let i = 0; i < 6; i++) {
    const x = V.x - 52 + rand() * 12, z = V.z + 20 + rand() * 12;
    scene.add(mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.2, 10), std(0xe2c36a), x, 0.6, z).rotateZ(Math.PI / 2));
  }
}

// ---------------- pohon (instanced) ----------------
function buildTrees(scene, rand, maxTrees) {
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.36, 3.4, 7); trunkGeo.translate(0, 1.7, 0);
  const crown = [];
  for (const [x, y, z, r] of [[0, 5.2, 0, 2.7], [1.6, 4.3, 0.6, 1.9], [-1.4, 4.5, -0.8, 1.8], [0.3, 6.6, 0.3, 1.7]]) {
    const g = new THREE.IcosahedronGeometry(r, 1); g.translate(x, y, z); crown.push(g);
  }
  const crownGeo = mergeGeometries(crown);
  const pineParts = [];
  for (const [y, r, h] of [[3.4, 2.7, 3.4], [5.4, 2.1, 3.1], [7.2, 1.5, 2.8]]) {
    const g = new THREE.ConeGeometry(r, h, 8); g.translate(0, y + h / 2 - 0.4, 0); pineParts.push(g);
  }
  const pineGeo = mergeGeometries(pineParts);
  const pineTrunk = new THREE.CylinderGeometry(0.2, 0.32, 3, 6); pineTrunk.translate(0, 1.5, 0);

  const broad = [], pine = [];
  let tries = 0;
  while (broad.length + pine.length < maxTrees && tries < 60000) {
    tries++;
    const x = (rand() * 2 - 1) * 470, z = (rand() * 2 - 1) * 470;
    if (Math.hypot(x, z) > 480) continue;
    if (fbm(x * 0.012 + 3, z * 0.012 + 9, 3) < 0.44 && rand() < 0.88) continue;
    let bad = false;
    for (const k in PLACES) { const p = PLACES[k]; if (Math.hypot(x - p.x, z - p.z) < (k === 'spawn' ? 16 : p.r * 0.95)) { bad = true; break; } }
    if (bad || nearRoad(x, z)) continue;
    const y = getHeight(x, z);
    if (y < -1.2 || y > 95) continue;
    if (Math.abs(getHeight(x + 2, z) - y) > 2.2 || Math.abs(getHeight(x, z + 2) - y) > 2.2) continue;
    const s = 0.8 + rand() * 0.8, rot = rand() * 6.28;
    const t = { x, y, z, s, rot };
    if (y > 30 || (y > 14 && rand() < 0.5)) pine.push(t); else broad.push(t);
    addCircle(x, z, 0.6 * s);
  }
  const mk = (list, trunk, crownG, colorFn, flat = true) => {
    const tm = new THREE.InstancedMesh(trunk, std(0x6b4a2b), list.length);
    const cm = new THREE.InstancedMesh(crownG, std(0xffffff, { flatShading: flat, roughness: 0.9 }), list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    list.forEach((t, i) => {
      e.set(0, t.rot, 0); q.setFromEuler(e); sc.set(t.s, t.s * (0.9 + rand() * 0.3), t.s); p.set(t.x, t.y - 0.1, t.z);
      m.compose(p, q, sc); tm.setMatrixAt(i, m); cm.setMatrixAt(i, m); cm.setColorAt(i, colorFn(t, c));
    });
    tm.castShadow = cm.castShadow = true; tm.receiveShadow = cm.receiveShadow = true;
    tm.frustumCulled = cm.frustumCulled = false;
    scene.add(tm, cm);
  };
  const K = PLACES.kingdom;
  mk(broad, trunkGeo, crownGeo, (t, c) => {
    if (Math.hypot(t.x - K.x, t.z - K.z) < 220 && ((t.x * 13 + t.z * 7) | 0) % 3 === 0) return c.setHSL(0.95 + rand() * 0.04, 0.7, 0.8 + rand() * 0.08);
    return c.setHSL(0.26 + rand() * 0.06, 0.55, 0.32 + rand() * 0.08);
  });
  mk(pine, pineTrunk, pineGeo, (t, c) => c.setHSL(0.37 + rand() * 0.03, 0.45, 0.2 + rand() * 0.06));
}

// ---------------- peti harta ----------------
function buildChests(scene, world, rand) {
  let placed = 0, tries = 0;
  while (placed < 6 && tries < 4000) {
    tries++;
    const a = rand() * 6.28, r = 110 + rand() * 210;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    let bad = false;
    for (const k in PLACES) { const p = PLACES[k]; if (Math.hypot(x - p.x, z - p.z) < p.r + 10) bad = true; }
    const y = getHeight(x, z);
    if (bad || y < 0 || y > 40 || nearRoad(x, z)) continue;
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rand() * 6;
    const wood = std(0x8a5a30), gold = std(0xf4c542, { metalness: 0.6, roughness: 0.3 });
    g.add(mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), wood, 0, 0.35, 0));
    const lid = new THREE.Group(); lid.position.set(0, 0.7, -0.4);
    const lm = mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 12, 1, false, 0, Math.PI), wood, 0, 0.0, 0.4); lm.rotation.z = Math.PI / 2; lm.rotation.y = 0; lid.add(lm);
    g.add(lid);
    g.add(mesh(new THREE.BoxGeometry(1.25, 0.15, 0.85), gold, 0, 0.5, 0));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe27a })); glow.position.y = 1.5; g.add(glow);
    scene.add(g); addCircle(x, z, 0.8);
    world.interactables.push({ x, z, radius: 3, kind: 'chest', label: 'Buka peti harta', opened: false, group: g, lid, glow });
    placed++;
  }
}

// ---------------- rumput dinamis ----------------
function buildGrass(scene, count) {
  const geo = new THREE.ConeGeometry(0.05, 0.8, 3, 1, true); geo.translate(0, 0.4, 0);
  const uniform = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniform;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.x += sin(uTime*1.8 + instanceMatrix[3].x*0.6 + instanceMatrix[3].z*0.5) * 0.14 * position.y;
        transformed.z += cos(uTime*1.5 + instanceMatrix[3].x*0.4) * 0.09 * position.y;`);
  };
  const mesh_ = new THREE.InstancedMesh(geo, mat, count);
  mesh_.frustumCulled = false; mesh_.receiveShadow = true;
  mesh_.setColorAt(0, new THREE.Color(1, 1, 1));
  scene.add(mesh_);
  const RAD = 46, CS = 1.15;
  const last = { x: 1e9, z: 1e9 };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  function update(px, pz, force) {
    if (!force && Math.hypot(px - last.x, pz - last.z) < 3) return;
    last.x = px; last.z = pz;
    const cx0 = Math.floor((px - RAD) / CS), cx1 = Math.floor((px + RAD) / CS), cz0 = Math.floor((pz - RAD) / CS), cz1 = Math.floor((pz + RAD) / CS);
    let n = 0;
    for (let ix = cx0; ix <= cx1 && n < count; ix++) for (let iz = cz0; iz <= cz1 && n < count; iz++) {
      const h1 = hash2(ix, iz), h2 = hash2(iz + 77, ix - 31), h3 = hash2(ix * 3 + 5, iz * 7 + 1);
      const x = (ix + h1) * CS, z = (iz + h2) * CS;
      const d = Math.hypot(x - px, z - pz);
      if (d > RAD) continue;
      if (isPaved(x, z) || nearRoad(x, z)) continue;
      const y = getHeight(x, z);
      if (y < -1.0 || y > 60) continue;
      const fade = 1 - Math.pow(d / RAD, 3);
      const s = (0.7 + h3 * 0.9) * fade;
      e.set(0, h1 * 6.28, 0); q.setFromEuler(e); sc.set(1, s, 1); p.set(x, y - 0.02, z);
      m.compose(p, q, sc); mesh_.setMatrixAt(n, m);
      c.setHSL(0.24 + h2 * 0.08, 0.6, 0.28 + h3 * 0.18); mesh_.setColorAt(n, c);
      n++;
    }
    mesh_.count = n; mesh_.instanceMatrix.needsUpdate = true; if (mesh_.instanceColor) mesh_.instanceColor.needsUpdate = true;
  }
  return { update, uniform };
}

// ============================================================
//  LANGIT & SIKLUS WAKTU
// ============================================================
const KEYS = [
  { h: 0,    sky: 0x050a22, fog: 0x0c1334, sun: 0x7f92c8, si: 0.35, hi: 0.35 },
  { h: 5,    sky: 0x1a2150, fog: 0x3a3260, sun: 0x9aa6d8, si: 0.25, hi: 0.4 },
  { h: 6.4,  sky: 0x6a9fe0, fog: 0xffc9a0, sun: 0xffb27a, si: 1.6, hi: 0.6 },
  { h: 9,    sky: 0x5fb0ff, fog: 0xd2e8ff, sun: 0xfff1de, si: 2.7, hi: 0.95 },
  { h: 12,   sky: 0x3f9aff, fog: 0xcfe9ff, sun: 0xffffff, si: 3.2, hi: 1.1 },
  { h: 16,   sky: 0x58a8f5, fog: 0xdce9ff, sun: 0xfff0d0, si: 2.8, hi: 1.0 },
  { h: 17.8, sky: 0xf0907a, fog: 0xffa070, sun: 0xff8040, si: 1.7, hi: 0.65 },
  { h: 19.2, sky: 0x2a2060, fog: 0x5a3a70, sun: 0xa08ac8, si: 0.4, hi: 0.4 },
  { h: 21,   sky: 0x070c26, fog: 0x0e1638, sun: 0x7f92c8, si: 0.35, hi: 0.35 },
  { h: 24,   sky: 0x050a22, fog: 0x0c1334, sun: 0x7f92c8, si: 0.35, hi: 0.35 },
];
export function phaseName(h) {
  if (h >= 5 && h < 11) return 'Pagi';
  if (h >= 11 && h < 15.5) return 'Siang';
  if (h >= 15.5 && h < 18.5) return 'Sore';
  return 'Malam';
}
export function createSky(scene, sunLight, hemi) {
  const top = new THREE.Color(), hor = new THREE.Color();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 20), new THREE.ShaderMaterial({
    uniforms: { top: { value: top }, horizon: { value: hor } }, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vDir;
      void main(){ float h = clamp(vDir.y, 0.0, 1.0); vec3 c = mix(horizon, top, pow(h, 0.55));
        if (vDir.y < 0.0) c = horizon; gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  dome.frustumCulled = false; dome.renderOrder = -10; scene.add(dome);

  const sunM = new THREE.Mesh(new THREE.SphereGeometry(42, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false }));
  const moonM = new THREE.Mesh(new THREE.SphereGeometry(30, 24, 16), new THREE.MeshBasicMaterial({ color: 0xe6ecff, fog: false }));
  const glowT = glowTexture();
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: 0xffd9a0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
  sunGlow.scale.setScalar(520);
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: 0xaec4ff, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: 0.6 }));
  moonGlow.scale.setScalar(300);
  scene.add(sunM, moonM, sunGlow, moonGlow);

  const sp = new Float32Array(1800 * 3), r = rng(99);
  for (let i = 0; i < 1800; i++) {
    const u = r() * 2 - 1, a = r() * 6.283, s = Math.sqrt(1 - u * u);
    sp[i * 3] = Math.cos(a) * s * 1400; sp[i * 3 + 1] = Math.abs(u) * 1400; sp[i * 3 + 2] = Math.sin(a) * s * 1400;
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const starM = new THREE.PointsMaterial({ color: 0xffffff, size: 2.3, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new THREE.Points(sg, starM); stars.frustumCulled = false; scene.add(stars);

  // awan
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: false });
  const clouds = new THREE.Group();
  for (let i = 0; i < 28; i++) {
    const g = new THREE.Group();
    const n = 5 + Math.floor(r() * 4);
    for (let j = 0; j < n; j++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(22 + r() * 22, 10, 8), cloudMat);
      s.position.set((j - n / 2) * 30 + r() * 10, r() * 12, r() * 22); s.scale.y = 0.5; g.add(s);
    }
    g.position.set((r() * 2 - 1) * 1200, 230 + r() * 120, (r() * 2 - 1) * 1200); clouds.add(g);
  }
  scene.add(clouds);

  const state = { hour: 8, night: 0, phase: 'Pagi', lightDir: new THREE.Vector3(), sunDir: new THREE.Vector3() };
  const c0 = new THREE.Color(), c1 = new THREE.Color(), tmp = new THREE.Color();
  const white = new THREE.Color(1, 1, 1);
  const lerpKey = (k0, k1, t, f, out) => out.set(KEYS[k0][f]).lerp(c1.set(KEYS[k1][f]), t);

  state.update = (hour, center, dt) => {
    state.hour = hour;
    let k = 0; while (k < KEYS.length - 2 && hour >= KEYS[k + 1].h) k++;
    const t = (hour - KEYS[k].h) / (KEYS[k + 1].h - KEYS[k].h);
    lerpKey(k, k + 1, t, 'sky', top); lerpKey(k, k + 1, t, 'fog', hor);
    const sunCol = lerpKey(k, k + 1, t, 'sun', c0);
    const si = KEYS[k].si + (KEYS[k + 1].si - KEYS[k].si) * t;
    const hi = KEYS[k].hi + (KEYS[k + 1].hi - KEYS[k].hi) * t;

    const ang = ((hour - 6) / 12) * Math.PI;
    state.sunDir.set(Math.cos(ang), Math.sin(ang), 0.28).normalize();
    const moonDir = state.sunDir.clone().negate();
    state.night = 1 - sstep(-0.15, 0.1, state.sunDir.y);
    const mix = sstep(-0.12, 0.12, state.sunDir.y);
    state.lightDir.copy(moonDir).lerp(state.sunDir, mix).normalize();

    sunLight.color.copy(sunCol); sunLight.intensity = si;
    sunLight.position.copy(center).addScaledVector(state.lightDir, 220);
    sunLight.target.position.copy(center);
    hemi.color.copy(top).lerp(white, 0.45);
    hemi.groundColor.set(0x56693f).multiplyScalar(0.35 + 0.65 * (1 - state.night));
    hemi.intensity = hi;

    scene.fog.color.copy(hor);
    scene.fog.near = 70; scene.fog.far = 950 - 380 * state.night;

    dome.position.copy(center);
    sunM.position.copy(center).addScaledVector(state.sunDir, 1200); sunM.visible = state.sunDir.y > -0.12;
    sunGlow.position.copy(sunM.position); sunGlow.visible = sunM.visible;
    sunGlow.material.color.copy(sunCol); sunGlow.material.opacity = 0.9 * (1 - state.night);
    moonM.position.copy(center).addScaledVector(moonDir, 1200); moonM.visible = moonDir.y > -0.12;
    moonGlow.position.copy(moonM.position); moonGlow.visible = moonM.visible;
    stars.position.copy(center); starM.opacity = state.night;
    tmp.copy(white).lerp(hor, 0.35 + 0.4 * state.night).multiplyScalar(1 - 0.75 * state.night);
    cloudMat.color.copy(tmp);
    clouds.position.set(center.x * 0.9, 0, center.z * 0.9);
    for (const g of clouds.children) { g.position.x += 3 * dt; if (g.position.x > 1300) g.position.x = -1300; }
    state.phase = phaseName(hour);
  };
  return state;
}
