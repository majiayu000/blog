// 一喵斩：按住瞄准（时间变慢），松开斩。斩中立刻能再斩，斩空要歇一下。
const W = 960, H = 600, WALL = 26;
const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
const COMBO_FEVER = 12, DASH_SPEED = 1750, DASH_LEN = 300, DASH_LEN_FEVER = 390, MISS_CD = 0.55;
const FOCUS_DRAIN = 0.42, FOCUS_REGEN = 0.1, FOCUS_ON_KILL = 0.12, SLOW = 0.12;
const CAT_R = 12, MAX_LIVES = 5, FINAL_WAVE = 10;

const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = a => a[Math.floor(Math.random() * a.length)];

// ---------- 素材（全部由 sprite-gen pixel-draw 画出） ----------
const ASSETS = {
  cat: ['idle1', 'idle2', 'dash', 'hurt'], slime: ['idle1', 'idle2'], bat: ['flap1', 'flap2'],
  shroom: ['idle', 'fuse'], turtle: ['walk1', 'walk2'], king: ['idle1', 'idle2'], fish: ['icon'], floor: ['tile'],
};
const SPR = {};
let floorPattern = null;

function loadImage(src) {
  return new Promise((ok, bad) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => bad(new Error('素材加载失败：' + src));
    im.src = src;
  });
}
function whiteVersion(im) {
  const c = document.createElement('canvas');
  c.width = im.width; c.height = im.height;
  const x = c.getContext('2d');
  x.drawImage(im, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = '#fff';
  x.fillRect(0, 0, c.width, c.height);
  return c;
}
async function loadAssets() {
  const jobs = [];
  for (const [k, frames] of Object.entries(ASSETS)) {
    SPR[k] = {};
    for (const f of frames) {
      jobs.push(loadImage(`assets/${k}-${f}.png`).then(im => { SPR[k][f] = { im, white: whiteVersion(im) }; }));
    }
  }
  await Promise.all(jobs);
  const tile = SPR.floor.tile.im, c = document.createElement('canvas');
  c.width = tile.width * 2; c.height = tile.height * 2;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(tile, 0, 0, c.width, c.height);
  floorPattern = ctx.createPattern(c, 'repeat');
}

// ---------- 敌人定义 ----------
const TYPES = {
  slime: { spr: 'slime', frames: ['idle1', 'idle2'], r: 21, scale: 2, speed: 46, pts: 10, color: '#8ee04a', touch: true },
  mini: { spr: 'slime', frames: ['idle1', 'idle2'], r: 12, scale: 1.2, speed: 82, pts: 10, color: '#8ee04a', touch: true },
  bat: { spr: 'bat', frames: ['flap1', 'flap2'], r: 16, scale: 2, speed: 118, pts: 20, color: '#b070ff', touch: true },
  shroom: { spr: 'shroom', frames: ['idle', 'idle'], r: 21, scale: 2, speed: 14, pts: 15, color: '#ff5a4a', touch: true },
  turtle: { spr: 'turtle', frames: ['walk1', 'walk2'], r: 24, scale: 2, speed: 58, pts: 40, color: '#58c070', touch: true },
  king: { spr: 'king', frames: ['idle1', 'idle2'], r: 68, scale: 4, speed: 36, pts: 300, color: '#b45cff', touch: true },
};
const HINTS = {
  shroom: '炸菇：斩完赶紧跑，红圈里会被炸',
  turtle: '铁甲龟：盾牌挡正面，从上下或背后斩',
  bat: '蝙蝠：飞得飘，但分数高',
  king: '史莱姆王：一次冲刺砍一刀，砍下来的小弟能让你续上',
};

function waveList(n) {
  const boss = n % 5 === 0, table = {
    1: ['slime', 5], 2: ['slime', 6, 'bat', 2], 3: ['slime', 5, 'shroom', 2, 'bat', 2], 4: ['turtle', 2, 'slime', 6, 'shroom', 1],
  }[n];
  const list = [];
  if (table) for (let i = 0; i < table.length; i += 2) for (let k = 0; k < table[i + 1]; k++) list.push(table[i]);
  else {
    if (boss) list.push('king');
    const budget = boss ? 4 + n / 2 : 7 + n * 1.5;
    for (let i = 0; i < budget; i++) {
      const v = Math.random();
      list.push(v < 0.45 ? 'slime' : v < 0.68 ? 'bat' : v < 0.84 ? 'shroom' : 'turtle');
    }
  }
  return list;
}

// ---------- 状态 ----------
let S = null, mode = 'loading', loadError = '', titleT = 0;
const input = { x: W / 2, y: H / 2, held: false, queued: false };
const petals = Array.from({ length: 22 }, () => ({ x: rnd(0, W), y: rnd(0, H), s: rnd(1, 3), v: rnd(10, 26), p: rnd(0, 7) }));
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 隐私模式下不保存最高分 */ } },
};
let best = store.get('miao-best', 0);
const seenHints = new Set();

function newGame() {
  S = {
    t: 0, score: 0, combo: 0, maxCombo: 0, kills: 0, wave: 0, focus: 1, lives: 3, timeScale: 1, hitstop: 0, shake: 0, fever: false,
    p: { x: W / 2, y: H / 2, state: 'free', ready: true, cd: 0, cdMax: MISS_CD, invuln: 0, grace: 0, face: 1, ang: 0, dash: null, hurtT: 0 },
    enemies: [], spawns: [], bullets: [], parts: [], rings: [], slashes: [], floats: [], ghosts: [], pickups: [],
    hits: 0, misses: 0, victory: false, winT: 0, slowmo: 0,
    banner: null, hint: '按住瞄准，松开就斩', hintT: 99, firstKill: false, waveT: 0, gap: 0.5, spawnQ: [], spawnT: 0, overT: 0, newBest: false,
  };
  input.queued = false;
  FX.reset();
}

// ---------- 几何 ----------
function segCircle(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  const t = clamp(((cx - ax) * dx + (cy - ay) * dy) / l2, 0, 1);
  const px = ax + dx * t - cx, py = ay + dy * t - cy;
  return px * px + py * py <= r * r ? t : -1;
}
function dashTarget() {
  const p = S.p;
  let dx = input.x - p.x, dy = input.y - p.y, d = Math.hypot(dx, dy);
  if (d < 6) { dx = Math.cos(p.ang); dy = Math.sin(p.ang); d = 1; }
  dx /= d; dy /= d;
  let len = S.fever ? DASH_LEN_FEVER : DASH_LEN;
  const lo = WALL + 14;
  if (dx > 0) len = Math.min(len, (W - lo - p.x) / dx); else if (dx < 0) len = Math.min(len, (lo - p.x) / dx);
  if (dy > 0) len = Math.min(len, (H - lo - p.y) / dy); else if (dy < 0) len = Math.min(len, (lo - p.y) / dy);
  return { dx, dy, len: Math.max(0, len) };
}
// 盾只挡正前方约 120° 的扇面：从上下斜切、或绕到背后都能斩。
const shieldBlocks = (e, dx) => e.type === 'turtle' && dx * e.face < -0.5;
const hittable = e => !e.dead && !e.fused && e.immune <= 0;

// ---------- 特效 ----------
function burst(x, y, color, n = 14, speed = 240) {
  for (let i = 0; i < n && S.parts.length < 420; i++) {
    const a = rnd(0, 6.28), v = rnd(speed * 0.2, speed);
    S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.25, 0.6), max: 0.6, size: pick([3, 4, 6]), color });
  }
}
const ring = (x, y, r, vr, life, color, w = 4) => S.rings.push({ x, y, r, vr, life, max: life, color, w });
const float = (x, y, text, color = '#fff', size = 20) => S.floats.push({ x, y, text, color, size, life: 0.9 });
const addShake = v => { S.shake = Math.min(26, S.shake + v); };
const banner = (text, sub, t = 1.5) => { S.banner = { text, sub, t, max: t }; };

// ---------- 连斩与得分 ----------
function addKillScore(e) {
  S.combo++; S.kills++;
  S.maxCombo = Math.max(S.maxCombo, S.combo);
  const mult = (1 + Math.floor(S.combo / 5)) * (S.fever ? 2 : 1), gain = TYPES[e.type].pts * mult;
  S.score += gain;
  float(e.x, e.y - 28, '+' + gain, S.fever ? '#ffd24a' : '#fff', 18 + Math.min(14, S.combo));
  S.focus = Math.min(1, S.focus + FOCUS_ON_KILL);
  Sound.slash(S.combo);
  if (!S.fever && S.combo >= COMBO_FEVER) {
    S.fever = true; Sound.fever(); banner('狂热！', '得分翻倍，冲刺更远', 1.1); ring(S.p.x, S.p.y, 20, 700, 0.5, '#ffd24a', 8);
  }
  if (S.combo % 10 === 0) float(S.p.x, S.p.y - 50, S.combo + ' 连斩！', '#ffd24a', 34);
}
function breakCombo(say = true) {
  if (say && S.combo >= 3) float(S.p.x, S.p.y - 44, `${S.combo} 连斩断了`, '#ff8d8d', 22);
  S.combo = 0; S.fever = false;
}
function kill(e, dir) {
  if (e.dead) return;
  addKillScore(e);
  const color = TYPES[e.type].color;
  burst(e.x, e.y, color, e.type === 'mini' ? 9 : 16);
  addShake(4 + Math.min(6, S.combo * 0.3));
  FX.kick(e.x, e.y, 1 + Math.min(S.combo, 30) / 15 + (S.fever ? 0.5 : 0), S.fever ? `hsl(${S.t * 500 % 360},100%,68%)` : color);
  S.hitstop = Math.max(S.hitstop, 0.04);
  if (e.type !== 'mini' && Math.random() < 0.035 && S.lives < MAX_LIVES) S.pickups.push({ x: e.x, y: e.y, life: 8, t: 0 });
  if (e.type === 'shroom') { e.fused = true; e.fuse = 0.42; return; }
  e.dead = true;
  if (e.type === 'slime') {
    for (const s of [-1, 1]) {
      const a = Math.atan2(dir.dy, dir.dx) + s * 1.57;
      spawnEnemy('mini', clamp(e.x + Math.cos(a) * 18, 50, W - 50), clamp(e.y + Math.sin(a) * 18, 50, H - 50), { kx: Math.cos(a) * 210, ky: Math.sin(a) * 210, immune: 0.22 });
    }
  }
}
function hitKing(e, dir, damage = 1) {
  e.hp -= damage; e.flash = 0.14; e.immune = 0.24;
  e.kx += dir.dx * 240; e.ky += dir.dy * 240;
  S.combo++; S.maxCombo = Math.max(S.maxCombo, S.combo); S.score += 25 * (1 + Math.floor(S.combo / 5));
  S.focus = Math.min(1, S.focus + FOCUS_ON_KILL);
  FX.kick(e.x, e.y, 2.6, '#d59bff');
  burst(e.x, e.y, TYPES.king.color, 18, 320); addShake(9); S.hitstop = Math.max(S.hitstop, 0.07);
  Sound.bossHit(); Sound.slash(S.combo);
  if (e.hp <= 0) {
    e.dead = true; S.score += 500 * (1 + S.wave / 5);
    const final = S.wave >= FINAL_WAVE;
    banner(final ? '最终 BOSS 击破！' : '史莱姆王倒下了！', final ? '' : '奖励一条鱼', 1.8);
    FX.huge(e.x, e.y); S.slowmo = final ? 1.5 : 0.7;
    if (final) { S.victory = true; S.winT = 2.6; S.spawnQ = []; S.spawns = []; }
    S.lives = Math.min(MAX_LIVES, S.lives + 1);
    burst(e.x, e.y, '#ffd24a', 70, 560); burst(e.x, e.y, TYPES.king.color, 70, 460);
    ring(e.x, e.y, 30, 900, 0.8, '#ffd24a', 12); addShake(26); S.hitstop = 0.28; Sound.boom();
    for (const o of S.enemies) if (!o.dead && o !== e) kill(o, dir);
    S.bullets.length = 0;
  } else {
    const a = rnd(0, 6.28);
    spawnEnemy('mini', clamp(e.x + Math.cos(a) * 80, 50, W - 50), clamp(e.y + Math.sin(a) * 80, 50, H - 50), { kx: Math.cos(a) * 180, ky: Math.sin(a) * 180, immune: 0.2 });
  }
}
function explode(e) {
  const R = 118;
  e.dead = true;
  burst(e.x, e.y, '#ffb347', 26, 460); burst(e.x, e.y, '#ff5a4a', 22, 340);
  FX.kick(e.x, e.y, 3.4, '#ffb347');
  ring(e.x, e.y, 18, 640, 0.32, '#ffe28a', 10); addShake(16); S.hitstop = Math.max(S.hitstop, 0.05); Sound.boom();
  for (const o of S.enemies) {
    if (o.dead || o === e || o.fused) { if (o.fused && o !== e && Math.hypot(o.x - e.x, o.y - e.y) < R + 10) o.fuse = Math.min(o.fuse, 0.1); continue; }
    if (Math.hypot(o.x - e.x, o.y - e.y) > R + o.r) continue;
    const a = Math.atan2(o.y - e.y, o.x - e.x), dir = { dx: Math.cos(a), dy: Math.sin(a) };
    if (o.type === 'king') hitKing(o, dir, 2); else kill(o, dir);
  }
  if (Math.hypot(S.p.x - e.x, S.p.y - e.y) < R + CAT_R) hurtCat();
}

// ---------- 玩家 ----------
function hurtCat() {
  const p = S.p;
  if (p.invuln > 0 || p.state === 'dash' || mode !== 'play' || S.victory) return;
  S.hits++; S.lives--; breakCombo(false);
  p.invuln = 1.5; p.hurtT = 0.45; p.ready = true; p.cd = 0;
  addShake(22); S.hitstop = 0.16; Sound.hurt(); burst(p.x, p.y, '#ff9a3c', 22, 300);
  ring(p.x, p.y, 16, 520, 0.35, '#ffffff', 6);
  // 被打中时把周围的敌人震开，避免一口气连掉几条命。
  for (const o of S.enemies) {
    const d = Math.hypot(o.x - p.x, o.y - p.y) || 1;
    if (d < 190 && o.type !== 'king') { o.kx += (o.x - p.x) / d * 520; o.ky += (o.y - p.y) / d * 520; }
  }
  S.bullets.length = 0;
  if (S.lives <= 0) gameOver();
}
function startDash() {
  const p = S.p, t = dashTarget();
  p.state = 'dash'; p.ready = false; p.cd = 0; p.ang = Math.atan2(t.dy, t.dx); p.face = t.dx >= 0 ? 1 : -1;
  p.dash = { dx: t.dx, dy: t.dy, left: t.len, sx: p.x, sy: p.y, kills: 0, armed: S.enemies.some(e => !e.dead), bonked: false, hitKing: false };
  input.queued = false; Sound.dash();
}
function updateDash(dt) {
  const p = S.p, d = p.dash, step = Math.min(d.left, DASH_SPEED * dt);
  const nx = p.x + d.dx * step, ny = p.y + d.dy * step, hits = [];
  for (const e of S.enemies) {
    if (!hittable(e)) continue;
    const t = segCircle(p.x, p.y, nx, ny, e.x, e.y, e.r + CAT_R);
    if (t >= 0) hits.push({ e, t });
  }
  hits.sort((a, b) => a.t - b.t);
  for (const { e, t } of hits) {
    if (shieldBlocks(e, d.dx)) {
      p.x += d.dx * step * t; p.y += d.dy * step * t;
      // 撞盾：猫弹远、龟被震晕且不能转身。硬直结束前龟够不到猫，撞盾是失误，但不白送一条命。
      const lo = WALL + 14;
      p.x = clamp(p.x - d.dx * 64, lo, W - lo); p.y = clamp(p.y - d.dy * 64, lo, H - lo);
      e.kx += d.dx * 260; e.ky += d.dy * 260; e.stun = 0.75;
      d.left = 0; d.bonked = true; Sound.clang(); addShake(9); S.hitstop = Math.max(S.hitstop, 0.06);
      burst(e.x + e.face * 22, e.y, '#dfe9ff', 12, 280); float(e.x, e.y - 34, '叮！背后才行', '#dfe9ff', 20);
      endDash(); return;
    }
    S.slashes.push({ x: e.x, y: e.y, a: Math.atan2(d.dy, d.dx), life: 0.16, len: e.r * 3 + 40 });
    FX.scar(e.x, e.y, Math.atan2(d.dy, d.dx), e.r * 3 + 40);
    d.kills++;
    if (e.type === 'king') hitKing(e, d); else kill(e, d);
  }
  p.x = nx; p.y = ny; d.left -= step;
  FX.trail(p.x, p.y, S.fever);
  if (Math.random() < 0.9) S.ghosts.push({ x: p.x, y: p.y, a: p.ang, life: 0.2, hue: S.t * 500 % 360, fever: S.fever });
  if (d.left <= 0.01) endDash();
}
function endDash() {
  const p = S.p, d = p.dash;
  p.state = 'free'; p.grace = 0.14; p.dash = null;
  if (d.kills > 0) {
    p.ready = true; p.cd = 0;
    if (!S.firstKill) { S.firstKill = true; S.hint = '斩中能立刻再斩，斩空要歇一下'; S.hintT = 3.5; }
    if (d.kills >= 2) {
      const name = ['', '', '双杀！', '三杀！', '四杀！', '五杀！'][d.kills] || '喵神降临！';
      const bonus = 20 * d.kills * d.kills;
      S.score += bonus;
      float(p.x, p.y - 40, `${name} +${bonus}`, '#6ff2ff', 26 + d.kills * 3);
    }
  } else {
    p.cd = p.cdMax = MISS_CD;
    if (d.armed) { S.misses++; breakCombo(); if (!d.bonked) Sound.miss(); } else p.cd = 0.1;
  }
}

// ---------- 刷怪 ----------
function spawnEnemy(type, x, y, o = {}) {
  const def = TYPES[type];
  const e = { type, x, y, r: def.r, age: 0, wob: rnd(0, 6), kx: o.kx || 0, ky: o.ky || 0, immune: o.immune || 0, flash: 0, face: 1, turn: 0, stun: 0, slam: 2.5, squash: 0, dead: false, fused: false, fuse: 0, spawnT: o.immune ? 1 : 0 };
  if (type === 'king') { e.maxHp = e.hp = 8 + Math.floor(S.wave / 5) * 3; }
  S.enemies.push(e);
  return e;
}
function queueSpawn(type) {
  let x, y, tries = 0;
  const r = type === 'king' ? 110 : 60;
  do { x = rnd(WALL + r, W - WALL - r); y = rnd(WALL + r, H - WALL - r); } while (Math.hypot(x - S.p.x, y - S.p.y) < 170 && ++tries < 30);
  S.spawns.push({ type, x, y, t: 0.62, r });
}
function nextWave() {
  if (S.victory) return;
  S.wave++; S.waveT = 0; S.spawnQ = waveList(S.wave); S.spawnT = 0.4;
  banner(S.wave === FINAL_WAVE ? `第 ${S.wave} 波 · 最终 BOSS` : S.wave % 5 === 0 ? `第 ${S.wave} 波 · BOSS` : `第 ${S.wave} 波`, '', 1.1);
  Sound.wave();
  for (const k of new Set(S.spawnQ)) if (HINTS[k] && !seenHints.has(k)) { seenHints.add(k); S.hint = HINTS[k]; S.hintT = 5; break; }
}

// ---------- 主更新 ----------
function updateEnemy(e, dt) {
  const p = S.p, def = TYPES[e.type];
  e.age += dt; e.wob += dt * 5; e.spawnT = Math.min(1, e.spawnT + dt * 5);
  e.immune = Math.max(0, e.immune - dt); e.flash = Math.max(0, e.flash - dt);
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
  e.stun = Math.max(0, e.stun - dt);
  const speed = def.speed * (1 + Math.min(1, S.wave * 0.035)) * (e.fused || e.stun > 0 ? 0 : 1);
  if (e.type === 'bat') {
    const a = Math.atan2(dy, dx) + Math.sin(e.age * 3.1 + e.wob * 0.1) * 1.15;
    e.x += Math.cos(a) * speed * dt; e.y += Math.sin(a) * speed * dt;
  } else {
    e.x += dx / d * speed * dt; e.y += dy / d * speed * dt;
  }
  if (e.type === 'turtle' && e.stun <= 0) {
    const want = dx >= 0 ? 1 : -1;
    if (want !== e.face) { e.turn += dt; if (e.turn > 1) { e.face = want; e.turn = 0; } } else e.turn = 0;
  }
  if (e.type === 'shroom') {
    if (!e.fused && e.age > 10) { e.fused = true; e.fuse = 1; }
    if (e.fused) { e.fuse -= dt; if (e.fuse <= 0) { explode(e); return; } }
  }
  if (e.type === 'king') {
    e.slam -= dt; e.squash = Math.max(0, e.squash - dt * 3);
    if (e.slam <= 0) {
      e.slam = rnd(2.6, 3.4); e.squash = 1; addShake(10); Sound.boom(); ring(e.x, e.y + 40, 40, 300, 0.45, '#d59bff', 6);
      const n = 10 + Math.floor(S.wave / 5) * 2, off = rnd(0, 1);
      for (let i = 0; i < n; i++) {
        const a = off + i / n * 6.283;
        S.bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150 });
      }
    }
  }
  e.x += e.kx * dt; e.y += e.ky * dt;
  e.kx *= Math.exp(-6 * dt); e.ky *= Math.exp(-6 * dt);
  const lo = WALL + e.r * 0.8;
  e.x = clamp(e.x, lo, W - lo); e.y = clamp(e.y, lo, H - lo);
  if (def.touch && !e.fused && e.immune <= 0 && d < e.r + CAT_R && p.state !== 'dash' && p.grace <= 0) hurtCat();
}
function update(dt, rdt) {
  const p = S.p;
  S.t += dt;
  if (S.victory) { S.winT -= rdt; if (S.winT <= 0) { win(); return; } }
  S.slowmo = Math.max(0, S.slowmo - rdt);
  const slow = input.held && S.focus > 0 && p.state !== 'dash';
  S.timeScale += ((S.slowmo > 0 ? 0.2 : slow ? SLOW : 1) - S.timeScale) * Math.min(1, rdt * 18);
  S.focus = clamp(S.focus + (slow ? -FOCUS_DRAIN : FOCUS_REGEN) * rdt, 0, 1);
  p.invuln = Math.max(0, p.invuln - dt); p.grace = Math.max(0, p.grace - dt); p.hurtT = Math.max(0, p.hurtT - dt);
  if (S.hintT > 0 && S.firstKill) S.hintT -= rdt;

  if (p.state === 'dash') updateDash(dt);
  else {
    if (p.cd > 0) { p.cd -= dt; if (p.cd <= 0) { p.ready = true; p.cd = 0; } }
    if (p.ready && input.queued) startDash();
    if (input.held) p.face = input.x >= p.x ? 1 : -1;
  }

  // 刷怪
  S.waveT += dt;
  const alive = S.enemies.some(e => !e.dead), pending = S.spawnQ.length || S.spawns.length;
  if (!alive && !pending) { S.gap -= dt; if (S.gap <= 0) { S.gap = 0.9; nextWave(); } }
  else if (!pending && S.waveT > 16 && !S.enemies.some(e => e.type === 'king' && !e.dead)) { nextWave(); }
  if (S.spawnQ.length) {
    S.spawnT -= dt;
    if (S.spawnT <= 0) { S.spawnT = 0.24; queueSpawn(S.spawnQ.shift()); }
  }
  for (const s of S.spawns) {
    s.t -= dt;
    if (s.t <= 0) { const e = spawnEnemy(s.type, s.x, s.y); burst(e.x, e.y, TYPES[s.type].color, 8, 150); }
  }
  S.spawns = S.spawns.filter(s => s.t > 0);

  for (const e of S.enemies) if (!e.dead) updateEnemy(e, dt);
  // 轻微互相推开，免得全叠成一坨看不清。
  const live = S.enemies.filter(e => !e.dead && e.type !== 'king' && e.type !== 'bat');
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, m = (a.r + b.r) * 0.85;
    if (d < m) { const f = (m - d) / d * 0.5 * Math.min(1, dt * 10); a.x -= dx * f; a.y -= dy * f; b.x += dx * f; b.y += dy * f; }
  }
  S.enemies = S.enemies.filter(e => !e.dead);

  for (const b of S.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (Math.hypot(b.x - p.x, b.y - p.y) < CAT_R + 7 && p.state !== 'dash' && p.grace <= 0) { hurtCat(); b.dead = true; }
    if (b.x < WALL || b.x > W - WALL || b.y < WALL || b.y > H - WALL) b.dead = true;
  }
  S.bullets = S.bullets.filter(b => !b.dead);

  for (const k of S.pickups) {
    k.life -= dt; k.t += dt;
    if (Math.hypot(k.x - p.x, k.y - p.y) < 40) {
      k.life = 0; S.lives = Math.min(MAX_LIVES, S.lives + 1); Sound.pickup();
      float(k.x, k.y - 20, '一条鱼 +1', '#8fdcff', 22); burst(k.x, k.y, '#8fdcff', 12);
    }
  }
  S.pickups = S.pickups.filter(k => k.life > 0);
  updateFx(dt, rdt);
}
function updateFx(dt, rdt) {
  for (const a of S.parts) { a.x += a.vx * dt; a.y += a.vy * dt; a.vx *= Math.exp(-3 * dt); a.vy *= Math.exp(-3 * dt); a.life -= dt; }
  S.parts = S.parts.filter(a => a.life > 0);
  for (const r of S.rings) { r.r += r.vr * rdt; r.life -= rdt; }
  S.rings = S.rings.filter(r => r.life > 0);
  for (const s of S.slashes) s.life -= rdt;
  S.slashes = S.slashes.filter(s => s.life > 0);
  for (const f of S.floats) { f.y -= 42 * rdt; f.life -= rdt; }
  S.floats = S.floats.filter(f => f.life > 0);
  for (const g of S.ghosts) g.life -= rdt;
  S.ghosts = S.ghosts.filter(g => g.life > 0);
  if (S.banner) { S.banner.t -= rdt; if (S.banner.t <= 0) S.banner = null; }
  S.shake = Math.max(0, S.shake - 60 * rdt);
}
function win() {
  mode = 'win'; S.overT = 0; input.held = false; input.queued = false;
  S.perfect = S.hits === 0 && S.misses === 0;
  S.newBest = S.score > best;
  if (S.newBest) { best = Math.floor(S.score); store.set('miao-best', best); }
  Sound.stopMusic(); Sound.fanfare();
}
function drawWin() {
  S.overT += 1 / 60;
  ctx.fillStyle = `rgba(6,8,20,${Math.min(0.28, S.overT)})`; ctx.fillRect(0, 0, W, H); // 遮罩要淡，别把烟花压灰。
  sprite(SPR.cat.idle1, W / 2, 128, 4);
  const pop = 1 + Math.max(0, 0.5 - S.overT) * 1.2;
  text(S.perfect ? '完美通关！' : '通关！', W / 2, 232, 76 * pop, `hsl(${S.overT * 120 % 360},100%,72%)`, { sw: 12 });
  text(Math.floor(S.score).toLocaleString(), W / 2, 318, 56, '#fff', { sw: 8 });
  text(`最高连斩 ${S.maxCombo} · 斩杀 ${S.kills} · 掉命 ${S.hits} · 斩空 ${S.misses}`, W / 2, 382, 22, '#cfe0ff');
  if (S.overT > 1 && Math.floor(S.overT * 2) % 2 === 0) text('点一下再来一局', W / 2, 470, 28, '#ffeab0');
}
function gameOver() {
  mode = 'over'; S.overT = 0; input.held = false; input.queued = false;
  S.newBest = S.score > best;
  if (S.newBest) { best = Math.floor(S.score); store.set('miao-best', best); }
  Sound.over(); Sound.stopMusic();
}

// ---------- 绘制 ----------
function sprite(s, x, y, scale, { flipX = false, rot = 0, alpha = 1, white = false, sy = 1 } = {}) {
  const src = white ? s.white : s.im, w = s.im.width * scale, h = s.im.height * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(Math.round(x), Math.round(y));
  if (rot) ctx.rotate(rot);
  ctx.scale(flipX ? -1 : 1, sy);
  ctx.drawImage(src, -w / 2, -h / 2, w, h);
  ctx.restore();
}
function text(str, x, y, size, color = '#fff', { align = 'center', stroke = '#0b1020', sw = 0, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `900 ${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = sw || size * 0.2; ctx.strokeStyle = stroke;
  ctx.strokeText(str, x, y); ctx.fillStyle = color; ctx.fillText(str, x, y);
  ctx.restore();
}
function drawFloor() {
  ctx.fillStyle = floorPattern || '#10231f'; ctx.fillRect(0, 0, W, H);
  if (S && S.fever) { ctx.fillStyle = `rgba(255,120,50,${0.1 + Math.sin(S.t * 14) * 0.03})`; ctx.fillRect(0, 0, W, H); }
  const v = ctx.createRadialGradient(W / 2, H / 2, 180, W / 2, H / 2, 620);
  v.addColorStop(0, 'rgba(6,10,24,0)'); v.addColorStop(1, 'rgba(6,10,24,.72)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  // 院墙
  ctx.fillStyle = '#1a2336'; ctx.fillRect(0, 0, W, WALL); ctx.fillRect(0, H - WALL, W, WALL); ctx.fillRect(0, 0, WALL, H); ctx.fillRect(W - WALL, 0, WALL, H);
  ctx.fillStyle = '#2c3a58'; ctx.fillRect(WALL - 4, WALL - 4, W - 2 * WALL + 8, 4); ctx.fillRect(WALL - 4, H - WALL, W - 2 * WALL + 8, 4); ctx.fillRect(WALL - 4, WALL - 4, 4, H - 2 * WALL + 8); ctx.fillRect(W - WALL, WALL - 4, 4, H - 2 * WALL + 8);
  ctx.fillStyle = 'rgba(255,190,215,.5)';
  for (const q of petals) {
    q.y += q.v / 60; q.x += Math.sin(q.p += 0.015) * 0.5 + q.v / 130;
    if (q.y > H) q.y = -4; if (q.x > W) q.x = -4;
    ctx.fillRect(Math.round(q.x), Math.round(q.y), q.s + 1, q.s);
  }
}
function shadow(x, y, r) {
  ctx.fillStyle = 'rgba(2,6,16,.42)'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.38, 0, 0, 6.3); ctx.fill();
}
function drawEnemy(e, flag) {
  const def = TYPES[e.type], frame = def.frames[Math.floor(e.wob / 2.6) % 2], s = e.type === 'shroom' && e.fused ? SPR.shroom.fuse : SPR[def.spr][frame];
  const size = s.im.width * def.scale, grow = e.spawnT;
  shadow(e.x, e.y + size * 0.4, e.r * 0.95);
  if (e.type === 'shroom' && e.fused) {
    ctx.save(); ctx.strokeStyle = '#ff5a4a'; ctx.fillStyle = 'rgba(255,70,50,.13)'; ctx.setLineDash([9, 7]); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(e.x, e.y, 118, 0, 6.3); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  const flash = e.flash > 0 || e.immune > 0.05 || (e.fused && Math.floor(e.fuse * 18) % 2 === 0);
  const sq = e.type === 'king' ? 1 - e.squash * 0.2 : 1;
  sprite(s, e.x, e.y, def.scale * grow, { flipX: e.face < 0, white: flash, sy: sq });
  if (flag) {
    ctx.strokeStyle = flag === 'block' ? '#ff5a5a' : '#ffe26a'; ctx.lineWidth = 3;
    const r = e.r + 7; ctx.beginPath();
    for (let i = 0; i < 4; i++) ctx.arc(e.x, e.y, r, i * 1.571 + 0.25, i * 1.571 + 1.32), ctx.moveTo(e.x + Math.cos((i + 1) * 1.571 + 0.25) * r, e.y + Math.sin((i + 1) * 1.571 + 0.25) * r);
    ctx.stroke();
  }
  if (e.type === 'turtle' && e.turn > 0) text('!', e.x, e.y - 44, 24, '#ffd24a', { alpha: 0.9 });
}
function drawAim() {
  const p = S.p, t = dashTarget();
  let stop = t.len, blocked = null;
  const flags = new Map();
  const ex = p.x + t.dx * t.len, ey = p.y + t.dy * t.len, order = [];
  for (const e of S.enemies) {
    if (!hittable(e)) continue;
    const u = segCircle(p.x, p.y, ex, ey, e.x, e.y, e.r + CAT_R);
    if (u >= 0) order.push({ e, u });
  }
  order.sort((a, b) => a.u - b.u);
  for (const { e, u } of order) {
    if (shieldBlocks(e, t.dx)) { flags.set(e, 'block'); stop = u * t.len; blocked = e; break; }
    flags.set(e, 'hit');
  }
  const ready = p.ready || p.cd < 0.08, a = input.held ? 0.95 : 0.3;
  ctx.save();
  ctx.setLineDash([10, 8]); ctx.lineDashOffset = -performance.now() / 22; ctx.lineCap = 'round';
  ctx.strokeStyle = blocked ? '#ff6a6a' : ready ? '#bff7ff' : '#7f8cab'; ctx.globalAlpha = a; ctx.lineWidth = input.held ? 4 : 2;
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + t.dx * stop, p.y + t.dy * stop); ctx.stroke();
  ctx.setLineDash([]);
  const ax = p.x + t.dx * stop, ay = p.y + t.dy * stop;
  if (blocked) {
    ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(ax - 8, ay - 8); ctx.lineTo(ax + 8, ay + 8); ctx.moveTo(ax + 8, ay - 8); ctx.lineTo(ax - 8, ay + 8); ctx.stroke();
  } else { ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(ax, ay, 5, 0, 6.3); ctx.fill(); }
  ctx.restore();
  return flags;
}
function drawHUD() {
  if (mode === 'win') return; // 结算页自己显示成绩，HUD 会和大猫叠在一起。
  for (let i = 0; i < S.lives; i++) sprite(SPR.fish.icon, 58 + i * 40, 54, 2.2);
  text(Math.floor(S.score).toLocaleString(), W - 48, 54, 34, '#fff', { align: 'right' });
  text(`最高 ${best.toLocaleString()}`, W - 48, 86, 15, '#9db0d0', { align: 'right' });
  text(`第 ${S.wave} 波`, W / 2, 46, 18, '#9db0d0');
  if (S.combo >= 2) {
    const size = 34 + Math.min(40, S.combo * 1.7);
    text(`${S.combo}`, W / 2, 84, size, S.fever ? `hsl(${S.t * 500 % 360},100%,68%)` : '#fff');
    text(S.fever ? '连斩 · 狂热 ×2' : '连斩', W / 2, 92 + size * 0.62, 16, S.fever ? '#ffd24a' : '#cfe0ff');
  }
  const king = S.enemies.find(e => e.type === 'king');
  if (king) {
    ctx.fillStyle = '#16102a'; ctx.fillRect(W / 2 - 180, H - 68, 360, 12);
    ctx.fillStyle = '#b45cff'; ctx.fillRect(W / 2 - 178, H - 66, 356 * Math.max(0, king.hp / king.maxHp), 8);
    text('史莱姆王', W / 2, H - 82, 15, '#e3c8ff');
  }
  // 专注条
  const bw = 200, bx = W / 2 - bw / 2, by = H - 46;
  ctx.fillStyle = 'rgba(8,12,28,.8)'; ctx.fillRect(bx - 2, by - 2, bw + 4, 10);
  ctx.fillStyle = S.focus > 0.15 ? '#6ff2ff' : '#ff7a7a'; ctx.fillRect(bx, by, bw * S.focus, 6);
  if (S.hintT > 0 && S.hint) text(S.hint, W / 2, H - 112, 24, '#ffeab0', { alpha: Math.min(1, S.hintT * 2) });
}
function drawWorld() {
  drawFloor();
  FX.under(S.fever);
  const p = S.p;
  for (const s of S.spawns) {
    const k = 1 - s.t / 0.62;
    ctx.strokeStyle = TYPES[s.type].color; ctx.lineWidth = 3; ctx.globalAlpha = 0.25 + k * 0.6;
    ctx.beginPath(); ctx.arc(s.x, s.y, (s.type === 'king' ? 80 : 26) * (1.3 - k * 0.3), 0, 6.3); ctx.stroke(); ctx.globalAlpha = 1;
  }
  for (const k of S.pickups) {
    if (k.life < 2 && Math.floor(k.life * 8) % 2) continue;
    sprite(SPR.fish.icon, k.x, k.y + Math.sin(k.t * 5) * 4, 2.4);
  }
  const flags = mode === 'play' && p.state !== 'dash' ? drawAim() : new Map();
  for (const g of S.ghosts) {
    ctx.save();
    if (g.fever) ctx.filter = `hue-rotate(${g.hue}deg) saturate(2)`;
    sprite(SPR.cat.dash, g.x, g.y, 2, { rot: Math.abs(g.a) > 1.57 ? g.a + Math.PI : g.a, flipX: Math.abs(g.a) > 1.57, alpha: g.life * 2.5, white: !g.fever });
    ctx.restore();
  }
  const actors = [...S.enemies.map(e => ({ y: e.y, draw: () => drawEnemy(e, flags.get(e)) })), { y: p.y, draw: drawCat }];
  actors.sort((a, b) => a.y - b.y);
  actors.forEach(a => a.draw());
  ctx.fillStyle = '#d59bff';
  for (const b of S.bullets) { ctx.fillStyle = '#23103d'; ctx.beginPath(); ctx.arc(b.x, b.y, 9, 0, 6.3); ctx.fill(); ctx.fillStyle = '#e4bcff'; ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, 6.3); ctx.fill(); }
  for (const a of S.parts) { ctx.globalAlpha = clamp(a.life / 0.3, 0, 1); ctx.fillStyle = a.color; ctx.fillRect(Math.round(a.x), Math.round(a.y), a.size, a.size); }
  ctx.globalAlpha = 1;
  for (const s of S.slashes) {
    const k = s.life / 0.16, w = 13 * k;
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a); ctx.fillStyle = '#fff'; ctx.beginPath();
    ctx.moveTo(-s.len / 2, 0); ctx.lineTo(0, -w); ctx.lineTo(s.len / 2, 0); ctx.lineTo(0, w); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  for (const r of S.rings) { ctx.globalAlpha = r.life / r.max; ctx.strokeStyle = r.color; ctx.lineWidth = r.w; ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 6.3); ctx.stroke(); }
  ctx.globalAlpha = 1;
  for (const f of S.floats) text(f.text, f.x, f.y, f.size, f.color, { alpha: Math.min(1, f.life * 2.5) });
  FX.over(S.fever);
}
function drawCat() {
  const p = S.p;
  shadow(p.x, p.y + 25, 17);
  if (p.invuln > 0 && p.hurtT <= 0 && Math.floor(performance.now() / 70) % 2) return;
  if (p.state === 'dash') {
    const left = Math.abs(p.ang) > 1.57;
    sprite(SPR.cat.dash, p.x, p.y, 2, { rot: left ? p.ang + Math.PI : p.ang, flipX: left });
    return;
  }
  const f = p.hurtT > 0 ? 'hurt' : Math.floor(performance.now() / 380) % 2 ? 'idle2' : 'idle1';
  sprite(SPR.cat[f], p.x, p.y, 2, { flipX: p.face < 0, white: p.hurtT > 0.35 });
  ctx.lineWidth = 3;
  if (!p.ready && p.cd > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.beginPath(); ctx.arc(p.x, p.y, 34, 0, 6.3); ctx.stroke();
    ctx.strokeStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(p.x, p.y, 34, -1.57, -1.57 + 6.283 * (1 - p.cd / p.cdMax)); ctx.stroke();
  }
}
function drawTitle() {
  drawFloor();
  titleT += 1 / 60;
  const s = SPR;
  sprite(s.cat[Math.floor(titleT * 2.5) % 2 ? 'idle2' : 'idle1'], W / 2, 320, 5);
  const ring3 = [['slime', 'idle1', -300, 40, 3], ['bat', 'flap1', -210, -130, 3], ['shroom', 'idle', 300, 50, 3], ['turtle', 'walk1', 215, -120, 3]];
  ring3.forEach(([k, f, dx, dy, sc], i) => sprite(s[k][f], W / 2 + dx, 320 + dy + Math.sin(titleT * 2 + i) * 6, sc, { flipX: dx > 0 && k === 'turtle' }));
  text('一喵斩', W / 2, 138, 104, '#fff', { sw: 16 });
  text('按住瞄准，松开就斩 · 斩中立刻再斩', W / 2, 432, 26, '#ffeab0');
  text('打败第 10 波的史莱姆王就通关', W / 2, 470, 18, '#cfe0ff');
  if (best) text(`最高分 ${best.toLocaleString()}`, W / 2, 500, 16, '#9db0d0');
  if (Math.floor(titleT * 2) % 2 === 0) text('点一下开始', W / 2, 530, 28, '#6ff2ff');
  const tips = innerHeight > innerWidth ? '把手机横过来更好玩' : `M 静音${Sound.muted ? '（已静音）' : ''} · P 暂停 · 手机也能玩`;
  text(tips, W / 2, H - 38, innerHeight > innerWidth ? 22 : 13, innerHeight > innerWidth ? '#ffeab0' : '#6f81a3', { sw: 3 });
}
function drawOver() {
  S.overT += 1 / 60;
  ctx.fillStyle = `rgba(6,8,20,${Math.min(0.78, S.overT * 2)})`; ctx.fillRect(0, 0, W, H);
  sprite(SPR.cat.hurt, W / 2, 138, 4);
  text(S.newBest ? '新纪录！' : '猫没了', W / 2, 232, 62, S.newBest ? '#ffd24a' : '#fff', { sw: 10 });
  text(Math.floor(S.score).toLocaleString(), W / 2, 310, 54, '#6ff2ff', { sw: 8 });
  text(`最高连斩 ${S.maxCombo} · 斩杀 ${S.kills} · 到达第 ${S.wave} 波`, W / 2, 372, 22, '#cfe0ff');
  text(`最高分 ${best.toLocaleString()}`, W / 2, 408, 18, '#9db0d0');
  if (S.overT > 0.6 && Math.floor(S.overT * 2) % 2 === 0) text('点一下再来一局', W / 2, 480, 30, '#ffeab0');
}
function render() {
  const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const bw = Math.round(r.width * dpr), bh = Math.round(r.height * dpr);
  if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
  const k = Math.min(bw / W, bh / H), ox = (bw - W * k) / 2, oy = (bh - H * k) / 2;
  view.k = k / dpr; view.ox = ox / dpr; view.oy = oy / dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#070b14'; ctx.fillRect(0, 0, bw, bh);
  const sh = S && mode !== 'title' ? S.shake : 0;
  const shx = rnd(-sh, sh) * k * 0.5, shy = rnd(-sh, sh) * k * 0.5, z = mode === 'title' ? 1 : 1 + FX.zoom;
  ctx.setTransform(k * z, 0, 0, k * z, ox + shx + k * FX.fx * (1 - z), oy + shy + k * FX.fy * (1 - z));
  ctx.imageSmoothingEnabled = false;
  if (mode === 'loading') {
    ctx.fillStyle = '#070b14'; ctx.fillRect(0, 0, W, H);
    text(loadError || '加载中…', W / 2, H / 2, loadError ? 22 : 30, loadError ? '#ff8d8d' : '#fff');
    return;
  }
  if (mode === 'title') { drawTitle(); return; }
  drawWorld();
  FX.post(bw, bh, S.fever);
  ctx.setTransform(k, 0, 0, k, ox + shx, oy + shy);
  ctx.imageSmoothingEnabled = false;
  drawHUD();
  if (S.banner) {
    const b = S.banner, k2 = clamp((b.max - b.t) * 7, 0, 1);
    text(b.text, W / 2, H / 2 - 30, 58 + (1 - k2) * 40, '#fff', { alpha: Math.min(1, b.t * 3), sw: 10 });
    if (b.sub) text(b.sub, W / 2, H / 2 + 28, 22, '#ffeab0', { alpha: Math.min(1, b.t * 3) });
  }
  if (mode === 'over') drawOver();
  if (mode === 'win') drawWin();
  if (mode === 'pause') {
    ctx.fillStyle = 'rgba(6,8,20,.65)'; ctx.fillRect(0, 0, W, H);
    text('暂停', W / 2, H / 2 - 16, 64, '#fff', { sw: 10 }); text('点一下继续', W / 2, H / 2 + 46, 24, '#ffeab0');
  }
}
const view = { k: 1, ox: 0, oy: 0 };

// ---------- 循环 ----------
let last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const rdt = Math.min(0.033, (now - last) / 1000 || 0.016);
  last = now;
  if (mode === 'play') {
    if (S.hitstop > 0) { S.hitstop -= rdt; S.shake = Math.max(0, S.shake - 60 * rdt); }
    else update(rdt * S.timeScale, rdt);
  } else if ((mode === 'over' || mode === 'win') && S) { updateFx(rdt * 0.35, rdt); }
  FX.update(rdt, mode === 'win');
  render();
}

// ---------- 输入 ----------
function setAim(ev) {
  input.x = clamp((ev.clientX - view.ox) / view.k, 0, W);
  input.y = clamp((ev.clientY - view.oy) / view.k, 0, H);
}
function press() {
  Sound.init();
  if (mode === 'title' || ((mode === 'over' || mode === 'win') && S.overT > 0.6)) { startRun(); return; }
  if (mode === 'pause') { mode = 'play'; return; }
  if (mode === 'play') input.held = true;
}
function release() {
  if (mode === 'play' && input.held) {
    input.held = false;
    const p = S.p;
    if (p.ready && p.state === 'free') startDash(); else input.queued = true;
  }
  input.held = false;
}
function startRun() {
  newGame(); mode = 'play';
  Sound.startMusic(() => S && S.fever);
}
function pause() { if (mode === 'play') { mode = 'pause'; input.held = false; input.queued = false; } }
canvas.addEventListener('pointerdown', e => { e.preventDefault(); canvas.setPointerCapture?.(e.pointerId); setAim(e); press(); });
window.addEventListener('pointermove', setAim);
window.addEventListener('pointerup', e => { setAim(e); release(); });
window.addEventListener('pointercancel', () => { input.held = false; });
window.addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.code === 'Space') { e.preventDefault(); press(); }
  if (e.code === 'KeyM') Sound.toggleMute();
  if (e.code === 'KeyP' || e.code === 'Escape') { if (mode === 'play') pause(); else if (mode === 'pause') mode = 'play'; }
});
window.addEventListener('keyup', e => { if (e.code === 'Space') release(); });
window.addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
canvas.addEventListener('contextmenu', e => e.preventDefault());

window.__game = { get S() { return S; }, get mode() { return mode; }, input, view };
loadAssets().then(() => { mode = 'title'; }).catch(err => { loadError = err.message; });
requestAnimationFrame(frame);
