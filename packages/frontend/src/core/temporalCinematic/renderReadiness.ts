import { entityId, type EntityId, type Vector3, type WorldModelEntity } from '../worldModel/ecs/types';
import { boundsCenter, type Bounds2D } from '../worldModel/ecs/geometry';
import type { WorldGraph } from '../worldModel/ecs/worldGraph';
import type { EntityRef } from '../events/genesisEvent';

/**
 * TEMPORAL CINEMATIC — GEOMETRY RENDER READINESS, V6.
 *
 * Same canonical WorldGraph; this pass only derives renderer-facing spatial components from the
 * already-authoritative structural geometry. V6 extends the earlier BUILDING/ROAD pass to generated
 * FLOOR/ROOM/ASSET_SLOT geometry so a real scientific interior can be framed without a second world.
 */

const ZERO: Vector3 = { x: 0, y: 0, z: 0 };
const FLOOR_HEIGHT_M = 3.5;
const MIN_VISUAL_SCALE_M = 8;

function buildingScale(_bounds: Bounds2D, floorCount: number): number {
  return Math.max(floorCount * FLOOR_HEIGHT_M, MIN_VISUAL_SCALE_M);
}

function floorLevel(graph: WorldGraph, floorRef: EntityRef): number {
  const floor = graph.tryGetEntity(entityId(floorRef));
  return floor?.geometry?.kind === 'FLOOR' ? floor.geometry.level : 0;
}

function roomFloorLevel(graph: WorldGraph, roomRef: EntityRef): number {
  const room = graph.tryGetEntity(entityId(roomRef));
  return room?.geometry?.kind === 'ROOM' ? floorLevel(graph, room.geometry.floorRef) : 0;
}

function pointOf(graph: WorldGraph, entity: WorldModelEntity): Vector3 | undefined {
  const g = entity.geometry;
  if (!g) return undefined;
  switch (g.kind) {
    case 'BUILDING': {
      const c = boundsCenter(g.bounds);
      return { x: c.x, y: (g.floorCount * FLOOR_HEIGHT_M) / 2, z: c.z };
    }
    case 'DISTRICT':
    case 'PARCEL':
    case 'NAV_ZONE': {
      const c = boundsCenter(g.bounds as Bounds2D);
      return { x: c.x, y: 0, z: c.z };
    }
    case 'FLOOR': {
      const c = boundsCenter(g.bounds);
      return { x: c.x, y: g.level * FLOOR_HEIGHT_M, z: c.z };
    }
    case 'ROOM': {
      const c = boundsCenter(g.bounds);
      const level = floorLevel(graph, g.floorRef);
      // Room roots sit at eye/fixture-friendly mid-height; the shell visual subtracts its local offset.
      return { x: c.x, y: level * FLOOR_HEIGHT_M + 1.25, z: c.z };
    }
    case 'ROAD':
      return { x: (g.start.x + g.end.x) / 2, y: 0, z: (g.start.z + g.end.z) / 2 };
    case 'ASSET_SLOT':
      return { x: g.position.x, y: roomFloorLevel(graph, g.roomRef) * FLOOR_HEIGHT_M, z: g.position.z };
    case 'DOOR':
      return { x: g.position.x, y: roomFloorLevel(graph, g.fromRef) * FLOOR_HEIGHT_M, z: g.position.z };
    case 'STAIR':
    case 'ELEVATOR': {
      const first = g.connectsFloorRefs[0];
      const level = first ? floorLevel(graph, first) : 0;
      return { x: g.position.x, y: level * FLOOR_HEIGHT_M, z: g.position.z };
    }
    case 'INTERSECTION':
    case 'NAV_NODE':
    case 'SPAWN_POINT':
    case 'APPROACH_POINT':
    case 'INTERACTION_POINT':
      return { x: g.position.x, y: 0, z: g.position.z };
    case 'NAV_EDGE':
      return undefined;
  }
}

export interface RenderReadinessReport {
  readonly spatialAdded: readonly EntityId[];
  readonly groundingReclassified: readonly EntityId[];
}

/**
 * Idempotent renderer-readiness pass. Procedural geometry is reclassified only from the untouched
 * UNGROUNDED default to PROCEDURAL_APPROXIMATION; real domain-bound entities are never upgraded.
 */
export function applyGeometryRenderReadiness(graph: WorldGraph): RenderReadinessReport {
  const spatialAdded: EntityId[] = [];
  const groundingReclassified: EntityId[] = [];

  for (const entity of graph.listEntities()) {
    if (!entity.geometry) continue;
    const needsSpatial = !entity.spatial;
    const needsGrounding = !entity.domainBinding && entity.grounding === 'UNGROUNDED_APPROXIMATION';
    if (!needsSpatial && !needsGrounding) continue;

    const patch: { spatial?: { position: Vector3; scale?: Vector3 }; grounding?: 'PROCEDURAL_APPROXIMATION' } = {};
    if (needsSpatial) {
      const position = pointOf(graph, entity) ?? ZERO;
      const scale = entity.geometry.kind === 'BUILDING' ? buildingScale(entity.geometry.bounds, entity.geometry.floorCount) : undefined;
      patch.spatial = scale === undefined ? { position } : { position, scale: { x: scale, y: scale, z: scale } };
      spatialAdded.push(entity.id);
    }
    if (needsGrounding) {
      patch.grounding = 'PROCEDURAL_APPROXIMATION';
      groundingReclassified.push(entity.id);
    }
    graph.updateEntity(entity.id, patch);
  }
  return { spatialAdded, groundingReclassified };
}
