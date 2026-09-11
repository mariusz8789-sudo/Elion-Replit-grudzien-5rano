/**
 * MATRIX ENGINE — pure, framework-agnostic procedural "data field" renderer.
 *
 * Zero React, zero DOM, zero Genesis imports. Everything here is a pure
 * function over plain data plus one narrow `RenderContext` the caller supplies
 * (the real `CanvasRenderingContext2D` satisfies it structurally). That is what
 * makes the whole engine testable in a plain Node test runner — this repo has
 * no jsdom and no @testing-library, so a component that hides its logic behind
 * React lifecycle is a component nobody here can actually test.
 *
 * DETERMINISM, stated precisely so the claim is checkable: the same
 * `(width, height, config)` always produces the same stream LAYOUT, and glyph
 * selection is a pure hash of `(streamSeed, epoch, cell)`. Frame TIMING is not
 * part of that guarantee — `dt` comes from the host clock — but nothing about
 * layout or glyph choice consults a clock or `Math.random()`.
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
 * the test asserts they agree — previously this table existed only as inline
 * literals inside the resize path, so the two could silently diverge.
 */
export const QUALITY_DPR_CAP = {
  HIGH: 2,
  MEDIUM: 1.75,
  LOW: 1.25,
  REDUCED_MOTION: 1.5,
} as const satisfies Record<QualityLevel, number>;

/**
 * Per-activity modulation. `amber` is a PROBABILITY in [0,1] applied per
 * stream — 0.12 means roughly one stream in eight picks up the amber accent,
 * which is what "subtle ATTENTION signal" means. It is never a multiplier.
 */
const ACTIVITY: readonly { speed: number; density: number; particles: number; amber: number }[] = [
  { speed: 0.55, density: 0.6, particles: 0.15, amber: 0 },
  { speed: 1.0, density: 1.0, particles: 0.4, amber: 0 },
  { speed: 1.15, density: 1.2, particles: 0.7, amber: 0 },
  { speed: 1.45, density: 1.45, particles: 1.1, amber: 0 },
  { speed: 1.2, density: 1.25, particles: 0.9, amber: 0.12 },
];

const DENSITY_MULT: Record<DensityLevel, number> = { LOW: 0.55, MEDIUM: 1, HIGH: 1.6 };
const SPEED_MULT: Record<SpeedLevel, number> = { LOW: 0.6, MEDIUM: 1, HIGH: 1.5 };

/** `flicker`, like `amber`, is a probability in [0,1] — not a multiplier. */
const QUALITY: Record<QualityLevel, { density: number; fade: number; glowBlur: number; dprCap: number; flicker: number }> = {
  HIGH: { density: 1, fade: 0.14, glowBlur: 9, dprCap: QUALITY_DPR_CAP.HIGH, flicker: 0.05 },
  MEDIUM: { density: 0.8, fade: 0.18, glowBlur: 6, dprCap: QUALITY_DPR_CAP.MEDIUM, flicker: 0.03 },
  LOW: { density: 0.55, fade: 0.26, glowBlur: 0, dprCap: QUALITY_DPR_CAP.LOW, flicker: 0 },
  REDUCED_MOTION: { density: 0.7, fade: 1, glowBlur: 5, dprCap: QUALITY_DPR_CAP.REDUCED_MOTION, flicker: 0 },
};

/** Depth: BACKGROUND (slow, dim, deep) → MIDGROUND (the main field) → FOREGROUND (sparse, sharp). */
const LAYERS = [
  { fs: 10, alpha: 0.26, speed: 26 },
  { fs: 14, alpha: 0.5, speed: 58 },
  { fs: 18, alpha: 0.85, speed: 104 },
] as const;

const GLYPH_SETS = [
  'ｱｲｳｴｵｶｷｸｹｺｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ0123456789',
  '0123456789ABCDEF⟨⟩∆∇≈≠∑πλμσ∫',
  'XYZMRGBHVNTKSFWD0123456789',
] as const;

const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export interface Stream {
  layer: number; x: number; y: number; speed: number; fontSize: number; cells: number;
  alpha: number; set: number; seed: number; epoch: number; headBright: number;
}

export interface Particle { x: number; y: number; speed: number; alpha: number; glyph: string; seed: number; }

/**
 * Particles need a spawn counter, not just an array. Seeding a new particle
 * from `items.length` alone makes the Nth particle identical every time slot N
 * is refilled, so the field visibly repeats the same handful of x-positions —
 * an aesthetic bug that reads as "looping GIF", the opposite of an organic
 * data field. `spawned` is monotonic, so every particle ever created is
 * distinct while the whole field stays a pure function of the seed.
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
 * and the very next property read would throw. Clamping alone left that hole.
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

/** Deterministic: same (width, height, cfg) ⇒ same stream layout, every time. */
export function buildStreams(width: number, height: number, cfg: MatrixConfig): Stream[] {
  if (!(width > 0) || !(height > 0)) return [];
  const q = QUALITY[effectiveQuality(cfg)];
  const act = ACTIVITY[cfg.activity]!;
  const out: Stream[] = [];
  for (let L = 0; L < LAYERS.length; L++) {
    const base = LAYERS[L]!;
    const step = base.fs * 1.35;
    const cols = Math.max(4, Math.floor(width / step));
    const layerShare = L === 0 ? 0.5 : L === 1 ? 0.34 : 0.16;
    const count = Math.round(cols * layerShare * DENSITY_MULT[cfg.density] * q.density * act.density);
    for (let i = 0; i < count; i++) {
      const rng = mulberry32(((cfg.seed * 7919) ^ (L * 104729) ^ (i * 31)) >>> 0);
      const col = Math.floor(rng() * cols);
      const cells = Math.round((L === 0 ? 8 : L === 1 ? 12 : 16) + rng() * (L === 0 ? 10 : L === 1 ? 16 : 22));
      out.push({
        layer: L,
        x: col * step,
        // Staggered starts: the field is never born on one horizontal line.
        y: -rng() * height * 1.6 - cells * base.fs * 0.5,
        speed: base.speed * (0.6 + rng() * 0.9),
        fontSize: base.fs,
        cells,
        alpha: base.alpha * (0.75 + rng() * 0.5),
        set: Math.floor(rng() * GLYPH_SETS.length),
        seed: (rng() * 2 ** 31) | 0,
        epoch: 0,
        headBright: 0.55 + rng() * 0.45,
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

/** Per-stream respawn with epoch-derived randomness — streams never reset together. */
export function updateStreams(streams: Stream[], dt: number, cfg: MatrixConfig, height: number): void {
  const act = ACTIVITY[cfg.activity]!;
  const sm = SPEED_MULT[cfg.speed];
  for (const s of streams) {
    s.y += s.speed * sm * act.speed * dt;
    const tail = s.y - s.cells * s.fontSize;
    if (tail > height) {
      s.epoch++;
      const rng = mulberry32((s.seed ^ Math.imul(s.epoch, 0x9e3779b9)) >>> 0);
      s.y = -s.cells * s.fontSize - rng() * height * 0.6;
      s.speed = LAYERS[s.layer]!.speed * (0.6 + rng() * 0.9);
    }
  }
}

export function updateParticles(field: ParticleField, dt: number, cfg: MatrixConfig, width: number, height: number): void {
  const act = ACTIVITY[cfg.activity]!;
  const q = QUALITY[effectiveQuality(cfg)];
  const target = Math.max(0, Math.round((width / 220) * act.particles * (q.density < 0.8 ? 0.5 : 1)));
  const set = GLYPH_SETS[1];
  while (field.items.length < target) {
    const rng = mulberry32(((cfg.seed * 131) ^ Math.imul(field.spawned, 977)) >>> 0);
    field.spawned++;
    field.items.push({
      x: rng() * width,
      y: -20 - rng() * height * 0.3,
      speed: 14 + rng() * 22,
      alpha: 0.35 + rng() * 0.4,
      glyph: set[Math.floor(rng() * set.length)]!,
      seed: (rng() * 2 ** 31) | 0,
    });
  }
  for (let i = field.items.length - 1; i >= 0; i--) {
    const p = field.items[i]!;
    p.y += p.speed * SPEED_MULT[cfg.speed] * dt;
    if (p.y > height + 20) field.items.splice(i, 1);
  }
}

const layerColor = (layer: number, alpha: number): string =>
  layer === 0 ? `rgba(14,122,65,${alpha})` : layer === 1 ? `rgba(31,175,94,${alpha})` : `rgba(90,230,150,${alpha})`;

/**
 * The narrow surface the engine needs. `CanvasRenderingContext2D` satisfies it
 * structurally, so nothing casts and a test double is a plain object.
 */
export interface RenderContext {
  // Mutable properties are invariant in TypeScript, so this must match
  // `CanvasRenderingContext2D` exactly for the real context to satisfy the
  // interface structurally. The engine itself only ever assigns strings.
  fillStyle: string | CanvasGradient | CanvasPattern;
  shadowBlur: number;
  shadowColor: string;
  font: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(t: string, x: number, y: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
}

export function renderFrame(
  ctx: RenderContext, streams: readonly Stream[], particles: readonly Particle[],
  cfg: MatrixConfig, width: number, height: number,
): void {
  if (!(width > 0) || !(height > 0)) return;
  const q = QUALITY[effectiveQuality(cfg)];
  const act = ACTIVITY[cfg.activity]!;

  ctx.shadowBlur = 0;
  ctx.fillStyle = `rgba(2,6,4,${q.fade})`; // trail fade ⇒ smooth column falloff
  ctx.fillRect(0, 0, width, height);

  // Font changes are state changes on the 2D context; streams are grouped by
  // layer in `buildStreams`, so tracking the last value skips almost all of them.
  let currentFont = '';
  const glowAllowed = q.glowBlur > 0 && cfg.glow !== 'LOW';
  const glowScale = cfg.glow === 'HIGH' ? 1 : 0.6;

  for (const s of streams) {
    const set = GLYPH_SETS[s.set]!;
    const headCell = Math.floor(s.y / s.fontSize);
    // PROBABILITY, not a multiplier: ~12% of streams at ATTENTION, ~0 elsewhere.
    const amber = act.amber > 0 && hashUnit(s.seed, s.epoch, 7) < act.amber;
    const glowOn = glowAllowed && s.layer >= 1;

    const font = `${s.fontSize}px ${MONO_FONT}`;
    if (font !== currentFont) { ctx.font = font; currentFont = font; }

    if (glowOn) {
      ctx.shadowBlur = q.glowBlur * glowScale;
      ctx.shadowColor = amber ? 'rgba(255,183,110,0.5)' : 'rgba(57,217,122,0.55)';
    }

    const headAlpha = Math.min(1, s.alpha * s.headBright + (s.layer === 2 ? 0.2 : 0.05));
    ctx.fillStyle = amber
      ? `rgba(255,214,170,${headAlpha})`
      : s.layer === 2 && s.headBright > 0.92
        ? `rgba(224,255,240,${headAlpha})` // sporadic near-white scientific highlight
        : layerColor(s.layer, headAlpha);
    ctx.fillText(set[hashGlyph(s.seed, s.epoch, headCell) % set.length]!, s.x, s.y);

    ctx.shadowBlur = 0;
    ctx.fillStyle = layerColor(s.layer, s.alpha * 0.55);
    ctx.fillText(set[hashGlyph(s.seed, s.epoch, headCell - 1) % set.length]!, s.x, s.y - s.fontSize);

    // Sporadic dim mutation deeper in the trail — organic, hash-driven, ~5% of streams.
    if (q.flicker > 0 && hashUnit(s.seed, s.epoch, headCell - 5) < q.flicker) {
      ctx.fillStyle = layerColor(s.layer, s.alpha * 0.3);
      ctx.fillText(set[hashGlyph(s.seed, s.epoch + 1, headCell - 4) % set.length]!, s.x, s.y - s.fontSize * 4);
    }
  }

  if (particles.length > 0) {
    const particleFont = `12px ${MONO_FONT}`;
    if (particleFont !== currentFont) ctx.font = particleFont; // last font change of the frame
    if (glowAllowed) { ctx.shadowBlur = q.glowBlur; ctx.shadowColor = 'rgba(160,255,200,0.5)'; }
    for (const p of particles) {
      ctx.fillStyle = `rgba(220,255,236,${p.alpha})`;
      ctx.fillText(p.glyph, p.x, p.y);
    }
    ctx.shadowBlur = 0;
  }
}

/**
 * Reduced motion: ONE composed static frame — full columns with gradient
 * falloff so the depth layering still reads, glow kept, zero motion. The host
 * runs no animation loop at all in this mode; this is drawn once per resize.
 */
export function renderStatic(ctx: RenderContext, streams: readonly Stream[], cfg: MatrixConfig, width: number, height: number): void {
  if (!(width > 0) || !(height > 0)) return;
  const q = QUALITY.REDUCED_MOTION;
  ctx.clearRect(0, 0, width, height);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#020604';
  ctx.fillRect(0, 0, width, height);

  const glowAllowed = q.glowBlur > 0 && cfg.glow !== 'LOW';
  let currentFont = '';

  for (const s of streams) {
    const set = GLYPH_SETS[s.set]!;
    const headCell = Math.floor(s.y / s.fontSize);
    const font = `${s.fontSize}px ${MONO_FONT}`;
    if (font !== currentFont) { ctx.font = font; currentFont = font; }

    for (let i = s.cells; i >= 1; i--) {
      const t = 1 - i / s.cells;
      const alpha = s.alpha * Math.pow(t, 1.6);
      if (alpha < 0.02) continue;
      ctx.fillStyle = layerColor(s.layer, alpha);
      ctx.fillText(set[hashGlyph(s.seed, s.epoch, headCell - i) % set.length]!, s.x, s.y - i * s.fontSize);
    }

    if (glowAllowed && s.layer >= 1) {
      ctx.shadowBlur = q.glowBlur;
      ctx.shadowColor = 'rgba(57,217,122,0.5)';
    }
    ctx.fillStyle = `rgba(216,255,230,${Math.min(1, s.alpha * s.headBright + 0.2)})`;
    ctx.fillText(set[hashGlyph(s.seed, s.epoch, headCell) % set.length]!, s.x, s.y);
    ctx.shadowBlur = 0;
  }
}
