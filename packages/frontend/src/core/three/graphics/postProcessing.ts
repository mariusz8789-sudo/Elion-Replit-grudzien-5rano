import type * as THREE_NS from 'three';
import type { PostProcessingModules, PostProcessor } from '../types';
import { detectRenderTier, tierAllowsAO, tierAllowsBloom } from '../quality';
import { applyStudioEnvironment, loadHdriEnvironment } from './lighting';

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
 * DEPTH OF FIELD: `depthOfField` is OPT-IN and OFF by default — passing
 * nothing preserves today's exact rendering (no behavior change, no
 * regression risk). A caller that DOES know the right focus distance for a
 * given shot (e.g. a fixed cinematic camera looking at the hero apparatus)
 * can pass `{ focusDistance, aperture?, maxBlur? }` to get a subtle Bokeh
 * pass, tier-gated the same way as AO since it also renders its own
 * scene-depth pre-pass. This module never guesses a focus distance itself —
 * that's scene-composition knowledge it deliberately doesn't have.
 */
export interface DepthOfFieldOptions {
  /** World-space distance from the camera that should be in sharp focus. */
  focusDistance: number;
  /** Blur strength — three.js BokehPass "aperture" uniform. Small values stay subtle. */
  aperture?: number;
  /** Maximum blur radius in screen space. */
  maxBlur?: number;
}

export interface GraphicsPipelineOptions {
  scene: THREE_NS.Scene;
  camera: THREE_NS.PerspectiveCamera;
  width: number;
  height: number;
  toneMappingExposure?: number;
  bloom?: { strength: number; radius: number; threshold: number };
  depthOfField?: DepthOfFieldOptions;
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

  // Mapa środowiska generowana PROCEDURALNIE (bez czekania na async HDRI) — metal musi mieć co
  // odbijać, inaczej chrom i stal czytają się jak matowy plastik niezależnie od roughness/metalness.
  applyStudioEnvironment(THREE, renderer, scene);
  void loadHdriEnvironment(THREE, renderer, scene);

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

  // Opt-in DOF: only added when the caller supplied a focus distance AND the tier can afford
  // its own depth pre-pass. Placed after bloom (blurs the already-bloomed highlights, matching
  // how real lens bokeh blurs bright points into discs rather than blurring pre-bloom data).
  let dof: InstanceType<typeof modules.BokehPass> | null = null;
  if (opts.depthOfField && tierAllowsAO(tier)) {
    dof = new modules.BokehPass(scene, camera, {
      focus: opts.depthOfField.focusDistance,
      aperture: opts.depthOfField.aperture ?? 0.012,
      maxblur: opts.depthOfField.maxBlur ?? 0.006,
    });
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
