import type * as THREE_NS from 'three';
import { applyEnvironmentPreset, type EnvironmentHandle, type EnvironmentMode } from './environment';
import { createSunLight, createBackgroundFill } from './lighting';
import { createDustMotes, type DustMotesHandle } from './atmosphere';
import { createPBRMaterial } from './materials';
import {
  detectRenderTier, tierAllowsAtmosphereParticles, atmosphereParticleCount, recommendedShadowMapSize,
  type RenderTier,
} from '../quality';

/**
 * GENESIS GRAPHICS RUNTIME — Scene Environment (shared ground/sky/fog/lighting baseline)
 * ==========================================================================================
 *
 * Every exterior `Sim3D` scene in this codebase has, independently, hand-rolled the same handful of
 * decisions: a background color, a fog, a sun light, a hemisphere fill, and a flat ground plane
 * (`epidemicCity3D.ts`'s `addLightsAndGround`, `labScene3D.ts`'s room shell, and
 * `genesisScientificCitySim.ts`'s bare `PlaneGeometry` + two lights with no render-tier awareness at
 * all). This module is the ONE reusable composition of pieces that already exist —
 * `environment.ts`'s time-of-day sky/fog model, `lighting.ts`'s SUN/BACKGROUND roles,
 * `atmosphere.ts`'s dust motes, `quality.ts`'s render-tier gating — not a rewrite of any of them and
 * not a new lighting system. A scene with genuinely bespoke needs (the epidemic city's own
 * night-street palette, the lab's indoor room shell) is free to keep hand-rolling its own setup, or
 * to call this and then layer scene-specific detail on top; this module never becomes mandatory
 * infrastructure the way `disposeSceneResources` is.
 *
 * WHAT THIS DOES NOT DO: place any world-specific geometry (buildings, apparatus, roads), decide a
 * scene's camera, or touch anything about WHAT the scene contains — purely the environment baseline
 * every exterior scene needs before its own content goes in.
 */

export interface SceneEnvironmentOptions {
  mode: EnvironmentMode;
  /** OUTDOOR only — passed through to `environment.ts`'s `applyEnvironmentPreset`. Default 12 (solar noon). */
  hourOfDay?: number;
  fogDensity?: number;
  /** Square ground plane side length, world units. Default 200 (matches the largest existing hand-
   * rolled ground plane in this codebase). Pass 0 to skip the ground plane entirely (a scene that
   * provides its own floor). */
  groundSize?: number;
  /** Defaults to `materials.ts`'s `GROUND` PBR category — a real textured/worn surface, not a flat
   * color fill. */
  groundMaterial?: THREE_NS.Material;
  /** Overrides the sun's placement — default derives a plausible distant position from the
   * environment preset's own computed `SunState.direction` (OUTDOOR) or a fixed overhead angle
   * (INDOOR, which has no sun state of its own). */
  sunPosition?: THREE_NS.Vector3Tuple;
  /** Overrides the sun's intensity — default is `SunState.intensity` (OUTDOOR only), which floors at
   * 0.15 for any hour with the sun below the horizon. A scene going for a stylized "dark mood but
   * still legible" night look (dark fog/sky from `hourOfDay`, but a key light bright enough to
   * actually read the geometry — the look every hand-rolled scene used before this module existed)
   * needs this: physically-dim night intensity paired with a `sunPosition` override above the
   * horizon still leaves the light too weak to matter. */
  sunIntensity?: number;
  /** Overrides the sun's color — default is `SunState.color` (OUTDOOR) or `createSunLight`'s own
   * default warm white (INDOOR / no sun state). */
  sunColor?: THREE_NS.ColorRepresentation;
  /** Overrides the hemisphere fill's intensity — `createBackgroundFill`'s own default (0.4) is tuned
   * for a scene whose sun does most of the work. A night/dusk scene, where the sun contributes
   * little, needs more ambient lift than that to stay legible without washing out; raising it here
   * keeps that decision in the scene's own hands rather than in the shared default. */
  fillIntensity?: number;
  /** Overrides the hemisphere fill's sky/ground colours. */
  fillSkyColor?: THREE_NS.ColorRepresentation;
  fillGroundColor?: THREE_NS.ColorRepresentation;
  /** Adds a `atmosphere.ts` dust-mote haze for ambient depth, gated by `quality.ts`'s render-tier
   * rules exactly like every other consumer of that module (skipped entirely below `'medium'`).
   * Default true. */
  ambientHaze?: boolean;
  ambientHazeOptions?: { count?: number; color?: THREE_NS.ColorRepresentation; opacity?: number };
  /** Default `detectRenderTier()` — pass an explicit tier for a deterministic test or a
   * capture/cinematic pathway. */
  tier?: RenderTier;
}

export interface SceneEnvironmentHandle {
  environment: EnvironmentHandle;
  sun: THREE_NS.DirectionalLight;
  fill: THREE_NS.HemisphereLight;
  /** `null` when `groundSize` was passed as 0. */
  ground: THREE_NS.Mesh | null;
  /** `null` when the render tier gates atmosphere particles out, or `ambientHaze: false` was passed. */
  haze: DustMotesHandle | null;
  tier: RenderTier;
  /** Advances the ambient haze (a no-op when there is none) — call once per frame. */
  update(dt: number): void;
  dispose(): void;
}

/**
 * The one-call exterior environment baseline: sky/fog (via `environment.ts`), a SUN + BACKGROUND
 * light pair (via `lighting.ts`, tuned from the computed `SunState` when available), a ground plane,
 * and an optional tier-gated dust-mote haze. Returns everything it created so a caller can layer
 * scene-specific lights/geometry on top or override any individual piece afterward.
 */
export function createSceneEnvironment(
  THREE: typeof THREE_NS,
  scene: THREE_NS.Scene,
  options: SceneEnvironmentOptions,
): SceneEnvironmentHandle {
  const tier = options.tier ?? detectRenderTier();
  const environment = applyEnvironmentPreset(THREE, scene, {
    mode: options.mode, hourOfDay: options.hourOfDay, fogDensity: options.fogDensity,
  });
  const sunState = environment.sunState;
  const sunPosition: THREE_NS.Vector3Tuple = options.sunPosition
    ?? (sunState ? [sunState.direction[0] * 40, sunState.direction[1] * 40, sunState.direction[2] * 40] : [24, 40, 18]);
  const shadowMapSize = recommendedShadowMapSize(tier);
  const sun = createSunLight(THREE, scene, {
    position: sunPosition,
    color: options.sunColor ?? sunState?.color,
    intensity: options.sunIntensity ?? sunState?.intensity,
    // recommendedShadowMapSize returns 0 at 'low' as the documented "skip shadow-casting" signal.
    castShadow: shadowMapSize > 0,
    shadowMapSize: shadowMapSize > 0 ? shadowMapSize : undefined,
  });
  const fill = createBackgroundFill(THREE, scene, {
    intensity: options.fillIntensity,
    skyColor: options.fillSkyColor,
    groundColor: options.fillGroundColor,
  });

  let ground: THREE_NS.Mesh | null = null;
  const groundSize = options.groundSize ?? 200;
  // Only dispose the ground material in `dispose()` below when THIS function created it — a
  // caller-supplied `groundMaterial` is caller-owned, matching every other kit's own convention
  // (e.g. `vegetation.ts`'s "this module never disposes a material it didn't create").
  const ownsGroundMaterial = !options.groundMaterial;
  if (groundSize > 0) {
    const groundMaterial = options.groundMaterial ?? createPBRMaterial(THREE, 'GROUND');
    ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = 'genesis-scene-environment-ground';
    scene.add(ground);
  }

  let haze: DustMotesHandle | null = null;
  if ((options.ambientHaze ?? true) && tierAllowsAtmosphereParticles(tier)) {
    const hazeExtent = groundSize > 0 ? groundSize * 0.25 : 20;
    haze = createDustMotes(THREE, {
      bounds: [hazeExtent, 1.4, hazeExtent],
      center: [0, 1.4, 0],
      count: atmosphereParticleCount(options.ambientHazeOptions?.count ?? 220, tier),
      size: 0.05,
      color: options.ambientHazeOptions?.color ?? 0xd9b57a,
      opacity: options.ambientHazeOptions?.opacity ?? 0.08,
      driftSpeed: 0.08,
    });
    scene.add(haze.points);
  }

  return {
    environment, sun, fill, ground, haze, tier,
    update(dt: number) {
      haze?.update(dt);
    },
    dispose() {
      environment.dispose();
      scene.remove(sun);
      scene.remove(fill);
      if (ground) {
        scene.remove(ground);
        ground.geometry.dispose();
        if (ownsGroundMaterial) (ground.material as THREE_NS.Material).dispose();
      }
      if (haze) {
        scene.remove(haze.points);
        haze.dispose();
      }
    },
  };
}
