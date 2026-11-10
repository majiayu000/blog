'use strict';
// 主循环：固定 60 步/秒的模拟 + 每帧渲染

const cv = document.getElementById('game'), ctx = cv.getContext('2d');
let VS = 1;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), k = Math.min(innerWidth / W, innerHeight / H);
  cv.style.width = Math.floor(W * k) + 'px'; cv.style.height = Math.floor(H * k) + 'px';
  VS = k * dpr; cv.width = Math.round(W * VS); cv.height = Math.round(H * VS);
}
function go(state, arg) { G.state = state; G.st = 0; const s = Screens[state]; if (s.enter) s.enter(arg); }
function step() {
  Input.poll(); Bot.update(STEP);
  G.t += STEP; G.st += STEP;
  Screens[G.state].update(STEP);
  Input.endStep();
}
function render() {
  ctx.setTransform(VS, 0, 0, VS, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, W, H);
  Screens[G.state].draw(ctx);
  if (Sound.muted) txt(ctx, '已静音 (M)', W - 10, H - 10, 11, 'rgba(255,255,255,.6)', 'right');
  if (Bot.n && !QS.get('clean')) txt(ctx, '机器人代打中', 10, H - 10, 11, 'rgba(255,255,255,.6)', 'left');
}
let lastTs = 0, acc = 0;
function frame(ts) {
  const dt = Math.min(0.1, (ts - lastTs) / 1000 || 0); lastTs = ts;
  if (!G.manual) {
    acc += dt * G.speed; let n = 0;
    while (acc >= STEP && n < 300) { step(); acc -= STEP; n++; }
    if (n >= 300) acc = 0;
    Sound.tick(); render();
  }
  requestAnimationFrame(frame);
}

// 测试用：不靠真实时间，直接把模拟往前推 sec 秒
window.GAME = {
  advance(sec) { G.manual = true; const n = Math.round(sec / STEP); for (let i = 0; i < n; i++) step(); render(); return this.info(); },
  info() {
    return { state: G.state, cleared: Save.d.cleared, log: G.log, stage: S ? { idx: S.idx, mode: S.mode, time: +S.time.toFixed(1), seg: S.seg, foes: S.foes().length, boss: S.boss ? Math.round(S.boss.hp) : null, players: S.players.map(p => ({ hero: p.hero.id, hp: Math.round(p.hp), lives: p.lives, out: p.out, meter: Math.round(p.meter), state: p.state })) } : null };
  },
};

Save.load();
Sound.muted = !!Save.d.mute || !!QS.get('mute');
G.speed = +(QS.get('speed') || 1);
G.manual = !!QS.get('manual'); // 录制/测试时由外部逐步推进
Input.init(); resize(); addEventListener('resize', resize);
go('title');
if (QS.get('stage')) {
  // ?stage=3&hero=4 直接进某一关
  G.picks = [{ dev: Bot.n ? 'bot0' : 'k1', hero: +(QS.get('hero') || 0) }];
  for (let i = 1; i < Bot.n; i++) G.picks.push({ dev: 'bot' + i, hero: Bot.heroes[i] != null ? Bot.heroes[i] : i % HEROES.length });
  G.p1dev = G.picks[0].dev;
  go('play', clamp(+QS.get('stage') - 1, 0, 7));
}
requestAnimationFrame(frame);
