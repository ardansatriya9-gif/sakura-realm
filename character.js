// ============================================================
//  character.js — pembuat karakter anime (toon shading + outline)
//  Karakter utama meniru gambar referensi: rambut perak panjang +
//  ahoge, pita merah, mata biru, kemeja putih + dasi kupu-kupu merah,
//  rok plisket abu gelap, kaos kaki putih bergaris oranye, sepatu cokelat.
// ============================================================
import * as THREE from 'three';

const GRAD = (() => {
  const d = new Uint8Array([70, 150, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

export function toon(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: GRAD, ...extra });
}
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x20202e, side: THREE.BackSide });
function addOutline(mesh, k = 0.04) {
  const o = new THREE.Mesh(mesh.geometry, OUTLINE);
  o.scale.setScalar(1 + k);
  o.userData.outline = true;
  mesh.add(o);
}

const eyeCache = new Map();
function eyeTexture(top, bottom) {
  const key = top + bottom;
  if (eyeCache.has(key)) return eyeCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.save();
  g.beginPath(); g.ellipse(64, 66, 46, 54, 0, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#f6f8ff'; g.fillRect(0, 0, 128, 128);
  const grd = g.createLinearGradient(0, 14, 0, 120);
  grd.addColorStop(0, top); grd.addColorStop(1, bottom);
  g.fillStyle = grd; g.beginPath(); g.ellipse(64, 70, 36, 48, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#14204a'; g.beginPath(); g.ellipse(64, 72, 15, 22, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(20,30,70,0.35)'; g.beginPath(); g.ellipse(64, 22, 40, 16, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath(); g.arc(50, 48, 11, 0, 7); g.fill();
  g.beginPath(); g.arc(80, 92, 5.5, 0, 7); g.fill();
  g.restore();
  g.strokeStyle = '#1d1d33'; g.lineWidth = 9; g.lineCap = 'round';
  g.beginPath(); g.ellipse(64, 66, 46, 54, 0, Math.PI * 1.04, Math.PI * 1.96); g.stroke();
  g.lineWidth = 6; g.beginPath(); g.moveTo(110, 36); g.lineTo(122, 24); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  eyeCache.set(key, t);
  return t;
}

function pleatedSkirt(rTop, rBot, h, mat) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, 48, 6, true);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.07 * Math.cos(a * 12) * (0.5 - y / h);
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

export function createHumanoid(opts = {}) {
  const o = {
    skin: 0xffe4d6, hair: 0x5a4636, hairStyle: 'short', hairLength: 0.45, hairEmissive: 0x000000,
    top: 0xe8e8ee, bottom: 0x445577, skirt: false, skirtColor: 0x3a3a46, socks: false, longSleeve: false,
    shoes: 0x3b2a22, eyeTop: '#2d6fd0', eyeBottom: '#a9defc', scale: 1, accessory: null, item: null,
    ribbon: false, bowtie: false, ahoge: false, sword: false, ...opts,
  };
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const body = new THREE.Group(); root.add(body);

  const skinM = toon(o.skin), topM = toon(o.top), botM = toon(o.bottom), shoeM = toon(o.shoes);
  const hairM = toon(o.hair, { emissive: o.hairEmissive });
  const hairMD = toon(o.hair, { emissive: o.hairEmissive, side: THREE.DoubleSide });
  const parts = {};

  // ---------- kaki ----------
  const legs = [];
  for (const side of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(side * 0.085, 0.82, 0);
    if (o.skirt || o.socks) {
      const skin = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.045, 0.74, 12), skinM);
      skin.position.y = -0.37; g.add(skin);
      if (o.socks) {
        const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.044, 0.42, 14), toon(0xffffff));
        sock.position.y = -0.53; g.add(sock);
        for (const y of [-0.345, -0.38]) {
          const st = new THREE.Mesh(new THREE.CylinderGeometry(0.0605, 0.0605, 0.014, 16), toon(0xf29a2e));
          st.position.y = y; g.add(st);
        }
      }
    } else {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.05, 0.74, 12), botM);
      leg.position.y = -0.37; g.add(leg);
    }
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), shoeM);
    shoe.scale.set(0.062, 0.045, 0.125); shoe.position.set(0, -0.77, 0.04); g.add(shoe);
    body.add(g); legs.push(g);
  }
  parts.legR = legs[0]; parts.legL = legs[1];

  // ---------- badan ----------
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.105, 0.46, 16), topM);
  torso.position.y = 1.07; torso.scale.z = 0.75; body.add(torso); addOutline(torso, 0.04);

  if (o.skirt) {
    const sk = pleatedSkirt(0.125, 0.255, 0.3, toon(o.skirtColor, { side: THREE.DoubleSide }));
    sk.position.y = 0.73; body.add(sk);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.272, 0.276, 0.018, 48, 1, true), toon(0xffffff, { side: THREE.DoubleSide }));
    stripe.position.y = 0.615; body.add(stripe);
  } else {
    const hip = new THREE.Mesh(new THREE.CylinderGeometry(0.108, 0.115, 0.14, 14), botM);
    hip.position.y = 0.86; hip.scale.z = 0.8; body.add(hip);
  }
  if (o.bowtie) {
    const red = toon(0xd9253a);
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.07, 6), red);
      w.rotation.z = s * Math.PI / 2; w.position.set(s * 0.04, 1.25, 0.1); body.add(w);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.01), red);
      tail.position.set(s * 0.025, 1.17, 0.1); tail.rotation.z = s * 0.15; body.add(tail);
    }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), red);
    knot.position.set(0, 1.25, 0.105); body.add(knot);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.014, 6, 20), toon(0xffffff));
    collar.rotation.x = Math.PI / 2; collar.position.set(0, 1.3, 0.0); collar.scale.y = 0.8; body.add(collar);
  }
  if (o.accessory === 'cape') {
    const cape = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.9, 0.025), toon(0x9c1d33));
    cape.position.set(0, 1.0, -0.12); body.add(cape);
    const fur = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 8, 16), toon(0xf4efe6));
    fur.rotation.x = Math.PI / 2; fur.position.set(0, 1.31, 0); body.add(fur);
  }

  // ---------- lengan ----------
  const arms = [];
  for (const side of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(side * 0.17, 1.27, 0);
    const armMat = o.longSleeve ? topM : skinM;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.03, 0.48, 10), armMat);
    arm.position.y = -0.25; g.add(arm);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.047, 0.16, 12), topM);
    sleeve.position.y = -0.07; g.add(sleeve);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), skinM);
    hand.position.y = -0.51; g.add(hand);
    body.add(g); arms.push(g);
  }
  parts.armR = arms[0]; parts.armL = arms[1];

  // ---------- leher & kepala ----------
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.1, 10), skinM);
  neck.position.y = 1.34; body.add(neck);

  const head = new THREE.Group(); head.position.y = 1.52; body.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 28, 20), skinM);
  skull.scale.set(1, 1.04, 0.97); head.add(skull); addOutline(skull, 0.03);

  // mata
  const eyeTex = eyeTexture(o.eyeTop, o.eyeBottom);
  const eyeMat = new THREE.MeshBasicMaterial({ map: eyeTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.PlaneGeometry(0.088, 0.1), eyeMat);
    e.position.set(s * 0.062, -0.012, 0.152); e.rotation.y = s * 0.36;
    e.scale.x = s; // cermin untuk mata kiri
    head.add(e); eyes.push(e);
  }
  parts.eyes = eyes;
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), toon(0xc2445a));
  mouth.scale.set(1.4, 0.6, 0.5); mouth.position.set(0, -0.088, 0.158); head.add(mouth);
  parts.mouth = mouth;
  for (const s of [-1, 1]) {
    const bl = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), new THREE.MeshBasicMaterial({ color: 0xff8fa3, transparent: true, opacity: 0.35, depthWrite: false }));
    bl.position.set(s * 0.1, -0.05, 0.135); bl.rotation.y = s * 0.7; head.add(bl);
  }

  // ---------- rambut ----------
  const hair = new THREE.Group(); head.add(hair);
  const R = 0.18;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 18, 0, Math.PI * 2, 0, Math.PI * 0.40), hairMD);
  cap.position.y = 0.005; hair.add(cap);
  const sides = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 20, Math.PI * 0.8, Math.PI * 1.4, 0, Math.PI * 0.72), hairMD);
  sides.position.y = 0.005; hair.add(sides);

  // poni
  const nB = 7;
  for (let i = 0; i < nB; i++) {
    const a = (i / (nB - 1) - 0.5) * 2.1;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.125, 6), hairM);
    c.rotation.x = Math.PI; c.rotation.z = -a * 0.35;
    c.position.set(Math.sin(a) * 0.172, 0.078 - Math.abs(a) * 0.02, Math.cos(a) * 0.168);
    hair.add(c);
  }

  const back = new THREE.Group(); hair.add(back); parts.hairBack = back;
  const side = [];
  const style = o.hairStyle;
  if (style === 'long') {
    const L = o.hairLength;
    const main = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.05, L, 18), hairM);
    main.position.set(0, -L / 2 - 0.02, -0.075); main.scale.z = 0.55; back.add(main); addOutline(main, 0.035);
    for (const s of [-1, 1]) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.03, L * 0.92, 10), hairM);
      st.position.set(s * 0.1, -L * 0.46 - 0.02, -0.07); st.rotation.z = s * 0.06; back.add(st);
    }
    for (const s of [-1, 1]) { // sidelocks
      const sl = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.32, 4, 8), hairM);
      sl.position.set(s * 0.155, -0.17, 0.07); sl.rotation.z = s * 0.06; hair.add(sl); side.push(sl);
    }
  } else if (style === 'twin') {
    for (const s of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.02, 0.5, 10), hairM);
      t.position.set(s * 0.2, -0.22, -0.02); t.rotation.z = s * 0.18; back.add(t);
      const tie = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), toon(0xff5a8a));
      tie.position.set(s * 0.18, 0.02, -0.02); back.add(tie);
    }
    const bk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.1, 0.2, 14), hairM);
    bk.position.set(0, -0.08, -0.07); bk.scale.z = 0.6; back.add(bk);
  } else if (style === 'bun') {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), hairM);
    bun.position.set(0, 0.2, -0.06); back.add(bun);
    const bk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.1, 0.16, 14), hairM);
    bk.position.set(0, -0.06, -0.07); bk.scale.z = 0.6; back.add(bk);
  } else { // short
    const bk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.18, 14), hairM);
    bk.position.set(0, -0.05, -0.06); bk.scale.z = 0.7; back.add(bk);
  }
  parts.sidelocks = side;

  if (o.ahoge) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.165, 0.02), new THREE.Vector3(0.012, 0.23, 0.03),
      new THREE.Vector3(0.05, 0.285, 0.0), new THREE.Vector3(0.11, 0.285, -0.03), new THREE.Vector3(0.13, 0.24, -0.04),
    ]);
    const ah = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.009, 6, false), hairM);
    const g = new THREE.Group(); g.add(ah); hair.add(g); parts.ahoge = g;
  }
  if (o.ribbon) {
    const red = toon(0xd9253a);
    const g = new THREE.Group(); g.position.set(-0.14, 0.1, 0.07); g.rotation.z = 0.5;
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 6), red);
      w.rotation.z = s * Math.PI / 2; w.position.x = s * 0.04; g.add(w);
    }
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), red));
    head.add(g);
  }

  // ---------- aksesori ----------
  const gold = new THREE.MeshStandardMaterial({ color: 0xf4c542, metalness: 0.7, roughness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa4b8, metalness: 0.8, roughness: 0.35 });
  if (o.accessory === 'crown') {
    const g = new THREE.Group(); g.position.y = 0.17;
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.125, 0.06, 12), gold));
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.08, 5), gold);
      c.position.set(Math.cos(a) * 0.115, 0.065, Math.sin(a) * 0.115); g.add(c);
    }
    head.add(g);
  } else if (o.accessory === 'tiara') {
    const g = new THREE.Group(); g.position.set(0, 0.145, 0.07);
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 5), gold); c.position.y = 0.03; g.add(c);
    const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff4d88, emissive: 0xff4d88, emissiveIntensity: 0.6 }));
    jewel.position.set(0, 0.0, 0.03); g.add(jewel); head.add(g);
  } else if (o.accessory === 'helmet') {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.195, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), steel);
    h.position.y = 0.02; head.add(h);
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 6), toon(0xd9253a)); plume.position.y = 0.28; head.add(plume);
  } else if (o.accessory === 'strawhat') {
    const g = new THREE.Group(); g.position.y = 0.12;
    const mat = toon(0xe8cf7a, { side: THREE.DoubleSide });
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.012, 24), mat));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat); dome.position.y = 0.005; g.add(dome);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.192, 0.195, 0.04, 16, 1, true), toon(0xd9253a, { side: THREE.DoubleSide })); band.position.y = 0.03; g.add(band);
    head.add(g);
  }

  // ---------- item di tangan ----------
  if (o.sword) {
    const sw = new THREE.Group(); sw.position.set(0, -0.51, 0.02); sw.rotation.x = Math.PI / 2;
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xe3efff, emissive: 0x4aa8ff, emissiveIntensity: 0.55, metalness: 0.8, roughness: 0.2 });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.16, 8), toon(0x3a2a2a)); handle.position.y = 0.0; sw.add(handle);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), gold); pom.position.y = -0.09; sw.add(pom);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.026, 0.05), gold); guard.position.y = 0.09; sw.add(guard);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.9, 0.012), bladeMat); blade.position.y = 0.09 + 0.45; sw.add(blade);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0396, 0.1, 4), bladeMat); tip.rotation.y = Math.PI / 4; tip.scale.z = 0.22; tip.position.y = 0.09 + 0.9 + 0.05; sw.add(tip);
    parts.armR.add(sw); parts.sword = sw; parts.bladeMat = bladeMat;
  }
  if (o.item === 'spear') {
    const sp = new THREE.Group(); sp.position.set(0, -0.5, 0.03);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.9, 6), toon(0x6b4a2b)); shaft.position.y = 0.4; sp.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 6), steel); tip.position.y = 1.45; sp.add(tip);
    parts.armR.add(sp);
  }

  parts.body = body; parts.head = head;
  root.scale.setScalar(o.scale);
  root.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = !m.userData.outline;
      m.receiveShadow = !m.userData.outline;
    }
  });
  return { root, parts, o, anim: { phase: 0, time: Math.random() * 10, blink: 2 + Math.random() * 3, blinkT: 0 } };
}

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// s: { move 0..1, sprint, air, attack:{kind,t}, heal, mouth }
export function animateHumanoid(h, dt, s = {}) {
  const a = h.anim, p = h.parts;
  a.time += dt;
  const move = Math.min(1, s.move || 0), sprint = !!s.sprint;
  a.phase += dt * (sprint ? 14 : 10) * move;
  const sw = Math.sin(a.phase) * (sprint ? 1.0 : 0.7) * move;
  const idle = Math.sin(a.time * 2) * 0.02;

  if (s.air) {
    p.legL.rotation.x = -0.9; p.legR.rotation.x = 0.5;
    p.armL.rotation.x = -0.7; p.armR.rotation.x = -0.6;
  } else {
    p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
    p.armL.rotation.x = -sw * 0.9 + idle; p.armR.rotation.x = sw * 0.9 - idle;
  }
  p.armL.rotation.z = 0.08; p.armR.rotation.z = -0.08;
  p.body.position.y = Math.abs(Math.sin(a.phase)) * 0.045 * move + idle * 0.6;
  p.body.rotation.x = sprint ? 0.2 * move : 0;
  p.body.rotation.y = 0;
  p.head.rotation.y = Math.sin(a.time * 0.7) * 0.05 * (1 - move);

  if (s.heal && !s.attack) {
    p.armL.rotation.x = -1.1; p.armR.rotation.x = -1.1;
    p.armL.rotation.z = -0.35; p.armR.rotation.z = 0.35;
  }
  if (s.attack) {
    const t = s.attack.t;
    if (s.attack.kind === 'ult') {
      p.body.rotation.y = a.time * 26;
      p.armR.rotation.x = -1.4 + Math.sin(a.time * 45) * 1.2;
      p.armL.rotation.x = -1.0 + Math.sin(a.time * 38) * 0.8;
      p.armR.rotation.z = -0.3;
    } else {
      const e = sstep(0.1, 0.6, t);
      p.armR.rotation.x = -2.7 + e * 2.4;
      p.body.rotation.y = 0.55 - e * 1.1;
      p.armL.rotation.x = -0.3;
    }
  }
  // rambut mengalir
  const flow = 0.04 + idle + move * (sprint ? 0.5 : 0.25) + (s.air ? 0.2 : 0);
  p.hairBack.rotation.x = flow;
  for (const sl of p.sidelocks) sl.rotation.x = -flow * 0.4;
  if (p.ahoge) p.ahoge.rotation.z = Math.sin(a.time * 3) * 0.12;
  // kedip
  a.blink -= dt;
  if (a.blink <= 0) { a.blinkT = 0.12; a.blink = 2.5 + Math.random() * 3.5; }
  const ey = a.blinkT > 0 ? 0.1 : 1;
  if (a.blinkT > 0) a.blinkT -= dt;
  for (const e of p.eyes) e.scale.y = ey;
  p.mouth.scale.y = 0.6 + (s.mouth || 0) * 2.2;
  // sword glow
  if (p.bladeMat) p.bladeMat.emissiveIntensity = s.attack && s.attack.kind === 'ult' ? 2.4 : 0.55 + (s.attack ? 0.6 : 0);
}
