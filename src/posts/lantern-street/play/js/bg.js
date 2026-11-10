'use strict';
// 背景：每关按主题用固定随机种子生成一排布景，每帧只画看得见的部分

function glow(c, x, y, r, color, a) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalCompositeOperation = 'lighter'; c.globalAlpha = a == null ? 0.5 : a; c.fillStyle = g;
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
}
// 灯笼：已经夺回的路段是亮的，前面还黑着
function lantern(c, x, y, color, lit, k) {
  k = k || 1;
  c.strokeStyle = '#2a1c26'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y - 12 * k); c.lineTo(x, y - 18 * k); c.moveTo(x, y + 12 * k); c.lineTo(x, y + 20 * k); c.stroke();
  c.beginPath(); c.ellipse(x, y, 9 * k, 11.5 * k, 0, 0, TAU); c.fillStyle = lit ? color : '#3d3348'; c.fill(); c.strokeStyle = '#2a1c26'; c.stroke();
  c.fillStyle = lit ? '#ffd23f' : '#2a1c26'; c.fillRect(x - 5 * k, y - 13 * k, 10 * k, 3 * k); c.fillRect(x - 5 * k, y + 10 * k, 10 * k, 3 * k);
  if (lit) glow(c, x, y, 46 * k, color, 0.4);
}

const BGGEN = {
  street(bg, T, r, pk, width) {
    for (let x = -40; x < width + 100;) {
      const w = r(150, 250);
      bg.mid.push({ t: 'shop', x, w, h: r(196, 256), c: pk(T.walls), sign: pk([...T.signs]), sv: r(0, 1) > 0.5, door: r(0.15, 0.55), awn: r(0, 1) > 0.5 ? pk(['#e84a5f', '#f6f1e4', '#3fa66b', '#ffb347']) : null, lit: r(0, 1) > 0.3 });
      x += w;
    }
    for (let x = 40; x < width; x += r(250, 360)) bg.mid.push({ t: 'string', x, w: r(200, 290), y: r(64, 110), n: 5 });
  },
  market(bg, T, r, pk, width) {
    bg.mid.push({ t: 'wall', full: 1, h: 210 });
    for (let x = 10; x < width + 100;) {
      const w = r(170, 230);
      bg.mid.push({ t: 'stall', x, w, c: pk(T.awn), g: [0, 1, 2, 3, 4, 5].map(() => pk(['#ff8a65', '#ffd23f', '#8dff9a', '#ff8fb1', '#fff4e0', '#c98d5a'])) });
      x += w + r(24, 70);
    }
    for (let x = 0; x < width; x += r(240, 320)) bg.mid.push({ t: 'string', x, w: r(210, 300), y: r(50, 86), n: 6 });
  },
  park(bg, T, r, pk, width) {
    bg.river = 1;
    for (let x = -30; x < width + 100; x += r(110, 230)) {
      const h = r(150, 240), b = []; for (let i = 0; i < 5; i++) b.push([r(-40, 40), r(-10, 50), r(30, 52), Math.floor(r(0, 3))]);
      bg.mid.push({ t: 'tree', x, w: 120, h, b });
    }
    bg.mid.push({ t: 'rail', full: 1 });
    for (let x = 300; x < width; x += r(520, 760)) bg.mid.push({ t: 'ramp', x, w: 190 });
    for (let x = 140; x < width; x += r(330, 430)) bg.mid.push({ t: 'lamp', x, w: 20 });
  },
  yard(bg, T, r, pk, width) {
    bg.cranes = []; for (let x = 100; x < width * 0.4 + W; x += r(300, 480)) bg.cranes.push([x, r(150, 220)]);
    bg.mid.push({ t: 'fence', full: 1 });
    for (let x = 0; x < width + 100;) {
      const w = T.cont ? r(150, 200) : r(120, 240);
      if (T.cont) bg.mid.push({ t: 'cont', x, w, cs: [0, 1, 2].slice(0, Math.floor(r(1, 3.99))).map(() => pk(T.junk)) });
      else { const bits = []; for (let i = 0; i < 7; i++) bits.push([r(0.05, 0.75), r(0.1, 0.9), r(22, 50), r(16, 34), pk(T.junk), r(0, 1) > 0.7]); bg.mid.push({ t: 'pile', x, w, h: r(60, 140), bits }); }
      x += w + r(10, 90);
    }
    for (let x = 200; x < width; x += r(380, 520)) bg.mid.push({ t: 'lamp', x, w: 20 });
  },
  hall(bg, T, r, pk, width) {
    bg.mid.push({ t: 'hwall', full: 1 });
    for (let x = 40; x < width + 100; x += 330) { bg.mid.push({ t: 'curtain', x, w: 130 }); bg.mid.push({ t: 'poster', x: x + 180, w: 80, ch: pk([...'戏曲灯影梦']) }); }
    for (let x = 250; x < width; x += 660) bg.mid.push({ t: 'spot', x, w: 240, ph: r(0, 6) });
    for (let x = 100; x < width; x += r(300, 380)) bg.mid.push({ t: 'string', x, w: r(210, 280), y: r(46, 70), n: 5 });
  },
  roof(bg, T, r, pk, width) {
    bg.low = 1;
    for (let x = 100; x < width; x += r(380, 620)) bg.mid.push({ t: 'tank', x, w: 90, k: r(0, 1) > 0.5 });
    bg.mid.push({ t: 'clock', x: width - W / 2 - 130, w: 260 });
    bg.mid.push({ t: 'parapet', full: 1 });
    for (let x = 0; x < width; x += r(240, 330)) bg.mid.push({ t: 'string', x, w: r(210, 300), y: r(150, 190), n: 5 });
  },
};

function makeBg(name, seed, width) {
  const T = THEMES[name], R = seeded(seed * 977 + 31), r = (a, b) => a + R() * (b - a), pk = a => a[Math.floor(R() * a.length)];
  const bg = { T, far: [], mid: [], stars: [] };
  for (let x = -60; x < width * 0.25 + W + 120;) { const w = r(46, 120); bg.far.push({ x, w, h: r(40, 150), s: Math.floor(R() * 1000) }); x += w + r(-4, 16); }
  if (T.stars) for (let i = 0; i < 70; i++) bg.stars.push([R() * W, R() * 240, R() * 1.4 + 0.4, R() * 6]);
  BGGEN[T.kind](bg, T, r, pk, width);
  return bg;
}

const BGDRAW = {
  shop(c, o, sx, T, t, cam, lit) {
    const y0 = WALL_Y - o.h;
    c.fillStyle = o.c; c.fillRect(sx, y0, o.w + 1, o.h);
    c.fillStyle = 'rgba(0,0,0,.08)'; for (let y = y0 + 14; y < WALL_Y; y += 22) c.fillRect(sx, y, o.w, 2);
    c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(sx + o.w - 4, y0, 4, o.h);
    c.fillStyle = T.roof; c.beginPath(); c.moveTo(sx - 10, y0 + 6); c.lineTo(sx + o.w + 10, y0 + 6); c.lineTo(sx + o.w - 4, y0 - 22); c.lineTo(sx + 4, y0 - 22); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,.08)'; for (let x = sx + 6; x < sx + o.w - 4; x += 14) c.fillRect(x, y0 - 18, 3, 22);
    const wx = sx + o.w * 0.5 - 30, wy = y0 + 20, on = o.lit && lit;
    c.fillStyle = on ? '#ffe2a0' : '#30283f'; c.fillRect(wx, wy, 60, 44);
    c.strokeStyle = T.roof; c.lineWidth = 4; c.strokeRect(wx, wy, 60, 44);
    c.lineWidth = 2; c.beginPath(); c.moveTo(wx + 30, wy); c.lineTo(wx + 30, wy + 44); c.moveTo(wx, wy + 22); c.lineTo(wx + 60, wy + 22); c.stroke();
    if (on) glow(c, wx + 30, wy + 22, 60, '#ffb347', 0.22);
    const dx = sx + o.w * o.door, dh = 84;
    c.fillStyle = '#2a1c26'; c.fillRect(dx, WALL_Y - dh, 54, dh);
    c.fillStyle = on ? 'rgba(255,200,120,.4)' : 'rgba(0,0,0,.25)'; c.fillRect(dx + 5, WALL_Y - dh + 5, 44, dh - 5);
    if (o.awn) {
      c.fillStyle = o.awn; c.beginPath(); c.moveTo(sx + 8, WALL_Y - 112); c.lineTo(sx + o.w - 8, WALL_Y - 112); c.lineTo(sx + o.w + 4, WALL_Y - 88); c.lineTo(sx - 4, WALL_Y - 88); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,.3)'; for (let x = sx + 12; x < sx + o.w - 20; x += 30) c.fillRect(x, WALL_Y - 112, 13, 24);
      c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(sx - 4, WALL_Y - 88, o.w + 8, 3);
    }
    if (o.sv) { const bx = sx + o.w - 38, by = y0 + 30; c.fillStyle = '#5a1f2a'; c.fillRect(bx, by, 28, 58); c.strokeStyle = '#ffd23f'; c.lineWidth = 2; c.strokeRect(bx + 2, by + 2, 24, 54); txt(c, o.sign, bx + 14, by + 30, 20, lit ? '#ffd23f' : '#8a7550', 'center'); }
    else { const bx = dx - 8, by = WALL_Y - dh - (o.awn ? 62 : 36); c.fillStyle = '#3a2430'; c.fillRect(bx, by, 70, 28); txt(c, o.sign + '记', bx + 35, by + 15, 18, lit ? '#ffd23f' : '#8a7550', 'center'); }
  },
  wall(c, o, sx, T, t, cam) {
    c.fillStyle = T.walls[0]; c.fillRect(0, WALL_Y - o.h, W, o.h);
    c.fillStyle = T.walls[1]; for (let x = -(cam * 0.9 % 180); x < W; x += 180) { c.fillRect(x, WALL_Y - o.h - 30, 120, 30); c.fillRect(x + 20, WALL_Y - o.h + 30, 26, 34); c.fillRect(x + 70, WALL_Y - o.h + 30, 26, 34); }
    c.fillStyle = T.roof; c.fillRect(0, WALL_Y - o.h - 4, W, 8);
  },
  stall(c, o, sx, T, t, cam, lit) {
    const top = WALL_Y - 156, n = Math.round(o.w / 22), sw = o.w / n;
    c.fillStyle = '#3a2c26'; c.fillRect(sx + 6, top, 5, 156); c.fillRect(sx + o.w - 11, top, 5, 156);
    for (let i = 0; i < n; i++) { c.fillStyle = i % 2 ? o.c : '#f6f1e4'; c.fillRect(sx + i * sw, top, sw + 0.5, 30); c.beginPath(); c.arc(sx + (i + 0.5) * sw, top + 30, sw / 2, 0, Math.PI); c.fill(); }
    c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(sx, top - 4, o.w, 5);
    c.fillStyle = '#5a3d2c'; c.fillRect(sx, WALL_Y - 58, o.w, 58); c.fillStyle = '#8a6244'; c.fillRect(sx - 4, WALL_Y - 64, o.w + 8, 10);
    c.fillStyle = 'rgba(0,0,0,.15)'; for (let x = sx + 14; x < sx + o.w; x += 26) c.fillRect(x, WALL_Y - 54, 2, 54);
    for (let i = 0; i < o.g.length; i++) { const gx = sx + 18 + i * (o.w - 36) / 5; c.fillStyle = o.g[i]; c.beginPath(); c.arc(gx, WALL_Y - 71, 9, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,.3)'; c.beginPath(); c.arc(gx - 3, WALL_Y - 74, 3, 0, TAU); c.fill(); }
    for (let i = 0; i < 3; i++) { const bx = sx + 26 + i * (o.w - 52) / 2, by = top + 50; c.fillStyle = lit ? '#fff3c4' : '#4a4058'; c.beginPath(); c.arc(bx, by, 4, 0, TAU); c.fill(); if (lit) glow(c, bx, by, 34, '#ffcf70', 0.35); }
  },
  tree(c, o, sx, T) {
    c.fillStyle = '#3d2c24'; c.fillRect(sx + o.w / 2 - 7, WALL_Y - o.h * 0.55, 14, o.h * 0.55);
    for (const b of o.b) { c.fillStyle = T.tree[b[3]]; c.beginPath(); c.arc(sx + o.w / 2 + b[0], WALL_Y - o.h + b[1], b[2], 0, TAU); c.fill(); }
  },
  rail(c, o, sx, T, t, cam) {
    c.fillStyle = '#d8d2c4'; c.fillRect(0, WALL_Y - 44, W, 5); c.fillRect(0, WALL_Y - 24, W, 4);
    for (let x = -(cam % 56); x < W; x += 56) c.fillRect(x, WALL_Y - 48, 6, 48);
  },
  ramp(c, o, sx) {
    c.fillStyle = '#8f8a99'; c.beginPath(); c.moveTo(sx, WALL_Y); c.lineTo(sx + o.w, WALL_Y); c.lineTo(sx + o.w, WALL_Y - 80); c.quadraticCurveTo(sx + o.w * 0.5, WALL_Y - 74, sx, WALL_Y); c.fill();
    c.fillStyle = '#6d6878'; c.fillRect(sx + o.w - 8, WALL_Y - 86, 8, 86); c.fillStyle = '#ffcf40'; c.fillRect(sx + o.w - 16, WALL_Y - 88, 24, 4);
  },
  lamp(c, o, sx, T, t, cam, lit) {
    c.fillStyle = '#2a2433'; c.fillRect(sx + 7, WALL_Y - 190, 6, 190); c.fillRect(sx + 7, WALL_Y - 190, 34, 5);
    lantern(c, sx + 38, WALL_Y - 164, T.lantern || '#ffd76a', lit, 1.1);
  },
  fence(c, o, sx, T, t, cam) {
    c.fillStyle = T.fence; c.fillRect(0, WALL_Y - 118, W, 118);
    c.fillStyle = 'rgba(0,0,0,.2)'; for (let x = -(cam % 26); x < W; x += 26) c.fillRect(x, WALL_Y - 118, 3, 118);
    c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(0, WALL_Y - 118, W, 5); c.fillRect(0, WALL_Y - 60, W, 4);
  },
  pile(c, o, sx) {
    c.fillStyle = '#4a4038'; c.beginPath(); c.moveTo(sx, WALL_Y); c.quadraticCurveTo(sx + o.w * 0.5, WALL_Y - o.h * 2.1, sx + o.w, WALL_Y); c.fill();
    for (const b of o.bits) {
      const bx = sx + b[0] * o.w, by = WALL_Y - b[1] * o.h - b[3];
      c.fillStyle = b[4];
      if (b[5]) { c.beginPath(); c.arc(bx + 14, by + 14, 15, 0, TAU); c.fillStyle = '#2a2a30'; c.fill(); c.beginPath(); c.arc(bx + 14, by + 14, 7, 0, TAU); c.fillStyle = '#6d7a86'; c.fill(); }
      else { c.fillRect(bx, by, b[2], b[3]); c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(bx, by + b[3] - 5, b[2], 5); c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(bx, by, b[2], 3); }
    }
  },
  cont(c, o, sx, T) {
    o.cs.forEach((cc, i) => {
      const y = WALL_Y - (i + 1) * 64, x = sx + (i % 2) * 12;
      c.fillStyle = cc; c.fillRect(x, y, o.w, 62);
      c.fillStyle = 'rgba(0,0,0,.16)'; for (let k = x + 8; k < x + o.w - 4; k += 12) c.fillRect(k, y + 5, 4, 52);
      c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x, y + 58, o.w, 4);
      c.fillStyle = '#eaf6ff'; c.fillRect(x, y, o.w, 4);
      for (let k = x + 10; k < x + o.w; k += 34) { c.beginPath(); c.moveTo(k, y + 4); c.lineTo(k + 4, y + 16 + (k % 3) * 4); c.lineTo(k + 8, y + 4); c.fill(); }
    });
  },
  hwall(c, o, sx, T, t, cam) {
    c.fillStyle = T.wall; c.fillRect(0, 0, W, WALL_Y);
    c.fillStyle = 'rgba(0,0,0,.14)'; for (let x = -(cam % 70); x < W; x += 70) { c.beginPath(); c.moveTo(x, 120); c.lineTo(x + 16, 150); c.lineTo(x, 180); c.lineTo(x - 16, 150); c.fill(); }
    c.fillStyle = '#3a1522'; c.fillRect(0, WALL_Y - 74, W, 74); c.fillStyle = '#c9a25a'; c.fillRect(0, WALL_Y - 78, W, 5);
    c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(0, 0, W, 34);
  },
  curtain(c, o, sx, T) {
    for (let i = 0; i < 6; i++) { c.fillStyle = T.curtain[i % 2]; c.fillRect(sx + i * o.w / 6, 20, o.w / 6 + 1, WALL_Y - 26); }
    c.fillStyle = '#c9a25a'; c.fillRect(sx - 6, 20, o.w + 12, 12); for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(sx + (i + 0.5) * o.w / 5, 32, o.w / 10, 0, Math.PI); c.fill(); }
    c.fillStyle = '#c9a25a'; c.fillRect(sx + o.w * 0.4, 190, o.w * 0.2, 8);
  },
  poster(c, o, sx, T, t, cam, lit) {
    c.fillStyle = '#c9a25a'; c.fillRect(sx, 110, o.w, 110); c.fillStyle = '#f3e3c2'; c.fillRect(sx + 6, 116, o.w - 12, 98);
    txt(c, o.ch, sx + o.w / 2, 166, 46, '#a3243b', 'center');
  },
  spot(c, o, sx, T, t) {
    const sw = Math.sin(t * 0.8 + o.ph) * 60, cx = sx + o.w / 2;
    c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,230,170,.1)';
    c.beginPath(); c.moveTo(cx - 8, 30); c.lineTo(cx + 8, 30); c.lineTo(cx + 90 + sw, H); c.lineTo(cx - 90 + sw, H); c.fill();
    c.globalCompositeOperation = 'source-over'; c.fillStyle = '#17121f'; c.fillRect(cx - 12, 22, 24, 14);
  },
  tank(c, o, sx) {
    c.fillStyle = '#211e3a';
    if (o.k) { c.fillRect(sx + 10, WALL_Y - 150, 70, 80); c.beginPath(); c.moveTo(sx + 4, WALL_Y - 150); c.lineTo(sx + 45, WALL_Y - 176); c.lineTo(sx + 86, WALL_Y - 150); c.fill(); c.fillRect(sx + 16, WALL_Y - 70, 6, 40); c.fillRect(sx + 68, WALL_Y - 70, 6, 40); }
    else { c.fillRect(sx + 40, WALL_Y - 200, 4, 170); c.fillRect(sx + 20, WALL_Y - 180, 44, 3); c.fillRect(sx + 28, WALL_Y - 160, 28, 3); }
  },
  clock(c, o, sx, T, t) {
    const cx = sx + o.w / 2, cy = 158, R = 118;
    c.fillStyle = '#211e3a'; c.fillRect(cx - 150, cy - 150, 300, WALL_Y - cy + 150); c.beginPath(); c.moveTo(cx - 166, cy - 150); c.lineTo(cx, cy - 250); c.lineTo(cx + 166, cy - 150); c.fill();
    c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fillStyle = '#f3e7c4'; c.fill(); c.lineWidth = 10; c.strokeStyle = '#6d5a2e'; c.stroke();
    glow(c, cx, cy, R * 1.7, '#ffd58a', 0.25);
    c.fillStyle = '#3a2f20'; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; c.beginPath(); c.arc(cx + Math.cos(a) * R * 0.82, cy + Math.sin(a) * R * 0.82, i % 3 ? 4 : 7, 0, TAU); c.fill(); }
    c.strokeStyle = '#3a2f20'; c.lineCap = 'round';
    const hm = t * 0.05, hh = -1.0; c.lineWidth = 7; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(hh) * R * 0.5, cy + Math.sin(hh) * R * 0.5); c.stroke();
    c.lineWidth = 5; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(hm - 1.4) * R * 0.74, cy + Math.sin(hm - 1.4) * R * 0.74); c.stroke();
    c.beginPath(); c.arc(cx, cy, 8, 0, TAU); c.fillStyle = '#6d5a2e'; c.fill();
  },
  parapet(c, o, sx, T, t, cam) {
    c.fillStyle = '#35314f'; c.fillRect(0, WALL_Y - 46, W, 46); c.fillStyle = '#4b4763'; c.fillRect(0, WALL_Y - 52, W, 9);
    c.fillStyle = 'rgba(0,0,0,.2)'; for (let x = -(cam % 90); x < W; x += 90) c.fillRect(x, WALL_Y - 43, 3, 43);
  },
  string(c, o, sx, T, t, cam, lit, bg) {
    const y = o.y, sag = 30;
    c.strokeStyle = '#2a1c26'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(sx, y); c.quadraticCurveTo(sx + o.w / 2, y + sag * 2, sx + o.w, y); c.stroke();
    for (let i = 1; i < o.n; i++) {
      const u = i / o.n, lx = sx + o.w * u, ly = y + sag * 2 * 2 * u * (1 - u) + 16 + Math.sin(t * 2 + i + o.x) * 1.5;
      lantern(c, lx, ly, T.lantern || '#ff5a3c', o.x + o.w * u < bg.litX);
    }
  },
};

function drawBg(c, bg, cam, t) {
  const T = bg.T, lit0 = bg.litX == null ? 1e9 : bg.litX;
  bg.litX = lit0;
  const g = c.createLinearGradient(0, 0, 0, WALL_Y); g.addColorStop(0, T.sky[0]); g.addColorStop(1, T.sky[1]);
  c.fillStyle = g; c.fillRect(0, 0, W, WALL_Y + 2);
  for (const s of bg.stars) { c.fillStyle = `rgba(255,255,255,${0.4 + 0.4 * Math.sin(t * 1.5 + s[3])})`; c.fillRect(s[0], s[1], s[2], s[2]); }
  if (T.orb) { const o = T.orb; glow(c, W * o[1], WALL_Y * o[2], o[3] * 3, o[0], 0.3); c.fillStyle = o[0]; c.beginPath(); c.arc(W * o[1], WALL_Y * o[2], o[3], 0, TAU); c.fill(); }
  const fy = bg.low ? WALL_Y - 30 : WALL_Y - 60;
  c.fillStyle = T.far;
  for (const b of bg.far) { const sx = b.x - cam * 0.25; if (sx + b.w < 0 || sx > W) continue; c.fillRect(sx, fy - b.h, b.w + 1, b.h + 70); }
  for (const b of bg.far) {
    const sx = b.x - cam * 0.25; if (sx + b.w < 0 || sx > W) continue;
    c.fillStyle = T.farWin;
    for (let i = 0; i < 6; i++) { const k = (b.s * (i + 3) * 7919) % 97; if (k % 3) continue; c.globalAlpha = 0.35 + (k % 5) * 0.1; c.fillRect(sx + 8 + (k % 4) * (b.w - 20) / 4, fy - b.h + 10 + (i * 19) % Math.max(20, b.h - 10), 6, 8); }
  }
  c.globalAlpha = 1;
  if (bg.cranes) { c.fillStyle = T.far; for (const cr of bg.cranes) { const sx = cr[0] - cam * 0.4; if (sx < -200 || sx > W + 60) continue; c.fillRect(sx, WALL_Y - cr[1], 9, cr[1]); c.fillRect(sx - 40, WALL_Y - cr[1], 170, 7); c.fillRect(sx + 110, WALL_Y - cr[1], 2, 60); c.fillRect(sx + 102, WALL_Y - cr[1] + 60, 18, 12); } }
  if (bg.river) { const rg = c.createLinearGradient(0, WALL_Y - 70, 0, WALL_Y); rg.addColorStop(0, '#6f8fc9'); rg.addColorStop(1, '#3d5a96'); c.fillStyle = rg; c.fillRect(0, WALL_Y - 70, W, 70); c.fillStyle = 'rgba(255,255,255,.25)'; for (let i = 0; i < 14; i++) { const x = ((i * 137 + t * 14 - cam * 0.5) % (W + 60) + W + 60) % (W + 60) - 30; c.fillRect(x, WALL_Y - 62 + (i * 23) % 56, 26, 2); } }
  const hz = c.createLinearGradient(0, WALL_Y - 120, 0, WALL_Y); hz.addColorStop(0, 'rgba(0,0,0,0)'); hz.addColorStop(1, 'rgba(0,0,0,.18)'); c.fillStyle = hz; c.fillRect(0, WALL_Y - 120, W, 120);
  for (const o of bg.mid) {
    const sx = o.full ? 0 : o.x - cam;
    if (!o.full && (sx + o.w < -50 || sx > W + 50)) continue;
    BGDRAW[o.t](c, o, sx, T, t, cam, o.full || o.x + o.w / 2 < bg.litX, bg);
  }
  // 地面
  const gg = c.createLinearGradient(0, WALL_Y, 0, H); gg.addColorStop(0, T.ground[0]); gg.addColorStop(1, T.ground[1]);
  c.fillStyle = gg; c.fillRect(0, WALL_Y, W, H - WALL_Y);
  c.strokeStyle = T.gline; c.lineWidth = 2; c.globalAlpha = 0.45; c.beginPath();
  if (T.plank) { for (let i = 0; i < 7; i++) { const y = WALL_Y + 8 + i * i * 4 + i * 8; c.moveTo(0, y); c.lineTo(W, y); } }
  else {
    for (let i = 0; i < 4; i++) { const y = WALL_Y + 20 + i * i * 12 + i * 22; c.moveTo(0, y); c.lineTo(W, y); }
    for (let x = -(cam % 110) - 110; x < W + 220; x += 110) { c.moveTo(x + 40, WALL_Y); c.lineTo(x - 60, H); }
  }
  c.stroke(); c.globalAlpha = 1;
  const sh = c.createLinearGradient(0, WALL_Y, 0, WALL_Y + 26); sh.addColorStop(0, 'rgba(10,5,20,.4)'); sh.addColorStop(1, 'rgba(10,5,20,0)'); c.fillStyle = sh; c.fillRect(0, WALL_Y, W, 26);
}

// 前景氛围：飘的东西 + 色调 + 暗角
function drawAmb(c, bg, cam, t) {
  const T = bg.T, wrap = (v, m) => ((v % m) + m) % m;
  for (let i = 0; i < 26; i++) {
    const s = i * 37.7; let x, y, r = 2, col;
    switch (T.amb) {
      case 'ember': x = wrap(s * 53 + t * (20 + i % 5 * 6) - cam * 0.3, W); y = H - wrap(s * 29 + t * (30 + i % 7 * 8), H); col = `rgba(255,${150 + i % 3 * 30},80,${0.25 + (i % 4) * 0.1})`; break;
      case 'snow': x = wrap(s * 53 + Math.sin(t + i) * 20 - cam * 0.3, W); y = wrap(s * 29 + t * (40 + i % 5 * 10), H); col = 'rgba(255,255,255,.7)'; r = 1.5 + i % 3; break;
      case 'firefly': x = wrap(s * 53 + Math.sin(t * 0.7 + i) * 40 - cam * 0.3, W); y = 200 + wrap(s * 29, 300) + Math.cos(t * 0.9 + i * 2) * 20; col = `rgba(255,240,150,${0.3 + 0.3 * Math.sin(t * 3 + i)})`; break;
      case 'leaf': x = wrap(s * 53 + t * 40 - cam * 0.3, W); y = wrap(s * 29 + t * 30 + Math.sin(t * 2 + i) * 20, H); col = 'rgba(255,170,190,.6)'; r = 3; break;
      case 'steam': x = wrap(s * 53 - cam * 0.3, W); y = H - 100 - wrap(s * 29 + t * 25, 300); col = 'rgba(255,255,255,.07)'; r = 14 + i % 4 * 5; break;
      case 'dust': x = wrap(s * 53 + Math.sin(t * 0.3 + i) * 30, W); y = wrap(s * 29 + t * 6, H); col = 'rgba(255,230,180,.25)'; r = 1.6; break;
      default: return;
    }
    c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
}
function drawTint(c, bg) {
  if (bg.T.tint) { c.fillStyle = bg.T.tint; c.fillRect(0, 0, W, H); }
  const v = c.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05); v.addColorStop(0, 'rgba(10,5,25,0)'); v.addColorStop(1, 'rgba(10,5,25,.5)');
  c.fillStyle = v; c.fillRect(0, 0, W, H);
}
