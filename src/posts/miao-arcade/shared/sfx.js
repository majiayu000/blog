// 两款游戏共用的合成音效：不用任何音频文件。
(function () {
  let ac = null, master = null, musicOn = false, musicTimer = null, step = 0;
  let muted = false;
  try { muted = localStorage.getItem('arcade-muted') === '1'; } catch (e) {}
  function ctx() {
    if (!ac) {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
      ac = new C(); master = ac.createGain(); master.gain.value = muted ? 0 : 0.55;
      const comp = ac.createDynamicsCompressor(); master.connect(comp); comp.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(f, d = 0.12, type = 'sine', v = 0.25, at = 0, slide = 0) {
    const c = ctx(); if (!c) return;
    const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0008, t + d);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.02);
  }
  let noiseBuf = null, lcg = 12345;
  function noise(d = 0.08, v = 0.2, fc = 3000) {
    const c = ctx(); if (!c) return;
    if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const a = noiseBuf.getChannelData(0); for (let i = 0; i < a.length; i++) { lcg = (lcg * 1103515245 + 12345) & 0x7fffffff; a[i] = lcg / 0x3fffffff - 1; } }
    const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = fc; f.Q.value = 1;
    g.gain.setValueAtTime(v, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0008, c.currentTime + d);
    s.connect(f); f.connect(g); g.connect(master); s.start(c.currentTime, (lcg % 500) / 1000, d + 0.02);
  }
  const NOTES = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760, 2093];
  const BASS = [110, 110, 165, 147, 98, 98, 147, 165];
  function musicTick() {
    if (!musicOn || !ac) return;
    const s = step++ % 16;
    if (s % 2 === 0) tone(BASS[(step >> 1) % 8], 0.2, 'triangle', 0.09);
    if (s % 4 === 2) noise(0.05, 0.03, 6000);
    if ((s === 3 || s === 11) && step % 32 > 16) tone(NOTES[(step >> 3) % 5] / 2, 0.16, 'square', 0.012);
  }
  window.SFX = {
    unlock: ctx, tone, noise,
    click() { tone(900, 0.04, 'square', 0.05); },
    deny() { tone(160, 0.12, 'sawtooth', 0.08, 0, 0.7); },
    die(i = 0) { noise(0.05, 0.16, 1800 + (i * 400)); tone(300 + i * 40, 0.03, 'square', 0.03); },
    rattle(n = 6) { for (let i = 0; i < n; i++) setTimeout(() => this.die(i), i * 55 + Math.random() * 25); },
    rise(level = 0) { const n = NOTES[Math.min(level, NOTES.length - 1)]; tone(n, 0.16, 'triangle', 0.2); tone(n * 1.5, 0.1, 'sine', 0.07, 0.04); },
    coin(level = 0) { const f = 1400 + level * 120; tone(f, 0.07, 'square', 0.05); tone(f * 1.5, 0.14, 'square', 0.05, 0.05); },
    bust() { tone(220, 0.55, 'sawtooth', 0.22, 0, 0.25); tone(165, 0.6, 'square', 0.1, 0.03, 0.3); noise(0.3, 0.3, 500); },
    heart() { tone(70, 0.13, 'sine', 0.3); tone(62, 0.15, 'sine', 0.22, 0.17); },
    bank() { [0, 3, 5].forEach((n, i) => tone(NOTES[n], 0.2, 'triangle', 0.18, i * 0.06)); },
    hot() { [0, 2, 4, 5, 7, 9].forEach((n, i) => tone(NOTES[n], 0.2, 'square', 0.07, i * 0.05)); noise(0.3, 0.1, 5000); },
    jackpot() { for (let i = 0; i < 14; i++) { tone(NOTES[(i * 3) % 11], 0.14, 'square', 0.06, i * 0.06); tone(2000 + (i % 3) * 400, 0.05, 'triangle', 0.05, i * 0.06 + 0.03); } },
    fanfare() { [[0, 0], [0, 0.14], [3, 0.28], [5, 0.42], [7, 0.62], [10, 0.86]].forEach(([n, t]) => { tone(NOTES[n], 0.42, 'square', 0.07, t); tone(NOTES[n] / 2, 0.42, 'triangle', 0.12, t); }); },
    lose() { [5, 4, 3, 1].forEach((n, i) => tone(NOTES[n] / 2, 0.34, 'triangle', 0.15, i * 0.2)); },
    peg(level = 0) { const n = NOTES[level % NOTES.length]; tone(n, 0.07, 'triangle', 0.12); },
    startMusic() { if (musicOn) return; musicOn = true; if (ctx()) musicTimer = setInterval(musicTick, 170); },
    stopMusic() { musicOn = false; clearInterval(musicTimer); },
    get muted() { return muted; },
    toggleMute() { muted = !muted; try { localStorage.setItem('arcade-muted', muted ? '1' : '0'); } catch (e) {} if (ctx()) master.gain.value = muted ? 0 : 0.55; return muted; },
  };
})();
