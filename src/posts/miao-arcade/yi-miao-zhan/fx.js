// 视觉特效层：泛光、色散、镜头冲击、彩虹拖尾、地面刀痕、狂热极光、通关烟花。
const FX = (() => {
  let t = 0, zoom = 0, fx = 480, fy = 300, ab = 0, flash = 0, flashColor = '#fff', fwT = 0;
  let scars = [], trail = [], sparks = [], shocks = [], rockets = [];
  const bloom = document.createElement('canvas'), tint = document.createElement('canvas');
  bloom.width = 480; bloom.height = 300;
  const bx = bloom.getContext('2d'), tx = tint.getContext('2d');
  const hasFilter = 'filter' in bx;

  function reset() { zoom = ab = flash = 0; scars = []; trail = []; sparks = []; shocks = []; rockets = []; }

  function kick(x, y, power, color = '#fff') {
    zoom = Math.max(zoom, 0.022 * power); fx += (x - fx) * 0.5; fy += (y - fy) * 0.5;
    ab = Math.max(ab, 2.2 * power);
    shocks.push({ x, y, r: 12, v: 420 + 160 * power, life: 0.26, max: 0.26, color, w: 3 + power * 2 });
    const n = Math.round(8 + power * 8);
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.283 + power, v = 180 + 240 * power * (0.5 + 0.5 * Math.sin(i * 12.9));
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.42, max: 0.42, size: 5 + power * 2, color });
    }
    if (sparks.length > 360) sparks.splice(0, sparks.length - 360);
  }
  function huge(x, y, color = '#ffd24a') {
    kick(x, y, 5, color);
    zoom = 0.16; ab = 16; flash = 1; flashColor = color; fx = x; fy = y;
    for (let i = 0; i < 4; i++) shocks.push({ x, y, r: 20 + i * 30, v: 620 + i * 240, life: 0.9, max: 0.9, color: i % 2 ? '#fff' : color, w: 10 });
  }
  const scar = (x, y, a, len) => scars.push({ x, y, a, len, life: 3, max: 3 });
  const addTrail = (x, y, fever) => { trail.push({ x, y, life: 0.42, fever, hue: t * 620 % 360 }); if (trail.length > 150) trail.shift(); };

  function launch() {
    rockets.push({ x: 90 + Math.random() * 780, y: H, vy: -560 - Math.random() * 200, fuse: 0.55 + Math.random() * 0.45, hue: Math.random() * 360 });
  }
  function update(rdt, winning) {
    t += rdt; zoom *= Math.exp(-7 * rdt); ab *= Math.exp(-8 * rdt); flash = Math.max(0, flash - rdt * 1.8);
    for (const s of sparks) { s.x += s.vx * rdt; s.y += s.vy * rdt; s.vx *= Math.exp(-3 * rdt); s.vy *= Math.exp(-3 * rdt); s.life -= rdt; }
    sparks = sparks.filter(s => s.life > 0);
    for (const s of shocks) { s.r += s.v * rdt; s.life -= rdt; }
    shocks = shocks.filter(s => s.life > 0);
    for (const s of scars) s.life -= rdt;
    scars = scars.filter(s => s.life > 0);
    for (const s of trail) s.life -= rdt;
    trail = trail.filter(s => s.life > 0);
    if (winning) {
      fwT -= rdt;
      if (fwT <= 0) { fwT = 0.2; launch(); }
    }
    for (const r of rockets) {
      r.y += r.vy * rdt; r.fuse -= rdt;
      if (r.fuse <= 0) {
        const color = `hsl(${r.hue},100%,68%)`;
        for (let i = 0; i < 46; i++) {
          const a = i / 46 * 6.283, v = 110 + 240 * (i % 3 + 1) / 3;
          sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.95, max: 0.95, size: 6, color });
        }
        shocks.push({ x: r.x, y: r.y, r: 8, v: 520, life: 0.36, max: 0.36, color, w: 5 });
        zoom = Math.max(zoom, 0.012); Sound.pop(r.hue);
      }
    }
    rockets = rockets.filter(r => r.fuse > 0);
  }

  // 铺在角色下面：地面刀痕和狂热极光。
  function under(fever) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (fever) {
      for (let i = 0; i < 4; i++) {
        const y = 70 + i * 150 + Math.sin(t * 1.5 + i) * 60, hue = (t * 80 + i * 75) % 360;
        const g = ctx.createLinearGradient(0, y - 130, 0, y + 130);
        g.addColorStop(0, `hsla(${hue},100%,55%,0)`); g.addColorStop(0.5, `hsla(${hue},100%,55%,.16)`); g.addColorStop(1, `hsla(${hue},100%,55%,0)`);
        ctx.fillStyle = g; ctx.fillRect(0, y - 130, W, 260);
      }
    }
    for (const s of scars) {
      const k = s.life / s.max;
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a);
      ctx.fillStyle = `rgba(150,240,255,${k * 0.5})`; ctx.fillRect(-s.len * 0.7, -1.5, s.len * 1.4, 3);
      ctx.restore();
    }
    ctx.restore();
  }

  // 盖在角色上面：拖尾、冲击波、火花、速度线。
  function over(fever) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i];
      if (Math.hypot(a.x - b.x, a.y - b.y) > 90) continue;
      const k = b.life / 0.42;
      ctx.strokeStyle = b.fever ? `hsla(${b.hue},100%,62%,${k})` : `rgba(130,235,255,${k * 0.85})`;
      ctx.lineWidth = (b.fever ? 30 : 17) * k;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (const s of shocks) {
      ctx.globalAlpha = s.life / s.max; ctx.strokeStyle = s.color; ctx.lineWidth = s.w;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.stroke();
    }
    for (const r of rockets) { ctx.globalAlpha = 1; ctx.fillStyle = `hsl(${r.hue},100%,75%)`; ctx.fillRect(r.x - 2, r.y, 4, 16); }
    for (const s of sparks) {
      const k = s.life / s.max, size = s.size * k;
      ctx.globalAlpha = k; ctx.fillStyle = s.color; ctx.fillRect(s.x - size / 2, s.y - size / 2, size, size);
      ctx.globalAlpha = k * 0.22; ctx.beginPath(); ctx.arc(s.x, s.y, size * 2.4, 0, 6.283); ctx.fill();
    }
    if (fever) {
      ctx.lineWidth = 2;
      for (let i = 0; i < 26; i++) {
        const a = i * 2.399 + Math.floor(t * 24) * 0.37, r0 = 330 + (i * 37) % 170, r1 = r0 + 90 + (i * 53) % 150;
        ctx.globalAlpha = 0.14; ctx.strokeStyle = `hsl(${(t * 300 + i * 20) % 360},100%,72%)`;
        ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(a) * r0, H / 2 + Math.sin(a) * r0); ctx.lineTo(W / 2 + Math.cos(a) * r1, H / 2 + Math.sin(a) * r1); ctx.stroke();
      }
    }
    ctx.restore();
    if (flash > 0) { ctx.save(); ctx.globalAlpha = Math.min(0.85, flash); ctx.fillStyle = flashColor; ctx.fillRect(-60, -60, W + 120, H + 120); ctx.restore(); }
  }

  // 整屏后处理：泛光和色散。不支持 ctx.filter 的浏览器（如旧版 Safari）只是没有泛光。
  function post(bw, bh, fever) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (hasFilter) {
      bx.globalCompositeOperation = 'source-over';
      bx.filter = 'brightness(1.1) contrast(2.4) saturate(1.5) blur(5px)';
      bx.drawImage(canvas, 0, 0, bloom.width, bloom.height);
      bx.filter = 'none';
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fever ? 0.62 : 0.42;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(bloom, 0, 0, bw, bh);
    }
    if (ab > 0.4) {
      if (tint.width !== bw || tint.height !== bh) { tint.width = bw; tint.height = bh; }
      const d = ab * (bw / 960);
      tx.globalCompositeOperation = 'source-over'; tx.drawImage(canvas, 0, 0);
      tx.globalCompositeOperation = 'multiply'; tx.fillStyle = '#ff2030'; tx.fillRect(0, 0, bw, bh);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.55, ab * 0.06);
      ctx.drawImage(tint, -d, 0);
      tx.globalCompositeOperation = 'source-over'; tx.drawImage(canvas, 0, 0);
      tx.globalCompositeOperation = 'multiply'; tx.fillStyle = '#1050ff'; tx.fillRect(0, 0, bw, bh);
      ctx.drawImage(tint, d, 0);
    }
    ctx.restore();
  }

  return { reset, kick, huge, scar, trail: addTrail, update, under, over, post, get zoom() { return zoom; }, get fx() { return fx; }, get fy() { return fy; } };
})();
