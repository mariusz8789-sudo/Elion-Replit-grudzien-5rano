import type * as THREE_NS from 'three';

/**
 * GENESIS GRAPHICS RUNTIME — Fire VFX
 *
 * A real-time flame + smoke particle effect, closing a genuinely embarrassing gap: two separate C3
 * solvers model fire as a real physical process (`wildfireSpread.ts`'s Rothermel/MTT surface-fire
 * spread, `fireThermal.ts`'s t-squared point-source heat-release-rate curve) and, before this file,
 * `core/three/` had no flame or smoke of any kind — a fire the science genuinely computes, rendered
 * as a flat color heatmap and nothing else.
 *
 * DOMAIN-BLIND BY CONSTRUCTION (`graphicsArchitectureBoundary.test.ts` forbids `graphics/**` from
 * importing `worldModel/**`): this module takes a plain `origin` and two already-real, already-
 * caller-normalized numbers (`flameHeightM`, `intensity`) — it has no idea what a Rothermel model,
 * a fireline, or a heat-release-rate curve is. The caller (a scene file, outside `graphics/`) reads
 * its own domain solver's real output and passes real numbers through; nothing here fabricates a
 * confidence value or invents a fire that wasn't asked for.
 *
 * TECHNIQUE: individual `THREE.Sprite`s (not `THREE.Points`) — deliberately, unlike `atmosphere.ts`'s
 * dust motes. A dust cloud needs hundreds of motes cheaply in one draw call; a single fire needs a
 * few dozen particles with genuinely independent per-particle opacity/scale animation (a flame
 * brightens and thins as it rises, a smoke puff dims and EXPANDS as it disperses) — behavior
 * `PointsMaterial`'s single scene-wide size/opacity can't express without a custom shader. At this
 * particle count (tens, not hundreds), the extra draw calls cost nothing real-time-relevant; a
 * bespoke shader would be solving a scaling problem this effect doesn't have.
 *
 * Two procedural radial-gradient textures (flame: hot core fading to transparent edge; smoke: a
 * softer, wider grey blob) are generated once via canvas and shared (`.clone()`) across every
 * `createFireVfx` call in a session — the same canvas-texture-generation and sharing convention
 * `materials.ts`'s `brushedMetalFactory` and `atmosphere.ts`'s light-shaft gradient already use.
 */

/** Cheap deterministic PRNG (mulberry32) — same convention as `atmosphere.ts`/`materials.ts`: a
 * fixed seed so particle placement doesn't reshuffle on hot reload / StrictMode double-invoke. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let sharedFlameTexture: THREE_NS.Texture | null = null;
let sharedSmokeTexture: THREE_NS.Texture | null = null;

function makeRadialGradientTexture(THREE: typeof THREE_NS, stops: readonly { at: number; rgba: readonly [number, number, number, number] }[]): THREE_NS.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const stop of stops) {
    const [r, g, b, a] = stop.rgba;
    gradient.addColorStop(stop.at, `rgba(${r},${g},${b},${a})`);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

function getFlameTexture(THREE: typeof THREE_NS): THREE_NS.Texture {
  if (!sharedFlameTexture) {
    sharedFlameTexture = makeRadialGradientTexture(THREE, [
      { at: 0, rgba: [255, 255, 235, 1] },
      { at: 0.35, rgba: [255, 200, 80, 0.85] },
      { at: 0.7, rgba: [255, 110, 30, 0.35] },
      { at: 1, rgba: [255, 60, 0, 0] },
    ]);
  }
  return sharedFlameTexture;
}

function getSmokeTexture(THREE: typeof THREE_NS): THREE_NS.Texture {
  if (!sharedSmokeTexture) {
    sharedSmokeTexture = makeRadialGradientTexture(THREE, [
      { at: 0, rgba: [120, 116, 110, 0.55] },
      { at: 0.5, rgba: [90, 88, 85, 0.3] },
      { at: 1, rgba: [70, 68, 66, 0] },
    ]);
  }
  return sharedSmokeTexture;
}

interface FlameParticle {
  sprite: THREE_NS.Sprite;
  life: number;
  maxLife: number;
  angle: number;
  radius: number;
  baseScale: number;
}

interface SmokeParticle {
  sprite: THREE_NS.Sprite;
  life: number;
  maxLife: number;
  angle: number;
  radius: number;
  baseScale: number;
  riseHeightM: number;
}

export interface FireVfxOptions {
  /** World-space point the flame/smoke rises from — the real ignition/source point the caller's
   * own domain solver identifies, never invented. */
  origin: THREE_NS.Vector3Tuple;
  /** Real flame length in metres (the caller's own solver output, e.g. `WildfireSpreadResult.
   * headFlameLengthM` or a `fireThermal.ts` curve's implied length) — sets how high flame particles
   * actually rise before fading. Not a fabricated visual constant. */
  flameHeightM: number;
  /** 0..1, clamped — the caller's own real scalar normalized against a reference IT chooses (e.g. a
   * fireline intensity or HRR fraction of some stated maximum). This module has no notion of kW/m
   * or kW; it only knows "brighter/faster" at one end and "dimmer/slower" at the other. */
  intensity: number;
  /** Smoke rises to `flameHeightM * smokeHeightMultiplier` above the flame's own top. Default 5. */
  smokeHeightMultiplier?: number;
  flameParticleCount?: number;
  smokeParticleCount?: number;
  /** Base horizontal jitter radius, metres — how far particles wander from `origin`'s vertical axis.
   * Default `max(0.6, flameHeightM * 0.18)`, so a taller (more real-intense) fire also reads wider. */
  spreadRadiusM?: number;
  seed?: number;
}

export interface FireVfxHandle {
  readonly group: THREE_NS.Group;
  /** Advances flame flicker/rise and smoke drift/expansion by `dt` seconds. */
  update(dt: number): void;
  /** Retunes brightness/flicker speed for a new real intensity value without rebuilding particles —
   * call when the caller's own solver reports a changed real reading. */
  setIntensity(intensity: number): void;
  dispose(): void;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * Builds one real-time flame + smoke effect at `origin`, scaled by the caller's real
 * `flameHeightM`/`intensity`. Two independent particle pools (flame: fast rise, brightens near the
 * base then fades near the tip; smoke: slow rise, starts near the flame's own top, expands and dims
 * as it disperses) share one parent `THREE.Group` so a caller adds/removes/positions the whole
 * effect as one object.
 */
export function createFireVfx(THREE: typeof THREE_NS, options: FireVfxOptions): FireVfxHandle {
  if (!(options.flameHeightM > 0)) throw new Error(`createFireVfx: flameHeightM must be > 0 (got ${options.flameHeightM})`);
  const flameHeightM = options.flameHeightM;
  let intensity = clamp01(options.intensity);
  const smokeHeightM = flameHeightM * (options.smokeHeightMultiplier ?? 5);
  const spreadRadiusM = options.spreadRadiusM ?? Math.max(0.6, flameHeightM * 0.18);
  const rand = mulberry32(options.seed ?? 0x5f3759df);

  const flameCount = Math.max(4, Math.round(options.flameParticleCount ?? 18));
  const smokeCount = Math.max(3, Math.round(options.smokeParticleCount ?? 10));

  const flameTexture = getFlameTexture(THREE);
  const smokeTexture = getSmokeTexture(THREE);

  const group = new THREE.Group();
  group.name = 'genesis-fire-vfx';
  group.position.set(...options.origin);

  const flameParticles: FlameParticle[] = [];
  for (let i = 0; i < flameCount; i++) {
    const material = new THREE.SpriteMaterial({
      map: flameTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const sprite = new THREE.Sprite(material);
    group.add(sprite);
    flameParticles.push({
      sprite,
      life: rand(), // staggered start so the whole flame doesn't pulse in lockstep
      maxLife: 0.5 + rand() * 0.4,
      angle: rand() * Math.PI * 2,
      radius: rand() * spreadRadiusM * 0.5,
      baseScale: flameHeightM * (0.22 + rand() * 0.16),
    });
  }

  const smokeParticles: SmokeParticle[] = [];
  for (let i = 0; i < smokeCount; i++) {
    const material = new THREE.SpriteMaterial({
      map: smokeTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    const sprite = new THREE.Sprite(material);
    group.add(sprite);
    smokeParticles.push({
      sprite,
      life: rand(),
      maxLife: 2.5 + rand() * 2,
      angle: rand() * Math.PI * 2,
      radius: rand() * spreadRadiusM,
      baseScale: flameHeightM * (0.4 + rand() * 0.3),
      riseHeightM: smokeHeightM * (0.7 + rand() * 0.3),
    });
  }

  function stepFlame(p: FlameParticle, dt: number): void {
    p.life += dt;
    if (p.life >= p.maxLife) p.life -= p.maxLife;
    const t = p.life / p.maxLife; // 0 (just spawned, at the base) -> 1 (about to respawn, at the tip)
    const wobble = Math.sin((p.life + p.angle) * 9) * 0.06 * spreadRadiusM;
    p.sprite.position.set(
      Math.cos(p.angle) * p.radius + wobble,
      t * flameHeightM,
      Math.sin(p.angle) * p.radius + wobble,
    );
    // Brightest low and early (near the base, where a real flame's reaction zone sits), fading out
    // approaching the tip — never fully opaque at intensity 0, never fully hidden at intensity 1.
    const fade = 1 - t * t;
    const opacity = clamp01(fade * (0.25 + 0.75 * intensity));
    p.sprite.material.opacity = opacity;
    const scale = p.baseScale * (1 - 0.35 * t) * (0.7 + 0.3 * intensity);
    p.sprite.scale.set(scale, scale, 1);
  }

  function stepSmoke(p: SmokeParticle, dt: number): void {
    p.life += dt;
    if (p.life >= p.maxLife) p.life -= p.maxLife;
    const t = p.life / p.maxLife;
    const drift = Math.sin((p.life * 0.6 + p.angle) * 2) * spreadRadiusM * 0.8 * t;
    p.sprite.position.set(
      Math.cos(p.angle) * (p.radius + drift),
      flameHeightM * 0.6 + t * p.riseHeightM,
      Math.sin(p.angle) * (p.radius + drift),
    );
    // Smoke fades in as it clears the flame, peaks mid-rise, then disperses — the opposite scale
    // curve from flame (grows, not shrinks) as it clears and spreads into the air.
    const fade = Math.sin(Math.PI * clamp01(t)); // 0 at spawn, 1 at mid-life, 0 at despawn
    p.sprite.material.opacity = clamp01(fade * (0.15 + 0.35 * intensity));
    const scale = p.baseScale * (0.6 + 1.4 * t);
    p.sprite.scale.set(scale, scale, 1);
  }

  return {
    group,
    update(dt: number) {
      for (const p of flameParticles) stepFlame(p, dt);
      for (const p of smokeParticles) stepSmoke(p, dt);
    },
    setIntensity(next: number) {
      intensity = clamp01(next);
    },
    dispose() {
      for (const p of flameParticles) p.sprite.material.dispose();
      for (const p of smokeParticles) p.sprite.material.dispose();
    },
  };
}
