'use strict';
// 灯笼街保卫战 · 基础层：常量、工具函数、存档、输入

const W = 960, H = 540, WALL_Y = 330, GROUND_TOP = 344, GROUND_BOT = 514, GRAV = 1500, STEP = 1 / 60;
const TAU = Math.PI * 2, D2R = Math.PI / 180;
const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif';
const PCOL = ['#ff5d5d', '#4da3ff', '#ffc93c', '#5fd38d'];
const INK = '#1d1522';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const sgn = v => v < 0 ? -1 : 1;
const ease = t => t * t * (3 - 2 * t);
const clampY = y => clamp(y, GROUND_TOP + 6, GROUND_BOT - 4);
const QS = new URLSearchParams(location.search);

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function fmtTime(s) { return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }

function txt(c, s, x, y, size, color, align, stroke, weight) {
  c.font = (weight || 800) + ' ' + size + 'px ' + FONT;
  c.textAlign = align || 'left'; c.textBaseline = 'middle';
  if (stroke) {
    c.lineJoin = 'round'; c.lineWidth = Math.max(3, size * 0.2);
    c.strokeStyle = stroke === true ? INK : stroke; c.strokeText(s, x, y);
  }
  c.fillStyle = color || '#fff'; c.fillText(s, x, y);
}
function rrect(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function bar(c, x, y, w, h, frac, color, back) {
  rrect(c, x - 2, y - 2, w + 4, h + 4, 4); c.fillStyle = INK; c.fill();
  c.fillStyle = back || '#3a2f45'; c.fillRect(x, y, w, h);
  c.fillStyle = color; c.fillRect(x, y, w * clamp(frac, 0, 1), h);
  c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(x, y, w * clamp(frac, 0, 1), h * 0.35);
}

// 全局游戏状态
const G = { state: 'title', st: 0, t: 0, picks: [], p1dev: 'k1', stageIdx: 0, mapSel: 0, log: [], speed: 1 };

const Save = {
  key: 'lantern-street-v1',
  d: { cleared: 0, best: {}, mute: false },
  load() {
    try { const s = JSON.parse(localStorage.getItem(this.key)); if (s) Object.assign(this.d, s); } catch (e) { /* 无存档 */ }
    if (QS.get('unlock')) this.d.cleared = 8;
  },
  store() { if (QS.get('unlock')) return; try { localStorage.setItem(this.key, JSON.stringify(this.d)); } catch (e) { /* 忽略 */ } },
};

// ---------- 输入：两套键盘 + 最多四个手柄 + 机器人虚拟设备 ----------
const KEYS = {
  k1: { l: ['KeyA'], r: ['KeyD'], u: ['KeyW'], d: ['KeyS'], atk: ['KeyJ', 'Enter'], jump: ['KeyK'], heavy: ['KeyL'], special: ['KeyU', 'KeyI'], dash: ['Space', 'ShiftLeft'], start: ['Escape'] },
  k2: { l: ['ArrowLeft'], r: ['ArrowRight'], u: ['ArrowUp'], d: ['ArrowDown'], atk: ['Comma', 'Numpad1'], jump: ['Period', 'Numpad2'], heavy: ['Slash', 'Numpad3'], special: ['Semicolon', 'Numpad4'], dash: ['ShiftRight', 'Numpad0'], start: [] },
};
const BTNS = ['atk', 'jump', 'heavy', 'special', 'dash', 'start'];
const DEV_NAME = { k1: '键盘 WASD', k2: '键盘 方向键', g0: '手柄 1', g1: '手柄 2', g2: '手柄 3', g3: '手柄 4', bot0: '机器人', bot1: '机器人', bot2: '机器人', bot3: '机器人' };

const Input = {
  down: {}, fresh: {}, devs: {}, padPrev: {}, merge: true,
  init() {
    addEventListener('keydown', e => {
      if (!this.down[e.code]) this.fresh[e.code] = true;
      this.down[e.code] = true;
      if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Slash' || e.code === 'Quote') e.preventDefault();
      Sound.init();
      if (e.code === 'KeyM') Sound.setMute(!Sound.muted);
    });
    addEventListener('keyup', e => { this.down[e.code] = false; });
    addEventListener('blur', () => { this.down = {}; });
    addEventListener('pointerdown', () => Sound.init());
  },
  mk() {
    return { mx: 0, my: 0, pl: false, pr: false, pu: false, pd: false, _l: false, _r: false, _u: false, _d: false,
      atk: false, jump: false, heavy: false, special: false, dash: false, start: false, hold: {} };
  },
  fill(d, l, r, u, dn, ax, ay, held, fresh) {
    d.mx = ax || (r ? 1 : 0) - (l ? 1 : 0); d.my = ay || (dn ? 1 : 0) - (u ? 1 : 0);
    const m = Math.hypot(d.mx, d.my); if (m > 1) { d.mx /= m; d.my /= m; }
    const L = d.mx < -0.5, R = d.mx > 0.5, U = d.my < -0.5, D = d.my > 0.5;
    d.pl = L && !d._l; d.pr = R && !d._r; d.pu = U && !d._u; d.pd = D && !d._d;
    d._l = L; d._r = R; d._u = U; d._d = D;
    for (const b of BTNS) { d[b] = !!fresh(b); d.hold[b] = !!held(b); }
  },
  poll() {
    const any = (codes, m) => codes.some(k => m[k]);
    for (const id of ['k1', 'k2']) {
      const d = this.devs[id] || (this.devs[id] = this.mk());
      // 单人时两套键位都算一号玩家
      const src = this.merge ? (id === 'k1' ? [KEYS.k1, KEYS.k2] : []) : [KEYS[id]];
      const dn = n => src.some(s => any(s[n], this.down)), fr = n => src.some(s => any(s[n], this.fresh));
      this.fill(d, dn('l'), dn('r'), dn('u'), dn('d'), 0, 0, dn, fr);
    }
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < 4; i++) {
      const p = pads[i], id = 'g' + i;
      if (!p || !p.connected) { delete this.devs[id]; continue; }
      const d = this.devs[id] || (this.devs[id] = this.mk());
      const b = n => !!(p.buttons[n] && p.buttons[n].pressed);
      const cur = { atk: b(2), jump: b(0), heavy: b(3), dash: b(1) || b(4) || b(6), special: b(5) || b(7), start: b(9) };
      const prev = this.padPrev[id] || {};
      const ax = Math.abs(p.axes[0]) > 0.3 ? p.axes[0] : 0, ay = Math.abs(p.axes[1]) > 0.3 ? p.axes[1] : 0;
      this.fill(d, b(14), b(15), b(12), b(13), ax, ay, n => cur[n], n => cur[n] && !prev[n]);
      this.padPrev[id] = cur;
    }
  },
  endStep() { this.fresh = {}; },
  get(id) { return this.devs[id] || this._blank || (this._blank = this.mk()); },
  // 返回按下了某个键的设备 id
  who(...btns) { for (const id in this.devs) for (const b of btns) if (this.devs[id][b]) return id; return null; },
  ok(id) { const d = this.get(id); return d.atk || d.jump; },
  back(id) { return this.get(id).heavy; },
};
