'use strict';
// 玩家角色：操作状态机 + 十种必杀

const ATK = {
  l1: { anim: 'jab', dur: 0.25, a0: 0.06, a1: 0.14, step: 60, hit: { dmg: 8, kb: 55 } },
  l2: { anim: 'cross', dur: 0.25, a0: 0.06, a1: 0.14, step: 70, hit: { dmg: 9, kb: 70 } },
  l3: { anim: 'kick', dur: 0.4, a0: 0.1, a1: 0.2, step: 90, hit: { dmg: 15, kb: 250, lift: 250 } },
  heavy: { anim: 'smash', dur: 0.55, a0: 0.2, a1: 0.3, step: 50, ext: 14, hit: { dmg: 24, kb: 280, lift: 320, type: 'heavy' } },
  dashAtk: { anim: 'slide', dur: 0.34, a0: 0.03, a1: 0.24, step: 400, ext: 4, hit: { dmg: 16, kb: 300, lift: 230, type: 'dash' } },
};
const BUFB = ['atk', 'heavy', 'jump', 'dash', 'special'];

class Player extends Fighter {
  constructor(hero, idx, dev) {
    super(hero.look, 0, 0, 'hero');
    this.hero = hero; this.idx = idx; this.dev = dev; this.color = PCOL[idx];
    this.hp = this.maxHp = hero.hp; this.power = hero.pow; this.speed = hero.spd; this.reach = hero.reach;
    this.meter = 0; this.lives = 2; this.combo = 0; this.comboT = 0; this.buf = {}; this.dashCd = 0; this.buff = 0;
    this.out = false; this.spLock = 0; this.poseRate = 36; this.downDur = 0.6;
  }
  take(b) { if (this.buf[b] > 0) { this.buf[b] = 0; return true; } return false; }
  update(dt) {
    if (this.out) return;
    const I = Input.get(this.dev);
    for (const b of BUFB) { if (I[b]) this.buf[b] = 0.16; else if (this.buf[b] > 0) this.buf[b] -= dt; }
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.spLock > 0) this.spLock -= dt;
    if (this.buff > 0) { this.buff -= dt; if (Math.random() < 0.4) fx('p', this.x + rand(-12, 12), this.y, this.z + rand(10, 70), { vz: rand(60, 140), life: 0.35, size: rand(3, 6), color: pick(['#ff7b3a', '#ffd23f', '#ff4d3d']) }); }
    if (!this.tickBase(dt)) return;
    if (!this.hurtUpdate(dt)) this.control(dt, I);
    if (this.gone) { this.gone = false; if (this.lives > 0) { this.lives--; this.respawn(); } else { this.out = true; this.hidden = true; Sound.play('ko'); } return; }
    this.move(dt);
    this.x = clamp(this.x, S.camX + 24, S.camX + W - 24);
    this.updPose(dt);
  }
  respawn() { this.dead = false; this.hp = this.maxHp; this.inv = 2.6; this.z = 280; this.vz = 0; this.rot = 0; this.set('jump', 'fall'); this.vx = this.vy = 0; }
  revive(x, y) { this.out = false; this.hidden = false; this.dead = false; this.hp = Math.round(this.maxHp * 0.5); this.x = x; this.y = clampY(y); this.inv = 2.2; this.z = 200; this.vz = 0; this.rot = 0; this.set('jump', 'fall'); }
  landed() {
    if (this.state === 'jump' || this.state === 'jumpAtk') { this.set('idle', 'idle'); dust(this.x, this.y, 3); }
    else super.landed();
  }
  startAtk(id) {
    this.atkId = id; this.set('atk', ATK[id].anim); this.hitSet = new Set(); Sound.play('swing');
    const I = Input.get(this.dev); if (I.mx && id !== 'dashAtk') this.face = sgn(I.mx);
  }
  startSpecial() {
    this.meter = 0; this.spLock = 3; this.sp = SPECIALS[this.hero.sp]; this.set('special', 'cast'); this.vx = this.vy = 0;
    S.superT = 0.5; S.cutin = { p: this, t: 0 }; Sound.play('special');
    this.sp.start(this);
  }
  control(dt, I) {
    const sp = this.speed * (this.buff > 0 ? 1.2 : 1);
    switch (this.state) {
      case 'idle': {
        this.vx = I.mx * sp; this.vy = I.my * sp * 0.72;
        if (I.mx) this.face = sgn(I.mx);
        this.setAnim(I.mx || I.my ? 'walk' : 'idle');
        if (this.meter >= 100 && this.take('special')) return this.startSpecial();
        if (this.take('jump')) { this.vz = 540; this.z = 1; this.set('jump', 'jump'); Sound.play('jump'); return; }
        if (this.dashCd <= 0 && this.take('dash')) {
          let dx = I.mx, dy = I.my; if (!dx && !dy) dx = this.face;
          this.vx = dx * 560; this.vy = dy * 400; if (dx) this.face = sgn(dx);
          this.inv = Math.max(this.inv, 0.22); this.dashCd = 0.6; this.set('dash', 'run'); Sound.play('dash'); dust(this.x, this.y, 4); return;
        }
        if (this.take('heavy')) return this.startAtk('heavy');
        if (this.take('atk')) return this.startAtk('l1');
        break;
      }
      case 'jump':
        this.vx = lerp(this.vx, I.mx * sp, 0.12); this.vy = I.my * sp * 0.6;
        if (I.mx) this.face = sgn(I.mx);
        this.setAnim(this.vz > 0 ? 'jump' : 'fall');
        if (this.take('atk') || this.take('heavy')) { this.set('jumpAtk', 'flykick'); this.hitSet = new Set(); this.vx = this.face * Math.max(Math.abs(this.vx), 210); Sound.play('swing'); }
        break;
      case 'jumpAtk':
        strike(this, { x0: -8, x1: this.reach * 0.8, dy: 26, z0: -26, z1: 62, dmg: 14, kb: 220, lift: 220, type: 'air', set: this.hitSet });
        break;
      case 'atk': {
        const A = ATK[this.atkId];
        this.vx = this.st < A.a1 ? this.face * A.step : 0; this.vy = 0;
        if (this.st >= A.a0 && this.st <= A.a1) strike(this, Object.assign({ x1: this.reach + (A.ext || 0), set: this.hitSet }, A.hit));
        if (this.st > A.a1) {
          if (this.atkId === 'l1' && this.take('atk')) return this.startAtk('l2');
          if (this.atkId === 'l2' && this.take('atk')) return this.startAtk('l3');
          if ((this.atkId === 'l1' || this.atkId === 'l2') && this.take('heavy')) return this.startAtk('heavy');
          if (this.atkId[0] === 'l' && this.meter >= 100 && this.take('special')) return this.startSpecial();
        }
        if (this.st >= A.dur) this.set('idle', 'idle');
        break;
      }
      case 'dash':
        if (this.take('atk') || this.take('heavy')) return this.startAtk('dashAtk');
        if (this.st > 0.24) this.set('idle', 'idle');
        break;
      case 'special':
        if (this.sp.upd(this, dt, I) === true) { this.beam = false; this.set('idle', 'idle'); }
        break;
      case 'win': this.vx = this.vy = 0; break;
    }
  }
  onDealt(t, dmg) {
    if (this.state !== 'special' && this.spLock <= 0) this.meter = Math.min(100, this.meter + dmg * 0.45);
    this.combo++; this.comboT = 2.2; S.stats.maxCombo = Math.max(S.stats.maxCombo, this.combo);
  }
  onHurt(a, h, dir, dmg) {
    this.combo = 0; this.meter = Math.min(100, this.meter + 5); S.stats.hits++;
    super.onHurt(a, h, dir, dmg);
  }
  drawOpts() { const o = super.drawOpts(); o.atk = this.state === 'atk' || this.state === 'special'; if (this.inv > 0 && this.state !== 'special' && this.state !== 'dash' && Math.floor(G.t * 22) % 2) o.alpha = 0.45; return o; }
  draw(c, cam) {
    if (this.hidden) return;
    const sx = this.x - cam;
    c.beginPath(); c.ellipse(sx, this.y + 2, 22, 8, 0, 0, TAU); c.lineWidth = 2.5; c.strokeStyle = this.color; c.globalAlpha = 0.85; c.stroke(); c.globalAlpha = 1;
    if (this.beam) {
      const by = this.y - this.z - this.height * 0.62, x0 = sx + this.face * 34, x1 = this.face > 0 ? W + 20 : -20, fl = 9 + Math.sin(G.t * 60) * 3;
      c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(77,208,225,.55)'; c.fillRect(Math.min(x0, x1), by - fl - 6, Math.abs(x1 - x0), fl * 2 + 12);
      c.fillStyle = '#e0fbff'; c.fillRect(Math.min(x0, x1), by - fl * 0.5, Math.abs(x1 - x0), fl); c.globalCompositeOperation = 'source-over';
    }
    super.draw(c, cam);
    const top = this.y - this.z - this.height - 22;
    if (this.meter >= 100 && this.state !== 'special') { const a = G.t * 5; for (let i = 0; i < 3; i++) { c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(sx + Math.cos(a + i * 2.1) * 26, this.y - this.z - 50 + Math.sin(a * 1.3 + i * 2.1) * 30, 2.6, 0, TAU); c.fill(); } }
    c.beginPath(); c.moveTo(sx - 7, top); c.lineTo(sx + 7, top); c.lineTo(sx, top + 9); c.closePath(); c.fillStyle = this.color; c.fill(); c.lineWidth = 2; c.strokeStyle = INK; c.stroke();
    txt(c, (this.idx + 1) + 'P', sx, top - 10, 13, this.color, 'center', true);
  }
}

// 李师傅的自动炮台
class Turret {
  constructor(p) { this.x = clamp(p.x + p.face * 44, S.camX + 30, S.camX + W - 30); this.y = p.y; this.life = 9; this.cd = 0.3; this.face = p.face; this.t = 0; }
  update(dt) {
    this.t += dt; this.life -= dt;
    if (this.life <= 0) { this.gone = true; smoke(this.x, this.y, 20, 8); return; }
    this.cd -= dt; if (this.cd > 0) return;
    let best = null, bd = 580;
    for (const e of S.foes()) { const d = Math.hypot(e.x - this.x, (e.y - this.y) * 2); if (d < bd) { bd = d; best = e; } }
    if (!best) return;
    this.cd = 0.42; this.face = sgn(best.x - this.x);
    const T = Math.max(0.12, bd / 640), ox = this.x + this.face * 16;
    shoot({ team: 'hero', owner: null, x: ox, y: this.y, z: 36, vx: (best.x - ox) / T, vy: (best.y - this.y) / T, vz: (best.z + best.height * 0.5 - 36) / T, dmg: 10, kb: 70, kind: 'nut', r: 7, life: T + 0.3 });
    Sound.play('throw');
  }
  draw(c, cam) {
    const sx = this.x - cam, y = this.y;
    shadow(c, sx, y, 18);
    c.save(); c.translate(sx, y); c.lineCap = 'round'; c.lineWidth = 5; c.strokeStyle = INK;
    c.beginPath(); c.moveTo(-12, 0); c.lineTo(0, -26); c.lineTo(12, 0); c.stroke(); c.lineWidth = 2.5; c.strokeStyle = '#b8c0c8'; c.stroke();
    c.scale(this.face, 1);
    rrect(c, -13, -46, 26, 20, 5); c.fillStyle = '#3d6fb4'; c.fill(); c.lineWidth = 2.4; c.strokeStyle = INK; c.stroke();
    const rc = this.cd > 0.3 ? -4 : 0;
    rrect(c, 8 + rc, -41, 20, 9, 2); c.fillStyle = '#b8c0c8'; c.fill(); c.stroke();
    c.beginPath(); c.arc(-3, -36, 4, 0, TAU); c.fillStyle = '#ffd23f'; c.fill();
    c.restore();
    bar(c, sx - 16, y - 62, 32, 4, this.life / 9, '#ffd23f');
  }
}

const SPECIALS = {
  spin: {
    start(p) { p.inv = 2.0; p.setAnim('spin', true); p.tk = 0; },
    upd(p, dt, I) {
      p.vx = I.mx * p.speed * 1.5; p.vy = I.my * p.speed; p.face = Math.floor(p.st * 16) % 2 ? 1 : -1; p.tk -= dt;
      if (p.tk <= 0) { p.tk = 0.17; const last = p.st > 1.5; areaHit(p, 'foe', p.x, p.y, 96, { dmg: last ? 18 : 7, kb: last ? 340 : 30, lift: last ? 320 : 0, type: 'special' }); ring(p.x, p.y, 100, '#ffd23f', 0.25); Sound.play('swing'); }
      if (p.st > 1.7) { p.face = I.mx ? sgn(I.mx) : 1; return true; }
    } },
  marbles: {
    start(p) {
      p.inv = 1.4; p.setAnim('throwUp', true);
      const foes = S.foes().filter(e => Math.abs(e.x - S.camX - W / 2) < W / 2 + 40);
      for (let i = 0; i < 16; i++) S.after(0.12 + i * 0.07, () => {
        const e = foes.length && i % 4 !== 3 ? pick(foes) : null, ok = e && !e.gone && !e.dead;
        const tx = ok ? e.x + rand(-26, 26) : p.x + p.face * rand(60, 440), ty = clampY(ok ? e.y + rand(-12, 12) : p.y + rand(-80, 80));
        shoot({ team: 'hero', owner: p, x: tx - 70, y: ty, z: 440, vx: 140, vz: -880, burst: 46, dmg: 13, kb: 140, lift: 210, kind: 'marble', noDirect: true, tall: true, r: 8, color: pick(['#6ec6ff', '#ff8fb1', '#ffd23f', '#8dff9a']) });
      });
    },
    upd(p) { p.vx = p.vy = 0; if (p.st > 0.25 && p.anim !== 'throw') p.setAnim('throw', true); return p.st > 1.3; } },
  steam: {
    start(p) { p.inv = 1.1; p.setAnim('slamUp', true); p.done = false; },
    upd(p) {
      p.vx = p.vy = 0;
      if (!p.done && p.st > 0.35) {
        p.done = true; p.setAnim('slamDown', true);
        areaHit(p, 'foe', p.x, p.y, 240, { dmg: 44, kb: 380, lift: 360, type: 'special' });
        ring(p.x, p.y, 250, '#ffffff', 0.5); smoke(p.x, p.y, 20, 26); S.shake = 12; Sound.play('explode');
        p.hp = Math.min(p.maxHp, p.hp + 18); popText(p.x, p.y, 110, '+18', '#8dff9a', 16);
      }
      return p.st > 0.9;
    } },
  rings: {
    start(p) { p.inv = 1.5; p.setAnim('spin', true); p.n = 0; },
    upd(p) {
      p.vx = p.vy = 0; p.face = Math.floor(p.st * 8) % 2 ? 1 : -1;
      if (p.n < 3 && p.st > 0.15 + p.n * 0.36) { p.n++; areaHit(p, 'foe', p.x, p.y, 300, { dmg: 13, kb: 60, type: 'special', freeze: 2.8, daze: true }); ring(p.x, p.y, 310, '#ff8fb1', 0.5); Sound.play('special'); }
      return p.st > 1.3;
    } },
  turret: {
    start(p) { p.inv = 0.7; p.setAnim('slamDown', true); S.pets.push(new Turret(p)); Sound.play('block'); },
    upd(p) { p.vx = p.vy = 0; return p.st > 0.5; } },
  blitz: {
    start(p) {
      const foes = S.foes().filter(e => Math.abs(e.x - S.camX - W / 2) < W / 2 + 20).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
      p.q = []; if (foes.length) for (let i = 0; i < Math.max(6, Math.min(foes.length, 9)); i++) p.q.push(foes[i % foes.length]);
      p.inv = p.q.length * 0.11 + 0.7; p.tk = 0.12; p.setAnim('slide', true);
    },
    upd(p, dt) {
      p.vx = p.vy = 0; p.tk -= dt;
      if (p.tk <= 0 && p.q.length) {
        p.tk = 0.11; const e = p.q.shift();
        if (!e.gone && !e.dead) {
          const ox = p.x, oy = p.y;
          fx('ghost', ox, oy, 0, { look: p.look, pose: p.pose.slice(), face: p.face, color: '#ffe066', life: 0.3 });
          p.face = sgn(e.x - p.x); p.x = clamp(e.x + p.face * 34, S.camX + 24, S.camX + W - 24); p.y = e.y;
          fx('bolt', ox, oy, 40, { x2: p.x, y2: p.y - 40, color: '#ffe066', life: 0.22 });
          applyHit(p, e, { dmg: 21, kb: 120, lift: p.q.includes(e) ? 0 : 260, type: 'special' }, p.face); Sound.play('dash');
        }
      }
      return !p.q.length && p.tk <= -0.25;
    } },
  freeze: {
    start(p) { p.inv = 1.0; p.setAnim('cast', true); p.done = false; },
    upd(p) {
      p.vx = p.vy = 0;
      if (!p.done && p.st > 0.3) {
        p.done = true;
        for (const e of S.foes()) if (Math.abs(e.x - S.camX - W / 2) < W / 2 + 60) applyHit(p, e, { dmg: 10, type: 'special', freeze: 4.5 }, sgn(e.x - p.x));
        fx('flash', 0, 0, 0, { color: '#bfe9ff', life: 0.4, a: 0.6 }); popText(p.x, p.y, 125, '安静！', '#bfe9ff', 34); Sound.play('freeze'); ring(p.x, p.y, 520, '#bfe9ff', 0.5);
      }
      return p.st > 0.85;
    } },
  heal: {
    start(p) { p.inv = 1.0; p.setAnim('cast', true); p.done = false; },
    upd(p) {
      p.vx = p.vy = 0;
      if (!p.done && p.st > 0.3) {
        p.done = true;
        for (const q of S.players) {
          if (q.out) q.revive(p.x + rand(-40, 40), p.y); else if (!q.dead) q.hp = Math.min(q.maxHp, q.hp + q.maxHp * 0.4);
          popText(q.x, q.y, 105, '♥', '#ff8fb1', 26);
        }
        for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; shoot({ team: 'hero', owner: p, x: p.x, y: p.y, z: 34, vx: Math.cos(a) * 380, vy: Math.sin(a) * 240, dmg: 9, kb: 160, kind: 'pearl', r: 7, life: 1.0, pierce: true }); }
        Sound.play('heal'); ring(p.x, p.y, 160, '#8dff9a', 0.5);
      }
      return p.st > 0.85;
    } },
  flurry: {
    start(p) { p.inv = 1.6; p.setAnim('run', true); p.ph = 0; p.n = 0; p.tk = 0; },
    upd(p, dt) {
      if (p.ph === 2) { p.vx = 0; return p.st > 0.3; }
      if (p.ph === 0) {
        p.vx = p.face * 720; p.vy = 0;
        const near = S.foes().some(e => (e.x - p.x) * p.face > 0 && (e.x - p.x) * p.face < 80 && Math.abs(e.y - p.y) < 40);
        if (near || p.st > 0.3) { p.ph = 1; p.vx = 0; }
        return;
      }
      p.vx = p.face * 30; p.tk -= dt;
      if (p.tk <= 0) {
        p.tk = 0.085; p.n++; const last = p.n >= 8;
        p.setAnim(last ? 'kick' : p.n % 2 ? 'jab' : 'cross', true);
        strike(p, { x0: -20, x1: 130, dy: 40, z1: 160, dmg: last ? 36 : 11, kb: last ? 440 : 8, lift: last ? 440 : 0, type: 'special' }); Sound.play('swing');
        if (last) { p.ph = 2; p.st = 0; }
      }
    } },
  laser: {
    start(p) { p.inv = 1.9; p.setAnim('jab', true); p.tk = 0.25; p.beam = false; },
    upd(p, dt) {
      p.vx = p.vy = 0; p.animT = 0.1; p.tk -= dt;
      const on = p.st > 0.25 && p.st < 1.6; if (on && !p.beam) Sound.play('laser'); p.beam = on;
      if (on && p.tk <= 0) { p.tk = 0.1; strike(p, { x0: 20, x1: 980, dy: 30, z0: -10, z1: 170, dmg: 8, kb: 20, lift: p.st > 1.48 ? 280 : 0, type: 'special' }); S.shake = Math.max(S.shake, 2); }
      return p.st > 1.75;
    } },
};
