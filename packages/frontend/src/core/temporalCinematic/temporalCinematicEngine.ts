import { boundsCenter } from '../worldModel/ecs/geometry';
import { createScientificWorld, type CreateScientificWorldResult } from '../worldModel/orchestration/createScientificWorld';
import { buildWalkCameraPath, getRoadByIndex, type CameraPath } from './cameraPath';
import { buildHistoricalWorldSpecification, populateHistoricalPedestrians, type HistoricalWorldRequest } from './historicalWorldParameters';
import { applyGeometryRenderReadiness, type RenderReadinessReport } from './renderReadiness';
import type { CameraMode } from './promptParser';

/**
 * Canonical Temporal Cinematic orchestration. V6 only adds the option to ask the existing world
 * generator for real interiors; WorldSpecification -> WorldGraph -> TemporalEngine stays unchanged.
 */
export interface BuildHistoricalSceneOptions {
  readonly place: string;
  readonly year: number;
  readonly durationSeconds?: number;
  readonly cameraMode?: CameraMode;
  readonly roadIndex?: number;
  readonly generateInteriors?: boolean;
}

export interface HistoricalSceneCameraBlocked { readonly ok: false; readonly reason: string; }
export interface HistoricalScene {
  readonly place: string;
  readonly year: number;
  readonly world: CreateScientificWorldResult;
  readonly renderReadiness: RenderReadinessReport;
  readonly camera: CameraPath | HistoricalSceneCameraBlocked;
}

export function buildHistoricalScene(options: BuildHistoricalSceneOptions): HistoricalScene {
  const request: HistoricalWorldRequest = {
    place: options.place,
    year: options.year,
    generateInteriors: options.generateInteriors ?? false,
  };
  const specification = buildHistoricalWorldSpecification(request);
  const world = createScientificWorld({ kind: 'specification', specification });
  const renderReadiness = applyGeometryRenderReadiness(world.engine.graph);
  populateHistoricalPedestrians(world.engine.graph, specification.worldId);
  const camera = resolveCameraPath(world, options.cameraMode ?? 'walk', options);
  return { place: options.place, year: options.year, world, renderReadiness, camera };
}

function resolveCameraPath(
  world: CreateScientificWorldResult,
  cameraMode: CameraMode,
  options: BuildHistoricalSceneOptions,
): CameraPath | HistoricalSceneCameraBlocked {
  if (cameraMode !== 'walk') {
    return { ok: false, reason: `Camera mode "${cameraMode}" is deferred cinematic polish — only "walk" is implemented by the canonical path.` };
  }
  const roadIndex = options.roadIndex ?? 0;
  const road = getRoadByIndex(world.engine.graph, roadIndex);
  if (!road) return { ok: false, reason: `World "${world.worldId}" has no generated road at index ${roadIndex}.` };
  const pointsOfInterest = world.engine.graph.listEntities()
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
  readonly sameStreetLocation: boolean;
  readonly skylineDiffers: boolean;
}

export function compareSameStreetAcrossYears(place: string, yearA: number, yearB: number, roadIndex = 0): SameStreetComparison {
  const sceneA = buildHistoricalScene({ place, year: yearA, roadIndex });
  const sceneB = buildHistoricalScene({ place, year: yearB, roadIndex });
  const cameraA = sceneA.camera;
  const cameraB = sceneB.camera;
  const sameStreetLocation = 'startPoint' in cameraA && 'startPoint' in cameraB
    && cameraA.startPoint.x === cameraB.startPoint.x && cameraA.startPoint.z === cameraB.startPoint.z
    && cameraA.endPoint.x === cameraB.endPoint.x && cameraA.endPoint.z === cameraB.endPoint.z;
  const buildingsA = sceneA.world.engine.graph.listEntities().filter((e) => e.geometry?.kind === 'BUILDING');
  const buildingsB = sceneB.world.engine.graph.listEntities().filter((e) => e.geometry?.kind === 'BUILDING');
  const floorsA = buildingsA.map((b) => (b.geometry?.kind === 'BUILDING' ? b.geometry.floorCount : 0));
  const floorsB = buildingsB.map((b) => (b.geometry?.kind === 'BUILDING' ? b.geometry.floorCount : 0));
  const skylineDiffers = floorsA.length === floorsB.length && floorsA.some((f, i) => f !== floorsB[i]);
  return { place, yearA, yearB, sceneA, sceneB, sameStreetLocation, skylineDiffers };
}
