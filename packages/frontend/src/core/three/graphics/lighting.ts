import type * as THREE_NS from 'three';
import { isWorldAssetApproved } from '../assetGovernance';

/**
 * GENESIS GRAPHICS RUNTIME — Lighting Roles
 *
 * Reusable lighting roles cover the vocabulary a world-builder needs without
 * rebuilding a lighting rig from scratch per object:
 *
 *   KEY         `createKeyLight`       — the shadow-casting light that models an interior
 *                                        object's form (a `SpotLight`, falls off with distance).
 *   SUN         `createSunLight`       — the exterior counterpart to KEY: a shadow-casting
 *                                        `DirectionalLight` with an orthographic shadow frustum,
 *                                        for a scene lit by sunlight/moonlight rather than one
 *                                        practical fixture.
 *   RIM         `createRimLight`       — a cool light behind/above a subject that separates its
 *                                        silhouette from the background.
 *   PRACTICAL   `createPracticalLight` — a small, non-shadow-casting light that reads as coming
 *                                        from a visible fixture (a lamp, an LED strip, a monitor).
 *   HERO        `createHeroLight`      — "this is the hero apparatus": bundles KEY+RIM into one
 *                                        coherent, already-tuned treatment aimed at a target.
 *   BACKGROUND  `createBackgroundFill` — the low-level wash that keeps the room's periphery from
 *                                        reading as pure black while every KEY/RIM light aims at
 *                                        a subject.
 *   AMBIENT/IBL `applyAmbientIBL`      — image-based reflections (procedural studio env + optional
 *                                        approved HDRI) so metal and glass have something to
 *                                        reflect. Pure rendering-layer technique — it doesn't know
 *                                        or care what geometry it's lighting.
 *   ROOM PROBE  `captureRoomEnvironment` — an upgrade over AMBIENT/IBL's generic studio env: an
 *                                        interior scene reflecting its own real geometry instead
 *                                        of a generic box. See its own doc below.
 *
 * Every factory takes `THREE`+`scene` and adds its own light(s) — it never
 * places fixture geometry (a lamp mesh, a gantry beam): that's facility/
 * world composition and lives with that layer instead. Interior tuning
 * defaults are generalized from the flagship lab scene (warm KEY dominant
 * over cool fill/rim, one shadow-casting light); SUN's defaults are
 * generalized from the epidemiology city and high-fidelity street slice.
 */

/**
 * Otoczenie studyjne bez żadnego assetu: mała scena z jasnym "sufitem", ciemną "podłogą" i
 * dwoma świetlówkami, przepuszczona przez PMREMGenerator. Bez niej chrom, stal i szkło
 * wyglądają jak jednolity plastik, niezależnie od parametrów PBR — metal musi mieć co odbijać.
 * Ustawiana natychmiast (nie czeka na asynchroniczne HDRI, które i tak ją tylko zastąpi).
 */
export function applyStudioEnvironment(THREE: typeof THREE_NS, renderer: THREE_NS.WebGLRenderer, scene: THREE_NS.Scene): void {
  const envScene = new THREE.Scene();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 12), new THREE.MeshBasicMaterial({ color: 0x35415c, side: THREE.BackSide }));
  envScene.add(shell);
  const envCeiling = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicMaterial({ color: 0xdfeaff }));
  envCeiling.rotation.x = Math.PI / 2;
  envCeiling.position.y = 3.9;
  envScene.add(envCeiling);
  const envFloor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicMaterial({ color: 0x0d1220 }));
  envFloor.rotation.x = -Math.PI / 2;
  envFloor.position.y = -3.9;
  envScene.add(envFloor);
  for (const ex of [-2.4, 2.4]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 9), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    strip.rotation.x = Math.PI / 2;
    strip.position.set(ex, 3.85, 0);
    envScene.add(strip);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.06).texture;
  scene.environmentIntensity = 1.15;
  pmrem.dispose();
}

/** HDRI TYLKO jako mapa środowiska (reflections/IBL) — BEZ podmiany tła, żeby zachować nastrój
 * ciemnego laboratorium. Reużywa jedyny zatwierdzony w assetGovernance.ts asset środowiskowy. */
export async function loadHdriEnvironment(THREE: typeof THREE_NS, renderer: THREE_NS.WebGLRenderer, scene: THREE_NS.Scene): Promise<void> {
  const hdriPath = '/assets/genesis-hf/hdr/braustuble_alley_1k.hdr';
  if (!isWorldAssetApproved(hdriPath)) return;
  try {
    const { RGBELoader } = await import('three/examples/jsm/loaders/RGBELoader.js');
    const pmrem = new THREE.PMREMGenerator(renderer);
    new RGBELoader().load(hdriPath, (texture) => {
      const environment = pmrem.fromEquirectangular(texture).texture;
      scene.environment = environment;
      // Podniesione: przy obniżonym świetle ambientowym to IBL niesie większość odbić.
      scene.environmentIntensity = 1.45;
      texture.dispose();
      pmrem.dispose();
    }, undefined, () => pmrem.dispose());
  } catch {
    // Materiały PBR i światła sceny pozostają pełnym fallbackiem bez HDRI.
  }
}

/** AMBIENT/IBL role — the one call a world-builder needs for "give my metal and glass something
 * to reflect": applies the procedural studio environment immediately (no async wait) and kicks
 * off the optional approved-HDRI upgrade in the background. This is exactly what
 * `graphics/postProcessing.ts`'s `setupGraphicsPipeline` already does internally — exposed here
 * too so a caller assembling their own pipeline (bypassing `setupGraphicsPipeline`) still gets the
 * one-call version instead of having to know both functions exist and must run in this order. */
export function applyAmbientIBL(THREE: typeof THREE_NS, renderer: THREE_NS.WebGLRenderer, scene: THREE_NS.Scene): void {
  applyStudioEnvironment(THREE, renderer, scene);
  void loadHdriEnvironment(THREE, renderer, scene);
}

export interface RoomEnvironmentProbeOptions {
  /** Where in the room the probe sits — normally near the hero subject, at roughly eye height,
   * since that is the vantage whose reflections the viewer actually scrutinises. */
  position: THREE_NS.Vector3Tuple;
  /** Cube face resolution. Default 256 — a reflection probe is blurred by PMREM into roughness
   * mips anyway, so more resolution buys almost nothing while costing six renders. */
  size?: number;
  /** Applied to `scene.environmentIntensity`. A capture of a real, dim interior is much darker
   * than the procedural studio box, so the same intensity reads several stops down — default
   * 1.85 compensates. */
  intensity?: number;
  far?: number;
  /** Extra per-mesh exclusion beyond the automatic transmissive/near-transparent detection below
   * (see the module doc). First-person view-model geometry doesn't need this — it's excluded by
   * being on render layer 1 while the probe only sees layer 0 — this hook is for anything else a
   * caller's own scene wants left out of its own reflection of itself. */
  exclude?: (mesh: THREE_NS.Mesh) => boolean;
}

/**
 * A ONE-TIME reflection probe of the ACTUAL room, replacing the procedural studio box.
 *
 * `applyStudioEnvironment` gives metal something to reflect, but always the same something: two
 * white strips on a bright ceiling, regardless of what is really standing next to the object.
 * That is why chrome, steel and glass can read cheap even with correct PBR parameters — they
 * reflect a set that is not in the shot. This renders six faces from a point inside the scene
 * and feeds them through PMREM instead, so the same materials reflect the cabinet rows, light
 * strips and structure that are genuinely around them.
 *
 * Cost is paid once (six renders at `size`, then a PMREM convolution) and nothing per frame.
 * Call it AFTER the first full frame — before lights, shadows and emissive surfaces have been
 * resolved the capture is of a scene that does not exist yet.
 *
 * Three things must be excluded from the capture or the map is wrong:
 *  - tone mapping (an environment map lives in linear space; ACES would be applied twice),
 *  - transmissive/near-transparent surfaces (glass reflecting itself is a feedback loop that
 *    shows up as a milky bloom),
 *  - anything on a non-default layer, such as first-person hands/PPE held centimetres from the
 *    lens, which would otherwise dominate every face.
 */
export function captureRoomEnvironment(
  THREE: typeof THREE_NS,
  renderer: THREE_NS.WebGLRenderer,
  scene: THREE_NS.Scene,
  options: RoomEnvironmentProbeOptions,
): void {
  const hidden: THREE_NS.Object3D[] = [];
  scene.traverse((object) => {
    const mesh = object as THREE_NS.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const refractive = materials.some((material) => {
      const physical = material as THREE_NS.MeshPhysicalMaterial;
      if (physical.transmission > 0) return true;
      return Boolean(material.transparent) && (material as THREE_NS.Material & { opacity: number }).opacity < 0.4;
    });
    if (refractive || options.exclude?.(mesh)) {
      hidden.push(mesh);
      mesh.visible = false;
    }
  });

  const previousToneMapping = renderer.toneMapping;
  const previousExposure = renderer.toneMappingExposure;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;

  let target: THREE_NS.WebGLCubeRenderTarget | null = null;
  try {
    target = new THREE.WebGLCubeRenderTarget(options.size ?? 256, { type: THREE.HalfFloatType });
    const probe = new THREE.CubeCamera(0.3, options.far ?? 45, target);
    probe.layers.set(0);
    probe.position.set(...options.position);
    probe.update(renderer, scene);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromCubemap(target.texture).texture;
    const previousEnvironment = scene.environment;
    scene.environment = environment;
    scene.environmentIntensity = options.intensity ?? 1.85;
    previousEnvironment?.dispose();
    pmrem.dispose();
  } catch {
    // Without the probe the studio environment stays in place — worse reflections, still correct.
  } finally {
    target?.dispose();
    renderer.toneMapping = previousToneMapping;
    renderer.toneMappingExposure = previousExposure;
    for (const mesh of hidden) mesh.visible = true;
  }
}

// ============================================================================
// KEY / RIM / PRACTICAL / HERO / BACKGROUND — object/subject lighting roles.
// ============================================================================

export interface KeyLightOptions {
  /** World point the light should model the form of (e.g. the hero apparatus's center). */
  target: THREE_NS.Vector3Tuple;
  /** Where the light itself sits. */
  position: THREE_NS.Vector3Tuple;
  color?: THREE_NS.ColorRepresentation;
  /** SpotLight intensity — three.js's physically-based unit scale means "right" depends on scene
   * size/exposure; 22 is the value proven at the lab's ~1.05 toneMappingExposure and room scale. */
  intensity?: number;
  angle?: number;
  penumbra?: number;
  decay?: number;
  /** Default true — KEY is the canonical single shadow-casting light in a Genesis scene (see
   * `graphics/shadowPolicy.ts` and `quality.ts`'s `maxShadowCasterBudget`). Set false for a
   * secondary/fill key that shouldn't spend the scene's shadow budget. */
  castShadow?: boolean;
  /** Shadow-map resolution — pull from `quality.ts`'s `recommendedShadowMapSize(tier)` rather
   * than hardcoding, so KEY respects the same quality tier as the rest of the pipeline. */
  shadowMapSize?: number;
  shadowNear?: number;
  shadowFar?: number;
  shadowBias?: number;
}

/** KEY role: the light that models a subject's form and (usually) casts the scene's one shadow.
 * Adds both the light and its `.target` to `scene` — a `SpotLight`'s target must be in the scene
 * graph for its direction to update. */
export function createKeyLight(THREE: typeof THREE_NS, scene: THREE_NS.Scene, opts: KeyLightOptions): THREE_NS.SpotLight {
  const light = new THREE.SpotLight(
    opts.color ?? 0xfff0d8, opts.intensity ?? 22, 13, opts.angle ?? Math.PI / 4.5, opts.penumbra ?? 0.5, opts.decay ?? 1.1,
  );
  light.position.set(...opts.position);
  light.target.position.set(...opts.target);
  const castShadow = opts.castShadow ?? true;
  light.castShadow = castShadow;
  if (castShadow) {
    const mapSize = opts.shadowMapSize ?? 1024;
    light.shadow.mapSize.set(mapSize, mapSize);
    light.shadow.bias = opts.shadowBias ?? -0.0018;
    light.shadow.camera.near = opts.shadowNear ?? 0.5;
    light.shadow.camera.far = opts.shadowFar ?? 13;
  }
  scene.add(light, light.target);
  return light;
}

export interface SunLightOptions {
  /** Direction the light sits at, relative to the scene origin — a `DirectionalLight`'s own
   * position doesn't affect where its parallel rays fall, only the direction from position toward
   * (0,0,0), so this is really "which way is the sun," not a placement in world space. */
  position: THREE_NS.Vector3Tuple;
  color?: THREE_NS.ColorRepresentation;
  intensity?: number;
  /** Default true — the SUN is the canonical single shadow-casting light for an exterior scene,
   * same role KEY plays for an interior one. */
  castShadow?: boolean;
  shadowMapSize?: number;
  /**
   * Half-extent of the orthographic shadow camera's frustum on each side, in world units. A
   * `DirectionalLight`'s rays are parallel — there's no perspective falloff to exploit the way
   * `createKeyLight`'s near/far does, so the frustum must be sized to cover the whole
   * shadow-casting scene explicitly. Too small clips shadows at the frustum edge; too large wastes
   * shadow-map resolution on empty space outside the scene. Default 12 (room/block scale) — an
   * exterior scene spanning tens of units needs a proportionally larger value.
   */
  shadowFrustumHalfExtent?: number;
  shadowBias?: number;
  /** Reduces shadow-acne on nearly-parallel surfaces (a ground plane lit at a grazing sun angle)
   * without the peter-panning a larger `shadowBias` alone would cause. Omit for three.js's default
   * (0) — only set this after seeing acne on your own ground plane. */
  shadowNormalBias?: number;
}

/**
 * SUN role: the exterior counterpart to `createKeyLight` — a shadow-casting `DirectionalLight` for
 * a scene lit by sunlight/moonlight/an overcast sky rather than a single practical fixture (an
 * interior scene's `SpotLight` KEY has a cone and falls off with distance; a sun does neither).
 * Generalized from the near-identical rig two exterior Genesis scenes (the epidemiology city, the
 * high-fidelity street slice) independently built by hand.
 */
export function createSunLight(THREE: typeof THREE_NS, scene: THREE_NS.Scene, opts: SunLightOptions): THREE_NS.DirectionalLight {
  const light = new THREE.DirectionalLight(opts.color ?? 0xffd9a0, opts.intensity ?? 2);
  light.position.set(...opts.position);
  const castShadow = opts.castShadow ?? true;
  light.castShadow = castShadow;
  if (castShadow) {
    const mapSize = opts.shadowMapSize ?? 1024;
    light.shadow.mapSize.set(mapSize, mapSize);
    const half = opts.shadowFrustumHalfExtent ?? 12;
    light.shadow.camera.left = -half;
    light.shadow.camera.right = half;
    light.shadow.camera.top = half;
    light.shadow.camera.bottom = -half;
    light.shadow.bias = opts.shadowBias ?? -0.0003;
    if (opts.shadowNormalBias !== undefined) light.shadow.normalBias = opts.shadowNormalBias;
  }
  scene.add(light);
  return light;
}

export interface RimLightOptions {
  /** Position the rim light sits at — typically behind/above the subject relative to KEY. */
  position: THREE_NS.Vector3Tuple;
  color?: THREE_NS.ColorRepresentation;
  intensity?: number;
  distance?: number;
  decay?: number;
}

/** RIM role: a cool `PointLight` (no shadow — it's a silhouette-separation accent, not a form
 * light) placed behind/above a subject to cut its edge away from the background. */
export function createRimLight(THREE: typeof THREE_NS, scene: THREE_NS.Scene, opts: RimLightOptions): THREE_NS.PointLight {
  const light = new THREE.PointLight(opts.color ?? 0x7fdcff, opts.intensity ?? 4.5, opts.distance ?? 7, opts.decay ?? 2);
  light.position.set(...opts.position);
  scene.add(light);
  return light;
}

export interface PracticalLightOptions {
  position: THREE_NS.Vector3Tuple;
  color?: THREE_NS.ColorRepresentation;
  intensity?: number;
  distance?: number;
  decay?: number;
}

/** PRACTICAL role: a small, never-shadow-casting `PointLight` that reads as light coming from a
 * visible fixture already in the scene (a pendant lamp, an LED strip, a monitor glow) — the
 * fixture geometry itself belongs to the facility/world layer; this is just its light budget. */
export function createPracticalLight(THREE: typeof THREE_NS, scene: THREE_NS.Scene, opts: PracticalLightOptions): THREE_NS.PointLight {
  const light = new THREE.PointLight(opts.color ?? 0xfff1d6, opts.intensity ?? 0.8, opts.distance ?? 5, opts.decay ?? 2);
  light.position.set(...opts.position);
  scene.add(light);
  return light;
}

export interface BackgroundFillOptions {
  skyColor?: THREE_NS.ColorRepresentation;
  groundColor?: THREE_NS.ColorRepresentation;
  intensity?: number;
}

/** BACKGROUND role: the low-level `HemisphereLight` wash that keeps a room's periphery from
 * reading as pure black while every KEY/RIM light aims at a subject. Deliberately weak by
 * default — this is a floor, not the scene's main light source (see the lab's own tuning note:
 * ambient must stay low enough for KEY to visibly dominate, or shadows/contrast disappear). */
export function createBackgroundFill(THREE: typeof THREE_NS, scene: THREE_NS.Scene, opts: BackgroundFillOptions = {}): THREE_NS.HemisphereLight {
  const light = new THREE.HemisphereLight(opts.skyColor ?? 0x8ea4cc, opts.groundColor ?? 0x6b7593, opts.intensity ?? 0.4);
  scene.add(light);
  return light;
}

export interface HeroLightOptions {
  /** World point the hero object sits at/around. */
  target: THREE_NS.Vector3Tuple;
  /** Direction (need not be normalized) the KEY light approaches from, relative to `target`.
   * Default is an elevated side-front angle matching the lab's proven apparatus lighting. */
  keyDirection?: THREE_NS.Vector3Tuple;
  /** Direction the RIM light sits at, relative to `target`. Default is behind/above, opposite-ish
   * of the key direction, matching the proven silhouette-separation angle. */
  rimDirection?: THREE_NS.Vector3Tuple;
  /** Distance from `target` to place the KEY light — scale up for a much larger hero object. */
  keyDistance?: number;
  rimDistance?: number;
  color?: { key?: THREE_NS.ColorRepresentation; rim?: THREE_NS.ColorRepresentation };
  intensity?: { key?: number; rim?: number };
  castShadow?: boolean;
  shadowMapSize?: number;
}

export interface HeroLightHandles {
  key: THREE_NS.SpotLight;
  rim: THREE_NS.PointLight;
}

/**
 * HERO role: "this is the hero apparatus" → a coherent, already-tuned KEY+RIM treatment aimed at
 * `target`, generalized from the exact lighting proven on the flagship lab's reactor vessel. Call
 * this once per hero object instead of hand-placing a SpotLight+PointLight pair and re-deriving
 * the angle/intensity/shadow tuning that already works.
 */
export function createHeroLight(THREE: typeof THREE_NS, scene: THREE_NS.Scene, opts: HeroLightOptions): HeroLightHandles {
  const target = new THREE.Vector3(...opts.target);
  const keyDir = new THREE.Vector3(...(opts.keyDirection ?? [0.72, 0.55, -0.4])).normalize();
  const rimDir = new THREE.Vector3(...(opts.rimDirection ?? [-0.15, 0.45, -0.8])).normalize();
  const keyPos = target.clone().addScaledVector(keyDir, opts.keyDistance ?? 4.2);
  const rimPos = target.clone().addScaledVector(rimDir, opts.rimDistance ?? 1.8);

  const key = createKeyLight(THREE, scene, {
    target: opts.target,
    position: [keyPos.x, keyPos.y, keyPos.z],
    color: opts.color?.key,
    intensity: opts.intensity?.key,
    castShadow: opts.castShadow,
    shadowMapSize: opts.shadowMapSize,
  });
  const rim = createRimLight(THREE, scene, {
    position: [rimPos.x, rimPos.y, rimPos.z],
    color: opts.color?.rim,
    intensity: opts.intensity?.rim,
  });
  return { key, rim };
}
