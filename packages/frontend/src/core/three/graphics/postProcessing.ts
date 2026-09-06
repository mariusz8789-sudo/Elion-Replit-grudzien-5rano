import type * as THREE_NS from 'three';
import type { PostProcessingModules, PostProcessor } from '../types';
import { detectRenderTier, tierAllowsAO, tierAllowsBloom, tierAtLeast, type RenderTier } from '../quality';
import { applyAmbientIBL } from './lighting';

/**
 * GENESIS GRAPHICS RUNTIME — Screen-Space Reflections (investigation + opt-in pass)
 *
 * Glass and metal reflections in this pipeline are already handled by two
 * cheap, proven, real-time techniques: `MeshPhysicalMaterial`'s own
 * transmission/clearcoat model, and the AMBIENT/IBL role's PMREM
 * environment map (`applyAmbientIBL`). Neither needs a screen-space pass,
 * and both stay correct on curved surfaces (a cylinder vessel, a domed
 * cap) where SSR historically struggles (screen-space ray marching loses
 * off-screen and grazing-angle geometry, and curved surfaces expose those
 * gaps constantly as the camera moves).
 *
 * What SSR adds ON TOP of that: reflections of OTHER SCENE OBJECTS on flat-
 * ish opaque surfaces — a polished floor showing the reactor's silhouette,
 * a metal panel catching a neighboring light. That's a real, visible
 * upgrade for "deep laboratory environments" (task priority #6), but it
 * costs its own normal+depth+metalness pre-passes and a blur pass — a
 * similar order of cost to GTAO, on top of GTAO. Given no real GPU is
 * available in this sandbox to verify SSR's actual visual quality/artifact
 * behavior (it is known to show noise/streaking on some hardware/angles),
 * this is wired as OPT-IN, OFF BY DEFAULT, and gated to the `'cinematic'`
 * tier — a deliberate choice to make the capability available without
 * claiming it's production-verified. Test on real hardware before shipping
 * it enabled anywhere.
 */
export interface ScreenSpaceReflectionSettings {
  enabled: boolean;
  /** 0..1 friendly strength knob for the reflection blend — maps to SSRPass's `opacity`. Default 0.6. */
  strength?: number;
  /** Max ray-march distance in world units — how far a reflection ray searches before giving up.
   * Default 6 (suits a room-scale facility; raise for a much larger space). */
  maxDistance?: number;
  /** Default `'cinematic'` — SSR's extra pre-passes are pricier than AO's; see the module doc
   * above. Loosen only after verifying quality AND cost on real hardware. */
  minTier?: RenderTier;
}

/**
 * GENESIS GRAPHICS RUNTIME — Post-Processing Pipeline
 *
 * Renderer configuration (shadows, tone mapping, color space) + environment
 * (IBL) + the EffectComposer chain. The previous pipeline explicitly SKIPPED
 * ambient occlusion with a comment explaining that three.js's `SSAOPass`
 * fought the ACES tone mapping / OutputPass ordering and blew the frame out
 * to white.
 *
 * FIX: `GTAOPass` (available in this three.js version) blends its AO term
 * directly into the beauty render target using `CustomBlending`, which
 * happens INSIDE the composer's linear-HDR chain — i.e. strictly before
 * `OutputPass` performs tone mapping / color-space conversion. Placing it
 * right after `RenderPass` and before the bloom pass means AO darkens the
 * scene in the same linear space the renderer already tone-maps from, so it
 * composes correctly instead of racing the tone-mapper. Gated to the 'high'
 * render tier (`tierAllowsAO`) since GTAO's normal/depth pre-pass is
 * meaningfully more expensive than bloom.
 *
 * DEPTH OF FIELD: `depthOfField` is OPT-IN and OFF by default — omitting it,
 * or passing `{ enabled: false }`, preserves today's exact rendering (no
 * behavior change, no regression risk for the current lab). A caller that
 * knows the right focus distance for a given shot (e.g. a fixed cinematic
 * camera looking at the hero apparatus) sets `enabled: true` and
 * `focusDistance` to get a subtle Bokeh pass. This module never guesses a
 * focus distance itself — that's scene-composition knowledge it
 * deliberately doesn't have. See `DepthOfFieldSettings` below for the full
 * API (blur strength, advanced overrides, per-effect quality-tier floor).
 */
export interface DepthOfFieldSettings {
  /** Master on/off switch. `false` (or omitting `depthOfField` entirely) is a strict no-op —
   * the exact behavior of every existing caller today. */
  enabled: boolean;
  /** World-space distance from the camera that should be in sharp focus (meters). Required
   * when `enabled`; ignored otherwise. Retune at runtime via `GraphicsPipeline.setFocusDistance`. */
  focusDistance: number;
  /**
   * Friendly 0..1 knob for how strong the out-of-focus blur is — 0 is barely perceptible, 1 is a
   * strong "macro lens" look. Default 0.4 (a subtle cinematic falloff, not a gimmick blur). Maps
   * internally to BokehPass's `aperture`/`maxblur` uniforms; see `resolveBokehUniforms`.
   */
  blurStrength?: number;
  /** Advanced: overrides the `blurStrength` mapping and sets BokehPass's raw `aperture` uniform
   * directly. BokehPass has no physical "focal length" control — `aperture` (how quickly things
   * blur away from focus) is the closest equivalent, so this is that knob for callers who need
   * precise control instead of the friendly 0..1 proxy. */
  aperture?: number;
  /** Advanced: overrides the `blurStrength` mapping and sets BokehPass's raw `maxblur` uniform
   * (the blur radius cap in screen-space UV units) directly. */
  maxBlur?: number;
  /**
   * DOF renders its own full-scene depth pre-pass (`MeshDepthMaterial`), comparable in cost to
   * GTAO's normal pre-pass — see graphics/PERFORMANCE.md. Default gate is `'high'` tier, same as
   * AO. Loosen to `'medium'` only after profiling your own scene; this module won't guess for you.
   */
  minTier?: RenderTier;
}

/** Maps `DepthOfFieldSettings`'s friendly `blurStrength` (0..1) to BokehPass's raw
 * `aperture`/`maxblur` uniforms — exported so the world-builder (or a test) can inspect exactly
 * what a given `blurStrength` produces without constructing a whole pipeline. */
export function resolveBokehUniforms(settings: Pick<DepthOfFieldSettings, 'focusDistance' | 'blurStrength' | 'aperture' | 'maxBlur'>): { focus: number; aperture: number; maxblur: number } {
  const strength = Math.max(0, Math.min(1, settings.blurStrength ?? 0.4));
  const aperture = settings.aperture ?? (0.004 + strength * (0.035 - 0.004));
  const maxblur = settings.maxBlur ?? (0.002 + strength * (0.018 - 0.002));
  return { focus: settings.focusDistance, aperture, maxblur };
}

/**
 * Named entry point for building a `DepthOfFieldSettings` value (the requested `configureDOF(...)`
 * API) — a thin, validated builder over the plain interface literal. Functionally identical to
 * writing the object yourself; exists so "configure DOF" is a discoverable function call rather
 * than something you only find by reading the `DepthOfFieldSettings` type.
 */
export function configureDOF(opts: {
  focusDistance: number;
  enabled?: boolean;
  blurStrength?: number;
  aperture?: number;
  maxBlur?: number;
  minTier?: RenderTier;
}): DepthOfFieldSettings {
  if (opts.focusDistance <= 0) {
    throw new Error(`configureDOF: focusDistance must be > 0 (got ${opts.focusDistance})`);
  }
  return {
    enabled: opts.enabled ?? true,
    focusDistance: opts.focusDistance,
    blurStrength: opts.blurStrength,
    aperture: opts.aperture,
    maxBlur: opts.maxBlur,
    minTier: opts.minTier,
  };
}

export interface GraphicsPipelineOptions {
  scene: THREE_NS.Scene;
  camera: THREE_NS.PerspectiveCamera;
  width: number;
  height: number;
  toneMappingExposure?: number;
  bloom?: { strength: number; radius: number; threshold: number };
  depthOfField?: DepthOfFieldSettings;
  /** Screen-space reflections — see the module doc above. Opt-in, off by default. */
  reflections?: ScreenSpaceReflectionSettings;
  /**
   * Forces a specific quality tier instead of `detectRenderTier()`'s device heuristic — the hook
   * a screenshot/video capture pathway uses to request `'cinematic'` quality regardless of what
   * the interactive device signals suggest. Omit for normal interactive rendering.
   */
  qualityTier?: RenderTier;
  /**
   * Forwarded to `graphics/lighting.ts`'s `applyAmbientIBL`/`loadHdriEnvironment` as their race
   * guard. Only needed when the caller installs its OWN, better environment map after this
   * pipeline is set up (e.g. a scene-specific room-reflection probe captured after the first
   * frame) — without it, the generic HDRI load could finish later and silently clobber that
   * better environment. Omit for the common case (no such upgrade); the HDRI always applies.
   */
  ambientHdriGuard?: () => boolean;
}

/** `PostProcessor` plus hooks for retuning DOF at runtime — a strict superset, so it still
 * satisfies `Sim3D.setupPostProcessing`'s declared `PostProcessor` return type. */
export interface GraphicsPipeline extends PostProcessor {
  setFocusDistance(distance: number): void;
  /**
   * Toggles the Bokeh blur on/off per shot without rebuilding the composer — a no-op when DOF
   * wasn't enabled at setup. For a camera that cuts between framings (a wide establishing shot,
   * a tight hero close-up, a first-person POV), only SOME of those framings want shallow depth of
   * field: cinematography convention (and this engine's own `cinematicCamera.ts` profiles) keeps
   * wide/establishing and POV shots sharp end-to-end, reserving DOF for close/hero framings where
   * it reads as intentional rather than as a rendering glitch blurring the room the viewer is
   * trying to read.
   */
  setDepthOfFieldEnabled(enabled: boolean): void;
}

export function setupGraphicsPipeline(
  THREE: typeof THREE_NS,
  modules: PostProcessingModules,
  renderer: THREE_NS.WebGLRenderer,
  opts: GraphicsPipelineOptions,
): GraphicsPipeline {
  const { scene, camera, width, height } = opts;
  const bloomTuning = opts.bloom ?? { strength: 0.34, radius: 0.5, threshold: 0.92 };

  // Mapa cieni: fundament głębi przestrzennej (OBIEKT -> CIEŃ -> PODŁOGA -> PRZESŁONIĘCIE ->
  // GŁĘBIA). PCFSoft: miękka krawędź bez kosztu VSM. Jedyny shadow caster to keyLight (patrz
  // graphics/lighting.ts) — jedna mapa 1024².
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Ekspozycja podniesiona razem z obniżonym wypełnieniem ambientowym: ciemniejsze tło +
  // jaśniejsze źródła kierunkowe dają filmowy kontrast zamiast płaskiej, jednolitej jasności.
  renderer.toneMappingExposure = opts.toneMappingExposure ?? 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // AMBIENT/IBL role (graphics/lighting.ts): procedural studio env immediately + optional
  // approved HDRI upgrade in the background — metal must have something to reflect, or chrome
  // and steel read as flat plastic regardless of roughness/metalness.
  applyAmbientIBL(THREE, renderer, scene, opts.ambientHdriGuard);

  const composer = new modules.EffectComposer(renderer);
  composer.addPass(new modules.RenderPass(scene, camera));

  const tier = opts.qualityTier ?? detectRenderTier();
  let gtao: InstanceType<typeof modules.GTAOPass> | null = null;
  if (tierAllowsAO(tier)) {
    gtao = new modules.GTAOPass(scene, camera, width, height);
    // The installed @types/three GTAOPass constructor typing doesn't expose the AO-tuning
    // (aoParameters) argument the runtime supports, so it's applied via `updateGtaoMaterial`
    // instead — same effect, one call later.
    gtao.updateGtaoMaterial({ radius: 0.42, distanceExponent: 1.4, thickness: 0.9, scale: 1.1 });
    gtao.blendIntensity = 0.85;
    composer.addPass(gtao);
  }

  // Opt-in SSR: see the module doc at the top of this file for why this defaults to off and is
  // gated to 'cinematic'. Placed after AO (reflections should show the AO-darkened scene, not
  // bypass it) and before bloom (so bright reflected practicals can still bloom).
  let ssr: InstanceType<typeof modules.SSRPass> | null = null;
  const reflections = opts.reflections;
  if (reflections?.enabled && tierAtLeast(tier, reflections.minTier ?? 'cinematic')) {
    ssr = new modules.SSRPass({
      renderer, scene, camera, width, height, selects: null, groundReflector: null, isPerspectiveCamera: true,
    });
    ssr.opacity = Math.max(0, Math.min(1, reflections.strength ?? 0.6));
    ssr.maxDistance = reflections.maxDistance ?? 6;
    composer.addPass(ssr);
  }

  if (tierAllowsBloom(tier)) {
    const bloom = new modules.UnrealBloomPass(
      new THREE.Vector2(width, height), bloomTuning.strength, bloomTuning.radius, bloomTuning.threshold,
    );
    composer.addPass(bloom);
  }

  // Opt-in DOF: only added when the caller explicitly enabled it AND the tier meets its
  // (per-effect, overridable) floor. Placed after bloom (blurs the already-bloomed highlights,
  // matching how real lens bokeh blurs bright points into discs rather than blurring pre-bloom data).
  let dof: InstanceType<typeof modules.BokehPass> | null = null;
  const dofSettings = opts.depthOfField;
  if (dofSettings?.enabled && tierAtLeast(tier, dofSettings.minTier ?? 'high')) {
    const uniforms = resolveBokehUniforms(dofSettings);
    dof = new modules.BokehPass(scene, camera, uniforms);
    composer.addPass(dof);
  }

  composer.addPass(new modules.OutputPass());

  return {
    render: () => composer.render(),
    setSize: (w, h) => composer.setSize(w, h),
    /** Retunes the DOF focus distance at runtime (e.g. when a cinematic camera cuts to a new
     * shot) — a no-op when DOF wasn't enabled. Reusable hook for the scene-composition layer. */
    setFocusDistance: (distance: number) => {
      if (dof) (dof.uniforms as { focus: { value: number } }).focus.value = distance;
    },
    setDepthOfFieldEnabled: (enabled: boolean) => {
      if (dof) dof.enabled = enabled;
    },
    dispose: () => {
      gtao?.dispose();
      ssr?.dispose();
      composer.dispose();
    },
  };
}
