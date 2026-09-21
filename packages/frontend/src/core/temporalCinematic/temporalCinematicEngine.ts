import { boundsCenter } from '../worldModel/ecs/geometry';
import { createScientificWorld, type CreateScientificWorldResult } from '../worldModel/orchestration/createScientificWorld';
import { buildWalkCameraPath, getRoadByIndex, type CameraPath } from './cameraPath';
import { buildHistoricalWorldSpecification, type HistoricalWorldRequest } from './historicalWorldParameters';
import { applyGeometryRenderReadiness, type RenderReadinessReport } from './renderReadiness';
import type { CameraMode } from './promptParser';

/**
 * TEMPORAL CINEMATIC ENGINE — TOP-LEVEL ORCHESTRATION.
 *
 * Composes ONLY existing, already-canonical seams — never a second
 * WorldGraph/WorldGenerator/TemporalEngine:
 *
 *   place+year -> WorldSpecification (historicalWorldParameters.ts)
 *     -> createScientificWorld  (orchestration/createScientificWorld.ts, UNCHANGED)
 *       -> real WorldGraph + TemporalEngine + WorldFrameState
 *   -> applyGeometryRenderReadiness (renderReadiness.ts, this layer's one real fix)
 *   -> buildWalkCameraPath (cameraPath.ts)
 *
 * What comes AFTER a `HistoricalScene` (feeding its `engine`/camera path
 * into the browser's `WorldFrameRenderer`, capturing frames, encoding a
 * video) is the NEXT phase — see renderRuntimeStatus.ts for exactly what is
 * and is not wired yet. Nothing in this file claims that later phase is
 * done.
 */

export interface BuildHistoricalSceneOptions {
  readonly place: string;
  readonly year: number;
  readonly durationSeconds?: number;
  readonly cameraMode?: CameraMode;
  /** Which generated road to point the camera at (0-indexed, deterministic — see cameraPath.ts::getRoadByIndex). Defaults to 0, the first generated road. */
  readonly roadIndex?: number;
}

export interface HistoricalSceneCameraBlocked {
  readonly ok: false;
  readonly reason: string;
}

export interface HistoricalScene {
  readonly place: string;
  readonly year: number;
  readonly world: CreateScientificWorldResult;
  readonly renderReadiness: RenderReadinessReport;
  readonly camera: CameraPath | HistoricalSceneCameraBlocked;
}

/**
 * Builds one real, tickable historical world for `(place, year)` and (when
 * `cameraMode` is `'walk'`, the only implemented mode) a camera path down
 * one of its generated streets. Throws exactly when
 * `generateSpecifiedWorld` would (an invalid specification or a structural
 * invariant violation) — never swallows a real generation failure.
 */
export function buildHistoricalScene(options: BuildHistoricalSceneOptions): HistoricalScene {
  const request: HistoricalWorldRequest = { place: options.place, year: options.year };
  const specification = buildHistoricalWorldSpecification(request);
  const world = createScientificWorld({ kind: 'specification', specification });
  const renderReadiness = applyGeometryRenderReadiness(world.engine.graph);

  const cameraMode = options.cameraMode ?? 'walk';
  const camera = resolveCameraPath(world, cameraMode, options);

  return { place: options.place, year: options.year, world, renderReadiness, camera };
}

function resolveCameraPath(
  world: CreateScientificWorldResult,
  cameraMode: CameraMode,
  options: BuildHistoricalSceneOptions,
): CameraPath | HistoricalSceneCameraBlocked {
  if (cameraMode !== 'walk') {
    return { ok: false, reason: `Camera mode "${cameraMode}" is deferred cinematic polish — only "walk" is implemented (see promptParser.ts's own scope note).` };
  }
  const roadIndex = options.roadIndex ?? 0;
  const road = getRoadByIndex(world.engine.graph, roadIndex);
  if (!road) {
    return { ok: false, reason: `World "${world.worldId}" has no generated road at index ${roadIndex}.` };
  }
  const pointsOfInterest = world.engine.graph
    .listEntities()
    .filter((e) => e.geometry?.kind === 'BUILDING')
    .map((e) => (e.geometry?.kind === 'BUILDING' ? boundsCenter(e.geometry.bounds) : null))
    .filter((p): p is { x: number; z: number } => p !== null);
  return buildWalkCameraPath(road, { durationSeconds: options.durationSeconds, pointsOfInterest });
}

export interface SameStreetComparison {
  readonly place: string;
  readonly yearA: number;
  readonly yearB: number;
  readonly sceneA: HistoricalScene;
  readonly sceneB: HistoricalScene;
  /** True iff the road both scenes' cameras point at sits at the EXACT same (start,end) position in both worlds — the honest, verifiable meaning of "the same street" across two independently generated worlds (see historicalWorldParameters.ts's own doc on the determinism mechanism this relies on). */
  readonly sameStreetLocation: boolean;
  /** True iff the two worlds' building geometry actually differs (proves the era parameterization did something, not just a location match). */
  readonly skylineDiffers: boolean;
}

/**
 * THE CRITICAL ACCEPTANCE CHECK: "Pokaż tę samą ulicę w 1900 i 2026."
 * Builds both years' worlds for `place`, points a walk camera at the SAME
 * road index in both, and reports (never asserts blindly) whether that
 * road is genuinely at the same location and whether the surrounding
 * skyline genuinely differs. A caller (a test, a UI, an E2E script) decides
 * what to do with a `false` — this function's job is only to produce the
 * real comparison, honestly.
 */
export function compareSameStreetAcrossYears(place: string, yearA: number, yearB: number, roadIndex = 0): SameStreetComparison {
  const sceneA = buildHistoricalScene({ place, year: yearA, roadIndex });
  const sceneB = buildHistoricalScene({ place, year: yearB, roadIndex });

  const cameraA = sceneA.camera;
  const cameraB = sceneB.camera;
  const sameStreetLocation =
    'startPoint' in cameraA &&
    'startPoint' in cameraB &&
    cameraA.startPoint.x === cameraB.startPoint.x &&
    cameraA.startPoint.z === cameraB.startPoint.z &&
    cameraA.endPoint.x === cameraB.endPoint.x &&
    cameraA.endPoint.z === cameraB.endPoint.z;

  const buildingsA = sceneA.world.engine.graph.listEntities().filter((e) => e.geometry?.kind === 'BUILDING');
  const buildingsB = sceneB.world.engine.graph.listEntities().filter((e) => e.geometry?.kind === 'BUILDING');
  const floorsA = buildingsA.map((b) => (b.geometry?.kind === 'BUILDING' ? b.geometry.floorCount : 0));
  const floorsB = buildingsB.map((b) => (b.geometry?.kind === 'BUILDING' ? b.geometry.floorCount : 0));
  const skylineDiffers = floorsA.length === floorsB.length && floorsA.some((f, i) => f !== floorsB[i]);

  return { place, yearA, yearB, sceneA, sceneB, sameStreetLocation, skylineDiffers };
}
