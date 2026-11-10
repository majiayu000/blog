'use strict';
// 声音：全部用 WebAudio 现场合成，没有音频文件

const NOTE_IX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteFreq(n, tr) {
  const m = /^([A-G])(#?)(\d)$/.exec(n); if (!m) return 0;
  const midi = NOTE_IX[m[1]] + (m[2] ? 1 : 0) + (+m[3] + 1) * 12 + (tr || 0);
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// 每个记号是一个十六分音符：音名=起音，-=延长，.=休止
const SONGS = {
  title: { bpm: 108,
    lead: 'G4 - A4 - C5 - D5 - E5 - - - D5 - C5 - A4 - C5 - D5 - C5 - A4 - - - G4 - - - G4 - A4 - C5 - D5 - E5 - G5 - E5 - D5 - C5 - - - D5 - E5 - C5 - - - . . . .',
    bass: 'C3 . C3 . G2 . G2 . C3 . C3 . G2 . G2 . A2 . A2 . E2 . E2 . A2 . A2 . E2 . E2 . C3 . C3 . G2 . G2 . C3 . C3 . G2 . G2 . G2 . G2 . G2 . G2 . C3 . C3 . C3 . . .',
    drum: 'k.h.s.h.k.h.s.h.' },
  stageA: { bpm: 138,
    lead: 'A4 . A4 C5 . D5 . E5 . . E5 D5 . C5 . A4 G4 . G4 A4 . C5 . D5 . . C5 A4 . G4 . . A4 . A4 C5 . D5 . E5 . . G5 E5 . D5 . E5 A5 . . G5 . E5 . D5 C5 . D5 . E5 . . .',
    bass: 'A2 A2 . A2 A2 . A2 . A2 A2 . A2 G2 . G2 . G2 G2 . G2 G2 . G2 . G2 G2 . G2 E2 . G2 . A2 A2 . A2 A2 . A2 . A2 A2 . A2 G2 . G2 . D3 D3 . D3 D3 . D3 . E3 E3 . E3 E3 . E2 .',
    drum: 'k.h.s.hkk.h.s.h.' },
  stageB: { bpm: 132,
    lead: 'D5 . . F5 . G5 . A5 . . G5 . F5 . D5 . C5 . . D5 . F5 . G5 . . F5 . D5 . C5 . D5 . F5 . G5 . A5 . C6 . A5 . G5 . F5 . G5 . . F5 . D5 . C5 D5 . . . . . . .',
    bass: 'D3 . D3 D3 . D3 . D3 D3 . D3 D3 . D3 . D3 C3 . C3 C3 . C3 . C3 C3 . C3 C3 . C3 . C3 A#2 . A#2 A#2 . A#2 . A#2 A#2 . A#2 A#2 . A#2 . A#2 G2 . G2 G2 . G2 . A2 D3 . D3 D3 . A2 . A2',
    drum: 'k.hhs.h.k.khs.hh' },
  boss: { bpm: 152,
    lead: 'E4 E4 . E4 G4 . E4 . A4 . G4 . E4 . D4 . E4 E4 . E4 G4 . E4 . B4 . A4 . G4 . A4 . E5 . D5 . B4 . A4 . G4 . A4 . B4 . D5 . E5 . . E5 . D5 . B4 . A4 . G4 A4 . B4 .',
    bass: 'E2 . E2 . E2 . E2 . G2 . G2 . A2 . A2 . E2 . E2 . E2 . E2 . G2 . G2 . B2 . B2 . C3 . C3 . C3 . C3 . D3 . D3 . D3 . D3 . E3 . E3 . E3 . D3 . B2 . B2 . A2 . B2 .',
    drum: 'k.hkshk.k.hkshsh' },
  final: { use: 'boss', bpm: 166, tr: 2 },
  win: { bpm: 150, once: true, then: 'title', lead: 'C5 E5 G5 C6 - - G5 C6 - - E6 - - - - - . .', bass: 'C3 . . . G3 . . . C3 . . . C3 - - - . .', drum: 'k..sk.s.k...s...' },
  over: { bpm: 96, once: true, lead: 'E4 - D4 - C4 - A3 - - - - - . . . .', bass: 'A2 - - - - - - - A2 - - - . . . .', drum: 'k.......k.......' },
};

const SFX = {
  swing: s => s.noise(0.09, 0.16, 2600, 600, 0, 'bandpass'),
  hit: s => { s.noise(0.07, 0.34, 1900, 400); s.tone('square', 190, 70, 0.08, 0.2); },
  heavy: s => { s.noise(0.17, 0.5, 1300, 140); s.tone('sine', 150, 40, 0.22, 0.55); },
  block: s => { s.tone('square', 950, 720, 0.06, 0.14); s.tone('triangle', 1500, 1200, 0.1, 0.16); },
  break: s => { s.noise(0.2, 0.4, 3000, 300); s.tone('square', 520, 120, 0.2, 0.2); },
  jump: s => s.tone('square', 300, 640, 0.12, 0.1),
  dash: s => s.noise(0.14, 0.2, 500, 3200, 0, 'bandpass'),
  land: s => s.tone('sine', 120, 50, 0.1, 0.3),
  throw: s => s.noise(0.12, 0.16, 900, 2600, 0, 'bandpass'),
  pick: s => { s.tone('square', 880, 880, 0.07, 0.12); s.tone('square', 1320, 1320, 0.1, 0.12, 0.07); },
  power: s => { for (let i = 0; i < 5; i++) s.tone('square', 440 * Math.pow(1.26, i), 440 * Math.pow(1.26, i), 0.08, 0.12, i * 0.05); },
  special: s => { s.tone('sawtooth', 180, 1300, 0.42, 0.2); s.noise(0.42, 0.18, 500, 6000, 0, 'bandpass'); },
  explode: s => { s.noise(0.4, 0.6, 900, 60); s.tone('sine', 110, 30, 0.4, 0.6); },
  roar: s => { s.tone('sawtooth', 130, 55, 0.6, 0.35); s.noise(0.6, 0.25, 400, 120); },
  tele: s => s.tone('square', 1250, 1250, 0.07, 0.09),
  fuse: s => s.tone('square', 1700, 1700, 0.04, 0.07),
  ui: s => s.tone('square', 660, 660, 0.04, 0.09),
  ok: s => { s.tone('square', 660, 660, 0.06, 0.12); s.tone('square', 990, 990, 0.1, 0.12, 0.06); },
  back: s => s.tone('square', 440, 300, 0.09, 0.1),
  ko: s => { s.tone('square', 420, 90, 0.32, 0.22); s.noise(0.2, 0.3, 900, 200); },
  unlock: s => { [523, 659, 784, 1047, 1319].forEach((f, i) => s.tone('square', f, f, 0.14, 0.13, i * 0.08)); },
  go: s => { s.tone('square', 784, 784, 0.08, 0.12); s.tone('square', 1047, 1047, 0.14, 0.12, 0.09); },
  laser: s => { s.tone('sawtooth', 1500, 240, 0.3, 0.18); s.noise(0.25, 0.12, 5000, 1500, 0, 'bandpass'); },
  freeze: s => { s.tone('triangle', 2200, 600, 0.35, 0.2); s.noise(0.3, 0.14, 7000, 3000, 0, 'highpass'); },
  heal: s => { [660, 880, 1100].forEach((f, i) => s.tone('triangle', f, f * 1.02, 0.16, 0.2, i * 0.07)); },
};

const Sound = {
  ctx: null, out: null, mus: null, nbuf: null, last: {}, muted: false, song: null, songName: '', step: 0, next: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const c = this.ctx = new AC();
      this.out = c.createGain(); this.out.gain.value = this.muted ? 0 : 0.5; this.out.connect(c.destination);
      this.mus = c.createGain(); this.mus.gain.value = 0.3; this.mus.connect(this.out);
      this.nbuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = this.nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  },
  setMute(m) { this.muted = m; Save.d.mute = m; Save.store(); if (this.out) this.out.gain.value = m ? 0 : 0.5; },
  now() { return this.vt != null ? this.vt : this.ctx.currentTime; },
  live() { return !!this.ctx && (this.vt != null || this.ctx.state === 'running'); },
  tone(type, f0, f1, dur, vol, delay, dest, at) {
    const c = this.ctx; if (!c) return;
    const t = (at || this.now()) + (delay || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.out); o.start(t); o.stop(t + dur + 0.03);
  },
  noise(dur, vol, f0, f1, delay, type, dest, at) {
    const c = this.ctx; if (!c) return;
    const t = (at || this.now()) + (delay || 0), s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.nbuf; s.loop = true; f.type = type || 'lowpass';
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
  },
  play(n) {
    if (!this.live()) return;
    const now = this.now();
    if (now - (this.last[n] == null ? -1 : this.last[n]) < 0.045) return;
    this.last[n] = now; if (SFX[n]) SFX[n](this);
  },
  music(name) {
    if (this.songName === name) return;
    this.songName = name; this.step = 0; this.next = 0;
    let s = SONGS[name]; if (!s) { this.song = null; return; }
    const base = s.use ? SONGS[s.use] : s;
    if (!base.L) { base.L = base.lead.split(/\s+/); base.B = base.bass.split(/\s+/); }
    this.song = { L: base.L, B: base.B, D: base.drum, bpm: s.bpm, tr: s.tr || 0, once: s.once, then: s.then };
  },
  hold(arr, i) { let n = 1; while (i + n < arr.length && arr[i + n] === '-') n++; return n; },
  tick() {
    const s = this.song; if (!s || !this.live()) return;
    const sd = 60 / s.bpm / 4, now = this.now();
    if (this.next < now) this.next = now + 0.06;
    while (this.next < now + 0.14) {
      const i = this.step, t = this.next, li = i % s.L.length, bi = i % s.B.length;
      if (s.once && i >= s.L.length) { this.song = null; if (s.then) { this.songName = ''; this.music(s.then); } return; } // 一次性的小调放完后接下一首
      const ln = s.L[li], bn = s.B[bi], dr = s.D[i % s.D.length];
      if (ln !== '.' && ln !== '-') { const f = noteFreq(ln, s.tr), d = this.hold(s.L, li) * sd * 0.92; this.tone('square', f, f, d, 0.2, 0, this.mus, t); this.tone('triangle', f * 2, f * 2, d * 0.7, 0.08, 0, this.mus, t); }
      if (bn !== '.' && bn !== '-') { const f = noteFreq(bn, s.tr), d = this.hold(s.B, bi) * sd * 0.9; this.tone('triangle', f, f, d, 0.5, 0, this.mus, t); }
      if (dr === 'k') this.tone('sine', 150, 45, 0.11, 0.7, 0, this.mus, t);
      else if (dr === 's') this.noise(0.09, 0.3, 3000, 1200, 0, 'bandpass', this.mus, t);
      else if (dr === 'h') this.noise(0.03, 0.12, 8000, 7000, 0, 'highpass', this.mus, t);
      this.step++; this.next += sd;
    }
  },
};
