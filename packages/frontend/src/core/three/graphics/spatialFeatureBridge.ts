import type * as THREE_NS from 'three';
import type { WorldFrameEntity } from './worldFrame';
import type { EntityVisualSpec } from './worldFrameRenderer';
import { createFacadeBuilding } from './buildingKit';

/**
 * GENESIS GRAPHICS RUNTIME — Imported-spatial-feature `WorldFrameRenderer` adapter
 * ================================================================================
 *
 * The rendering half of the OSM → canonical-renderer bridge (Graphics V2, Sprint A). The data half is
 * `simulationRenderer/spatialWorldFrame.ts`; this file never imports it and knows nothing about OSM,
 * GIS, licences or projections — it sees only `visualHint` and `scalars`, exactly as
 * `graphicsArchitectureBoundary.test.ts` requires of everything under `three/graphics/`.
 *
 * Built to `ADAPTER_CONTRACT.md`: a `resolveVisual`/`updateVisual`/`dispose` triple, geometry at
 * LOCAL ORIGIN (`WorldFrameRenderer.applyTransform` overwrites `.position` every sync), caller-owned
 * materials, and no fabricated data.
 *
 * THE HONESTY RULE THAT MATTERS HERE, and why it is `measured` flags rather than prose: imported
 * geometry is real, but it is INCOMPLETE. OSM reliably knows where a building is; it very often does
 * not know how tall it is, or how wide a road's carriageway is. The data side therefore emits
 * `heightMeasured`/`widthMeasured`/`footprintMeasured` alongside the values, and this adapter treats
 * a missing value as a decision IT is making — never as a fact it was given:
 *
 *  - a real `heightM` is used as-is, and the object is tagged `userData.heightMeasured = true`;
 *  - no `heightM` means a plausible height is CHOSEN, and the object is tagged
 *    `heightMeasured = false` plus `userData.notModeled = true`, the same flag
 *    `waterInfrastructureBridge.ts` uses, so a test or inspector can find every approximated object;
 *  - `grounding: 'NOT_MODELED'` never reaches here at all — `WorldFrameRenderer` substitutes its own
 *    placeholder first.
 *
 * WHAT IS DELIBERATELY NOT DONE: the true footprint OUTLINE is not drawn. `WorldFrameEntity` has no
 * polygon channel (`SOLVER_DATA_CONTRACT.md` gap 3), so a building is a box sized to the real
 * footprint extent, and a road is a quad along the real centreline. Extruding true outlines needs a
 * real geometry channel on both sides of the contract; inventing one inside a renderer would be the
 * "second architecture" this engine's rules forbid.
 */

export const SPATIAL_BUILDING_HINT = 'osm:building';
export const SPATIAL_ROAD_HINT = 'osm:road-segment';
export const SPATIAL_WATER_HINT = 'osm:water';
export const SPATIAL_RAIL_HINT = 'osm:rail-segment';

const SPATIAL_HINTS: ReadonlySet<string> = new Set([
  SPATIAL_BUILDING_HINT, SPATIAL_ROAD_HINT, SPATIAL_WATER_HINT, SPATIAL_RAIL_HINT,
]);

/** Lets a multi-domain scene route only imported-spatial entities here without duplicating the hint
 * list — the same guard pattern `waterInfrastructureBridge.ts` established. */
export function isSpatialFeatureHint(hint: string | undefined): boolean {
  return hint !== undefined && SPATIAL_HINTS.has(hint);
}

export interface SpatialFeatureMaterials {
  wallMaterial: THREE_NS.Material;
  /** Instanced across a building's windows; `InstanceBatch` sets `vertexColors` on it. */
  windowMaterial: THREE_NS.Material;
  roadMaterial: THREE_NS.Material;
  waterMaterial?: THREE_NS.Material;
  railMaterial?: THREE_NS.Material;
}

export interface SpatialFeatureAdapterOptions {
  /** Height used when the import carries no real height for a building, in metres. Default 9 —
   * roughly three storeys. Every object built with it is flagged, never silently blended in. */
  fallbackBuildingHeightM?: number;
  /** Carriageway width used when the import carries no real width, in metres. Default 6. */
  fallbackRoadWidthM?: number;
  /** Skips window generation on buildings below this height, in metres. Default 4. */
  minWindowedHeightM?: number;
}

export interface SpatialFeatureAdapter {
  resolveVisual(entity: WorldFrameEntity): EntityVisualSpec;
  updateVisual(entity: WorldFrameEntity, object: THREE_NS.Object3D): void;
  dispose(): void;
}

function stableSeed(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash | 0);
}

/**
 * Builds the resolver/updater pair. `materials` are caller-owned — this module never disposes a
 * material it did not create, matching every other kit here.
 */
export function createSpatialFeatureAdapter(
  THREE: typeof THREE_NS,
  materials: SpatialFeatureMaterials,
  options: SpatialFeatureAdapterOptions = {},
): SpatialFeatureAdapter {
  const fallbackHeight = options.fallbackBuildingHeightM ?? 9;
  const fallbackRoadWidth = options.fallbackRoadWidthM ?? 6;
  const minWindowedHeight = options.minWindowedHeightM ?? 4;
  const owned: { dispose(): void }[] = [];

  function buildBuilding(entity: WorldFrameEntity): THREE_NS.Object3D {
    const width = entity.scalars?.footprintWidthM ?? 8;
    const depth = entity.scalars?.footprintDepthM ?? 8;
    const measuredHeight = entity.scalars?.heightM;
    const height = measuredHeight ?? fallbackHeight;

    const group = createFacadeBuilding(THREE, {
      position: [0, 0, 0],
      width, depth, height,
      seed: stableSeed(entity.id),
      wallMaterial: materials.wallMaterial,
      windowMaterial: materials.windowMaterial,
      // Below a couple of storeys a window grid reads as noise, and these are the most numerous
      // objects in an import — skipping them is both a look and a draw-call decision.
      rooftopEquipment: false,
      floorHeight: height >= minWindowedHeight ? 3.1 : height * 2,
      litFraction: 0.35,
    });
    group.name = 'genesis-spatial-building';
    // This is imported real-world context, not this engine's own decorative massing.
    group.userData.visualOnlyContext = false;
    group.userData.spatialFeature = true;
    group.userData.heightMeasured = measuredHeight !== undefined;
    group.userData.notModeled = measuredHeight === undefined;
    return group;
  }

  function buildSegment(entity: WorldFrameEntity, material: THREE_NS.Material, name: string): THREE_NS.Object3D {
    const length = entity.scalars?.lengthM ?? 1;
    const measuredWidth = entity.scalars?.widthM;
    const width = measuredWidth ?? fallbackRoadWidth;
    // A flat quad lying in the XZ plane, centred on the segment midpoint and running along +z, so the
    // entity's own heading rotation orients it. Built at local origin, per the adapter contract.
    const geometry = new THREE.PlaneGeometry(width, length);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    // A hair above the ground plane so it never z-fights whatever the scene's own ground is.
    mesh.position.y = 0.03;
    mesh.receiveShadow = true;
    const group = new THREE.Group();
    group.name = name;
    group.add(mesh);
    group.userData.spatialFeature = true;
    group.userData.widthMeasured = measuredWidth !== undefined;
    group.userData.notModeled = measuredWidth === undefined;
    owned.push({ dispose: () => geometry.dispose() });
    return group;
  }

  return {
    resolveVisual(entity) {
      switch (entity.visualHint) {
        case SPATIAL_BUILDING_HINT:
          return { kind: 'object', object: buildBuilding(entity) };
        case SPATIAL_WATER_HINT:
          return { kind: 'object', object: buildSegment(entity, materials.waterMaterial ?? materials.roadMaterial, 'genesis-spatial-water') };
        case SPATIAL_RAIL_HINT:
          return { kind: 'object', object: buildSegment(entity, materials.railMaterial ?? materials.roadMaterial, 'genesis-spatial-rail') };
        case SPATIAL_ROAD_HINT:
        default:
          return { kind: 'object', object: buildSegment(entity, materials.roadMaterial, 'genesis-spatial-road') };
      }
    },
    updateVisual(entity, object) {
      // Imported spatial features are static: their real-world geometry does not change between
      // frames, and this adapter has no state to drive. The measured/approximated flags are
      // re-asserted every sync anyway, because an entity CAN change grounding between frames (a
      // richer re-import filling in a height), and a stale flag would be a quiet lie.
      if (entity.visualHint === SPATIAL_BUILDING_HINT) {
        const measured = entity.scalars?.heightM !== undefined;
        object.userData.heightMeasured = measured;
        object.userData.notModeled = !measured;
        return;
      }
      const measured = entity.scalars?.widthM !== undefined;
      object.userData.widthMeasured = measured;
      object.userData.notModeled = !measured;
    },
    dispose() {
      for (const resource of owned) resource.dispose();
      owned.length = 0;
    },
  };
}
