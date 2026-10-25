// ============================================================
//  entities.js — NPC manusia (bisa diajak bicara) & slime musuh
// ============================================================
import * as THREE from 'three';
import { createHumanoid, animateHumanoid, toon } from './character.js';
import { getHeight, resolveCollisions, PLACES, WATER_Y, rng } from './world.js';

export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ---------------- NPC ----------------
export class NPC {
  constructor(scene, def) {
    this.name = def.name; this.lines = def.lines; this.wander = def.wander || 0;
    this.h = createHumanoid(def.look);
    this.root = this.h.root; scene.add(this.root);
    this.home = new THREE.Vector3(def.x, 0, def.z);
    this.pos = this.home.clone();
    this.yaw = def.yaw || 0; this.baseYaw = this.yaw;
    this.state = 'idle'; this.timer = Math.random() * 3; this.walkT = 0; this.target = new THREE.Vector3();
    this.talking = false; this.lineIdx = 0; this.speed = def.speed || 1.5;
    this.kind = 'npc';
    this.sync();
  }
  sync() {
    this.pos.y = Math.max(getHeight(this.pos.x, this.pos.z), WATER_Y);
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
  }
  update(dt, player) {
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z, dist = Math.hypot(dx, dz);
    let move = 0, want = this.yaw;
    if (this.talking) want = Math.atan2(dx, dz);
    else if (this.wander > 0) {
      if (this.state === 'idle') {
        this.timer -= dt;
        if (dist < 5) want = Math.atan2(dx, dz);
        if (this.timer <= 0) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * this.wander;
          this.target.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
          if (getHeight(this.target.x, this.target.z) > WATER_Y + 0.3) { this.state = 'walk'; this.walkT = 0; }
          else this.timer = 1;
        }
      } else {
        const tx = this.target.x - this.pos.x, tz = this.target.z - this.pos.z, d = Math.hypot(tx, tz);
        this.walkT += dt;
        if (d < 0.5 || this.walkT > 9) { this.state = 'idle'; this.timer = 2 + Math.random() * 5; }
        else {
          move = 1; want = Math.atan2(tx, tz);
          this.pos.x += tx / d * this.speed * dt; this.pos.z += tz / d * this.speed * dt;
          resolveCollisions(this.pos, 0.4);
        }
      }
    } else {
      want = dist < 9 ? Math.atan2(dx, dz) : this.baseYaw;
    }
    this.yaw = lerpAngle(this.yaw, want, 1 - Math.exp(-dt * 8));
    this.sync();
    animateHumanoid(this.h, dt, { move: move * 0.65, mouth: this.talking ? (Math.sin(performance.now() * 0.02) * 0.5 + 0.5) : 0 });
  }
  nextLine() {
    const l = this.lines[this.lineIdx % this.lines.length];
    this.lineIdx++;
    return l;
  }
}

const L = (look) => look;
export function createNPCs(scene) {
  const K = PLACES.kingdom, C = PLACES.city, V = PLACES.village, S = PLACES.spawn;
  const defs = [];
  // ---- padang awal ----
  defs.push({ name: 'Mio (Pemandu)', x: S.x - 4, z: S.z + 6, yaw: 0.5,
    look: L({ hair: 0xff8fc0, hairStyle: 'twin', top: 0xffd3e6, skirt: true, skirtColor: 0x2c3d73, socks: true, bowtie: true, eyeTop: '#d63a7a', eyeBottom: '#ffc1dc' }),
    lines: ['Selamat datang di Sakura Realm, Yuki-chan! Aku Mio, pemandu pemula.',
      'Tekan WASD untuk berjalan, Shift untuk sprint, dan Spasi untuk melompat.',
      'Q = Ultimate, E = Regen setengah HP, R atau klik kiri = tebasan pedang. Hati-hati dengan slime di padang rumput!',
      'Tekan M untuk membuka peta, lalu 1/2/3 untuk melacak Kerajaan, Kota, atau Desa.'] });
  // ---- kerajaan ----
  defs.push({ name: 'Raja Aldric', x: K.x, z: -157, yaw: 0, look: L({ hair: 0xd8d8d8, hairStyle: 'short', top: 0x8a1c2b, bottom: 0x2b2b44, longSleeve: true, accessory: 'crown', scale: 1.1, eyeTop: '#4a5a2a', eyeBottom: '#b8d27a' }),
    lines: ['Hmm, pengembara muda dengan pedang bercahaya... Selamat datang di Kerajaan Sakura.', 'Slime di padang akhir-akhir ini semakin banyak. Kalahkan mereka demi rakyatku!', 'Gunakan air mancur di taman istana untuk memulihkan tenaga.'] });
  defs.push({ name: 'Putri Selene', x: K.x + 7, z: -150, wander: 5, look: L({ hair: 0xf6d77a, hairStyle: 'long', hairLength: 0.8, top: 0xffc2e0, skirt: true, skirtColor: 0xff9fcb, accessory: 'tiara', eyeTop: '#8a3ad6', eyeBottom: '#e3c1ff' }),
    lines: ['Wah, rambut perakmu cantik sekali! Boleh aku menyentuhnya?', 'Pohon sakura di taman ini kutanam sendiri lho.', 'Kalau malam, jendela istana menyala indah. Datanglah lagi nanti malam!'] });
  for (const s of [-1, 1]) defs.push({ name: 'Penjaga Gerbang', x: K.x + s * 9.5, z: -112 + 3, yaw: 0, look: L({ hair: 0x3a2f2a, top: 0x7d8aa6, bottom: 0x4a5570, longSleeve: true, accessory: 'helmet', item: 'spear', scale: 1.08 }),
    lines: ['Berhenti! ...Oh, kamu pahlawan yang dibicarakan itu. Silakan masuk.', 'Menara di dalam penuh harta, tapi jangan berani mencurinya, ya!'] });
  defs.push({ name: 'Pelayan Rina', x: K.x - 12, z: -140, wander: 9, look: L({ hair: 0x4a2f2a, hairStyle: 'bun', top: 0x2a2a3a, skirt: true, skirtColor: 0x2a2a3a, socks: true, eyeTop: '#2a7a4a', eyeBottom: '#b3f0c8' }),
    lines: ['Selamat datang! Teh hangat di istana selalu siap.', 'Raja suka sekali kue mochi, tapi Putri lebih suka dango.'] });
  defs.push({ name: 'Pelayan Taro', x: K.x + 14, z: -128, wander: 9, look: L({ hair: 0x2a2a3a, top: 0xf0f0f0, bottom: 0x2a2a3a, longSleeve: true }),
    lines: ['Awas licin, baru dipel!', 'Aku bermimpi jadi ksatria, tapi sekarang masih mengepel lantai.'] });
  // ---- kota ----
  const cityNames = ['Haru', 'Aoi', 'Kenji', 'Mika', 'Ren', 'Yui', 'Daichi', 'Sakura'];
  const cityHair = [0x2a2a3a, 0x3a6fd0, 0x5a3a2a, 0xd6527a, 0x333333, 0x6a4fd0, 0x222222, 0xff9fb8];
  const cityTop = [0xffffff, 0xff9fb8, 0x9ad0ff, 0xf7e06a, 0xb9a0ff, 0xa0ffcf, 0xff7a7a, 0xffffff];
  const cityLines = [
    ['Kota ini bersinar cantik kalau malam, lho!', 'Jam di tengah kota itu sudah berdiri ratusan tahun.'],
    ['Aku sedang menunggu temanku di dekat menara jam.', 'Kamu tahu? Papan neon di atap itu menyala sendiri saat gelap.'],
    ['Takoyaki di kios itu enak banget, cobain deh!', 'Lampu jalan di sini menyala otomatis saat malam.'],
    ['Pedang itu keren! Kamu petualang ya?', 'Kalau ke utara, ada Kerajaan Sakura. Ke barat ada desa yang tenang.'],
  ];
  const cityFemale = [false, true, false, true, false, true, false, true];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    defs.push({ name: cityNames[i], x: C.x + Math.cos(a) * (8 + (i % 3) * 5), z: C.z + Math.sin(a) * (8 + (i % 3) * 5), wander: 12, speed: 1.5 + (i % 3) * 0.2,
      look: L({ hair: cityHair[i], hairStyle: cityFemale[i] ? (i % 4 === 1 ? 'long' : 'twin') : 'short', hairLength: 0.7, top: cityTop[i], bottom: cityFemale[i] ? 0x3a3a60 : 0x2f3550, skirt: cityFemale[i], skirtColor: 0x3a3a60, socks: cityFemale[i],
        eyeTop: '#3a7ad6', eyeBottom: '#bfe0ff' }),
      lines: cityLines[i % 4] });
  }
  defs.push({ name: 'Penjual Takoyaki', x: C.x + 8, z: C.z - 6.2, yaw: 0, look: L({ hair: 0x222222, top: 0xffffff, bottom: 0x2a3a6a, accessory: 'strawhat', scale: 1.05 }),
    lines: ['Takoyaki panas! Gurih, renyah di luar, lembut di dalam!', 'Hari ini aku bikin 200 butir. Tinggal sedikit lagi!'] });
  // ---- desa ----
  defs.push({ name: 'Pak Joko (Petani)', x: V.x - 18, z: V.z + 54, wander: 8, look: L({ hair: 0x4a3a2a, top: 0x6fae4a, bottom: 0x5a4a32, accessory: 'strawhat', longSleeve: true }),
    lines: ['Panen tahun ini bagus. Terima kasih pada cuaca cerah!', 'Orang-orangan sawahku itu sering dikira orang sungguhan, hehe.'] });
  defs.push({ name: 'Nenek Sumi', x: V.x + 3, z: V.z + 5, wander: 6, scale: 0.92, look: L({ hair: 0xf0f0f0, hairStyle: 'bun', top: 0xb58ad0, skirt: true, skirtColor: 0x6a4a8a, longSleeve: true, scale: 0.92, eyeTop: '#6a5a3a', eyeBottom: '#d8c8a0' }),
    lines: ['Air sumur desa ini menyegarkan. Minumlah, nak.', 'Dulu aku juga petualang sepertimu, sebelum lututku mengeluh.', 'Kincir angin di timur itu dibuat oleh kakekku.'] });
  defs.push({ name: 'Aya (Anak)', x: V.x - 6, z: V.z + 12, wander: 14, speed: 2.4, look: L({ hair: 0xff9a3a, hairStyle: 'twin', top: 0xfff0a0, skirt: true, skirtColor: 0x3a8a5a, socks: true, scale: 0.7, eyeTop: '#d65a2a', eyeBottom: '#ffd0b0' }),
    lines: ['Kakak cantik! Rambutmu seperti salju!', 'Ayo main kejar-kejaran! ...eh, kakak kan sibuk melawan slime ya.'] });
  defs.push({ name: 'Budi (Anak)', x: V.x + 8, z: V.z + 14, wander: 14, speed: 2.4, look: L({ hair: 0x2a2a2a, top: 0x66b3ff, bottom: 0x4a4a6a, scale: 0.7 }),
    lines: ['Aku pernah lihat slime besar di dekat danau!', 'Pedangmu bercahaya, keren!'] });
  defs.push({ name: 'Gon (Pandai Besi)', x: V.x + 14, z: V.z - 10, wander: 4, look: L({ hair: 0x6a2a1a, top: 0x3a3a3a, bottom: 0x4a3a2a, scale: 1.12, accessory: null }),
    lines: ['Pedang yang bagus! Kalau tumpul, datang ke aku.', 'Ultimate-mu itu... brutal juga ya. Aku suka!'] });
  defs.push({ name: 'Mei (Petani)', x: V.x - 40, z: V.z + 36, wander: 8, look: L({ hair: 0x8a5a3a, hairStyle: 'long', hairLength: 0.55, top: 0xfff2d0, skirt: true, skirtColor: 0x7a5a3a, accessory: 'strawhat', eyeTop: '#3a8a6a', eyeBottom: '#b8f0d8' }),
    lines: ['Rumput di sini hijau dan lembut, ya?', 'Kalau lelah, duduklah di dekat danau. Tenang sekali.'] });
  return defs.map((d) => { const n = new NPC(scene, d); return n; });
}

// ---------------- Slime ----------------
const SLIME_COLORS = [0x6fe0ff, 0xff9ad0, 0xa8f06a, 0xffd36a, 0xb59aff];
export class Slime {
  constructor(scene, x, z, camera, rand) {
    this.kind = 'slime'; this.camera = camera;
    this.spawn = new THREE.Vector3(x, 0, z);
    this.pos = new THREE.Vector3(x, getHeight(x, z), z);
    this.maxHp = 60; this.hp = 60; this.alive = true; this.respawnT = 0;
    this.vy = 0; this.vx = 0; this.vz = 0; this.hopT = rand() * 2; this.flash = 0; this.hitCd = 0; this.yaw = 0;
    const color = SLIME_COLORS[Math.floor(rand() * SLIME_COLORS.length)];
    this.mat = new THREE.MeshStandardMaterial({ color, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.88, emissive: color, emissiveIntensity: 0.12 });
    this.root = new THREE.Group();
    this.body = new THREE.Mesh(new THREE.SphereGeometry(0.75, 20, 14), this.mat); this.body.scale.set(1, 0.8, 1); this.body.position.y = 0.6; this.body.castShadow = true;
    this.root.add(this.body);
    const eyeM = new THREE.MeshBasicMaterial({ color: 0x1a1a2e }), hlM = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), eyeM); e.position.set(s * 0.26, 0.72, 0.62); e.scale.y = 1.3; this.root.add(e);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), hlM); hl.position.set(s * 0.26 + 0.03, 0.78, 0.7); this.root.add(hl);
    }
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), eyeM); mouth.scale.set(1.6, 0.6, 0.5); mouth.position.set(0, 0.55, 0.7); this.root.add(mouth);
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 5), toon(0x58c86a)); leaf.position.set(0, 1.35, 0); leaf.rotation.z = 0.3; this.root.add(leaf);
    // bar HP
    this.bar = new THREE.Group(); this.bar.position.y = 1.9;
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.14), new THREE.MeshBasicMaterial({ color: 0x1a1a2a, depthTest: false, transparent: true, opacity: 0.8 }));
    this.fg = new THREE.Mesh(new THREE.PlaneGeometry(1.14, 0.09), new THREE.MeshBasicMaterial({ color: 0xff4d6d, depthTest: false }));
    this.fg.position.z = 0.001; bg.renderOrder = 10; this.fg.renderOrder = 11;
    this.bar.add(bg, this.fg); this.root.add(this.bar); this.bar.visible = false;
    scene.add(this.root); this.sync();
  }
  sync() { this.root.position.copy(this.pos); this.root.rotation.y = this.yaw; }
  hit(dmg, from) {
    if (!this.alive) return false;
    this.hp -= dmg; this.flash = 0.15; this.bar.visible = true;
    const dx = this.pos.x - from.x, dz = this.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
    this.vx = dx / d * 5; this.vz = dz / d * 5; this.vy = 4;
    this.fg.scale.x = Math.max(0.001, this.hp / this.maxHp); this.fg.position.x = -(1 - this.fg.scale.x) * 0.57;
    if (this.hp <= 0) { this.alive = false; this.root.visible = false; this.respawnT = 22; return true; }
    return false;
  }
  update(dt, game) {
    const P = game.player;
    if (!this.alive) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) {
        this.alive = true; this.hp = this.maxHp; this.pos.copy(this.spawn); this.pos.y = getHeight(this.spawn.x, this.spawn.z);
        this.root.visible = true; this.bar.visible = false; this.fg.scale.x = 1; this.fg.position.x = 0; this.sync();
      }
      return;
    }
    const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, dist = Math.hypot(dx, dz);
    const gh = getHeight(this.pos.x, this.pos.z);
    const onGround = this.pos.y <= gh + 0.02;
    this.hitCd -= dt; this.flash -= dt;
    if (onGround) {
      this.vx *= 0.8; this.vz *= 0.8;
      this.hopT -= dt;
      if (this.hopT <= 0) {
        this.vy = 5.5; this.hopT = 0.9 + Math.random() * 0.8;
        let dir;
        if (dist < 16 && P.alive) { dir = Math.atan2(dx, dz); this.hopT *= 0.7; }
        else dir = Math.random() * 6.28;
        const sp = dist < 16 && P.alive ? 4.2 : 1.6;
        this.vx = Math.sin(dir) * sp; this.vz = Math.cos(dir) * sp; this.yaw = dir;
      }
    }
    this.vy -= 22 * dt;
    this.pos.x += this.vx * dt; this.pos.z += this.vz * dt; this.pos.y += this.vy * dt;
    resolveCollisions(this.pos, 0.7);
    // tetap dekat titik asal
    const hd = Math.hypot(this.pos.x - this.spawn.x, this.pos.z - this.spawn.z);
    if (hd > 40) { this.vx += (this.spawn.x - this.pos.x) * 0.05; this.vz += (this.spawn.z - this.pos.z) * 0.05; }
    const g2 = Math.max(getHeight(this.pos.x, this.pos.z), WATER_Y - 0.3);
    if (this.pos.y <= g2) { this.pos.y = g2; this.vy = 0; }
    if (dist < 1.5 && this.hitCd <= 0 && P.alive) { this.hitCd = 1.2; game.hurtPlayer(10, this.pos); }
    // squash & stretch
    const st = Math.max(-0.25, Math.min(0.3, this.vy * 0.04));
    this.body.scale.set(1 - st * 0.6, 0.8 + st, 1 - st * 0.6);
    this.mat.emissiveIntensity = this.flash > 0 ? 1.2 : 0.12;
    if (this.bar.visible) this.bar.quaternion.copy(this.camera.quaternion);
    if (dist > 60 && this.bar.visible && this.hp === this.maxHp) this.bar.visible = false;
    this.sync();
  }
}

export function spawnSlimes(scene, camera, count = 30) {
  const rand = rng(4242);
  const list = [];
  let tries = 0;
  while (list.length < count && tries < 5000) {
    tries++;
    const a = rand() * 6.28, r = 55 + rand() * 280;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    let bad = false;
    for (const k in PLACES) { const p = PLACES[k]; if (Math.hypot(x - p.x, z - p.z) < (k === 'spawn' ? 40 : p.r + 8)) bad = true; }
    const y = getHeight(x, z);
    if (bad || y < 0.2 || y > 45) continue;
    list.push(new Slime(scene, x, z, camera, rand));
  }
  return list;
}
