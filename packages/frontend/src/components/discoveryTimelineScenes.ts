/**
 * Discovery Timeline Engine — 15 odrębnych scen Canvas 2D, po jednej na
 * epokę (data/timeline.ts). Każda scena to funkcja czysta: (ctx,w,h,t) →
 * rysunek, gdzie `t` to ciągły zegar animacji (sekundy), NIE pozycja na osi
 * czasu — sceny żyją własnym echem niezależnie od tego, gdzie stoi suwak.
 * DiscoveryTimeline.tsx renderuje DWIE sąsiednie sceny nałożone z
 * przenikaniem (core/timelineMath.ts::epochBlend) — stąd "bez ekranów
 * ładowania": w każdej klatce ekran jest ciągłym mixem dwóch already-znanych
 * rysunków, nigdy pustym stanem pośrednim.
 */

type SceneFn = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function bigBang(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const cx = w / 2;
  const cy = h / 2;
  const pulse = 0.7 + 0.3 * Math.sin(t * 3);
  const R = Math.min(w, h) * 0.42 * pulse;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.25, '#fff6d8');
  grad.addColorStop(0.55, 'rgba(240,179,92,0.7)');
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  const rnd = seededRandom(7);
  for (let i = 0; i < 120; i++) {
    const a = rnd() * Math.PI * 2;
    const speed = 0.3 + rnd() * 0.7;
    const dist = ((t * speed * 60) % (Math.min(w, h) * 0.6)) + 4;
    const x = cx + Math.cos(a) * dist;
    const y = cy + Math.sin(a) * dist;
    const alpha = Math.max(0, 1 - dist / (Math.min(w, h) * 0.6));
    ctx.fillStyle = `rgba(255,240,200,${alpha * 0.8})`;
    ctx.fillRect(x, y, 2, 2);
  }
}

function inflation(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const cx = w / 2;
  const cy = h / 2;
  const N = 14;
  for (let gy = -N; gy <= N; gy++) {
    for (let gx = -N; gx <= N; gx++) {
      const jitter = 1 + Math.sin(t * 0.5 + gx * 0.3 + gy * 0.3) * 0.08;
      const expand = 1 + ((t * 0.06) % 3);
      const x = cx + gx * (Math.min(w, h) / (2 * N)) * expand * jitter;
      const y = cy + gy * (Math.min(w, h) / (2 * N)) * expand * jitter;
      if (x < -10 || x > w + 10 || y < -10 || y > h + 10) continue;
      const d = Math.hypot(gx, gy) / N;
      ctx.fillStyle = `rgba(232,121,249,${Math.max(0, 0.6 - d * 0.5)})`;
      ctx.fillRect(x, y, 1.6, 1.6);
    }
  }
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.5);
  grad.addColorStop(0, 'rgba(232,121,249,0.25)');
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function firstAtoms(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const rnd = seededRandom(23);
  for (let i = 0; i < 900; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const flicker = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.4 + x * 0.02 + y * 0.02));
    ctx.fillStyle = `rgba(92,214,232,${0.06 * flicker})`;
    ctx.fillRect(x, y, 3, 3);
  }
  const cx = w / 2;
  const cy = h * 0.42;
  const R = Math.min(w, h) * 0.3;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  grad.addColorStop(0, 'rgba(255,246,216,0.9)');
  grad.addColorStop(0.5, 'rgba(92,214,232,0.35)');
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  // Pojedynczy atom wodoru symbolicznie w centrum: jądro + orbita elektronu.
  ctx.fillStyle = '#f0b35c';
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(92,214,232,0.5)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 30, 12, t * 0.3, 0, Math.PI * 2);
  ctx.stroke();
  const ea = t * 2;
  ctx.fillStyle = '#5cd6e8';
  ctx.beginPath();
  ctx.arc(cx + Math.cos(ea) * 30 * Math.cos(t * 0.3) - Math.sin(ea) * 12 * Math.sin(t * 0.3), cy + Math.cos(ea) * 30 * Math.sin(t * 0.3) + Math.sin(ea) * 12 * Math.cos(t * 0.3), 2.2, 0, Math.PI * 2);
  ctx.fill();
}

function firstStars(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const rnd = seededRandom(31);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(200,215,255,${0.15 + rnd() * 0.2})`;
    ctx.fillRect(rnd() * w, rnd() * h, 1, 1);
  }
  const stars = [
    { x: 0.25, y: 0.35, seed: 1 },
    { x: 0.55, y: 0.55, seed: 2 },
    { x: 0.72, y: 0.3, seed: 3 },
    { x: 0.4, y: 0.68, seed: 4 },
  ];
  for (const s of stars) {
    const life = (t * 0.15 + s.seed * 2.1) % 4;
    if (life > 3.4) continue; // gwiazda jeszcze nie "zapłonęła" w tym cyklu
    const bright = Math.min(1, life * 1.6);
    const cx = s.x * w;
    const cy = s.y * h;
    const R = Math.min(w, h) * 0.1 * bright;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 2.2);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.4, 'rgba(230,234,245,0.7)');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function firstGalaxies(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const clusters = [
    { x: 0.3, y: 0.4, hue: 200 },
    { x: 0.65, y: 0.35, hue: 40 },
    { x: 0.5, y: 0.68, hue: 280 },
  ];
  for (const c of clusters) {
    const cx = c.x * w;
    const cy = c.y * h;
    const rnd = seededRandom(Math.round(c.hue));
    for (let i = 0; i < 90; i++) {
      const a = rnd() * Math.PI * 2 + t * 0.05;
      const r = rnd() * Math.min(w, h) * 0.09;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * 0.7;
      ctx.fillStyle = `hsla(${c.hue},70%,75%,${0.7 - (r / (Math.min(w, h) * 0.09)) * 0.5})`;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
  }
}

function milkyWay(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const cx = w / 2;
  const cy = h / 2;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.08);
  glow.addColorStop(0, '#fff6d8');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.min(w, h) * 0.08, 0, Math.PI * 2);
  ctx.fill();
  const N = 900;
  for (let i = 0; i < N; i++) {
    const arm = i % 2;
    const tt = (i / N) * 4.4;
    const ang = tt * 1.9 + arm * Math.PI + t * 0.03;
    const rr = tt * Math.min(w, h) * 0.052;
    const x = cx + rr * Math.cos(ang);
    const y = cy + rr * Math.sin(ang) * 0.55;
    ctx.fillStyle = 'rgba(200,215,255,0.55)';
    ctx.fillRect(x, y, 1.3, 1.3);
  }
}

function solarSystemScene(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const cx = w / 2;
  const cy = h / 2;
  const sunGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 16);
  sunGrad.addColorStop(0, '#fff6d8');
  sunGrad.addColorStop(1, 'rgba(240,179,92,0)');
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f0d9a0';
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();
  const planets = [
    { r: 0.14, speed: 4.1, size: 2, color: '#8d97b4' },
    { r: 0.2, speed: 3.0, size: 2.6, color: '#f0b35c' },
    { r: 0.27, speed: 2.4, size: 2.8, color: '#5cd6e8' },
    { r: 0.35, speed: 1.9, size: 2.2, color: '#f47c7c' },
    { r: 0.46, speed: 1.1, size: 5, color: '#e6cba8' },
  ];
  const base = Math.min(w, h) * 0.5;
  for (const p of planets) {
    const R = p.r * base;
    ctx.strokeStyle = 'rgba(230,234,245,0.14)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    const a = t * p.speed * 0.15;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function earthScene(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.3;
  const grad = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
  grad.addColorStop(0, '#5cd6e8');
  grad.addColorStop(0.5, '#1e6f8f');
  grad.addColorStop(1, '#0a2f3d');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  const rnd = seededRandom(5);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 8; i++) {
    const a = rnd() * Math.PI * 2 + t * 0.05;
    const rr = rnd() * R * 0.8;
    ctx.fillStyle = 'rgba(110,231,160,0.55)';
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, R * 0.22, R * 0.13, a, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 6; i++) {
    const y = cy - R + ((t * 20 + i * 60) % (R * 2));
    ctx.fillStyle = 'rgba(230,234,245,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx + Math.sin(i) * R * 0.5, y, R * 0.4, R * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(92,214,232,0.3)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, R + 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
}

function firstLife(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#041014');
  bg.addColorStop(1, '#01050a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const rnd = seededRandom(41);
  for (let i = 0; i < 40; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const pulse = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.8 + i));
    ctx.fillStyle = `rgba(110,231,160,${0.3 * pulse})`;
    ctx.shadowColor = '#6ee7a0';
    ctx.shadowBlur = 6 * pulse;
    ctx.beginPath();
    ctx.arc(x, y, 1.5 + pulse * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function evolutionScene(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const cx = w * 0.15;
  const cy = h * 0.9;
  const branches = 7;
  for (let b = 0; b < branches; b++) {
    const angle = -Math.PI / 2 + ((b - branches / 2) / branches) * 1.3;
    const len = Math.min(w, h) * (0.55 + 0.1 * Math.sin(t * 0.3 + b));
    const ex = cx + Math.cos(angle) * len;
    const ey = cy + Math.sin(angle) * len;
    ctx.strokeStyle = `hsla(${140 + b * 15},60%,60%,0.6)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo(cx + Math.cos(angle) * len * 0.5, cy + Math.sin(angle) * len * 0.5 - 20, ex, ey);
    ctx.stroke();
    ctx.fillStyle = `hsla(${140 + b * 15},70%,70%,0.9)`;
    ctx.beginPath();
    ctx.arc(ex, ey, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineWidth = 1;
}

function dinosaursScene(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1a1408');
  grad.addColorStop(1, '#02030a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  const sunA = 0.3 + 0.1 * Math.sin(t * 0.2);
  const sgrad = ctx.createRadialGradient(w * 0.75, h * 0.25, 0, w * 0.75, h * 0.25, w * 0.3);
  sgrad.addColorStop(0, `rgba(244,124,124,${sunA})`);
  sgrad.addColorStop(1, 'transparent');
  ctx.fillStyle = sgrad;
  ctx.fillRect(0, 0, w, h);
  // Sylwetka zauropoda (symboliczna, nie anatomicznie dokładna).
  const gx = w * 0.35;
  const gy = h * 0.72;
  const s = Math.min(w, h) * 0.22;
  ctx.fillStyle = 'rgba(20,15,10,0.9)';
  ctx.beginPath();
  ctx.ellipse(gx, gy, s, s * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(gx - s * 0.9, gy - s * 0.1);
  ctx.quadraticCurveTo(gx - s * 1.6, gy - s * 0.8, gx - s * 1.9, gy - s * 1.1);
  ctx.lineTo(gx - s * 1.75, gy - s * 0.95);
  ctx.quadraticCurveTo(gx - s * 1.4, gy - s * 0.5, gx - s * 0.7, gy + s * 0.05);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(gx + s * 0.9, gy);
  ctx.quadraticCurveTo(gx + s * 1.8, gy + s * 0.3, gx + s * 2.3, gy + s * 0.1);
  ctx.lineTo(gx + s * 2.25, gy + s * 0.28);
  ctx.quadraticCurveTo(gx + s * 1.6, gy + s * 0.5, gx + s * 0.85, gy + s * 0.35);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(gx - s * 0.6 + i * s * 0.4, gy + s * 0.35, s * 0.14, s * 0.35);
  }
}

function humansScene(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0a0e18');
  grad.addColorStop(1, '#02030a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  const rnd = seededRandom(3);
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = `rgba(200,215,255,${0.15 + rnd() * 0.3})`;
    ctx.fillRect(rnd() * w, rnd() * h * 0.6, 1, 1);
  }
  const fx = w / 2;
  const fy = h * 0.78;
  const flicker = 0.6 + 0.4 * Math.sin(t * 8);
  const fgrad = ctx.createRadialGradient(fx, fy, 0, fx, fy, 40 * flicker);
  fgrad.addColorStop(0, '#fff6d8');
  fgrad.addColorStop(0.5, 'rgba(240,179,92,0.6)');
  fgrad.addColorStop(1, 'transparent');
  ctx.fillStyle = fgrad;
  ctx.beginPath();
  ctx.arc(fx, fy, 40 * flicker, 0, Math.PI * 2);
  ctx.fill();
  const people = [-1, 0, 1];
  for (const p of people) {
    const px = fx + p * 26;
    const py = fy + 4;
    ctx.fillStyle = 'rgba(10,10,15,0.9)';
    ctx.beginPath();
    ctx.arc(px, py - 16, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(px - 3, py - 12, 6, 14);
  }
}

function presentScene(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const cx = w / 2;
  const cy = h / 2;
  const rnd = seededRandom(9);
  for (let i = 0; i < 100; i++) {
    ctx.fillStyle = `rgba(200,215,255,${0.1 + rnd() * 0.25})`;
    ctx.fillRect(rnd() * w, rnd() * h, 1, 1);
  }
  const R = Math.min(w, h) * 0.26;
  const grad = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
  grad.addColorStop(0, '#5cd6e8');
  grad.addColorStop(0.5, '#1e6f8f');
  grad.addColorStop(1, '#0a2f3d');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  const markerA = t * 0.4;
  const mx = cx + Math.cos(markerA) * R * 0.55;
  const my = cy + Math.sin(markerA) * R * 0.55;
  ctx.fillStyle = '#f0b35c';
  ctx.shadowColor = '#f0b35c';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(mx, my, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function nearFutureScene(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const cx = w / 2;
  const cy = h / 2;
  const pulse = 0.9 + 0.1 * Math.sin(t * 0.6);
  const R = Math.min(w, h) * 0.4 * pulse;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  grad.addColorStop(0, '#fff0d0');
  grad.addColorStop(0.4, '#f47c7c');
  grad.addColorStop(0.8, 'rgba(244,124,124,0.35)');
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(230,234,245,0.2)';
  ctx.beginPath();
  ctx.arc(cx, cy, Math.min(w, h) * 0.46, 0, Math.PI * 2);
  ctx.stroke();
  const a = t * 0.5;
  ctx.fillStyle = '#8d97b4';
  ctx.beginPath();
  ctx.arc(cx + Math.cos(a) * Math.min(w, h) * 0.46, cy + Math.sin(a) * Math.min(w, h) * 0.46, 2, 0, Math.PI * 2);
  ctx.fill();
}

function farFutureScene(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const rnd = seededRandom(99);
  for (let i = 0; i < 25; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const fade = Math.max(0.02, 0.15 - (t % 20) * 0.006);
    ctx.fillStyle = `rgba(141,151,180,${fade})`;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.fillStyle = 'rgba(230,234,245,0.35)';
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('entropia → maksimum', w / 2, h / 2);
  ctx.textAlign = 'left';
}

export const EPOCH_SCENES: Record<string, SceneFn> = {
  'big-bang': bigBang,
  inflation,
  'first-atoms': firstAtoms,
  'first-stars': firstStars,
  'first-galaxies': firstGalaxies,
  'milky-way': milkyWay,
  'solar-system': solarSystemScene,
  earth: earthScene,
  'first-life': firstLife,
  evolution: evolutionScene,
  dinosaurs: dinosaursScene,
  humans: humansScene,
  present: presentScene,
  'near-future': nearFutureScene,
  'far-future': farFutureScene,
};

export function renderEpochScene(id: string, ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const fn = EPOCH_SCENES[id];
  if (fn) fn(ctx, w, h, t);
}
