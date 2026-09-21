import { boundsCenter, type Bounds2D } from '../worldModel/ecs/geometry';
import type { EntityId, Vector3, WorldModelEntity } from '../worldModel/ecs/types';
import type { WorldGraph } from '../worldModel/ecs/worldGraph';

/**
 * TEMPORAL CINEMATIC ENGINE — GEOMETRY RENDER READINESS.
 *
 * A REAL, confirmed gap this module closes (found by reading, not assumed):
 * `bridge/worldFrameState.ts::toFrameEntity` reads `entity.spatial?.position
 * ?? {0,0,0}` — so a `WorldModelEntity` carrying only the World Generation
 * `geometry` component (DISTRICT/ROAD/BUILDING/ROOM/... — see ecs/geometry.ts)
 * and no `spatial` component renders at the world origin, indistinguishable
 * from every other such entity, if handed to the existing generic
 * `WorldFrameRenderer` unmodified. This is a rendering-readiness gap, not a
 * design flaw in World Generation itself (that layer's job ends at producing
 * correct STRUCTURE — `bounds`/`position` in 2D city-space — never at
 * deciding how a renderer should place it).
 *
 * This module derives a `SpatialComponent` from each geometry kind's own
 * already-authoritative position data (never invents new coordinates) and
 * writes it back via `WorldGraph.updateEntity` — the SAME public patch API
 * every other intervention in this codebase uses (see
 * bridge/worldFrameState.ts::executeIntervention). It does not touch, does
 * not import, and would not need to touch any file from the frozen World
 * Generation commit: this is a NEW, additive, opt-in pass a caller runs on
 * an already-generated graph, exactly like a `TemporalEngine` intervention
 * would.
 *
 * GROUNDING HONESTY: `entityFactory.ts::createEntity` defaults every new
 * entity's `grounding` to `'UNGROUNDED_APPROXIMATION'` unless a blueprint
 * overrides it, and none of the geometry generators do — so today, every
 * generated DISTRICT/BUILDING/ROOM entity graphics-adapts to `'NOT_MODELED'`
 * (`graphicsWorldFrameAdapter.ts::toGraphicsGrounding`), which
 * `WorldFrameRenderer` renders as a generic wireframe placeholder,
 * REGARDLESS of whether `spatial` is present. A procedurally generated
 * building shape is not an "ungrounded" claim about the world in the sense
 * that label exists for (a solver-less scientific quantity) — it is a real,
 * deterministic structural fact about THIS generated world, exactly the kind
 * of thing `'PROCEDURAL_APPROXIMATION'` describes ("a real fallback
 * heuristic, still DERIVED" — see graphicsWorldFrameAdapter.ts's own doc).
 * This module reclassifies ONLY entities that (a) carry `geometry`, (b) have
 * no `domainBinding` (so no real solver claim is being overridden), and (c)
 * are still at the untouched default — never a scientific claim upgrade,
 * never touching an entity a domain solver has already grounded.
 */

const ZERO: Vector3 = { x: 0, y: 0, z: 0 };

/** Vertical placement heuristic: a coarse city-block use of `y` for readability only (FLOOR/ROOM/interior geometry sit at their floor's storey height); World Generation itself never models building height in `y`, only via `heightM`/`floorCount` scalars, so this is explicitly a rendering convenience, not a new scientific claim. */
const FLOOR_HEIGHT_M = 3.5;

/** A visible floor for the sphere radius below (so even a real 1-floor building reads as a real object, not a speck, at typical street-camera distances) — a rendering-visibility constant, not a claim about any building's real minimum size. */
const MIN_VISUAL_SCALE_M = 8;

/**
 * Representative uniform scale for `defaultResolveVisual`'s sphere (radius
 * `0.5 * scale` — see `worldFrameRenderer.ts`'s own doc: "a single
 * characteristic scalar, not per-axis... representative"). ONLY `BUILDING`
 * needs this today: it is the one entity kind this module's own render
 * readiness must make visually distinguishable for the historical
 * comparison (`temporalCinematicEngine.ts::compareSameStreetAcrossYears`'s
 * `skylineDiffers` check) to mean anything on a real canvas, not just in
 * `WorldModelEntity.geometry.floorCount` data.
 *
 * DELIBERATELY HEIGHT-DOMINATED, not `max(footprint, height)`: `footprint`
 * (`boundsWidth`/`boundsDepth`, parcel-derived) is essentially constant for
 * the SAME building across years — only `floorCount` (and so `heightM`)
 * varies with `historicalEra.ts`'s era profile. An earlier version of this
 * function used `max(footprint, heightM)`, and since a real parcel's
 * footprint (tens of meters) usually exceeds even a 20-floor building's
 * height (70m) at this world's scale, footprint silently won that max EVERY
 * time — making the rendered sphere's size independent of era, a real bug
 * caught by comparing actual captured frames (`scripts/
 * temporal-cinematic-e2e-capture.mjs`), not by a unit test alone (the data
 * itself, `floorCount`, was always correct — only its VISUAL representation
 * was flat). A sphere can only carry one size dimension; for this
 * comparison, that dimension must be height.
 */
function buildingScale(_bounds: Bounds2D, floorCount: number): number {
  const heightM = floorCount * FLOOR_HEIGHT_M;
  return Math.max(heightM, MIN_VISUAL_SCALE_M);
}

function pointOf(entity: WorldModelEntity): { x: number; y: number; z: number } | undefined {
  const g = entity.geometry;
  if (!g) return undefined;
  switch (g.kind) {
    case 'BUILDING': {
      const c = boundsCenter(g.bounds);
      // Half the height so the sphere sits ON the ground rather than centered through it.
      return { x: c.x, y: (g.floorCount * FLOOR_HEIGHT_M) / 2, z: c.z };
    }
    case 'DISTRICT':
    case 'PARCEL':
    case 'NAV_ZONE': {
      const c = boundsCenter(g.bounds as Bounds2D);
      return { x: c.x, y: 0, z: c.z };
    }
    case 'FLOOR':
    case 'ROOM': {
      const c = boundsCenter(g.bounds as Bounds2D);
      return { x: c.x, y: g.kind === 'FLOOR' ? g.level * FLOOR_HEIGHT_M : 0, z: c.z };
    }
    case 'ROAD': {
      return { x: (g.start.x + g.end.x) / 2, y: 0, z: (g.start.z + g.end.z) / 2 };
    }
    case 'INTERSECTION':
    case 'DOOR':
    case 'STAIR':
    case 'ELEVATOR':
    case 'ASSET_SLOT':
    case 'NAV_NODE':
    case 'SPAWN_POINT':
    case 'APPROACH_POINT':
    case 'INTERACTION_POINT':
      return { x: g.position.x, y: 0, z: g.position.z };
    case 'NAV_EDGE':
      // No position of its own — a labeled edge between two NAV_NODEs (see ecs/geometry.ts's
      // own doc: "never as a WorldGraph.EntityRelationship... no relationship-specific state of
      // its own" applies to connectivity data, not to a renderable point). Left at the origin
      // default deliberately; nothing calls `findEntityContainingPoint`/`packTransformBuffer` on
      // an edge entity's own transform today.
      return undefined;
  }
}

export interface RenderReadinessReport {
  readonly spatialAdded: readonly EntityId[];
  readonly groundingReclassified: readonly EntityId[];
}

/**
 * Mutates `graph` in place (via `updateEntity`) so every geometry-only
 * entity gets a real `spatial.position` and an honest
 * `'PROCEDURAL_APPROXIMATION'` grounding, wherever it is still missing/at
 * the untouched default. Idempotent: re-running on an already-readied graph
 * changes nothing (both conditions below are false the second time).
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
      const point = pointOf(entity);
      const position = point ? { x: point.x, y: point.y, z: point.z } : ZERO;
      const scale = entity.geometry?.kind === 'BUILDING' ? buildingScale(entity.geometry.bounds, entity.geometry.floorCount) : undefined;
      patch.spatial = scale !== undefined ? { position, scale: { x: scale, y: scale, z: scale } } : { position };
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
