import type { PlaceEpoch } from '../data/placeTimeline';

type SceneFn = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number, progress: number) => void;

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function ground(ctx: CanvasRenderingContext2D, w: number, h: number, vegetation: number, water: number): void {
  const horizon = h * 0.52;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#050817');
  sky.addColorStop(1, '#24304a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);
  const land = ctx.createLinearGradient(0, horizon, 0, h);
  land.addColorStop(0, vegetation > 0.5 ? '#385a43' : '#b27e4c');
  land.addColorStop(1, vegetation > 0.5 ? '#101f1c' : '#241b18');
  ctx.fillStyle = land;
  ctx.fillRect(0, horizon, w, h - horizon);
  if (water > 0) {
    ctx.fillStyle = `rgba(47,155,184,${0.2 + water * 0.35})`;
    ctx.beginPath();
    ctx.ellipse(w * 0.28, h * 0.7, w * (0.14 + water * 0.08), h * 0.08, -0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSun(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const x = w * 0.78;
  const y = h * (0.18 + Math.sin(t * 0.08) * 0.015);
  const r = Math.min(w, h) * 0.065;
  const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3.8);
  glow.addColorStop(0, 'rgba(255,246,216,0.9)');
  glow.addColorStop(1, 'rgba(240,179,92,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 3.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffe8a8';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlants(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, t: number): void {
  const count = Math.round(amount * 90);
  for (let i = 0; i < count; i++) {
    const x = ((i * 83) % Math.max(1, Math.round(w * 0.94))) + w * 0.03;
    const base = h * 0.82 + ((i * 17) % 40);
    const sway = Math.sin(t * 1.5 + i * 0.7) * (1 + amount * 3);
    const height = 5 + amount * (9 + (i % 7));
    ctx.strokeStyle = `rgba(110,231,160,${0.25 + amount * 0.55})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.lineTo(x + sway, base - height);
    ctx.stroke();
  }
}

function drawShelter(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, light: boolean): void {
  ctx.fillStyle = light ? '#f0b35c' : '#50392d';
  ctx.beginPath();
  ctx.moveTo(x - 20 * scale, y);
  ctx.lineTo(x, y - 28 * scale);
  ctx.lineTo(x + 20 * scale, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = light ? '#ffe9a6' : '#19141a';
  ctx.fillRect(x - 4 * scale, y - 10 * scale, 8 * scale, 10 * scale);
}

function drawSettlement(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, t: number): void {
  const count = Math.round(2 + amount * 7);
  for (let i = 0; i < count; i++) {
    drawShelter(ctx, w * (0.18 + i * 0.09), h * (0.7 + (i % 2) * 0.045), 0.7 + (i % 3) * 0.12, Math.sin(t * 2 + i) > -0.4);
  }
}

function drawCity(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, t: number): void {
  const count = Math.round(amount * 13);
  ctx.fillStyle = 'rgba(92,214,232,0.14)';
  ctx.fillRect(0, h * 0.68, w, 4);
  for (let i = 0; i < count; i++) {
    const x = w * (0.08 + i / Math.max(1, count) * 0.82);
    const width = 13 + (i % 4) * 8;
    const height = 22 + (i % 6) * 16;
    ctx.fillStyle = i % 3 === 0 ? '#34445c' : '#263147';
    ctx.fillRect(x, h * 0.68 - height, width, height);
    ctx.fillStyle = `rgba(255,219,128,${0.35 + 0.15 * Math.sin(t * 2 + i)})`;
    for (let wy = h * 0.68 - height + 8; wy < h * 0.66; wy += 11) ctx.fillRect(x + 4, wy, 3, 4);
  }
  ctx.strokeStyle = 'rgba(230,234,245,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.84);
  ctx.lineTo(w, h * 0.79);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const carX = ((t * (22 + i * 5) + i * 130) % (w + 80)) - 40;
    ctx.fillStyle = '#e87979';
    ctx.fillRect(carX, h * 0.825 - i * 4, 15, 5);
    ctx.fillStyle = '#9bd9e8';
    ctx.fillRect(carX + 3, h * 0.825 - i * 4 - 3, 7, 3);
  }
}

function drawRuins(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, t: number): void {
  const count = Math.round(2 + amount * 6);
  for (let i = 0; i < count; i++) {
    const x = w * (0.15 + i * 0.12);
    const height = 20 + (i % 4) * 15;
    ctx.fillStyle = '#4a4650';
    ctx.fillRect(x, h * 0.75 - height, 18 + (i % 3) * 9, height);
    ctx.fillStyle = '#6ee7a0';
    ctx.fillRect(x + 4, h * 0.75 - height - 6 - Math.sin(t + i) * 2, 3, 10);
  }
}

function drawObserver(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const x = w * 0.5;
  const y = h * 0.78;
  ctx.fillStyle = '#111827';
  ctx.beginPath();
  ctx.arc(x, y - 42, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x - 7, y - 33, 14, 30);
  ctx.strokeStyle = '#8fa5bd';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x - 3, y - 4); ctx.lineTo(x - 12, y + 18);
  ctx.moveTo(x + 3, y - 4); ctx.lineTo(x + 12, y + 18);
  ctx.stroke();
  ctx.fillStyle = 'rgba(230,234,245,0.8)';
  ctx.font = '11px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('OBSERVER', x, y + 34);
  ctx.textAlign = 'left';
}

const scene: SceneFn = (ctx, w, h, t, progress) => {
  const p = clamp(progress);
  const vegetation = clamp(p * 1.5);
  const water = clamp(p * 2.2);
  ground(ctx, w, h, vegetation, water);
  drawSun(ctx, w, h, t);
  drawPlants(ctx, w, h, vegetation, t);
  drawSettlement(ctx, w, h, clamp((p - 0.18) * 1.9), t);
  drawCity(ctx, w, h, clamp((p - 0.38) * 1.85), t);
  drawRuins(ctx, w, h, clamp((p - 0.72) * 3.4), t);
  drawObserver(ctx, w, h);
};

export function renderPlaceScene(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, progress: number): void {
  scene(ctx, w, h, t, progress);
}

export function placeProgress(year: number, epochs: PlaceEpoch[]): number {
  const valid = epochs.filter((e) => e.id !== 'mythic-origin');
  const min = valid[0]?.year ?? 0;
  const max = valid[valid.length - 1]?.year ?? 1;
  if (year <= min) return 0;
  if (year >= max) return 1;
  const span = Math.max(1, max - min);
  return (year - min) / span;
}
