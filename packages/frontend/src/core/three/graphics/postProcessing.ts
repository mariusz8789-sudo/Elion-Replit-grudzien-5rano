import type * as THREE_NS from 'three';
import type { PostProcessingModules, PostProcessor } from '../types';
import { detectRenderTier, tierAllowsAO, tierAllowsBloom, tierAtLeast, type RenderTier } from '../quality';
import { applyAmbientIBL } from './lighting';

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

export interface GraphicsPipelineOptions {
  scene: THREE_NS.Scene;
  camera: THREE_NS.PerspectiveCamera;
  width: number;
  height: number;
  toneMappingExposure?: number;
  bloom?: { strength: number; radius: number; threshold: number };
  depthOfField?: DepthOfFieldSettings;
}

/** `PostProcessor` plus a hook for retuning DOF focus at runtime — a strict superset, so it still
 * satisfies `Sim3D.setupPostProcessing`'s declared `PostProcessor` return type. */
export interface GraphicsPipeline extends PostProcessor {
  setFocusDistance(distance: number): void;
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
  applyAmbientIBL(THREE, renderer, scene);

  const composer = new modules.EffectComposer(renderer);
  composer.addPass(new modules.RenderPass(scene, camera));

  const tier = detectRenderTier();
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
    dispose: () => {
      gtao?.dispose();
      composer.dispose();
    },
  };
}
