'use strict';
// 战斗基础：Fighter 基类、命中判定、飞行物、道具、特效

let S = null; // 当前关卡

class Fighter {
  constructor(look, x, y, team) {
    this.look = look; this.x = x; this.y = y; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0;
    this.face = 1; this.team = team; this.hp = this.maxHp = 100; this.power = 1;
    this.state = 'idle'; this.st = 0; this.anim = 'idle'; this.animT = 0; this.pose = samplePose('idle', 0).slice();
    this.inv = 0; this.flash = 0; this.stop = 0; this.frozen = 0; this.rot = 0; this.juggle = 0;
    this.radius = 16; this.height = rigHeight(look); // 身高按骨架算，单位是屏幕像素
    this.dead = false; this.gone = false; this.hidden = false; this.hurtDur = 0.3; this.downDur = 0.7; this.poseRate = 28;
  }
  set(state, anim) { this.state = state; this.st = 0; if (anim) this.setAnim(anim, true); }
  setAnim(a, restart) { if (this.anim !== a || restart) { this.anim = a; this.animT = 0; } }
  get grounded() { return this.z <= 0; }
  tickBase(dt) {
    if (this.flash > 0) this.flash -= dt;
    if (this.stop > 0) { this.stop -= dt; return false; }
    if (this.inv > 0) this.inv -= dt;
    this.st += dt; this.animT += dt; return true;
  }
  move(dt) {
    this.x += this.vx * dt; this.y = clampY(this.y + this.vy * dt);
    if (!this.fly && (this.z > 0 || this.vz > 0)) {
      this.vz -= GRAV * dt; this.z += this.vz * dt;
      if (this.z <= 0) { this.z = 0; this.vz = 0; this.landed(); }
    }
  }
  goto(tx, ty, sp) {
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
    if (d < 5) { this.vx = this.vy = 0; return true; }
    this.vx = dx / d * sp; this.vy = dy / d * sp * 0.8; return false;
  }
  updPose(dt) {
    const tg = samplePose(this.anim, this.animT), k = 1 - Math.exp(-dt * this.poseRate);
    for (let i = 0; i < 11; i++) this.pose[i] += (tg[i] - this.pose[i]) * k;
  }
  recover() { this.set('idle', 'idle'); this.rot = 0; this.juggle = 0; }
  landed() {
    if (this.state === 'launch') { this.set('down', 'hurt'); this.rot = -1.5; dust(this.x, this.y, 5); Sound.play('land'); }
  }
  // 受击后的通用状态：硬直 / 击飞 / 倒地 / 起身 / 消失
  hurtUpdate(dt) {
    const s = this.state;
    if (s === 'hurt') { this.vx *= Math.pow(0.002, dt); this.vy = 0; if (this.st > this.hurtDur) this.recover(); return true; }
    if (s === 'launch') { this.rot = -Math.min(1, this.st * 5) * 1.5; return true; }
    if (s === 'down') {
      this.vx *= Math.pow(0.0005, dt); this.vy = 0;
      if (this.st > this.downDur) { if (this.hp <= 0) this.set('dead'); else { this.set('getup', 'getup'); this.rot = 0; this.inv = Math.max(this.inv, 0.45); } }
      return true;
    }
    if (s === 'getup') { this.vx = this.vy = 0; if (this.st > 0.3) this.recover(); return true; }
    if (s === 'dead') { this.vx = this.vy = 0; if (this.st > 0.8) this.gone = true; return true; }
    return false;
  }
  launch(dir, kb, lift) { this.set('launch', 'hurt'); this.vx = dir * kb; this.vy = 0; this.vz = lift; this.z = Math.max(this.z, 1); this.face = -dir; }
  armorHolds() { return false; }
  onHurt(a, h, dir) {
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.launch(dir, Math.max(h.kb || 0, 220), Math.max(h.lift || 0, 280)); if (this.onDie) this.onDie(a); return; }
    if (this.frozen > 0) return;
    if (this.armorHolds(h)) return;
    if (h.lift || this.z > 0) this.launch(dir, h.kb || 150, h.lift || 220);
    else { this.set('hurt', 'hurt'); this.hurtDur = h.stunT || 0.32; this.vx = dir * (h.kb || 60) * 2.2; this.face = -dir; }
  }
  drawOpts() {
    return { flash: this.flash > 0, ice: this.frozen > 0 ? (this.dazed ? DAZE_C : ICE_C) : null, rot: this.rot,
      air: !!(ANIMS[this.anim] && ANIMS[this.anim].air) || this.state === 'launch', t: G.t,
      expr: (this.state === 'hurt' || this.state === 'launch' || this.state === 'down') ? 'hurt' : null };
  }
  draw(c, cam) {
    if (this.hidden) return;
    const sx = this.x - cam;
    shadow(c, sx, this.y, this.radius * 1.35 * (1 - Math.min(this.z, 240) / 420));
    if (this.state === 'dead' && Math.floor(this.st * 18) % 2) return;
    drawRig(c, this.look, this.pose, sx, this.y - this.z, this.face, this.drawOpts());
  }
}

// ---------- 命中判定 ----------
const BREAKERS = { heavy: 1, dash: 1, air: 1, special: 1 };

function applyHit(a, t, h, dir) {
  if (t.inv > 0 || t.dead || t.hidden) return false;
  if (t.guard && t.guard(a, h, dir)) return false;
  let dmg = h.dmg * (a ? a.power : 1) * (t.frozen > 0 ? 1.4 : 1) * (t.dizzy > 0 ? 1.35 : 1);
  if (a && a.buff > 0) dmg *= 1.6;
  dmg = Math.max(1, Math.round(dmg));
  t.hp -= dmg; t.flash = 0.09;
  const hs = h.lift ? 0.085 : 0.05;
  // 头目不吃顿帧：多人围殴时顿帧会连成一片，把它的计时整个冻住
  if (!t.isBoss) t.stop = hs;
  if (a && h.type !== 'proj' && h.type !== 'area') a.stop = Math.max(a.stop, hs * 0.8);
  spark(t.x - dir * 6, t.y + 1, t.z + t.height * 0.6, h.lift ? 9 : 5, t.team === 'hero' ? '#ff8f6b' : '#ffe9a8');
  if (t.team === 'foe') popText(t.x + rand(-8, 8), t.y, t.z + t.height + 8, String(dmg), h.lift ? '#ffd23f' : '#ffffff', h.lift ? 21 : 15);
  Sound.play(h.lift ? 'heavy' : 'hit');
  if (h.lift) S.shake = Math.max(S.shake, 5);
  if (h.freeze) { t.frozen = h.freeze * (t.isBoss ? 0.45 : 1); t.dazed = !!h.daze; }
  if (a && a.onDealt) a.onDealt(t, dmg, h);
  t.onHurt(a, h, dir, dmg);
  return true;
}

// 近战：以攻击者为原点、朝向 face 的一个长方体
function strike(a, h) {
  let n = 0;
  const z0 = a.z + (h.z0 || 0), z1 = a.z + (h.z1 == null ? 75 : h.z1), dyTol = h.dy || 22;
  for (const t of S.ents) {
    if (t.team === a.team || t.team === 'npc' || t.dead || t.hidden || (h.set && h.set.has(t))) continue;
    const dx = (t.x - a.x) * a.face;
    if (dx < (h.x0 || 0) - t.radius || dx > h.x1 + t.radius) continue;
    if (Math.abs(t.y - a.y) > dyTol + (t.deep || 0)) continue;
    if (t.z + t.height < z0 || t.z > z1) continue;
    if (h.set) h.set.add(t);
    if (applyHit(a, t, h, a.face)) n++;
  }
  if (a.team === 'hero' && a.z < 50) for (const p of S.props) {
    if (p.broken || (h.set && h.set.has(p))) continue;
    const dx = (p.x - a.x) * a.face;
    if (dx < -22 || dx > h.x1 + 22 || Math.abs(p.y - a.y) > dyTol + 8) continue;
    if (h.set) h.set.add(p);
    S.breakProp(p); n++;
  }
  return n;
}

// 范围：地面上的一个椭圆
function areaHit(a, team, x, y, r, h) {
  let n = 0;
  for (const t of S.ents) {
    if (t.team !== team || t.dead || t.hidden || (h.set && h.set.has(t))) continue;
    if (h.ground && t.z > 34) continue;
    const dx = (t.x - x) / (r + t.radius), dy = (t.y - y) / (r * 0.5 + 8);
    if (dx * dx + dy * dy > 1) continue;
    if (h.set) h.set.add(t);
    if (applyHit(a, t, h, sgn(t.x - x))) n++;
  }
  if (team === 'foe') for (const p of S.props) { if (!p.broken && Math.abs(p.x - x) < r && Math.abs(p.y - y) < r * 0.5) { S.breakProp(p); n++; } }
  return n;
}

// ---------- 飞行物 ----------
function shoot(o) {
  const p = Object.assign({ x: 0, y: 0, z: 40, vx: 0, vy: 0, vz: 0, g: 0, team: 'foe', dmg: 8, r: 10, life: 3, kind: 'orb', t: 0, kb: 140 }, o);
  S.projs.push(p); return p;
}
function updProjs(dt) {
  for (const p of S.projs) {
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.g) p.vz -= p.g * dt; p.z += p.vz * dt;
    const tgt = p.team === 'foe' ? 'hero' : 'foe';
    if (p.t > p.life || p.y < GROUND_TOP - 24 || p.y > GROUND_BOT + 24) { p.gone = true; continue; }
    if (p.z <= 0 && (p.g || p.vz < 0)) {
      p.gone = true;
      if (p.burst) { areaHit(p.owner, tgt, p.x, p.y, p.burst, { dmg: p.dmg, kb: p.kb, lift: p.lift, type: 'area', ground: !p.tall }); boom(p.x, p.y, p.burst * 0.8, p.color); Sound.play(p.burst > 50 ? 'explode' : 'hit'); }
      else dust(p.x, p.y, 3);
      continue;
    }
    if (p.noDirect) continue;
    for (const t of S.ents) {
      if (t.team !== tgt || t.dead || t.hidden || (p.set && p.set.has(t))) continue;
      if (Math.abs(t.x - p.x) > p.r + t.radius || Math.abs(t.y - p.y) > 15 + (t.deep || 0) || p.z < t.z - 8 || p.z > t.z + t.height + 8) continue;
      if (p.pierce) (p.set || (p.set = new Set())).add(t);
      const hit = applyHit(p.owner, t, { dmg: p.dmg, kb: p.kb, lift: p.lift, type: 'proj', freeze: p.freeze }, sgn(p.vx || 1));
      if (!p.pierce && (hit || t.guard)) { p.gone = true; break; }
    }
  }
  S.projs = S.projs.filter(p => !p.gone);
}
const SHOT_C = { orb: '#ff8a65', note: '#c79bff', can: '#7be08a', fire: '#ff7b3a', bolt: '#ffe066', card: '#ffffff', ice: '#9fe3ff', dark: '#b06bff', marble: '#6ec6ff', pearl: '#5a3a2a', bottle: '#8be28b', nut: '#cfd8dc' };
function drawProj(c, p, cam) {
  const sx = p.x - cam, sy = p.y - p.z, col = p.color || SHOT_C[p.kind] || '#fff';
  shadow(c, sx, p.y, p.r * 0.9);
  c.save(); c.translate(sx, sy);
  if (p.kind === 'card' || p.kind === 'bottle' || p.kind === 'can' || p.kind === 'nut') {
    c.rotate(p.t * 14); rrect(c, -p.r * 0.6, -p.r, p.r * 1.2, p.r * 2, 2);
    c.fillStyle = col; c.fill(); c.lineWidth = 2; c.strokeStyle = INK; c.stroke();
  } else if (p.kind === 'note') {
    c.fillStyle = col; c.strokeStyle = INK; c.lineWidth = 2;
    c.beginPath(); c.ellipse(-2, 4, 7, 5.5, -0.4, 0, TAU); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(4, 3); c.lineTo(4, -13); c.lineTo(11, -9); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
  } else {
    const g = c.createRadialGradient(0, 0, 1, 0, 0, p.r * 2); g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.beginPath(); c.arc(0, 0, p.r * 2, 0, TAU); c.fill();
    c.globalCompositeOperation = 'source-over';
    c.beginPath(); c.arc(0, 0, p.r * 0.75, 0, TAU); c.fillStyle = col; c.fill(); c.lineWidth = 2; c.strokeStyle = INK; c.stroke();
    c.beginPath(); c.arc(-p.r * 0.2, -p.r * 0.2, p.r * 0.28, 0, TAU); c.fillStyle = 'rgba(255,255,255,.8)'; c.fill();
  }
  c.restore();
}

// ---------- 道具 ----------
const ITEM = {
  bun: { name: '肉包 +30', c: '#fff4e0' }, feast: { name: '大蒸笼 回满', c: '#ffd9a0' },
  star: { name: '必杀 +50', c: '#ffd23f' }, chili: { name: '辣椒！火力全开', c: '#ff4d3d' },
};
function dropItem(kind, x, y) { S.items.push({ kind, x, y: clampY(y), z: 10, vz: 300, t: 0 }); }
function updItems(dt) {
  for (const it of S.items) {
    it.t += dt;
    if (it.z > 0 || it.vz > 0) { it.vz -= GRAV * dt; it.z += it.vz * dt; if (it.z <= 0) { it.z = 0; it.vz = 0; } }
    if (it.t < 0.4) continue;
    for (const p of S.players) {
      if (p.out || p.dead || p.z > 20 || Math.abs(p.x - it.x) > 30 || Math.abs(p.y - it.y) > 20) continue;
      if ((it.kind === 'bun' || it.kind === 'feast') && p.hp >= p.maxHp) continue;
      if (it.kind === 'bun') p.hp = Math.min(p.maxHp, p.hp + 30);
      else if (it.kind === 'feast') p.hp = p.maxHp;
      else if (it.kind === 'star') p.meter = Math.min(100, p.meter + 50);
      else if (it.kind === 'chili') p.buff = 10;
      popText(it.x, it.y, 60, ITEM[it.kind].name, ITEM[it.kind].c, 16);
      Sound.play(it.kind === 'chili' ? 'power' : it.kind === 'star' ? 'pick' : 'heal');
      spark(it.x, it.y, 20, 8, ITEM[it.kind].c); it.gone = true; break;
    }
  }
  S.items = S.items.filter(i => !i.gone);
}
function drawItem(c, it, cam) {
  const sx = it.x - cam, sy = it.y - it.z - 12 - Math.sin(it.t * 4) * 3;
  shadow(c, sx, it.y, 11);
  c.save(); c.translate(sx, sy); c.lineWidth = 2.2; c.strokeStyle = INK; c.lineJoin = 'round';
  if (it.kind === 'bun' || it.kind === 'feast') {
    const k = it.kind === 'feast' ? 1.35 : 1;
    c.beginPath(); c.arc(0, 2, 11 * k, Math.PI, TAU); c.lineTo(11 * k, 6); c.lineTo(-11 * k, 6); c.closePath(); c.fillStyle = '#fff4e0'; c.fill(); c.stroke();
    c.beginPath(); for (let i = -1; i <= 1; i++) { c.moveTo(i * 4 * k, -7 * k); c.lineTo(i * 2 * k, -2 * k); } c.lineWidth = 1.4; c.stroke();
    if (it.kind === 'feast') { c.fillStyle = '#c98d5a'; c.fillRect(-16, 6, 32, 5); c.strokeRect(-16, 6, 32, 5); }
  } else if (it.kind === 'star') {
    c.rotate(Math.sin(it.t * 3) * 0.3); c.beginPath();
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 5.5 : 12; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.closePath(); c.fillStyle = '#ffd23f'; c.fill(); c.stroke();
  } else {
    c.rotate(-0.5); c.beginPath(); c.moveTo(-10, -3); c.quadraticCurveTo(0, -9, 11, 2); c.quadraticCurveTo(0, 5, -10, 3); c.closePath(); c.fillStyle = '#ff4d3d'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-10, 0); c.lineTo(-15, -4); c.lineWidth = 3; c.strokeStyle = '#3fa66b'; c.stroke();
  }
  c.restore();
}
function drawProp(c, p, cam) {
  const sx = p.x - cam + (p.hitT > 0 ? Math.sin(p.hitT * 60) * 3 : 0);
  shadow(c, sx, p.y, 22);
  c.save(); c.translate(sx, p.y); c.lineWidth = 2.4; c.strokeStyle = INK; c.lineJoin = 'round';
  if (p.kind === 'barrel') {
    rrect(c, -15, -40, 30, 40, 7); c.fillStyle = '#a8553d'; c.fill(); c.stroke();
    c.fillStyle = '#6d7a86'; c.fillRect(-15, -32, 30, 4); c.fillRect(-15, -14, 30, 4);
  } else {
    rrect(c, -20, -36, 40, 36, 3); c.fillStyle = '#c89b6a'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-20, -36); c.lineTo(20, 0); c.moveTo(20, -36); c.lineTo(-20, 0); c.lineWidth = 3; c.strokeStyle = '#8d6a44'; c.stroke();
    c.lineWidth = 2.4; c.strokeStyle = INK; rrect(c, -20, -36, 40, 36, 3); c.stroke();
  }
  c.restore();
}

// ---------- 特效 ----------
function fx(kind, x, y, z, o) { const f = Object.assign({ kind, x, y, z, t: 0, life: 0.4, vx: 0, vy: 0, vz: 0, g: 0, size: 4, color: '#fff' }, o); S.fx.push(f); return f; }
function spark(x, y, z, n, color) { for (let i = 0; i < n; i++) { const a = rand(TAU), sp = rand(80, 320); fx('p', x, y, z, { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, life: rand(0.15, 0.32), size: rand(2.5, 5), color }); } }
function dust(x, y, n) { for (let i = 0; i < n; i++) fx('smoke', x + rand(-14, 14), y, rand(2, 8), { vx: rand(-60, 60), vz: rand(10, 50), life: rand(0.25, 0.5), size: rand(5, 10), color: 'rgba(240,225,210,.6)' }); }
function smoke(x, y, z, n, color) { for (let i = 0; i < n; i++) fx('smoke', x + rand(-20, 20), y, z + rand(-20, 40), { vx: rand(-50, 50), vz: rand(20, 90), life: rand(0.4, 0.8), size: rand(10, 20), color: color || 'rgba(230,230,240,.7)' }); }
function ring(x, y, r, color, life) { fx('ring', x, y, 0, { size: r, color: color || '#fff', life: life || 0.4 }); }
function boom(x, y, r, color) { fx('boom', x, y, 10, { size: r, life: 0.35, color: color || '#ffb347' }); spark(x, y, 16, 8, color || '#ffd23f'); }
function popText(x, y, z, str, color, size) { fx('text', x, y, z, { str, color, size: size || 16, vz: 70, life: 0.7 }); }
function tele(e) { fx('text', e.x, e.y, e.z + e.height + 18, { str: '!', color: '#ff3b3b', size: 30, vz: 20, life: 0.42 }); Sound.play('tele'); }
function mark(kind, x, y, r, dur) { const m = { kind, x, y, r, t: 0, dur }; S.marks.push(m); return m; }

function updFx(dt) {
  for (const f of S.fx) { f.t += dt; f.x += f.vx * dt; f.y += f.vy * dt; if (f.g) f.vz -= f.g * dt; f.z += f.vz * dt; }
  S.fx = S.fx.filter(f => f.t < f.life);
  for (const m of S.marks) m.t += dt;
  S.marks = S.marks.filter(m => m.t < m.dur);
}
function drawMarks(c, cam) {
  for (const m of S.marks) {
    const k = m.t / m.dur, pulse = 0.5 + 0.5 * Math.sin(m.t * 22);
    if (m.kind === 'circle') {
      const sx = m.x - cam;
      c.beginPath(); c.ellipse(sx, m.y, m.r, m.r * 0.45, 0, 0, TAU); c.fillStyle = `rgba(255,50,50,${0.12 + pulse * 0.12})`; c.fill();
      c.lineWidth = 2.5; c.strokeStyle = 'rgba(255,70,70,.9)'; c.stroke();
      c.beginPath(); c.ellipse(sx, m.y, m.r * k, m.r * 0.45 * k, 0, 0, TAU); c.fillStyle = 'rgba(255,70,70,.3)'; c.fill();
    } else {
      c.fillStyle = `rgba(255,50,50,${0.14 + pulse * 0.14})`; c.fillRect(0, m.y - m.r, W, m.r * 2);
      c.fillStyle = 'rgba(255,90,90,.85)'; c.fillRect(0, m.y - m.r, W, 2); c.fillRect(0, m.y + m.r - 2, W, 2);
      c.fillStyle = 'rgba(255,90,90,.35)'; c.fillRect(0, m.y - m.r * k, W, m.r * 2 * k);
    }
  }
}
function drawFx(c, cam) {
  for (const f of S.fx) {
    const k = f.t / f.life, sx = f.x - cam, sy = f.y - f.z;
    switch (f.kind) {
      case 'p': c.fillStyle = f.color; c.globalAlpha = 1 - k; c.beginPath(); c.arc(sx, sy, f.size * (1 - k * 0.6), 0, TAU); c.fill(); break;
      case 'smoke': c.fillStyle = f.color; c.globalAlpha = (1 - k) * 0.8; c.beginPath(); c.arc(sx, sy, f.size * (0.6 + k), 0, TAU); c.fill(); break;
      case 'ring': c.strokeStyle = f.color; c.globalAlpha = 1 - k; c.lineWidth = 6 * (1 - k) + 1; c.beginPath(); c.ellipse(sx, sy, f.size * ease(k), f.size * 0.45 * ease(k), 0, 0, TAU); c.stroke(); break;
      case 'boom': { const r = f.size * (0.4 + 0.6 * ease(k)); c.globalAlpha = 1 - k; c.fillStyle = f.color; c.beginPath(); c.arc(sx, sy - r * 0.3, r, 0, TAU); c.fill(); c.fillStyle = '#fff6d0'; c.beginPath(); c.arc(sx, sy - r * 0.3, r * 0.55 * (1 - k), 0, TAU); c.fill(); break; }
      case 'text': c.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1; txt(c, f.str, sx, sy, f.size * (k < 0.15 ? 0.6 + k / 0.15 * 0.5 : 1.1 - Math.min(0.1, (k - 0.15))), f.color, 'center', true); break;
      case 'beam': { const a = 1 - k; c.globalAlpha = a; c.fillStyle = f.color; c.fillRect(0, f.y - f.size, W, f.size * 2); c.fillStyle = '#fff'; c.fillRect(0, f.y - f.size * 0.35, W, f.size * 0.7); break; }
      case 'bolt': { c.globalAlpha = 1 - k; c.strokeStyle = f.color; c.lineWidth = 4; c.beginPath(); c.moveTo(sx, sy); const n = 5; for (let i = 1; i <= n; i++) c.lineTo(lerp(f.x, f.x2, i / n) - cam + (i < n ? Math.sin(i * 7 + f.x) * 12 : 0), lerp(sy, f.y2, i / n) + (i < n ? Math.cos(i * 5 + f.y) * 10 : 0)); c.stroke(); break; }
      case 'ghost': c.globalAlpha = (1 - k) * 0.5; drawRig(c, f.look, f.pose, sx, sy, f.face, { sil: f.color }); break;
      case 'flash': c.globalAlpha = (1 - k) * (f.a || 0.5); c.fillStyle = f.color; c.fillRect(-20, -20, W + 40, H + 40); break;
    }
    c.globalAlpha = 1;
  }
}
