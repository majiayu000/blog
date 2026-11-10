'use strict';
// 自动玩家：网址加 ?bot=1（最多 4）让机器人代打，用来自动通关测试和演示
// 它只读场上公开的信息（红圈、红道、敌人位置），和人看到的一样

const Bot = {
  n: clamp(+(QS.get('bot') || 0), 0, 4), s: [], mt: 0,
  dumb: !!QS.get('dumb'), // 笨模式：不躲不防，只会走过去连按轻击，用来验证「无脑连按过不了关」
  heroes: (QS.get('heroes') || '').split(',').filter(Boolean).map(Number),
  dev(i) { return Input.devs['bot' + i] || (Input.devs['bot' + i] = Input.mk()); },
  update(dt) {
    if (!this.n) return;
    this.mt -= dt; const tick = this.mt <= 0; if (tick) this.mt = 0.3;
    for (let i = 0; i < this.n; i++) {
      const d = this.dev(i);
      d.mx = d.my = 0; d.pl = d.pr = d.pu = d.pd = false; for (const b of BTNS) d[b] = false;
      if (G.state === 'play' && S && S.mode !== 'over' && !Screens.play.paused) this.fight(i, d, dt);
      else if (tick) this.menu(i, d);
    }
  },
  want(i) {
    if (this.heroes[i] != null && heroUnlocked(this.heroes[i])) return this.heroes[i];
    const un = HEROES.map((h, k) => k).filter(heroUnlocked);
    return un[((un.length - 1 - i) % un.length + un.length) % un.length]; // 默认让一号机器人用最新救出的角色
  },
  menu(i, d) {
    if (G.state === 'select') {
      const me = Screens.select.ps.find(p => p.dev === 'bot' + i);
      if (!me) { d.atk = true; return; }
      if (me.ready) return;
      const w = this.want(i);
      if (Math.floor(me.cur / 5) !== Math.floor(w / 5)) d.pd = true; else if (me.cur !== w) d.pr = true; else d.atk = true;
    } else if (i === 0) {
      // 在地图上发现有更新的角色可用，就回去换人
      if (G.state === 'map' && !this.dumb && G.picks[0] && G.picks[0].hero !== this.want(0)) d.heavy = true; else d.atk = true;
    }
  },
  safeY(p) {
    let best = null, bd = 1e9;
    for (let y = GROUND_TOP + 8; y <= GROUND_BOT - 6; y += 5) {
      if (S.marks.some(m => m.kind === 'lane' && Math.abs(y - m.y) < m.r + 13)) continue;
      const dd = Math.abs(y - p.y); if (dd < bd) { bd = dd; best = y; }
    }
    return best;
  },
  fight(i, d, dt) {
    const p = S.players.find(q => q.dev === 'bot' + i); if (!p || p.out || p.dead) return;
    const st = this.s[i] || (this.s[i] = { tap: 0 }); st.tap -= dt;
    const press = b => { if (st.tap <= 0) { d[b] = true; st.tap = 0.1; } };
    if (this.dumb) {
      const e = S.foes().filter(q => !q.hidden).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
      if (!e) { if (S.mode === 'walk') d.mx = 1; return; }
      const dx = e.x - p.x; if (Math.abs(e.y - p.y) > 9) d.my = sgn(e.y - p.y);
      if (Math.abs(dx) > p.reach) d.mx = sgn(dx); else if (p.face !== sgn(dx)) d.mx = sgn(dx) * 0.2;
      press('atk'); return;
    }
    // 1. 躲危险
    let ax = 0, ay = 0, danger = false, urgent = false, laneIn = false;
    for (const m of S.marks) {
      if (m.kind === 'circle') { const dx = p.x - m.x, dy = (p.y - m.y) * 2, r = m.r + 36; if (dx * dx + dy * dy < r * r) { danger = true; const l = Math.hypot(dx, dy) || 1; ax += dx / l || 1; ay += dy / l; if (m.dur - m.t < 0.35) urgent = true; } }
      else if (Math.abs(p.y - m.y) < m.r + 13) { laneIn = true; if (m.dur - m.t < 0.22) press('jump'); }
    }
    if (laneIn) { const sy = this.safeY(p); danger = true; if (sy != null) ay += sgn(sy - p.y) * 2; }
    const b = S.boss;
    if (b && !b.dead && b.state === 'move') {
      const bdx = p.x - b.x, bdy = p.y - b.y;
      if (b.mv === 'spin' && b.mp === 1 && Math.hypot(bdx, bdy * 2) < 200) { danger = true; ax += sgn(bdx); ay += sgn(bdy || 1) * 0.6; }
      if (b.mv === 'charge' && b.mp === 1 && Math.abs(bdy) < 50) { danger = true; urgent = true; ay += (bdy >= 0 ? 1 : -1) * 2; }
      if ((b.mv === 'melee' || (b.mv === 'blink' && b.mp >= 2)) && b.mp < (b.mv === 'melee' ? 1 : 3) && Math.abs(bdx) < 80 * b.sc + 40 && Math.abs(bdy) < 48) { danger = true; ax += sgn(bdx || 1) * 2; if (b.st > 0.2) urgent = true; }
    }
    for (const e of S.ents) {
      if (e.team !== 'foe' || e.dead) continue;
      if (e.fuse != null && Math.hypot(e.x - p.x, (e.y - p.y) * 2) < 135) { danger = true; ax += sgn(p.x - e.x) * 2; ay += sgn(p.y - e.y || 1); if (e.fuse < 0.5) urgent = true; }
      if (e.act === ACTS.rush && e.state === 'act' && e.actP < 2 && Math.abs(p.y - e.y) < 26 && (p.x - e.x) * e.face > 0 && Math.abs(p.x - e.x) < 320) { danger = true; ay += (p.y >= e.y ? 1 : -1) * 2; }
    }
    for (const q of S.projs) {
      if (q.team !== 'foe' || q.noDirect || !q.vx) continue;
      const dx = p.x - q.x; if (dx * q.vx <= 0 || Math.abs(dx) > 170) continue;
      const py = q.y + q.vy * (dx / q.vx); if (Math.abs(p.y - py) < 26) { danger = true; ay += (p.y >= py ? 1 : -1) * 2; }
    }
    if (danger) {
      if (p.y < GROUND_TOP + 16 && ay < 0) ay = 2; if (p.y > GROUND_BOT - 14 && ay > 0) ay = -2;
      if (p.x < S.camX + 60 && ax < 0) ax = 0.2; if (p.x > S.camX + W - 60 && ax > 0) ax = -0.2;
      d.mx = clamp(ax, -1, 1); d.my = clamp(ay, -1, 1);
      if (urgent && p.dashCd <= 0 && p.state === 'idle') d.dash = true;
      return;
    }
    // 2. 血少先吃包子
    const food = p.hp < p.maxHp * 0.55 && S.items.find(it => (it.kind === 'bun' || it.kind === 'feast') && it.x > S.camX && it.x < S.camX + W);
    const walkTo = (x, y) => { if (Math.abs(x - p.x) > 10) d.mx = sgn(x - p.x); if (Math.abs(y - p.y) > 8) d.my = sgn(y - p.y); };
    if (food) return walkTo(food.x, food.y);
    // 3. 找最近的敌人
    const foes = S.foes().filter(e => !e.hidden && e.x > S.camX - 20 && e.x < S.camX + W + 20);
    let tg = null, bd = 1e9;
    for (const e of foes) { let dd = Math.abs(e.x - p.x) + Math.abs(e.y - p.y) * 2 + i * 0; if (e.isBoss && foes.length > 1) dd += 160; if (dd < bd) { bd = dd; tg = e; } }
    if (!tg) {
      const it = S.items.find(q => q.x > S.camX && q.x < S.camX + W && !((q.kind === 'bun' || q.kind === 'feast') && p.hp >= p.maxHp));
      if (it) return walkTo(it.x, it.y);
      const cr = S.props.find(q => q.x > S.camX + 30 && q.x < S.camX + W - 30);
      if (cr && S.mode !== 'bossIntro') { const dx = cr.x - p.x; if (Math.abs(cr.y - p.y) > 8) d.my = sgn(cr.y - p.y); if (Math.abs(dx) > 50) d.mx = sgn(dx); else { if (p.face !== sgn(dx)) d.mx = sgn(dx) * 0.2; press('atk'); } return; }
      if (S.mode === 'walk') d.mx = 1;
      return;
    }
    const dx = tg.x - p.x, adx = Math.abs(dx), dy = tg.y - p.y, reach = p.reach + tg.radius - 10, flying = tg.z > 60;
    const forced = this.force && this.force[i]; // 录像用：不等凑够人数，贴近敌人就放必杀
    if (!this.noSpecial && p.meter >= 100 && p.state === 'idle' && (forced ? adx < 150 && Math.abs(dy) < 50 : (foes.length >= 3 || tg.isBoss) && adx < 320 && Math.abs(dy) < 60)) { d.special = true; return; }
    if (Math.abs(dy) > 9) d.my = sgn(dy);
    if (adx > reach) d.mx = sgn(dx); else if (adx < 24) d.mx = -sgn(dx); else if (p.face !== sgn(dx)) d.mx = sgn(dx) * 0.2;
    if (adx <= reach + 10 && Math.abs(dy) <= 13) {
      if (flying) { if (p.state === 'idle') press('jump'); else if (p.state === 'jump' && p.z > 36) press('atk'); }
      else if (tg.guardUp || (tg.d && tg.d.armor && !(tg.state === 'act' && tg.actP === 2))) press('heavy');
      else press('atk');
    }
  },
};
