import type * as THREE_NS from 'three';

/**
 * GENESIS GRAPHICS RUNTIME — Camera Rig
 *
 * Answers "given this intent and this target, where does the camera actually sit and what does it
 * look at" — the half of cinematic camera work `cinematicCamera.ts` explicitly disclaims ("It never
 * decides WHERE the camera sits or WHAT it looks at"). That module owns the LENS (FOV/near/far/DOF)
 * for a named shot; this module owns the TRANSFORM (position/orientation) for a named intent. Two
 * different concerns, composable: a caller typically calls both for one shot.
 *
 * THE BOUNDARY THIS MODULE ENFORCES: it takes an abstract intent plus a target point/scale — never
 * a domain decision about WHAT the target IS or WHY it was chosen. "Frame a SCIENTIST_POV shot on
 * this chamber" is this module's job; "the chamber is the interesting thing right now" is the
 * caller's (Looking Glass / C1's `WorldCameraMode`-shaped intent, or a scene's own state machine).
 * This module has no idea what a chamber is, an agent is, or a molecule is — only a position and a
 * characteristic size.
 *
 * SCALE-AWARE BY CONSTRUCTION: standoff distance is `targetRadius * a per-intent multiplier`, never
 * an absolute meter value — the same intent produces a sensible framing whether `targetRadius` is
 * 0.01 (a molecule) or 1e4 (a city district). There is deliberately no hardcoded coordinate table
 * here (contrast with the anti-pattern this replaces: a fixed per-scene preset->coordinates map).
 *
 * The per-intent multiplier/elevation defaults below are a reasonable, tunable STARTING POINT for
 * readable framing — not a claim of "correct" cinematography. Override via
 * `standoffMultiplier`/`elevationDeg` once a real scene's own scale/composition needs differ.
 *
 * MOBILITY: each intent also carries a default `CameraMobility` (`STATIC`/`FOLLOW`/`ORBIT`/`FREE`)
 * — a hint for how the rig behaves over time once framed, not a new positioning concept:
 *  - `STATIC`/`FREE` just hold the last `frame()`/`cut()` shot (`FREE` additionally signals "an
 *    external controller, e.g. first-person input, may be driving the real camera instead — don't
 *    assume this rig's output is authoritative every frame").
 *  - `FOLLOW` re-resolves the shot against a live-tracked target every `update()` (see `setTarget`)
 *    and eases toward it, for "keep this moving subject nicely framed."
 *  - `ORBIT` auto-advances azimuth over time (see `setOrbitSpeed`) for a turntable-style reveal,
 *    optionally also around a live-tracked moving target.
 */

/**
 * Superset of `core/world/cameraPolicy.ts`'s `WorldCameraMode` (`HUMAN_EYE`/`WIDE`/`MACRO`/
 * `SCIENTIFIC`/`CINEMATIC`) — those five map straight onto this type with no translation, so a
 * `CameraPolicyDecision.mode` can be passed here directly. The extra values
 * (`SCIENTIST_POV`/`MICRO`/`DRIVER`/`ORBITAL`) are additional vantages this engine can already
 * resolve to a transform, for whenever the world-direction layer starts emitting them.
 */
export type CameraIntent =
  | 'WIDE' | 'HUMAN_EYE' | 'SCIENTIST_POV' | 'MACRO' | 'MICRO'
  | 'SCIENTIFIC' | 'CINEMATIC' | 'DRIVER' | 'ORBITAL';

export type CameraMobility = 'STATIC' | 'FOLLOW' | 'ORBIT' | 'FREE';

interface IntentFraming {
  /** Standoff distance as a multiple of `targetRadius`. */
  standoffMultiplier: number;
  /** Degrees above the horizontal plane through the target. */
  elevationDeg: number;
  /** See the module doc's "MOBILITY" section. */
  mobility: CameraMobility;
}

const INTENT_FRAMING: Record<CameraIntent, IntentFraming> = {
  WIDE: { standoffMultiplier: 4.5, elevationDeg: 32, mobility: 'STATIC' },
  HUMAN_EYE: { standoffMultiplier: 2.4, elevationDeg: 8, mobility: 'FREE' },
  SCIENTIST_POV: { standoffMultiplier: 1.15, elevationDeg: 3, mobility: 'FREE' },
  MACRO: { standoffMultiplier: 0.55, elevationDeg: 18, mobility: 'ORBIT' },
  MICRO: { standoffMultiplier: 0.12, elevationDeg: 12, mobility: 'ORBIT' },
  SCIENTIFIC: { standoffMultiplier: 2.8, elevationDeg: 28, mobility: 'STATIC' },
  CINEMATIC: { standoffMultiplier: 3.2, elevationDeg: 22, mobility: 'FOLLOW' },
  DRIVER: { standoffMultiplier: 0.35, elevationDeg: 1, mobility: 'FOLLOW' },
  ORBITAL: { standoffMultiplier: 5.5, elevationDeg: 55, mobility: 'ORBIT' },
};

/** The mobility an intent defaults to — exposed so a caller can decide up front whether it needs to drive `setTarget`/`setOrbitSpeed` itself. */
export function defaultMobilityFor(intent: CameraIntent): CameraMobility {
  return INTENT_FRAMING[intent].mobility;
}

export interface CameraFrameRequest {
  intent: CameraIntent;
  /** World point the shot is framed around — never a decision this module makes, always supplied
   * by the caller (world-direction layer, or a scene's own selection/focus state). */
  target: THREE_NS.Vector3Tuple;
  /** Characteristic size of the subject (its bounding radius, roughly) — the ONE input that makes
   * this scale-aware. Default 1 (a human-scale subject) when the caller doesn't know/care. */
  targetRadius?: number;
  /** Orbit angle around the target, degrees, 0 = +Z. Lets a caller pick a viewing side (or animate
   * one) without touching the intent's own distance/elevation tuning. Default 0. */
  azimuthDeg?: number;
  /** Overrides `INTENT_FRAMING`'s standoff multiplier for this call — for a scene whose own
   * composition needs differ from the generic default, after profiling/reviewing it (same
   * "override after measuring, don't change the global default" convention as
   * `GraphicsPipelineOptions.ambientOcclusion`). */
  standoffMultiplier?: number;
  /** Overrides `INTENT_FRAMING`'s elevation for this call. */
  elevationDeg?: number;
}

export interface CameraTransform {
  position: THREE_NS.Vector3Tuple;
  lookAt: THREE_NS.Vector3Tuple;
}

/**
 * Resolves an intent + target + scale into an actual camera position/lookAt — pure function, no
 * THREE dependency (plain trig on tuples), so it's testable and usable anywhere, including outside
 * a THREE-aware caller. See the module doc for why standoff is scale-relative, not absolute.
 */
export function resolveCameraFraming(request: CameraFrameRequest): CameraTransform {
  const targetRadius = request.targetRadius ?? 1;
  if (!(targetRadius > 0)) throw new Error(`resolveCameraFraming: targetRadius must be > 0 (got ${targetRadius})`);
  const defaults = INTENT_FRAMING[request.intent];
  const standoffMultiplier = request.standoffMultiplier ?? defaults.standoffMultiplier;
  const elevationDeg = request.elevationDeg ?? defaults.elevationDeg;
  const azimuthDeg = request.azimuthDeg ?? 0;

  const distance = targetRadius * standoffMultiplier;
  const elevationRad = (elevationDeg * Math.PI) / 180;
  const azimuthRad = (azimuthDeg * Math.PI) / 180;
  const horizontalRadius = distance * Math.cos(elevationRad);
  const [tx, ty, tz] = request.target;

  return {
    position: [
      tx + horizontalRadius * Math.sin(azimuthRad),
      ty + distance * Math.sin(elevationRad),
      tz + horizontalRadius * Math.cos(azimuthRad),
    ],
    lookAt: [tx, ty, tz],
  };
}

/**
 * Stateful rig for smooth camera transitions between shots — the position/orientation counterpart
 * to `cinematicCamera.ts`'s `FocusPuller` (which only eases a scalar focus distance). A caller's
 * render loop calls `.update(dt)` every frame and applies the returned transform to the real
 * `camera.position`/`camera.lookAt`; this class has no idea it's driving a THREE.Camera at all.
 *
 * `frame()` eases toward a new shot (a "reposition" cut with continuous motion — e.g. a tracking
 * shot retargeting smoothly); `cut()` snaps immediately (a hard edit between two unrelated shots).
 * Same `frame`-eases/`cut`-snaps split as `FocusPuller`'s `pullTo`/`snapTo`.
 *
 * `setTarget`/`setOrbitSpeed` add live motion on top of a framed shot for `FOLLOW`/`ORBIT`
 * mobility (see the module doc) — `STATIC`/`FREE` intents ignore both and simply hold.
 */
export class CameraRig {
  private readonly currentPosition: THREE_NS.Vector3;
  private readonly currentLookAt: THREE_NS.Vector3;
  private readonly targetPosition: THREE_NS.Vector3;
  private readonly targetLookAt: THREE_NS.Vector3;

  private request: CameraFrameRequest;
  private mobility: CameraMobility;
  private liveTarget: THREE_NS.Vector3Tuple | null = null;
  private orbitAzimuthDeg = 0;
  private orbitSpeedDegPerS = 8;

  constructor(THREE: typeof THREE_NS, initial: CameraFrameRequest) {
    this.request = initial;
    this.mobility = defaultMobilityFor(initial.intent);
    const transform = resolveCameraFraming(initial);
    this.currentPosition = new THREE.Vector3(...transform.position);
    this.currentLookAt = new THREE.Vector3(...transform.lookAt);
    this.targetPosition = this.currentPosition.clone();
    this.targetLookAt = this.currentLookAt.clone();
  }

  get currentMobility(): CameraMobility {
    return this.mobility;
  }

  /** Sets a new target shot — the rig eases toward it over subsequent `update()` calls. Clears any live-tracked target from a previous shot (call `setTarget` again to re-establish tracking for the new one). */
  frame(request: CameraFrameRequest): void {
    this.request = request;
    this.mobility = defaultMobilityFor(request.intent);
    this.orbitAzimuthDeg = request.azimuthDeg ?? 0;
    this.liveTarget = null;
    const transform = resolveCameraFraming(request);
    this.targetPosition.set(...transform.position);
    this.targetLookAt.set(...transform.lookAt);
  }

  /** Jumps straight to the requested shot with no transition — a hard cut, not a move. */
  cut(request: CameraFrameRequest): void {
    this.frame(request);
    this.currentPosition.copy(this.targetPosition);
    this.currentLookAt.copy(this.targetLookAt);
  }

  /**
   * Live target position for `FOLLOW`/`ORBIT` mobility — call every frame with the tracked
   * entity's current position; takes effect starting the next `update()`. No effect for
   * `STATIC`/`FREE` mobility.
   */
  setTarget(target: THREE_NS.Vector3Tuple): void {
    this.liveTarget = target;
  }

  /** Sets how fast `ORBIT` mobility auto-rotates (degrees/second). */
  setOrbitSpeed(degreesPerSecond: number): void {
    this.orbitSpeedDegPerS = degreesPerSecond;
  }

  /** Advances the transition by `dt` seconds. `speed` controls how quickly `FOLLOW`/settling
   * catches up (higher = snappier); default suits a deliberate, readable move rather than an
   * instant snap or an unnaturally slow drift — same shape as `FocusPuller.update`'s own default.
   * `ORBIT` mobility ignores `speed` — it always sits exactly on its circle, never lagging.
   * Returns the current transform for convenience. */
  update(dt: number, speed = 2.5): CameraTransform {
    if (this.mobility === 'ORBIT') {
      this.orbitAzimuthDeg += this.orbitSpeedDegPerS * dt;
      const effective: CameraFrameRequest = {
        ...this.request,
        target: this.liveTarget ?? this.request.target,
        azimuthDeg: (this.request.azimuthDeg ?? 0) + this.orbitAzimuthDeg,
      };
      const transform = resolveCameraFraming(effective);
      this.currentPosition.set(...transform.position);
      this.currentLookAt.set(...transform.lookAt);
      this.targetPosition.copy(this.currentPosition);
      this.targetLookAt.copy(this.currentLookAt);
      return { position: this.currentPosition.toArray(), lookAt: this.currentLookAt.toArray() };
    }

    if (this.mobility === 'FOLLOW' && this.liveTarget) {
      const transform = resolveCameraFraming({ ...this.request, target: this.liveTarget });
      this.targetPosition.set(...transform.position);
      this.targetLookAt.set(...transform.lookAt);
    }

    const t = Math.min(1, Math.max(0, dt) * speed);
    this.currentPosition.lerp(this.targetPosition, t);
    this.currentLookAt.lerp(this.targetLookAt, t);
    return { position: this.currentPosition.toArray(), lookAt: this.currentLookAt.toArray() };
  }

  get isSettled(): boolean {
    return this.currentPosition.distanceToSquared(this.targetPosition) < 1e-6
      && this.currentLookAt.distanceToSquared(this.targetLookAt) < 1e-6;
  }
}
