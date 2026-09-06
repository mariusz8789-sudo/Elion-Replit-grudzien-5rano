import type * as THREE_NS from 'three';
import type { Shot, ShotPlan } from '../lookingGlass/shotPlan';
import { CameraRig, type CameraFrameRequest, type CameraIntent } from './graphics/cameraRig';
import { CameraSequence, type CameraSequenceStep } from './graphics/cameraSequence';

/**
 * DISCOVERED INTEGRATION GAP (found by this bridge's own tests, not assumed away): `shotPlan.ts`'s
 * `rankMarkers()` falls back to the literal `'OBSERVER'` (cast `as WorldCameraMode`) for an event
 * type `cameraModeForEventType` has no opinion about — but `'OBSERVER'` is a member of neither
 * `WorldCameraMode` (`core/world/cameraPolicy.ts`: `HUMAN_EYE|WIDE|MACRO|SCIENTIFIC|CINEMATIC`) NOR
 * `CameraIntent` (this engine's own superset). The cast makes TypeScript accept it; at runtime it's
 * a value that satisfies neither contract. This file does not own `shotPlan.ts` and does not fix it
 * there — but a rendering engine consuming an external contract must be robust to it being violated,
 * not crash on the first shot plan that happens to hit an event type with no configured camera
 * opinion. `coerceCameraIntent` is that guard: anything not in the known-good `CameraIntent` set
 * falls back to `'WIDE'`, matching `shotPlan.ts`'s OWN stated intent for this exact case ("an event
 * the policy has no opinion about still gets a shot... it observes rather than dramatises it") —
 * `'WIDE'` is already this module's own fallback for its two structural (ESTABLISH/RESULT) shots.
 */
const KNOWN_CAMERA_INTENTS: ReadonlySet<string> = new Set<CameraIntent>([
  'WIDE', 'HUMAN_EYE', 'SCIENTIST_POV', 'MACRO', 'MICRO', 'SCIENTIFIC', 'CINEMATIC', 'DRIVER', 'ORBITAL',
]);

function coerceCameraIntent(mode: string): CameraIntent {
  return (KNOWN_CAMERA_INTENTS.has(mode) ? mode : 'WIDE') as CameraIntent;
}

/**
 * GENESIS — Shot Plan Player (C1 ↔ C2 camera bridge)
 * ====================================================
 *
 * `core/lookingGlass/shotPlan.ts` (C1) already produces a real, tested `ShotPlan`: an ordered list
 * of `Shot`s, each carrying a `WorldCameraMode` and a tick range, motivated by a real event/
 * observation (`sourceMarkerId`) or marked as one of the two structural shots that legitimately have
 * none. As of this file, NOTHING in `core/three/` consumed that output — C1 could plan a cinematic
 * edit and C2 had no way to execute it. This file is that missing bridge, built ENTIRELY from
 * already-canonical C2 camera infrastructure (`graphics/cameraRig.ts`'s `CameraRig`,
 * `graphics/cameraSequence.ts`'s `CameraSequence`) — no second camera system, no new transform math.
 *
 * WHY THIS FILE LIVES OUTSIDE `graphics/`: `graphicsArchitectureBoundary.test.ts` forbids anything
 * under `core/three/graphics/` from importing `lookingGlass` (or any other simulation/world-domain
 * module) — that boundary is exactly what makes the graphics engine reusable independent of Genesis
 * science. This file is the composition point ABOVE that boundary: it imports both C1's `ShotPlan`
 * type and C2's `CameraRig`/`CameraSequence`, and does nothing else. It carries no camera transform
 * logic of its own — every actual position/orientation decision still happens inside `CameraRig`.
 *
 * `Shot['cameraMode']` (a `WorldCameraMode`) passes straight through to `CameraFrameRequest['intent']`
 * (a `CameraIntent`) for every value `WorldCameraMode` actually declares — `CameraIntent` is a
 * documented superset of it (see `graphics/README.md` §1). `coerceCameraIntent`, below, exists ONLY
 * for the one case where `shotPlan.ts` itself produces a value outside its own declared type (see
 * that function's own doc) — everything else is a structural pass-through, not a translation table
 * this file has to maintain.
 *
 * WHAT THIS FILE DOES **NOT** DO (the one real gap, by design): `ShotPlan` has no spatial data — a
 * `Shot` says WHEN and WHICH camera mode, never WHERE in the world. Resolving "where is the thing
 * `sourceMarkerId` refers to" is real domain knowledge (an event's location, an entity's position)
 * that only the scene/world layer has — so it is a required, caller-supplied `ShotTargetResolver`,
 * the exact same "domain knowledge enters through one caller-supplied function" pattern
 * `WorldFrameRenderer`'s `resolveVisual` already establishes. This file never guesses a position.
 */

export interface ShotTargetResolver {
  /** Resolves the world target this shot should frame — from whatever real state the caller (the
   * world-composition layer) already has for `shot.sourceMarkerId`/`shot.kind`. `targetRadius`
   * defaults to 1 (a human-scale subject) when omitted, matching `CameraFrameRequest`'s own default. */
  resolveTarget(shot: Shot): { target: THREE_NS.Vector3Tuple; targetRadius?: number };
}

export interface ShotPlanPlaybackOptions {
  /** How many real seconds one WORLD_TIME tick should take on screen. Ignored for STATE_INDEX-axis
   * shots (see below). Required — this file has no opinion on pacing; a 60-day epidemic run and a
   * 3-hour incident response compress time completely differently, and only the caller (the
   * scenario/playback layer) knows which. */
  secondsPerWorldTick: number;
  /** Real seconds a STATE_INDEX-axis shot (a cut to one experiment-run's state, not a point in world
   * time — see `ShotAxis`'s own doc) should hold once framed, regardless of its tick span (state
   * indices are not a duration). Default 3. */
  stateIndexHoldSeconds?: number;
  /** Hard-cut (no eased transition) into the FIRST shot of the sequence. Default true — a plan's
   * opening establishing shot should not visibly ease in from wherever the camera happened to be
   * before playback started. Every subsequent shot always eases via `CameraRig.frame()`, matching
   * `ShotPlan`'s own "no dramatized pacing beyond what's real" ethos: an eased move between two real
   * cuts is a camera-language convention, not an invented narrative beat.
   */
  cutFirstShot?: boolean;
}

/** Converts one `Shot` into a `CameraSequenceStep` — pure data mapping, no camera math. */
function shotToSequenceStep(shot: Shot, resolver: ShotTargetResolver, options: ShotPlanPlaybackOptions, isFirst: boolean): CameraSequenceStep {
  const { target, targetRadius } = resolver.resolveTarget(shot);
  const request: CameraFrameRequest = { intent: coerceCameraIntent(shot.cameraMode), target, targetRadius };
  const holdSeconds = shot.axis === 'WORLD_TIME'
    ? Math.max(0, (shot.toTick - shot.fromTick) * options.secondsPerWorldTick)
    : (options.stateIndexHoldSeconds ?? 3);
  return { request, holdSeconds, cut: isFirst && (options.cutFirstShot ?? true) };
}

/**
 * Builds a `CameraSequence` (already-canonical C2 infrastructure) that plays back `plan` on `rig`.
 * Returns `null` for an empty plan rather than a sequence with nothing to do — matches
 * `CameraSequence`'s own `isFinished` convention for a zero-step list, made explicit at the call site
 * instead of silently constructing a no-op.
 */
export function buildCameraSequenceFromShotPlan(
  rig: CameraRig,
  plan: ShotPlan,
  resolver: ShotTargetResolver,
  options: ShotPlanPlaybackOptions,
): CameraSequence | null {
  if (plan.shots.length === 0) return null;
  const steps = plan.shots.map((shot, index) => shotToSequenceStep(shot, resolver, options, index === 0));
  return new CameraSequence(rig, steps);
}
