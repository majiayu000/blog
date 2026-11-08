// 全屏粒子层：金币、火花、飘字。pointer-events 关闭，不影响点击。
(function () {
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:50';
  const g = cv.getContext('2d');
  const P = []; let running = false, W = 0, H = 0, dpr = 1;
  function size() { dpr = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; }
  function loop() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.t += 1 / 60; if (p.t >= p.life) { P.splice(i, 1); continue; }
      p.vy += p.grav / 60; p.x += p.vx / 60; p.y += p.vy / 60;
      const a = 1 - p.t / p.life;
      g.globalAlpha = Math.min(1, a * 1.6);
      if (p.text) { g.font = `900 ${p.size}px "PingFang SC",sans-serif`; g.textAlign = 'center'; g.lineWidth = 5; g.strokeStyle = '#1b0f0a'; g.strokeText(p.text, p.x, p.y); g.fillStyle = p.color; g.fillText(p.text, p.x, p.y); }
      else if (p.coin) { const w = Math.abs(Math.cos(p.t * 9 + p.seed)) * p.size; g.fillStyle = p.color; g.beginPath(); g.ellipse(p.x, p.y, Math.max(1, w), p.size, 0, 0, 7); g.fill(); g.strokeStyle = '#8a5a12'; g.lineWidth = 1.5; g.stroke(); }
      else { g.fillStyle = p.color; g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    }
    g.globalAlpha = 1;
    if (P.length) requestAnimationFrame(loop); else { running = false; g.clearRect(0, 0, W, H); }
  }
  function go() { if (!cv.parentNode) { document.body.appendChild(cv); size(); addEventListener('resize', size); } if (!running) { running = true; requestAnimationFrame(loop); } }
  const add = o => { if (P.length < 700) P.push(Object.assign({ t: 0, grav: 0, size: 5, life: 1, seed: Math.random() * 6 }, o)); };
  window.FX = {
    burst(x, y, n = 20, colors = ['#ffd24a', '#ff7a3c', '#fff3c4'], speed = 320) { go(); for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = speed * (0.3 + Math.random()); add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, grav: 620, life: 0.5 + Math.random() * 0.6, size: 3 + Math.random() * 5, color: colors[i % colors.length] }); } },
    coins(x, y, n = 18) { go(); for (let i = 0; i < n; i++) add({ x, y, vx: (Math.random() - 0.5) * 520, vy: -220 - Math.random() * 480, grav: 1050, life: 1 + Math.random() * 0.7, size: 7 + Math.random() * 3, coin: true, color: '#ffc93c' }); },
    rain(n = 120) { go(); for (let i = 0; i < n; i++) add({ x: Math.random() * W, y: -30 - Math.random() * H * 0.9, vx: (Math.random() - 0.5) * 80, vy: 150 + Math.random() * 280, grav: 200, life: 3.4, size: 7 + Math.random() * 4, coin: true, color: '#ffc93c' }); },
    text(x, y, text, color = '#ffe07a', size = 30) { go(); add({ x, y, vx: 0, vy: -85, life: 1.15, text, color, size }); },
    rect(el) { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; },
  };
})();
