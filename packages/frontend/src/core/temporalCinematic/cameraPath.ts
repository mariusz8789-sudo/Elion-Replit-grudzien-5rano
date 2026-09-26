import type { Vector3, WorldModelEntity } from '../worldModel/ecs/types';
import type { WorldGraph } from '../worldModel/ecs/worldGraph';

/**
 * TEMPORAL CINEMATIC ENGINE — CAMERA PATH (walk-down-a-street mode only).
 *
 * Deliberately the SIMPLEST correct camera path for the current phase: a
 * straight-line sample along one ROAD entity's own `start`→`end` geometry
 * (generation/geometry/roadGenerator.ts), eye-height above the road surface.
 * This is enough to satisfy "kamera idzie ulicą" (camera walks down the
 * street) and the "same street, two years" comparison, without depending on
 * the NAV_NODE/NAV_EDGE graph (`queries/worldQueries.ts::findNavigationPath`)
 * — that graph is for indoor/multi-building pathing and is explicitly an
 * opt-in, heavier phase (`StructuralDetailSpec.generateNavigation`).
 * Multiple camera MODES (drive/aerial) and turning at intersections are
 * explicitly DEFERRED cinematic polish (see the user's own phasing), not
 * part of this walk-camera's job.
 */

const EYE_HEIGHT_M = 1.7;
const DEFAULT_WALK_SPEED_MS = 1.4; // an average human walking pace

export interface CameraKeyframe {
  readonly t: number; // seconds from the start of the shot
  readonly position: Vector3;
  readonly lookAt: Vector3;
}

export interface CameraPath {
  readonly roadEntityId: string;
  readonly startPoint: { x: number; z: number };
  readonly endPoint: { x: number; z: number };
  readonly totalDistanceM: number;
  readonly durationSeconds: number;
  readonly keyframes: readonly CameraKeyframe[];
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

/**
 * Samples a camera path continuously at an arbitrary time. The sample is a
 * pure interpolation of the two canonical keyframes bracketing `seconds`;
 * it never chooses a nearest frame, so seeking and replay are stable between
 * capture-frame timestamps as well as exactly on them.
 */
export function sampleCameraPath(path: CameraPath, seconds: number): CameraKeyframe {
  const frames = path.keyframes;
  if (frames.length === 0) throw new Error('sampleCameraPath: camera path has no keyframes');
  const t = Math.max(frames[0]!.t, Math.min(frames[frames.length - 1]!.t, Number.isFinite(seconds) ? seconds : 0));
  if (t <= frames[0]!.t) return { ...frames[0]!, t };
  if (t >= frames[frames.length - 1]!.t) return { ...frames[frames.length - 1]!, t };

  let low = 0;
  let high = frames.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >>> 1;
    if (frames[mid]!.t <= t) low = mid;
    else high = mid;
  }
  const a = frames[low]!;
  const b = frames[high]!;
  const span = b.t - a.t;
  const u = span > 0 ? (t - a.t) / span : 0;
  return {
    t,
    position: {
      x: lerp(a.position.x, b.position.x, u),
      y: lerp(a.position.y, b.position.y, u),
      z: lerp(a.position.z, b.position.z, u),
    },
    lookAt: {
      x: lerp(a.lookAt.x, b.lookAt.x, u),
      y: lerp(a.lookAt.y, b.lookAt.y, u),
      z: lerp(a.lookAt.z, b.lookAt.z, u),
    },
  };
}

/** The Nth road generated for this world (0-indexed, in `roadGenerator.ts`'s own deterministic emission order) — the SAME index resolves to the SAME (start,end) position across two worlds built from the same place, regardless of year (see historicalWorldParameters.ts's own doc on why). Returns `undefined` if the world has fewer than `index + 1` roads. */
export function getRoadByIndex(graph: WorldGraph, index: number): WorldModelEntity | undefined {
  const roads = graph.listEntities().filter((e) => e.geometry?.kind === 'ROAD');
  return roads[index];
}

export interface BuildWalkCameraPathOptions {
  readonly durationSeconds?: number;
  readonly frameRate?: number;
  readonly reverse?: boolean;
  /**
   * Real building centers (`boundsCenter` of each generated BUILDING's
   * `geometry.bounds`) to glance toward while walking. A pure forward-facing
   * camera down a boundary road (a real, confirmed case: the districts this
   * road borders sit entirely on ONE side, tens of meters off-axis) never
   * brings a single building inside a normal ~50 degree FOV, which would
   * make "walking down the street" show nothing but empty road and sky —
   * technically real capture, but not an honest demonstration of the
   * generated city. When the nearest point of interest is within
   * `POI_LOOK_RADIUS_M`, the look-at target blends toward it instead of
   * straight ahead; farther than that, this is identical to the
   * pure-forward behavior. Never invents a position: every value here must
   * come from the SAME generated graph the camera walks through.
   */
  readonly pointsOfInterest?: readonly { x: number; z: number }[];
}

const POI_LOOK_RADIUS_M = 150;

function nearestPoint(from: { x: number; z: number }, points: readonly { x: number; z: number }[]): { x: number; z: number; distance: number } | null {
  let best: { x: number; z: number; distance: number } | null = null;
  for (const p of points) {
    const distance = Math.hypot(p.x - from.x, p.z - from.z);
    if (!best || distance < best.distance) best = { x: p.x, z: p.z, distance };
  }
  return best;
}

/**
 * Samples `frameRate * durationSeconds` (default 24fps) evenly-spaced
 * keyframes walking from `road.start` to `road.end` (or the reverse), at a
 * constant eye height, looking a fixed distance ahead along the direction
 * of travel (or toward a nearby point of interest — see
 * `BuildWalkCameraPathOptions.pointsOfInterest`). Throws if `road` is not a
 * ROAD-geometry entity — never silently no-ops on the wrong entity kind.
 */
export function buildWalkCameraPath(road: WorldModelEntity, options: BuildWalkCameraPathOptions = {}): CameraPath {
  if (road.geometry?.kind !== 'ROAD') {
    throw new Error(`buildWalkCameraPath: entity "${road.id}" is not a ROAD geometry entity (got "${road.geometry?.kind ?? 'none'}")`);
  }
  const { start, end } = road.geometry;
  const [from, to] = options.reverse ? [end, start] : [start, end];
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const totalDistanceM = Math.hypot(dx, dz);
  const durationSeconds = options.durationSeconds ?? Math.max(1, totalDistanceM / DEFAULT_WALK_SPEED_MS);
  const frameRate = options.frameRate ?? 24;
  const frameCount = Math.max(2, Math.round(durationSeconds * frameRate));

  const dirX = totalDistanceM > 0 ? dx / totalDistanceM : 0;
  const dirZ = totalDistanceM > 0 ? dz / totalDistanceM : 1;

  const keyframes: CameraKeyframe[] = [];
  for (let i = 0; i < frameCount; i++) {
    const u = i / (frameCount - 1);
    const t = u * durationSeconds;
    const x = from.x + dx * u;
    const z = from.z + dz * u;
    const forwardLookAt = { x: x + dirX * 5, z: z + dirZ * 5 };
    const poi = options.pointsOfInterest ? nearestPoint({ x, z }, options.pointsOfInterest) : null;
    // Look directly at the nearest real building within range, rather than a diluted blend — the
    // same cinematic convention as a walking tour glancing at whatever landmark is closest, and the
    // only choice that reliably brings a real (if distant) generated structure into a normal FOV.
    const lookAtXZ = poi && poi.distance <= POI_LOOK_RADIUS_M ? { x: poi.x, z: poi.z } : forwardLookAt;
    keyframes.push({
      t,
      position: { x, y: EYE_HEIGHT_M, z },
      lookAt: { x: lookAtXZ.x, y: EYE_HEIGHT_M, z: lookAtXZ.z },
    });
  }

  return {
    roadEntityId: road.id,
    startPoint: from,
    endPoint: to,
    totalDistanceM,
    durationSeconds,
    keyframes,
  };
}
