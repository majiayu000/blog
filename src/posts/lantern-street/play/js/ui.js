'use strict';
// 界面：战斗 HUD + 标题 / 选人 / 地图 / 结算 / 结局

const KEY_HELP = [
  ['一号键盘', 'WASD 移动 · J 轻击 · L 重击 · K 跳 · 空格 冲刺 · U 必杀'],
  ['二号键盘', '方向键 移动 · , 轻击 · / 重击 · . 跳 · 右Shift 冲刺 · ; 必杀'],
  ['手柄', '摇杆 移动 · X 轻击 · Y 重击 · A 跳 · B 冲刺 · RB 必杀 · Start 暂停'],
];
const TIPS = ['轻击连按三下，第三下把人踢飞', '重击能破锅盖兵的防、打动大块头', '冲刺的前一小段是无敌的，用来穿过攻击', '头目头顶冒「!」就是要出招，地上变红的地方别站', '把头目打出「破绽」后它会晕住，这时伤害更高', '点火怪被打死会炸到它的同伙'];

function panel(c, x, y, w, h, stroke) { rrect(c, x, y, w, h, 12); c.fillStyle = 'rgba(20,12,30,.8)'; c.fill(); c.lineWidth = 2; c.strokeStyle = stroke || '#6d5a8a'; c.stroke(); }
function dim(c, a) { c.fillStyle = `rgba(8,4,16,${a})`; c.fillRect(0, 0, W, H); }
function rankOf(idx, time, hits) { const par = 105 + idx * 14; return time <= par && hits <= 5 ? 'S' : time <= par * 1.35 && hits <= 12 ? 'A' : time <= par * 1.8 && hits <= 24 ? 'B' : 'C'; }
const RANK_C = { S: '#ffd23f', A: '#8dff9a', B: '#6ec6ff', C: '#cfcfe8' };

function drawHUD(c) {
  const pw = 228;
  S.players.forEach((p, i) => {
    const x = 12 + i * (pw + 8), y = 10;
    rrect(c, x, y, pw, 58, 10); c.fillStyle = 'rgba(20,12,30,.74)'; c.fill(); c.lineWidth = 2; c.strokeStyle = p.color; c.stroke();
    drawPortrait(c, p.hero.look, x + 30, y + 29, 22, p.color, p.out ? '#3a3048' : null);
    txt(c, (i + 1) + 'P ' + p.hero.name, x + 60, y + 14, 14, '#fff', 'left', true);
    const f = p.hp / p.maxHp, full = p.meter >= 100;
    bar(c, x + 60, y + 27, 120, 10, f, f > 0.3 ? '#5fd38d' : '#ff5d5d');
    bar(c, x + 60, y + 44, 120, 6, p.meter / 100, full ? (Math.floor(G.t * 8) % 2 ? '#fff' : '#ffd23f') : '#4da3ff');
    txt(c, '♥×' + p.lives, x + 188, y + 31, 13, '#ff8fb1', 'left', true);
    if (full) txt(c, '必杀', x + 188, y + 47, 12, '#ffd23f', 'left', true);
    if (p.out) txt(c, '倒下了', x + 120, y + 31, 16, '#ff8f8f', 'center', true);
    if (p.combo >= 3) txt(c, p.combo + ' 连击', x + 60, y + 78, 16 + Math.min(8, p.combo / 4), p.color, 'left', true);
    if (p.buff > 0) txt(c, '辣椒 ' + Math.ceil(p.buff), x + 150, y + 78, 13, '#ff7b3a', 'left', true);
  });
  txt(c, '第' + (S.idx + 1) + '关 ' + S.def.name + '  ' + fmtTime(S.time), W - 12, H - 28, 13, 'rgba(255,255,255,.85)', 'right', true);
  const b = S.boss;
  if (b && !b.gone && S.mode !== 'bossIntro') {
    const bw = 560, bx = (W - bw) / 2, by = H - 30;
    txt(c, b.def.name, bx, by - 14, 15, '#ffb3b3', 'left', true);
    if (b.phase > 1) txt(c, b.phase > 2 ? '彻底发狂' : '发怒', bx + bw, by - 14, 13, '#ff5340', 'right', true);
    bar(c, bx, by, bw, 12, b.hp / b.maxHp, '#e84a5f');
    c.fillStyle = INK; for (const th of b.def.phases) c.fillRect(bx + bw * th - 1, by - 2, 3, 16);
    bar(c, bx, by + 17, bw, 4, b.dizzy > 0 ? 1 : b.stag / b.stagMax, b.dizzy > 0 ? '#fff' : '#ffd23f');
  }
  if (S.goT > 0 && Math.floor(G.t * 5) % 2) { txt(c, '前进', W - 96, 250, 30, '#ffd23f', 'right', true); c.beginPath(); c.moveTo(W - 84, 232); c.lineTo(W - 44, 250); c.lineTo(W - 84, 268); c.closePath(); c.fillStyle = '#ffd23f'; c.fill(); c.lineWidth = 4; c.strokeStyle = INK; c.stroke(); }
  if (S.banner) { const k = S.banner.t, a = k < 0.3 ? k / 0.3 : k > 2 ? (2.4 - k) / 0.4 : 1, off = (1 - ease(Math.min(1, k / 0.3))) * -120; c.globalAlpha = a; c.fillStyle = 'rgba(20,12,30,.7)'; c.fillRect(0, 180, W, 110); txt(c, S.banner.a, W / 2 + off, 212, 22, '#ffd23f', 'center', true); txt(c, S.banner.b, W / 2 - off, 252, 46, '#fff', 'center', true); c.globalAlpha = 1; }
  if (S.mode === 'bossIntro') {
    const k = S.modeT, a = k < 0.3 ? k / 0.3 : k > 2.2 ? Math.max(0, (2.6 - k) / 0.4) : 1; c.globalAlpha = a;
    c.fillStyle = 'rgba(40,6,14,.8)'; c.fillRect(0, 170, W, 130); c.fillStyle = '#e84a5f'; c.fillRect(0, 170, W, 4); c.fillRect(0, 296, W, 4);
    txt(c, '头目出现', W / 2, 198, 18, '#ffb3b3', 'center', true); txt(c, b.def.name, W / 2, 236, 44, '#fff', 'center', true); txt(c, '「' + b.def.line + '」', W / 2, 276, 17, '#ffd9a0', 'center', true); c.globalAlpha = 1;
  }
  if (S.mode === 'rescue' && S.cage.open) {
    const h = S.cage.hero; panel(c, W / 2 - 250, 96, 500, 118, '#ffd23f'); drawPortrait(c, h.look, W / 2 - 196, 155, 38, '#ffd23f');
    txt(c, '救出了 ' + h.name + '！', W / 2 - 140, 126, 26, '#ffd23f', 'left', true); txt(c, h.tag + ' · 现在可以选用', W / 2 - 140, 156, 15, '#fff', 'left'); txt(c, '「' + h.quote + '」', W / 2 - 140, 184, 14, '#ffd9a0', 'left');
  }
  if (S.cutin) {
    const k = S.cutin.t, p = S.cutin.p, sl = ease(Math.min(1, k / 0.18)), a = k > 0.8 ? (1 - k) / 0.2 : 1; c.globalAlpha = Math.max(0, a);
    c.save(); c.translate(0, 300); c.rotate(-0.06); c.fillStyle = p.color; c.fillRect(-20, -44, (W + 40) * sl, 88); c.fillStyle = 'rgba(20,12,30,.85)'; c.fillRect(-20, -38, (W + 40) * sl, 76);
    drawPortrait(c, p.hero.look, 120 * sl, 0, 46, p.color); txt(c, p.hero.spName, 190, 0, 44, '#fff', 'left', true); txt(c, p.hero.name, 190, -34, 15, p.color, 'left', true);
    c.restore(); c.globalAlpha = 1;
  }
  if (S.idx === 0 && S.time < 10 && S.mode !== 'over' && !Bot.n) { panel(c, W / 2 - 330, H - 66, 660, 30); txt(c, KEY_HELP[0][1] + ' · Esc 暂停', W / 2, H - 50, 14, '#fff', 'center'); }
}

function drawHero(c, h, x, y, k, t, locked, anim) { drawRig(c, h.look, samplePose(anim || 'idle', t), x, y, 1, { scale: k, sil: locked ? '#1c1528' : null, t }); }

const Screens = {
  // ---------- 标题 ----------
  title: {
    enter() { Sound.music('title'); Input.merge = true; this.bg = this.bg || makeBg('street', 99, 9000); },
    update() { const d = Input.who('atk', 'jump', 'start'); if (d && G.st > 0.3) { G.p1dev = d; Sound.play('ok'); go('select'); } },
    draw(c) {
      drawBg(c, this.bg, (G.t * 26) % 8000, G.t);
      const un = HEROES.filter((h, i) => heroUnlocked(i));
      un.forEach((h, i) => { const x = W / 2 - (un.length - 1) * 40 + i * 80, y = 398 + (i % 2) * 20; shadow(c, x, y, 18); drawHero(c, h, x, y, 0.9, G.t + i * 0.17, false, 'walk'); });
      drawAmb(c, this.bg, 0, G.t); drawTint(c, this.bg); dim(c, 0.18);
      lantern(c, 232, 88, '#ff5a3c', true, 2.3); lantern(c, W - 232, 88, '#ff5a3c', true, 2.3);
      txt(c, '灯笼街保卫战', W / 2, 88, 78, '#ffd23f', 'center', '#5a1f2a'); txt(c, '灯笼街保卫战', W / 2, 84, 78, '#fff4c4', 'center');
      rrect(c, W / 2 - 300, 132, 600, 116, 14); c.fillStyle = 'rgba(20,12,30,.55)'; c.fill();
      txt(c, '元宵前夜，熄灯帮掐灭了整条街的灯，还把街坊关进了笼子', W / 2, 154, 17, '#fff', 'center', true);
      if (Math.floor(G.t * 2) % 2) txt(c, '按 J / 回车 / 手柄 A 开始', W / 2, 196, 26, '#fff', 'center', true);
      txt(c, '已救出 ' + Math.min(8, Save.d.cleared) + ' / 8 位街坊 · 最多 4 人同屏 · Esc 暂停 · M 静音', W / 2, 230, 14, '#ffd9a0', 'center', true);
      panel(c, W / 2 - 320, 438, 640, 84); KEY_HELP.forEach((r, i) => { txt(c, r[0], W / 2 - 304, 458 + i * 23, 13, '#ffd23f', 'left'); txt(c, r[1], W / 2 - 230, 458 + i * 23, 13, '#fff', 'left', false, 600); });
    },
  },
  // ---------- 选人 ----------
  select: {
    enter() { Input.merge = false; const keep = G.picks.find(p => p.dev === G.p1dev); this.ps = [{ dev: G.p1dev, cur: keep ? keep.hero : 0, ready: false, fresh: true }]; this.focus = 0; this.doneT = 0; },
    update(dt) {
      for (const id in Input.devs) { if (this.ps.some(p => p.dev === id) || this.ps.length >= 4) continue; if (Input.ok(id)) { this.ps.push({ dev: id, cur: this.ps.length % START_HEROES, ready: false, fresh: true }); Sound.play('ok'); } }
      for (let i = this.ps.length - 1; i >= 0; i--) {
        const p = this.ps[i], d = Input.get(p.dev); if (p.fresh) { p.fresh = false; continue; }
        let l = d.pl, r = d.pr, u = d.pu, dn = d.pd;
        if (p.dev === 'k1' && !this.ps.some(q => q.dev === 'k2')) { const k = Input.get('k2'); l = l || k.pl; r = r || k.pr; u = u || k.pu; dn = dn || k.pd; }
        if (!p.ready) {
          let cur = p.cur; if (l) cur = cur % 5 === 0 ? cur + 4 : cur - 1; if (r) cur = cur % 5 === 4 ? cur - 4 : cur + 1; if (u || dn) cur = (cur + 5) % 10;
          if (cur !== p.cur) { p.cur = cur; this.focus = i; Sound.play('ui'); }
          if (Input.ok(p.dev)) { if (heroUnlocked(p.cur)) { p.ready = true; this.focus = i; Sound.play('ok'); } else Sound.play('back'); }
          else if (Input.back(p.dev)) { Sound.play('back'); if (i > 0) this.ps.splice(i, 1); else { go('title'); return; } }
        } else if (Input.back(p.dev)) { p.ready = false; Sound.play('back'); }
      }
      if (this.ps.every(p => p.ready)) {
        this.doneT += dt;
        if (this.doneT > 0.5) { G.picks = this.ps.map(p => ({ dev: p.dev, hero: p.cur })); Input.merge = !G.picks.some(p => p.dev === 'k2'); G.mapSel = Math.min(Save.d.cleared, 7); go('map'); }
      } else this.doneT = 0;
    },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#241640'); g.addColorStop(1, '#4a2140'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      txt(c, '选择出战的街坊', W / 2, 34, 28, '#ffd23f', 'center', true);
      HEROES.forEach((h, i) => {
        const x = 36 + (i % 5) * 180, y = 62 + Math.floor(i / 5) * 162, ok = heroUnlocked(i);
        rrect(c, x, y, 168, 150, 12); c.fillStyle = ok ? 'rgba(255,244,220,.12)' : 'rgba(0,0,0,.3)'; c.fill(); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,.18)'; c.stroke();
        const tall = rigHeight(h.look) + (h.look.hat === 'chef' ? 26 : 0);
        shadow(c, x + 84, y + 122, 22); drawHero(c, h, x + 84, y + 122, Math.min(0.9, 96 / tall), G.t + i, !ok);
        txt(c, ok ? h.name : '？？？', x + 84, y + 137, 15, ok ? '#fff' : '#8a7da0', 'center', true);
        if (!ok) txt(c, '第 ' + (i - START_HEROES + 1) + ' 关救出', x + 84, y + 16, 12, '#b3a6c9', 'center');
      });
      this.ps.forEach((p, i) => {
        const x = 36 + (p.cur % 5) * 180, y = 62 + Math.floor(p.cur / 5) * 162, o = i * 3;
        rrect(c, x - 3 + o, y - 3 + o, 174 - o * 2, 156 - o * 2, 13); c.lineWidth = p.ready ? 5 : 3; c.strokeStyle = PCOL[i]; if (!p.ready) c.setLineDash([10, 6]); c.lineDashOffset = -G.t * 30; c.stroke(); c.setLineDash([]);
        rrect(c, x + 6 + i * 40, y + 6, 36, 20, 6); c.fillStyle = PCOL[i]; c.fill(); txt(c, (i + 1) + 'P' + (p.ready ? '✓' : ''), x + 24 + i * 40, y + 17, 13, INK, 'center');
      });
      const f = this.ps[Math.min(this.focus, this.ps.length - 1)], h = HEROES[f.cur], ok = heroUnlocked(f.cur);
      panel(c, 36, 392, 620, 112);
      if (ok) {
        drawPortrait(c, h.look, 86, 448, 36, PCOL[this.ps.indexOf(f)]);
        txt(c, h.name, 136, 414, 22, '#fff', 'left', true); txt(c, h.tag, 136 + h.name.length * 24 + 8, 416, 14, '#ffd9a0', 'left');
        [['体力', h.hp / 140, '#5fd38d'], ['速度', h.spd / 225, '#4da3ff'], ['力量', h.pow / 1.3, '#ff7b3a']].forEach((s, i) => { txt(c, s[0], 136 + i * 150, 442, 12, '#cfcfe8', 'left'); bar(c, 168 + i * 150, 437, 96, 8, s[1], s[2]); });
        txt(c, '必杀「' + h.spName + '」', 136, 468, 15, '#ffd23f', 'left', true); txt(c, h.spDesc, 136, 490, 13, '#fff', 'left', false, 600);
      } else txt(c, '这位街坊还被关在第 ' + (f.cur - START_HEROES + 1) + ' 关的笼子里', 346, 448, 18, '#b3a6c9', 'center');
      panel(c, 668, 392, 256, 112);
      for (let i = 0; i < 4; i++) { const p = this.ps[i]; txt(c, (i + 1) + 'P', 682, 412 + i * 24, 14, PCOL[i], 'left', true); txt(c, p ? (DEV_NAME[p.dev] || p.dev) + (p.ready ? '  已就绪' : '  选择中…') : '按攻击键加入', 716, 412 + i * 24, 13, p ? '#fff' : '#8a7da0', 'left', false, 600); }
      txt(c, 'J / X 确认 · L / Y 返回 · 二号键盘按 , 加入 · 手柄按 X 加入', W / 2, 522, 13, '#cfcfe8', 'center');
    },
  },
  // ---------- 地图 ----------
  map: {
    pos(i) { return [100 + i * 108, 236 + Math.sin(i * 1.25) * 58]; },
    enter() { Sound.music('title'); G.mapSel = clamp(G.mapSel, 0, Math.min(Save.d.cleared, 7)); },
    update() {
      const max = Math.min(Save.d.cleared, 7);
      for (const p of G.picks) {
        const d = Input.get(p.dev);
        if (d.pl && G.mapSel > 0) { G.mapSel--; Sound.play('ui'); }
        if (d.pr && G.mapSel < max) { G.mapSel++; Sound.play('ui'); }
        if (Input.ok(p.dev) && G.st > 0.3) { Sound.play('ok'); go('play', G.mapSel); return; }
        if (Input.back(p.dev)) { Sound.play('back'); go('select'); return; }
      }
    },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0f1235'); g.addColorStop(1, '#3a1f4a'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(255,255,255,${0.3 + 0.3 * Math.sin(G.t + i)})`; c.fillRect((i * 173) % W, (i * 97) % 300, 1.5, 1.5); }
      txt(c, '灯笼街地图', W / 2, 40, 28, '#ffd23f', 'center', true);
      c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 4; c.setLineDash([4, 10]); c.lineCap = 'round'; c.beginPath(); for (let i = 0; i < 8; i++) { const p = this.pos(i); if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); } c.stroke(); c.setLineDash([]);
      for (let i = 0; i < 8; i++) {
        const p = this.pos(i), done = Save.d.cleared > i, open = Save.d.cleared >= i, sel = G.mapSel === i, k = sel ? 2 + Math.sin(G.t * 6) * 0.15 : 1.5;
        lantern(c, p[0], p[1], i === 7 ? '#ffd23f' : '#ff5a3c', done, k);
        if (open && !done) glow(c, p[0], p[1], 40, '#ffffff', 0.2 + 0.15 * Math.sin(G.t * 4));
        txt(c, open ? STAGES[i].name : '？？？', p[0], p[1] + 46, 13, sel ? '#fff' : open ? '#cfcfe8' : '#6d6485', 'center', true);
        const b = Save.d.best[i]; if (b) txt(c, b.rank, p[0] + 22, p[1] - 22, 16, RANK_C[b.rank], 'center', true);
        if (sel) { c.beginPath(); c.moveTo(p[0] - 9, p[1] - 58); c.lineTo(p[0] + 9, p[1] - 58); c.lineTo(p[0], p[1] - 44); c.closePath(); c.fillStyle = '#ffd23f'; c.fill(); }
      }
      const i = G.mapSel, st = STAGES[i], bs = BOSSES[i], h = HEROES[i + START_HEROES], done = Save.d.cleared > i, b = Save.d.best[i];
      panel(c, 120, 366, 720, 124);
      txt(c, '第 ' + (i + 1) + ' 关 · ' + st.name, 144, 392, 24, '#fff', 'left', true);
      txt(c, '头目：' + bs.name, 144, 426, 16, '#ffb3b3', 'left'); txt(c, '「' + bs.line + '」', 144, 452, 14, '#ffd9a0', 'left', false, 600);
      txt(c, b ? '最佳 ' + fmtTime(b.time) + ' · 评价 ' + b.rank : '尚未通关', 144, 476, 13, '#cfcfe8', 'left');
      drawPortrait(c, h.look, 760, 420, 34, done ? '#ffd23f' : '#6d5a8a', done ? null : '#1c1528');
      txt(c, done ? h.name + ' 已救出' : '笼子里关着一位街坊', 760, 470, 13, done ? '#ffd23f' : '#b3a6c9', 'center');
      G.picks.forEach((p, k) => drawPortrait(c, HEROES[p.hero].look, 880 - k * 40, 40, 16, PCOL[k]));
      txt(c, '← → 选关 · J / X 出发 · L / Y 换角色', W / 2, 514, 13, '#cfcfe8', 'center');
    },
  },
  // ---------- 战斗 ----------
  play: {
    enter(idx) { G.stageIdx = idx; this.paused = false; new Stage(idx, G.picks); },
    update(dt) {
      if (S.mode !== 'over' && S.mode !== 'clear' && Input.who('start')) { this.paused = !this.paused; Sound.play('ui'); }
      if (this.paused) { if (Input.who('heavy')) { this.paused = false; go('map'); } return; }
      S.update(dt);
      if (S.mode === 'clear') return go('result');
      if (S.mode === 'over' && S.modeT > 1.2) { if (Input.who('atk', 'jump')) this.enter(G.stageIdx); else if (Input.who('heavy')) go('map'); }
    },
    draw(c) {
      S.draw(c); drawHUD(c);
      if (S.mode === 'over') { dim(c, Math.min(0.7, S.modeT * 0.6)); txt(c, '灯灭了……', W / 2, 220, 60, '#cfcfe8', 'center', true); if (S.modeT > 1.2) { txt(c, 'J / X 再来一次', W / 2, 300, 24, '#ffd23f', 'center', true); txt(c, 'L / Y 回地图换人', W / 2, 336, 18, '#fff', 'center', true); } }
      if (this.paused) {
        dim(c, 0.72); txt(c, '暂停', W / 2, 96, 50, '#ffd23f', 'center', true);
        panel(c, W / 2 - 330, 140, 660, 96); KEY_HELP.forEach((r, i) => { txt(c, r[0], W / 2 - 312, 164 + i * 26, 13, '#ffd23f', 'left'); txt(c, r[1], W / 2 - 238, 164 + i * 26, 13, '#fff', 'left', false, 600); });
        panel(c, W / 2 - 330, 250, 660, 170); TIPS.forEach((s, i) => txt(c, '· ' + s, W / 2 - 310, 272 + i * 25, 14, '#fff', 'left', false, 600));
        txt(c, 'Esc / Start 继续 · L / Y 退出到地图 · M 静音', W / 2, 452, 16, '#cfcfe8', 'center', true);
      }
    },
  },
  // ---------- 结算 ----------
  result: {
    enter() {
      const idx = G.stageIdx, time = S.time, hits = S.stats.hits, rank = rankOf(idx, time, hits), first = Save.d.cleared <= idx, old = Save.d.best[idx];
      const isBest = !old || time < old.time;
      if (first) Save.d.cleared = idx + 1;
      if (isBest) Save.d.best[idx] = { time: +time.toFixed(1), rank: old && 'SABC'.indexOf(old.rank) < 'SABC'.indexOf(rank) ? old.rank : rank };
      else if ('SABC'.indexOf(rank) < 'SABC'.indexOf(old.rank)) old.rank = rank;
      Save.store();
      this.r = { idx, time, hits, rank, first, isBest, combo: S.stats.maxCombo, kos: S.stats.kos };
      G.log.push({ ev: 'clear', stage: idx, t: +time.toFixed(1), hits, rank, combo: S.stats.maxCombo, lives: S.players.map(p => p.out ? -1 : p.lives), heroes: S.players.map(p => p.hero.id) });
    },
    update() { if (G.st > 0.8 && Input.who('atk', 'jump', 'start')) { Sound.play('ok'); if (this.r.idx === 7) go('ending'); else { G.mapSel = this.r.idx + 1; go('map'); } } },
    draw(c) {
      S.draw(c); dim(c, 0.62);
      const r = this.r, h = HEROES[r.idx + START_HEROES];
      txt(c, '第 ' + (r.idx + 1) + ' 关 ' + STAGES[r.idx].name + ' · 夺回！', W / 2, 70, 36, '#ffd23f', 'center', true);
      panel(c, 150, 120, 380, 280);
      [['用时', fmtTime(r.time) + (r.isBest ? '  新纪录' : '')], ['挨打次数', r.hits], ['最高连击', r.combo], ['击倒', r.kos]].forEach((s, i) => { txt(c, s[0], 180, 160 + i * 46, 18, '#cfcfe8', 'left'); txt(c, String(s[1]), 500, 160 + i * 46, 22, '#fff', 'right', true); });
      txt(c, '评价', 180, 356, 18, '#cfcfe8', 'left'); txt(c, r.rank, 480, 350, 64 + Math.sin(G.t * 5) * 3, RANK_C[r.rank], 'center', true);
      panel(c, 560, 120, 250, 280, '#ffd23f');
      txt(c, r.first ? '新街坊加入' : '街坊', 685, 146, 16, '#ffd23f', 'center'); shadow(c, 685, 304, 26); drawHero(c, h, 685, 304, Math.min(1.05, 118 / (rigHeight(h.look) + (h.look.hat === 'chef' ? 26 : 0))), G.t, false, 'victory');
      txt(c, h.name, 685, 330, 22, '#fff', 'center', true); txt(c, h.tag, 685, 356, 13, '#ffd9a0', 'center'); txt(c, '必杀「' + h.spName + '」', 685, 380, 13, '#ffd23f', 'center');
      if (G.st > 0.8 && Math.floor(G.t * 2) % 2) txt(c, r.idx === 7 ? 'J / X 看结局' : 'J / X 继续', W / 2, 446, 22, '#fff', 'center', true);
      txt(c, '提示：' + TIPS[r.idx % TIPS.length], W / 2, 492, 14, '#cfcfe8', 'center');
    },
  },
  // ---------- 结局 ----------
  ending: {
    enter() { Sound.music('title'); this.bg = makeBg('roof', 8, 3620); G.log.push({ ev: 'ending' }); },
    update() { if (G.st > 3 && Input.who('atk', 'jump', 'start')) { Sound.play('ok'); go('title'); } },
    draw(c) {
      drawBg(c, this.bg, 2400, G.t);
      for (let k = 0; k < 5; k++) {
        const T = 2.2, tt = G.st + k * 0.73, n = Math.floor(tt / T), ph = (tt % T) / T, R = seeded(n * 31 + k * 7 + 1), cx = 100 + R() * (W - 200), cy = 50 + R() * 150, col = pick2(R, ['#ffd23f', '#ff8fb1', '#6ec6ff', '#8dff9a', '#ff7b3a']);
        c.fillStyle = col; c.globalAlpha = Math.max(0, 1 - ph);
        for (let i = 0; i < 26; i++) { const a = i / 26 * TAU, rr = ease(Math.min(1, ph * 1.4)) * (60 + (i % 3) * 22); c.beginPath(); c.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr + ph * ph * 30, 2.6, 0, TAU); c.fill(); }
        c.globalAlpha = 1;
      }
      const ly = Math.max(236, 330 - G.st * 40); lantern(c, W / 2, ly, '#ff5a3c', true, 5.5 + Math.sin(G.t * 2) * 0.1);
      HEROES.forEach((h, i) => { const x = 90 + i * 87, y = 440 + (i % 2) * 34; shadow(c, x, y, 20); drawHero(c, h, x, y, 1, G.t + i * 0.21, false, 'victory'); });
      drawTint(c, this.bg);
      txt(c, '大灯笼重新亮起来了', W / 2, 64, 46, '#ffd23f', 'center', true);
      if (G.st > 1.5) txt(c, '灯笼街的街坊一个不少，元宵节照常举行。', W / 2, 108, 18, '#fff', 'center', true);
      if (G.st > 3) { const tot = Object.values(Save.d.best).reduce((s, b) => s + b.time, 0); txt(c, (tot > 0 ? '全部关卡最佳用时合计 ' + fmtTime(tot) + ' · ' : '') + '老馆长已加入，可以回去刷评价', W / 2, H - 46, 15, '#ffd9a0', 'center', true); if (Math.floor(G.t * 2) % 2) txt(c, 'J / X 回到标题', W / 2, H - 20, 16, '#fff', 'center', true); }
    },
  },
};
function pick2(R, a) { return a[Math.floor(R() * a.length)]; }
