import { describe, expect, it } from 'vitest';
import { planPath } from './navigationPlanner';
import {
  GENESIS_LAB_ROOMS,
  createCanonicalLaboratory,
  getConnectedRooms,
  getRoomAtPosition,
  getRoomForStation,
  getStationPlacement,
  assertCanonicalLaboratoryIntegrity,
} from './canonicalLaboratory';

describe('canonical Genesis Laboratory', () => {
  it('is deterministic', () => {
    expect(createCanonicalLaboratory()).toEqual(createCanonicalLaboratory());
  });

  it('contains one fixed main hall plus seven specialist rooms', () => {
    expect(GENESIS_LAB_ROOMS.map(r => r.id)).toEqual([
      'main-hall',
      'human-study',
      'microscopy',
      'histology',
      'imaging',
      'wet-lab',
      'experimental',
      'biomedical-bay',
    ]);
  });

  it('has a valid connected door graph', () => {
    const lab = createCanonicalLaboratory();
    assertCanonicalLaboratoryIntegrity(lab);

    for (const room of lab.rooms) {
      expect(room.doors.length).toBeGreaterThan(0);
    }

    expect(getConnectedRooms('main-hall')).toHaveLength(6);
    expect(getConnectedRooms('microscopy')).toEqual(['main-hall']);
  });

  it('maps existing biology station ids without inventing a second station catalog', () => {
    expect(getRoomForStation('station:human-study')).toBe('human-study');
    expect(getRoomForStation('station:neuro')).toBe('human-study');
    expect(getRoomForStation('station:microscopy')).toBe('microscopy');
    expect(getRoomForStation('station:histology')).toBe('histology');
    expect(getRoomForStation('station:imaging')).toBe('imaging');
    expect(getRoomForStation('station:orpheus')).toBe('experimental');
    expect(getRoomForStation('station:evidence')).toBe('main-hall');
    expect(getRoomForStation('station:compute')).toBe('main-hall');
    // Fixed on integration: the delivered package listed `station:safety` under the wet-lab room's
    // stationIds, but its own STATION_POSITIONS coordinate ({-2.1, 0.9}) sits in main-hall's bounds,
    // not wet-lab's — an internal inconsistency. Its actual, positioned room is main-hall.
    expect(getRoomForStation('station:safety')).toBe('main-hall');
  });

  it('provides deterministic station placements for every one of the 12 biology stations (9 V3 pack + 3 host-added Wet Lab)', () => {
    expect(getStationPlacement('station:microscopy')).toEqual({
      stationId: 'station:microscopy',
      roomId: 'microscopy',
      position: { x: -2.4, z: -7.0 },
    });
    const lab = createCanonicalLaboratory();
    expect(lab.stationPlacements).toHaveLength(12);
    expect(new Set(lab.stationPlacements.map((p) => p.stationId)).size).toBe(12);
  });

  describe('wet lab is a fully equipped physical room, not an empty shell', () => {
    it('the room exists with a non-empty station list', () => {
      const room = GENESIS_LAB_ROOMS.find((r) => r.id === 'wet-lab')!;
      expect(room).toBeTruthy();
      expect(room.stationIds.length).toBeGreaterThan(0);
      expect(room.stationIds).toEqual(['station:wet-sample-prep', 'station:wet-lab-bench', 'station:wet-analytical']);
    });

    it('every wet-lab station maps to the wet-lab room and lands inside its bounds', () => {
      const room = GENESIS_LAB_ROOMS.find((r) => r.id === 'wet-lab')!;
      for (const id of room.stationIds) {
        expect(getRoomForStation(id), id).toBe('wet-lab');
        const placement = getStationPlacement(id);
        expect(placement, id).not.toBeNull();
        expect(placement!.position.x, id).toBeGreaterThanOrEqual(room.bounds.minX);
        expect(placement!.position.x, id).toBeLessThanOrEqual(room.bounds.maxX);
        expect(placement!.position.z, id).toBeGreaterThanOrEqual(room.bounds.minZ);
        expect(placement!.position.z, id).toBeLessThanOrEqual(room.bounds.maxZ);
      }
    });

    it('every wet-lab station is reachable from Main Hall through the real door (door:main-wet)', () => {
      const lab = createCanonicalLaboratory();
      const wholeBuilding = { minX: -10.2, maxX: 10.2, minZ: -9.2, maxZ: 9.2 };
      for (const id of ['station:wet-sample-prep', 'station:wet-lab-bench', 'station:wet-analytical']) {
        const placement = getStationPlacement(id)!;
        const plan = planPath({ x: 0, z: 3.0 }, placement.position, wholeBuilding, lab.wallObstacles, { radius: 0.3 });
        expect(plan.reachable, id).toBe(true);
      }
    });
  });

  it('every station placement lands inside its own room bounds (the fixed data is internally consistent)', () => {
    const lab = createCanonicalLaboratory();
    for (const placement of lab.stationPlacements) {
      const r = lab.rooms.find((room) => room.id === placement.roomId)!;
      expect(placement.position.x, placement.stationId).toBeGreaterThanOrEqual(r.bounds.minX);
      expect(placement.position.x, placement.stationId).toBeLessThanOrEqual(r.bounds.maxX);
      expect(placement.position.z, placement.stationId).toBeGreaterThanOrEqual(r.bounds.minZ);
      expect(placement.position.z, placement.stationId).toBeLessThanOrEqual(r.bounds.maxZ);
    }
  });

  it('detects room from world position', () => {
    expect(getRoomAtPosition({ x: 0, z: 0 })).toBe('main-hall');
    expect(getRoomAtPosition({ x: -7.8, z: 0 })).toBe('human-study');
    expect(getRoomAtPosition({ x: 2.4, z: -7 })).toBe('histology');
    expect(getRoomAtPosition({ x: 99, z: 99 })).toBeNull();
  });

  describe('wall obstacles route the EXISTING grid-A* planner through doors — no second pathfinder', () => {
    it('has a gap at every door position (the planner is never told the door is solid)', () => {
      const lab = createCanonicalLaboratory();
      for (const door of lab.doors) {
        const blockedAtDoor = lab.wallObstacles.some((o) => door.center.x > o.minX && door.center.x < o.maxX && door.center.z > o.minZ && door.center.z < o.maxZ);
        expect(blockedAtDoor, door.id).toBe(false);
      }
    });

    it('a straight line through the SOLID part of a wall (between two door gaps) is blocked — proves the wall obstacles are real, not decorative', () => {
      const lab = createCanonicalLaboratory();
      const wholeBuilding = { minX: -10.2, maxX: 10.2, minZ: -9.2, maxZ: 9.2 };
      // main-hall's north wall (z=4.2) has door gaps at x=-1.7 and x=1.7 (main-wet / main-experimental);
      // x=0 sits on the solid segment between them, so a straight line through it must detour.
      const direct = planPath({ x: 0, z: 0 }, { x: 0, z: 7.0 }, wholeBuilding, lab.wallObstacles, { radius: 0.3 });
      expect(direct.reachable).toBe(true);
      expect(direct.waypoints.length).toBeGreaterThan(1);
    });

    it('main-hall to microscopy is reachable at all (the door gap genuinely connects the two rooms)', () => {
      const lab = createCanonicalLaboratory();
      const wholeBuilding = { minX: -10.2, maxX: 10.2, minZ: -9.2, maxZ: 9.2 };
      const plan = planPath({ x: 0, z: 0 }, { x: -2.4, z: -7.0 }, wholeBuilding, lab.wallObstacles, { radius: 0.3 });
      expect(plan.reachable).toBe(true);
    });

    it('every room-to-room route the pilot protocol names is reachable through its real door', () => {
      const lab = createCanonicalLaboratory();
      const wholeBuilding = { minX: -10.2, maxX: 10.2, minZ: -9.2, maxZ: 9.2 };
      const targets: readonly [string, { x: number; z: number }][] = [
        ['microscopy', { x: -2.4, z: -7.0 }],
        ['histology', { x: 2.4, z: -7.0 }],
        ['human-study', { x: -7.8, z: 0.0 }],
        ['imaging', { x: 7.8, z: 0.0 }],
        ['wet-lab', { x: -2.1, z: 7.4 }],
        ['experimental', { x: 2.4, z: 7.6 }],
      ];
      for (const [label, to] of targets) {
        const plan = planPath({ x: 0, z: 3.0 }, to, wholeBuilding, lab.wallObstacles, { radius: 0.3 });
        expect(plan.reachable, `Main Hall -> ${label}`).toBe(true);
      }
    });
  });
});
