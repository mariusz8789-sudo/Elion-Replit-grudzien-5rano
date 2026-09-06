import type * as THREE_NS from 'three';

/**
 * GENESIS GRAPHICS RUNTIME — Camera Rig
 *
 * Turns a declarative camera INTENT (vantage + target + optional bounds/
 * standoff/elevation/framing) into an actual camera transform. This is the
 * missing piece `cinematicCamera.ts` names but doesn't build (see its
 * module doc: "that's `graphics/cameraRig.ts`-shaped scene-composition
 * knowledge"). The two modules stay separate on purpose:
 *
 *  - `cinematicCamera.ts` answers "what LENS does shot X use" (FOV/near/far/DOF).
 *  - `cameraRig.ts` (this file) answers "WHERE does the camera sit and what
 *    does it look at" for a named VANTAGE, and how it gets there (a hard
 *    cut, a smooth move, a cinematic ease, an orbit, a follow).
 *
 * Neither module decides WHAT should be observed or WHEN a cut happens —
 * that intent comes from the caller (the World/Looking-Glass layer, which
 * in turn takes direction from C1). This rig never reads scientific state,
 * never knows about labs/cities/molecules by name, and never hardcodes a
 * world's coordinates — it only resolves the generic vocabulary below into
 * a transform, which is exactly what makes it reusable across every world
 * (CITY/LAB/NATURE/SCIENTIFIC/MICRO/MACRO) instead of each world hand-
 * rolling its own `xPresetFor()` camera math.
 */

export type CameraVantage =
  | 'WIDE'
  | 'HUMAN_EYE'
  | 'SCIENTIST_POV'
  | 'MACRO'
  | 'MICRO'
  | 'SCIENTIFIC'
  | 'CINEMATIC'
  | 'DRIVER'
  | 'ORBITAL';

export type CameraFraming = 'FILL' | 'CONTEXT' | 'DETAIL';
export type CameraMobility = 'STATIC' | 'FOLLOW' | 'ORBIT' | 'FREE';
export type TransitionEase = 'LINEAR' | 'CINEMATIC';

export interface CameraBounds {
  /** World-space center of the subject/scene the shot should keep in frame. */
  center: THREE_NS.Vector3Tuple;
  /** Bounding-sphere radius (meters) of the subject/scene. */
  radius: number;
}

export interface CameraIntent {
  vantage: CameraVantage;
  /** World point the camera looks at / tracks. */
  target: THREE_NS.Vector3Tuple;
  /** When given, standoff is widened (never narrowed) so this sphere fits inside the resolved FOV. */
  bounds?: CameraBounds;
  /** Distance from target, meters. Overrides the vantage's own default when given. */
  standoff?: number;
  /** Vertical offset above target, meters. Overrides the vantage's own default when given. */
  elevation?: number;
  /** Horizontal orbit angle around target, radians. Default 0 (directly "south" of target on +Z). */
  azimuth?: number;
  /** Vertical FOV override in degrees — omit to use the vantage's own lens default. */
  fov?: number;
  /** How tightly the subject should fill the frame — nudges the resolved standoff. Default 'FILL'. */
  framing?: CameraFraming;
}

export interface ResolvedShot {
  position: THREE_NS.Vector3Tuple;
  lookAt: THREE_NS.Vector3Tuple;
  fov: number;
}

interface VantageSpec {
  standoff: number;
  elevation: number;
  fov: number;
  mobility: CameraMobility;
}

/**
 * Reusable spatial/lens defaults per vantage — the single source of truth a
 * world-builder would otherwise re-derive per world (a `labPresetFor`, a
 * `cityPresetFor`, ...). Every value here is a REASONABLE DEFAULT, not a
 * hardcoded coordinate: `resolveShot` always applies it relative to the
 * caller's own `target`/`bounds`, never to a fixed world position.
 */
const VANTAGE_DEFAULTS: Readonly<Record<CameraVantage, VantageSpec>> = {
  // Facility/city establishing shot: pulled back and slightly elevated to read the whole scene.
  WIDE: { standoff: 12, elevation: 6, fov: 60, mobility: 'STATIC' },
  // Average adult standing eye height, a comfortable conversational distance — free-roam by default.
  HUMAN_EYE: { standoff: 2.2, elevation: 1.65, fov: 60, mobility: 'FREE' },
  // First-person scientist viewpoint: close, sharp, at working height, fully free (a controller owns it).
  SCIENTIST_POV: { standoff: 0.6, elevation: 1.6, fov: 68, mobility: 'FREE' },
  // Close orbiting inspection of a bench-scale object (an apparatus, a specimen).
  MACRO: { standoff: 1.2, elevation: 0.4, fov: 45, mobility: 'ORBIT' },
  // Very close orbiting inspection — a sample/sensor/molecular-representation close-up.
  MICRO: { standoff: 0.15, elevation: 0.05, fov: 28, mobility: 'ORBIT' },
  // Analytical framing: pulled back enough to read instrumentation/labels, not a hero close-up.
  SCIENTIFIC: { standoff: 4, elevation: 2.2, fov: 50, mobility: 'STATIC' },
  // A directed, filmic shot that follows its subject with an eased, deliberate move.
  CINEMATIC: { standoff: 6, elevation: 2.5, fov: 40, mobility: 'FOLLOW' },
  // Chase/behind-vehicle framing — low, close behind, following.
  DRIVER: { standoff: 3.5, elevation: 1.4, fov: 62, mobility: 'FOLLOW' },
  // Slow automatic orbit around a subject/region — the classic "turntable" reveal.
  ORBITAL: { standoff: 10, elevation: 4, fov: 45, mobility: 'ORBIT' },
};

const FRAMING_MULTIPLIER: Readonly<Record<CameraFraming, number>> = {
  FILL: 1,
  CONTEXT: 1.6,
  DETAIL: 0.6,
};

function smootherstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function resolvedStandoff(intent: CameraIntent, spec: VantageSpec, fov: number): number {
  let standoff = intent.standoff ?? spec.standoff;
  if (intent.bounds && intent.bounds.radius > 0) {
    const fovRad = (fov * Math.PI) / 180;
    standoff = Math.max(standoff, intent.bounds.radius / Math.sin(fovRad / 2));
  }
  return standoff * FRAMING_MULTIPLIER[intent.framing ?? 'FILL'];
}

/**
 * Pure function: intent -> transform. No camera, no side effects — the
 * exact seam the mission's own testing example asks for ("Camera Rig:
 * intent → transform"). `CameraRig.cutTo`/`transitionTo` both build on
 * this; call it directly if you only need the numbers (e.g. a shot-list
 * planner previewing framing before committing to a camera move).
 *
 * NOT used by `CameraRig.update()`'s per-frame path (FOLLOW/ORBIT
 * mobility) — that path recomputes the same math directly into
 * pre-allocated scratch vectors instead of allocating a fresh result
 * object + two tuple arrays every frame. `graphicsCameraRig.test.ts`
 * asserts both paths agree on the same numbers for the same inputs.
 */
export function resolveShot(intent: CameraIntent): ResolvedShot {
  const spec = VANTAGE_DEFAULTS[intent.vantage];
  const fov = intent.fov ?? spec.fov;
  const standoff = resolvedStandoff(intent, spec, fov);
  const elevation = intent.elevation ?? spec.elevation;
  const azimuth = intent.azimuth ?? 0;
  const [tx, ty, tz] = intent.target;
  return {
    position: [tx + standoff * Math.sin(azimuth), ty + elevation, tz + standoff * Math.cos(azimuth)],
    lookAt: [tx, ty, tz],
    fov,
  };
}

/** The mobility a vantage defaults to when the caller doesn't override it — exposed so a caller can decide up front whether it needs to drive `setTarget`/orbit itself. */
export function defaultMobilityFor(vantage: CameraVantage): CameraMobility {
  return VANTAGE_DEFAULTS[vantage].mobility;
}

const DEFAULT_ORBIT_SPEED_RAD_PER_S = 0.12;
const DEFAULT_FOLLOW_DAMPING = 4.5;

/**
 * Stateful executor: owns turning `CameraIntent`s into actual movement on
 * one `THREE.PerspectiveCamera` over time. `update()` never allocates,
 * matching this engine's zero-per-frame-allocation rule (see
 * `PERFORMANCE.md`) — every per-frame path reuses scratch vectors created
 * once in the constructor.
 */
export class CameraRig {
  private readonly camera: THREE_NS.PerspectiveCamera;
  private readonly scratchPos: THREE_NS.Vector3;
  private readonly scratchLook: THREE_NS.Vector3;
  private readonly scratchFromPos: THREE_NS.Vector3;
  private readonly scratchFromLook: THREE_NS.Vector3;
  private readonly scratchLerpLook: THREE_NS.Vector3;
  private readonly liveTarget: THREE_NS.Vector3;
  private hasLiveTarget = false;

  private intent: CameraIntent | null = null;
  private mobility: CameraMobility = 'STATIC';
  private orbitAzimuth = 0;
  private orbitSpeed = DEFAULT_ORBIT_SPEED_RAD_PER_S;
  private followDamping = DEFAULT_FOLLOW_DAMPING;

  private transitionElapsed = 0;
  private transitionDuration = 0;
  private transitionEase: TransitionEase = 'CINEMATIC';
  private transitionTargetFov = 0;
  private transitioning = false;

  constructor(THREE: typeof THREE_NS, camera: THREE_NS.PerspectiveCamera) {
    this.camera = camera;
    this.scratchPos = new THREE.Vector3();
    this.scratchLook = new THREE.Vector3();
    this.scratchFromPos = new THREE.Vector3();
    this.scratchFromLook = new THREE.Vector3();
    this.scratchLerpLook = new THREE.Vector3();
    this.liveTarget = new THREE.Vector3();
  }

  get currentVantage(): CameraVantage | null {
    return this.intent?.vantage ?? null;
  }

  get currentMobility(): CameraMobility {
    return this.mobility;
  }

  get isTransitioning(): boolean {
    return this.transitioning;
  }

  /**
   * Live target position for `FOLLOW`/`ORBIT` mobility — cheap,
   * no-allocation; call every frame with the tracked entity's current
   * position. Cleared on the next `cutTo`/`transitionTo` (a new shot's own
   * declared `target` wins until tracking is (re-)established). No effect
   * for `STATIC`/`FREE` mobility.
   */
  setTarget(target: THREE_NS.Vector3Tuple): void {
    this.liveTarget.set(target[0], target[1], target[2]);
    this.hasLiveTarget = true;
  }

  /** Sets how fast `ORBIT` mobility auto-rotates (radians/second). */
  setOrbitSpeed(radiansPerSecond: number): void {
    this.orbitSpeed = radiansPerSecond;
  }

  /** Sets how quickly `FOLLOW` mobility catches up to a moving target (higher = snappier, matching `FocusPuller`'s convention). */
  setFollowDamping(damping: number): void {
    this.followDamping = damping;
  }

  /** Hard cut: applies the intent immediately, no transition. */
  cutTo(intent: CameraIntent): void {
    this.beginIntent(intent);
    const shot = resolveShot(intent);
    this.scratchLook.set(...shot.lookAt);
    this.camera.position.set(...shot.position);
    this.camera.lookAt(this.scratchLook);
    this.syncFov(shot.fov);
    this.transitioning = false;
  }

  /**
   * Begins a move to the intent over `durationSeconds` — `'CINEMATIC'`
   * (default) eases in and out (a filmic move); `'LINEAR'` moves at
   * constant speed (a mechanical/utility move, e.g. a fast preview cut).
   * `update(dt)` must be called each frame to advance it.
   */
  transitionTo(intent: CameraIntent, durationSeconds = 1.2, ease: TransitionEase = 'CINEMATIC'): void {
    this.scratchFromPos.copy(this.camera.position);
    this.camera.getWorldDirection(this.scratchFromLook);
    this.scratchFromLook.multiplyScalar(10).add(this.scratchFromPos); // a point 10m ahead along the current look direction

    this.beginIntent(intent);
    const shot = resolveShot(intent);
    this.scratchPos.set(...shot.position);
    this.scratchLook.set(...shot.lookAt);
    this.transitionTargetFov = shot.fov;
    this.transitionElapsed = 0;
    this.transitionDuration = Math.max(1e-6, durationSeconds);
    this.transitionEase = ease;
    this.transitioning = true;
  }

  /** Advances any in-flight transition, orbit rotation, or follow damping. Call once per frame. Allocates nothing. */
  update(dt: number): void {
    if (!this.intent) return;

    if (this.transitioning) {
      this.transitionElapsed += dt;
      const t = Math.min(1, this.transitionElapsed / this.transitionDuration);
      const eased = this.transitionEase === 'CINEMATIC' ? smootherstep(t) : t;
      this.camera.position.lerpVectors(this.scratchFromPos, this.scratchPos, eased);
      this.scratchLerpLook.lerpVectors(this.scratchFromLook, this.scratchLook, eased);
      this.camera.lookAt(this.scratchLerpLook);
      this.syncFov(this.transitionTargetFov);
      if (t >= 1) this.transitioning = false;
      return;
    }

    if (this.mobility === 'ORBIT') {
      this.orbitAzimuth += this.orbitSpeed * dt;
      this.recomputeShotInto(this.scratchPos, this.scratchLook);
      this.camera.position.copy(this.scratchPos);
      this.camera.lookAt(this.scratchLook);
      this.syncFov(this.effectiveFov());
    } else if (this.mobility === 'FOLLOW') {
      this.recomputeShotInto(this.scratchPos, this.scratchLook);
      const alpha = Math.min(1, Math.max(0, dt) * this.followDamping);
      this.camera.position.lerp(this.scratchPos, alpha);
      this.camera.lookAt(this.scratchLook);
      this.syncFov(this.effectiveFov());
    }
    // STATIC/FREE: nothing to advance per-frame — cutTo/transitionTo already placed the camera,
    // or (FREE) an external controller (e.g. firstPersonController.ts) owns it entirely.
  }

  private beginIntent(intent: CameraIntent): void {
    this.intent = intent;
    this.mobility = defaultMobilityFor(intent.vantage);
    this.orbitAzimuth = intent.azimuth ?? 0;
    this.hasLiveTarget = false;
  }

  private effectiveFov(): number {
    const intent = this.intent!;
    return intent.fov ?? VANTAGE_DEFAULTS[intent.vantage].fov;
  }

  /** Same math as `resolveShot`, written directly into pre-allocated scratch vectors — the zero-allocation per-frame path. Keep in sync with `resolveShot`; `graphicsCameraRig.test.ts` checks they agree. */
  private recomputeShotInto(outPos: THREE_NS.Vector3, outLook: THREE_NS.Vector3): void {
    const intent = this.intent!;
    const spec = VANTAGE_DEFAULTS[intent.vantage];
    const fov = intent.fov ?? spec.fov;
    const standoff = resolvedStandoff(intent, spec, fov);
    const elevation = intent.elevation ?? spec.elevation;
    const azimuth = this.orbitAzimuth;
    const tx = this.hasLiveTarget ? this.liveTarget.x : intent.target[0];
    const ty = this.hasLiveTarget ? this.liveTarget.y : intent.target[1];
    const tz = this.hasLiveTarget ? this.liveTarget.z : intent.target[2];
    outPos.set(tx + standoff * Math.sin(azimuth), ty + elevation, tz + standoff * Math.cos(azimuth));
    outLook.set(tx, ty, tz);
  }

  private syncFov(fov: number): void {
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
