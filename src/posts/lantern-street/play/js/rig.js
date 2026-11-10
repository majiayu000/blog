'use strict';
// 骨骼小人：所有角色都由同一套骨架 + 参数画出来，动画是关键帧姿势之间的插值

const RIG_SCALE = 1.25, OUT = INK, ICE_C = '#a9dcff', DAZE_C = '#ffe9a0';
const BUILDS = {
  adult: { l1: 17, l2: 17, T: 27, tw: 22, U: 13, F: 13, R: 14, lw: 8, aw: 7 },
  slim: { l1: 19, l2: 19, T: 27, tw: 18, U: 14, F: 14, R: 13, lw: 7, aw: 6 },
  kid: { l1: 12, l2: 12, T: 18, tw: 19, U: 10, F: 10, R: 14.5, lw: 7.5, aw: 6.5 },
  small: { l1: 12, l2: 12, T: 21, tw: 22, U: 11, F: 10, R: 13.5, lw: 7.5, aw: 6.5 },
  big: { l1: 17, l2: 16, T: 32, tw: 36, U: 15, F: 15, R: 15, lw: 12, aw: 11 },
};

// 姿势 = [躯干前倾, 头, 前臂肩, 前臂肘, 后臂肩, 后臂肘, 前腿髋, 前腿膝, 后腿髋, 后腿膝, 下沉]
const ST = [4, 0, 35, 95, 12, 100, 16, 12, -16, 10, 0];
const UP = [-16, -10, 176, 4, 164, 6, 10, 16, -16, 14, 0];
const JABP = [14, 0, 90, 0, -12, 112, 26, 12, -26, 5, 0];
const CROSSP = [18, 0, 8, 115, 94, 0, 28, 14, -28, 4, 0];
const KICKP = [-14, -4, -35, 60, 45, 85, 88, 0, -6, 12, 0];
const SMASHP = [30, 6, 52, 0, -20, 80, 32, 28, -32, 4, 0];
const DOWNP = [36, 8, 48, 0, 40, 4, 34, 40, -30, 20, 0];
const THROWP = [-14, -8, 195, 20, 30, 80, 10, 12, -20, 10, 0];
const ANIMS = {
  idle: { d: 1.1, loop: 1, k: [[0, ST], [0.55, [6, 2, 38, 100, 14, 106, 17, 17, -17, 14, 0]]] },
  guard: { d: 1.1, loop: 1, k: [[0, [6, 0, 30, 95, 62, 40, 18, 14, -18, 10, 0]], [0.55, [8, 0, 32, 98, 64, 42, 18, 18, -18, 14, 0]]] },
  walk: { d: 0.56, loop: 1, k: [[0, [7, 0, -28, 35, 34, 45, 30, 4, -24, 16, 0]], [0.14, [7, 0, 0, 40, 5, 45, 8, 2, 4, 55, 0]], [0.28, [7, 0, 34, 45, -28, 35, -24, 16, 30, 4, 0]], [0.42, [7, 0, 5, 45, 0, 40, 4, 55, 8, 2, 0]]] },
  run: { d: 0.3, loop: 1, k: [[0, [24, -6, -50, 85, 60, 80, 52, 20, -46, 62, 0]], [0.15, [24, -6, 60, 80, -50, 85, -46, 62, 52, 20, 0]]] },
  jump: { d: 0.2, air: 1, k: [[0, [2, -8, 150, 15, 130, 25, 42, 85, 8, 70, 0]]] },
  fall: { d: 0.2, air: 1, k: [[0, [-4, 6, 105, 10, -70, 25, 18, 22, -14, 34, 0]]] },
  jab: { d: 0.25, k: [[0, [-2, 0, 20, 125, 12, 100, 14, 10, -18, 10, 0]], [0.07, JABP], [0.16, JABP], [0.25, ST]] },
  cross: { d: 0.25, k: [[0, [0, 0, 30, 110, 20, 120, 16, 12, -16, 10, 0]], [0.07, CROSSP], [0.16, CROSSP], [0.25, ST]] },
  kick: { d: 0.4, k: [[0, [0, 0, 30, 100, 20, 100, 5, 60, -8, 8, 0]], [0.1, KICKP], [0.22, KICKP], [0.4, ST]] },
  smash: { d: 0.55, k: [[0, [-10, -6, 170, 18, 20, 95, 10, 14, -18, 10, 0]], [0.18, [-12, -8, 178, 12, 24, 95, 8, 16, -20, 10, 0]], [0.24, SMASHP], [0.38, SMASHP], [0.55, ST]] },
  flykick: { d: 0.2, air: 1, k: [[0, [-22, 4, -40, 60, 62, 72, 66, 0, 18, 96, 0]]] },
  slide: { d: 0.3, k: [[0, [34, -8, 72, 62, 50, 92, 62, 30, -52, 22, 0]]] },
  cast: { d: 0.5, loop: 1, k: [[0, [-8, -10, 162, 8, 150, 14, 14, 12, -16, 10, 0]], [0.25, [-10, -12, 168, 4, 156, 10, 14, 16, -16, 14, 0]]] },
  hurt: { d: 0.2, k: [[0, [-20, 16, -30, 42, -52, 30, 22, 22, -4, 26, 0]]] },
  getup: { d: 0.3, k: [[0, [34, 10, 42, 30, 22, 40, 44, 92, -10, 82, 0]], [0.3, ST]] },
  windup: { d: 0.4, k: [[0, ST], [0.25, [-14, -4, -62, 95, 14, 96, 12, 16, -20, 12, 0]]] },
  crouch: { d: 0.3, k: [[0, ST], [0.2, [26, 4, 30, 80, 10, 90, 40, 80, -20, 70, 0]]] },
  throwUp: { d: 0.3, k: [[0, ST], [0.2, THROWP]] },
  throw: { d: 0.3, k: [[0, THROWP], [0.1, [22, 4, 66, 0, -20, 70, 28, 16, -28, 4, 0]], [0.3, [22, 4, 66, 0, -20, 70, 28, 16, -28, 4, 0]]] },
  slamUp: { d: 0.4, k: [[0, ST], [0.3, UP]] },
  slamDown: { d: 0.3, k: [[0, UP], [0.08, DOWNP], [0.3, DOWNP]] },
  spin: { d: 0.2, loop: 1, k: [[0, [0, 0, 92, 0, -92, 0, 20, 14, -20, 14, 0]]] },
  victory: { d: 0.5, loop: 1, k: [[0, [-4, -8, 116, 28, 164, 8, 10, 6, -10, 6, 0]], [0.25, [-4, -8, 128, 38, 172, 4, 14, 32, -14, 32, 0]]] },
  dizzy: { d: 0.8, loop: 1, k: [[0, [18, 14, 12, 10, -8, 10, 14, 26, -14, 24, 0]], [0.4, [10, -10, 16, 10, -4, 10, 10, 22, -18, 26, 0]]] },
};

const _pose = new Array(11).fill(0);
function samplePose(name, t) {
  const a = ANIMS[name] || ANIMS.idle, ks = a.k, n = ks.length;
  if (n === 1) return ks[0][1];
  if (a.loop) t = t % a.d; else if (t >= ks[n - 1][0]) return ks[n - 1][1];
  let i = 0; while (i < n - 1 && ks[i + 1][0] <= t) i++;
  const k0 = ks[i], k1 = i + 1 < n ? ks[i + 1] : ks[0], t1 = i + 1 < n ? k1[0] : a.d;
  const u = ease(clamp((t - k0[0]) / (t1 - k0[0]), 0, 1));
  for (let j = 0; j < 11; j++) _pose[j] = k0[1][j] + (k1[1][j] - k0[1][j]) * u;
  return _pose;
}

function drawRig(c, L, p, x, y, face, o) {
  o = o || {};
  const B = BUILDS[L.build || 'adult'], s = (L.scale || 1) * RIG_SCALE * (o.scale || 1);
  const K = o.sil || (o.flash ? '#ffffff' : o.ice || null), col = v => K || v;
  c.save(); c.translate(x, y);
  if (o.rot) { c.translate(0, -7 * s); c.rotate(o.rot * face); }
  c.scale(face * s, s); c.lineCap = 'round'; c.lineJoin = 'round';
  if (o.alpha != null) c.globalAlpha *= o.alpha;
  const lean = p[0] * D2R;
  const leg = (a, k) => { const A = a * D2R, Kk = (a - k) * D2R, kx = Math.sin(A) * B.l1, ky = Math.cos(A) * B.l1; return [kx, ky, kx + Math.sin(Kk) * B.l2, ky + Math.cos(Kk) * B.l2]; };
  const arm = (a, e) => { const A = a * D2R, E = (a + e) * D2R, ex = Math.sin(A) * B.U, ey = Math.cos(A) * B.U; return [ex, ey, ex + Math.sin(E) * B.F, ey + Math.cos(E) * B.F]; };
  const lf = leg(p[6], p[7]), lb = leg(p[8], p[9]);
  const hy = -(o.air ? B.l1 + B.l2 : Math.max(lf[3], lb[3], B.l1 * 0.6)) - 3 + p[10];
  const sx = Math.sin(lean) * B.T, sy = hy - Math.cos(lean) * B.T;
  const ax = sx * 0.9, ay = hy + (sy - hy) * 0.9;
  const af = arm(p[2], p[3]), ab = arm(p[4], p[5]);
  const limb = (x0, y0, q, w, cc, dark) => {
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + q[0], y0 + q[1]); c.lineTo(x0 + q[2], y0 + q[3]);
    c.strokeStyle = OUT; c.lineWidth = w + 3.4; c.stroke(); c.strokeStyle = cc; c.lineWidth = w; c.stroke();
    if (dark && !K) { c.strokeStyle = 'rgba(20,10,30,.22)'; c.stroke(); }
  };
  const blob = (bx, by, rx, ry, cc) => { c.beginPath(); c.ellipse(bx, by, rx, ry, 0, 0, TAU); c.fillStyle = cc; c.fill(); c.lineWidth = 1.7; c.strokeStyle = OUT; c.stroke(); };
  const sleeve = col(L.sleeve || L.shirt), skin = col(L.skin), pants = col(L.pants), shoe = col(L.shoe || '#2a2230');

  if (o.board) { c.beginPath(); c.moveTo(-20, 1); c.lineTo(20, 1); c.strokeStyle = OUT; c.lineWidth = 6.5; c.stroke(); c.strokeStyle = col('#ffcf40'); c.lineWidth = 3.5; c.stroke(); blob(-13, 5, 3, 3, col('#eee')); blob(13, 5, 3, 3, col('#eee')); }
  if (L.deco === 'cape') {
    const sway = Math.sin((o.t || 0) * 5) * 3;
    c.beginPath(); c.moveTo(sx - 4, sy - 2); c.lineTo(sx - B.tw * 1.1 + sway, hy + B.l1 * 1.3); c.lineTo(sx - B.tw * 0.2 + sway * 0.5, hy + B.l1); c.lineTo(sx + 5, sy + 6); c.closePath();
    c.fillStyle = col(L.decoC || '#5b1d3a'); c.fill(); c.lineWidth = 1.7; c.strokeStyle = OUT; c.stroke();
  }
  // 后臂、后腿
  limb(ax - 1.5, ay, ab, B.aw, sleeve, 1); blob(ax - 1.5 + ab[2], ay + ab[3], B.aw * 0.62, B.aw * 0.62, skin);
  limb(-1.5, hy, lb, B.lw, pants, 1); blob(-1.5 + lb[2] + 2, hy + lb[3] + 0.5, B.lw * 0.95, B.lw * 0.62, shoe);
  // 躯干
  if (L.boxy) c.lineCap = 'square';
  c.beginPath(); c.moveTo(0, hy); c.lineTo(sx, sy); c.strokeStyle = OUT; c.lineWidth = B.tw + 3.4; c.stroke();
  c.strokeStyle = col(L.shirt); c.lineWidth = B.tw; c.stroke();
  c.beginPath(); c.moveTo(0, hy); c.lineTo(sx * 0.16, hy + (sy - hy) * 0.16); c.strokeStyle = pants; c.stroke();
  c.lineCap = 'round';
  if (L.deco && !K) {
    c.save(); c.translate(0, hy); c.rotate(lean);
    const T = B.T, w = B.tw, dc = L.decoC || '#fff'; c.fillStyle = dc;
    if (L.deco === 'apron') { rrect(c, -w * 0.1, -T * 0.95, w * 0.6, T * 1.1, 3); c.fill(); }
    else if (L.deco === 'stripe') c.fillRect(-w / 2, -T * 0.7, w, 4);
    else if (L.deco === 'belt') c.fillRect(-w / 2, -T * 0.16, w, 3.6);
    else if (L.deco === 'vest') c.fillRect(-w / 2, -T * 1.05, w * 0.42, T * 0.95);
    else if (L.deco === 'bag') { rrect(c, -w * 0.5 - 8, -T * 0.95, 10, 16, 3); c.fill(); c.lineWidth = 1.7; c.strokeStyle = OUT; c.stroke(); }
    else if (L.deco === 'dots') { for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(-w * 0.3 + (i % 3) * w * 0.3, -T * (0.25 + (i % 2) * 0.4 + i * 0.05), 1.8, 0, TAU); c.fill(); } }
    else if (L.deco === 'gear') { c.beginPath(); c.arc(w * 0.1, -T * 0.55, 5, 0, TAU); c.fill(); c.fillStyle = '#263238'; c.beginPath(); c.arc(w * 0.1, -T * 0.55, 2, 0, TAU); c.fill(); }
    c.restore();
  }
  // 前腿
  limb(1.5, hy, lf, B.lw, pants); blob(1.5 + lf[2] + 2, hy + lf[3] + 0.5, B.lw * 0.95, B.lw * 0.62, shoe);
  // 头
  const nk = B.tw * 0.3 + B.R * 0.78, ha = lean + p[1] * D2R;
  drawHead(c, L, sx + Math.sin(ha) * nk, sy - Math.cos(ha) * nk, B.R, o, K);
  // 前臂 + 武器
  const hx = ax + 1.5 + af[2], hyy = ay + af[3];
  if (L.weapon) drawWeapon(c, L.weapon, hx, hyy, (p[2] + p[3]) * D2R, K, o);
  limb(ax + 1.5, ay, af, B.aw, sleeve); blob(hx, hyy, B.aw * 0.62, B.aw * 0.62, skin);
  if (L.shield && o.guard) {
    const bx = ax - 1.5 + ab[2] + 5, by = ay + ab[3];
    blob(bx, by, 9, 15, col(L.shield)); c.beginPath(); c.ellipse(bx, by, 4, 8, 0, 0, TAU); c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1.5; c.stroke();
    blob(bx + 3, by, 2.5, 2.5, col('#5c6670'));
  }
  c.restore();
}

function drawHead(c, L, cx, cy, R, o, K) {
  const col = v => K || v, t = o.t || 0, hc = col(L.hairC || '#2a2020');
  const fs = cc => { c.fillStyle = cc; c.fill(); c.lineWidth = 1.7; c.strokeStyle = OUT; c.stroke(); };
  const dot = (x, y, rx, ry, cc) => { c.beginPath(); c.ellipse(x, y, rx, ry || rx, 0, 0, TAU); c.fillStyle = cc; c.fill(); };
  const eyeC = col(L.eye || '#ffe066');
  switch (L.head) {
    case 'hood': {
      c.beginPath(); c.moveTo(cx - R * 0.5, cy - R * 0.9); c.lineTo(cx - R * 1.5, cy - R * 1.25); c.lineTo(cx - R * 0.95, cy - R * 0.2); c.closePath(); fs(col(L.hoodC));
      c.beginPath(); c.arc(cx, cy, R + 1.5, 0, TAU); fs(col(L.hoodC));
      if (!K) { dot(cx + R * 0.32, cy + R * 0.1, R * 0.62, R * 0.72, '#17121f'); dot(cx + R * 0.22, cy, 2.2, 3, eyeC); dot(cx + R * 0.66, cy, 2, 3, eyeC); }
      return;
    }
    case 'bucket': {
      c.beginPath(); c.arc(cx, cy - R * 1.0, R * 0.7, Math.PI, TAU); c.lineWidth = 2.2; c.strokeStyle = OUT; c.stroke();
      c.beginPath(); c.moveTo(cx - R * 0.9, cy - R * 1.1); c.lineTo(cx + R * 0.9, cy - R * 1.1); c.lineTo(cx + R * 1.2, cy + R * 0.9); c.lineTo(cx - R * 1.2, cy + R * 0.9); c.closePath(); fs(col('#9aa7b1'));
      if (!K) { c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(cx - R * 0.7, cy - R * 0.95, R * 0.3, R * 1.6); c.fillStyle = '#20262c'; c.fillRect(cx - R * 0.2, cy - R * 0.25, R * 1.3, R * 0.42); dot(cx + R * 0.2, cy - R * 0.04, 2.2, 2.2, '#ff5340'); dot(cx + R * 0.75, cy - R * 0.04, 2.2, 2.2, '#ff5340'); }
      return;
    }
    case 'speaker': {
      rrect(c, cx - R * 1.15, cy - R * 1.25, R * 2.3, R * 2.3, 4); fs(col('#3a2d52'));
      if (!K) { const pu = 1 + Math.sin(t * 18) * 0.06; dot(cx + R * 0.15, cy + R * 0.15, R * 0.8 * pu, R * 0.8 * pu, '#8c7fb0'); dot(cx + R * 0.15, cy + R * 0.15, R * 0.42 * pu, R * 0.42 * pu, '#1b1528'); dot(cx - R * 0.7, cy - R * 0.9, 2.2, 2.2, '#ff5340'); dot(cx + R * 0.8, cy - R * 0.9, 2.2, 2.2, '#ff5340'); }
      return;
    }
    case 'robot': {
      c.beginPath(); c.moveTo(cx, cy - R); c.lineTo(cx, cy - R * 1.7); c.lineWidth = 2; c.strokeStyle = OUT; c.stroke(); dot(cx, cy - R * 1.75, 3, 3, eyeC);
      rrect(c, cx - R, cy - R, R * 2, R * 1.8, 5); fs(col(L.skin));
      if (!K) { rrect(c, cx - R * 0.35, cy - R * 0.45, R * 1.25, R * 0.62, 3); c.fillStyle = '#1b2530'; c.fill(); dot(cx + R * 0.05, cy - R * 0.14, 2.4, 2.4, eyeC); dot(cx + R * 0.55, cy - R * 0.14, 2.4, 2.4, eyeC); }
      return;
    }
    case 'pop': {
      c.beginPath(); c.moveTo(cx, cy + R * 0.9); c.lineTo(cx, cy + R * 1.5); c.lineWidth = 6; c.strokeStyle = OUT; c.stroke(); c.lineWidth = 3; c.strokeStyle = col('#e2c08f'); c.stroke();
      rrect(c, cx - R * 0.95, cy - R * 1.6, R * 1.9, R * 2.6, R * 0.8); fs(col('#7fd4ff'));
      if (!K) { c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(cx - R * 0.6, cy - R * 1.2, R * 0.25, R * 1.5); dot(cx + R * 0.1, cy - R * 0.2, 2.2, 3, INK); dot(cx + R * 0.6, cy - R * 0.2, 2.2, 3, INK); c.beginPath(); c.moveTo(cx - R * 0.15, cy - R * 0.65); c.lineTo(cx + R * 0.3, cy - R * 0.45); c.moveTo(cx + R * 0.9, cy - R * 0.65); c.lineTo(cx + R * 0.45, cy - R * 0.45); c.lineWidth = 1.8; c.strokeStyle = INK; c.stroke(); }
      return;
    }
    case 'dark': {
      c.beginPath(); c.arc(cx, cy, R + 1, 0, TAU); fs(col('#1a1326'));
      c.beginPath(); c.moveTo(cx - R, cy - R * 0.6);
      for (let i = 0; i < 4; i++) { c.lineTo(cx - R + (i + 0.25) * R * 0.5, cy - R * (1.55 + Math.sin(t * 7 + i * 2) * 0.12)); c.lineTo(cx - R + (i + 0.5) * R * 0.5, cy - R * 0.95); }
      c.lineTo(cx + R, cy - R * 0.6); c.closePath(); fs(col('#6d5a2e'));
      if (!K) { dot(cx + R * 0.2, cy + R * 0.05, 2.6, 3.4, '#ff3b3b'); dot(cx + R * 0.68, cy + R * 0.05, 2.4, 3.4, '#ff3b3b'); }
      return;
    }
  }
  // 普通人头
  if (L.hair === 'bob') { rrect(c, cx - R * 1.04, cy - R * 0.5, R * 1.1, R * 1.5, 5); fs(hc); }
  if (L.hair === 'pony') { c.beginPath(); c.moveTo(cx - R * 0.8, cy - R * 0.4); c.quadraticCurveTo(cx - R * 1.9, cy - R * 0.2, cx - R * 1.6, cy + R * 0.9); c.lineWidth = R * 0.5 + 3; c.strokeStyle = OUT; c.stroke(); c.lineWidth = R * 0.5; c.strokeStyle = hc; c.stroke(); }
  if (L.hair === 'bun') { c.beginPath(); c.arc(cx - R * 0.85, cy - R * 0.65, R * 0.42, 0, TAU); fs(hc); }
  if (L.hair === 'twin') for (const q of [[-0.8, -0.85], [0.3, -1.05]]) { c.beginPath(); c.arc(cx + R * q[0], cy + R * q[1], R * 0.4, 0, TAU); fs(hc); }
  c.beginPath(); c.arc(cx, cy, R, 0, TAU); fs(col(L.skin));
  if (L.hair && L.hair !== 'bald') {
    c.beginPath(); c.arc(cx, cy, R + 0.4, Math.PI * 0.82, Math.PI * 1.78); c.closePath(); fs(hc);
    if (L.hair === 'spiky') {
      c.beginPath();
      for (let i = 0; i < 4; i++) { const a = Math.PI * (1.08 + i * 0.2); c.moveTo(cx + Math.cos(a - 0.16) * R, cy + Math.sin(a - 0.16) * R); c.lineTo(cx + Math.cos(a) * R * 1.45, cy + Math.sin(a) * R * 1.45); c.lineTo(cx + Math.cos(a + 0.16) * R, cy + Math.sin(a + 0.16) * R); }
      fs(hc);
    }
  }
  if (!K) {
    const ex = cx + R * 0.3, ey = cy + R * 0.08, e2 = ex + R * 0.42;
    if (o.expr === 'hurt') { c.lineWidth = 1.6; c.strokeStyle = INK; c.beginPath(); c.moveTo(ex - 2, ey - 2); c.lineTo(ex + 2, ey); c.lineTo(ex - 2, ey + 2); c.moveTo(e2 + 2, ey - 2); c.lineTo(e2 - 2, ey); c.lineTo(e2 + 2, ey + 2); c.stroke(); }
    else { dot(ex, ey, 1.5, 2.5, INK); dot(e2, ey, 1.5, 2.5, INK); }
    dot(cx + R * 0.1, cy + R * 0.42, R * 0.2, R * 0.2, 'rgba(255,110,110,.35)');
    if (L.acc !== 'beard' && L.acc !== 'moustache') { c.beginPath(); c.arc(cx + R * 0.52, cy + R * 0.4, R * 0.16, 0.1 * Math.PI, 0.9 * Math.PI); c.lineWidth = 1.4; c.strokeStyle = INK; c.stroke(); }
  }
  const hatC = col(L.hatC || '#d9534f');
  switch (L.hat) {
    case 'cap': c.beginPath(); c.arc(cx, cy - R * 0.2, R + 1.2, Math.PI, TAU); c.closePath(); fs(hatC); rrect(c, cx + R * 0.4, cy - R * 0.42, R * 1.2, R * 0.26, 2); fs(hatC); break;
    case 'chef': rrect(c, cx - R * 0.75, cy - R * 2.0, R * 1.5, R * 1.25, 5); fs(col('#fff')); for (const q of [-0.6, 0, 0.6]) { c.beginPath(); c.arc(cx + R * q, cy - R * 2.0, R * 0.5, 0, TAU); fs(col('#fff')); } rrect(c, cx - R * 0.85, cy - R * 1.0, R * 1.7, R * 0.35, 2); fs(col('#fff')); break;
    case 'helmet': c.beginPath(); c.arc(cx, cy - R * 0.1, R + 2.6, Math.PI * 0.95, Math.PI * 2.05); c.closePath(); fs(hatC); if (!K) { c.fillStyle = 'rgba(30,40,60,.75)'; rrect(c, cx + R * 0.1, cy - R * 0.55, R * 1.0, R * 0.36, 2); c.fill(); } break;
    case 'band': c.beginPath(); c.moveTo(cx - R * 0.95, cy - R * 0.5); c.lineTo(cx + R * 0.9, cy - R * 0.55); c.lineWidth = 4.6; c.strokeStyle = OUT; c.stroke(); c.lineWidth = 2.6; c.strokeStyle = hatC; c.stroke(); c.beginPath(); c.moveTo(cx - R * 0.95, cy - R * 0.5); c.lineTo(cx - R * 1.6, cy - R * 0.2 + Math.sin(t * 9) * 2); c.stroke(); break;
    case 'beanie': c.beginPath(); c.arc(cx, cy - R * 0.25, R + 1.4, Math.PI, TAU); c.closePath(); fs(hatC); c.beginPath(); c.arc(cx - R * 0.1, cy - R * 1.3, R * 0.3, 0, TAU); fs(col('#fff')); if (!K) { rrect(c, cx + R * 0.05, cy - R * 0.3, R * 1.0, R * 0.5, 3); c.fillStyle = '#263238'; c.fill(); c.strokeStyle = '#ffcf40'; c.lineWidth = 1.5; c.stroke(); } break;
    case 'tophat': rrect(c, cx - R * 0.72, cy - R * 2.3, R * 1.44, R * 1.6, 2); fs(hatC); rrect(c, cx - R * 1.25, cy - R * 0.9, R * 2.5, R * 0.3, 2); fs(hatC); if (!K) { c.fillStyle = '#c0392b'; c.fillRect(cx - R * 0.72, cy - R * 1.25, R * 1.44, R * 0.28); } break;
  }
  if (!K) {
    if (L.acc === 'glasses') { c.lineWidth = 1.4; c.strokeStyle = INK; c.beginPath(); c.arc(cx + R * 0.3, cy + R * 0.08, 3.6, 0, TAU); c.moveTo(cx + R * 0.72 + 3.6, cy + R * 0.08); c.arc(cx + R * 0.72, cy + R * 0.08, 3.6, 0, TAU); c.moveTo(cx + R * 0.3 - 3.6, cy + R * 0.08); c.lineTo(cx - R * 0.5, cy); c.stroke(); }
    if (L.acc === 'beard') { c.beginPath(); c.moveTo(cx + R * 0.05, cy + R * 0.45); c.quadraticCurveTo(cx + R * 0.5, cy + R * 1.9, cx + R * 0.95, cy + R * 0.35); c.closePath(); fs('#f2f2f2'); }
    if (L.acc === 'moustache') { c.beginPath(); c.moveTo(cx + R * 0.15, cy + R * 0.45); c.quadraticCurveTo(cx + R * 0.55, cy + R * 0.3, cx + R * 1.05, cy + R * 0.6); c.lineWidth = 3.4; c.strokeStyle = '#3a2a1a'; c.stroke(); }
  }
}

function drawWeapon(c, w, hx, hy, ang, K, o) {
  c.save(); c.translate(hx, hy); c.rotate(-(ang + (w.a == null ? 50 : w.a) * D2R));
  const col = v => K || v, fs = cc => { c.fillStyle = cc; c.fill(); c.lineWidth = 1.7; c.strokeStyle = OUT; c.stroke(); };
  switch (w.t) {
    case 'stick':
      c.beginPath(); c.moveTo(0, -4); c.lineTo(0, w.len); c.strokeStyle = OUT; c.lineWidth = w.w + 3; c.stroke(); c.strokeStyle = col(w.c); c.lineWidth = w.w; c.stroke();
      if (w.tip) { c.beginPath(); c.arc(0, w.len, w.tip.r, 0, TAU); fs(col(w.tip.c)); }
      if (w.flat) { rrect(c, -w.flat / 2, w.len - 2, w.flat, w.flat * 1.1, 2); fs(col(w.c)); }
      break;
    case 'yoyo': { const l = o.atk ? 34 : 13; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, l); c.lineWidth = 1.2; c.strokeStyle = '#fff'; c.stroke(); c.beginPath(); c.arc(0, l, 5.5, 0, TAU); fs(col(w.c)); c.beginPath(); c.arc(0, l, 2, 0, TAU); c.fillStyle = col('#fff'); c.fill(); break; }
    case 'fan': c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 22, Math.PI / 2 - 0.95, Math.PI / 2 + 0.95); c.closePath(); fs(col(w.c)); if (!K) { c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = 1; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.sin(i * 0.5) * 21, Math.cos(i * 0.5) * 21); c.stroke(); } } break;
    case 'book': rrect(c, -8, 1, 16, 19, 2); fs(col('#7b4b2a')); if (!K) { c.fillStyle = '#f5ecd6'; c.fillRect(-5, 3, 11, 15); } break;
    case 'cup': c.beginPath(); c.moveTo(-6, 0); c.lineTo(6, 0); c.lineTo(4.5, 16); c.lineTo(-4.5, 16); c.closePath(); fs(col('#fff3e0')); if (!K) { c.fillStyle = '#c98d5a'; c.fillRect(-4.6, 7, 9.2, 8); c.beginPath(); c.moveTo(1, 0); c.lineTo(4, -9); c.lineWidth = 2; c.strokeStyle = '#ff6b8b'; c.stroke(); } break;
    case 'box': rrect(c, -9, 2, 18, 16, 2); fs(col('#c89b6a')); if (!K) { c.fillStyle = '#8d6a44'; c.fillRect(-1.5, 2, 3, 16); } break;
    case 'sling': c.beginPath(); c.moveTo(0, -3); c.lineTo(0, 10); c.moveTo(0, 10); c.lineTo(-6, 19); c.moveTo(0, 10); c.lineTo(6, 19); c.strokeStyle = OUT; c.lineWidth = 5.4; c.stroke(); c.strokeStyle = col('#a8743d'); c.lineWidth = 2.6; c.stroke(); break;
    case 'card': rrect(c, -5, 2, 10, 14, 1.5); fs(col('#fff')); break;
  }
  c.restore();
}

// 头像：把头画进一个圆里
function drawPortrait(c, L, x, y, r, ring, sil) {
  c.save();
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = sil ? '#241b30' : '#fff4dc'; c.fill();
  c.save(); c.clip();
  const B = BUILDS[L.build || 'adult'], k = r / (B.R * 1.55);
  c.translate(x - r * 0.12, y + r * 0.22); c.scale(k, k); c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(0, B.R * 2.2); c.lineTo(0, B.R * 1.4); c.strokeStyle = sil || L.shirt; c.lineWidth = B.tw * 1.2; c.stroke();
  drawHead(c, L, 0, 0, B.R, {}, sil || null);
  c.restore();
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.lineWidth = 3; c.strokeStyle = ring || INK; c.stroke();
  c.restore();
}

// 角色在屏幕上的身高（像素），不含帽子
function rigHeight(L) { const B = BUILDS[L && L.build || 'adult']; return (B.l1 + B.l2 + 3 + B.T + B.tw * 0.3 + B.R * 1.78) * (L && L.scale || 1) * RIG_SCALE; }

function shadow(c, x, y, r) { c.beginPath(); c.ellipse(x, y + 2, r, r * 0.3, 0, 0, TAU); c.fillStyle = 'rgba(15,8,25,.33)'; c.fill(); }
