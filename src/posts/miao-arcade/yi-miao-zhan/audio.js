// 全部音效和配乐都是 WebAudio 现场合成，没有音频文件。
const Sound = (() => {
  let ac = null, master = null, muted = false, musicTimer = null, step = 0, nextAt = 0, noiseSeed = 12345;
  const PENTA = [0, 2, 4, 7, 9];
  const note = (i, base = 220) => base * 2 ** ((PENTA[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5)) / 12);

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.55;
    const comp = ac.createDynamicsCompressor();
    master.connect(comp); comp.connect(ac.destination);
  }

  function tone(f, d, type = 'square', v = 0.2, slide = 0, at = 0) {
    if (!ac) return;
    const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.02);
  }

  function noise(d, v = 0.3, freq = 2000, type = 'bandpass', to = 0) {
    if (!ac) return;
    const n = Math.floor(ac.sampleRate * d), buf = ac.createBuffer(1, n, ac.sampleRate), data = buf.getChannelData(0);
    // 音效用自己的噪声源，不动 Math.random，开不开声音都不影响游戏的随机序列。
    for (let i = 0; i < n; i++) { noiseSeed = (noiseSeed * 1664525 + 1013904223) >>> 0; data[i] = noiseSeed / 2147483648 - 1; }
    const s = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter(), t = ac.currentTime;
    s.buffer = buf; f.type = type; f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }

  function musicTick(fever) {
    if (!ac) return;
    const beat = fever ? 0.125 : 0.17;
    while (nextAt < ac.currentTime + 0.25) {
      const at = Math.max(0, nextAt - ac.currentTime);
      const bar = Math.floor(step / 16) % 4, root = [0, 3, 1, 4][bar];
      if (step % 4 === 0) tone(note(root, 55), 0.26, 'triangle', 0.17, 1, at);
      if (step % 4 === 2) tone(note(root + 2, 55), 0.14, 'triangle', 0.1, 1, at);
      const motif = [0, 2, 4, 2, 5, 4, 2, 1, 0, 2, 4, 5, 7, 5, 4, 2];
      if (step % 2 === 0 || fever) tone(note(motif[step % 16] + root, 330), 0.1, 'square', fever ? 0.045 : 0.03, 1, at);
      nextAt += beat; step++;
    }
  }

  return {
    init,
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.55; return muted; },
    get muted() { return muted; },
    startMusic(getFever) {
      if (!ac) return;
      nextAt = ac.currentTime + 0.05; step = 0;
      clearInterval(musicTimer);
      musicTimer = setInterval(() => musicTick(getFever()), 80);
    },
    stopMusic() { clearInterval(musicTimer); musicTimer = null; },
    dash() { noise(0.14, 0.2, 1200, 'bandpass', 5200); },
    // 连斩越高音越高：这是整个游戏最上瘾的一点。
    slash(combo) {
      const n = note(Math.min(combo, 22), 330);
      tone(n, 0.16, 'square', 0.17); tone(n * 1.5, 0.12, 'triangle', 0.13, 1, 0.025);
      noise(0.07, 0.18, 4200, 'highpass');
    },
    clang() { tone(1400, 0.2, 'square', 0.16, 0.55); tone(2150, 0.15, 'triangle', 0.14, 0.7); noise(0.08, 0.25, 6000, 'highpass'); },
    miss() { tone(170, 0.16, 'sawtooth', 0.09, 0.6); },
    boom() { noise(0.5, 0.5, 1200, 'lowpass', 90); tone(120, 0.42, 'sine', 0.45, 0.28); },
    hurt() { tone(420, 0.34, 'sawtooth', 0.22, 0.25); noise(0.2, 0.26, 700, 'lowpass'); },
    pickup() { [0, 2, 4].forEach((i, k) => tone(note(i, 660), 0.12, 'triangle', 0.16, 1, k * 0.06)); },
    fever() { [0, 1, 2, 3, 4, 5].forEach((i, k) => tone(note(i, 440), 0.13, 'square', 0.1, 1, k * 0.04)); },
    wave() { tone(330, 0.11, 'square', 0.1); tone(495, 0.2, 'square', 0.1, 1, 0.1); },
    bossHit() { tone(110, 0.26, 'sawtooth', 0.28, 0.5); noise(0.12, 0.3, 900, 'lowpass'); },
    pop(hue) { tone(300 + hue, 0.2, 'triangle', 0.08, 0.5); noise(0.16, 0.12, 2600, 'bandpass', 500); },
    fanfare() { [0, 2, 4, 5, 7, 9, 10].forEach((i, k) => { tone(note(i, 330), 0.34, 'square', 0.13, 1, k * 0.13); tone(note(i, 165), 0.34, 'triangle', 0.16, 1, k * 0.13); }); },
    over() { [4, 3, 2, 1, 0].forEach((i, k) => tone(note(i, 220), 0.25, 'triangle', 0.2, 1, k * 0.13)); },
  };
})();
