import type { EntityRef } from '../../../events/genesisEvent';
import type { Bounds2D, NavigationMode } from '../../ecs/geometry';
import type { GeneratedAssetSlot, GeneratedRoom, GeneratedFloor, GeneratedStair, GeneratedElevator } from './interiorGenerator';
import type { GeneratedBuilding } from './buildingGenerator';
import type { GeneratedDistrict } from './districtGenerator';
import type { GeneratedIntersection } from './roadGenerator';

export interface GeneratedNavNode {
  ref: EntityRef;
  position: { x: number; z: number };
  atRef?: EntityRef;
}

export interface GeneratedNavEdge {
  ref: EntityRef;
  fromRef: EntityRef;
  toRef: EntityRef;
  costM: number;
  mode: NavigationMode;
}

export interface GeneratedNavZone {
  ref: EntityRef;
  bounds: Bounds2D;
  walkable: boolean;
}

export interface GeneratedSpawnPoint {
  ref: EntityRef;
  position: { x: number; z: number };
  forKind?: string;
}

export interface GeneratedApproachPoint {
  ref: EntityRef;
  position: { x: number; z: number };
  targetRef: EntityRef;
}

export interface GeneratedInteractionPoint {
  ref: EntityRef;
  position: { x: number; z: number };
  targetRef: EntityRef;
  interactionKind: string;
}

export interface CityNavigation {
  navNodes: GeneratedNavNode[];
  navEdges: GeneratedNavEdge[];
  navZones: GeneratedNavZone[];
  spawnPoints: GeneratedSpawnPoint[];
  approachPoints: GeneratedApproachPoint[];
  interactionPoints: GeneratedInteractionPoint[];
}

export interface BuildingForNavigation {
  building: GeneratedBuilding;
  floors: readonly GeneratedFloor[];
  rooms: readonly GeneratedRoom[];
  stairs: readonly GeneratedStair[];
  elevators: readonly GeneratedElevator[];
  assetSlots: readonly GeneratedAssetSlot[];
}

function distance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function nearest<T extends { position: { x: number; z: number } }>(point: { x: number; z: number }, candidates: readonly T[]): T | undefined {
  let best: T | undefined;
  let bestDist = Infinity;
  for (const candidate of candidates) {
    const d = distance(point, candidate.position);
    if (d < bestDist) {
      bestDist = d;
      best = candidate;
    }
  }
  return best;
}

/**
 * Connects every pair of intersections that are ADJACENT along the SAME
 * grid line (consecutive by real position, never by array index — the
 * rewrite non-negotiable #10 requires) with one DRIVE edge whose cost is
 * the real straight-line distance between them. Edges reference the NAV
 * NODE that wraps each intersection (`navNodeRefByIntersectionId`), never
 * the intersection entity itself — a nav edge always connects two nav
 * nodes, so the reachability graph (validateWorldInvariants) can traverse
 * it.
 */
function buildIntersectionAdjacencyEdges(worldId: string, intersections: readonly GeneratedIntersection[], navNodeRefByIntersectionId: ReadonlyMap<string, EntityRef>): GeneratedNavEdge[] {
  const byX = new Map<string, GeneratedIntersection[]>();
  const byZ = new Map<string, GeneratedIntersection[]>();
  const groupInto = (map: Map<string, GeneratedIntersection[]>, key: string, intersection: GeneratedIntersection) => {
    const group = map.get(key);
    if (group) group.push(intersection);
    else map.set(key, [intersection]);
  };
  for (const intersection of intersections) {
    groupInto(byX, intersection.position.x.toFixed(4), intersection);
    groupInto(byZ, intersection.position.z.toFixed(4), intersection);
  }

  const edges: GeneratedNavEdge[] = [];
  let edgeIndex = 0;
  const connectSorted = (groups: Map<string, GeneratedIntersection[]>, sortBy: (i: GeneratedIntersection) => number) => {
    for (const group of groups.values()) {
      const sorted = [...group].sort((a, b) => sortBy(a) - sortBy(b));
      for (let i = 0; i < sorted.length - 1; i++) {
        const fromRef = navNodeRefByIntersectionId.get(`${sorted[i].ref.id}`);
        const toRef = navNodeRefByIntersectionId.get(`${sorted[i + 1].ref.id}`);
        if (!fromRef || !toRef) continue;
        edges.push({
          ref: { kind: 'nav-edge', id: `${worldId}-nav-edge-road-${edgeIndex++}` },
          fromRef,
          toRef,
          costM: distance(sorted[i].position, sorted[i + 1].position),
          mode: 'DRIVE',
        });
      }
    }
  };
  connectSorted(byX, (i) => i.position.z);
  connectSorted(byZ, (i) => i.position.x);
  return edges;
}

/**
 * NAVIGATION GENERATION (Phase 5). Builds one connected, walkable/drivable
 * graph spanning the whole generated city: intersection-to-intersection
 * (road adjacency), building-entrance-to-nearest-intersection, and — for
 * every building whose interior was generated — room-to-corridor and
 * floor-to-floor via the SAME real stair/elevator entities Phase 4 created
 * (never a fabricated shortcut). Every edge cost is a REAL geometric
 * distance (never array order — non-negotiable #10). This produces DATA
 * only: no AgentController/pathfinder/command bus is created here
 * (non-negotiable #6/#15) — a future navigation consumer walks this graph.
 */
export function generateCityNavigation(
  worldId: string,
  districts: readonly GeneratedDistrict[],
  intersections: readonly GeneratedIntersection[],
  buildingsForNav: readonly BuildingForNavigation[],
): CityNavigation {
  const navNodes: GeneratedNavNode[] = [];
  const navEdges: GeneratedNavEdge[] = [];
  const navZones: GeneratedNavZone[] = [];
  const spawnPoints: GeneratedSpawnPoint[] = [];
  const approachPoints: GeneratedApproachPoint[] = [];
  const interactionPoints: GeneratedInteractionPoint[] = [];
  let nodeIndex = 0;
  let edgeIndex = 0;

  for (const district of districts) {
    navZones.push({ ref: { kind: 'nav-zone', id: `${district.ref.id}-navzone` }, bounds: district.bounds, walkable: true });
  }

  const intersectionNodeByRef = new Map<string, GeneratedNavNode>();
  const navNodeRefByIntersectionId = new Map<string, EntityRef>();
  for (const intersection of intersections) {
    const node: GeneratedNavNode = { ref: { kind: 'nav-node', id: `${worldId}-nav-node-${nodeIndex++}` }, position: intersection.position, atRef: intersection.ref };
    navNodes.push(node);
    intersectionNodeByRef.set(`${intersection.ref.id}`, node);
    navNodeRefByIntersectionId.set(`${intersection.ref.id}`, node.ref);
  }
  navEdges.push(...buildIntersectionAdjacencyEdges(worldId, intersections, navNodeRefByIntersectionId));

  for (const entry of buildingsForNav) {
    const { building, floors, rooms, stairs, elevators, assetSlots } = entry;

    const entrancePosition = { x: (building.bounds.minX + building.bounds.maxX) / 2, z: building.bounds.minZ };
    const approachRef: EntityRef = { kind: 'approach-point', id: `${building.ref.id}-entrance` };
    approachPoints.push({ ref: approachRef, position: entrancePosition, targetRef: building.ref });
    spawnPoints.push({ ref: { kind: 'spawn-point', id: `${building.ref.id}-spawn` }, position: entrancePosition, forKind: 'pedestrian' });

    const entranceNode: GeneratedNavNode = { ref: { kind: 'nav-node', id: `${worldId}-nav-node-${nodeIndex++}` }, position: entrancePosition, atRef: approachRef };
    navNodes.push(entranceNode);

    const nearestIntersectionNode = nearest(entrancePosition, [...intersectionNodeByRef.values()]);
    if (nearestIntersectionNode) {
      navEdges.push({
        ref: { kind: 'nav-edge', id: `${worldId}-nav-edge-${edgeIndex++}` },
        fromRef: entranceNode.ref,
        toRef: nearestIntersectionNode.ref,
        costM: distance(entrancePosition, nearestIntersectionNode.position),
        mode: 'WALK',
      });
    }

    const hubNodeByFloorRef = new Map<string, GeneratedNavNode>();
    for (const floor of floors) {
      const hubRoom = rooms.find((r) => r.floorRef.id === floor.ref.id && (r.roomType === 'LOBBY' || r.roomType === 'CORRIDOR'));
      const hubPosition = hubRoom ? { x: (hubRoom.bounds.minX + hubRoom.bounds.maxX) / 2, z: (hubRoom.bounds.minZ + hubRoom.bounds.maxZ) / 2 } : entrancePosition;
      const hubNode: GeneratedNavNode = { ref: { kind: 'nav-node', id: `${worldId}-nav-node-${nodeIndex++}` }, position: hubPosition, atRef: hubRoom?.ref ?? floor.ref };
      navNodes.push(hubNode);
      hubNodeByFloorRef.set(`${floor.ref.id}`, hubNode);

      for (const room of rooms) {
        if (room.floorRef.id !== floor.ref.id || room.ref.id === hubRoom?.ref.id) continue;
        const roomPosition = { x: (room.bounds.minX + room.bounds.maxX) / 2, z: (room.bounds.minZ + room.bounds.maxZ) / 2 };
        const roomNode: GeneratedNavNode = { ref: { kind: 'nav-node', id: `${worldId}-nav-node-${nodeIndex++}` }, position: roomPosition, atRef: room.ref };
        navNodes.push(roomNode);
        navEdges.push({
          ref: { kind: 'nav-edge', id: `${worldId}-nav-edge-${edgeIndex++}` },
          fromRef: roomNode.ref,
          toRef: hubNode.ref,
          costM: distance(roomPosition, hubPosition),
          mode: 'WALK',
        });

        for (const slot of assetSlots) {
          if (slot.roomRef.id !== room.ref.id) continue;
          interactionPoints.push({
            ref: { kind: 'interaction-point', id: `${slot.ref.id}-interaction` },
            position: slot.position,
            targetRef: slot.ref,
            interactionKind: 'INSPECT',
          });
        }
      }
    }

    const groundHub = hubNodeByFloorRef.get(`${floors[0]?.ref.id ?? ''}`);
    if (groundHub) {
      navEdges.push({
        ref: { kind: 'nav-edge', id: `${worldId}-nav-edge-${edgeIndex++}` },
        fromRef: entranceNode.ref,
        toRef: groundHub.ref,
        costM: distance(entrancePosition, groundHub.position),
        mode: 'WALK',
      });
    }

    for (const stair of stairs) {
      const [fromFloorRef, toFloorRef] = stair.connectsFloorRefs;
      const fromHub = hubNodeByFloorRef.get(`${fromFloorRef.id}`);
      const toHub = hubNodeByFloorRef.get(`${toFloorRef.id}`);
      if (!fromHub || !toHub) continue;
      navEdges.push({
        ref: { kind: 'nav-edge', id: `${worldId}-nav-edge-${edgeIndex++}` },
        fromRef: fromHub.ref,
        toRef: toHub.ref,
        costM: floors.find((f) => f.ref.id === toFloorRef.id)?.heightM ?? 3.5,
        mode: 'STAIR',
      });
    }

    for (const elevator of elevators) {
      for (let i = 0; i < elevator.connectsFloorRefs.length - 1; i++) {
        const fromHub = hubNodeByFloorRef.get(`${elevator.connectsFloorRefs[i].id}`);
        const toHub = hubNodeByFloorRef.get(`${elevator.connectsFloorRefs[i + 1].id}`);
        if (!fromHub || !toHub) continue;
        navEdges.push({
          ref: { kind: 'nav-edge', id: `${worldId}-nav-edge-${edgeIndex++}` },
          fromRef: fromHub.ref,
          toRef: toHub.ref,
          costM: floors.find((f) => f.ref.id === elevator.connectsFloorRefs[i + 1].id)?.heightM ?? 3.5,
          mode: 'ELEVATOR',
        });
      }
    }
  }

  return { navNodes, navEdges, navZones, spawnPoints, approachPoints, interactionPoints };
}
