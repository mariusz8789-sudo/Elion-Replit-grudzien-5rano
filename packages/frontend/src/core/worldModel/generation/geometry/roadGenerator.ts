import type { EntityRef } from '../../../events/genesisEvent';
import type { RoadClass } from '../../ecs/geometry';

export interface GeneratedRoad {
  ref: EntityRef;
  start: { x: number; z: number };
  end: { x: number; z: number };
  widthM: number;
  roadClass: RoadClass;
}

export interface GeneratedIntersection {
  ref: EntityRef;
  position: { x: number; z: number };
  connectedRoadRefs: readonly EntityRef[];
}

export interface RoadNetwork {
  roads: readonly GeneratedRoad[];
  intersections: readonly GeneratedIntersection[];
}

/**
 * Generates the road network along the SAME district grid lines
 * `generateDistricts` used to lay out district bounds (`cols`/`rows` from
 * `DistrictLayout`) — every road sits exactly on a district boundary, and
 * every grid-line crossing becomes a real intersection connected to every
 * road that actually meets it there. Purely a function of the grid shape
 * (never the rng): road/intersection COUNT and position are always the
 * same for the same `citySizeM`/`districtCount`, independent of seed.
 */
export function generateRoadNetwork(worldId: string, citySizeM: number, cols: number, rows: number): RoadNetwork {
  const half = citySizeM / 2;
  const cellWidthM = citySizeM / cols;
  const cellDepthM = citySizeM / rows;

  const xLines: number[] = [];
  for (let c = 0; c <= cols; c++) xLines.push(-half + c * cellWidthM);
  const zLines: number[] = [];
  for (let r = 0; r <= rows; r++) zLines.push(-half + r * cellDepthM);

  const roads: GeneratedRoad[] = [];
  const roadsAtPoint = new Map<string, EntityRef[]>();
  const pointKey = (x: number, z: number) => `${x.toFixed(4)}:${z.toFixed(4)}`;
  const registerAt = (x: number, z: number, roadRef: EntityRef) => {
    const k = pointKey(x, z);
    const list = roadsAtPoint.get(k);
    if (list) list.push(roadRef);
    else roadsAtPoint.set(k, [roadRef]);
  };

  let roadIndex = 0;
  for (const x of xLines) {
    const ref: EntityRef = { kind: 'road', id: `${worldId}-road-${roadIndex++}` };
    roads.push({ ref, start: { x, z: -half }, end: { x, z: half }, widthM: 12, roadClass: 'ARTERIAL' });
    for (const z of zLines) registerAt(x, z, ref);
  }
  for (const z of zLines) {
    const ref: EntityRef = { kind: 'road', id: `${worldId}-road-${roadIndex++}` };
    roads.push({ ref, start: { x: -half, z }, end: { x: half, z }, widthM: 12, roadClass: 'ARTERIAL' });
    for (const x of xLines) registerAt(x, z, ref);
  }

  const intersections: GeneratedIntersection[] = [];
  let intersectionIndex = 0;
  for (const x of xLines) {
    for (const z of zLines) {
      const connectedRoadRefs = roadsAtPoint.get(pointKey(x, z)) ?? [];
      intersections.push({
        ref: { kind: 'intersection', id: `${worldId}-intersection-${intersectionIndex++}` },
        position: { x, z },
        connectedRoadRefs,
      });
    }
  }

  return { roads, intersections };
}
