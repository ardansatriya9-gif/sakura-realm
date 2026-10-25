// ============================================================
//  audio.js — musik tenang (prosedural), ambience alam, SFX,
//  dan suara karakter anime imut. Tidak butuh file audio.
// ============================================================

// Ingin suara asli (mp3/wav)? Taruh file di folder assets/voice/ lalu isi daftar ini.
// Contoh: attack: ['assets/voice/attack1.mp3', 'assets/voice/attack2.mp3']
export const VOICE_FILES = {
  attack: [], ult: [], ultEnd: [], heal: [], jump: [], hurt: [], hello: [], die: [], start: [],
};

// Fallback: Web Speech API (suara bawaan browser, pitch ditinggikan agar imut)
const VOICE = {
  attack: [{ ja: 'えいっ！', id: 'Eii!' }, { ja: 'やぁっ！', id: 'Yaa!' }, { ja: 'はぁっ！', id: 'Haa!' }],
  ult:    [{ ja: 'ぜんぶ、きっちゃうよー！えーい、えーい、えーい！', id: 'Semuanya kutebas yaa! Eii, eii, eii!' }],
  ultEnd: [{ ja: 'これで、おしまいっ！', id: 'Sudah selesai!' }],
  heal:   [{ ja: 'いたいの、いたいの、とんでけー！', id: 'Sakit sakit, pergilah!' }],
  jump:   [{ ja: 'ぴょんっ！', id: 'Hup!' }, { ja: 'よいしょっ！', id: 'Yosh!' }],
  hurt:   [{ ja: 'きゃっ！', id: 'Kyaa!' }, { ja: 'いたっ！', id: 'Aduh!' }],
  hello:  [{ ja: 'こんにちはー！', id: 'Halo~!' }, { ja: 'はじめまして！', id: 'Salam kenal!' }],
  die:    [{ ja: 'きゅうぅ…', id: 'Kyuu...' }],
  start:  [{ ja: 'がんばるぞー！おー！', id: 'Semangat! Oo!' }],
};

let ctx = null, master, musicBus, sfxBus, ambBus, reverb, noiseBuf, crickLevel;
let started = false, muted = false, hour = 8;
let voiceJa = null, voiceId = null, lastSpeak = 0;

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function makeImpulse(sec, decay) {
  const rate = ctx.sampleRate, len = Math.floor(rate * sec);
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices();
  voiceJa = vs.find((v) => /^ja/i.test(v.lang) && /female|nanami|haruka|kyoko|mizuki|ayumi|google|o-ren|sayaka/i.test(v.name))
    || vs.find((v) => /^ja/i.test(v.lang)) || null;
  voiceId = vs.find((v) => /^id/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

export function initAudio() {
  if (started) return;
  started = true;
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC();

  const comp = ctx.createDynamicsCompressor();
  master = ctx.createGain(); master.gain.value = 0.85;
  master.connect(comp); comp.connect(ctx.destination);

  reverb = ctx.createConvolver(); reverb.buffer = makeImpulse(3.4, 2.6);
  const wet = ctx.createGain(); wet.gain.value = 0.65;
  reverb.connect(wet); wet.connect(master);

  musicBus = ctx.createGain(); musicBus.gain.value = 0.5;
  musicBus.connect(master); musicBus.connect(reverb);

  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.7;
  sfxBus.connect(master);

  ambBus = ctx.createGain(); ambBus.gain.value = 0.55;
  ambBus.connect(master);

  // buffer noise
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  startWind();
  startCrickets();
  const t0 = ctx.currentTime + 0.3;
  nextChord = t0; nextBell = t0 + 1; nextBird = t0 + 3;
  setInterval(schedule, 200);
}

export function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
export function toggleMute() {
  muted = !muted;
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.85, ctx.currentTime, 0.1);
  if (muted && 'speechSynthesis' in window) speechSynthesis.cancel();
  return muted;
}
export function setHour(h) {
  hour = h;
  if (crickLevel) crickLevel.gain.setTargetAtTime(h < 5.3 || h > 19.5 ? 0.03 : 0, ctx.currentTime, 2);
}

// ---------------- musik tenang ----------------
const CHORDS = [[48, 55, 60, 64], [45, 52, 60, 64], [41, 48, 57, 60], [43, 50, 59, 62]]; // C Am F G
const SCALE = [72, 74, 76, 79, 81, 84, 86];
let nextChord = 0, nextBell = 0, nextBird = 0, chordIdx = 0;

function pad(notes, t, dur) {
  for (const n of notes) {
    for (const [type, det, vol] of [['sine', 0, 0.05], ['triangle', 6, 0.02]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = midi(n); o.detune.value = det;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + dur * 0.4);
      g.gain.linearRampToValueAtTime(0, t + dur + 1.5);
      o.connect(g); g.connect(musicBus);
      o.start(t); o.stop(t + dur + 1.6);
    }
  }
}
function bell(note, t, vol = 0.09) {
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = midi(note);
  const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = midi(note) * 2.01;
  const g = ctx.createGain(); const g2 = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
  g2.gain.setValueAtTime(0.0001, t);
  g2.gain.exponentialRampToValueAtTime(vol * 0.25, t + 0.01);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  o.connect(g); o2.connect(g2); g.connect(musicBus); g2.connect(musicBus);
  o.start(t); o2.start(t); o.stop(t + 3.3); o2.stop(t + 1.3);
}
function chirp(t) {
  const o = ctx.createOscillator(); o.type = 'sine';
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
  const base = 2200 + Math.random() * 1600, n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const s = t + i * 0.12;
    o.frequency.setValueAtTime(base, s);
    o.frequency.exponentialRampToValueAtTime(base * 1.35, s + 0.06);
    o.frequency.exponentialRampToValueAtTime(base * 0.9, s + 0.1);
    g.gain.linearRampToValueAtTime(0.035, s + 0.015);
    g.gain.linearRampToValueAtTime(0, s + 0.1);
  }
  o.connect(g); g.connect(ambBus); o.start(t); o.stop(t + n * 0.12 + 0.2);
}
function schedule() {
  if (!ctx) return;
  const now = ctx.currentTime;
  const night = hour < 5.5 || hour > 19.5;
  if (nextChord < now + 0.6) {
    pad(CHORDS[chordIdx % CHORDS.length], Math.max(nextChord, now + 0.05), 8);
    chordIdx++; nextChord = Math.max(nextChord, now) + 8;
  }
  while (nextBell < now + 0.5) {
    const note = SCALE[Math.floor(Math.random() * SCALE.length)];
    bell(note, Math.max(nextBell, now + 0.02), night ? 0.06 : 0.09);
    nextBell += (night ? 1.6 : 0.9) + Math.random() * (night ? 2.2 : 1.4);
  }
  if (!night && nextBird < now + 0.5) {
    chirp(Math.max(nextBird, now + 0.05));
    nextBird += 2 + Math.random() * 5;
  } else if (night) nextBird = now + 2;
}
function startWind() {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
  const g = ctx.createGain(); g.gain.value = 0.05;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.12;
  const lg = ctx.createGain(); lg.gain.value = 0.03;
  lfo.connect(lg); lg.connect(g.gain);
  src.connect(lp); lp.connect(g); g.connect(ambBus);
  src.start(); lfo.start();
}
function startCrickets() {
  const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 4300;
  const am = ctx.createGain(); am.gain.value = 0;
  const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 11;
  const lg = ctx.createGain(); lg.gain.value = 0.5;
  lfo.connect(lg); lg.connect(am.gain);
  crickLevel = ctx.createGain(); crickLevel.gain.value = 0;
  o.connect(am); am.connect(crickLevel); crickLevel.connect(ambBus);
  o.start(); lfo.start();
}

// ---------------- SFX ----------------
function noise(t, dur, type, f0, f1, vol) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfxBus);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function tone(t, dur, f0, f1, vol, type = 'sine') {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.05);
}
const lastSfx = {};
export function sfx(name) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  if (lastSfx[name] && t - lastSfx[name] < 0.05) return;
  lastSfx[name] = t;
  switch (name) {
    case 'swoosh': noise(t, 0.2, 'bandpass', 900, 3200, 0.5); break;
    case 'hit': noise(t, 0.09, 'lowpass', 2400, 500, 0.5); tone(t, 0.12, 220, 90, 0.35); break;
    case 'jump': tone(t, 0.18, 380, 900, 0.18); break;
    case 'step': noise(t, 0.06, 'bandpass', 500 + Math.random() * 200, 250, 0.1); break;
    case 'pop': tone(t, 0.18, 600, 140, 0.3); break;
    case 'hurt': tone(t, 0.2, 500, 180, 0.25, 'square'); break;
    case 'ult':
      for (let i = 0; i < 6; i++) noise(t + i * 0.1, 0.18, 'bandpass', 800, 3600, 0.4);
      tone(t, 0.8, 120, 40, 0.5);
      break;
    case 'heal': [72, 76, 79, 84, 88].forEach((n, i) => tone(t + i * 0.09, 0.9, midi(n), midi(n) * 1.001, 0.12)); break;
    case 'chest': [76, 79, 83, 88].forEach((n, i) => tone(t + i * 0.08, 0.8, midi(n), midi(n), 0.14)); break;
    case 'ui': tone(t, 0.1, 900, 1200, 0.1); break;
    default: break;
  }
}

// ---------------- suara karakter ----------------
function chirpVoice() { // fallback "pyon~" imut bila TTS tidak ada
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(t, 0.09, 900, 1500, 0.12); tone(t + 0.1, 0.12, 1200, 1900, 0.12);
}
export function speak(key, force = false) {
  if (muted) return;
  const now = performance.now();
  if (!force && now - lastSpeak < 650) return;
  lastSpeak = now;
  const files = VOICE_FILES[key];
  if (files && files.length) {
    const a = new window.Audio(files[Math.floor(Math.random() * files.length)]);
    a.volume = 1; a.play().catch(() => {});
    return;
  }
  const list = VOICE[key]; if (!list) return;
  const line = list[Math.floor(Math.random() * list.length)];
  if (!('speechSynthesis' in window)) { chirpVoice(); return; }
  if (!voiceJa && !voiceId) loadVoices();
  const u = new SpeechSynthesisUtterance(voiceJa ? line.ja : line.id);
  u.voice = voiceJa || voiceId || null;
  u.lang = voiceJa ? 'ja-JP' : 'id-ID';
  u.pitch = 2; u.rate = 1.15; u.volume = 1;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
