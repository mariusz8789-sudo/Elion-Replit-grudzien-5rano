/**
 * WORLD PREVIEWS — cheap procedural 2D-canvas animations for the Worlds hub
 * cards. They are VISUALISATIONS only (each card says so with its badge):
 * nothing here reads model state, every shape is a deterministic function of
 * time and a fixed seed, so they never pretend to be a live model.
 *
 * Pure functions on a `CanvasRenderingContext2D`-shaped object: the React
 * wrapper (WorldPreviewCanvas) owns sizing, frame timing and visibility; this
 * module only draws, which is what makes it testable without a DOM.
 */

export type PreviewKind = 'city' | 'vessel' | 'molecule' | 'hall' | 'terrain' | 'cells' | 'cosmos';

export const PREVIEW_KINDS: readonly PreviewKind[] = ['city', 'vessel', 'molecule', 'hall', 'terrain', 'cells', 'cosmos'];

/** The subset of the 2D context the previews use — keeps the fake context in tests honest. */
export type PreviewContext = Pick<
  CanvasRenderingContext2D,
  | 'save' | 'restore' | 'clearRect' | 'fillRect' | 'strokeRect' | 'beginPath' | 'moveTo' | 'lineTo' | 'arc' | 'ellipse' | 'closePath'
  | 'fill' | 'stroke' | 'createLinearGradient' | 'createRadialGradient' | 'translate' | 'rotate' | 'scale'
  | 'fillStyle' | 'strokeStyle' | 'lineWidth' | 'globalAlpha' | 'globalCompositeOperation' | 'shadowBlur' | 'shadowColor' | 'lineCap'
>;

export interface PreviewPalette {
  readonly accent: string;   // primary hue
  readonly accent2: string;  // secondary hue
  readonly hot: string;      // hotspot / alert hue
}

const CYAN = '#5cd6e8';
const VIOLET = '#a78bfa';
const GREEN = '#6ee7a0';
const GOLD = '#f0b35c';
const RED = '#f47c7c';

export const DEFAULT_PALETTE: Record<PreviewKind, PreviewPalette> = {
  city: { accent: CYAN, accent2: VIOLET, hot: RED },
  vessel: { accent: CYAN, accent2: GREEN, hot: GOLD },
  molecule: { accent: CYAN, accent2: VIOLET, hot: GREEN },
  hall: { accent: GOLD, accent2: CYAN, hot: GREEN },
  terrain: { accent: GREEN, accent2: CYAN, hot: GOLD },
  cells: { accent: GREEN, accent2: VIOLET, hot: CYAN },
  cosmos: { accent: VIOLET, accent2: CYAN, hot: GOLD },
};

/** Deterministic pseudo-random in [0, 1). */
export function hash01(i: number, salt = 0): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233 + 1.31) * 43758.5453;
  return x - Math.floor(x);
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function glowDot(ctx: PreviewContext, x: number, y: number, r: number, color: string, alpha = 1): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.4, rgba(color, alpha * 0.45));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function hudGrid(ctx: PreviewContext, w: number, h: number, color: string, step = 18, alpha = 0.07): void {
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0.5; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let y = 0.5; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
}

function scanline(ctx: PreviewContext, w: number, h: number, t: number, color: string, period = 5): void {
  const y = ((t / period) % 1) * (h + 40) - 20;
  const g = ctx.createLinearGradient(0, y - 18, 0, y + 4);
  g.addColorStop(0, rgba(color, 0));
  g.addColorStop(0.85, rgba(color, 0.16));
  g.addColorStop(1, rgba(color, 0.4));
  ctx.fillStyle = g;
  ctx.fillRect(0, y - 18, w, 22);
}

// ---------------------------------------------------------------------------
// city — isometric grid of glowing blocks with pulsing hotspots
// ---------------------------------------------------------------------------
function drawCity(ctx: PreviewContext, w: number, h: number, t: number, p: PreviewPalette): void {
  hudGrid(ctx, w, h, p.accent, 16, 0.05);
  const N = 9;
  const tw = Math.min(w, h * 1.6) / (N + 2);
  const th = tw * 0.5;
  const cx = w / 2 + Math.sin(t * 0.25) * 4;
  const cy = h * 0.28;
  const hotspots = [[2, 6], [6, 2], [5, 6]] as const;
  ctx.save();
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const idx = i * N + j;
      const isPark = hash01(idx, 9) < 0.14;
      const hgt = isPark ? 0 : 6 + hash01(idx, 3) * 34 * (0.6 + 0.4 * Math.sin(t * 0.6 + idx));
      const x = cx + (i - j) * tw * 0.5;
      const y = cy + (i + j) * th * 0.5;
      const near = hotspots.reduce((m, [hi, hj]) => Math.min(m, Math.hypot(hi - i, hj - j)), 99);
      const heat = Math.max(0, 1 - near / 2.2) * (0.6 + 0.4 * Math.sin(t * 2.2 + near));
      const wall = rgba(p.accent, 0.10 + heat * 0.15);
      const top = heat > 0.05 ? rgba(p.hot, 0.25 + heat * 0.55) : rgba(p.accent, 0.28 + hash01(idx, 5) * 0.25);
      // left face
      ctx.fillStyle = wall;
      ctx.beginPath(); ctx.moveTo(x - tw / 2, y); ctx.lineTo(x, y + th / 2); ctx.lineTo(x, y + th / 2 - hgt); ctx.lineTo(x - tw / 2, y - hgt); ctx.closePath(); ctx.fill();
      // right face
      ctx.fillStyle = rgba(p.accent2, 0.08 + heat * 0.12);
      ctx.beginPath(); ctx.moveTo(x + tw / 2, y); ctx.lineTo(x, y + th / 2); ctx.lineTo(x, y + th / 2 - hgt); ctx.lineTo(x + tw / 2, y - hgt); ctx.closePath(); ctx.fill();
      // top
      ctx.fillStyle = isPark ? rgba(GREEN, 0.18) : top;
      ctx.beginPath(); ctx.moveTo(x, y - th / 2 - hgt); ctx.lineTo(x + tw / 2, y - hgt); ctx.lineTo(x, y + th / 2 - hgt); ctx.lineTo(x - tw / 2, y - hgt); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(p.accent, 0.35 + heat * 0.4);
      ctx.lineWidth = 0.8;
      ctx.stroke();
      // windows
      if (hgt > 14 && hash01(idx, 7) > 0.35) {
        ctx.fillStyle = rgba('#ffffff', 0.35 + 0.3 * Math.sin(t * 3 + idx));
        for (let k = 1; k < hgt / 6; k++) ctx.fillRect(x - tw * 0.18, y - k * 6 + th * 0.2, 1.5, 1.5);
      }
    }
  }
  ctx.restore();
  // hotspots: expanding rings + glow
  for (const [hi, hj] of hotspots) {
    const x = cx + (hi - hj) * tw * 0.5;
    const y = cy + (hi + hj) * th * 0.5 - 8;
    const ph = ((t * 0.6 + hi * 0.3) % 1);
    glowDot(ctx, x, y, 22 + ph * 6, p.hot, 0.55);
    ctx.strokeStyle = rgba(p.hot, 0.6 * (1 - ph));
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(x, y + 4, 8 + ph * 26, 4 + ph * 13, 0, 0, Math.PI * 2); ctx.stroke();
  }
  scanline(ctx, w, h, t, p.accent, 7);
}

// ---------------------------------------------------------------------------
// vessel — glass bioreactor with rising bubbles and a scan line
// ---------------------------------------------------------------------------
function drawVessel(ctx: PreviewContext, w: number, h: number, t: number, p: PreviewPalette): void {
  hudGrid(ctx, w, h, p.accent, 18, 0.06);
  const vw = Math.min(w * 0.36, h * 0.6);
  const vh = h * 0.78;
  const x0 = w * 0.5 - vw / 2;
  const y0 = h * 0.5 - vh / 2;
  const r = vw * 0.22;
  const path = (): void => {
    ctx.beginPath();
    ctx.moveTo(x0 + r, y0);
    ctx.lineTo(x0 + vw - r, y0);
    ctx.arc(x0 + vw - r, y0 + r, r, -Math.PI / 2, 0);
    ctx.lineTo(x0 + vw, y0 + vh - r);
    ctx.arc(x0 + vw - r, y0 + vh - r, r, 0, Math.PI / 2);
    ctx.lineTo(x0 + r, y0 + vh);
    ctx.arc(x0 + r, y0 + vh - r, r, Math.PI / 2, Math.PI);
    ctx.lineTo(x0, y0 + r);
    ctx.arc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5);
    ctx.closePath();
  };
  // liquid
  ctx.save();
  path();
  const level = y0 + vh * (0.22 + 0.02 * Math.sin(t * 1.3));
  const lg = ctx.createLinearGradient(0, level, 0, y0 + vh);
  lg.addColorStop(0, rgba(p.accent2, 0.55));
  lg.addColorStop(1, rgba(p.accent, 0.25));
  ctx.fillStyle = rgba(p.accent, 0.05);
  ctx.fill();
  ctx.fillStyle = lg;
  ctx.fillRect(x0, level, vw, y0 + vh - level);
  // surface wave
  ctx.strokeStyle = rgba('#ffffff', 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= vw; x += 3) ctx.lineTo(x0 + x, level + Math.sin(x * 0.18 + t * 3) * 1.6);
  ctx.stroke();
  // bubbles
  for (let i = 0; i < 26; i++) {
    const sp = 0.08 + hash01(i, 1) * 0.16;
    const ph = ((t * sp + hash01(i, 2)) % 1);
    const bx = x0 + vw * (0.12 + hash01(i, 3) * 0.76) + Math.sin(t * 2 + i) * 3;
    const by = y0 + vh - ph * (y0 + vh - level);
    const br = 1 + hash01(i, 4) * 2.6;
    ctx.strokeStyle = rgba('#ffffff', 0.55 * (1 - ph * 0.6));
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.stroke();
  }
  // stirrer glow
  glowDot(ctx, x0 + vw / 2, y0 + vh * 0.72, vw * 0.32, p.accent2, 0.35 + 0.15 * Math.sin(t * 2.4));
  ctx.restore();
  // glass outline + highlight
  path();
  ctx.strokeStyle = rgba(p.accent, 0.85);
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', 0.22);
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x0 + vw * 0.16, y0 + vh * 0.12); ctx.lineTo(x0 + vw * 0.16, y0 + vh * 0.82); ctx.stroke();
  // side instruments: ticks + a tiny live-looking trace (decorative sine)
  ctx.strokeStyle = rgba(p.accent, 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = 0; k < 9; k++) { const y = y0 + (vh / 8) * k; ctx.moveTo(x0 - 10, y); ctx.lineTo(x0 - 4, y); }
  ctx.stroke();
  ctx.strokeStyle = rgba(p.hot, 0.8);
  ctx.beginPath();
  const tx0 = x0 + vw + 14, tw = w - tx0 - 10;
  for (let i = 0; i <= tw; i += 2) ctx.lineTo(tx0 + i, h * 0.5 + Math.sin(i * 0.11 + t * 2.1) * 8 * Math.sin(i * 0.02 + t * 0.3));
  ctx.stroke();
  scanline(ctx, w, h, t, p.accent, 4.5);
}

// ---------------------------------------------------------------------------
// molecule — orbiting atoms with glowing bonds (fake 3D via depth scaling)
// ---------------------------------------------------------------------------
function drawMolecule(ctx: PreviewContext, w: number, h: number, t: number, p: PreviewPalette): void {
  hudGrid(ctx, w, h, p.accent, 20, 0.05);
  const cx = w / 2, cy = h / 2;
  const R = Math.min(w, h) * 0.34;
  const atoms: Array<{ x: number; y: number; z: number; c: string; r: number }> = [];
  const specs = [[0, 0.9, 1.0], [2.1, 0.5, 0.8], [4.2, 1.2, 0.9], [1.0, 2.0, 0.6], [3.3, 2.6, 0.7], [5.4, 1.6, 0.75]];
  specs.forEach(([phase, tilt, rad], i) => {
    const a = t * (0.5 + i * 0.07) + phase!;
    const x = Math.cos(a) * R * rad!;
    const yy = Math.sin(a) * R * rad! * Math.cos(tilt!);
    const z = Math.sin(a) * Math.sin(tilt!);
    atoms.push({ x: cx + x, y: cy + yy, z, c: i % 3 === 0 ? p.accent : i % 3 === 1 ? p.accent2 : p.hot, r: 4 + (i % 2) * 2 });
  });
  const sorted = [...atoms].sort((a, b) => a.z - b.z);
  // bonds
  ctx.lineCap = 'round';
  for (const a of atoms) {
    const g = ctx.createLinearGradient(cx, cy, a.x, a.y);
    g.addColorStop(0, rgba('#ffffff', 0.55));
    g.addColorStop(1, rgba(a.c, 0.15 + (a.z + 1) * 0.3));
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.5 + (a.z + 1) * 1.2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(a.x, a.y); ctx.stroke();
  }
  // a few atom-atom bonds
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i]!, b = atoms[(i + 2) % atoms.length]!;
    ctx.strokeStyle = rgba(p.accent, 0.12 + (a.z + b.z + 2) * 0.08);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  // central atom
  glowDot(ctx, cx, cy, R * 0.55, p.accent, 0.35);
  const cg = ctx.createRadialGradient(cx - 3, cy - 3, 0, cx, cy, 11);
  cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.5, p.accent); cg.addColorStop(1, rgba(p.accent, 0.4));
  ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill();
  // orbiting atoms
  for (const a of sorted) {
    const s = 0.7 + (a.z + 1) * 0.35;
    glowDot(ctx, a.x, a.y, a.r * 3.2 * s, a.c, 0.45 * s);
    const g = ctx.createRadialGradient(a.x - a.r * 0.3, a.y - a.r * 0.3, 0, a.x, a.y, a.r * s);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, a.c); g.addColorStop(1, rgba(a.c, 0.5));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(a.x, a.y, a.r * s, 0, Math.PI * 2); ctx.fill();
  }
  // orbit ellipses (holo rings)
  ctx.strokeStyle = rgba(p.accent2, 0.2);
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(cx, cy, R, R * 0.38, t * 0.2, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx, cy, R * 0.8, R * 0.3, -t * 0.15 + 1.2, 0, Math.PI * 2); ctx.stroke();
}

// ---------------------------------------------------------------------------
// hall — a gate/beam with rising evidence tiles
// ---------------------------------------------------------------------------
function drawHall(ctx: PreviewContext, w: number, h: number, t: number, p: PreviewPalette): void {
  // perspective floor
  const horizon = h * 0.42;
  ctx.strokeStyle = rgba(p.accent2, 0.14);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -6; i <= 6; i++) { ctx.moveTo(w / 2 + i * 12, horizon); ctx.lineTo(w / 2 + i * w * 0.22, h); }
  for (let k = 0; k < 7; k++) { const y = horizon + Math.pow((k + ((t * 0.5) % 1)) / 7, 2) * (h - horizon); ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
  // gate pillars
  const gx0 = w * 0.36, gx1 = w * 0.64, gy0 = h * 0.14, gy1 = h * 0.72;
  const beam = ctx.createLinearGradient(gx0, 0, gx1, 0);
  beam.addColorStop(0, rgba(p.accent, 0));
  beam.addColorStop(0.5, rgba(p.accent, 0.28 + 0.08 * Math.sin(t * 2)));
  beam.addColorStop(1, rgba(p.accent, 0));
  ctx.fillStyle = beam;
  ctx.fillRect(gx0, gy0, gx1 - gx0, gy1 - gy0);
  for (const gx of [gx0, gx1]) {
    const pg = ctx.createLinearGradient(0, gy0, 0, gy1);
    pg.addColorStop(0, rgba(p.accent, 0.9)); pg.addColorStop(1, rgba(p.accent, 0.25));
    ctx.fillStyle = pg;
    ctx.fillRect(gx - 2, gy0, 4, gy1 - gy0);
    glowDot(ctx, gx, gy0, 14, p.accent, 0.8);
  }
  // lintel
  ctx.strokeStyle = rgba(p.accent, 0.9);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(gx0 - 8, gy0); ctx.lineTo(gx1 + 8, gy0); ctx.stroke();
  // evidence tiles rising through the gate; past the gate they turn green (admitted)
  for (let i = 0; i < 9; i++) {
    const ph = ((t * (0.12 + hash01(i, 1) * 0.1) + hash01(i, 2)) % 1);
    const x = w * 0.5 + (hash01(i, 3) - 0.5) * (gx1 - gx0) * 0.7;
    const y = h * 0.95 - ph * (h * 0.95 - h * 0.05);
    const through = y < gy0 + (gy1 - gy0) * 0.45;
    const c = through ? p.hot : p.accent2;
    const alpha = ph < 0.1 ? ph * 10 : ph > 0.85 ? (1 - ph) / 0.15 : 1;
    const tw = 12 + hash01(i, 4) * 10, th = 8;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t + i) * 0.15);
    ctx.fillStyle = rgba(c, 0.25 * alpha);
    ctx.strokeStyle = rgba(c, 0.9 * alpha);
    ctx.lineWidth = 1;
    ctx.fillRect(-tw / 2, -th / 2, tw, th);
    ctx.strokeRect(-tw / 2, -th / 2, tw, th);
    ctx.fillStyle = rgba('#ffffff', 0.6 * alpha);
    ctx.fillRect(-tw / 2 + 2, -1, tw * 0.5, 1.5);
    ctx.restore();
    if (through) glowDot(ctx, x, y, 12, c, 0.5 * alpha);
  }
  // winner record slot above the gate
  glowDot(ctx, w / 2, gy0 - 6, 26, p.hot, 0.35 + 0.15 * Math.sin(t * 1.5));
  scanline(ctx, w, h, t, p.accent2, 6);
}

// ---------------------------------------------------------------------------
// terrain — wire terrain with a travelling wave and a hot event
// ---------------------------------------------------------------------------
function drawTerrain(ctx: PreviewContext, w: number, h: number, t: number, p: PreviewPalette): void {
  const rows = 14, cols = 22;
  const horizon = h * 0.3;
  ctx.lineWidth = 1;
  for (let r = 0; r < rows; r++) {
    const depth = r / (rows - 1);
    const y = horizon + Math.pow(depth, 1.6) * (h - horizon);
    const spread = 0.35 + depth * 0.75;
    ctx.strokeStyle = rgba(p.accent, 0.12 + depth * 0.45);
    ctx.beginPath();
    for (let c = 0; c <= cols; c++) {
      const u = c / cols - 0.5;
      const x = w / 2 + u * w * spread;
      const hgt = (Math.sin(u * 7 + r * 0.8 + t * 0.7) + Math.sin(u * 13 - r * 1.3 - t * 0.4)) * 6 * (0.3 + depth);
      ctx.lineTo(x, y - hgt);
    }
    ctx.stroke();
  }
  // event hotspot (fire) drifting
  const ex = w * (0.55 + 0.1 * Math.sin(t * 0.3)), ey = h * 0.7;
  glowDot(ctx, ex, ey, 30 + 6 * Math.sin(t * 4), p.hot, 0.7);
  glowDot(ctx, ex, ey, 10, '#ffffff', 0.5);
  // fork branches (counterfactual)
  ctx.strokeStyle = rgba(p.accent2, 0.6);
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(w * 0.1, h * 0.86); ctx.lineTo(w * 0.42, h * 0.86); ctx.lineTo(w * 0.62, h * 0.78); ctx.moveTo(w * 0.42, h * 0.86); ctx.lineTo(w * 0.62, h * 0.94); ctx.stroke();
  glowDot(ctx, w * 0.42, h * 0.86, 8, p.accent2, 0.9);
  // sky stars
  for (let i = 0; i < 24; i++) { ctx.fillStyle = rgba('#ffffff', 0.3 + 0.5 * hash01(i, 8) * (0.6 + 0.4 * Math.sin(t * 2 + i))); ctx.fillRect(hash01(i, 5) * w, hash01(i, 6) * horizon * 0.9, 1.5, 1.5); }
  scanline(ctx, w, h, t, p.accent, 6.5);
}

// ---------------------------------------------------------------------------
// cells — two dishes: control vs therapy, colonies pulsing
// ---------------------------------------------------------------------------
function drawCells(ctx: PreviewContext, w: number, h: number, t: number, p: PreviewPalette): void {
  hudGrid(ctx, w, h, p.accent, 18, 0.05);
  const R = Math.min(w * 0.2, h * 0.36);
  const dishes = [{ x: w * 0.3, c: p.accent, n: 14 }, { x: w * 0.7, c: p.accent2, n: 8 }];
  dishes.forEach((d, di) => {
    const cy = h / 2;
    ctx.strokeStyle = rgba(d.c, 0.8); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(d.x, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = rgba(d.c, 0.25); ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(d.x, cy, R + 5, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = rgba(d.c, 0.06); ctx.beginPath(); ctx.arc(d.x, cy, R, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < d.n; i++) {
      const a = hash01(i, di + 1) * Math.PI * 2, rr = hash01(i, di + 3) * R * 0.78;
      const x = d.x + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      const grow = 0.5 + 0.5 * Math.sin(t * (0.8 + hash01(i, di + 5)) + i);
      glowDot(ctx, x, y, 4 + grow * 5, d.c, 0.75);
      ctx.fillStyle = rgba('#ffffff', 0.7); ctx.beginPath(); ctx.arc(x, y, 1.2 + grow, 0, Math.PI * 2); ctx.fill();
    }
  });
  // therapy droplet
  const dy = h * 0.12 + ((t * 0.5) % 1) * h * 0.28;
  glowDot(ctx, w * 0.7, dy, 6, p.hot, 0.9);
  scanline(ctx, w, h, t, p.accent, 5);
}

// ---------------------------------------------------------------------------
// cosmos — epoch arc with a travelling marker and a starfield
// ---------------------------------------------------------------------------
function drawCosmos(ctx: PreviewContext, w: number, h: number, t: number, p: PreviewPalette): void {
  for (let i = 0; i < 60; i++) {
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (0.6 + hash01(i, 2)) + i));
    ctx.fillStyle = rgba('#ffffff', 0.15 + 0.6 * tw * hash01(i, 3));
    ctx.fillRect(hash01(i, 1) * w, hash01(i, 4) * h, 1.2, 1.2);
  }
  const cx = w / 2, cy = h * 1.05, R = Math.min(w * 0.46, h * 0.85);
  const a0 = Math.PI * 1.12, a1 = Math.PI * 1.88;
  ctx.strokeStyle = rgba(p.accent, 0.3); ctx.lineWidth = 8;
  ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.stroke();
  ctx.strokeStyle = rgba(p.accent, 0.9); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.stroke();
  const epochs = 7;
  for (let i = 0; i < epochs; i++) {
    const a = a0 + ((a1 - a0) * i) / (epochs - 1);
    const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
    const c = i === 0 ? p.hot : i === epochs - 1 ? p.accent2 : p.accent;
    glowDot(ctx, x, y, 9, c, 0.8);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
  }
  // Big Bang burst at the start
  glowDot(ctx, cx + Math.cos(a0) * R, cy + Math.sin(a0) * R, 26 + 5 * Math.sin(t * 3), p.hot, 0.6);
  // travelling marker
  const ph = (t * 0.08) % 1;
  const a = a0 + (a1 - a0) * ph;
  const mx = cx + Math.cos(a) * R, my = cy + Math.sin(a) * R;
  glowDot(ctx, mx, my, 18, p.accent2, 0.9);
  ctx.strokeStyle = rgba(p.accent2, 0.5); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx, my - 22); ctx.stroke();
}

const DRAWERS: Record<PreviewKind, (ctx: PreviewContext, w: number, h: number, t: number, p: PreviewPalette) => void> = {
  city: drawCity,
  vessel: drawVessel,
  molecule: drawMolecule,
  hall: drawHall,
  terrain: drawTerrain,
  cells: drawCells,
  cosmos: drawCosmos,
};

/**
 * Draw one frame of `kind` at time `t` (seconds) into a `w`×`h` CSS-pixel
 * area. The caller applies the device-pixel scale beforehand.
 */
export function drawPreview(kind: PreviewKind, ctx: PreviewContext, w: number, h: number, t: number, palette: PreviewPalette = DEFAULT_PALETTE[kind]): void {
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  // ambient depth: a dark vignette so the glowing shapes read as holograms
  const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
  bg.addColorStop(0, rgba(palette.accent, 0.08));
  bg.addColorStop(1, 'rgba(4,7,18,0)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  DRAWERS[kind](ctx, w, h, t, palette);
  // HUD corners
  ctx.strokeStyle = rgba(palette.accent, 0.7);
  ctx.lineWidth = 1.2;
  const L = 10, m = 6;
  ctx.beginPath();
  ctx.moveTo(m, m + L); ctx.lineTo(m, m); ctx.lineTo(m + L, m);
  ctx.moveTo(w - m - L, m); ctx.lineTo(w - m, m); ctx.lineTo(w - m, m + L);
  ctx.moveTo(m, h - m - L); ctx.lineTo(m, h - m); ctx.lineTo(m + L, h - m);
  ctx.moveTo(w - m - L, h - m); ctx.lineTo(w - m, h - m); ctx.lineTo(w - m, h - m - L);
  ctx.stroke();
  ctx.restore();
}
