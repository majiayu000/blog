'use strict';
// 关卡运行时：分段锁屏刷怪 → 头目 → 救人

class Stage {
  constructor(idx, picks) {
    S = this; this.idx = idx; this.def = STAGES[idx]; this.boss = null; this.npc = null;
    this.t = 0; this.time = 0; this.camX = 0; this.shake = 0; this.superT = 0; this.slow = 0; this.cutin = null; this.darkA = 0;
    this.ents = []; this.projs = []; this.fx = []; this.items = []; this.props = []; this.marks = []; this.timers = []; this.pets = [];
    this.tokens = new Set(); this.stats = { hits: 0, kos: 0, maxCombo: 0 };
    const n = picks.length;
    this.hpMul = 1 + 0.5 * (n - 1); this.tokenMax = 1 + n;
    this.players = picks.map((pk, i) => { const p = new Player(HEROES[pk.hero], i, pk.dev); p.x = 110 + i * 46; p.y = GROUND_TOP + 50 + i * 34; return p; });
    this.ents.push(...this.players);
    this.segs = this.def.waves.map((w, i) => ({ lock: 380 + i * 760, waves: w, wi: -1 }));
    this.bossLock = 380 + this.segs.length * 760; this.width = this.bossLock + W;
    this.seg = 0; this.camMax = this.segs[0].lock; this.mode = 'walk'; this.pending = 0; this.waveGap = 0.4; this.goT = 0; this.modeT = 0;
    this.bg = makeBg(this.def.theme, idx + 1, this.width); this.bg.litX = 0; this.litTarget = 340;
    const R = seeded(idx * 131 + 7);
    this.segs.forEach((s, i) => {
      const k = 1 + (R() > 0.5 ? 1 : 0);
      for (let j = 0; j < k; j++) { const u = R(); this.props.push({ x: s.lock + 260 + R() * (W - 420), y: GROUND_TOP + 20 + R() * 130, kind: R() > 0.5 ? 'crate' : 'barrel', hp: 1, hitT: 0, drop: u < 0.5 ? 'bun' : u < 0.82 ? 'star' : 'chili' }); }
    });
    this.props.push({ x: this.bossLock + 120, y: GROUND_TOP + 30, kind: 'crate', hp: 1, hitT: 0, drop: 'feast' }, { x: this.bossLock + W - 130, y: GROUND_BOT - 30, kind: 'barrel', hp: 1, hitT: 0, drop: 'star' });
    this.cage = { x: this.bossLock + W / 2, y: 150, hero: HEROES[idx + START_HEROES], open: false };
    this.banner = { t: 0, a: '第 ' + (idx + 1) + ' 关', b: this.def.name };
    Sound.music(this.def.music);
  }
  after(t, fn) { this.timers.push({ t, fn }); }
  foes() { return this.ents.filter(e => e.team === 'foe' && !e.dead && !e.gone); }
  nearest(e) {
    let best = null, bd = 1e9;
    for (const p of this.players) { if (p.out || p.dead) continue; const d = Math.abs(p.x - e.x) + Math.abs(p.y - e.y) * 2; if (d < bd) { bd = d; best = p; } }
    return best;
  }
  spawn(type, side, k, delay) {
    this.pending++;
    this.after(delay || 0, () => {
      this.pending--;
      const x = side < 0 ? this.camX - 50 - (k % 3) * 24 : this.camX + W + 50 + (k % 3) * 24;
      this.ents.push(new Enemy(type, x, rand(GROUND_TOP + 14, GROUND_BOT - 10), this.idx));
    });
  }
  nextWave() {
    const s = this.segs[this.seg]; s.wi++;
    if (s.wi >= s.waves.length) return false;
    const list = [...s.waves[s.wi]], extra = Math.floor(list.length * 0.5 * (this.players.length - 1));
    for (let i = 0; i < extra; i++) list.push(pick(list));
    list.forEach((ty, i) => this.spawn(ty, i % 2 ? -1 : 1, i, 0.2 + i * 0.3));
    return true;
  }
  breakProp(p) {
    p.broken = true; spark(p.x, p.y, 20, 10, '#c89b6a'); dust(p.x, p.y, 5); Sound.play('break'); dropItem(p.drop, p.x, p.y);
  }
  startBoss() {
    this.mode = 'bossIntro'; this.modeT = 0;
    const b = this.boss = new Boss(BOSSES[this.idx], this.camX + W + 100, GROUND_TOP + 90, this.idx);
    b.face = -1; b.vx = -170; this.ents.push(b);
    Sound.music(b.def.final ? 'final' : 'boss'); Sound.play('roar');
  }
  bossDown(b) {
    this.mode = 'bossDown'; this.modeT = 0; this.slow = 1.3; this.marks = []; this.projs = this.projs.filter(p => p.team === 'hero'); this.shake = 14;
    for (const e of this.ents) if (e.team === 'foe' && e !== b && !e.dead) { e.dead = true; e.hp = 0; e.fly = false; e.frozen = 0; e.set('dead'); smoke(e.x, e.y, 30, 5); }
    Sound.music(''); Sound.play('ko');
    G.log.push({ ev: 'bossDown', stage: this.idx, t: +this.time.toFixed(1) });
  }
  update(dt) {
    if (this.mode === 'clear') return;
    this.shake = Math.max(0, this.shake - dt * 32);
    if (this.cutin) { this.cutin.t += dt; if (this.cutin.t > 1.0) this.cutin = null; }
    if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.4) this.banner = null; }
    if (this.superT > 0) { this.superT -= dt; return; }
    let sdt = dt; if (this.slow > 0) { this.slow -= dt; sdt = dt * 0.35; }
    this.t += sdt; this.modeT += dt;
    if (this.mode === 'walk' || this.mode === 'fight' || this.mode === 'boss') this.time += dt;
    if (this.goT > 0) this.goT -= dt;
    const due = this.timers.filter(t => (t.t -= sdt) <= 0); this.timers = this.timers.filter(t => t.t > 0); for (const t of due) t.fn();
    for (const e of this.ents) e.update(sdt);
    for (const p of this.pets) p.update(sdt);
    updProjs(sdt); updItems(sdt); updFx(sdt);
    this.separate();
    this.ents = this.ents.filter(e => { if (e.gone) { this.tokens.delete(e); if (e.team === 'foe' && this.mode !== 'bossDown') this.stats.kos++; } return !e.gone; });
    this.pets = this.pets.filter(p => !p.gone); this.props = this.props.filter(p => !p.broken);
    this.flow(dt);
    // 镜头只往前走，被当前路段锁住
    const ps = this.players.filter(p => !p.out);
    if (ps.length) { const ax = ps.reduce((s, p) => s + p.x, 0) / ps.length, tg = clamp(ax - W * 0.42, this.camX, this.camMax); this.camX += (tg - this.camX) * Math.min(1, dt * 5); if (this.camMax - this.camX < 1.5 && tg >= this.camMax) this.camX = this.camMax; }
    this.bg.litX += (this.litTarget - this.bg.litX) * Math.min(1, dt * 2.5);
    const dark = this.boss && this.boss.def.final && this.boss.phase >= 3 && !this.boss.dead;
    this.darkA += ((dark ? 1 : 0) - this.darkA) * Math.min(1, dt * 2);
  }
  separate() {
    const es = this.ents;
    for (let i = 0; i < es.length; i++) {
      const a = es[i]; if (a.team !== 'foe' || a.isBoss || a.state !== 'idle' || a.z > 0) continue;
      for (let j = i + 1; j < es.length; j++) {
        const b = es[j]; if (b.team !== 'foe' || b.isBoss || b.state !== 'idle' || b.z > 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        if (Math.abs(dx) < 28 && Math.abs(dy) < 12) { const sx = dx >= 0 ? 0.7 : -0.7, sy = dy >= 0 ? 0.45 : -0.45; a.x -= sx; b.x += sx; a.y = clampY(a.y - sy); b.y = clampY(b.y + sy); }
      }
    }
  }
  flow(dt) {
    const foes = this.ents.reduce((n, e) => n + (e.team === 'foe' && !e.gone ? 1 : 0), 0);
    switch (this.mode) {
      case 'walk':
        if (this.camX >= this.camMax - 1) { if (this.seg < this.segs.length) { this.mode = 'fight'; this.nextWave(); this.waveGap = 0.7; } else this.startBoss(); }
        break;
      case 'fight':
        if (foes === 0 && this.pending === 0) {
          this.waveGap -= dt;
          if (this.waveGap <= 0) {
            this.waveGap = 0.7;
            if (!this.nextWave()) {
              this.litTarget = this.segs[this.seg].lock + W + 60;
              this.seg++; this.mode = 'walk'; this.goT = 3;
              this.camMax = this.seg < this.segs.length ? this.segs[this.seg].lock : this.bossLock; Sound.play('go');
            }
          }
        }
        break;
      case 'bossIntro': {
        const b = this.boss; if (b.x <= this.camX + W - 200) b.vx = 0;
        if (this.modeT > 2.6) { this.mode = 'boss'; b.vx = 0; b.inv = 0; b.set('idle', 'idle'); }
        break;
      }
      case 'bossDown':
        if (this.boss.gone) { this.mode = 'rescue'; this.modeT = 0; this.litTarget = this.width + 200; Sound.music('win'); }
        break;
      case 'rescue': {
        const cg = this.cage, gy = GROUND_TOP + 70;
        if (!cg.open) { cg.y += (gy - cg.y) * Math.min(1, dt * 4); if (this.modeT > 1.0) { cg.open = true; smoke(cg.x, gy, 30, 10); Sound.play('unlock'); const n = this.npc = new Fighter(cg.hero.look, cg.x, gy, 'npc'); n.setAnim('victory'); n.update = function (d) { this.animT += d; this.updPose(d); }; this.ents.push(n); } }
        for (const p of this.players) if (!p.out && p.state === 'idle') p.set('win', 'victory');
        if (this.modeT > 4.4) { this.mode = 'clear'; }
        break;
      }
    }
    if (this.players.every(p => p.out) && this.mode !== 'over' && this.mode !== 'rescue' && this.mode !== 'clear' && this.mode !== 'bossDown') { this.mode = 'over'; this.modeT = 0; Sound.music('over'); G.log.push({ ev: 'over', stage: this.idx, t: +this.time.toFixed(1), seg: this.seg, boss: this.boss ? +(this.boss.hp / this.boss.maxHp).toFixed(2) : null }); }
  }
  drawCage(c, cam) {
    const cg = this.cage, sx = cg.x - cam; if (sx < -80 || sx > W + 80) return;
    const y = cg.y + (cg.open ? 0 : Math.sin(G.t * 1.6) * 3);
    c.strokeStyle = '#2a2433'; c.lineWidth = 3; c.beginPath(); c.moveTo(sx, 0); c.lineTo(sx, y - 96); c.stroke();
    c.fillStyle = '#6d5a2e'; rrect(c, sx - 34, y - 100, 68, 10, 4); c.fill(); rrect(c, sx - 34, y - 6, 68, 10, 4); c.fill();
    if (!cg.open) {
      drawRig(c, cg.hero.look, samplePose(Math.floor(G.t) % 4 === 0 ? 'cast' : 'idle', G.t), sx, y - 8, Math.floor(G.t / 3) % 2 ? 1 : -1, { scale: 0.52 });
      c.strokeStyle = '#c9a25a'; c.lineWidth = 2.5; for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(sx + i * 10, y - 92); c.quadraticCurveTo(sx + i * 13.5, y - 48, sx + i * 10, y - 4); c.stroke(); }
      if (Math.floor(G.t / 2.5) % 2 === 0 && this.mode !== 'rescue') { rrect(c, sx + 34, y - 112, 66, 28, 8); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 2; c.strokeStyle = INK; c.stroke(); txt(c, '救命！', sx + 67, y - 97, 15, INK, 'center'); }
    }
  }
  draw(c) {
    const cam = this.camX;
    c.save();
    if (this.shake > 0.3) c.translate(rand(-1, 1) * this.shake, rand(-1, 1) * this.shake);
    drawBg(c, this.bg, cam, G.t);
    this.drawCage(c, cam);
    drawMarks(c, cam);
    const list = [];
    for (const e of this.ents) list.push([e.y, e]);
    for (const p of this.pets) list.push([p.y, p]);
    for (const p of this.props) list.push([p.y, p, drawProp]);
    for (const p of this.items) list.push([p.y, p, drawItem]);
    for (const p of this.projs) list.push([p.y + 1, p, drawProj]);
    list.sort((a, b) => a[0] - b[0]);
    for (const d of list) { if (d[2]) d[2](c, d[1], cam); else d[1].draw(c, cam); }
    drawFx(c, cam);
    drawAmb(c, this.bg, cam, G.t);
    c.restore();
    drawTint(c, this.bg);
    if (this.darkA > 0.02) this.drawDark(c, cam);
  }
  // 最终头目第三阶段：全场熄灯，只有人和头目周围有光
  drawDark(c, cam) {
    const d = this.darkCv || (this.darkCv = Object.assign(document.createElement('canvas'), { width: W / 2, height: H / 2 })), x = d.getContext('2d');
    x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, d.width, d.height); x.fillStyle = `rgba(4,2,14,${0.74 * this.darkA})`; x.fillRect(0, 0, d.width, d.height);
    x.globalCompositeOperation = 'destination-out';
    const hole = (px, py, r) => { const g = x.createRadialGradient(px / 2, py / 2, r * 0.1, px / 2, py / 2, r / 2); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.45, 'rgba(0,0,0,.9)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.beginPath(); x.arc(px / 2, py / 2, r / 2, 0, TAU); x.fill(); };
    for (const p of this.players) if (!p.out) hole(p.x - cam, p.y - p.z - 50, 270);
    if (this.boss && !this.boss.hidden) hole(this.boss.x - cam, this.boss.y - this.boss.z - 80, 210);
    for (const m of this.marks) if (m.kind === 'circle') hole(m.x - cam, m.y, m.r * 1.6);
    for (const p of this.projs) hole(p.x - cam, p.y - p.z, 70);
    c.drawImage(d, 0, 0, W, H);
    for (const m of this.marks) if (m.kind === 'lane') { c.fillStyle = 'rgba(255,60,60,.35)'; c.fillRect(0, m.y - m.r, W, m.r * 2); }
  }
}
