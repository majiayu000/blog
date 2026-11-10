'use strict';
// 熄灯帮喽啰：七种，各有各的打法

// 攻击动作：wind 前摇（头顶冒「!」）→ dur 出招 → rec 收招
const ACTS = {
  punch: { wind: 0.38, dur: 0.2, rec: 0.4, anim: 'jab', cd: [1.2, 2.4],
    begin(e) { e.vx = e.face * 90; }, tick(e) { strike(e, { x1: 54, dmg: 6, kb: 80, set: e.hitSet }); } },
  bash: { wind: 0.5, dur: 0.2, rec: 0.5, anim: 'cross', cd: [1.6, 2.8],
    begin(e) { e.vx = e.face * 120; }, tick(e) { strike(e, { x1: 58, dmg: 8, kb: 240, lift: 200, set: e.hitSet }); } },
  counter: { wind: 0.2, dur: 0.2, rec: 0.5, anim: 'cross', cd: [1.2, 2.0],
    begin(e) { e.vx = e.face * 160; }, tick(e) { strike(e, { x1: 62, dmg: 9, kb: 300, lift: 220, set: e.hitSet }); } },
  slam: { wind: 0.85, dur: 0.25, rec: 1.0, windAnim: 'slamUp', anim: 'slamDown', cd: [1.6, 2.6], mark: 86,
    begin(e) { areaHit(e, 'hero', e.x + e.face * 60, e.y, 86, { dmg: 16, kb: 300, lift: 280, type: 'area', ground: true }); ring(e.x + e.face * 60, e.y, 95, '#ffb38a', 0.35); dust(e.x + e.face * 60, e.y, 8); S.shake = Math.max(S.shake, 8); Sound.play('explode'); } },
  rush: { wind: 0.4, dur: 0.55, rec: 0.5, windAnim: 'crouch', anim: 'slide', cd: [1.6, 2.8],
    begin(e) { e.vx = e.face * 480; Sound.play('dash'); }, tick(e) { strike(e, { x1: 40, dmg: 8, kb: 220, lift: 200, set: e.hitSet }); } },
  lob: { wind: 0.5, dur: 0.25, rec: 0.4, windAnim: 'throwUp', anim: 'throw', cd: [2.0, 3.2], sfx: 'throw',
    begin(e) {
      const t = e.target(); if (!t) return;
      const T = 0.85, g = 900, ox = e.x + e.face * 14, tx = clamp(t.x + t.vx * 0.3, S.camX + 20, S.camX + W - 20), ty = t.y;
      mark('circle', tx, ty, 38, T);
      shoot({ owner: e, x: ox, y: e.y, z: 70, vx: (tx - ox) / T, vy: (ty - e.y) / T, vz: (0.5 * g * T * T - 70) / T, g, burst: 38, dmg: 7, kb: 150, kind: 'bottle', r: 8, noDirect: true });
    } },
};

class Enemy extends Fighter {
  constructor(type, x, y, lvl) {
    const d = ENEMIES[type];
    super(d.look || {}, x, y, 'foe');
    this.type = type; this.d = d;
    this.hp = this.maxHp = Math.round(d.hp * (1 + lvl * 0.09) * S.hpMul); this.power = 1 + lvl * 0.06;
    this.speed = d.spd * rand(0.9, 1.1); this.cool = rand(0.5, 1.6); this.side = pick([-1, 1]); this.offY = rand(-55, 55); this.ringT = rand(1, 3);
    if (d.h) this.height = d.h; if (d.r) this.radius = d.r;
    this.downDur = 0.85; this.gBreak = 0; this.blocks = 0; this.fly = !!d.fly; this.shots = 0; this.tired = 0; this.hold = 0;
    if (this.fly) this.z = 125;
  }
  target() { return S.nearest(this); }
  wantToken() { if (S.tokens.has(this)) return true; if (S.tokens.size < S.tokenMax) { S.tokens.add(this); return true; } return false; }
  freeToken() { S.tokens.delete(this); }
  get guardUp() { return !!this.d.shield && this.gBreak <= 0 && this.frozen <= 0 && (this.state === 'idle' || (this.state === 'act' && this.actP === 0)); }
  update(dt) {
    if (this.frozen > 0) { this.frozen -= dt; if (this.flash > 0) this.flash -= dt; this.vx = this.vy = 0; if (!this.fly) this.move(dt); return; }
    if (!this.tickBase(dt)) return;
    if (this.cool > 0) this.cool -= dt;
    if (this.gBreak > 0) this.gBreak -= dt;
    if (!this.hurtUpdate(dt)) { if (this.state === 'act') this.actUpd(dt); else AI[this.d.ai](this, dt); }
    this.move(dt);
    // 被打飞时撞到屏幕边会弹回来
    if (this.state === 'launch') { const l = S.camX + 14, r = S.camX + W - 14; if (this.x < l) { this.x = l; this.vx = Math.abs(this.vx) * 0.5; } else if (this.x > r) { this.x = r; this.vx = -Math.abs(this.vx) * 0.5; } }
    this.updPose(dt);
  }
  startAct(a) {
    this.act = a; this.set('act', a.windAnim || 'windup'); this.vx = this.vy = 0; this.actP = 0; this.hitSet = new Set(); tele(this);
    if (a.mark) mark('circle', this.x + this.face * 60, this.y, a.mark, a.wind);
  }
  actUpd() {
    const a = this.act;
    if (this.actP === 0) {
      if (this.st >= a.wind) { this.actP = 1; this.st = 0; this.setAnim(a.anim, true); Sound.play(a.sfx || 'swing'); if (a.begin) a.begin(this); }
    } else if (this.actP === 1) {
      if (a.tick) a.tick(this);
      if (this.st >= a.dur) { this.actP = 2; this.st = 0; this.vx = 0; this.setAnim('idle'); }
    } else if (this.st >= a.rec) { this.set('idle', 'idle'); this.cool = rand(a.cd[0], a.cd[1]); this.freeToken(); }
  }
  // 大块头：轻攻击打不动，重击/冲刺/跳踢/必杀，或者趁它收招时才行
  armorHolds(h) { return !!this.d.armor && !BREAKERS[h.type] && !(this.state === 'act' && this.actP === 2); }
  // 锅盖兵：正面轻攻击会被挡，连挡三下立刻反击
  guard(a, h, dir) {
    if (!this.guardUp || dir === this.face) return false;
    if (BREAKERS[h.type]) { this.gBreak = 2.6; this.blocks = 0; popText(this.x, this.y, this.height + 30, '破防！', '#ffd23f', 18); Sound.play('break'); return false; }
    this.blocks++; this.stop = 0.06; if (a && h.type !== 'proj' && h.type !== 'area') a.stop = 0.07;
    spark(this.x + this.face * 20, this.y, 50, 4, '#cfe8ff'); popText(this.x, this.y, this.height + 30, '挡', '#cfe8ff', 16); Sound.play('block');
    if (this.blocks >= 3 && this.state === 'idle') { this.blocks = 0; this.startAct(ACTS.counter); }
    return true;
  }
  onHurt(a, h, dir, dmg) {
    this.freeToken();
    const comboed = this.state === 'hurt' || this.state === 'launch';
    this.juggle = comboed ? this.juggle + 1 : 1;
    if (this.fly && (h.lift || this.hp <= 0)) this.fly = false;
    // 连段保护：被连太多下会强制脱身，不能把人按在墙角打到死
    if (this.juggle >= 9 && this.hp > 0 && this.frozen <= 0) { this.juggle = 0; this.inv = 1.3; this.launch(dir, 340, 300); popText(this.x, this.y, this.height + 30, '脱身', '#cfcfe8', 16); return; }
    super.onHurt(a, h, dir, dmg);
  }
  onDie() { this.freeToken(); if (Math.random() < 0.07) dropItem('bun', this.x, this.y); }
  recover() { super.recover(); if (this.d.fly) { this.fly = true; this.z = Math.max(this.z, 1); } }
  landed() {
    super.landed();
    if (this.d.ai === 'bomber' && this.dead) { this.explode(false); this.gone = true; }
    if (this.d.fly && this.dead) { boom(this.x, this.y, 40, '#ffb347'); Sound.play('explode'); this.gone = true; }
  }
  explode(hurtHeroes) {
    if (hurtHeroes) areaHit(this, 'hero', this.x, this.y, 92, { dmg: 18, kb: 320, lift: 300, type: 'area' });
    areaHit(null, 'foe', this.x, this.y, 100, { dmg: 34, kb: 320, lift: 300, type: 'area' });
    boom(this.x, this.y, 90, '#ff7b3a'); ring(this.x, this.y, 100, '#ffd23f', 0.35); S.shake = Math.max(S.shake, 9); Sound.play('explode');
  }
  drawOpts() { const o = super.drawOpts(); o.guard = this.guardUp; return o; }
  draw(c, cam) {
    if (this.d.draw === 'bomb') return drawBomb(c, this, this.x - cam);
    if (this.d.draw === 'drone') return drawDrone(c, this, this.x - cam);
    super.draw(c, cam);
    if (this.frozen > 0 && this.dazed) drawStars(c, this.x - cam, this.y - this.z - this.height - 6);
    if (this.gBreak > 0) drawStars(c, this.x - cam, this.y - this.z - this.height - 6);
  }
}

function drawStars(c, x, y) {
  for (let i = 0; i < 3; i++) { const a = G.t * 6 + i * 2.1; txt(c, '★', x + Math.cos(a) * 16, y + Math.sin(a) * 5, 13, '#ffd23f', 'center', true); }
}
function drawBomb(c, e, sx) {
  const mv = Math.abs(e.vx) + Math.abs(e.vy) > 5, bob = mv ? Math.abs(Math.sin(e.animT * 14)) * 4 : 0, y = e.y - e.z;
  shadow(c, sx, e.y, 15);
  if (e.state === 'dead' && Math.floor(e.st * 18) % 2) return;
  const hot = e.fuse != null && Math.floor(e.fuse * 14) % 2;
  c.save(); c.translate(sx, y); c.lineWidth = 2.5; c.strokeStyle = INK;
  c.fillStyle = INK; c.beginPath(); c.ellipse(-7, -2 - (mv ? Math.sin(e.animT * 14) * 3 : 0), 5, 3.5, 0, 0, TAU); c.ellipse(7, -2 + (mv ? Math.sin(e.animT * 14) * 3 : 0), 5, 3.5, 0, 0, TAU); c.fill();
  c.beginPath(); c.arc(0, -20 - bob, 16 * (hot ? 1.1 : 1), 0, TAU); c.fillStyle = e.flash > 0 ? '#fff' : e.frozen > 0 ? ICE_C : hot ? '#ff5340' : '#2c2a3a'; c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.3)'; c.beginPath(); c.arc(-6, -27 - bob, 4, 0, TAU); c.fill();
  c.scale(e.face, 1); c.fillStyle = '#ffe066'; c.beginPath(); c.ellipse(3, -21 - bob, 2.2, 3.4, 0, 0, TAU); c.fill(); c.beginPath(); c.ellipse(10, -21 - bob, 2.2, 3.4, 0, 0, TAU); c.fill();
  c.beginPath(); c.moveTo(-2, -36 - bob); c.quadraticCurveTo(-8, -46 - bob, -2, -50 - bob); c.lineWidth = 2.5; c.strokeStyle = '#c9a27a'; c.stroke();
  c.fillStyle = pick(['#ffd23f', '#ff7b3a', '#fff']); c.beginPath(); c.arc(-2, -51 - bob, e.fuse != null ? 5 : 3, 0, TAU); c.fill();
  c.restore();
}
function drawDrone(c, e, sx) {
  shadow(c, sx, e.y, 14 * (1 - Math.min(e.z, 160) / 320));
  if (e.state === 'dead' && Math.floor(e.st * 18) % 2) return;
  const y = e.y - e.z - 16 + Math.sin(G.t * 6 + e.offY) * 2.5, tilt = clamp(e.vx / 400, -0.3, 0.3) + (e.state === 'launch' || e.state === 'down' ? 0.9 : 0);
  c.save(); c.translate(sx, y); c.rotate(tilt); c.lineWidth = 2.4; c.strokeStyle = INK;
  const sp = e.tired > 0 || e.frozen > 0 ? 0.25 : 1, rw = 13 * Math.abs(Math.sin(G.t * 50 * sp)) + 4;
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 16, -8); c.lineTo(s * 16, -14); c.stroke(); c.beginPath(); c.ellipse(s * 16, -15, rw, 2.5, 0, 0, TAU); c.fillStyle = 'rgba(220,230,240,.7)'; c.fill(); }
  rrect(c, -17, -9, 34, 18, 6); c.fillStyle = e.flash > 0 ? '#fff' : e.frozen > 0 ? ICE_C : '#59646e'; c.fill(); c.stroke();
  c.beginPath(); c.arc(e.face * 5, 1, 5.5, 0, TAU); c.fillStyle = e.hold > 0 ? '#fff' : '#ff3b3b'; c.fill(); c.stroke();
  c.fillStyle = '#ffcf40'; c.fillRect(-13, -6, 6, 3);
  c.restore();
}

// ---------- AI ----------
function circleAround(e, t, dist, dt) {
  e.ringT -= dt; if (e.ringT <= 0) { e.ringT = rand(1.5, 3.5); e.offY = rand(-60, 60); if (Math.random() < 0.3) e.side = -e.side; }
  let tx = t.x + e.side * dist; if (tx < S.camX + 30 || tx > S.camX + W - 30) { e.side = -e.side; tx = t.x + e.side * dist; }
  e.goto(clamp(tx, S.camX + 30, S.camX + W - 30), clampY(t.y + e.offY), e.speed * 0.7);
}
function walkAnim(e) { e.setAnim(Math.abs(e.vx) + Math.abs(e.vy) > 8 ? 'walk' : e.guardUp ? 'guard' : 'idle'); }

const AI = {
  grunt(e, dt) {
    const t = e.target(); if (!t) { e.vx = e.vy = 0; e.setAnim('idle'); return; }
    const dx = t.x - e.x; e.face = sgn(dx);
    if (e.cool <= 0 && e.wantToken()) {
      const side = sgn(e.x - t.x);
      e.goto(t.x + side * (e.d.range - 8), t.y, e.speed);
      if (Math.abs(dx) < e.d.range + 6 && Math.abs(t.y - e.y) < 12) e.startAct(ACTS[e.d.atk]);
    } else circleAround(e, t, 150, dt);
    if (e.state === 'idle') walkAnim(e);
  },
  runner(e, dt) {
    const t = e.target(); if (!t) { e.vx = e.vy = 0; e.setAnim('idle'); return; }
    const dx = t.x - e.x; e.face = sgn(dx);
    if (e.cool <= 0 && e.wantToken()) {
      let side = sgn(e.x - t.x), px = t.x + side * 240;
      if (px < S.camX + 30 || px > S.camX + W - 30) { side = -side; px = t.x + side * 240; }
      e.goto(clamp(px, S.camX + 30, S.camX + W - 30), t.y, e.speed);
      if (Math.abs(t.y - e.y) < 12 && Math.abs(dx) > 120 && Math.abs(dx) < 340) e.startAct(ACTS.rush);
    } else circleAround(e, t, 230, dt);
    if (e.state === 'idle') walkAnim(e);
  },
  thrower(e, dt) {
    const t = e.target(); if (!t) { e.vx = e.vy = 0; e.setAnim('idle'); return; }
    const dx = t.x - e.x, ad = Math.abs(dx); e.face = sgn(dx);
    let tx = e.x; if (ad < 190) tx = e.x - sgn(dx) * 90; else if (ad > 390) tx = e.x + sgn(dx) * 90;
    e.goto(clamp(tx, S.camX + 40, S.camX + W - 40), clampY(t.y + e.offY * 0.4), e.speed);
    const onScr = e.x > S.camX + 10 && e.x < S.camX + W - 10;
    if (e.cool <= 0 && onScr && ad > 140 && ad < 470) e.startAct(ACTS.lob);
    if (e.state === 'idle') walkAnim(e);
  },
  bomber(e, dt) {
    const t = e.target(); if (!t) { e.vx = e.vy = 0; return; }
    e.face = sgn(t.x - e.x);
    const d = Math.hypot(t.x - e.x, (t.y - e.y) * 2);
    if (e.fuse == null && d < 78) { e.fuse = 1.1; tele(e); }
    if (e.fuse != null) {
      e.fuse -= dt; if (Math.random() < 0.3) Sound.play('fuse');
      e.goto(t.x, t.y, 45);
      if (e.fuse <= 0) { e.explode(true); e.dead = true; e.gone = true; }
    } else e.goto(t.x, t.y, e.speed);
  },
  drone(e, dt) {
    const t = e.target(); e.setAnim('idle');
    if (e.tired > 0) { e.tired -= dt; e.z += (34 - e.z) * Math.min(1, dt * 4); e.vx = e.vy = 0; if (e.tired <= 0) e.shots = 0; return; }
    e.z += (125 - e.z) * Math.min(1, dt * 3);
    if (e.hold > 0) {
      e.hold -= dt; e.vx = e.vy = 0;
      if (e.hold <= 0) { shoot({ owner: e, x: e.x, y: e.y, z: e.z - 12, vz: -520, burst: 38, dmg: 9, kb: 150, lift: 200, kind: 'bolt', r: 8, noDirect: true }); Sound.play('throw'); if (++e.shots >= 2) e.tired = 2.8; e.cool = 1.3; }
      return;
    }
    if (!t) { e.vx = e.vy = 0; return; }
    e.face = sgn(t.x - e.x); e.goto(t.x, t.y, e.speed);
    if (e.cool <= 0 && Math.abs(t.x - e.x) < 28 && Math.abs(t.y - e.y) < 16) { e.hold = 0.6; mark('circle', e.x, e.y, 38, 0.6 + (e.z - 12) / 520); tele(e); }
  },
};
