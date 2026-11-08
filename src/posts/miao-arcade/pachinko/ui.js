// 招财弹珠界面：画布绘制 + DOM 面板。规则都在 engine.js。
(function () {
  const E = window.PachiEngine, cv = document.getElementById('cv'), g = cv.getContext('2d');
  const side = document.getElementById('side'), layer = document.getElementById('layer'), stage = document.getElementById('stage');
  const $ = h => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
  const meta = Object.assign({ catnip: 0, maxHeat: 0, runs: 0, wins: 0, bestRound: 0, bestScore: 0, bestBall: 0, seen: false, daily: {} }, store.get('pachi-meta', {}));
  const saveMeta = () => store.set('pachi-meta', meta);
  const img = n => { const i = new Image(); i.src = '../assets/' + n + '.png'; return i; };
  const SPR = { cat: img('cat-idle1'), cat2: img('cat-idle2'), dash: img('cat-dash'), fish: img('fish-icon') };
  const today = () => { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };

  let r = null, aimX = E.W / 2, betAmt = 0, heat = 0, flashes = new Map(), floats = [], trails = [], swats = [], slow = 1, flashT = 0, flashC = '#fff', combo = 0, boomRings = [], rendered = '', lastT = 0, acc = 0, pulse = 0;
  const save = () => { if (r && !r.over) store.set('pachi-run', r); else store.del('pachi-run'); };
  const pw = E.W / E.POCKETS;
  const POCKET_COL = m => m === 0 ? '#2a0f18' : m < 1 ? '#3a2a5e' : m < 2 ? '#2a4f7a' : m < 3 ? '#1f8a70' : m < 5 ? '#c07a1a' : '#e23a6e';

  // ===== 绘制 =====
  function draw(t) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, E.W, E.H);
    const bg = g.createLinearGradient(0, 0, 0, E.H); bg.addColorStop(0, '#1a0f3a'); bg.addColorStop(1, '#0b0620');
    g.fillStyle = bg; g.fillRect(0, 0, E.W, E.H);
    if (!r) return;
    // 袋子
    r.pockets.forEach((p, i) => {
      const m = E.pocketMult(r, i), x = i * pw, top = E.POCKET_TOP;
      g.fillStyle = POCKET_COL(m); g.fillRect(x + 1, top, pw - 2, E.H - top);
      g.fillStyle = m === 0 ? '#ff6d6d' : '#fff'; g.font = '900 20px "PingFang SC",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(m === 0 ? '黑袋' : '×' + m, x + pw / 2, top + 30);
      const bet = r.phase === 'flying' ? r.dropBet : r.bet;
      if (bet && bet.pocket === i && bet.amount) {
        g.fillStyle = '#ffc93c'; g.beginPath(); g.arc(x + pw / 2, top + 7, 13, 0, 7); g.fill();
        g.fillStyle = '#3a2300'; g.font = '900 13px sans-serif'; g.fillText('$' + bet.amount, x + pw / 2, top + 8);
      } else if (r.phase === 'aim' && betAmt > 0) { g.strokeStyle = '#ffc93c66'; g.setLineDash([4, 4]); g.lineWidth = 2; g.strokeRect(x + 4, top + 3, pw - 8, E.H - top - 6); g.setLineDash([]); }
      if (i > 0) { g.fillStyle = '#ffffff55'; g.fillRect(x - 1.5, top - 6, 3, E.H - top + 6); }
    });
    // 接球猫
    const c = r.catcher;
    g.fillStyle = '#5cf2d622'; g.fillRect(c.x - c.w / 2, E.CATCH_Y - 2, c.w, 8);
    g.fillStyle = '#5cf2d6'; g.fillRect(c.x - c.w / 2, E.CATCH_Y - 3, c.w, 3);
    g.imageSmoothingEnabled = false;
    g.save(); g.translate(c.x, E.CATCH_Y + 4); if (c.dir < 0) g.scale(-1, 1); g.drawImage(Math.floor(t / 280) % 2 ? SPR.cat : SPR.cat2, -18, -2, 36, 36); g.restore();
    g.font = '700 10px sans-serif'; g.fillStyle = '#5cf2d6'; g.textAlign = 'center'; g.fillText('接住 ×3 还球', c.x, E.CATCH_Y - 11);
    // 钉
    r.pegs.forEach((p, i) => {
      const fl = flashes.get(i) || 0, col = p.kind ? E.PEGS[p.kind].color : '#b7a7ec';
      if (r.phase === 'place' && !p.kind) { g.strokeStyle = '#ffc93c'; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, 11 + Math.sin(t / 150) * 2, 0, 7); g.stroke(); }
      if (fl > 0) { g.globalAlpha = fl; g.fillStyle = col; g.beginPath(); g.arc(p.x, p.y, 8 + (1 - fl) * 16, 0, 7); g.fill(); g.globalAlpha = 1; }
      const R = p.kind ? E.PEG_R + 2 : E.PEG_R;
      if (p.kind) { g.fillStyle = col + '44'; g.beginPath(); g.arc(p.x, p.y, R + 5, 0, 7); g.fill(); }
      g.fillStyle = fl > 0 ? '#fff' : col; g.beginPath(); g.arc(p.x, p.y, R, 0, 7); g.fill();
      if (p.kind) { g.font = '11px sans-serif'; g.fillStyle = '#000'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText({ gold: '$', mult: '×', bumper: '!', bomb: '✹', split: 'Y' }[p.kind], p.x, p.y + 0.5); }
    });
    // 爆炸环
    boomRings.forEach(b => { g.strokeStyle = `rgba(255,140,60,${b.a})`; g.lineWidth = 5; g.beginPath(); g.arc(b.x, b.y, b.r, 0, 7); g.stroke(); });
    // 发射口与瞄准线
    if (r.phase === 'aim') {
      g.save(); g.setLineDash([3, 9]); g.strokeStyle = '#ffffff80'; g.lineWidth = 2; g.beginPath(); g.moveTo(aimX, 56); g.lineTo(aimX, 122); g.stroke(); g.restore();
      g.fillStyle = '#ffe9a0'; g.beginPath(); g.arc(aimX, 46, E.BALL_R, 0, 7); g.fill();
    }
    g.save(); g.translate(r.phase === 'aim' ? aimX : (r.lastAim || aimX), 12); g.drawImage(SPR.dash, -19, -16, 38, 38); g.restore();
    // 球与拖尾
    trails.forEach(a => { g.fillStyle = a.c; g.globalAlpha = a.a; g.beginPath(); g.arc(a.x, a.y, a.r, 0, 7); g.fill(); });
    g.globalAlpha = 1;
    r.balls.forEach(b => {
      if (b.done) return;
      const hot = b.mult > 1 || combo > 12;
      const gr = g.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, E.BALL_R);
      gr.addColorStop(0, '#fffbe2'); gr.addColorStop(1, hot ? '#ff7a3c' : '#ffc93c');
      g.fillStyle = gr; g.beginPath(); g.arc(b.x, b.y, E.BALL_R, 0, 7); g.fill();
      if (b.pts) { g.font = '900 15px "PingFang SC"'; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = '#0009'; const s = b.mult > 1 ? `${b.pts}×${b.mult.toFixed(1)}` : `${b.pts}`; g.strokeText(s, b.x, b.y - 20); g.fillStyle = hot ? '#ffb347' : '#fff'; g.fillText(s, b.x, b.y - 20); }
    });
    // 猫爪
    swats.forEach(s => { g.globalAlpha = s.a; g.font = `${28 + (1 - s.a) * 20}px sans-serif`; g.textAlign = 'center'; g.fillText('🐾', s.x, s.y); g.globalAlpha = 1; });
    // 爪数提示
    if (r.phase === 'flying') { g.font = '800 15px "PingFang SC"'; g.textAlign = 'left'; g.fillStyle = r.nudges ? '#ffe07a' : '#ffffff55'; g.fillText('🐾'.repeat(r.nudges) + (r.nudges ? ' 点左右拍球' : ' 没爪了'), 12, 92); }
    // 飘字
    floats.forEach(f => { g.globalAlpha = Math.min(1, f.a * 2); g.font = `900 ${f.s}px "PingFang SC",sans-serif`; g.textAlign = 'center'; g.lineWidth = 5; g.strokeStyle = '#000b'; g.strokeText(f.t, f.x, f.y); g.fillStyle = f.c; g.fillText(f.t, f.x, f.y); g.globalAlpha = 1; });
    if (flashT > 0) { g.globalAlpha = flashT * 0.5; g.fillStyle = flashC; g.fillRect(0, 0, E.W, E.H); g.globalAlpha = 1; }
    if (slow < 0.9) { g.fillStyle = `rgba(0,0,0,${(1 - slow) * 0.22})`; g.fillRect(0, 0, E.W, E.POCKET_TOP - 70); }
  }
  const float = (x, y, t, c = '#ffe07a', s = 22, life = 1) => floats.push({ x, y, t, c, s, a: life, v: 40 });

  // ===== 主循环 =====
  function handle(evs) {
    for (const e of evs) {
      if (e.t === 'peg') {
        flashes.set(e.i, 1);
        combo = e.combo;
        const p = r.pegs[e.i];
        SFX.peg(Math.min(10, Math.floor(combo / 2)));
        if (combo >= 3) float(p.x, p.y - 14, '+' + e.v, combo > 12 ? '#ff7a3c' : '#ffe07a', 14 + Math.min(10, combo / 2), 0.7);
        if (e.gold) { SFX.coin(0); float(p.x + 14, p.y, '+$1', '#ffc93c', 18, 0.8); }
        if (e.mult) { SFX.hot(); float(p.x, p.y - 28, '倍率 ×' + e.mult.toFixed(1), '#ff5c8a', 22); }
        if (e.boom) { boomRings.push({ x: p.x, y: p.y, r: 8, a: 1 }); SFX.noise(0.25, 0.3, 500); e.boom.forEach(j => flashes.set(j, 1)); shake(); }
        if (e.split) { SFX.hot(); float(p.x, p.y - 28, '裂球！', '#b48cff', 26); }
      } else if (e.t === 'wall') { float(e.x < 40 ? 50 : E.W - 50, e.y, '倍率 ×' + e.mult.toFixed(1), '#ff5c8a', 18, 0.8); }
      else if (e.t === 'land') onLand(e);
      else if (e.t === 'ball-end') onBallEnd(e);
    }
  }
  function onLand(e) {
    const x = (e.pocket + 0.5) * pw;
    const rect = cv.getBoundingClientRect(), sx = rect.left + x / E.W * rect.width, sy = rect.top + E.POCKET_TOP / E.H * rect.height;
    if (e.caught) { SFX.jackpot(); flashT = 0.6; flashC = '#5cf2d6'; float(e.x, E.CATCH_Y - 34, `接住！${e.score.toLocaleString()}`, '#5cf2d6', 34, 1.2); float(e.x, E.CATCH_Y - 62, '还你一颗球', '#fff', 18, 1.2); FX.burst(sx, sy, 60, ['#5cf2d6', '#fff', '#ffc93c'], 500); }
    else if (e.pocketMult === 0) { SFX.bust(); flashT = 0.7; flashC = '#c0182c'; shake(); float(x, E.POCKET_TOP - 34, '黑袋！清零', '#ff6d6d', 34, 1.3); }
    else {
      const big = e.pocketMult >= 3;
      if (big) { SFX.fanfare(); FX.coins(sx, sy, 34); flashT = 0.35; flashC = '#ffc93c'; } else SFX.bank();
      float(x, E.POCKET_TOP - 54, `${e.pts}${e.ballMult > 1 ? '×' + e.ballMult.toFixed(1) : ''}×${e.pocketMult}`, '#fff', 17, 1.2);
      float(x, E.POCKET_TOP - 24, '+' + e.score.toLocaleString(), big ? '#ffc93c' : '#ffe07a', big ? 40 : 28, 1.3);
    }
  }
  function onBallEnd(e) {
    combo = 0;
    if (e.bet) {
      const x = (e.bet.pocket + 0.5) * pw, y = E.POCKET_TOP - 90;
      if (e.bet.hit) { SFX.jackpot(); float(x, y, `押中！+$${e.bet.back}`, '#ffc93c', 38, 1.5); const rc = cv.getBoundingClientRect(); FX.coins(rc.left + x / E.W * rc.width, rc.top + E.POCKET_TOP / E.H * rc.height, 50); flashT = 0.5; flashC = '#ffc93c'; }
      else if (e.bet.near) { SFX.heart(); float(x, y, `差一格！退 $${e.bet.back}`, '#ffb3a8', 28, 1.5); }
      else { SFX.deny(); float(x, y, e.bet.back ? `没中，保险退 $${e.bet.back}` : `-$${e.bet.amount}`, '#ff8a8a', 26, 1.3); }
    }
    save(); renderSide();
    if (r.phase !== 'aim') setTimeout(enterPhase, 900);
    else if (r.gold < betAmt && betAmt < 999) betAmt = 0;
  }
  function shake() { stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake'); }
  function targetSlow() {
    if (!r || r.phase !== 'flying') return 1;
    const bet = r.dropBet;
    for (const b of r.balls) {
      if (b.done) continue;
      if (b.y < E.POCKET_TOP - 130) continue;
      const pk = Math.floor(b.x / pw);
      if (bet && bet.amount && Math.abs(pk - bet.pocket) <= 1) return 0.28;
      if (E.pocketMult(r, pk) >= 5 || Math.abs(b.x - r.catcher.x) < r.catcher.w) return 0.45;
    }
    return 1;
  }
  function frame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0); lastT = now;
    slow += (targetSlow() - slow) * Math.min(1, dt * 10);
    if (r && !paused()) {
      acc += dt * slow;
      let n = 0;
      while (acc >= E.DT && n++ < 40) {
        acc -= E.DT;
        const evs = E.step(r);
        if (evs.length) handle(evs);
        if (r.phase === 'flying' || (evs.length && r.balls.length)) {
          for (const b of r.balls) if (!b.done && n % 3 === 0) trails.push({ x: b.x, y: b.y, r: 6, a: 0.45, c: b.mult > 1 ? '#ff7a3c' : '#ffc93c' });
        }
      }
    }
    flashes.forEach((v, k) => { const nv = v - dt * 4; nv <= 0 ? flashes.delete(k) : flashes.set(k, nv); });
    floats.forEach(f => { f.y -= f.v * dt; f.a -= dt * 0.9; }); floats = floats.filter(f => f.a > 0);
    trails.forEach(a => { a.a -= dt * 2.2; a.r *= 0.985; }); trails = trails.filter(a => a.a > 0);
    swats.forEach(s => { s.a -= dt * 2.5; }); swats = swats.filter(s => s.a > 0);
    boomRings.forEach(b => { b.r += dt * 320; b.a -= dt * 2.6; }); boomRings = boomRings.filter(b => b.a > 0);
    flashT = Math.max(0, flashT - dt * 2.4);
    draw(now);
    updateSideLive();
    requestAnimationFrame(frame);
  }
  const paused = () => !!document.querySelector('.ov:not(.clear)') || document.getElementById('title');

  // ===== 面板 =====
  function renderSide() {
    if (!r) { side.innerHTML = ''; return; }
    const R = r.R, cap = E.betCap(r);
    const chips = [0, 2, 5, 'max'];
    side.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div class="round">第 ${r.round} 轮${r.round > E.FINAL_ROUND ? '（无尽）' : ` / ${E.FINAL_ROUND}`}</div><div style="display:flex;gap:6px"><button class="icon" id="rul">?</button><button class="icon" id="mut">${SFX.muted ? '🔇' : '🔊'}</button></div></div>
      <div class="bar"><div class="lbl"><span>本轮目标</span><span><b id="s">${R.score.toLocaleString()}</b> / ${R.target.toLocaleString()}</span></div><div class="track"><div class="fill" id="fl" style="width:${Math.min(100, R.score / R.target * 100)}%"></div></div></div>
      <div class="stat"><div><b id="bl">${R.balls}</b>颗球</div><div class="g"><b id="gd">$${r.gold}</b>筹码</div><div class="t"><b>${r.tokens}</b>次复活</div></div>
      <div class="box"><h4>押注 <small>中 ×${E.odds(r)}，差一格退一半，上限 $${cap}</small></h4><div class="chips">${chips.map(c => { const v = c === 'max' ? Math.min(cap, r.gold) : c; const on = c === 'max' ? betAmt === 999 : betAmt === c; return `<button data-b="${c}" class="${on ? 'on' : ''}" ${r.gold < v || (c === 'max' && !v) ? 'disabled' : ''}>${c === 0 ? '不押' : c === 'max' ? '最高' : '$' + c}</button>`; }).join('')}</div>
        <div class="help" id="bh" style="margin-top:7px"></div></div>
      <div class="help"><b>瞄准：</b>移动鼠标，点击投球。<br><b>🐾 拍球：</b>球飞的时候点球的左边或右边，或按 ← →。<br><b>空格：</b>投球。</div>
      <div id="charms">${r.charms.map(id => { const c = E.CHARMS[id]; return `<div class="chip r${c.rar}" data-chip>${c.icon} ${esc(c.name)}<div class="tip">${esc(c.desc)}</div></div>`; }).join('')}</div>`;
    side.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { const v = b.dataset.b; betAmt = v === 'max' ? 999 : +v; SFX.click(); if (!betAmt) E.placeBet(r, -1, 0); else if (r.bet.pocket >= 0) E.placeBet(r, r.bet.pocket, amountNow()); renderSide(); });
    side.querySelectorAll('[data-chip]').forEach(c => c.onclick = () => c.classList.toggle('open'));
    document.getElementById('rul').onclick = showRules;
    document.getElementById('mut').onclick = e => { e.target.textContent = SFX.toggleMute() ? '🔇' : '🔊'; };
    const bh = document.getElementById('bh');
    if (bh) bh.innerHTML = r.bet.amount ? `<span class="betnow">已押 $${r.bet.amount} 在第 ${r.bet.pocket + 1} 袋（×${E.pocketMult(r, r.bet.pocket)}）</span>` : betAmt ? '点底部的袋子下注' : '先选金额，再点底部的袋子';
  }
  const amountNow = () => betAmt === 999 ? Math.min(E.betCap(r), r.gold) : betAmt;
  function updateSideLive() {
    if (!r || !r.R) return;
    const s = document.getElementById('s'); if (!s) return;
    const R = r.R;
    s.textContent = R.score.toLocaleString();
    document.getElementById('fl').style.width = Math.min(100, R.score / R.target * 100) + '%';
    document.getElementById('bl').textContent = R.balls;
    document.getElementById('gd').textContent = '$' + r.gold;
  }

  // ===== 输入 =====
  const toBoard = e => { const b = cv.getBoundingClientRect(); return { x: (e.clientX - b.left) / b.width * E.W, y: (e.clientY - b.top) / b.height * E.H }; };
  cv.addEventListener('pointermove', e => { if (r && r.phase === 'aim') aimX = Math.max(12, Math.min(E.W - 12, toBoard(e).x)); });
  cv.addEventListener('pointerdown', e => {
    if (!r) return; SFX.unlock(); const p = toBoard(e);
    if (r.phase === 'aim') {
      if (p.y > E.POCKET_TOP - 10) { // 点袋子：押注
        const i = Math.min(E.POCKETS - 1, Math.floor(p.x / pw));
        if (!betAmt) betAmt = Math.min(2, r.gold);
        if (!betAmt) return SFX.deny();
        E.placeBet(r, i, amountNow()); SFX.coin(0); renderSide();
        return;
      }
      aimX = Math.max(12, Math.min(E.W - 12, p.x));
      doDrop();
    } else if (r.phase === 'flying') {
      const b = r.balls.find(x => !x.done); if (!b) return;
      swat(p.x < b.x ? 1 : -1, b); // 点球的左边 → 猫爪从左把球往右拍
    } else if (r.phase === 'place') {
      let best = -1, bd = 26;
      r.pegs.forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = i; } });
      if (best < 0) return SFX.deny();
      E.placePeg(r, best); SFX.coin(1); flashes.set(best, 1); save();
      document.querySelector('.ov.clear')?.remove(); enterPhase();
    }
  });
  function doDrop() { r.lastAim = aimX; if (E.drop(r, aimX)) { SFX.tone(420, 0.1, 'triangle', 0.15, 0, 1.6); save(); renderSide(); } }
  function swat(dir, b) {
    if (!E.nudge(r, dir)) return SFX.deny();
    SFX.tone(240, 0.09, 'square', 0.12, 0, 1.8);
    swats.push({ x: b.x - dir * 22, y: b.y + 8, a: 1 });
    FX.burst(...Object.values(toScreen(b.x, b.y)), 8, ['#fff', '#ffe07a'], 160);
  }
  const toScreen = (x, y) => { const b = cv.getBoundingClientRect(); return { x: b.left + x / E.W * b.width, y: b.top + y / E.H * b.height }; };
  addEventListener('keydown', e => {
    const k = e.key;
    if (e.repeat) return;
    if (document.getElementById('title')) return;
    const ov = document.querySelector('.ov:not(.clear)');
    if (ov) { if (k === ' ' || k === 'Enter') { const b = ov.querySelector('.btn:not(.alt):not(.pink)'); if (b) { e.preventDefault(); b.click(); } } return; }
    if (!r) return;
    if (k === ' ') { e.preventDefault(); if (r.phase === 'aim') doDrop(); }
    if (r.phase === 'flying') {
      const b = r.balls.find(x => !x.done); if (!b) return;
      if (k === 'ArrowLeft' || k === 'a') swat(-1, b); else if (k === 'ArrowRight' || k === 'd') swat(1, b);
    }
    if (r.phase === 'aim') { if (k === 'ArrowLeft') aimX = Math.max(12, aimX - 24); if (k === 'ArrowRight') aimX = Math.min(E.W - 12, aimX + 24); }
  });

  // ===== 阶段流转 =====
  function clearLayer() { layer.innerHTML = ''; }
  function enterPhase() {
    clearLayer(); renderSide(); save();
    if (!r) return;
    if (r.phase === 'prize') showPrize();
    else if (r.phase === 'draft') showDraft();
    else if (r.phase === 'place') showPlace();
    else if (r.phase === 'shop') showShop();
    else if (r.phase === 'failed') showFailed();
    else if (r.phase === 'victory') showVictory();
    else if (r.phase === 'over') showOver();
  }
  function showPrize() {
    const R = r.R; SFX.fanfare();
    const c = toScreen(E.W / 2, E.H / 2); FX.coins(c.x, c.y, 30);
    const o = $(`<div class="ov"><div class="pn"><h2>第 ${r.round} 轮过关</h2><p style="color:var(--muted);margin:0">本轮 ${R.score.toLocaleString()} 分${R.balls ? `，还剩 ${R.balls} 颗球` : ''}</p><div class="big" id="pz">$${R.prize}</div><div class="ladder" id="ld"></div><p style="color:var(--muted);font-size:14px;margin:10px 0 0" id="ms">收下，或者押上全部奖金：49% 翻倍，51% 归零。</p><div class="row"><button class="btn" id="take">收下</button><button class="btn pink" id="gam">翻倍或归零</button></div></div></div>`);
    layer.appendChild(o);
    const upd = () => { const d = o.querySelector('#ld'); d.innerHTML = ''; for (let i = 0; i < 5; i++) d.appendChild($(`<i class="${i < r.gambles && r.R.prize > 0 ? 'on' : ''}"></i>`)); };
    upd();
    o.querySelector('#take').onclick = () => { SFX.coin(1); E.collectPrize(r); enterPhase(); };
    o.querySelector('#gam').onclick = async e => {
      const btn = e.currentTarget, tk = o.querySelector('#take'), pz = o.querySelector('#pz');
      btn.disabled = tk.disabled = true;
      const base = r.R.prize;
      for (let i = 0; i < 14; i++) { pz.textContent = '$' + (i % 2 ? base * 2 : 0); SFX.tone(800 + i * 70, 0.03, 'square', 0.05); await new Promise(s => setTimeout(s, 40 + i * 9)); }
      const res = E.gamblePrize(r); save();
      pz.textContent = '$' + res.prize; pz.classList.toggle('zero', !res.win); upd();
      if (res.win) { SFX.jackpot(); const q = FX.rect(pz); FX.coins(q.x, q.y, 16 + r.gambles * 14); o.querySelector('#ms').textContent = r.gambles >= 3 ? `连赢 ${r.gambles} 把！还赌吗？` : '翻了！继续，还是收手？'; btn.disabled = tk.disabled = false; }
      else { SFX.bust(); o.querySelector('#ms').textContent = `$${base} 没了。`; tk.disabled = false; tk.textContent = '认了'; btn.style.display = 'none'; }
    };
  }
  const itemCard = (d, attr, price) => {
    if (d.type === 'charm') { const c = E.CHARMS[d.id]; return `<button class="card r${c.rar} ${d.sold ? 'sold' : ''} ${price && r.gold < price ? 'poor' : ''}" ${attr}><div class="ic">${c.icon}</div><span class="t">护符</span><b>${esc(c.name)}</b><span>${esc(c.desc)}</span>${price ? `<div class="p">$${price}</div>` : ''}</button>`; }
    if (d.type === 'token') return `<button class="card ${d.sold ? 'sold' : ''} ${r.gold < price ? 'poor' : ''}" ${attr}><div class="ic">❤️</div><span class="t">保命</span><b>复活币</b><span>输一轮可以再来一次</span><div class="p">$${price}</div></button>`;
    const c = E.PEGS[d.id]; return `<button class="card ${d.sold ? 'sold' : ''} ${price && r.gold < price ? 'poor' : ''}" ${attr}><div class="ic">${c.icon}</div><span class="t">钉子 · 放到板上</span><b>${esc(c.name)}</b><span>${esc(c.desc)}</span>${price ? `<div class="p">$${price}</div>` : ''}</button>`;
  };
  function showDraft() {
    const o = $(`<div class="ov"><div class="pn wide"><h2>免费三选一</h2><div class="cards">${r.draft.map((d, i) => itemCard(d, `data-d="${i}"`)).join('')}</div></div></div>`);
    layer.appendChild(o);
    o.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { E.chooseDraft(r, +b.dataset.d); SFX.coin(1); enterPhase(); });
  }
  function showPlace() {
    layer.appendChild($(`<div class="ov clear"><div class="place">把「${esc(E.PEGS[r.pendingPeg].name)}」放到哪颗钉上？点棋盘上发光的钉子</div></div>`));
  }
  function showShop() {
    const o = $(`<div class="ov"><div class="pn wide"><h2>猫市 <span style="font-size:18px;color:var(--gold)">$${r.gold}</span></h2><p style="color:var(--muted);margin:0">下一轮目标 ${E.target(r.round + 1, r.heat).toLocaleString()} · 护符 ${r.charms.length}/5${r.lastInterest ? ` · 利息 +$${r.lastInterest}` : ''}</p><div class="cards four">${r.shop.map((d, i) => itemCard(d, `data-s="${i}"`, E.priceOf(d))).join('')}</div><div class="row"><button class="btn alt" id="rf" ${r.gold < r.refresh ? 'disabled' : ''}>刷新 $${r.refresh}</button><button class="btn" id="go">下一轮 →</button></div></div></div>`);
    layer.appendChild(o);
    o.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { if (E.buy(r, +b.dataset.s)) { SFX.coin(1); enterPhase(); } else SFX.deny(); });
    o.querySelector('#rf').onclick = () => { if (E.refreshShop(r)) { SFX.click(); enterPhase(); } };
    o.querySelector('#go').onclick = () => { E.nextRound(r); betAmt = 0; SFX.click(); enterPhase(); };
  }
  function showFailed() {
    SFX.lose();
    const o = $(`<div class="ov"><div class="pn"><h2 style="color:var(--pink)">差 ${(r.R.target - r.R.score).toLocaleString()} 分</h2><p>用掉 1 次复活，这一轮重来。还剩 ${r.tokens} 次。袋子会重新洗牌。</p><div class="row"><button class="btn" id="re">再来</button></div></div></div>`);
    layer.appendChild(o);
    o.querySelector('#re').onclick = () => { E.retryRound(r); betAmt = 0; enterPhase(); };
  }
  function bookRun() {
    const nip = E.catnip(r); meta.catnip += nip; meta.runs++;
    if (r.won) { meta.wins++; if (r.heat >= meta.maxHeat && r.heat < 5) meta.maxHeat = r.heat + 1; }
    meta.bestRound = Math.max(meta.bestRound, r.cleared || 0); meta.bestScore = Math.max(meta.bestScore, r.total); meta.bestBall = Math.max(meta.bestBall, r.bestBall);
    if (r.daily) { const d = today(); meta.daily[d] = Math.max(meta.daily[d] || 0, r.total); }
    saveMeta(); store.del('pachi-run');
    return nip;
  }
  function showVictory() {
    SFX.jackpot(); FX.rain(240);
    const o = $(`<div class="ov"><div class="pn"><h2 style="color:var(--gold)">猫街首富！</h2><p>打通 ${E.FINAL_ROUND} 轮，总分 ${r.total.toLocaleString()}，单球最高 ${r.bestBall.toLocaleString()}。</p><div class="row"><button class="btn" id="endl">继续无尽轮</button><button class="btn alt" id="lv">离场领奖</button></div></div></div>`);
    layer.appendChild(o);
    o.querySelector('#endl').onclick = () => { E.endless(r); enterPhase(); };
    o.querySelector('#lv').onclick = () => { r.over = true; r.phase = 'over'; showOver(); };
  }
  function showOver() {
    clearLayer();
    const nip = bookRun();
    if (r.won) { SFX.jackpot(); FX.rain(140); } else SFX.lose();
    const o = $(`<div class="ov"><div class="pn"><img src="../assets/${r.won ? 'cat-dash' : 'cat-hurt'}.png" width="88" height="88" style="image-rendering:pixelated" alt=""><h2 style="color:${r.won ? 'var(--gold)' : 'var(--pink)'}">${r.won ? '满载而归' : '筹码见底了'}</h2>
      <p>走到第 ${r.round} 轮 · 总分 ${r.total.toLocaleString()} · 单球最高 ${r.bestBall.toLocaleString()}</p>${!r.won ? `<p style="color:var(--muted)">这一轮只差 ${Math.max(0, r.R.target - r.R.score).toLocaleString()} 分</p>` : ''}<p style="color:var(--muted)">押中 ${r.stats.betWins}/${r.stats.bets} · 猫接住 ${r.stats.catches} 次 · 猫薄荷 +${nip}</p>
      <div class="row"><button class="btn" id="ag">再来一局</button><button class="btn alt" id="hm">回主页</button></div></div></div>`);
    layer.appendChild(o);
    o.querySelector('#ag').onclick = () => startRun({ heat: r.heat });
    o.querySelector('#hm').onclick = () => { clearLayer(); r = null; renderSide(); renderTitle(); };
  }
  function showRules() {
    if (document.getElementById('rl')) return;
    const o = $(`<div class="ov" id="rl"><div class="pn"><h2>怎么玩</h2><ol class="rl"><li>移动鼠标瞄准，点击投球。球撞钉攒分，落进袋子时乘上袋子的倍率。</li><li><b>黑袋清零。</b>袋子每轮重新洗牌，要看好再投。</li><li>球飞的时候点它左边或右边，猫爪会把它拍过去，每颗球 2 爪。</li><li>底部的猫接住球：得分 ×3，还你一颗球。</li><li>投球前可以押注一个袋子：中了赔 3 倍，差一格退一半。</li><li>过关的奖金可以赌翻倍，也可能归零。</li></ol><button class="btn" id="ok">开干</button></div></div>`);
    layer.appendChild(o);
    o.querySelector('#ok').onclick = () => { o.remove(); meta.seen = true; saveMeta(); };
  }
  function startRun(opt) {
    SFX.unlock(); SFX.startMusic();
    document.getElementById('title')?.remove();
    clearLayer();
    r = E.newRun({ ...opt, seed: opt.daily ? today() : undefined }); betAmt = 0; aimX = E.W / 2;
    save(); renderSide();
    if (!meta.seen) showRules();
  }
  function renderTitle() {
    document.getElementById('title')?.remove();
    const s = store.get('pachi-run', null), d = meta.daily[today()];
    const t = $(`<div id="title"><h1>招财弹珠</h1><div class="tag">投下去之前先押一把。<br>猫爪拍球，黑袋清零，奖金翻倍或归零。</div>
      ${s ? `<button class="btn" id="cont" style="background:linear-gradient(#7fe5c9,#27a58a);color:#03281f">继续上一局<small>第 ${s.round} 轮 · $${s.gold}</small></button>` : ''}
      <div class="heat">热度 ${[0, 1, 2, 3, 4, 5].map(h => `<button data-h="${h}" class="${heat === h ? 'on' : ''}" ${h > meta.maxHeat ? 'disabled' : ''}>${h}</button>`).join('')}</div>
      <div class="row" style="margin:0"><button class="btn" id="st">开一局</button><button class="btn alt" id="da">今日局<small>${d ? '今日最高 ' + d.toLocaleString() : '每天固定一副棋运'}</small></button><button class="btn alt" id="ru">规则</button></div>
      <div class="tag" style="font-size:14px">猫薄荷 ${meta.catnip} · 打过 ${meta.runs} 局 · 通关 ${meta.wins} 次 · 最远第 ${meta.bestRound} 轮 · 单球最高 ${meta.bestBall.toLocaleString()}</div>
      <a href="../index.html" style="color:var(--muted);font-size:14px">← 回游戏厅</a><div class="fine">筹码纯属虚拟，不涉及真钱，也不能兑换。</div></div>`);
    document.body.appendChild(t);
    t.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { heat = +b.dataset.h; SFX.click(); renderTitle(); });
    t.querySelector('#st').onclick = () => startRun({ heat });
    t.querySelector('#da').onclick = () => startRun({ heat: 0, daily: true });
    t.querySelector('#ru').onclick = showRules;
    const c = t.querySelector('#cont');
    if (c) c.onclick = () => { r = s; SFX.unlock(); SFX.startMusic(); t.remove(); enterPhase(); };
  }
  window.__P = { get r() { return r; }, E, meta, setAim(x) { aimX = x; }, swat };
  renderTitle();
  requestAnimationFrame(frame);
})();
