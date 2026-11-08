// 九命骰局：纯规则引擎，无 DOM，浏览器和 Node 模拟共用。
(function (root) {
  // 随机状态存在 run 对象里，这样整局可以 JSON 存档，刷新页面也改不了命。
  const rnd = (r, k) => { const s = r[k] = (r[k] + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const FINAL_NIGHT = 12, MAX_CHARMS = 5;

  const CHARMS = {
    fishbone: { name: '小鱼干', rar: 0, cost: 4, icon: '🐟', desc: '单个 1 的分值 +100' },
    wufu:     { name: '五福', rar: 0, cost: 4, icon: '🧧', desc: '单个 5 的分值 +100' },
    zhaocai:  { name: '招财猫', rar: 0, cost: 4, icon: '🐱', desc: '每晚通关多得 $3' },
    piggy:    { name: '存钱罐', rar: 0, cost: 4, icon: '🐷', desc: '利息上限 +5' },
    cushion:  { name: '软垫', rar: 0, cost: 5, icon: '🛏️', desc: '爆骰时保住一半彩池' },
    glutton:  { name: '贪吃猫', rar: 0, cost: 5, icon: '😼', desc: '本回合每掷一次，最终倍率 +0.25' },
    even:     { name: '偶数党', rar: 0, cost: 5, icon: '🎎', desc: '偶数的三条及以上分值 ×2' },
    odd:      { name: '奇数党', rar: 0, cost: 5, icon: '🎏', desc: '奇数的三条及以上分值 ×2' },
    extra:    { name: '再来一局', rar: 1, cost: 8, icon: '🔁', desc: '每晚多 1 个回合' },
    hotpot:   { name: '满堂彩', rar: 1, cost: 8, icon: '🎉', desc: '满堂时倍率额外 +1' },
    iron:     { name: '铁胃', rar: 1, cost: 7, icon: '🛡️', desc: '押命爆骰时不掉命' },
    cheat:    { name: '老千', rar: 1, cost: 8, icon: '🃏', desc: '每晚第一次爆骰，自动重掷' },
    combo:    { name: '三缺一', rar: 1, cost: 7, icon: '🀄', desc: '顺子和三对分值 ×3' },
    blood:    { name: '赌徒之血', rar: 1, cost: 8, icon: '🩸', desc: '每少 1 条命，最终倍率 +0.2' },
    compound: { name: '复利猫', rar: 1, cost: 8, icon: '📈', desc: '每有 $5，最终倍率 +0.1（上限 +1.5）' },
    streak:   { name: '连胜牌', rar: 1, cost: 8, icon: '🔥', desc: '连续不爆骰的回合数，每回合最终倍率 +0.2' },
    nine:     { name: '九尾', rar: 2, cost: 12, icon: '🦊', desc: '押命的倍率从 ×2 变成 ×3' },
    goldpaw:  { name: '黄金爪', rar: 2, cost: 13, icon: '🐾', desc: '所有骰子的 6 点都变成猫爪' },
    fate:     { name: '命运硬币', rar: 2, cost: 12, icon: '🪙', desc: '收手时抛硬币：正面得分 ×3，反面 ×1' },
    market:   { name: '黑市通行证', rar: 2, cost: 11, icon: '🎫', desc: '商店一律便宜 $2，每次刷新免费一次' },
  };
  const FACE_ITEMS = {
    lead:  { name: '灌铅', cost: 3, icon: '⚫', desc: '把一面改成 1 点' },
    five:  { name: '描金五', cost: 2, icon: '⑤', desc: '把一面改成 5 点' },
    wild:  { name: '猫爪面', cost: 6, icon: '🐾', desc: '这一面可当任意点数' },
    gold:  { name: '金面', cost: 3, icon: '💰', desc: '这一面被留下时得 $2' },
    lucky: { name: '福面', cost: 5, icon: '福', desc: '这一面被留下时，最终倍率 +0.5' },
    bomb:  { name: '炸面', cost: 4, icon: '💣', desc: '被留下时彩池 ×1.5；爆骰时若露出它，掉 1 条命' },
    plus:  { name: '加面', cost: 3, icon: '➕', desc: '这一面被留下时，彩池 +200' },
  };
  const BOSSES = {
    3:  { id: 'no5', name: '铁面赌神', desc: '单个 5 不计分' },
    6:  { id: 'thief', name: '偷鱼贼', desc: '每掷一次扣 $1，且只有 2 个回合' },
    9:  { id: 'no1', name: '独眼龙', desc: '单个 1 不计分' },
    12: { id: 'king', name: '史莱姆赌王', desc: '不能押命，每次爆骰掉 1 条命' },
  };
  const CATS = {
    orange: { name: '橘猫', unlock: 0, desc: '开局多 $3，新手之选', lives: 9, gold: 9 },
    black:  { name: '黑猫', unlock: 15, desc: '只有 6 条命，但自带「九尾」', lives: 6, gold: 6, charms: ['nine'] },
    fat:    { name: '胖猫', unlock: 25, desc: '每晚多 1 回合，但开局没钱', lives: 9, gold: 0, charms: ['extra'] },
    calico: { name: '三花', unlock: 40, desc: '两颗骰子各灌铅一面，开局 7 条命', lives: 7, gold: 6, lead: 2 },
  };

  const target = (n, heat) => Math.round((800 * Math.pow(1.38, n - 1) * (1 + heat * 0.15) * (BOSSES[((n - 1) % 12) + 1] ? 1.2 : 1)) / 50) * 50;
  const has = (r, id) => r.charms.includes(id);
  const boss = r => r.night <= FINAL_NIGHT ? (BOSSES[r.night] || null) : (BOSSES[((r.night - 1) % 3 + 1) * 3] || null);

  function makeDie() { return { faces: [1, 2, 3, 4, 5, 6].map(v => ({ v, kind: null })) }; }

  function newRun(o = {}) {
    const cat = CATS[o.cat || 'orange'], seed = (o.seed ?? (Date.now() & 0x7fffffff)) >>> 0;
    const r = { seed, cat: o.cat || 'orange', heat: o.heat || 0, daily: !!o.daily, lives: cat.lives, maxLives: cat.lives, gold: cat.gold, night: 1, dice: Array.from({ length: 6 }, makeDie), charms: [...(cat.charms || [])], rs: seed | 0, ss: (seed ^ 0x51ED270B) | 0, total: 0, busts: 0, bestTurn: 0, cleared: 0, phase: 'night', over: false, won: false, contract: 0, stats: { rolls: 0, hot: 0, staked: 0 } };
    for (let i = 0; i < (cat.lead || 0); i++) r.dice[i].faces[1] = { v: 1, kind: null };
    startNight(r);
    return r;
  }

  function startNight(r) {
    const b = boss(r);
    r.nightS = { target: target(r.night, r.heat), score: 0, turnsLeft: (b && b.id === 'thief' ? 2 : 3) + (has(r, 'extra') ? 1 : 0), busts: 0, cheatUsed: false, streak: 0 };
    r.phase = 'turn-start'; r.turn = null;
  }

  function rules(r) {
    const b = boss(r);
    return { s1: 100 + (has(r, 'fishbone') ? 100 : 0), s5: 50 + (has(r, 'wufu') ? 100 : 0), ban1: !!(b && b.id === 'no1'), ban5: !!(b && b.id === 'no5'), even: has(r, 'even') ? 2 : 1, odd: has(r, 'odd') ? 2 : 1, combo: has(r, 'combo') ? 3 : 1 };
  }
  const ruleKey = u => [u.s1, u.s5, +u.ban1, +u.ban5, u.even, u.odd, u.combo].join();
  const scoreMemo = new Map();

  function plainScore(vals, u) {
    const c = [0, 0, 0, 0, 0, 0, 0];
    for (const v of vals) c[v]++;
    let best = -1, sum = 0, ok = true;
    for (let v = 1; v <= 6; v++) {
      const k = c[v]; if (!k) continue;
      if (k >= 3) sum += (v === 1 ? 1000 : v * 100) * (1 << (k - 3)) * (v % 2 ? u.odd : u.even);
      else if (v === 1 && !u.ban1) sum += u.s1 * k;
      else if (v === 5 && !u.ban5) sum += u.s5 * k;
      else ok = false;
    }
    if (ok) best = sum;
    if (vals.length === 6) {
      if (c.slice(1).every(k => k === 1)) best = Math.max(best, 1500 * u.combo);
      if (c.slice(1).filter(k => k === 2).length === 3) best = Math.max(best, 1000 * u.combo);
    }
    return best;
  }
  // 猫爪记作 0：枚举它当什么点最划算；任一颗不计分则返回 -1。
  function scoreSet(vals, u) {
    if (!vals.length) return -1;
    const key = ruleKey(u) + '|' + [...vals].sort().join('');
    if (scoreMemo.has(key)) return scoreMemo.get(key);
    const rec = (i, cur) => {
      if (i === vals.length) return plainScore(cur, u);
      if (vals[i]) return rec(i + 1, [...cur, vals[i]]);
      let b = -1;
      for (let v = 1; v <= 6; v++) b = Math.max(b, rec(i + 1, [...cur, v]));
      return b;
    };
    const s = rec(0, []);
    scoreMemo.set(key, s);
    return s;
  }
  const canMemo = new Map();
  function anyScoring(vals, u) {
    // 无猫爪时直接数点数，这是最热的路径。
    const c = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < vals.length; i++) c[vals[i]]++;
    if ((c[1] && !u.ban1) || (c[5] && !u.ban5)) return true;
    if (c[0] && !(u.ban1 && u.ban5)) return true;
    for (let v = 1; v <= 6; v++) if (c[v] + c[0] >= 3) return true;
    if (vals.length !== 6) return false;
    if (!c[0]) return (c[1] === 1 && c[2] === 1 && c[3] === 1 && c[4] === 1 && c[5] === 1 && c[6] === 1) || [c[1], c[2], c[3], c[4], c[5], c[6]].filter(k => k === 2).length === 3;
    const key = ruleKey(u) + '|' + [...vals].sort().join('');
    if (canMemo.has(key)) return canMemo.get(key);
    const ok = scoreSet(vals, u) > 0;
    canMemo.set(key, ok);
    return ok;
  }
  const faceVal = (r, f) => (f.kind === 'wild' || (f.v === 6 && has(r, 'goldpaw'))) ? 0 : f.v;

  // 下一掷爆骰的精确概率：枚举所有面的组合，按骰面配置缓存。
  const bustMemo = new Map();
  function bustChance(r, idxs) {
    const u = rules(r);
    const sets = idxs.map(i => r.dice[i].faces.map(f => faceVal(r, f)));
    const key = ruleKey(u) + '|' + sets.map(s => [...s].sort().join('')).sort().join('/');
    if (bustMemo.has(key)) return bustMemo.get(key);
    let bust = 0, total = 0;
    const cur = [];
    const rec = i => {
      if (i === sets.length) { total++; if (!anyScoring(cur, u)) bust++; return; }
      for (const v of sets[i]) { cur[i] = v; rec(i + 1); }
    };
    cur.length = sets.length;
    rec(0);
    const p = total ? bust / total : 0;
    bustMemo.set(key, p);
    return p;
  }

  function beginTurn(r, stake) {
    if (r.phase !== 'turn-start') throw new Error('phase ' + r.phase);
    const b = boss(r);
    const canStake = !(b && b.id === 'king') && r.lives > 1;
    r.turn = { free: [0, 1, 2, 3, 4, 5], kept: [], pot: 0, mult: 1, rolls: 0, stake: !!stake && canStake, roll: [], pending: true, potFactor: 1 };
    if (r.turn.stake) r.stats.staked++;
    r.phase = 'roll';
    return doRoll(r);
  }
  function doRoll(r) {
    const t = r.turn;
    const b = boss(r);
    t.roll = t.free.map(d => { const fi = Math.floor(rnd(r, 'rs') * 6); return { d, fi, f: r.dice[d].faces[fi] }; });
    t.rolls++; r.stats.rolls++;
    if (b && b.id === 'thief' && r.gold > 0) r.gold--;
    t.pending = true;
    const vals = t.roll.map(x => faceVal(r, x.f));
    if (anyScoring(vals, rules(r))) { r.phase = 'choose'; return { type: 'rolled' }; }
    if (has(r, 'cheat') && !r.nightS.cheatUsed) {
      r.nightS.cheatUsed = true;
      const ev = doRoll(r);
      return { ...ev, cheated: true };
    }
    return bust(r);
  }
  function bust(r) {
    const t = r.turn, n = r.nightS, b = boss(r);
    const ev = { type: 'bust', lost: t.pot, kept: 0, lifeLost: 0 };
    r.busts++; n.busts++; n.streak = 0;
    if (has(r, 'cushion') && t.pot) { ev.kept = Math.floor(finalScore(r) / 2 / 10) * 10; n.score += ev.kept; r.total += ev.kept; }
    if (t.stake && !has(r, 'iron')) ev.lifeLost++;
    if (t.roll.some(x => x.f.kind === 'bomb')) ev.lifeLost++;
    if (b && b.id === 'king') ev.lifeLost++;
    r.lives -= ev.lifeLost;
    r.phase = 'turn-over'; n.turnsLeft--;
    r.lastEvent = ev;
    return ev;
  }
  // 选中的骰子（roll 下标）能拿多少分；-1 表示选中了不计分的骰子。
  function pickScore(r, picks) { return scoreSet(picks.map(i => faceVal(r, r.turn.roll[i].f)), rules(r)); }
  function scoringPicks(r) { // 默认全选所有能计分的骰子：返回最大合法子集。
    const n = r.turn.roll.length; let best = [], bestLen = 0, bestS = -1;
    for (let m = 1; m < (1 << n); m++) {
      const p = []; for (let i = 0; i < n; i++) if (m >> i & 1) p.push(i);
      const s = pickScore(r, p);
      if (s > 0 && (p.length > bestLen || (p.length === bestLen && s > bestS))) { best = p; bestLen = p.length; bestS = s; }
    }
    return best;
  }
  function take(r, picks) {
    const t = r.turn;
    const s = pickScore(r, picks);
    if (r.phase !== 'choose' || s <= 0) throw new Error('bad take');
    const ev = { type: 'take', points: s, hot: false, gold: 0 };
    t.pot += s;
    for (const i of picks) {
      const x = t.roll[i], k = x.f.kind;
      if (k === 'gold') { r.gold += 2; ev.gold += 2; }
      else if (k === 'lucky') t.mult += 0.5;
      else if (k === 'bomb') t.potFactor *= 1.5;
      else if (k === 'plus') t.pot += 200;
    }
    const picked = new Set(picks.map(i => t.roll[i].d));
    t.free = t.free.filter(d => !picked.has(d));
    t.kept.push(...picks.map(i => t.roll[i]));
    t.roll = []; t.pending = false;
    if (!t.free.length) { t.free = [0, 1, 2, 3, 4, 5]; t.kept = []; t.mult += 1 + (has(r, 'hotpot') ? 1 : 0); ev.hot = true; r.stats.hot++; }
    return ev;
  }
  function multBreakdown(r) {
    const t = r.turn; let m = t.mult;
    if (has(r, 'glutton')) m += 0.25 * t.rolls;
    if (has(r, 'blood')) m += 0.2 * (r.maxLives - r.lives > 0 ? r.maxLives - r.lives : 0);
    if (has(r, 'compound')) m += Math.min(1.5, 0.1 * Math.floor(r.gold / 5));
    if (has(r, 'streak')) m += 0.2 * r.nightS.streak;
    if (t.stake) m *= has(r, 'nine') ? 3 : 2;
    return m;
  }
  function finalScore(r) { return Math.floor(r.turn.pot * r.turn.potFactor * multBreakdown(r) / 10) * 10; }
  function reroll(r) { if (r.turn.pending) throw new Error('must take'); r.phase = 'roll'; return doRoll(r); }
  function bank(r) {
    if (r.turn.pending) throw new Error('must take');
    let s = finalScore(r), fate = null;
    if (has(r, 'fate')) { fate = rnd(r, 'rs') < 0.5; if (fate) s *= 3; }
    r.nightS.score += s; r.total += s; r.bestTurn = Math.max(r.bestTurn, s);
    r.nightS.streak++; r.nightS.turnsLeft--;
    r.phase = 'turn-over';
    return r.lastEvent = { type: 'bank', score: s, fate };
  }
  function afterTurn(r) { // 回合收尾：判定本晚结束与否。
    const n = r.nightS;
    if (r.lives <= 0) return endRun(r, false);
    if (n.score >= n.target) return endNight(r, true);
    if (n.turnsLeft <= 0) return endNight(r, false);
    r.phase = 'turn-start'; r.turn = null;
    return { type: 'next-turn' };
  }
  function endNight(r, ok) {
    const n = r.nightS, ev = { type: 'night-end', ok, parts: [], penalty: 0 };
    const add = (label, v) => { if (v) { ev.parts.push([label, v]); r.gold += v; } };
    if (ok) {
      r.cleared = Math.max(r.cleared, r.night);
      add('通关', 4 + Math.floor(r.night / 3));
      add('剩余回合', n.turnsLeft * 2);
      if (n.score >= n.target * 2) add('超额翻倍', 4);
      if (has(r, 'zhaocai')) add('招财猫', 3);
      add('利息', Math.min(has(r, 'piggy') ? 10 : 5, Math.floor(r.gold / 5)));
      if (r.contract) { if (n.busts === 0) add('赌约兑现', r.contract * 3); else ev.parts.push(['赌约作废', 0]); }
    } else {
      ev.penalty = boss(r) ? 4 : 3;
      r.lives -= ev.penalty;
      add('安慰金', 2);
      if (r.contract) ev.parts.push(['赌约作废', 0]);
    }
    r.contract = 0;
    if (r.lives <= 0) { r.lastNight = ev; return endRun(r, false); }
    if (!ok && r.night === FINAL_NIGHT && !r.won) { r.phase = 'night-result'; r.retryFinal = true; r.lastNight = ev; return ev; }
    if (ok && r.night === FINAL_NIGHT && !r.won) { r.won = true; ev.victory = true; }
    r.retryFinal = false;
    r.phase = 'night-result'; r.lastNight = ev;
    return ev;
  }
  function endRun(r, won) { r.lives = Math.max(0, r.lives); r.over = true; r.phase = 'over'; return { type: 'run-over', won }; }
  function catnip(r) { return r.cleared + (r.won ? 10 : 0) + Math.max(0, r.cleared - FINAL_NIGHT) * 2 + (r.won ? r.heat * 3 : 0); }

  // ===== 商店与赌坊 =====
  function priceOf(r, base) { return Math.max(1, base - (has(r, 'market') ? 2 : 0)); }
  function pickCharm(r, minRar = 0) {
    const roll = rnd(r, 'ss');
    let rar = roll < 0.65 ? 0 : roll < 0.93 ? 1 : 2;
    rar = Math.max(rar, minRar);
    const avail = t => Object.keys(CHARMS).filter(k => CHARMS[k].rar === t && !has(r, k) && !(r.shop && r.shop.charms.some(c => c && c.id === k)));
    for (let t = rar; t >= 0; t--) { const a = avail(t); if (a.length) return a[Math.floor(rnd(r, 'ss') * a.length)]; }
    for (let t = rar + 1; t <= 2; t++) { const a = avail(t); if (a.length) return a[Math.floor(rnd(r, 'ss') * a.length)]; }
    return null;
  }
  function rollShopItems(r) {
    r.shop.charms = [];
    for (let i = 0; i < 3; i++) { const id = pickCharm(r); if (id) r.shop.charms.push({ id, sold: false }); }
    const keys = Object.keys(FACE_ITEMS); const a = [...keys];
    r.shop.faces = [];
    for (let i = 0; i < 3; i++) { const k = a.splice(Math.floor(rnd(r, 'ss') * a.length), 1)[0]; r.shop.faces.push({ id: k, sold: false }); }
  }
  function openShop(r) {
    if (r.retryFinal) { startNight(r); return; }
    r.night++;
    r.shop = { charms: [], faces: [], refresh: has(r, 'market') ? 0 : 2, box: false, deal: false, contract: false };
    rollShopItems(r);
    r.phase = 'shop';
  }
  function leaveShop(r) { r.shop = null; startNight(r); }
  function refreshShop(r) {
    const c = r.shop.refresh;
    if (r.gold < c) return false;
    r.gold -= c; r.shop.refresh = c + 2;
    rollShopItems(r);
    return true;
  }
  function buyCharm(r, i) {
    const it = r.shop.charms[i]; if (!it || it.sold) return false;
    const c = priceOf(r, CHARMS[it.id].cost);
    if (r.gold < c || r.charms.length >= MAX_CHARMS) return false;
    r.gold -= c; r.charms.push(it.id); it.sold = true; return true;
  }
  function sellCharm(r, id) {
    const i = r.charms.indexOf(id); if (i < 0) return 0;
    const v = Math.floor(CHARMS[id].cost / 2); r.charms.splice(i, 1); r.gold += v; return v;
  }
  // 给定骰子和面下标，把商店里的符面刻上去。
  function buyFace(r, i, die, face) {
    const it = r.shop.faces[i]; if (!it || it.sold) return false;
    const c = priceOf(r, FACE_ITEMS[it.id].cost);
    if (r.gold < c) return false;
    r.gold -= c; it.sold = true;
    const f = r.dice[die].faces[face];
    if (it.id === 'lead') r.dice[die].faces[face] = { v: 1, kind: f.kind };
    else if (it.id === 'five') r.dice[die].faces[face] = { v: 5, kind: f.kind };
    else r.dice[die].faces[face] = { v: f.v, kind: it.id };
    return true;
  }
  // 双倍或归零：49% 胜率，界面明示。
  function coinFlip(r, stake) {
    stake = Math.min(stake, r.gold); if (stake <= 0) return null;
    const win = rnd(r, 'ss') < 0.49;
    r.gold += win ? stake : -stake;
    return { win, stake };
  }
  function blindBox(r) {
    const c = 5; if (r.shop.box || r.gold < c) return null;
    r.shop.box = true; r.gold -= c;
    const x = rnd(r, 'ss');
    if (x < 0.32) { r.gold += 2; return { kind: 'gold', v: 2 }; }
    if (x < 0.57) { r.gold += 9; return { kind: 'gold', v: 9 }; }
    if (x < 0.60) { r.gold += 25; return { kind: 'gold', v: 25 }; }
    if (x < 0.64) { r.lives = Math.min(r.maxLives, r.lives + 1); return { kind: 'life' }; }
    const rar = x < 0.85 ? 0 : x < 0.97 ? 1 : 2;
    const id = pickCharm(r, rar);
    if (id && r.charms.length < MAX_CHARMS) { r.charms.push(id); return { kind: 'charm', id }; }
    r.gold += 8; return { kind: 'gold', v: 8 };
  }
  function bloodDeal(r) { // 卖 1 条命，换一个稀有以上护符。
    if (r.shop.deal || r.lives <= 1 || r.charms.length >= MAX_CHARMS) return null;
    const id = pickCharm(r, 1); if (!id) return null;
    r.shop.deal = true; r.lives--; r.charms.push(id);
    return { id };
  }
  function signContract(r, stake) { // 下一晚零爆骰通关，押金翻三倍；否则没收。
    stake = Math.min(stake, r.gold);
    if (r.shop.contract || stake <= 0) return false;
    r.shop.contract = true; r.gold -= stake; r.contract = stake; return true;
  }

  const api = { FINAL_NIGHT, MAX_CHARMS, CHARMS, FACE_ITEMS, BOSSES, CATS, target, has, boss, newRun, startNight, rules, scoreSet, bustChance, beginTurn, doRoll, pickScore, scoringPicks, take, multBreakdown, finalScore, reroll, bank, afterTurn, endNight, catnip, openShop, leaveShop, refreshShop, buyCharm, sellCharm, buyFace, coinFlip, blindBox, bloodDeal, signContract, faceVal, priceOf };
  if (typeof module !== 'undefined') module.exports = api; else root.DiceEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
