import type * as THREE_NS from 'three';
import type { DepthOfFieldSettings } from './postProcessing';

/**
 * GENESIS GRAPHICS RUNTIME — Cinematic Camera
 *
 * Named camera profiles + a focus-transition utility. This module answers
 * "what lens does shot X use" (FOV, near/far, whether it wants DOF and how
 * strong) — it never decides WHERE the camera sits or WHAT it looks at
 * (that's `graphics/cameraRig.ts`-shaped scene-composition knowledge the
 * world-builder owns) or WHEN a cut happens (also the world-builder's
 * camera-phase state machine). Two different concerns, two different
 * layers: this one is pure lens/optics configuration.
 */
export type CinematicCameraProfile =
  | 'WIDE_ESTABLISHING' | 'HERO_CLOSE_UP' | 'SCIENTIST_POV' | 'MACRO_DETAIL' | 'INSTRUMENT_INSERT';

interface ProfileSpec {
  /** Vertical FOV in degrees. */
  fov: number;
  near: number;
  far: number;
  /** Undefined = this profile has no DOF opinion (sharp-everywhere shots like an establishing
   * wide or first-person POV, where blurring the world would fight the shot's purpose). */
  dofBlurStrength?: number;
}

const PROFILES: Record<CinematicCameraProfile, ProfileSpec> = {
  // Wide facility establishing shot: everything sharp, wide FOV to read the whole room. Matches
  // the flagship lab's proven WIDE framing FOV.
  WIDE_ESTABLISHING: { fov: 68, near: 0.05, far: 100 },
  // A tight lens on the hero object with a moderate, cinematic falloff — the object stays sharp,
  // the room behind it softens just enough to read as depth, not a gimmick.
  HERO_CLOSE_UP: { fov: 40, near: 0.05, far: 50, dofBlurStrength: 0.35 },
  // First-person: sharp everywhere by design — a scientist's own vision isn't selectively blurred,
  // and DOF here would fight the sense of physically occupying the space.
  SCIENTIST_POV: { fov: 68, near: 0.03, far: 100 },
  // Very tight lens for a sensor/sample close-up — strong falloff, matching real macro photography.
  MACRO_DETAIL: { fov: 28, near: 0.02, far: 20, dofBlurStrength: 0.55 },
  // A tighter insert on a control panel/instrument readout — sharp on the readout, soft behind it.
  INSTRUMENT_INSERT: { fov: 35, near: 0.03, far: 30, dofBlurStrength: 0.4 },
};

/** Applies a named cinematic profile's lens settings (FOV/near/far) to `camera` and updates its
 * projection matrix. Does not move or aim the camera — see the module doc above. */
export function configureCinematicCamera(camera: THREE_NS.PerspectiveCamera, profile: CinematicCameraProfile): void {
  const spec = PROFILES[profile];
  camera.fov = spec.fov;
  camera.near = spec.near;
  camera.far = spec.far;
  camera.updateProjectionMatrix();
}

/**
 * Returns the DOF settings a given profile recommends at `focusDistance` — the one number this
 * module can't know on its own (it depends on where the camera actually is relative to its
 * subject, which is scene-composition knowledge). A profile with no DOF opinion (WIDE_ESTABLISHING,
 * SCIENTIST_POV) returns `{ enabled: false, ... }`, so passing the result straight into
 * `setupGraphicsPipeline`'s `depthOfField` option is always safe.
 */
export function recommendedDofForProfile(profile: CinematicCameraProfile, focusDistance: number): DepthOfFieldSettings {
  const spec = PROFILES[profile];
  if (spec.dofBlurStrength === undefined) return { enabled: false, focusDistance };
  return { enabled: true, focusDistance, blurStrength: spec.dofBlurStrength };
}

/**
 * Smoothly transitions a focus distance toward a target over time — a "focus pull," the
 * cinematography term for racking focus from one subject to another instead of snapping. Generic
 * and stateful on purpose: the world-builder's render loop calls `.update(dt)` each frame and
 * feeds the result into `GraphicsPipeline.setFocusDistance()`; this class has no idea what's in
 * the scene or why the focus is changing.
 */
export class FocusPuller {
  private current: number;
  private target: number;

  constructor(initialDistance: number) {
    this.current = initialDistance;
    this.target = initialDistance;
  }

  /** Sets a new target distance — the puller eases toward it over subsequent `update()` calls
   * rather than snapping immediately. */
  pullTo(distance: number): void {
    this.target = distance;
  }

  /** Jumps straight to `distance` with no transition — for a hard cut, not a rack focus. */
  snapTo(distance: number): void {
    this.current = distance;
    this.target = distance;
  }

  /** Advances the transition by `dt` seconds. `speed` controls how quickly focus catches up
   * (higher = snappier); default suits a deliberate, readable rack focus rather than an
   * instant snap or an unnaturally slow drift. Returns the current distance for convenience. */
  update(dt: number, speed = 3): number {
    this.current += (this.target - this.current) * Math.min(1, Math.max(0, dt) * speed);
    return this.current;
  }

  get value(): number {
    return this.current;
  }

  get isSettled(): boolean {
    return Math.abs(this.target - this.current) < 1e-3;
  }
}
