/**
 * EVIDENCE FIELD ENGINE — pure, framework-agnostic procedural background renderer.
 *
 * Until D-117 this file drew "digital rain" (falling katakana columns). That
 * look said nothing about Genesis and read as a film cliché, so the renderer
 * now composes an EVIDENCE FIELD: slowly rising nodes on three depth layers,
 * thin links between neighbours (a provenance lattice), and sparse 8-hex
 * "fingerprint" tags — the visual vocabulary of the product itself (stage
 * fingerprints, custody hashes, evidence graphs). The engine's public API,
 * config vocabulary, quality tiers and determinism contract are unchanged, so
 * `matrixController.ts` and `LiveMatrixBackground.tsx` did not move.
 *
 * Zero React, zero DOM, zero Genesis imports. Everything here is a pure
 * function over plain data plus one narrow `RenderContext` the caller supplies
 * (the real `CanvasRenderingContext2D` satisfies it structurally). That is what
 * makes the whole engine testable in a plain Node test runner — this repo has
 * no jsdom and no @testing-library.
 *
 * DETERMINISM, stated precisely so the claim is checkable: the same
 * `(width, height, config)` always produces the same node LAYOUT, tags are a
 * pure hash of `(nodeSeed, epoch)`, and link selection is a pure function of
 * node positions. Frame TIMING is not part of that guarantee — `dt` comes from
 * the host clock — but nothing about layout, tags or links consults a clock
 * or `Math.random()`.
 */

export type ActivityLevel = 0 | 1 | 2 | 3 | 4; // IDLE ACTIVE RESEARCH RUNNING ATTENTION
export type DensityLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type SpeedLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type GlowLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type QualityLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'REDUCED_MOTION';

export interface MatrixConfig {
  activity: ActivityLevel;
  density: DensityLevel;
  speed: SpeedLevel;
  glow: GlowLevel;
  quality: QualityLevel;
  seed: number;
  reducedMotion: boolean;
}

export const DEFAULT_CONFIG: MatrixConfig = {
  activity: 1, density: 'MEDIUM', speed: 'MEDIUM', glow: 'MEDIUM', quality: 'HIGH', seed: 1337, reducedMotion: false,
};

/**
 * ONE source of truth for the device-pixel-ratio ceiling per quality tier.
 * The renderer reads it, the host reads it when sizing the backing store, and
 * the test asserts they agree.
 */
export const QUALITY_DPR_CAP = {
  HIGH: 2,
  MEDIUM: 1.75,
  LOW: 1.25,
  REDUCED_MOTION: 1.5,
} as const satisfies Record<QualityLevel, number>;

/**
 * Per-activity modulation. `amber` is a PROBABILITY in [0,1] applied per
 * node — 0.12 means roughly one node in eight picks up the amber accent,
 * which is what "subtle ATTENTION signal" means. It is never a multiplier.
 */
const ACTIVITY: readonly { speed: number; density: number; particles: number; amber: number }[] = [
  { speed: 0.8, density: 1.0, particles: 0.35, amber: 0 },
  { speed: 1.0, density: 1.15, particles: 0.4, amber: 0 },
  { speed: 1.15, density: 1.2, particles: 0.7, amber: 0 },
  { speed: 1.45, density: 1.45, particles: 1.1, amber: 0 },
  { speed: 1.2, density: 1.25, particles: 0.9, amber: 0.12 },
];

const DENSITY_MULT: Record<DensityLevel, number> = { LOW: 0.55, MEDIUM: 1, HIGH: 1.6 };
const SPEED_MULT: Record<SpeedLevel, number> = { LOW: 0.6, MEDIUM: 1, HIGH: 1.5 };

/**
 * `pulse`, like `amber`, is a probability in [0,1] — not a multiplier. `fade`
 * is how hard each frame paints over the last one: LOWER = longer afterglow
 * behind a moving node.
 */
const QUALITY: Record<QualityLevel, { density: number; fade: number; glowBlur: number; dprCap: number; pulse: number; links: number }> = {
  HIGH: { density: 1, fade: 0.16, glowBlur: 10, dprCap: QUALITY_DPR_CAP.HIGH, pulse: 0.05, links: 3 },
  MEDIUM: { density: 0.8, fade: 0.22, glowBlur: 6, dprCap: QUALITY_DPR_CAP.MEDIUM, pulse: 0.03, links: 2 },
  LOW: { density: 0.55, fade: 0.3, glowBlur: 0, dprCap: QUALITY_DPR_CAP.LOW, pulse: 0, links: 1 },
  REDUCED_MOTION: { density: 0.7, fade: 1, glowBlur: 5, dprCap: QUALITY_DPR_CAP.REDUCED_MOTION, pulse: 0, links: 2 },
};

/** Three depth layers: far (dim, small, slow) → near (bright, larger, faster). */
const LAYERS: readonly { rise: number; radius: number; alpha: number; sway: number }[] = [
  { rise: 5, radius: 1.1, alpha: 0.32, sway: 6 },
  { rise: 9, radius: 1.8, alpha: 0.55, sway: 10 },
  { rise: 15, radius: 2.6, alpha: 0.8, sway: 16 },
];

/** Links are only drawn between nodes closer than this (CSS px). */
export const LINK_RADIUS = 150;
const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const BACKGROUND = '#0a0e1c';

/** One evidence node. The type keeps its historical name so the controller's contract is unchanged. */
export interface Stream {
  layer: number;
  x: number;
  y: number;
  /** Horizontal centre the node sways around. */
  homeX: number;
  /** Base upward drift in px/s before speed/activity modulation. */
  rise: number;
  sway: number;
  phase: number;
  radius: number;
  alpha: number;
  seed: number;
  epoch: number;
  /** Sparse, deterministic subset of nodes carries an 8-hex fingerprint tag. */
  labelled: boolean;
}

/** A faint rising mote, cheaper than a node and never linked. */
export interface Particle { x: number; y: number; speed: number; alpha: number; radius: number; seed: number; }

/**
 * Particles need a spawn counter, not just an array. Seeding a new particle
 * from `items.length` alone makes the Nth particle identical every time slot N
 * is refilled, so the field visibly repeats the same handful of x-positions.
 * `spawned` is monotonic, so every particle ever created is distinct while the
 * whole field stays a pure function of the seed.
 */
export interface ParticleField { items: Particle[]; spawned: number; }

export const createParticleField = (): ParticleField => ({ items: [], spawned: 0 });

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clampNum = (v: unknown, fallback: number, lo: number, hi: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

/**
 * Normalises anything into a valid config. `activity` is ROUNDED, not merely
 * clamped: it indexes `ACTIVITY`, so a fractional 2.7 would index `undefined`
 * and the very next property read would throw.
 */
export function normalizeConfig(p: Record<string, unknown>): MatrixConfig {
  const activity = Math.round(clampNum(p.activity, DEFAULT_CONFIG.activity, 0, 4)) as ActivityLevel;
  return {
    activity,
    density: pick(p.density, ['LOW', 'MEDIUM', 'HIGH'] as const, DEFAULT_CONFIG.density),
    speed: pick(p.speed, ['LOW', 'MEDIUM', 'HIGH'] as const, DEFAULT_CONFIG.speed),
    glow: pick(p.glow, ['LOW', 'MEDIUM', 'HIGH'] as const, DEFAULT_CONFIG.glow),
    quality: pick(p.quality, ['HIGH', 'MEDIUM', 'LOW', 'REDUCED_MOTION'] as const, DEFAULT_CONFIG.quality),
    seed: Math.floor(clampNum(p.seed, DEFAULT_CONFIG.seed, 0, 2 ** 31 - 1)),
    reducedMotion: p.reducedMotion === true,
  };
}

export function effectiveQuality(cfg: MatrixConfig): QualityLevel {
  return cfg.reducedMotion ? 'REDUCED_MOTION' : cfg.quality;
}

/** The DPR ceiling this config's effective quality allows — used by the host when sizing the canvas. */
export function dprCapFor(cfg: MatrixConfig): number {
  return QUALITY_DPR_CAP[effectiveQuality(cfg)];
}

/** Deterministic: same (width, height, cfg) ⇒ same node layout, every time. */
export function buildStreams(width: number, height: number, cfg: MatrixConfig): Stream[] {
  if (!(width > 0) || !(height > 0)) return [];
  const q = QUALITY[effectiveQuality(cfg)];
  const act = ACTIVITY[cfg.activity]!;
  const out: Stream[] = [];
  const slots = Math.max(6, Math.floor(width / 22));
  for (let L = 0; L < LAYERS.length; L++) {
    const base = LAYERS[L]!;
    const layerShare = L === 0 ? 0.5 : L === 1 ? 0.34 : 0.16;
    const count = Math.max(1, Math.round(slots * layerShare * DENSITY_MULT[cfg.density] * q.density * act.density));
    for (let i = 0; i < count; i++) {
      const rng = mulberry32(((cfg.seed * 7919) ^ (L * 104729) ^ (i * 31)) >>> 0);
      const homeX = rng() * width;
      // The initial build stands in for "the field has already been running":
      // nodes are spread over the whole viewport (plus a margin below it, never
      // above the respawn line), so a fresh mount is populated at once instead
      // of waiting for nodes to drift in.
      const y = rng() * height * 1.2;
      out.push({
        layer: L,
        x: homeX,
        y,
        homeX,
        rise: base.rise * (0.7 + rng() * 0.7),
        sway: base.sway * (0.5 + rng()),
        phase: rng() * Math.PI * 2,
        radius: base.radius * (0.8 + rng() * 0.5),
        alpha: base.alpha * (0.75 + rng() * 0.5),
        seed: (rng() * 2 ** 31) | 0,
        epoch: 0,
        labelled: i % 7 === 0,
      });
    }
  }
  return out;
}

export function hashGlyph(seed: number, epoch: number, cell: number): number {
  let h = (seed ^ Math.imul(epoch, 0x9e3779b9) ^ Math.imul(cell, 0x85ebca6b)) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

/** Unit interval derived from the same hash — one place to read a probability from. */
const hashUnit = (seed: number, epoch: number, cell: number): number => hashGlyph(seed, epoch, cell) / 4294967296;

/** The 8-hex tag a labelled node shows — a pure hash, never a real fingerprint of anything. */
export function nodeTag(node: Pick<Stream, 'seed' | 'epoch'>): string {
  return hashGlyph(node.seed, node.epoch, 0).toString(16).padStart(8, '0');
}

/** Per-node respawn with epoch-derived randomness — nodes never reset together. */
export function updateStreams(streams: Stream[], dt: number, cfg: MatrixConfig, height: number): void {
  const act = ACTIVITY[cfg.activity]!;
  const sm = SPEED_MULT[cfg.speed];
  for (const s of streams) {
    s.y -= s.rise * sm * act.speed * dt;
    s.phase += dt * 0.35 * sm;
    s.x = s.homeX + Math.sin(s.phase) * s.sway;
    if (s.y < -s.radius * 6 - 4) {
      s.epoch++;
      const rng = mulberry32((s.seed ^ Math.imul(s.epoch, 0x9e3779b9)) >>> 0);
      // Re-enter BELOW the viewport, staggered, so a node never pops in mid-screen.
      s.y = height + s.radius * 6 + rng() * height * 0.5;
      s.rise = LAYERS[s.layer]!.rise * (0.7 + rng() * 0.7);
      s.phase = rng() * Math.PI * 2;
    }
  }
}

export function updateParticles(field: ParticleField, dt: number, cfg: MatrixConfig, width: number, height: number): void {
  const act = ACTIVITY[cfg.activity]!;
  const q = QUALITY[effectiveQuality(cfg)];
  const target = Math.max(0, Math.round((width / 220) * act.particles * (q.density < 0.8 ? 0.5 : 1)));
  while (field.items.length < target) {
    const rng = mulberry32(((cfg.seed * 131) ^ Math.imul(field.spawned, 977)) >>> 0);
    field.spawned++;
    field.items.push({
      x: rng() * width,
      y: height + 10 + rng() * height * 0.3,
      speed: 12 + rng() * 20,
      alpha: 0.25 + rng() * 0.35,
      radius: 0.6 + rng() * 0.9,
      seed: (rng() * 2 ** 31) | 0,
    });
  }
  for (let i = field.items.length - 1; i >= 0; i--) {
    const p = field.items[i]!;
    p.y -= p.speed * SPEED_MULT[cfg.speed] * dt;
    if (p.y < -10) field.items.splice(i, 1);
  }
}

export interface Link { a: number; b: number; distance: number; }

/**
 * Links between neighbouring nodes: every node connects to at most `maxPerNode`
 * of its nearest neighbours within `radius`, in deterministic index order.
 * O(n²) over ~100 nodes — well under a millisecond, and it needs no spatial
 * index that would have to be rebuilt on every resize.
 */
export function linkPairs(streams: readonly Stream[], radius: number, maxPerNode: number): Link[] {
  const out: Link[] = [];
  if (maxPerNode <= 0 || streams.length < 2) return out;
  const r2 = radius * radius;
  const used = new Uint8Array(streams.length);
  for (let i = 0; i < streams.length; i++) {
    if (used[i]! >= maxPerNode) continue;
    const a = streams[i]!;
    const candidates: Link[] = [];
    for (let j = i + 1; j < streams.length; j++) {
      if (used[j]! >= maxPerNode) continue;
      const b = streams[j]!;
      const dx = a.x - b.x; const dy = a.y - b.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < r2) candidates.push({ a: i, b: j, distance: Math.sqrt(d2) });
    }
    candidates.sort((p, q) => p.distance - q.distance || p.b - q.b);
    for (const link of candidates) {
      if (used[i]! >= maxPerNode) break;
      if (used[link.b]! >= maxPerNode) continue;
      out.push(link);
      used[i]!++; used[link.b]!++;
    }
  }
  return out;
}

const layerColor = (layer: number, alpha: number): string =>
  layer === 0 ? `rgba(84,130,182,${alpha})` : layer === 1 ? `rgba(92,214,232,${alpha})` : `rgba(167,139,250,${alpha})`;

/**
 * The narrow surface the engine needs. `CanvasRenderingContext2D` satisfies it
 * structurally, so nothing casts and a test double is a plain object.
 */
export interface RenderContext {
  // Mutable properties are invariant in TypeScript, so these must match
  // `CanvasRenderingContext2D` exactly for the real context to satisfy the
  // interface structurally. The engine itself only ever assigns strings/numbers.
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  shadowBlur: number;
  shadowColor: string;
  font: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(t: string, x: number, y: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  fill(): void;
  stroke(): void;
}

function drawLinks(ctx: RenderContext, streams: readonly Stream[], maxPerNode: number, alphaScale: number): number {
  const links = linkPairs(streams, LINK_RADIUS, maxPerNode);
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1;
  for (const link of links) {
    const a = streams[link.a]!; const b = streams[link.b]!;
    const near = 1 - link.distance / LINK_RADIUS;
    const alpha = Math.min(0.5, (a.alpha + b.alpha) * 0.28 * near * alphaScale);
    if (alpha < 0.015) continue;
    ctx.strokeStyle = `rgba(92,214,232,${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  return links.length;
}

function drawNodes(ctx: RenderContext, streams: readonly Stream[], cfg: MatrixConfig, q: typeof QUALITY[QualityLevel], amberProbability: number): void {
  const glowAllowed = q.glowBlur > 0 && cfg.glow !== 'LOW';
  const glowScale = cfg.glow === 'HIGH' ? 1 : 0.6;
  let currentFont = '';
  for (const s of streams) {
    // PROBABILITY, not a multiplier: ~12% of nodes at ATTENTION, ~0 elsewhere.
    const amber = amberProbability > 0 && hashUnit(s.seed, s.epoch, 7) < amberProbability;
    const glowOn = glowAllowed && s.layer >= 1;
    if (glowOn) {
      ctx.shadowBlur = q.glowBlur * glowScale;
      ctx.shadowColor = amber ? 'rgba(255,183,110,0.55)' : s.layer === 2 ? 'rgba(167,139,250,0.5)' : 'rgba(92,214,232,0.5)';
    } else {
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = amber ? `rgba(255,214,170,${s.alpha})` : layerColor(s.layer, s.alpha);
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.fill();

    // Sporadic pulse ring — hash-driven, ~5% of nodes at HIGH quality, none at LOW.
    if (q.pulse > 0 && hashUnit(s.seed, s.epoch, 5) < q.pulse) {
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1;
      ctx.strokeStyle = layerColor(s.layer, s.alpha * 0.35);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius * 3.2, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (s.labelled) {
      ctx.shadowBlur = 0;
      const font = `10px ${MONO_FONT}`;
      if (font !== currentFont) { ctx.font = font; currentFont = font; }
      ctx.fillStyle = `rgba(178,202,230,${(s.alpha * 0.55).toFixed(3)})`;
      ctx.fillText(nodeTag(s), s.x + s.radius + 4, s.y + 3);
    }
  }
  ctx.shadowBlur = 0;
}

export function renderFrame(
  ctx: RenderContext, streams: readonly Stream[], particles: readonly Particle[],
  cfg: MatrixConfig, width: number, height: number,
): void {
  if (!(width > 0) || !(height > 0)) return;
  const q = QUALITY[effectiveQuality(cfg)];
  const act = ACTIVITY[cfg.activity]!;

  ctx.shadowBlur = 0;
  ctx.fillStyle = `rgba(10,14,28,${q.fade})`; // afterglow fade ⇒ soft motion trails
  ctx.fillRect(0, 0, width, height);

  drawLinks(ctx, streams, q.links, 1);
  drawNodes(ctx, streams, cfg, q, act.amber);

  if (particles.length > 0) {
    ctx.shadowBlur = 0;
    for (const p of particles) {
      ctx.fillStyle = `rgba(200,230,255,${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Reduced motion: ONE composed static frame — the full lattice with links,
 * nodes, tags and glow, zero motion. The host runs no animation loop at all in
 * this mode; this is drawn once per resize.
 */
export function renderStatic(ctx: RenderContext, streams: readonly Stream[], cfg: MatrixConfig, width: number, height: number): void {
  if (!(width > 0) || !(height > 0)) return;
  const q = QUALITY.REDUCED_MOTION;
  ctx.clearRect(0, 0, width, height);
  ctx.shadowBlur = 0;
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, width, height);
  drawLinks(ctx, streams, q.links, 1.2);
  drawNodes(ctx, streams, cfg, q, 0);
}
