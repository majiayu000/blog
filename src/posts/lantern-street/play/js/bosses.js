'use strict';
// 头目：从招式库里按阶段抽招。每招都有前摇和破绽，打不动（霸体），但攒够伤害会进入「破绽」眩晕。

const LANES = [0, 1, 2, 3, 4].map(i => GROUND_TOP + 20 + i * (GROUND_BOT - GROUND_TOP - 30) / 4);

const MOVES = {
  // 近身一砸
  melee: {
    ok: (b, t) => Math.abs(t.x - b.x) < 190,
    start(b) { b.setAnim('slamUp', true); tele(b); },
    upd(b) {
      if (b.mp === 0) { if (b.st > 0.5 * b.tempo) { b.next(); b.setAnim('slamDown', true); Sound.play('swing'); strike(b, { x0: -10, x1: 70 * b.sc, dy: 36, dmg: 12, kb: 340, lift: 260, set: new Set() }); dust(b.x + b.face * 60, b.y, 5); } }
      else if (b.st > 0.6) return true;
    } },
  // 横冲：对准一条线冲到屏幕边，撞墙后眩晕
  charge: {
    start(b) { b.m.n = b.def.bounces || 1; b.setAnim('crouch', true); tele(b); b.m.mk = mark('lane', 0, b.y, 24, 0.75 * b.tempo); },
    upd(b) {
      const t = b.tgt;
      if (b.mp === 0) {
        if (t) { b.face = sgn(t.x - b.x); b.vy = clamp((t.y - b.y) * 3, -110, 110); }
        if (b.m.mk) b.m.mk.y = b.y;
        if (b.st > 0.75 * b.tempo) { b.next(); b.vy = 0; b.vx = b.face * 640; b.setAnim('run', true); b.hitSet = new Set(); Sound.play('dash'); }
      } else {
        strike(b, { x0: -10, x1: 46 * b.sc, dy: 30, dmg: 17, kb: 400, lift: 300, set: b.hitSet });
        if (Math.random() < 0.5) dust(b.x - b.face * 20, b.y, 1);
        const edge = b.face > 0 ? S.camX + W - 50 : S.camX + 50;
        if ((b.x - edge) * b.face >= 0) {
          b.x = edge; b.vx = 0; S.shake = 11; Sound.play('explode'); dust(b.x, b.y, 10);
          if (--b.m.n > 0) { b.face = -b.face; b.mp = 0; b.st = 0.3; b.setAnim('crouch', true); b.m.mk = mark('lane', 0, b.y, 24, 0.75 * b.tempo - 0.3); }
          else { b.goDizzy(1.6); return true; }
        }
      }
    } },
  // 跳砸：看地上的红圈，离开圈才躲得掉
  slam: {
    start(b) { b.setAnim('crouch', true); tele(b); },
    upd(b) {
      if (b.mp === 0) {
        if (b.st > 0.45 * b.tempo) {
          b.next(); const t = b.tgt || b, T = 0.95;
          b.m.tx = clamp(t.x, S.camX + 70, S.camX + W - 70); b.m.ty = t.y;
          b.vz = GRAV * T / 2; b.z = 1; b.vx = (b.m.tx - b.x) / T; b.vy = (b.m.ty - b.y) / T;
          b.setAnim('jump', true); mark('circle', b.m.tx, b.m.ty, 135, T); Sound.play('jump');
        }
      } else if (b.mp === 1) {
        if (b.z <= 0 && b.st > 0.1) {
          b.next(); b.vx = b.vy = 0; b.setAnim('slamDown', true);
          areaHit(b, 'hero', b.x, b.y, 135, { dmg: 16, kb: 320, lift: 300, type: 'area' });
          ring(b.x, b.y, 150, '#ffb38a', 0.4); dust(b.x, b.y, 12); S.shake = 13; Sound.play('explode');
        }
      } else if (b.st > 0.9) return true;
    } },
  // 扇形弹幕
  fan: {
    start(b) { b.setAnim('throwUp', true); tele(b); b.m.v = b.phase > 1 ? 2 : 1; },
    upd(b) {
      if (b.mp === 0) {
        if (b.st > 0.55 * b.tempo) {
          b.next(); b.setAnim('throw', true); const t = b.tgt; if (t) b.face = sgn(t.x - b.x);
          const n = b.def.fanN || 5, off = b.m.v % 2 ? 0 : 0.13;
          for (let i = 0; i < n; i++) { const a = (i / (n - 1) - 0.5) * 1.15 + off; shoot({ owner: b, x: b.x + b.face * 30, y: b.y, z: 46, vx: b.face * Math.cos(a) * 330, vy: Math.sin(a) * 205, dmg: 9, r: 11, life: 3.2, kind: b.def.shot, kb: 170 }); }
          Sound.play('throw');
        }
      } else if (b.st > 0.5) { if (--b.m.v > 0) { b.mp = 0; b.st = 0.25; b.setAnim('throwUp', true); } else return true; }
    } },
  // 叫小弟
  summon: {
    ok: b => S.foes().length < 4,
    start(b) { b.setAnim('cast', true); Sound.play('roar'); popText(b.x, b.y, b.height + 20, '来人！', '#ffb3b3', 20); },
    upd(b) {
      if (b.mp === 0) { if (b.st > 0.7) { b.next(); const n = 2 + (b.phase > 1 ? 1 : 0) + (S.players.length > 2 ? 1 : 0); for (let i = 0; i < n; i++) S.spawn(pick(b.def.minions), i % 2 ? 1 : -1, i, 0); } }
      else if (b.st > 0.5) return true;
    } },
  // 旋风追击，转完会晕
  spin: {
    start(b) { b.setAnim('crouch', true); tele(b); },
    upd(b, dt) {
      const t = b.tgt;
      if (b.mp === 0) { if (b.st > 0.55 * b.tempo) { b.next(); b.setAnim('spin', true); b.spinning = true; b.m.tk = 0; } }
      else {
        if (t) b.goto(t.x, t.y, 140);
        b.m.tk -= dt;
        if (b.m.tk <= 0) { b.m.tk = 0.28; areaHit(b, 'hero', b.x, b.y, 62 * b.sc, { dmg: 10, kb: 300, lift: 220, type: 'area' }); ring(b.x, b.y, 62 * b.sc, '#ffffff', 0.2); Sound.play('swing'); }
        if (b.st > 2.4) { b.spinning = false; b.goDizzy(1.5); return true; }
      }
    } },
  // 横向光带：五条道里封三条，站到没变红的道上，或者起跳
  beam: {
    start(b) { b.setAnim('cast', true); b.m.rounds = b.phase > 1 ? 2 : 1; MOVES.beam.aim(b); Sound.play('roar'); },
    aim(b) {
      const t = b.tgt, mine = t ? LANES.reduce((bi, y, i) => Math.abs(y - t.y) < Math.abs(LANES[bi] - t.y) ? i : bi, 0) : 2;
      const rest = [0, 1, 2, 3, 4].filter(i => i !== mine).sort(() => Math.random() - 0.5);
      b.m.lanes = [mine, rest[0], rest[1]]; b.m.dur = 1.0 * b.tempo;
      for (const i of b.m.lanes) mark('lane', 0, LANES[i], 17, b.m.dur);
    },
    upd(b) {
      if (b.mp === 0) {
        if (b.st > b.m.dur) {
          b.next(); Sound.play('laser'); S.shake = 8;
          for (const i of b.m.lanes) {
            fx('beam', 0, LANES[i], 0, { size: 17, color: SHOT_C[b.def.shot] || '#ff8a65', life: 0.4 });
            for (const p of S.players) if (!p.out && p.z < 36 && Math.abs(p.y - LANES[i]) < 18) applyHit(b, p, { dmg: 15, kb: 260, lift: 240, type: 'area' }, sgn(p.x - b.x));
          }
        }
      } else if (b.st > 0.55) { if (--b.m.rounds > 0) { b.mp = 0; b.st = 0; MOVES.beam.aim(b); } else return true; }
    } },
  // 消失后出现在身后偷袭
  blink: {
    start(b) { b.setAnim('cast', true); },
    upd(b) {
      const t = b.tgt;
      if (b.mp === 0) { if (b.st > 0.3) { b.next(); smoke(b.x, b.y, 40, 10, 'rgba(120,90,160,.8)'); b.hidden = true; Sound.play('dash'); } }
      else if (b.mp === 1) {
        if (b.st > 0.5) {
          b.next();
          if (t) { b.x = clamp(t.x - t.face * 84, S.camX + 60, S.camX + W - 60); b.y = t.y; b.face = sgn(t.x - b.x); }
          b.hidden = false; smoke(b.x, b.y, 40, 10, 'rgba(120,90,160,.8)'); b.setAnim('slamUp', true); tele(b);
        }
      } else if (b.mp === 2) { if (b.st > 0.45 * b.tempo) { b.next(); b.setAnim('slamDown', true); Sound.play('swing'); strike(b, { x0: -10, x1: 66 * b.sc, dy: 34, dmg: 12, kb: 320, lift: 250, set: new Set() }); } }
      else if (b.st > 0.55) return true;
    } },
  // 追着人落下的东西，看地上的圈
  rain: {
    start(b) { b.setAnim('cast', true); b.m.w = 0; b.m.tk = 0.25; tele(b); },
    upd(b, dt) {
      b.m.tk -= dt; const waves = 3 + (b.phase > 1 ? 1 : 0);
      if (b.m.tk <= 0 && b.m.w < waves) {
        b.m.w++; b.m.tk = 0.55;
        const spots = S.players.filter(p => !p.out).map(p => [p.x + rand(-14, 14), p.y]);
        for (let i = 0; i < 2; i++) spots.push([S.camX + rand(80, W - 80), rand(GROUND_TOP + 10, GROUND_BOT - 10)]);
        for (const s of spots) { mark('circle', s[0], s[1], 44, 0.75); shoot({ owner: b, x: s[0], y: clampY(s[1]), z: 450, vz: -600, burst: 44, dmg: 12, kb: 240, lift: 240, kind: b.def.shot, r: 12, noDirect: true }); }
      }
      if (b.m.w >= waves && b.m.tk <= -0.5) return true;
    } },
};

class Boss extends Fighter {
  constructor(def, x, y, lvl) {
    super(def.look, x, y, 'foe');
    this.def = def; this.isBoss = true; this.sc = def.look.scale || 1;
    this.hp = this.maxHp = Math.round(def.hp * (1 + 0.6 * (S.players.length - 1))); this.power = 1 + lvl * 0.05;
    this.radius = 20 * this.sc; this.deep = 8; this.stag = 0; this.stagMax = Math.round(def.stag * (1 + 0.6 * (S.players.length - 1))); this.phase = 1; this.tempo = 1;
    this.cool = 1.4; this.dizzy = 0; this.mv = null; this.last = null; this.state = 'intro'; this.inv = 99; this.poseRate = 22;
  }
  next() { this.mp++; this.st = 0; }
  goDizzy(d) { this.dizzy = d; this.set('dizzy', 'dizzy'); this.vx = this.vy = 0; this.spinning = false; this.hidden = false; this.mv = null; }
  update(dt) {
    if (this.frozen > 0) { this.frozen -= dt; if (this.flash > 0) this.flash -= dt; this.vx = this.vy = 0; this.move(dt); return; }
    if (!this.tickBase(dt)) return;
    this.tgt = S.nearest(this);
    const t = this.tgt;
    switch (this.state) {
      case 'intro': this.setAnim(Math.abs(this.vx) > 5 ? 'walk' : 'idle'); break;
      case 'idle': {
        // 阶段切换
        const thr = this.def.phases[this.phase - 1];
        if (thr && this.hp / this.maxHp <= thr) { this.phase++; this.tempo = 0.8; this.stag = 0; this.inv = 1.1; this.set('roar', 'cast'); this.vx = this.vy = 0; Sound.play('roar'); S.shake = 10; ring(this.x, this.y, 260, '#ff5340', 0.6); popText(this.x, this.y, this.height + 24, this.phase > 2 ? '彻底发狂！' : '发怒了！', '#ff5340', 24); break; }
        if (t) {
          const dx = t.x - this.x; this.face = sgn(dx);
          const want = Math.abs(dx) > 230 ? t.x - sgn(dx) * 200 : this.x;
          this.goto(clamp(want, S.camX + 60, S.camX + W - 60), t.y, this.def.board ? 130 : 85);
        } else this.vx = this.vy = 0;
        this.setAnim(Math.abs(this.vx) + Math.abs(this.vy) > 8 ? 'walk' : 'idle');
        this.cool -= dt;
        if (this.cool <= 0 && t) this.pickMove(t);
        break;
      }
      case 'roar': if (this.st > 1.0) this.set('idle', 'idle'); break;
      case 'move':
        if (MOVES[this.mv].upd(this, dt) && this.state === 'move') this.endMove();
        break;
      case 'dizzy':
        this.dizzy -= dt;
        if (this.dizzy <= 0) { this.dizzy = 0; this.set('idle', 'idle'); this.cool = 0.5; }
        break;
      case 'dying':
        this.vx = this.vy = 0;
        if (Math.random() < 0.25) { boom(this.x + rand(-40, 40), this.y + rand(-6, 6), rand(24, 46), pick(['#ffb347', '#ff5340', '#fff'])); Sound.play('explode'); }
        this.rot = -Math.min(1, this.st / 1.6) * 1.5;
        if (this.st > 1.9) { this.gone = true; boom(this.x, this.y, 110, '#fff6d0'); }
        break;
    }
    this.move(dt);
    this.x = clamp(this.x, S.camX - 200, S.camX + W + 200);
    this.updPose(dt);
  }
  pickMove(t) {
    const pool = this.def.moves[Math.min(this.phase, this.def.moves.length) - 1].filter(n => n !== this.last && (!MOVES[n].ok || MOVES[n].ok(this, t)));
    const n = pool.length ? pick(pool) : 'fan';
    this.mv = this.last = n; this.m = {}; this.mp = 0; this.set('move'); this.vx = this.vy = 0; this.face = sgn(t.x - this.x);
    MOVES[n].start(this);
  }
  endMove() { this.mv = null; this.set('idle', 'idle'); this.vx = this.vy = 0; const c = this.def.cool; this.cool = rand(c[0], c[1]) * (this.phase > 1 ? 0.75 : 1); }
  onHurt(a, h, dir, dmg) {
    if (this.hp <= 0) {
      this.hp = 0; this.dead = true; this.hidden = false; this.spinning = false; this.z = 0; this.vz = 0; this.set('dying', 'hurt'); this.face = -dir;
      S.bossDown(this); return;
    }
    if (this.dizzy > 0 || this.z > 0 || this.hidden) return;
    this.stag += dmg * (BREAKERS[h.type] ? 1.4 : 1);
    if (this.stag >= this.stagMax) { this.stag = 0; this.goDizzy(2.5); popText(this.x, this.y, this.height + 24, '破绽！', '#ffd23f', 26); Sound.play('break'); S.shake = 8; }
  }
  drawOpts() { const o = super.drawOpts(); o.board = !!this.def.board; if (this.state === 'dizzy') o.expr = 'hurt'; return o; }
  draw(c, cam) {
    if (this.hidden) return;
    const f = this.face; if (this.spinning) this.face = Math.floor(this.st * 14) % 2 ? 1 : -1;
    if (this.def.final) { const sx = this.x - cam; const g = c.createRadialGradient(sx, this.y - this.z - 70, 10, sx, this.y - this.z - 70, 130); g.addColorStop(0, 'rgba(60,20,110,.45)'); g.addColorStop(1, 'rgba(60,20,110,0)'); c.fillStyle = g; c.fillRect(sx - 130, this.y - this.z - 200, 260, 260); }
    super.draw(c, cam); this.face = f;
    if (this.state === 'dizzy') drawStars(c, this.x - cam, this.y - this.height - 14);
  }
}
