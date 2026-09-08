/**
 * Adaptywna jakość renderowania scen 3D — jeden wspólny detektor możliwości
 * urządzenia zamiast osobnego kompromisu w każdej scenie. Cel: gęste dyski
 * akrecyjne / pola gwiazd na desktopie NIE mogą oznaczać klatkarni na
 * telefonie — patrz ARCHITECTURE.md „Sceny 3D".
 *
 * Heurystyka celowo prosta (viewport + wskaźnik dotykowy + liczba rdzeni) —
 * WebGL nie eksponuje wprost "mocy GPU"; te sygnały korelują z nią
 * wystarczająco dobrze do doboru gęstości cząstek/DPR, bez pomiaru
 * rzeczywistego FPS (który wymagałby kosztownego rozruchu próbnego).
 *
 * `'cinematic'` is a FOURTH tier, above `'high'`, for offline/capture
 * rendering (a hero screenshot, a recorded video) — NOT for real-time
 * interaction. `detectRenderTier()` NEVER returns it: there is no device
 * signal that means "the user wants a cinematic capture right now," that's
 * always an explicit request (see `graphics/postProcessing.ts`'s
 * `GraphicsPipelineOptions.qualityTier` override). It exists so a capture
 * pathway can afford AO/DOF/bigger shadow maps/more shadow casters without
 * having to sustain 60fps.
 */
export type RenderTier = 'low' | 'medium' | 'high' | 'cinematic';

/** The tiers real-time interaction can land on — `detectRenderTier()`'s return type deliberately
 * excludes `'cinematic'`, since nothing about a device's capabilities should auto-select it. */
export type InteractiveRenderTier = Exclude<RenderTier, 'cinematic'>;

export function detectRenderTier(): InteractiveRenderTier {
  if (typeof window === 'undefined') return 'medium';
  const w = window.innerWidth || 1024;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const cores = (navigator as unknown as { hardwareConcurrency?: number }).hardwareConcurrency ?? 4;
  if (coarsePointer && w < 520) return 'low';
  if (coarsePointer || w < 900 || cores <= 4) return 'medium';
  return 'high';
}

/** Skaluje liczbę cząstek/gwiazd/segmentów wg poziomu jakości. */
export function scaleCount(base: number, tier: RenderTier): number {
  const factor = tier === 'low' ? 0.35 : tier === 'medium' ? 0.65 : 1;
  return Math.max(1, Math.round(base * factor));
}

/** Górny limit devicePixelRatio wg poziomu jakości — najkosztowniejsza dźwignia (koszt ~O(dpr²)).
 * `'cinematic'` matches `'high'`'s cap: this is about matching the display's real pixel density,
 * not supersampling — a capture pathway wanting supersampling should render at a larger explicit
 * canvas size instead, a decision this function deliberately doesn't make for you. */
export function tierDpr(tier: RenderTier): number {
  const cap = tier === 'low' ? 1 : tier === 'medium' ? 1.5 : 2;
  const deviceRatio = typeof window === 'undefined' ? 1 : (window.devicePixelRatio || 1);
  return Math.min(deviceRatio, cap);
}

const TIER_RANK: Record<RenderTier, number> = { low: 0, medium: 1, high: 2, cinematic: 3 };

/**
 * Orders render tiers so an effect can express "needs at least tier X" instead of an exact-match
 * check — used by effects (DOF, AO) whose gate a caller may want to loosen after profiling their
 * own scene, without every call site re-deriving a low/medium/high/cinematic comparison by hand.
 */
export function tierAtLeast(tier: RenderTier, min: RenderTier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[min];
}

/** Czy warto włączać kosztowny post-processing (bloom itp.) na tym urządzeniu. */
export function tierAllowsBloom(tier: RenderTier): boolean {
  return tierAtLeast(tier, 'medium');
}

/**
 * Gates `atmosphere.ts`'s dust motes/light shafts (and any future particle-driven atmosphere
 * effect) — same `'medium'`+ floor as bloom, since a low-end device's real budget goes to holding a
 * stable frame rate on the geometry/materials/lighting it's already drawing, not an ambient-depth
 * cue nobody will notice is missing. `'low'` tier scenes should skip these effects entirely rather
 * than render a token few — see `quality.ts`'s own module doc: "the system must remain functional
 * on normal hardware," not "every effect always runs, just smaller."
 */
export function tierAllowsAtmosphereParticles(tier: RenderTier): boolean {
  return tierAtLeast(tier, 'medium');
}

/** Ambient occlusion (GTAO) renderuje dodatkowy przebieg normal/depth per klatkę — kosztowniejszy
 * niż bloom, więc dopuszczony dopiero od `'high'` w górę (`'high'` i `'cinematic'`). */
export function tierAllowsAO(tier: RenderTier): boolean {
  return tierAtLeast(tier, 'high');
}

/**
 * TIER1.2 — `WebGLRenderer({antialias:true})` only affects the DEFAULT framebuffer; every scene
 * that runs post-processing (see `graphics/postProcessing.ts`) renders into `EffectComposer`'s own
 * non-multisampled render targets instead, silently discarding that flag for its entire pipeline —
 * the canvas-level `antialias:true` was never reaching the pixels the user actually sees on any of
 * the 5 scenes using this pipeline. `SMAAPass` (post-process edge-detection AA) is cheap enough to
 * share bloom's `'medium'`+ floor rather than AO/DOF's pricier `'high'` floor — it's one extra
 * fullscreen pass with two small render targets, nowhere near GTAO/DOF's per-pixel depth/normal
 * pre-pass cost.
 */
export function tierAllowsAntiAliasing(tier: RenderTier): boolean {
  return tierAtLeast(tier, 'medium');
}

/**
 * Recommended shadow-map resolution per tier — the single biggest per-shadow-caster GPU/memory
 * cost lever (cost scales with the square of this number). `'low'` returns 0 as a signal to skip
 * shadow-casting entirely at that tier rather than allocate a map too small to look right.
 * `'cinematic'` doubles `'high'`'s resolution — acceptable for a single captured frame/short clip,
 * not for a sustained interactive frame rate.
 */
export function recommendedShadowMapSize(tier: RenderTier): number {
  if (tier === 'low') return 0;
  if (tier === 'medium') return 512;
  if (tier === 'high') return 1024;
  return 2048; // cinematic
}

/**
 * How many "shadow-caster budget units" a scene should spend at this tier. Expressed in units
 * rather than a light count because a shadow-casting `PointLight` costs roughly 6x a
 * `SpotLight`/`DirectionalLight` at the same map size (it renders a cube map — 6 faces instead of
 * 1) — see graphics/PERFORMANCE.md. A PointLight shadow caster spends 6 of these units; a
 * Spot/DirectionalLight spends 1. `'cinematic'` allows more casters (e.g. a hero shot wanting a
 * secondary accent shadow) since it isn't paying this cost every frame.
 */
export function maxShadowCasterBudget(tier: RenderTier): number {
  if (tier === 'low') return 0;
  if (tier === 'medium') return 1;
  if (tier === 'high') return 2;
  return 4; // cinematic
}

/** A consolidated bundle of every quality decision a rendering pipeline needs for a given tier —
 * one call instead of five, and the one place a new tier-dependent knob gets added. */
export interface GraphicsQualityProfile {
  tier: RenderTier;
  dpr: number;
  shadowMapSize: number;
  maxShadowCasterBudget: number;
  allowsBloom: boolean;
  allowsAO: boolean;
  /** DOF shares AO's cost profile (its own full-scene depth pre-pass) — see PERFORMANCE.md — so
   * it shares AO's gate by default. `setupGraphicsPipeline`'s `DepthOfFieldSettings.minTier` can
   * still loosen this per-call once profiled. */
  allowsDof: boolean;
  /** Whether `atmosphere.ts` effects (dust motes, light shafts) should run at all this tier — see
   * `tierAllowsAtmosphereParticles`. `false` at `'low'`: skip creating the effect entirely, not
   * create-it-but-tiny. */
  allowsAtmosphereParticles: boolean;
  /** Whether `setupGraphicsPipeline`'s SMAA pass should run — see `tierAllowsAntiAliasing`. */
  allowsAntiAliasing: boolean;
}

/**
 * Scales an atmosphere-effect's base particle/instance count for this tier, gated by
 * `tierAllowsAtmosphereParticles` — the one call a scene needs to go from "how many dust motes did
 * I hand-pick for my own scene" to "how many should THIS device actually get," combining
 * `scaleCount`'s density scaling with the all-or-nothing tier gate in one step. Returns 0 at a tier
 * the gate excludes, so a caller can use the result directly as `count` without a separate `if`.
 */
export function atmosphereParticleCount(base: number, tier: RenderTier): number {
  return tierAllowsAtmosphereParticles(tier) ? scaleCount(base, tier) : 0;
}

/** Resolves every tier-dependent rendering decision at once. Prefer this over calling the
 * individual `tierAllows*`/`recommended*` helpers separately when configuring a whole pipeline. */
export function configureGraphicsQuality(tier: RenderTier): GraphicsQualityProfile {
  return {
    tier,
    dpr: tierDpr(tier),
    shadowMapSize: recommendedShadowMapSize(tier),
    maxShadowCasterBudget: maxShadowCasterBudget(tier),
    allowsBloom: tierAllowsBloom(tier),
    allowsAO: tierAllowsAO(tier),
    allowsDof: tierAllowsAO(tier),
    allowsAtmosphereParticles: tierAllowsAtmosphereParticles(tier),
    allowsAntiAliasing: tierAllowsAntiAliasing(tier),
  };
}

/**
 * A user-facing quality PRESET — three named choices for a settings menu, distinct from
 * `RenderTier`'s four internal, device-detected/capture tiers above. The two vocabularies exist for
 * different audiences: `RenderTier` is what `detectRenderTier()`/`setupGraphicsPipeline` reason
 * about internally (a heuristic guess, plus the offline-capture-only `'cinematic'` tier a person
 * never picks directly); `QualityLevel` is the three choices worth actually showing a user who wants
 * to override that guess — "make it faster," "the normal default," "I want it to look as good as
 * this device can sustain in real time." This is a thin, additive naming layer: it does not change
 * what any `RenderTier` means or gates, it only maps a friendly preset onto one.
 *
 * `'CINEMATIC'` here is real-time-safe (interactive, expected to hold a frame rate) and maps to
 * `RenderTier`'s `'high'` — NOT to `RenderTier`'s own `'cinematic'` tier, which is explicitly for
 * offline/capture rendering that doesn't need to sustain 60fps (see this module's own tier doc
 * above). A caller that genuinely wants offline-capture quality (a hero screenshot, a recorded
 * video) should keep passing `'cinematic'` (the `RenderTier`) to `setupGraphicsPipeline`'s
 * `qualityTier` directly, not go through this preset layer.
 */
export type QualityLevel = 'PERFORMANCE' | 'BALANCED' | 'CINEMATIC';

const QUALITY_LEVEL_TIER: Record<QualityLevel, InteractiveRenderTier> = {
  PERFORMANCE: 'low',
  BALANCED: 'medium',
  CINEMATIC: 'high',
};

/** Maps a user-facing `QualityLevel` preset to the `RenderTier` the rest of the pipeline actually
 * reasons about. */
export function resolveQualityLevel(level: QualityLevel): InteractiveRenderTier {
  return QUALITY_LEVEL_TIER[level];
}

/** `configureGraphicsQuality`, addressed by the friendly `QualityLevel` preset instead of a raw
 * `RenderTier` — the one call a settings menu needs for "the user picked BALANCED, give me every
 * quality knob for that." */
export function configureGraphicsQualityForLevel(level: QualityLevel): GraphicsQualityProfile {
  return configureGraphicsQuality(resolveQualityLevel(level));
}
