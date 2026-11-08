// 九命骰局界面：只调用 engine 的动作，不写规则。
(function () {
  const E = window.DiceEngine, $ = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
  const app = document.getElementById('app');
  const FAST = /[?&]fast/.test(location.search);
  const wait = ms => new Promise(r => setTimeout(r, FAST ? 0 : ms));
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
  const meta = Object.assign({ catnip: 0, maxHeat: 0, runs: 0, wins: 0, bestNight: 0, bestScore: 0, daily: {}, seenRules: false }, store.get('nine-meta', {}));
  const saveMeta = () => store.set('nine-meta', meta);
  let r = null, sel = new Set(), busy = false, pick = { cat: 'orange', heat: 0 }, stakeOn = false, modal = null;
  const save = () => { if (r && !r.over) store.set('nine-run', r); else store.del('nine-run'); };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const today = () => { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };

  // ===== 骰子 =====
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function faceHTML(f, extra = '') {
    const paw = f.kind === 'wild' || (f.v === 6 && r && E.has(r, 'goldpaw'));
    const k = paw ? 'wild' : f.kind;
    const mark = { gold: '$', lucky: '福', bomb: '💣', plus: '+' }[f.kind] || '';
    let inner;
    if (paw) inner = '<span class="big">🐾</span>';
    else { inner = ''; for (let i = 0; i < 9; i++) inner += PIPS[f.v].includes(i) ? `<i class="pip${f.v === 1 ? ' one' : ''}"></i>` : '<i></i>'; }
    return `<div class="fc ${k ? 'k-' + k : ''}" style="${extra}">${inner}${mark ? `<span class="mark">${mark}</span>` : ''}</div>`;
  }
  const PLACE = ['', 'rotateY(90deg)', 'rotateY(180deg)', 'rotateY(-90deg)', 'rotateX(90deg)', 'rotateX(-90deg)'];
  const SHOW = ['rotateX(0) rotateY(0)', 'rotateY(-90deg)', 'rotateY(-180deg)', 'rotateY(90deg)', 'rotateX(-90deg)', 'rotateX(90deg)'];
  function cubeHTML(die, h = 'calc(var(--die)/2)') { return die.faces.map((f, i) => faceHTML(f, `transform:${PLACE[i]} translateZ(${h})`)).join(''); }
  function throwDice(tray, roll) {
    tray.innerHTML = '';
    roll.forEach((x, i) => {
      const slot = $(`<div class="slot" data-i="${i}"><div class="cube">${cubeHTML(r.dice[x.d])}</div></div>`);
      const cube = slot.firstChild;
      cube.style.transform = SHOW[x.fi];
      tray.appendChild(slot);
      if (!FAST && cube.animate) {
        const a = 2 + Math.floor(Math.random() * 3), b = 2 + Math.floor(Math.random() * 3);
        const d = 560 + i * 75;
        cube.animate([{ transform: `rotateX(${a * 360}deg) rotateY(${b * 360}deg) ${SHOW[x.fi]}` }, { transform: `rotateX(0) rotateY(0) ${SHOW[x.fi]}` }], { duration: d, easing: 'cubic-bezier(.15,.7,.25,1)' });
        slot.animate([{ transform: 'translateY(-150px) scale(.7)', opacity: 0 }, { transform: 'translateY(10px) scale(1.04)', opacity: 1, offset: .55 }, { transform: 'translateY(-16px)', offset: .75 }, { transform: 'none' }], { duration: d, easing: 'ease-out' });
      }
    });
  }
  function renderKeep(el) {
    const t = r.turn;
    el.innerHTML = t && t.kept.length ? `<span class="tag">已留</span>` : '';
    if (t) t.kept.forEach(x => el.appendChild($(`<div class="mini">${faceHTML(x.f)}</div>`)));
  }

  // ===== 局内 =====
  function preview() {
    const t = r.turn;
    if (r.phase !== 'choose') return null;
    const picks = [...sel];
    if (!picks.length) return { invalid: true, msg: '至少留下一颗能得分的骰子' };
    const s = E.pickScore(r, picks);
    if (s <= 0) return { invalid: true, msg: '选中的骰子有不计分的，点它取消' };
    const c = JSON.parse(JSON.stringify(r));
    const ev = E.take(c, picks);
    return { points: s, final: E.finalScore(c), pot: c.turn.pot, mult: E.multBreakdown(c) * c.turn.potFactor, hot: ev.hot, free: c.turn.free, p: E.bustChance(c, c.turn.free) };
  }
  function hudHTML() {
    const n = r.nightS, b = E.boss(r), pct = Math.min(100, n.score / n.target * 100);
    let l = ''; for (let i = 0; i < r.maxLives; i++) l += `<span class="l${i < r.lives ? '' : ' off'}">♥</span>`;
    return `<div id="hud"><div class="night">第 ${r.night} 夜${r.night > E.FINAL_NIGHT ? '（地狱）' : ` / ${E.FINAL_NIGHT}`}${b ? `<em title="${esc(b.desc)}">${esc(b.name)}</em>` : ''}${r.daily ? '<em style="color:#6db4ff;border-color:#6db4ff">今日局</em>' : ''}</div>
      <div class="bar"><div class="lbl"><span>本夜目标 · 还剩 ${n.turnsLeft} 回合${b ? ' · ' + esc(b.desc) : ''}</span><span><b id="sc">${n.score.toLocaleString()}</b> / ${n.target.toLocaleString()}</span></div><div class="track"><div class="fill" style="width:${pct}%"></div><div class="gh" id="ghost" style="width:${pct}%"></div></div></div>
      <div class="lives" title="${r.lives} 条命">${l}</div><div class="gold" id="gold">$${r.gold}</div>
      <button class="icon-btn" id="rules" title="规则">?</button><button class="icon-btn" id="mute" title="声音">${SFX.muted ? '🔇' : '🔊'}</button></div>`;
  }
  const chips = () => r.charms.map(id => { const c = E.CHARMS[id]; return `<div class="chip r${c.rar}" data-chip>${c.icon} ${esc(c.name)}<div class="tip">${esc(c.desc)}</div></div>`; }).join('') || '<div class="hint" style="align-self:center">还没有护符。过关后去黑市买。</div>';

  function renderTable() {
    const b = E.boss(r);
    app.innerHTML = hudHTML() + `<div id="table"><div class="rail">${chips()}</div>
      <div class="mid"><div class="keep" id="keep"></div><div id="tray"></div>
      <div class="pot" id="pot"></div><div class="hint" id="hint"></div></div><div id="actions"></div>
      <img class="px cat-sprite ${r.cat !== 'orange' ? 'tint-' + r.cat : ''}" src="../assets/cat-idle1.png" alt="">
      ${b ? '<img class="px boss-sprite" src="../assets/king-idle1.png" alt="">' : ''}</div>`;
    wireHud();
    app.querySelectorAll('[data-chip]').forEach(c => c.onclick = () => c.classList.toggle('open'));
    renderKeep(document.getElementById('keep'));
  }
  function wireHud() {
    document.getElementById('rules').onclick = showRules;
    document.getElementById('mute').onclick = e => { e.target.textContent = SFX.toggleMute() ? '🔇' : '🔊'; };
  }
  function renderTurnStart() {
    renderTable();
    const b = E.boss(r), canStake = !(b && b.id === 'king') && r.lives > 1;
    const mul = E.has(r, 'nine') ? 3 : 2;
    document.getElementById('pot').innerHTML = `<div class="sub">6 颗骰子已就位</div><div class="n" style="font-size:40px">这一回合，押吗？</div>`;
    document.getElementById('tray').innerHTML = r.dice.map(d => `<div class="slot"><div class="cube" style="transform:rotateX(-18deg) rotateY(28deg)">${cubeHTML(d)}</div></div>`).join('');
    const act = document.getElementById('actions');
    act.innerHTML = (canStake ? `<div class="stake ${stakeOn ? 'on' : ''}" id="stk"><input type="checkbox" ${stakeOn ? 'checked' : ''}><span>押一条命：本回合得分 ×${mul}，爆骰${E.has(r, 'iron') ? '也不掉命（铁胃）' : '就掉命'}</span></div>` : '') + `<button class="btn" id="go">开掷 <small>空格</small></button>`;
    if (canStake) document.getElementById('stk').onclick = () => { stakeOn = !stakeOn; SFX[stakeOn ? 'heart' : 'click'](); renderTurnStart(); };
    document.getElementById('go').onclick = () => act_begin();
  }
  async function act_begin() {
    if (busy) return; busy = true;
    const ev = E.beginTurn(r, stakeOn); stakeOn = false;
    renderTable();
    await showRoll(ev);
    busy = false;
  }
  async function showRoll(ev) {
    const tray = document.getElementById('tray');
    save();
    document.getElementById('actions').innerHTML = '';
    document.getElementById('hint').textContent = '';
    renderPotOnly();
    throwDice(tray, ev.type === 'bust' ? bustRoll() : r.turn.roll);
    SFX.rattle(Math.min(r.turn.free.length, 6));
    await wait(620 + r.turn.free.length * 75);
    if (ev.cheated) { const c = FX.rect(tray); FX.text(c.x, c.y - 70, '老千出手！重掷', '#6db4ff', 30); }
    if (ev.type === 'bust') return onBust(ev);
    sel = new Set(E.scoringPicks(r));
    renderChoose();
  }
  const bustRoll = () => r.turn.roll;
  function renderPotOnly(pv) {
    const t = r.turn, el = document.getElementById('pot');
    if (!el || !t) return;
    const pot = pv ? pv.pot : t.pot, mult = pv ? pv.mult : E.multBreakdown(r) * t.potFactor, fin = pv ? pv.final : E.finalScore(r);
    el.classList.toggle('fire', mult >= 3);
    const stake = t.stake ? ' · <b style="color:#ff8a70">押命中</b>' : '';
    el.innerHTML = `<div class="n" id="potn">${fin.toLocaleString()}</div><div class="sub">彩池 ${pot.toLocaleString()} × 倍率 <b>${mult.toFixed(mult % 1 ? 2 : 0)}</b>${stake}${E.has(r, 'fate') ? ' · 命运硬币可能 ×3' : ''}</div>`;
  }
  function renderChoose() {
    const t = r.turn, pv = preview(), tray = document.getElementById('tray');
    const score = new Set(E.scoringPicks(r));
    tray.querySelectorAll('.slot').forEach(s => {
      const i = +s.dataset.i;
      s.classList.toggle('sel', sel.has(i));
      s.classList.toggle('dim', !score.has(i));
      s.onclick = () => { if (busy || !score.has(i)) { SFX.deny(); return; } sel.has(i) ? sel.delete(i) : sel.add(i); SFX.die(i); renderChoose(); };
    });
    renderPotOnly(pv && !pv.invalid ? pv : null);
    const hint = document.getElementById('hint'), act = document.getElementById('actions'), n = r.nightS;
    const ghost = document.getElementById('ghost');
    if (pv && !pv.invalid) ghost.style.width = Math.min(100, (n.score + pv.final) / n.target * 100) + '%';
    if (pv && pv.invalid) { hint.className = 'hint warn'; hint.textContent = pv.msg; }
    else if (n.score + pv.final >= n.target) { hint.className = 'hint good'; hint.textContent = '现在收手，今晚就过关'; }
    else if (pv.hot) { hint.className = 'hint good'; hint.textContent = `满堂！全部留下就能 6 颗重掷，倍率再加`; }
    else { hint.className = 'hint'; hint.textContent = `还差 ${(n.target - n.score - pv.final).toLocaleString()} 分`; }
    const owl = false;
    const rollLabel = pv && !pv.invalid ? `${pv.free.length} 颗 · 爆骰 ${(pv.p * 100).toFixed(0)}%` : '—';
    const riskCls = pv && !pv.invalid && pv.p >= 0.4 ? 'red' : '';
    act.innerHTML = `<button class="btn ${riskCls}" id="again" ${!pv || pv.invalid || owl ? 'disabled' : ''}>再掷一把<small>${rollLabel} <span class="kb"> · 空格</span></small></button><button class="btn green" id="stop" ${!pv || pv.invalid ? 'disabled' : ''}>收手<small>入账 ${pv && !pv.invalid ? pv.final.toLocaleString() : 0} <span class="kb"> · B</span></small></button>`;
    document.getElementById('again').onclick = () => act_again();
    document.getElementById('stop').onclick = () => act_bank();
    if (pv && !pv.invalid && pv.p >= 0.5) SFX.heart();
  }
  function takeSelected() {
    const picks = [...sel], tray = document.getElementById('tray');
    const ev = E.take(r, picks);
    const c = FX.rect(tray);
    FX.text(c.x, c.y - 60, '+' + ev.points.toLocaleString(), '#ffe07a', 34);
    if (ev.gold) { FX.coins(c.x, c.y, ev.gold * 4); FX.text(c.x + 90, c.y - 30, '+$' + ev.gold, '#ffd24a', 26); SFX.coin(); }
    SFX.rise(r.turn.rolls + Math.floor(r.turn.mult));
    sel = new Set();
    return ev;
  }
  async function act_again() {
    if (busy) return; const pv = preview(); if (!pv || pv.invalid) return SFX.deny();
    busy = true;
    const ev = takeSelected();
    document.getElementById('actions').innerHTML = '';
    renderKeep(document.getElementById('keep'));
    if (ev.hot) { await hotBanner(); }
    await showRoll(E.reroll(r));
    busy = false;
  }
  async function hotBanner() {
    const tb = document.getElementById('table'), c = FX.rect(tb);
    tb.appendChild($(`<div class="banner" style="color:#ffd24a">满堂！倍率 ×${r.turn.mult}</div>`));
    FX.burst(c.x, c.y - 40, 90, ['#ffd24a', '#ff7a3c', '#fff3c4', '#ff3c78'], 620);
    SFX.hot();
    await wait(850);
    tb.querySelector('.banner')?.remove();
  }
  async function act_bank() {
    if (busy) return; const pv = preview(); if (!pv || pv.invalid) return SFX.deny();
    busy = true;
    const ev0 = takeSelected();
    const ev = E.bank(r);
    save();
    document.getElementById('actions').innerHTML = '';
    if (ev.fate !== null) { const c = FX.rect(document.getElementById('pot')); FX.text(c.x, c.y - 70, ev.fate ? '🪙 正面！×3' : '🪙 反面', ev.fate ? '#ffd24a' : '#cccccc', 34); if (ev.fate) SFX.jackpot(); }
    SFX.bank();
    await countUp(ev.score);
    await wait(400);
    finishTurn();
    busy = false;
  }
  async function countUp(score) {
    const el = document.getElementById('potn'), n = r.nightS, start = n.score - score, sc = document.getElementById('sc');
    if (el) { el.textContent = score.toLocaleString(); el.classList.add('pulse'); }
    const c = el ? FX.rect(el) : { x: innerWidth / 2, y: innerHeight / 2 };
    FX.burst(c.x, c.y, Math.min(70, 16 + score / 60));
    const steps = FAST ? 1 : 16;
    for (let i = 1; i <= steps; i++) { sc.textContent = Math.round(start + score * i / steps).toLocaleString(); await wait(24); }
    document.querySelector('.fill').style.width = Math.min(100, n.score / n.target * 100) + '%';
    if (el) el.classList.remove('pulse');
  }
  async function onBust(ev) {
    const tb = document.getElementById('table');
    document.querySelectorAll('#tray .slot').forEach(s => s.classList.add('bustd'));
    tb.classList.add('shake', 'flash');
    SFX.bust();
    tb.appendChild($(`<div class="banner" style="color:#ff5c4d">爆骰！</div>`));
    const el = document.getElementById('hint');
    el.className = 'hint warn';
    el.textContent = `彩池 ${ev.lost.toLocaleString()} 归零${ev.kept ? `，软垫保住 ${ev.kept.toLocaleString()}` : ''}${ev.lifeLost ? `，掉 ${ev.lifeLost} 条命` : ''}`;
    document.getElementById('pot').innerHTML = '<div class="n" style="color:#ff5c4d">0</div>';
    document.getElementById('ghost').style.width = '0';
    document.querySelectorAll('.lives .l').forEach((l, i) => l.classList.toggle('off', i >= r.lives));
    document.querySelector('.fill').style.width = Math.min(100, r.nightS.score / r.nightS.target * 100) + '%';
    document.getElementById('sc').textContent = r.nightS.score.toLocaleString();
    save();
    await wait(1250);
    finishTurn();
    busy = false;
  }
  function finishTurn() {
    const ev = E.afterTurn(r); save();
    if (r.phase === 'turn-start') return renderTurnStart();
    if (r.phase === 'over') return showOver(ev);
    showNightResult(r.lastNight);
  }
  function showNightResult(ev) {
    const rows = ev.parts.map(([k, v]) => `<div class="r"><span>${esc(k)}</span><b>${v ? '+$' + v : '—'}</b></div>`).join('');
    const ok = ev.ok;
    if (ok) { SFX.fanfare(); FX.rain(ev.victory ? 240 : 45); } else SFX.lose();
    const o = $(`<div class="overlay"><div class="card-panel" style="text-align:center"><p class="big-result ${ok ? 'ok' : 'no'}">${ev.victory ? '赌王倒下了！' : ok ? '今晚赢了' : '今晚输了'}</p>
      ${ok ? '' : `<p style="color:#ffb3a8;margin:0 0 10px">差 ${(r.nightS.target - r.nightS.score).toLocaleString()} 分，掉 ${ev.penalty} 条命</p>`}
      <div class="rows" style="text-align:left;margin:10px 0 18px">${rows || '<div class="r"><span>没有收入</span><b>—</b></div>'}</div>
      ${ev.victory ? `<p style="color:var(--muted)">通关用了 ${r.busts} 次爆骰，总分 ${r.total.toLocaleString()}。继续打地狱夜刷更高分，随时可以离场领奖。</p><div style="display:flex;gap:10px;justify-content:center"><button class="btn green" id="next">继续地狱夜</button><button class="btn ghost" id="leave">离场领奖</button></div>` : `<button class="btn" id="next">${r.retryFinal ? '再挑战赌王' : '进黑市'}</button>`}</div></div>`);
    document.body.appendChild(o);
    if (ok && !ev.victory) SFX.coin();
    o.querySelector('#next').onclick = () => { o.remove(); SFX.click(); E.openShop(r); save(); r.phase === 'shop' ? renderShop() : renderTurnStart(); };
    const lv = o.querySelector('#leave'); if (lv) lv.onclick = () => { o.remove(); r.over = true; r.phase = 'over'; showOver({ won: true }); };
  }
  function showOver() {
    store.del('nine-run');
    const nip = E.catnip(r), first = !meta.wins && r.won;
    meta.catnip += nip; meta.runs++; if (r.won) { meta.wins++; if (r.heat >= meta.maxHeat && r.heat < 5) meta.maxHeat = r.heat + 1; }
    meta.bestNight = Math.max(meta.bestNight, r.cleared); meta.bestScore = Math.max(meta.bestScore, r.total);
    if (r.daily) { const d = today(), o = meta.daily[d] || 0; meta.daily[d] = Math.max(o, r.total); }
    saveMeta();
    const un = Object.entries(E.CATS).find(([, c]) => c.unlock > meta.catnip - nip && c.unlock <= meta.catnip);
    const next = Object.values(E.CATS).filter(c => c.unlock > meta.catnip).sort((a, b) => a.unlock - b.unlock)[0];
    if (r.won) { SFX.jackpot(); FX.rain(200); } else SFX.lose();
    const gap = !r.won && r.nightS ? r.nightS.target - r.nightS.score : 0;
    app.innerHTML = '';
    const o = $(`<div class="overlay"><div class="card-panel" style="text-align:center"><img class="px" src="../assets/${r.won ? 'cat-dash' : 'cat-hurt'}.png" width="96" height="96" alt=""><p class="big-result ${r.won ? 'ok' : 'no'}">${r.won ? '你赢下了猫街' : '九条命用完了'}</p>
      <div class="rows" style="text-align:left;margin:12px 0"><div class="r"><span>走到</span><b>第 ${r.night} 夜</b></div>${gap > 0 ? `<div class="r"><span>最后一夜还差</span><b>${gap.toLocaleString()} 分</b></div>` : ''}<div class="r"><span>总分</span><b>${r.total.toLocaleString()}</b></div><div class="r"><span>单回合最高</span><b>${r.bestTurn.toLocaleString()}</b></div><div class="r"><span>爆骰</span><b>${r.busts} 次</b></div><div class="r"><span>猫薄荷</span><b>+${nip}（共 ${meta.catnip}）</b></div></div>
      ${un ? `<p style="color:var(--green);font-weight:800">🔓 解锁新猫：${esc(un[1].name)}</p>` : next ? `<p style="color:var(--muted);font-size:14px">再攒 ${next.unlock - meta.catnip} 猫薄荷解锁「${esc(next.name)}」</p>` : ''}
      ${first ? '<p style="color:var(--brass);font-weight:800">🔥 解锁了「热度」难度</p>' : ''}
      <div style="display:flex;gap:10px;justify-content:center"><button class="btn" id="again">再来一局 <small>空格</small></button><button class="btn ghost" id="home">回猫街</button></div></div></div>`);
    document.body.appendChild(o);
    o.querySelector('#again').onclick = () => { o.remove(); startRun({ cat: r.cat, heat: r.heat, daily: false }); };
    o.querySelector('#home').onclick = () => { o.remove(); r = null; renderTitle(); };
  }

  // ===== 黑市 =====
  function renderShop() {
    const s = r.shop, nt = E.target(r.night, r.heat), b = E.BOSSES[r.night];
    const charm = (c, i) => { const d = E.CHARMS[c.id], p = E.priceOf(r, d.cost); return `<button class="item r${d.rar} ${c.sold ? 'sold' : ''} ${r.gold < p ? 'poor' : ''}" data-c="${i}"><div class="ic">${d.icon}</div><b>${esc(d.name)}</b><span>${esc(d.desc)}</span><div class="p">$${p}</div></button>`; };
    const face = (c, i) => { const d = E.FACE_ITEMS[c.id], p = E.priceOf(r, d.cost); return `<button class="item ${c.sold ? 'sold' : ''} ${r.gold < p ? 'poor' : ''}" data-f="${i}"><div class="ic">${d.icon}</div><b>${esc(d.name)}</b><span>${esc(d.desc)}</span><div class="p">$${p}</div></button>`; };
    let l = ''; for (let i = 0; i < r.maxLives; i++) l += `<span class="l${i < r.lives ? '' : ' off'}">♥</span>`;
    app.innerHTML = `<div id="shop"><div class="shopgrid" style="margin-bottom:12px;grid-template-columns:1fr auto;align-items:center"><div class="night">黑市 <span style="color:var(--muted);font-weight:500;font-size:14px;margin-left:8px">第 ${r.night} 夜目标 ${nt.toLocaleString()}${b ? ` · Boss「${esc(b.name)}」：${esc(b.desc)}` : ''}</span></div><div style="display:flex;gap:16px;align-items:center"><div class="lives">${l}</div><div class="gold">$${r.gold}</div></div></div>
      <div class="shopgrid"><div style="display:flex;flex-direction:column;gap:16px">
        <div class="sec"><h3>护符 <small>${r.charms.length}/${E.MAX_CHARMS} · <button id="refresh" style="color:var(--brass);font-weight:700;text-decoration:underline" ${r.gold < s.refresh ? 'disabled' : ''}>刷新 $${s.refresh}</button></small></h3><div class="items">${s.charms.map(charm).join('')}</div></div>
        <div class="sec"><h3>符面 <small>买下后刻到任意骰子的任意一面</small></h3><div class="items">${s.faces.map(face).join('')}</div></div>
      </div>
      <div class="sec"><h3>赌坊 <small>赔率都写明了</small></h3><div class="gam">
        <div class="g"><b>🪙 双倍或归零</b>押注的钱翻倍或输光。胜率 49%。<div class="acts"><button data-coin="half" ${r.gold < 2 ? 'disabled' : ''}>押一半</button><button data-coin="all" ${r.gold < 1 ? 'disabled' : ''}>全押</button></div></div>
        <div class="g"><b>🎁 黑猫盲盒</b>$5 一个，每夜限一次。可能开出钱、命或护符，含传说。<div class="acts"><button id="box" ${s.box || r.gold < 5 ? 'disabled' : ''}>${s.box ? '已开' : '开 $5'}</button></div></div>
        <div class="g"><b>🩸 卖命换宝</b>扣 1 条命，换一个稀有或传说护符。每夜限一次。<div class="acts"><button id="deal" ${s.deal || r.lives <= 1 || r.charms.length >= E.MAX_CHARMS ? 'disabled' : ''}>${s.deal ? '已卖' : '成交'}</button></div></div>
        <div class="g"><b>📜 零爆赌约</b>押金：下一夜不爆骰过关，返 3 倍；爆一次全没。<div class="acts"><button id="ct" ${s.contract || r.gold < 2 ? 'disabled' : ''}>${s.contract ? `已押 $${r.contract}` : `押一半 $${Math.floor(r.gold / 2)}`}</button></div></div>
      </div></div></div>
      <div class="footer"><div class="owned">${r.charms.map(id => { const c = E.CHARMS[id]; return `<div class="chip r${c.rar}">${c.icon} ${esc(c.name)}<span class="sell" data-sell="${id}">卖 $${Math.floor(c.cost / 2)}</span><div class="tip">${esc(c.desc)}</div></div>`; }).join('') || '<span class="hint">没有护符</span>'}</div><button class="btn" id="go">开始第 ${r.night} 夜 →</button></div></div>`;
    app.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { const ok = E.buyCharm(r, +b.dataset.c); ok ? (SFX.coin(), FX.burst(...Object.values(FX.rect(b)), 26)) : SFX.deny(); save(); renderShop(); });
    app.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { const it = s.faces[+b.dataset.f]; if (r.gold < E.priceOf(r, E.FACE_ITEMS[it.id].cost)) return SFX.deny(); engrave(+b.dataset.f); });
    app.querySelectorAll('[data-sell]').forEach(b => b.onclick = () => { E.sellCharm(r, b.dataset.sell); SFX.coin(); save(); renderShop(); });
    app.querySelectorAll('[data-coin]').forEach(b => b.onclick = () => flip(b.dataset.coin === 'all' ? r.gold : Math.max(1, Math.floor(r.gold / 2))));
    const bind = (id, f) => { const e = document.getElementById(id); if (e) e.onclick = f; };
    bind('refresh', () => { E.refreshShop(r) ? SFX.click() : SFX.deny(); save(); renderShop(); });
    bind('box', openBox);
    bind('deal', () => { const res = E.bloodDeal(r); if (!res) return SFX.deny(); SFX.heart(); save(); reveal('🩸 成交', E.CHARMS[res.id].icon + ' ' + E.CHARMS[res.id].name, E.CHARMS[res.id].desc); });
    bind('ct', () => { if (E.signContract(r, Math.floor(r.gold / 2))) { SFX.heart(); save(); renderShop(); } });
    bind('go', () => { SFX.click(); E.leaveShop(r); save(); renderTurnStart(); });
  }
  function reveal(head, big, sub, then) {
    const o = $(`<div class="overlay"><div class="card-panel" style="text-align:center"><p style="color:var(--muted);margin:0 0 6px">${esc(head)}</p><p class="big-result ok">${esc(big)}</p><p style="color:#ffffffc0">${esc(sub || '')}</p><button class="btn" id="ok">收下</button></div></div>`);
    document.body.appendChild(o);
    o.querySelector('#ok').onclick = () => { o.remove(); (then || renderShop)(); };
  }
  async function flip(stake) {
    if (busy) return; busy = true;
    const o = $(`<div class="overlay"><div class="card-panel" style="text-align:center"><div class="coin3d spin" id="coin">$</div><p class="big-result" id="cres">押 $${stake}</p><p style="color:var(--muted)">胜率 49%</p><button class="btn" id="ok" style="visibility:hidden">继续</button></div></div>`);
    document.body.appendChild(o);
    for (let i = 0; i < 12; i++) { if (!FAST) SFX.tone(1200 + i * 60, 0.03, 'square', 0.04); await wait(70); }
    const res = E.coinFlip(r, stake); save();
    o.querySelector('#coin').classList.remove('spin');
    o.querySelector('#coin').textContent = res.win ? '喵' : '✕';
    const t = o.querySelector('#cres');
    t.textContent = res.win ? `赢了 +$${res.stake}` : `输了 -$${res.stake}`;
    t.className = 'big-result ' + (res.win ? 'ok' : 'no');
    if (res.win) { SFX.jackpot(); const c = FX.rect(o.querySelector('#coin')); FX.coins(c.x, c.y, 40); } else SFX.bust();
    const ok = o.querySelector('#ok'); ok.style.visibility = 'visible';
    ok.onclick = () => { o.remove(); renderShop(); };
    busy = false;
  }
  async function openBox() {
    if (busy) return; busy = true;
    const res = E.blindBox(r); if (!res) { busy = false; return SFX.deny(); }
    save();
    const o = $(`<div class="overlay"><div class="card-panel" style="text-align:center"><div class="coin3d spin" style="border-radius:18px">🎁</div><p class="big-result">摇一摇……</p></div></div>`);
    document.body.appendChild(o);
    for (let i = 0; i < 10; i++) { if (!FAST) SFX.noise(0.05, 0.1, 900 + i * 200); await wait(85); }
    o.remove(); busy = false;
    if (res.kind === 'gold') { if (res.v >= 25) { SFX.jackpot(); FX.rain(100); } else SFX.coin(); reveal('盲盒开出', `$${res.v}`, res.v >= 25 ? '大奖！' : res.v < 5 ? '亏了点' : '赚了'); }
    else if (res.kind === 'life') { SFX.fanfare(); reveal('盲盒开出', '+1 条命', '猫就是命多'); }
    else { const c = E.CHARMS[res.id]; if (c.rar === 2) { SFX.jackpot(); FX.rain(100); } else SFX.fanfare(); reveal('盲盒开出', c.icon + ' ' + c.name, c.desc); }
  }
  function engrave(i) {
    const it = s_item(i), d = E.FACE_ITEMS[it.id];
    const o = $(`<div class="overlay"><div class="card-panel" style="max-width:860px"><h2>${d.icon} ${esc(d.name)}：选一面刻上去</h2><p style="color:var(--muted);margin:0 0 12px">${esc(d.desc)}</p><div class="nets">${r.dice.map((die, x) => `<div class="net">${die.faces.map((f, y) => `<div class="mini" data-d="${x}" data-y="${y}">${faceHTML(f)}</div>`).join('')}</div>`).join('')}</div><div style="text-align:right;margin-top:14px"><button class="btn ghost" id="cancel">不买了</button></div></div></div>`);
    document.body.appendChild(o);
    o.querySelector('#cancel').onclick = () => o.remove();
    o.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { E.buyFace(r, i, +b.dataset.d, +b.dataset.y); SFX.coin(); o.remove(); save(); renderShop(); });
  }
  const s_item = i => r.shop.faces[i];

  // ===== 标题与规则 =====
  function showRules() {
    if (document.getElementById('rl')) return;
    const u = r ? E.rules(r) : { s1: 100, s5: 50 };
    const o = $(`<div class="overlay" id="rl"><div class="card-panel"><h2>怎么玩</h2><ol class="ol"><li>掷 6 颗骰子，至少留下一颗能得分的，分数进<b>彩池</b>。</li><li>然后选：<b>收手</b>把彩池入账，或<b>再掷</b>剩下的骰子。</li><li>再掷如果一颗得分的都没有就是<b>爆骰</b>，本回合彩池归零。</li><li>6 颗都留下了叫<b>满堂</b>：6 颗重掷，倍率 +1。</li><li>每夜要凑够目标分。没凑够掉 3 条命（Boss 4 条），下一夜继续。命用完才算输。</li></ol>
      <table class="rule-table"><tr><td>单个 1</td><td>${u.s1}</td></tr><tr><td>单个 5</td><td>${u.s5}</td></tr><tr><td>三个 1</td><td>1000</td></tr><tr><td>三个 N（2～6）</td><td>N × 100</td></tr><tr><td>四 / 五 / 六个相同</td><td>×2 / ×4 / ×8</td></tr><tr><td>顺子 1-2-3-4-5-6</td><td>1500</td></tr><tr><td>三对</td><td>1000</td></tr></table>
      <p style="color:var(--muted);font-size:14px">🐾 猫爪面可以当任意点数。键盘：空格＝再掷，B＝收手。</p><div style="text-align:center"><button class="btn" id="ok">开干</button></div></div></div>`);
    document.body.appendChild(o);
    o.querySelector('#ok').onclick = () => { o.remove(); meta.seenRules = true; saveMeta(); };
  }
  function startRun(o) {
    SFX.unlock(); SFX.startMusic();
    r = E.newRun({ ...o, seed: o.daily ? today() : undefined });
    if (o.daily) r.daily = true;
    save(); stakeOn = false;
    renderTurnStart();
    if (!meta.seenRules) showRules();
  }
  function renderTitle() {
    const saved = store.get('nine-run', null);
    const d = meta.daily[today()];
    app.innerHTML = `<div id="title"><h1>九命骰局</h1><div class="tag">猫有九条命，你敢押几条？<br>再掷一把，翻倍或归零。</div>
      ${saved ? `<button class="btn green" id="cont">继续上一局<small>第 ${saved.night} 夜 · 剩 ${saved.lives} 条命 · $${saved.gold}</small></button>` : ''}
      <div class="cats">${Object.entries(E.CATS).map(([k, c]) => { const lock = meta.catnip < c.unlock; return `<button class="catc ${pick.cat === k ? 'on' : ''} ${lock ? 'locked' : ''}" data-cat="${k}" ${lock ? 'disabled' : ''}><img class="px tint-${k}" src="../assets/cat-idle1.png" alt=""><b>${esc(c.name)}</b>${lock ? `累计 ${c.unlock} 猫薄荷解锁` : esc(c.desc)}</button>`; }).join('')}</div>
      <div class="heat">热度 ${[0, 1, 2, 3, 4, 5].map(h => `<button data-h="${h}" class="${pick.heat === h ? 'on' : ''}" ${h > meta.maxHeat ? 'disabled' : ''}>${h}</button>`).join('')}</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center"><button class="btn" id="start">开一局</button><button class="btn ghost" id="daily">今日局<small>${d ? '今日最高 ' + d.toLocaleString() : '每天固定一副骰运'}</small></button><button class="btn ghost" id="rules2">规则</button></div>
      <div class="stats">猫薄荷 ${meta.catnip} · 打过 ${meta.runs} 局 · 通关 ${meta.wins} 次 · 最远第 ${meta.bestNight} 夜 · 最高分 ${meta.bestScore.toLocaleString()}</div>
      <a href="../index.html" style="color:var(--muted);font-size:14px">← 回游戏厅</a><div class="fine">筹码纯属虚拟，不涉及真钱，也不能兑换。</div></div>`;
    app.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { pick.cat = b.dataset.cat; SFX.click(); renderTitle(); });
    app.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { pick.heat = +b.dataset.h; SFX.click(); renderTitle(); });
    document.getElementById('start').onclick = () => startRun({ cat: pick.cat, heat: pick.heat });
    document.getElementById('daily').onclick = () => startRun({ cat: 'orange', heat: 0, daily: true });
    document.getElementById('rules2').onclick = showRules;
    const c = document.getElementById('cont');
    if (c) c.onclick = () => resume(saved);
  }
  function resume(saved) {
    r = saved; SFX.unlock(); SFX.startMusic();
    if (r.phase === 'shop') return renderShop();
    if (r.phase === 'turn-start') return renderTurnStart();
    if (r.phase === 'night-result') return showNightResult(r.lastNight);
    if (r.phase === 'turn-over') return (renderTable(), finishTurn());
    if (r.phase === 'choose') {
      renderTable(); throwDice(document.getElementById('tray'), r.turn.roll); sel = new Set(E.scoringPicks(r)); renderChoose(); return;
    }
    renderTurnStart();
  }
  addEventListener('keydown', e => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (document.querySelector('.overlay')) { if (k === ' ' || k === 'enter') { const b = document.querySelector('.overlay .btn:not(.ghost)'); if (b && b.style.visibility !== 'hidden') { e.preventDefault(); b.click(); } } return; }
    if (!r || busy) return;
    if (k === ' ') { e.preventDefault(); if (r.phase === 'turn-start') act_begin(); else if (r.phase === 'choose') act_again(); }
    else if (k === 'b' && r.phase === 'choose') act_bank();
  });
  window.__G = { get r() { return r; }, E, sel: () => sel, meta };
  renderTitle();
})();
