import type { EntityRef } from '../../../events/genesisEvent';
import { boundsDepth, boundsWidth, type Bounds2D, type BuildingType, type RoomType } from '../../ecs/geometry';
import type { GeneratedBuilding } from './buildingGenerator';

export interface GeneratedFloor {
  ref: EntityRef;
  level: number;
  bounds: Bounds2D;
  heightM: number;
  buildingRef: EntityRef;
}

export interface GeneratedRoom {
  ref: EntityRef;
  bounds: Bounds2D;
  roomType: RoomType;
  floorRef: EntityRef;
  buildingRef: EntityRef;
}

export interface GeneratedDoor {
  ref: EntityRef;
  position: { x: number; z: number };
  fromRef: EntityRef;
  toRef: EntityRef;
}

export interface GeneratedStair {
  ref: EntityRef;
  position: { x: number; z: number };
  buildingRef: EntityRef;
  connectsFloorRefs: readonly [EntityRef, EntityRef];
}

export interface GeneratedElevator {
  ref: EntityRef;
  position: { x: number; z: number };
  buildingRef: EntityRef;
  connectsFloorRefs: readonly EntityRef[];
}

export interface GeneratedAssetSlot {
  ref: EntityRef;
  position: { x: number; z: number };
  roomRef: EntityRef;
  slotType: string;
}

export interface BuildingInterior {
  floors: GeneratedFloor[];
  rooms: GeneratedRoom[];
  doors: GeneratedDoor[];
  stairs: GeneratedStair[];
  elevators: GeneratedElevator[];
  assetSlots: GeneratedAssetSlot[];
}

const FLOOR_HEIGHT_M = 3.5;
const CORRIDOR_WIDTH_M = 2.4;

/** Which room type a building's upper floors host — this is the seam Phase 6 uses to let a real scientific solver populate a generated room instead of owning a whole building (non-negotiable #14). */
const UPPER_ROOM_TYPE_BY_BUILDING: Readonly<Record<BuildingType, RoomType>> = {
  RESIDENTIAL: 'RESIDENTIAL_UNIT',
  COMMERCIAL: 'RETAIL_FLOOR',
  INDUSTRIAL: 'WAREHOUSE_FLOOR',
  CIVIC: 'OFFICE',
  HOSPITAL: 'WARD',
  LABORATORY: 'LAB_BENCH_ROOM',
  BIOLOGY_LAB: 'LAB_BENCH_ROOM',
  CHEMISTRY_LAB: 'REACTOR_ROOM',
  IMAGING_CENTER: 'IMAGING_SUITE',
  MICROSCOPY_CENTER: 'MICROSCOPY_SUITE',
  RESEARCH_CAMPUS: 'LAB_BENCH_ROOM',
  BIOMEDICAL_CENTER: 'WARD',
  WATER_RESEARCH_FACILITY: 'PUMP_ROOM',
};

const ASSET_SLOT_TYPE_BY_ROOM: Partial<Record<RoomType, string>> = {
  LAB_BENCH_ROOM: 'LAB_BENCH_STATION',
  REACTOR_ROOM: 'REACTOR_VESSEL',
  IMAGING_SUITE: 'IMAGING_SCANNER',
  MICROSCOPY_SUITE: 'MICROSCOPE_STATION',
  WARD: 'HOSPITAL_BED',
  PUMP_ROOM: 'PUMP_STATION',
};

/** Physical equipment remains full size. Small rooms must not receive overlapping miniatures. */
function scientificSlots(room: GeneratedRoom, side: 'left' | 'right'): GeneratedAssetSlot[] {
  const { bounds, roomType } = room;
  const width = boundsWidth(bounds);
  const depth = boundsDepth(bounds);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const slot = (slotType: string, index: number, x: number, z: number): GeneratedAssetSlot => ({
    ref: { kind: 'asset-slot', id: `${room.ref.id}-slot-${index}` },
    position: { x, z }, roomRef: room.ref, slotType,
  });

  if (roomType === 'MATERIALS_LAB') {
    // Keep the door-to-centre approach clear: all benches occupy the exterior half,
    // away from the corridor wall. Dimensions cover the actual procedural meshes.
    if (width < 4 || depth < 4) return [];
    const x = centerX + (side === 'left' ? -1 : 1) * Math.min(width / 4, 2);
    const spacing = Math.min(depth / 4, 1.5);
    return [
      slot('SPECTROMETER_STATION', 0, x, centerZ - spacing),
      slot('THERMAL_STAGE_STATION', 1, x, centerZ),
      slot('COMPUTE_STATION', 2, x, centerZ + spacing),
    ];
  }

  const primary = ASSET_SLOT_TYPE_BY_ROOM[roomType];
  const slots = primary ? [slot(primary, 0, centerX, centerZ)] : [];
  // Preserve existing station ids/positions; the additional workstation is off
  // the central door approach and separated from the existing laboratory bench.
  if (roomType === 'LAB_BENCH_ROOM' && width >= 4 && depth >= 4) {
    slots.push(slot('COMPUTE_STATION', 1, centerX, centerZ - Math.min(depth / 4, 2)));
  }
  return slots;
}

/**
 * Generates real per-floor interiors for `building`: a central corridor
 * flanked by `roomsPerSide` rooms on each side, every room DOOR-connected
 * to the corridor, and real STAIR entities connecting every pair of
 * vertically adjacent floors (non-negotiable #11: no placeholders). A
 * building tall enough (`floorCount >= 3`) also gets one ELEVATOR
 * connecting every floor it serves. Ground floor (level 0) is always a
 * single LOBBY spanning the full footprint; floors above use the room type
 * `building.buildingType` implies (e.g. a LABORATORY gets LAB_BENCH_ROOM),
 * so the existing scientific solvers can later populate a REAL generated
 * room rather than owning an entire building (non-negotiable #14).
 *
 * Purely a function of `building`'s own geometry and `roomsPerSide` —
 * deliberately takes no rng: floor/room/door/stair/elevator LAYOUT is
 * structural, not a place this pipeline currently varies by seed (unlike
 * district type or building type, which do).
 */
export function generateBuildingInterior(building: GeneratedBuilding, roomsPerSide: number): BuildingInterior {
  const floors: GeneratedFloor[] = [];
  const rooms: GeneratedRoom[] = [];
  const doors: GeneratedDoor[] = [];
  const stairs: GeneratedStair[] = [];
  const elevators: GeneratedElevator[] = [];
  const assetSlots: GeneratedAssetSlot[] = [];

  const buildingId = building.ref.id;
  const upperRoomType = UPPER_ROOM_TYPE_BY_BUILDING[building.buildingType];
  const perSide = Math.max(1, Math.floor(roomsPerSide));

  for (let level = 0; level < building.floorCount; level++) {
    const floorRef: EntityRef = { kind: 'floor', id: `${buildingId}-floor-${level}` };
    floors.push({ ref: floorRef, level, bounds: building.bounds, heightM: FLOOR_HEIGHT_M, buildingRef: building.ref });

    if (level === 0) {
      const lobbyRef: EntityRef = { kind: 'room', id: `${buildingId}-floor-${level}-lobby` };
      rooms.push({ ref: lobbyRef, bounds: building.bounds, roomType: 'LOBBY', floorRef, buildingRef: building.ref });
      continue;
    }

    const width = boundsWidth(building.bounds);
    const depth = boundsDepth(building.bounds);
    const corridorHalf = Math.min(CORRIDOR_WIDTH_M / 2, width / 4);
    const midX = (building.bounds.minX + building.bounds.maxX) / 2;
    const corridorBounds: Bounds2D = {
      minX: midX - corridorHalf,
      maxX: midX + corridorHalf,
      minZ: building.bounds.minZ,
      maxZ: building.bounds.maxZ,
    };
    const corridorRef: EntityRef = { kind: 'room', id: `${buildingId}-floor-${level}-corridor` };
    rooms.push({ ref: corridorRef, bounds: corridorBounds, roomType: 'CORRIDOR', floorRef, buildingRef: building.ref });

    const cellDepth = depth / perSide;
    for (const side of ['left', 'right'] as const) {
      const sideMinX = side === 'left' ? building.bounds.minX : corridorBounds.maxX;
      const sideMaxX = side === 'left' ? corridorBounds.minX : building.bounds.maxX;
      for (let i = 0; i < perSide; i++) {
        const roomBounds: Bounds2D = {
          minX: sideMinX,
          maxX: sideMaxX,
          minZ: building.bounds.minZ + i * cellDepth,
          maxZ: building.bounds.minZ + (i + 1) * cellDepth,
        };
        const roomRef: EntityRef = { kind: 'room', id: `${buildingId}-floor-${level}-room-${side}-${i}` };
        // One materials room per research campus. Keep every other scientific
        // room, its stable id, floor/corridor hierarchy and domain bindings intact.
        const roomType = building.buildingType === 'RESEARCH_CAMPUS' && level === 1 && side === 'left' && i === 0
          ? 'MATERIALS_LAB' : upperRoomType;
        const room: GeneratedRoom = { ref: roomRef, bounds: roomBounds, roomType, floorRef, buildingRef: building.ref };
        rooms.push(room);

        const doorX = side === 'left' ? corridorBounds.minX : corridorBounds.maxX;
        const doorZ = (roomBounds.minZ + roomBounds.maxZ) / 2;
        doors.push({
          ref: { kind: 'door', id: `${roomRef.id}-door` },
          position: { x: doorX, z: doorZ },
          fromRef: roomRef,
          toRef: corridorRef,
        });

        assetSlots.push(...scientificSlots(room, side));
      }
    }
  }

  const stairX = building.bounds.minX + Math.min(1.5, boundsWidth(building.bounds) * 0.1);
  const stairZ = building.bounds.minZ + Math.min(1.5, boundsDepth(building.bounds) * 0.1);
  for (let level = 0; level < building.floorCount - 1; level++) {
    stairs.push({
      ref: { kind: 'stair', id: `${buildingId}-stair-${level}` },
      position: { x: stairX, z: stairZ },
      buildingRef: building.ref,
      connectsFloorRefs: [floors[level].ref, floors[level + 1].ref],
    });
  }

  if (building.floorCount >= 3) {
    const elevatorX = building.bounds.maxX - Math.min(1.5, boundsWidth(building.bounds) * 0.1);
    const elevatorZ = building.bounds.minZ + Math.min(1.5, boundsDepth(building.bounds) * 0.1);
    elevators.push({
      ref: { kind: 'elevator', id: `${buildingId}-elevator-0` },
      position: { x: elevatorX, z: elevatorZ },
      buildingRef: building.ref,
      connectsFloorRefs: floors.map((f) => f.ref),
    });
  }

  return { floors, rooms, doors, stairs, elevators, assetSlots };
}
