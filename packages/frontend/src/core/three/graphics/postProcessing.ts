import type * as THREE_NS from 'three';
import type { PostProcessingModules, PostProcessor } from '../types';
import { detectRenderTier, tierAllowsAO, tierAllowsBloom, tierAtLeast, type RenderTier } from '../quality';
import { applyAmbientIBL, applyStudioEnvironment, captureRoomEnvironment, type RoomEnvironmentProbeOptions } from './lighting';
import { readFrameCounters, estimateSceneGpuMemory, type FrameCounters, type SceneGpuMemoryEstimate } from './diagnostics';

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
 * a metal panel catching a neighboring light, wet asphalt catching the city
 * lights above it. That's a real, visible upgrade for "deep laboratory
 * environments" (task priority #6) and for an outdoor flood scene alike, but
 * it costs its own normal+depth+metalness pre-passes and a blur pass — a
 * similar order of cost to GTAO, on top of GTAO. This module's own default
 * (`enabled: false` unless a caller opts in, `minTier: 'cinematic'` unless a
 * caller loosens it) stays conservative for exactly that reason: nothing
 * about a device heuristic alone should turn on a second expensive
 * screen-space pass. `genesisScientificCitySim.ts` is the first caller to
 * actually opt in (`{ enabled: true, minTier: 'high', ... }`), after a
 * headless-Chromium visual check ruled out gross streaking/noise at that
 * scene's real camera distance and tuned `strength`/`maxDistance` to it —
 * that check used software rendering, not a real discrete GPU, so it
 * confirms "doesn't look broken," not a performance profile on real
 * hardware. Any other caller opting in should do the same visual check
 * against its own scene rather than assume these settings transfer.
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

/**
 * Ambient-occlusion tuning. AO's default tier floor is `'high'` because GTAO's normal/depth
 * pre-pass is meaningfully pricier than bloom — but "can this device afford AO" is a judgement
 * about a SPECIFIC scene's budget, not a universal constant, and the caller is the only one who
 * knows how heavy its own scene is. The flagship lab, for instance, deliberately spends its
 * budget on grounding the hero apparatus (AO is what makes machinery sit ON the floor instead of
 * hovering above it) and lowers this floor to `'medium'` — the same per-effect override
 * `DepthOfFieldSettings.minTier` already gives DOF.
 */
export interface AmbientOcclusionSettings {
  /** Default true. `false` skips the pass entirely regardless of tier. */
  enabled?: boolean;
  /** Tier floor for the pass. Default `'high'` — the previous hard-coded behavior. */
  minTier?: RenderTier;
  /** GTAO sampling radius in world units. Default 0.42 (tight contact darkening). Larger values
   * read as broader, softer occlusion between separate objects — a room-scale facility with big
   * machinery wants more than a tabletop scene does. */
  radius?: number;
  /** How strongly the AO term multiplies into the beauty buffer, 0..1. Default 0.85. */
  blendIntensity?: number;
}

/**
 * Which image-based lighting source the scene reflects.
 *
 * `'studio+hdri'` (default) is the general case: a procedural studio box immediately, upgraded in
 * the background to the approved HDRI. `'room-probe'` is for a scene that IS an interior worth
 * reflecting — it keeps the studio box only as the frame-0 fallback, skips the HDRI load
 * entirely (which would otherwise asynchronously overwrite the probe), and hands the caller a
 * `captureRoomProbe()` to fire once the first full frame has been rendered. See
 * `captureRoomEnvironment` in `lighting.ts` for why the timing matters. `'none'` is for a scene
 * that already runs its OWN environment/atmosphere entirely outside this module (a tuned HDRI
 * intensity, a specific background color, exponential fog) — forcing the generic studio box on
 * top would fight that scene's own tuning rather than help it, so this skips the AMBIENT/IBL role
 * completely and leaves `scene.environment`/`scene.background`/`scene.fog` untouched.
 */
export interface AmbientEnvironmentSettings {
  mode: 'studio+hdri' | 'room-probe' | 'none';
  /** Required for `'room-probe'` — where the probe sits and how bright its map reads. */
  probe?: RoomEnvironmentProbeOptions;
}

export interface GraphicsPipelineOptions {
  scene: THREE_NS.Scene;
  camera: THREE_NS.PerspectiveCamera;
  width: number;
  height: number;
  toneMappingExposure?: number;
  bloom?: { strength: number; radius: number; threshold: number };
  depthOfField?: DepthOfFieldSettings;
  /** Ambient occlusion tuning / tier floor — see `AmbientOcclusionSettings`. Omit for the
   * default: enabled, `'high'` floor, contact-scale radius. */
  ambientOcclusion?: AmbientOcclusionSettings;
  /** Image-based lighting source. Omit for `'studio+hdri'`, the previous behavior. */
  ambient?: AmbientEnvironmentSettings;
  /** Screen-space reflections — see the module doc above. Opt-in, off by default. */
  reflections?: ScreenSpaceReflectionSettings;
  /**
   * Forces a specific quality tier instead of `detectRenderTier()`'s device heuristic — the hook
   * a screenshot/video capture pathway uses to request `'cinematic'` quality regardless of what
   * the interactive device signals suggest. Omit for normal interactive rendering.
   */
  qualityTier?: RenderTier;
}

/** `PostProcessor` plus a hook for retuning DOF focus at runtime — a strict superset, so it still
 * satisfies `Sim3D.setupPostProcessing`'s declared `PostProcessor` return type. */
export interface GraphicsPipeline extends PostProcessor {
  setFocusDistance(distance: number): void;
  /**
   * Toggles the Bokeh blur on/off per shot without rebuilding the composer — a no-op when DOF
   * wasn't enabled at setup. For a camera that cuts between framings (a wide establishing shot, a
   * tight hero close-up, a first-person POV), only SOME of those framings want shallow depth of
   * field: cinematography convention (and this engine's own `cinematicCamera.ts` profiles) keeps
   * wide/establishing and POV shots sharp end-to-end, reserving DOF for close/hero framings where
   * it reads as intentional rather than as a rendering glitch blurring the room the viewer is
   * trying to read.
   */
  setDepthOfFieldEnabled(enabled: boolean): void;
  /**
   * Captures the room reflection probe, when `ambient.mode` is `'room-probe'` — a no-op
   * otherwise, and a no-op on every call after the first. Call it from the render loop once the
   * first full frame has been drawn.
   */
  captureRoomProbe(): void;
  /**
   * Reads the renderer's draw-call/triangle/geometry/texture/program counters for the frame(s)
   * rendered since the last read (see `diagnostics.ts` — `renderer.info.autoReset` clears these at
   * the start of every frame, so call this right after `.render()`, not on some later tick). Exact
   * CPU-side counts, valid on any GPU including software rendering — not a hardware performance
   * claim; see `diagnostics.ts`'s own module doc for what is and isn't verified here.
   */
  getFrameCounters(): FrameCounters;
  /**
   * GRAPHICS V6 — the combined GPU-memory estimate `PERFORMANCE_BUDGET.md` §2's "Total GPU memory"
   * row names: texture bytes (GRAPHICS V3) + geometry bytes + this pipeline's OWN two `EffectComposer`
   * ping-pong render targets. See `diagnostics.ts`'s `estimateRenderTargetMemory` for exactly which
   * render targets this does and does not cover (each individual `Pass`'s own internal targets —
   * bloom's downsample chain, GTAO's, SSR's, Bokeh's — are named but deliberately not sized; see that
   * function's own doc for why). Like `getFrameCounters`, this is a real scene-graph walk, not free —
   * sample it on an interval (a diagnostics panel), not every frame.
   */
  getGpuMemoryEstimate(): SceneGpuMemoryEstimate;
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
  const ambient = opts.ambient;
  if (ambient?.mode === 'none') {
    // The caller runs its own environment/atmosphere entirely — nothing to do here.
  } else if (ambient?.mode === 'room-probe') {
    // Studio box only as the frame-0 fallback — no HDRI load, since it would land
    // asynchronously and overwrite the probe some seconds into the session.
    applyStudioEnvironment(THREE, renderer, scene);
  } else {
    applyAmbientIBL(THREE, renderer, scene);
  }

  const composer = new modules.EffectComposer(renderer);
  composer.addPass(new modules.RenderPass(scene, camera));

  const tier = opts.qualityTier ?? detectRenderTier();
  const ao = opts.ambientOcclusion;
  // `tierAllowsAO` stays the DEFAULT floor, not the only one — a caller that has profiled its own
  // scene can lower it (see `AmbientOcclusionSettings`).
  const aoAllowed = ao?.minTier ? tierAtLeast(tier, ao.minTier) : tierAllowsAO(tier);
  let gtao: InstanceType<typeof modules.GTAOPass> | null = null;
  if ((ao?.enabled ?? true) && aoAllowed) {
    gtao = new modules.GTAOPass(scene, camera, width, height);
    // The installed @types/three GTAOPass constructor typing doesn't expose the AO-tuning
    // (aoParameters) argument the runtime supports, so it's applied via `updateGtaoMaterial`
    // instead — same effect, one call later.
    gtao.updateGtaoMaterial({ radius: ao?.radius ?? 0.42, distanceExponent: 1.4, thickness: 0.9, scale: 1.1 });
    gtao.blendIntensity = ao?.blendIntensity ?? 0.85;
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

  let bloom: InstanceType<typeof modules.UnrealBloomPass> | null = null;
  if (tierAllowsBloom(tier)) {
    bloom = new modules.UnrealBloomPass(
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

  const outputPass = new modules.OutputPass();
  composer.addPass(outputPass);

  let roomProbeCaptured = false;
  return {
    render: () => composer.render(),
    setSize: (w, h) => composer.setSize(w, h),
    captureRoomProbe: () => {
      if (roomProbeCaptured || ambient?.mode !== 'room-probe' || !ambient.probe) return;
      roomProbeCaptured = true;
      captureRoomEnvironment(THREE, renderer, scene, ambient.probe);
    },
    /** Retunes the DOF focus distance at runtime (e.g. when a cinematic camera cuts to a new
     * shot) — a no-op when DOF wasn't enabled. Reusable hook for the scene-composition layer. */
    setFocusDistance: (distance: number) => {
      if (dof) (dof.uniforms as { focus: { value: number } }).focus.value = distance;
    },
    setDepthOfFieldEnabled: (enabled: boolean) => {
      if (dof) dof.enabled = enabled;
    },
    getFrameCounters: () => readFrameCounters(renderer),
    getGpuMemoryEstimate: () => estimateSceneGpuMemory(scene, [composer.renderTarget1, composer.renderTarget2]),
    // Resource-lifecycle audit finding: `EffectComposer.dispose()` only frees its OWN two ping-pong
    // render targets and copy pass — it does not iterate `this.passes` and dispose each one (see
    // three.js's own EffectComposer source). Every pass that owns GPU resources must be disposed
    // explicitly here, or they leak on every scene teardown/remount: UnrealBloomPass alone owns 11
    // WebGLRenderTargets (its downsample/blur chain), BokehPass owns a depth render target plus two
    // materials, OutputPass owns one material — none of that was being freed before this fix.
    dispose: () => {
      gtao?.dispose();
      ssr?.dispose();
      bloom?.dispose();
      dof?.dispose();
      outputPass.dispose();
      composer.dispose();
      // Resource-lifecycle audit finding: this pipeline's own AMBIENT/IBL environment texture
      // (a real PMREM-convolved WebGLRenderTarget, from applyAmbientIBL's studio-box+HDRI or
      // captureRoomEnvironment's room probe) was never disposed on teardown. Only touched when this
      // pipeline actually owns `scene.environment` (not 'none' mode — that caller manages its own
      // environment entirely outside this pipeline and must not have it swept here).
      if (ambient?.mode !== 'none') {
        scene.environment?.dispose();
        scene.environment = null;
      }
    },
  };
}
