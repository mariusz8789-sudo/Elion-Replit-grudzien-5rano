import type * as THREE_NS from 'three';

/**
 * GENESIS GRAPHICS RUNTIME — Environment
 *
 * A reusable outdoor/indoor environment system: a gradient sky dome + a pure, testable time-of-day
 * model (`computeSunState`) that derives sun direction/color/intensity and matching sky/fog tones
 * from an hour-of-day — the foundation `applyEnvironmentPreset` composes into one call. This is
 * deliberately NOT a physically-based atmospheric scattering model (no Rayleigh/Mie simulation) —
 * that is a much larger, GPU-shader-level undertaking with a cost profile this engine's real-time
 * budget (see PERFORMANCE.md) doesn't currently justify. What's here is a plausible, cheap,
 * artist-tunable day/night curve: good enough to give a scene a coherent time-of-day mood without
 * pretending to be a physical sky model.
 *
 * `applyEnvironmentPreset` intentionally does NOT create or retune any light itself — it hands back
 * `SunState` (direction/color/intensity) for the caller to feed into `lighting.ts`'s `createSunLight`
 * (or `createKeyLight` for an indoor scene), so this module stays a pure "what should the sky/fog/
 * sun look like" decision, not a second lighting system competing with the one in `lighting.ts`.
 */

export type EnvironmentMode = 'OUTDOOR' | 'INDOOR';

export interface SunState {
  /** Normalized direction FROM the scene TOWARD the sun — feed directly into `createSunLight`'s
   * `position` (a `DirectionalLight`'s position only encodes a direction, never a real distance;
   * see that function's own doc), typically scaled up by the caller for a physically-sensible
   * placement distance. */
  direction: THREE_NS.Vector3Tuple;
  /** 0 (below horizon, full night) to 1 (sun directly overhead) — NOT the same as `direction`'s own
   * y-component (which can be negative); exposed separately since callers commonly want a simple
   * "how much daylight is there" scalar without re-deriving it from the vector. */
  altitude01: number;
  color: number;
  /** Directional-light-scale intensity (matches `createSunLight`'s own default of ~2 at full day). */
  intensity: number;
  skyZenithColor: number;
  skyHorizonColor: number;
  fogColor: number;
  timeOfDay: 'NIGHT' | 'DAWN' | 'DAY' | 'DUSK';
}

const NIGHT_ZENITH = 0x030712;
const NIGHT_HORIZON = 0x0b1a2e;
const NIGHT_FOG = 0x050a14;
const NIGHT_SUN_COLOR = 0x2b4a7a; // moonlight-cool, dim
const DAY_ZENITH = 0x3d7fd6;
const DAY_HORIZON = 0xcfe3f2;
const DAY_FOG = 0xc3d6e8;
const DAY_SUN_COLOR = 0xfff3de;
const GOLDEN_ZENITH = 0x274a7a;
const GOLDEN_HORIZON = 0xf2a765;
const GOLDEN_FOG = 0xe0a878;
const GOLDEN_SUN_COLOR = 0xff9a4d;

/**
 * Pure function, no THREE dependency beyond color lerping (done by the caller via `lerpHex` at the
 * one call site that needs it — kept here so this stays testable without constructing any WebGL
 * object). `hourOfDay` wraps modulo 24; fractional hours are fine (12.5 = 12:30).
 *
 * Model: sun altitude follows a single sine arc peaking at solar noon (hour 12) and troughing at
 * midnight, `sin((hour-6)/12 * PI)` — civil dawn/dusk (the golden-hour color blend) is the ~2-hour
 * window around each horizon crossing. Azimuth sweeps a fixed east-to-west arc so the direction
 * vector actually rotates over the day rather than just rising/falling in place.
 */
export function computeSunState(THREE: typeof THREE_NS, hourOfDay: number): SunState {
  const hour = ((hourOfDay % 24) + 24) % 24;
  const altitudeRad = Math.sin(((hour - 6) / 12) * Math.PI) * (Math.PI / 2);
  const azimuthRad = ((hour - 6) / 24) * Math.PI * 2;
  const altitude01 = Math.max(0, Math.sin(altitudeRad));

  const direction: THREE_NS.Vector3Tuple = [
    Math.cos(altitudeRad) * Math.cos(azimuthRad),
    Math.sin(altitudeRad),
    Math.cos(altitudeRad) * Math.sin(azimuthRad),
  ];

  // Golden-hour blend weight: peaks exactly at the horizon (altitude 0, still above ground) and
  // fades out both toward full daylight and full night — a triangular window, not a hard cutoff.
  const goldenWeight = Math.max(0, 1 - Math.abs(altitude01 - 0.12) / 0.22);
  const nightWeight = Math.max(0, 1 - altitude01 * 2.2 - goldenWeight * 0.4);
  const dayWeight = Math.max(0, 1 - nightWeight - goldenWeight);
  const total = nightWeight + goldenWeight + dayWeight || 1;
  const n = nightWeight / total;
  const g = goldenWeight / total;
  const d = dayWeight / total;

  const mix3 = (nightHex: number, goldenHex: number, dayHex: number): number => {
    const nightColor = new THREE.Color(nightHex).multiplyScalar(n);
    const goldenColor = new THREE.Color(goldenHex).multiplyScalar(g);
    const dayColor = new THREE.Color(dayHex).multiplyScalar(d);
    return nightColor.add(goldenColor).add(dayColor).getHex();
  };

  const timeOfDay: SunState['timeOfDay'] = altitude01 <= 0.02 ? 'NIGHT' : g > 0.5 ? (azimuthRad < Math.PI ? 'DAWN' : 'DUSK') : 'DAY';

  return {
    direction,
    altitude01,
    color: mix3(NIGHT_SUN_COLOR, GOLDEN_SUN_COLOR, DAY_SUN_COLOR),
    intensity: 0.15 + altitude01 * 1.95,
    skyZenithColor: mix3(NIGHT_ZENITH, GOLDEN_ZENITH, DAY_ZENITH),
    skyHorizonColor: mix3(NIGHT_HORIZON, GOLDEN_HORIZON, DAY_HORIZON),
    fogColor: mix3(NIGHT_FOG, GOLDEN_FOG, DAY_FOG),
    timeOfDay,
  };
}

export interface SkyDomeOptions {
  topColor?: THREE_NS.ColorRepresentation;
  bottomColor?: THREE_NS.ColorRepresentation;
  radius?: number;
}

/**
 * A large, vertex-colored, `BackSide` sphere for a gradient sky — the standard cheap "no HDRI"
 * technique: no texture, no fragment-shader gradient, just per-vertex color interpolated by the GPU
 * for free. `renderOrder = -1000` and `depthWrite: false` so it always draws behind real geometry
 * regardless of its (arbitrary, large) radius relative to the actual scene contents.
 */
export function createSkyDome(THREE: typeof THREE_NS, options: SkyDomeOptions = {}): THREE_NS.Mesh {
  const radius = options.radius ?? 400;
  const geometry = new THREE.SphereGeometry(radius, 24, 16);
  const topColor = new THREE.Color(options.topColor ?? DAY_ZENITH);
  const bottomColor = new THREE.Color(options.bottomColor ?? DAY_HORIZON);
  const position = geometry.attributes.position!;
  const colors = new Float32Array(position.count * 3);
  const scratch = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const normalizedY = position.getY(i) / radius; // -1 (nadir) .. 1 (zenith)
    // Horizon (t=0) biased slightly below the sphere's equator (0.08) — reads more like a real
    // skyline, where the visually "flat" horizon band sits a little under dead-center.
    const t = Math.max(0, Math.min(1, (normalizedY + 0.08) / 0.92));
    scratch.copy(bottomColor).lerp(topColor, t);
    colors[i * 3] = scratch.r;
    colors[i * 3 + 1] = scratch.g;
    colors[i * 3 + 2] = scratch.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'genesis-sky-dome';
  mesh.renderOrder = -1000;
  mesh.matrixAutoUpdate = false; // sky dome never moves/rotates relative to the scene origin
  mesh.updateMatrix();
  return mesh;
}

export interface EnvironmentPresetOptions {
  mode: EnvironmentMode;
  /** OUTDOOR only. Default 12 (solar noon). */
  hourOfDay?: number;
  /** OUTDOOR only — `FogExp2` density. Default 0.012 (a hazy-but-not-obscuring exterior). */
  fogDensity?: number;
  skyDomeRadius?: number;
}

export interface EnvironmentHandle {
  /** `null` for `'INDOOR'` mode — an indoor scene has no sky and manages its own fog (or none). */
  skyDome: THREE_NS.Mesh | null;
  sunState: SunState | null;
  /** Removes the sky dome from `scene` and clears `scene.fog` (INDOOR-mode: a no-op, since neither
   * was touched). Does NOT touch `scene.background` (see the module doc) or any light — those stay
   * this call's caller's responsibility, mirroring `postProcessing.ts`'s own IBL-vs-caller split. */
  dispose(): void;
}

/**
 * The one-call outdoor/indoor environment setup: computes the current `SunState` (OUTDOOR only),
 * adds a matching gradient sky dome, and sets `scene.fog` to a matching tone — everything a
 * world-builder needs BEFORE placing an actual sun/key light via `lighting.ts` with the returned
 * `sunState.direction`/`color`/`intensity`. INDOOR mode is a deliberate near-no-op (no sky, no
 * fog) — an interior scene's atmosphere is `atmosphere.ts`'s job (dust/haze/light shafts), not a
 * sky dome that would never be visible anyway.
 */
export function applyEnvironmentPreset(THREE: typeof THREE_NS, scene: THREE_NS.Scene, options: EnvironmentPresetOptions): EnvironmentHandle {
  if (options.mode === 'INDOOR') {
    return { skyDome: null, sunState: null, dispose: () => {} };
  }
  const sunState = computeSunState(THREE, options.hourOfDay ?? 12);
  const skyDome = createSkyDome(THREE, {
    topColor: sunState.skyZenithColor, bottomColor: sunState.skyHorizonColor, radius: options.skyDomeRadius,
  });
  scene.add(skyDome);
  scene.fog = new THREE.FogExp2(sunState.fogColor, options.fogDensity ?? 0.012);
  return {
    skyDome,
    sunState,
    dispose: () => {
      scene.remove(skyDome);
      skyDome.geometry.dispose();
      (skyDome.material as THREE_NS.Material).dispose();
      scene.fog = null;
    },
  };
}
