// 招财弹珠：规则与物理引擎，无 DOM。固定步长 + 自带随机状态，同种子同操作结果一致，可 JSON 存档。
(function (root) {
  const W = 640, H = 860, BALL_R = 11, PEG_R = 6, DT = 1 / 120, G = 980, REST = 0.5;
  const POCKETS = 9, POCKET_TOP = H - 62, CATCH_Y = H - 108, FINAL_ROUND = 10;
  const ROWS = 10, ROW_GAP = 58, COL_GAP = 64, TOP_Y = 130;
  const rnd = (r, k) => { const s = r[k] = (r[k] + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const PEGS = {
    gold:   { name: '金钉', icon: '💰', desc: '每次撞到 +$1', color: '#ffc93c' },
    mult:   { name: '倍钉', icon: '✖️', desc: '撞到时本球倍率 +0.5（每球每钉一次）', color: '#ff5c8a' },
    bumper: { name: '弹钉', icon: '💥', desc: '猛弹一下，撞钉分 +40', color: '#5cd2ff' },
    bomb:   { name: '炸钉', icon: '💣', desc: '每球第一次撞到时爆炸，周围的钉全部计分', color: '#ff7a3c' },
    split:  { name: '裂钉', icon: '🔱', desc: '每回合一次：把球裂成两颗', color: '#b48cff' },
  };
  const CHARMS = {
    chain:   { name: '连击猫', rar: 0, cost: 4, icon: '😼', desc: '同一颗球每撞 5 次钉，之后撞钉分 +5' },
    fatfish: { name: '肥鱼', rar: 0, cost: 4, icon: '🐟', desc: '所有钉的基础分 +5' },
    tip:     { name: '小费', rar: 0, cost: 4, icon: '🪙', desc: '每颗球落袋 +$1' },
    refund:  { name: '保险', rar: 0, cost: 4, icon: '🧾', desc: '押注没中时，退回一半' },
    paw:     { name: '猫拳', rar: 0, cost: 5, icon: '🐾', desc: '每颗球多拍 1 爪' },
    wall:    { name: '撞墙猫', rar: 0, cost: 5, icon: '🧱', desc: '球每撞一次墙，本球倍率 +0.3' },
    catbig:  { name: '懒猫', rar: 0, cost: 5, icon: '🛌', desc: '接球猫变宽 60%，走得更慢' },
    pot:     { name: '聚宝盆', rar: 1, cost: 8, icon: '🏺', desc: '所有袋子的倍率 +1（含黑袋）' },
    luck:    { name: '赌徒运', rar: 1, cost: 8, icon: '🎲', desc: '押中的赔率 +50%' },
    extra:   { name: '多一颗', rar: 1, cost: 9, icon: '🔵', desc: '每轮多 1 颗球' },
    compound:{ name: '利滚利', rar: 1, cost: 8, icon: '📈', desc: '每有 $10，最终得分 +15%（上限 +150%）' },
    edge:    { name: '边缘人', rar: 1, cost: 7, icon: '🦯', desc: '最左和最右的袋子倍率 ×2' },
    magnet:  { name: '招财磁铁', rar: 2, cost: 12, icon: '🧲', desc: '押注的袋子会轻轻吸球' },
    echo:    { name: '回声', rar: 2, cost: 12, icon: '🔔', desc: '球第一次撞钉的分翻 10 倍' },
    golden:  { name: '点石成金', rar: 2, cost: 12, icon: '🌟', desc: '每轮开始，随机 3 颗普通钉临时变金钉' },
  };
  const POCKET_SET = [0, 0.5, 1, 1, 2, 2, 3, 5, 0];
  const BET_ODDS = 3, NEAR_BACK = 0.5;

  const target = (n, heat) => Math.round(600 * Math.pow(1.42, n - 1) * (1 + heat * 0.15) / 10) * 10;
  const has = (r, id) => r.charms.includes(id);

  function buildPegs() {
    const a = [];
    for (let row = 0; row < ROWS; row++) {
      const off = row % 2 ? COL_GAP / 2 : 0;
      for (let x = 32 + off; x < W - 20; x += COL_GAP) a.push({ x, y: TOP_Y + row * ROW_GAP, kind: null });
    }
    return a;
  }
  function newRun(o = {}) {
    const seed = (o.seed ?? (Date.now() & 0x7fffffff)) >>> 0;
    const r = { seed, rs: seed | 0, ss: (seed ^ 0x51ED270B) | 0, heat: o.heat || 0, daily: !!o.daily, round: 1, gold: 6, tokens: 2, pegs: buildPegs(), charms: [], total: 0, bestBall: 0, won: false, over: false, phase: 'aim', stats: { balls: 0, bets: 0, betWins: 0, catches: 0, gambleWins: 0 } };
    startRound(r);
    return r;
  }
  function startRound(r) {
    const pockets = [...POCKET_SET];
    for (let i = pockets.length - 1; i > 0; i--) { const j = Math.floor(rnd(r, 'rs') * (i + 1)); [pockets[i], pockets[j]] = [pockets[j], pockets[i]]; }
    r.pockets = pockets.map(m => ({ mult: m }));
    r.R = { target: target(r.round, r.heat), score: 0, balls: 5 + (has(r, 'extra') ? 1 : 0), splitUsed: false, temp: [] };
    r.pegs.forEach(p => { if (p.temp) { p.kind = null; p.temp = false; } });
    if (has(r, 'golden')) {
      const plain = r.pegs.filter(p => !p.kind);
      for (let i = 0; i < 3 && plain.length; i++) { const p = plain.splice(Math.floor(rnd(r, 'rs') * plain.length), 1)[0]; p.kind = 'gold'; p.temp = true; }
    }
    r.bet = { pocket: -1, amount: 0 };
    r.catcher = { x: W / 2, dir: 1, w: has(r, 'catbig') ? 118 : 74, speed: has(r, 'catbig') ? 70 : 120 };
    r.balls = []; r.phase = 'aim';
  }
  function pocketMult(r, i) {
    let m = r.pockets[i].mult;
    if (has(r, 'pot')) m += 1;
    if (has(r, 'edge') && (i === 0 || i === POCKETS - 1)) m *= 2;
    return m;
  }
  function placeBet(r, pocket, amount) {
    if (r.phase !== 'aim') return false;
    amount = Math.max(0, Math.min(amount, r.gold, betCap(r)));
    r.bet = amount > 0 && pocket >= 0 ? { pocket, amount } : { pocket: -1, amount: 0 };
    return true;
  }
  const maxNudges = r => 2 + (has(r, 'paw') ? 1 : 0);
  const betCap = r => 8 + r.round * 2;
  const odds = r => BET_ODDS * (has(r, 'luck') ? 1.5 : 1);
  function drop(r, x) {
    if (r.phase !== 'aim' || r.R.balls <= 0) return false;
    x = Math.max(BALL_R + 2, Math.min(W - BALL_R - 2, x));
    r.R.balls--;
    if (r.bet.amount) { r.gold -= r.bet.amount; r.stats.bets++; }
    r.stats.balls++;
    r.dropBet = { ...r.bet };
    r.nudges = maxNudges(r);
    r.balls = [newBall(x, 46, (rnd(r, 'rs') - 0.5) * 16, 20)];
    r.ballResults = [];
    r.phase = 'flying';
    return true;
  }
  // 拍一爪：球在空中时横向推一把，每颗球次数有限。这是把「看运气」变成「看手感」的关键操作。
  function nudge(r, dir) {
    if (r.phase !== 'flying' || r.nudges <= 0) return false;
    const b = r.balls.find(x => !x.done && x.y < POCKET_TOP - 4);
    if (!b) return false;
    r.nudges--;
    for (const x of r.balls) if (!x.done && x.y < POCKET_TOP - 4) { x.vx = x.vx * 0.3 + dir * 190; x.vy = Math.min(x.vy, 120); }
    return true;
  }
  const newBall = (x, y, vx, vy) => ({ x, y, vx, vy, pts: 0, mult: 1, hits: 0, life: 0, slow: 0, cd: {}, once: {}, done: false, chainBonus: 0 });
  // 撞钉计分，返回给界面的事件。
  function hitPeg(r, b, i, evs) {
    const p = r.pegs[i], c = b.cd[i] || 0;
    if (b.life < c) return;
    b.cd[i] = b.life + 0.14;
    b.hits++;
    let v = 10 + (has(r, 'fatfish') ? 5 : 0) + b.chainBonus + Math.floor(r.round / 2) * 5;
    if (has(r, 'chain') && b.hits % 5 === 0) b.chainBonus += 5;
    if (has(r, 'echo') && b.hits === 1) v *= 10;
    const ev = { t: 'peg', i, v, kind: p.kind, combo: b.hits };
    if (p.kind === 'gold') { r.gold++; ev.gold = 1; }
    else if (p.kind === 'mult' && !b.once[i]) { b.once[i] = 1; b.mult += 0.5; ev.mult = b.mult; }
    else if (p.kind === 'bumper') {
      v += 40; ev.v = v;
      const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1;
      b.vx += dx / d * 340; b.vy += dy / d * 340 - 40;
    } else if (p.kind === 'bomb' && !b.once[i]) {
      b.once[i] = 1; ev.boom = [];
      r.pegs.forEach((q, j) => { if (j !== i && Math.hypot(q.x - p.x, q.y - p.y) < 100) { v += 15; ev.boom.push(j); } });
      ev.v = v;
    } else if (p.kind === 'split' && !r.R.splitUsed) {
      r.R.splitUsed = true; ev.split = true;
      const n = newBall(b.x, b.y, -b.vx * 0.9 + (b.vx >= 0 ? -60 : 60), b.vy * 0.8);
      n.mult = b.mult; n.life = b.life; n.cd = { ...b.cd };
      r.balls.push(n);
    }
    b.pts += v;
    evs.push(ev);
  }
  // 物理前进一步（DT 秒）。返回事件数组。
  function step(r) {
    const evs = [];
    const c = r.catcher;
    c.x += c.dir * c.speed * DT;
    if (c.x < c.w / 2 + 6) { c.x = c.w / 2 + 6; c.dir = 1; } else if (c.x > W - c.w / 2 - 6) { c.x = W - c.w / 2 - 6; c.dir = -1; }
    if (r.phase !== 'flying') return evs;
    for (const b of r.balls) {
      if (b.done) continue;
      b.life += DT;
      b.vy += G * DT;
      if (has(r, 'magnet') && r.dropBet.amount && b.y > 420) {
        const tx = (r.dropBet.pocket + 0.5) * W / POCKETS;
        b.vx += Math.sign(tx - b.x) * 120 * DT;
      }
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 900) { b.vx *= 900 / sp; b.vy *= 900 / sp; }
      b.x += b.vx * DT; b.y += b.vy * DT;
      if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx) * 0.8; if (has(r, 'wall') && b.life - (b.wallT || 0) > 0.1) { b.wallT = b.life; b.mult += 0.3; evs.push({ t: 'wall', mult: b.mult, x: b.x, y: b.y }); } }
      if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx) * 0.8; if (has(r, 'wall') && b.life - (b.wallT || 0) > 0.1) { b.wallT = b.life; b.mult += 0.3; evs.push({ t: 'wall', mult: b.mult, x: b.x, y: b.y }); } }
      for (let i = 0; i < r.pegs.length; i++) {
        const p = r.pegs[i], dx = b.x - p.x, dy = b.y - p.y;
        if (Math.abs(dy) > 16 || Math.abs(dx) > 16) continue;
        const d2 = dx * dx + dy * dy, R = BALL_R + PEG_R;
        if (d2 >= R * R) continue;
        const d = Math.sqrt(d2) || 0.01, nx = dx / d, ny = dy / d;
        b.x = p.x + nx * R; b.y = p.y + ny * R;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) { b.vx -= (1 + REST) * vn * nx; b.vy -= (1 + REST) * vn * ny; b.vx = b.vx * 0.82 + (rnd(r, 'rs') - 0.5) * 26; hitPeg(r, b, i, evs); }
      }
      // 卡住就踢一脚；超时强制掉落。
      if (Math.hypot(b.vx, b.vy) < 22) { b.slow += DT; if (b.slow > 0.45) { b.vx += (rnd(r, 'rs') - 0.5) * 220; b.vy = -60; b.slow = 0; } } else b.slow = 0;
      // 接球猫
      if (b.vy > 0 && b.y >= CATCH_Y - 8 && b.y <= CATCH_Y + 14 && Math.abs(b.x - c.x) < c.w / 2) { settle(r, b, -1, evs); continue; }
      // 袋子隔板
      if (b.y > POCKET_TOP) {
        const pw = W / POCKETS;
        const nearest = Math.round(b.x / pw) * pw;
        if (Math.abs(b.x - nearest) < BALL_R + 2 && nearest > 0 && nearest < W) { b.vx += (b.x < nearest ? -1 : 1) * 240 * DT * 3; }
      }
      if (b.y > H - 14 || b.life > 22) { settle(r, b, Math.max(0, Math.min(POCKETS - 1, Math.floor(b.x / (W / POCKETS)))), evs); }
    }
    if (r.balls.every(b => b.done)) finishBall(r, evs);
    return evs;
  }
  function moneyMult(r) { return has(r, 'compound') ? 1 + Math.min(1.5, 0.15 * Math.floor(r.gold / 10)) : 1; }
  function settle(r, b, pocket, evs) {
    b.done = true;
    let mult, caught = pocket < 0;
    if (caught) { mult = 3; r.R.balls++; r.stats.catches++; pocket = Math.floor(b.x / (W / POCKETS)); } else mult = pocketMult(r, pocket);
    if (has(r, 'tip')) r.gold++;
    const score = Math.floor(b.pts * b.mult * mult * moneyMult(r) / 5) * 5;
    r.R.score += score; r.total += score; r.bestBall = Math.max(r.bestBall, score);
    r.ballResults.push({ pocket, caught, score });
    evs.push({ t: 'land', pocket, caught, score, pts: b.pts, ballMult: b.mult, pocketMult: mult, x: b.x, y: b.y });
  }
  // 整颗球（含裂球）结束时结算押注：用第一颗落袋的球判定，裂球任一中即中。
  function finishBall(r, evs) {
    const bet = r.dropBet, res = r.ballResults;
    const out = { t: 'ball-end', results: res, bet: null };
    if (bet && bet.amount) {
      const hit = res.some(x => !x.caught && x.pocket === bet.pocket);
      const near = !hit && res.some(x => !x.caught && Math.abs(x.pocket - bet.pocket) === 1);
      let back = 0;
      if (hit) { back = Math.floor(bet.amount * odds(r)); r.stats.betWins++; }
      else if (near) back = Math.floor(bet.amount * NEAR_BACK);
      else if (has(r, 'refund')) back = Math.floor(bet.amount * 0.5);
      r.gold += back;
      out.bet = { hit, near, back, amount: bet.amount, pocket: bet.pocket };
    }
    evs.push(out);
    r.balls = [];
    r.bet = { pocket: -1, amount: 0 };
    const R = r.R;
    if (R.score >= R.target) endRound(r, true, out);
    else if (R.balls <= 0) endRound(r, false, out);
    else r.phase = 'aim';
  }
  function endRound(r, ok, out) {
    const R = r.R;
    if (!ok) {
      r.tokens--;
      if (r.tokens < 0) { r.tokens = 0; r.over = true; r.phase = 'over'; out.over = true; return; }
      r.phase = 'failed'; return;
    }
    r.cleared = r.round;
    R.prize = 3 + Math.floor(r.round / 3) + R.balls + (R.score >= R.target * 2 ? 3 : 0);
    r.gambles = 0;
    r.phase = 'prize';
    if (r.round === FINAL_ROUND && !r.won) { r.won = true; r.victoryPending = true; }
  }
  // 奖金阶梯：49% 翻倍，51% 归零；可一直赌，也可随时收下。
  function gamblePrize(r) {
    if (r.phase !== 'prize' || r.R.prize <= 0) return null;
    const win = rnd(r, 'ss') < 0.49;
    r.gambles++;
    if (win) { r.R.prize *= 2; r.stats.gambleWins++; } else r.R.prize = 0;
    return { win, prize: r.R.prize };
  }
  function collectPrize(r) {
    if (r.phase !== 'prize') return;
    const interest = Math.min(3, Math.floor(r.gold / 8));
    r.gold += r.R.prize + interest;
    r.lastInterest = interest;
    r.phase = r.victoryPending ? 'victory' : 'draft';
    r.victoryPending = false;
    if (r.phase === 'draft') makeDraft(r);
  }
  function pickCharmId(r) {
    const x = rnd(r, 'ss'), rar = x < 0.62 ? 0 : x < 0.92 ? 1 : 2;
    const pool = t => Object.keys(CHARMS).filter(k => CHARMS[k].rar === t && !has(r, k) && !(r.draft || []).some(c => c.id === k) && !(r.shop || []).some(c => c.id === k));
    for (let t = rar; t >= 0; t--) { const a = pool(t); if (a.length) return a[Math.floor(rnd(r, 'ss') * a.length)]; }
    return null;
  }
  // 三选一免费：一个钉、一个钉或护符；再加 3 件要花钱的。
  function makeDraft(r) {
    r.draft = []; r.shop = [];
    const pegKeys = Object.keys(PEGS);
    const pegPick = () => ({ type: 'peg', id: pegKeys[Math.floor(rnd(r, 'ss') * pegKeys.length)] });
    r.draft.push(pegPick());
    let second = pegPick(); let tries = 0;
    while (second.id === r.draft[0].id && tries++ < 8) second = pegPick();
    r.draft.push(second);
    const cid = pickCharmId(r);
    r.draft.push(cid ? { type: 'charm', id: cid } : pegPick());
    for (let i = 0; i < 2; i++) { const id = pickCharmId(r); if (id) r.shop.push({ type: 'charm', id, sold: false }); }
    r.shop.push({ type: 'token', id: 'token', sold: false, cost: 8 + r.round });
    r.shop.push({ ...pegPick(), sold: false, cost: 5 });
    r.refresh = 2;
    r.phase = 'draft';
    r.pendingPeg = null;
  }
  function chooseDraft(r, i) {
    const d = r.draft[i]; if (!d || r.phase !== 'draft') return false;
    r.draft = null;
    if (d.type === 'charm') { addCharm(r, d.id); r.phase = 'shop'; return true; }
    r.pendingPeg = d.id; r.afterPlace = 'shop'; r.phase = 'place';
    return true;
  }
  function addCharm(r, id) { if (r.charms.length < 5) r.charms.push(id); }
  function placePeg(r, i) {
    const p = r.pegs[i]; if (r.phase !== 'place' || !p) return false;
    p.kind = r.pendingPeg; p.temp = false;
    r.pendingPeg = null; r.phase = r.afterPlace;
    return true;
  }
  function priceOf(it) { return it.type === 'charm' ? CHARMS[it.id].cost : it.cost; }
  function buy(r, i) {
    const it = r.shop[i]; if (!it || it.sold || r.phase !== 'shop') return false;
    const c = priceOf(it); if (r.gold < c) return false;
    if (it.type === 'charm' && r.charms.length >= 5) return false;
    r.gold -= c; it.sold = true;
    if (it.type === 'charm') addCharm(r, it.id);
    else if (it.type === 'token') r.tokens++;
    else { r.pendingPeg = it.id; r.afterPlace = 'shop'; r.phase = 'place'; }
    return true;
  }
  function refreshShop(r) {
    if (r.phase !== 'shop' || r.gold < r.refresh) return false;
    r.gold -= r.refresh; r.refresh += 2;
    const keep = r.shop.filter(x => x.type === 'token');
    r.shop = [];
    for (let i = 0; i < 2; i++) { const id = pickCharmId(r); if (id) r.shop.push({ type: 'charm', id, sold: false }); }
    r.shop.push(...keep);
    const pegKeys = Object.keys(PEGS);
    r.shop.push({ type: 'peg', id: pegKeys[Math.floor(rnd(r, 'ss') * pegKeys.length)], sold: false, cost: 5 });
    return true;
  }
  function nextRound(r) { r.round++; r.draft = null; r.shop = null; startRound(r); }
  function retryRound(r) { if (r.phase === 'failed') startRound(r); }
  function endless(r) { if (r.phase === 'victory') { makeDraft(r); } }
  function catnip(r) { return (r.cleared || 0) + (r.won ? 10 : 0) + Math.max(0, (r.cleared || 0) - FINAL_ROUND) * 2; }

  const api = { nudge, maxNudges, betCap, W, H, BALL_R, PEG_R, DT, POCKETS, POCKET_TOP, CATCH_Y, FINAL_ROUND, PEGS, CHARMS, BET_ODDS, NEAR_BACK, target, has, newRun, startRound, pocketMult, placeBet, odds, drop, step, gamblePrize, collectPrize, chooseDraft, placePeg, priceOf, buy, refreshShop, nextRound, retryRound, endless, catnip, moneyMult };
  if (typeof module !== 'undefined') module.exports = api; else root.PachiEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
