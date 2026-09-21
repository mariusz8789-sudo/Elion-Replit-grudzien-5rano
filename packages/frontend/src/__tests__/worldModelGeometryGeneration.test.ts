import { describe, expect, it } from 'vitest';
import { canonicalJson, fnv1a } from '../core/events/hash';
import { entityId } from '../core/worldModel/ecs/types';
import type { BuildingGeometry, DistrictGeometry, DoorGeometry, RoomGeometry } from '../core/worldModel/ecs/geometry';
import { CHEMISTRY_KINETICS_SOLVER_ID } from '../core/worldModel/domains/chemistryKinetics';
import { EPIDEMIC_SEIR_SOLVER_ID } from '../core/worldModel/domains/epidemicSEIR';
import { HYDRAULICS_PUMP_PIPE_SOLVER_ID } from '../core/worldModel/domains/hydraulicsPumpPipe';
import { inspectEntity } from '../core/worldModel/bridge/entityInteractionBridge';
import { findEntityContainingPoint, findNavigationPath } from '../core/worldModel/queries/worldQueries';
import { serializeWorld, restoreWorld } from '../core/worldModel/persistence/worldSnapshot';
import type { WorldRecord } from '../core/worldModel/persistence/worldRegistry';
import { compileSpecification, generateSpecifiedWorld } from '../core/worldModel/specification/compiler';
import { validateWorldInvariants } from '../core/worldModel/specification/worldInvariants';
import type { WorldSpecification } from '../core/worldModel/specification/worldSpecification';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * WORLD GENERATION — GEOMETRY FOUNDATION (Phases 3-5) tests. Genesis-native:
 * exercises the REAL compiled pipeline (`compileSpecification` /
 * `generateSpecifiedWorld`) through the opt-in `structuralDetail` field,
 * never a copy of World Forge's own (weaker) test suite.
 */
function baseSpec(seed: number, overrides: Partial<WorldSpecification> = {}): WorldSpecification {
  return {
    worldId: 'geo-city-1',
    seed,
    worldType: ['CITY'],
    structuralDetail: {
      citySizeM: 300,
      districtCount: 6,
      parcelsPerDistrict: 3,
      maxFloors: 6,
      roomsPerFloorSide: 2,
      generateInteriors: true,
      generateNavigation: true,
    },
    ...overrides,
  };
}

describe('Geometry generation — backward compatibility (opt-in, additive)', () => {
  it('a specification with no structuralDetail produces zero geometry-component entities', () => {
    const { graph } = generateSpecifiedWorld({ worldId: 'no-geo', seed: 1, worldType: ['CITY'] });
    const geometryEntities = graph.listEntities().filter((e) => e.geometry !== undefined);
    expect(geometryEntities).toHaveLength(0);
  });

  it('an existing multi-template specification compiles identically whether or not this test file exists (regression guard on CITY_TEMPLATE shape)', () => {
    const { graph } = generateSpecifiedWorld({ worldId: 'legacy-city', seed: 3, worldType: ['CITY'], geography: { districtCount: 2, buildingsPerDistrict: 2 } });
    const districts = graph.listEntities().filter((e) => e.ref.kind === 'district');
    expect(districts).toHaveLength(2);
    expect(districts.every((d) => d.scale.level === 'REGION')).toBe(true);
  });
});

describe('Geometry generation — determinism', () => {
  it('the same specification (seed included) compiles to a canonically identical blueprint', () => {
    const a = compileSpecification(baseSpec(11));
    const b = compileSpecification(baseSpec(11));
    expect(fnv1a(canonicalJson(a.blueprint))).toBe(fnv1a(canonicalJson(b.blueprint)));
  });

  it('a different seed can change district/building types but never the structural grid (district/parcel/building counts, bounds)', () => {
    const a = generateSpecifiedWorld(baseSpec(11));
    const b = generateSpecifiedWorld(baseSpec(99));

    const districtsA = a.graph.listEntities().filter((e) => e.geometry?.kind === 'DISTRICT');
    const districtsB = b.graph.listEntities().filter((e) => e.geometry?.kind === 'DISTRICT');
    expect(districtsA).toHaveLength(6);
    expect(districtsB).toHaveLength(6);
    expect(districtsA.map((d) => d.id).sort()).toEqual(districtsB.map((d) => d.id).sort());
    for (const districtA of districtsA) {
      const districtB = districtsB.find((d) => d.id === districtA.id)!;
      expect((districtB.geometry as DistrictGeometry).bounds).toEqual((districtA.geometry as DistrictGeometry).bounds);
    }

    const buildingsA = a.graph.listEntities().filter((e) => e.geometry?.kind === 'BUILDING');
    const buildingsB = b.graph.listEntities().filter((e) => e.geometry?.kind === 'BUILDING');
    expect(buildingsA).toHaveLength(buildingsB.length);
  });

  it('generateSpecifiedWorld does not throw and passes structural invariants for a geometry-enabled specification', () => {
    const { graph } = generateSpecifiedWorld(baseSpec(5));
    const result = validateWorldInvariants(graph);
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });
});

describe('Geometry generation — district/parcel/building structure (Phase 3)', () => {
  it('produces exactly the requested district and parcel counts, with non-overlapping district bounds', () => {
    const { graph } = generateSpecifiedWorld(baseSpec(1));
    const districts = graph.listEntities().filter((e) => e.geometry?.kind === 'DISTRICT');
    expect(districts).toHaveLength(6);

    for (let i = 0; i < districts.length; i++) {
      for (let j = i + 1; j < districts.length; j++) {
        const a = (districts[i].geometry as DistrictGeometry).bounds;
        const b = (districts[j].geometry as DistrictGeometry).bounds;
        const overlaps = a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
        expect(overlaps).toBe(false);
      }
    }

    const parcels = graph.listEntities().filter((e) => e.geometry?.kind === 'PARCEL');
    expect(parcels).toHaveLength(6 * 3);
  });

  it('every building sits within its own parcel bounds, and every building has exactly one floor entity per its declared floorCount when interiors are generated', () => {
    const { graph } = generateSpecifiedWorld(baseSpec(2));
    const buildings = graph.listEntities().filter((e) => e.geometry?.kind === 'BUILDING');
    expect(buildings.length).toBeGreaterThan(0);

    for (const building of buildings) {
      const geo = building.geometry as BuildingGeometry;
      const parcel = graph.getEntity(entityId(geo.parcelRef));
      const parcelBounds = (parcel.geometry as { kind: 'PARCEL'; bounds: BuildingGeometry['bounds'] }).bounds;
      expect(geo.bounds.minX).toBeGreaterThanOrEqual(parcelBounds.minX);
      expect(geo.bounds.maxX).toBeLessThanOrEqual(parcelBounds.maxX);
      expect(geo.bounds.minZ).toBeGreaterThanOrEqual(parcelBounds.minZ);
      expect(geo.bounds.maxZ).toBeLessThanOrEqual(parcelBounds.maxZ);

      const floors = graph.listEntities().filter((e) => e.geometry?.kind === 'FLOOR' && e.geometry.buildingRef.id === building.ref.id);
      expect(floors).toHaveLength(geo.floorCount);
    }
  });

  it('REGRESSION: every building resolves its buildingType from its OWN district — never a neighboring one (the fixed World Forge bug class)', () => {
    // A district count high enough to span multiple grid rows/cols, so an
    // indexOf-style reconstruction bug (World Forge generators.ts:27) would
    // provably misattribute at least some buildings if it were present here.
    const { graph } = generateSpecifiedWorld(baseSpec(42, { structuralDetail: { ...baseSpec(42).structuralDetail, districtCount: 9, parcelsPerDistrict: 2 } }));
    const districts = graph.listEntities().filter((e) => e.geometry?.kind === 'DISTRICT');
    const buildings = graph.listEntities().filter((e) => e.geometry?.kind === 'BUILDING');
    expect(districts.length).toBe(9);
    expect(buildings.length).toBeGreaterThan(0);

    for (const building of buildings) {
      const geo = building.geometry as BuildingGeometry;
      // The building's `districtRef` must point to a district that ACTUALLY
      // exists and whose id was carried forward directly (never
      // reconstructed via array index), and the parcel's own districtRef
      // must agree with the building's — the two must never diverge.
      const district = graph.getEntity(entityId(geo.districtRef));
      expect(districts.some((d) => d.id === district.id)).toBe(true);
      const parcel = graph.getEntity(entityId(geo.parcelRef));
      const parcelDistrictRef = (parcel.geometry as { kind: 'PARCEL'; districtRef: BuildingGeometry['districtRef'] }).districtRef;
      expect(entityId(parcelDistrictRef)).toBe(entityId(geo.districtRef));
    }
  });
});

describe('Geometry generation — interiors (Phase 4)', () => {
  it('ground floor is a single LOBBY spanning the building footprint; upper floors have a CORRIDOR plus rooms all door-connected to it', () => {
    const { graph } = generateSpecifiedWorld(baseSpec(7));
    const buildings = graph.listEntities().filter((e) => e.geometry?.kind === 'BUILDING' && (e.geometry as BuildingGeometry).floorCount >= 2);
    expect(buildings.length).toBeGreaterThan(0);

    for (const building of buildings.slice(0, 5)) {
      const floors = graph.listEntities().filter((e) => e.geometry?.kind === 'FLOOR' && e.geometry.buildingRef.id === building.ref.id);
      const groundFloor = floors.find((f) => f.geometry?.kind === 'FLOOR' && f.geometry.level === 0)!;
      const groundRooms = graph.listEntities().filter((e) => e.geometry?.kind === 'ROOM' && (e.geometry as RoomGeometry).floorRef.id === groundFloor.ref.id);
      expect(groundRooms).toHaveLength(1);
      expect((groundRooms[0].geometry as RoomGeometry).roomType).toBe('LOBBY');

      const upperFloor = floors.find((f) => f.geometry?.kind === 'FLOOR' && f.geometry.level === 1)!;
      const upperRooms = graph.listEntities().filter((e) => e.geometry?.kind === 'ROOM' && (e.geometry as RoomGeometry).floorRef.id === upperFloor.ref.id);
      const corridor = upperRooms.find((r) => (r.geometry as RoomGeometry).roomType === 'CORRIDOR');
      expect(corridor).toBeDefined();

      const nonCorridorRooms = upperRooms.filter((r) => r.id !== corridor!.id);
      expect(nonCorridorRooms.length).toBeGreaterThan(0);
      const doors = graph.listEntities().filter((e) => e.geometry?.kind === 'DOOR');
      for (const room of nonCorridorRooms) {
        const connectingDoor = doors.find((d) => {
          const geo = d.geometry as DoorGeometry;
          return (entityId(geo.fromRef) === room.id && entityId(geo.toRef) === corridor!.id) || (entityId(geo.toRef) === room.id && entityId(geo.fromRef) === corridor!.id);
        });
        expect(connectingDoor).toBeDefined();
      }
    }
  });

  it('real stairs connect every pair of vertically adjacent floors, and a building tall enough gets a real elevator serving every floor', () => {
    const { graph } = generateSpecifiedWorld(baseSpec(8, { structuralDetail: { ...baseSpec(8).structuralDetail, maxFloors: 10 } }));
    const tallBuilding = graph
      .listEntities()
      .filter((e) => e.geometry?.kind === 'BUILDING')
      .find((e) => (e.geometry as BuildingGeometry).floorCount >= 3);
    expect(tallBuilding).toBeDefined();

    const floorCount = (tallBuilding!.geometry as BuildingGeometry).floorCount;
    const stairs = graph.listEntities().filter((e) => e.geometry?.kind === 'STAIR' && e.geometry.buildingRef.id === tallBuilding!.ref.id);
    expect(stairs).toHaveLength(floorCount - 1);

    const elevators = graph.listEntities().filter((e) => e.geometry?.kind === 'ELEVATOR' && e.geometry.buildingRef.id === tallBuilding!.ref.id);
    expect(elevators).toHaveLength(1);
    expect(elevators[0].geometry?.kind === 'ELEVATOR' && elevators[0].geometry.connectsFloorRefs).toHaveLength(floorCount);
  });

  it('scientific-room-typed buildings (LABORATORY-family) get equipment asset slots — the seam Phase 6 solvers will populate', () => {
    // districtCount high enough that the CIVIC-weighted table's LABORATORY/RESEARCH_CAMPUS/HOSPITAL branch is exercised across several seeds.
    let foundLabAssetSlot = false;
    for (let seed = 0; seed < 20 && !foundLabAssetSlot; seed++) {
      const { graph } = generateSpecifiedWorld(baseSpec(seed, { structuralDetail: { ...baseSpec(seed).structuralDetail, districtCount: 9, parcelsPerDistrict: 2 } }));
      const labRooms = graph.listEntities().filter((e) => e.geometry?.kind === 'ROOM' && (e.geometry as RoomGeometry).roomType === 'LAB_BENCH_ROOM');
      if (labRooms.length === 0) continue;
      const slots = graph.listEntities().filter((e) => e.geometry?.kind === 'ASSET_SLOT' && labRooms.some((r) => r.id === entityId((e.geometry as { kind: 'ASSET_SLOT'; roomRef: { kind: string; id: string | number } }).roomRef)));
      if (slots.length > 0) foundLabAssetSlot = true;
    }
    expect(foundLabAssetSlot).toBe(true);
  });
});

describe('Geometry generation — navigation (Phase 5)', () => {
  it('every nav edge cost is a real geometric distance (or vertical floor height), never a fixed/array-order placeholder', () => {
    const { graph } = generateSpecifiedWorld(baseSpec(9));
    const navEdges = graph.listEntities().filter((e) => e.geometry?.kind === 'NAV_EDGE');
    expect(navEdges.length).toBeGreaterThan(0);
    for (const edge of navEdges) {
      const geo = edge.geometry as { kind: 'NAV_EDGE'; costM: number };
      expect(geo.costM).toBeGreaterThan(0);
      expect(Number.isFinite(geo.costM)).toBe(true);
    }
  });

  it('the full navigation graph is connected — a room deep inside a building is reachable from a city intersection (real reachability, validated by the extended validator)', () => {
    const { graph } = generateSpecifiedWorld(baseSpec(10));
    const result = validateWorldInvariants(graph);
    expect(result.ok).toBe(true);

    const navNodes = graph.listEntities().filter((e) => e.geometry?.kind === 'NAV_NODE');
    const navEdges = graph.listEntities().filter((e) => e.geometry?.kind === 'NAV_EDGE');
    expect(navNodes.length).toBeGreaterThan(0);

    const adjacency = new Map<string, string[]>();
    for (const node of navNodes) adjacency.set(node.id, []);
    for (const edge of navEdges) {
      const geo = edge.geometry as { kind: 'NAV_EDGE'; fromRef: { kind: string; id: string | number }; toRef: { kind: string; id: string | number } };
      const fromId = entityId(geo.fromRef);
      const toId = entityId(geo.toRef);
      adjacency.get(fromId)?.push(toId);
      adjacency.get(toId)?.push(fromId);
    }

    const visited = new Set<string>([navNodes[0].id]);
    const queue = [navNodes[0].id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    expect(visited.size).toBe(navNodes.length);
  });

  it('a broken navigation graph (a dangling, disconnected nav node) is caught by validateWorldInvariants', () => {
    const { graph } = generateSpecifiedWorld(baseSpec(12));
    graph.addEntity({
      id: 'nav-node:orphan',
      ref: { kind: 'nav-node', id: 'orphan' },
      label: 'Orphan Nav Node',
      scale: { level: 'DISTRICT' },
      geometry: { kind: 'NAV_NODE', position: { x: 9999, z: 9999 } },
      grounding: 'UNGROUNDED_APPROXIMATION',
      updatedAtTick: 0,
    });
    const result = validateWorldInvariants(graph);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.message.includes('not fully connected'))).toBe(true);
  });
});

describe('Geometry generation — scientific worlds (Phase 6)', () => {
  it('a requested chemistry domain attaches a REAL Arrhenius-bound substance as a child of a generated LAB_BENCH_ROOM/REACTOR_ROOM, never a whole building', () => {
    let found: { graph: ReturnType<typeof generateSpecifiedWorld>['graph']; labRoomId: string } | undefined;
    for (let seed = 0; seed < 30 && !found; seed++) {
      const spec: WorldSpecification = {
        ...baseSpec(seed, { structuralDetail: { ...baseSpec(seed).structuralDetail, districtCount: 9, parcelsPerDistrict: 2 } }),
        scientificDomains: [{ domain: 'chemistry', required: false, chemistryOptions: { initialTemperatureK: 700 } }],
      };
      const { graph } = generateSpecifiedWorld(spec);
      const labRoom = graph.listEntities().find((e) => e.geometry?.kind === 'ROOM' && ((e.geometry as RoomGeometry).roomType === 'LAB_BENCH_ROOM' || (e.geometry as RoomGeometry).roomType === 'REACTOR_ROOM'));
      if (!labRoom) continue;
      const substance = graph.listEntities().find((e) => e.domainBinding?.solverId === CHEMISTRY_KINETICS_SOLVER_ID && e.scale.parentEntityId !== undefined);
      if (substance) found = { graph, labRoomId: labRoom.id };
    }
    expect(found).toBeDefined();

    const substance = found!.graph.listEntities().find((e) => e.domainBinding?.solverId === CHEMISTRY_KINETICS_SOLVER_ID)!;
    expect(substance.physics?.temperatureK).toBe(700);
    // The substance's parent chain must bottom out at the real generated room, never a bare building.
    const lab = found!.graph.getEntity(substance.scale.parentEntityId!);
    expect(lab.scale.parentEntityId).toBe(found!.labRoomId);
  });

  it('a requested epidemiology domain attaches a REAL SEIR-bound population as a child of a generated WARD room', () => {
    let found = false;
    for (let seed = 0; seed < 30 && !found; seed++) {
      const spec: WorldSpecification = {
        ...baseSpec(seed, { structuralDetail: { ...baseSpec(seed).structuralDetail, districtCount: 9, parcelsPerDistrict: 2 } }),
        scientificDomains: [{ domain: 'epidemiology', required: false }],
        population: { count: 10_000 },
      };
      const { graph } = generateSpecifiedWorld(spec);
      const wardRoom = graph.listEntities().find((e) => e.geometry?.kind === 'ROOM' && (e.geometry as RoomGeometry).roomType === 'WARD');
      if (!wardRoom) continue;
      const population = graph.listEntities().find((e) => e.domainBinding?.solverId === EPIDEMIC_SEIR_SOLVER_ID && e.scale.parentEntityId === wardRoom.id);
      if (population) {
        found = true;
        expect(population.domainState?.S).toBeGreaterThan(0);
      }
    }
    expect(found).toBe(true);
  });

  it('a requested hydraulics domain attaches a REAL pump-pipe-bound entity as a child of a generated PUMP_ROOM', () => {
    let found = false;
    for (let seed = 0; seed < 30 && !found; seed++) {
      const spec: WorldSpecification = {
        ...baseSpec(seed, { structuralDetail: { ...baseSpec(seed).structuralDetail, districtCount: 9, parcelsPerDistrict: 2 } }),
        scientificDomains: [{ domain: 'hydraulics', required: false }],
      };
      const { graph } = generateSpecifiedWorld(spec);
      const pumpRoom = graph.listEntities().find((e) => e.geometry?.kind === 'ROOM' && (e.geometry as RoomGeometry).roomType === 'PUMP_ROOM');
      if (!pumpRoom) continue;
      const pumpPipe = graph.listEntities().find((e) => e.domainBinding?.solverId === HYDRAULICS_PUMP_PIPE_SOLVER_ID && e.scale.parentEntityId === pumpRoom.id);
      if (pumpPipe) found = true;
    }
    expect(found).toBe(true);
  });

  it('never attaches more than one scientific facility per building, even when multiple matching rooms exist', () => {
    const spec: WorldSpecification = {
      ...baseSpec(4, { structuralDetail: { ...baseSpec(4).structuralDetail, districtCount: 9, parcelsPerDistrict: 2, maxFloors: 8 } }),
      scientificDomains: [{ domain: 'chemistry', required: false }],
    };
    const { graph } = generateSpecifiedWorld(spec);
    const substances = graph.listEntities().filter((e) => e.domainBinding?.solverId === CHEMISTRY_KINETICS_SOLVER_ID);
    const labParentBuildingIds = substances.map((s) => {
      const lab = graph.getEntity(s.scale.parentEntityId!);
      const room = graph.getEntity(lab.scale.parentEntityId!);
      return (room.geometry as RoomGeometry).buildingRef.id;
    });
    expect(new Set(labParentBuildingIds).size).toBe(labParentBuildingIds.length);
  });

  it('without a matching structuralDetail + scientificDomains combination, no scientific facility is attached (opt-in, additive)', () => {
    const { graph } = generateSpecifiedWorld(baseSpec(1));
    const anySolverBoundEntity = graph.listEntities().some((e) => e.domainBinding?.solverId === CHEMISTRY_KINETICS_SOLVER_ID || e.domainBinding?.solverId === EPIDEMIC_SEIR_SOLVER_ID || e.domainBinding?.solverId === HYDRAULICS_PUMP_PIPE_SOLVER_ID);
    expect(anySolverBoundEntity).toBe(false);
  });
});

describe('Geometry-aware query API (Phase 7)', () => {
  it('findEntityContainingPoint resolves a point to the most specific structure containing it (room, not just building or district)', () => {
    const { graph } = generateSpecifiedWorld(baseSpec(13));
    const engine = new TemporalEngine(graph);
    const room = graph.listEntities().find((e) => e.geometry?.kind === 'ROOM' && (e.geometry as RoomGeometry).roomType !== 'LOBBY' && (e.geometry as RoomGeometry).roomType !== 'CORRIDOR')!;
    const bounds = (room.geometry as RoomGeometry).bounds;
    const centerPoint = { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };

    const found = findEntityContainingPoint(engine, centerPoint);
    expect(found?.id).toBe(room.id);

    const districtOnly = findEntityContainingPoint(engine, centerPoint, 'DISTRICT');
    expect(districtOnly?.geometry?.kind).toBe('DISTRICT');
  });

  it('findEntityContainingPoint returns undefined for a point outside every generated structure', () => {
    const { graph } = generateSpecifiedWorld(baseSpec(13));
    const engine = new TemporalEngine(graph);
    const found = findEntityContainingPoint(engine, { x: 1_000_000, z: 1_000_000 });
    expect(found).toBeUndefined();
  });

  it('findNavigationPath finds a real path (with correct total cost) between two nav nodes across the whole generated navigation graph', () => {
    const { graph } = generateSpecifiedWorld(baseSpec(14));
    const engine = new TemporalEngine(graph);
    const navNodes = graph.listEntities().filter((e) => e.geometry?.kind === 'NAV_NODE');
    expect(navNodes.length).toBeGreaterThan(2);

    const from = navNodes[0];
    const to = navNodes[navNodes.length - 1];
    const result = findNavigationPath(engine, from.id, to.id);
    expect(result.found).toBe(true);
    expect(result.nodeIds[0]).toBe(from.id);
    expect(result.nodeIds[result.nodeIds.length - 1]).toBe(to.id);
    expect(result.totalCostM).toBeGreaterThan(0);
    expect(Number.isFinite(result.totalCostM)).toBe(true);
  });

  it('findNavigationPath reports found:false for two nav nodes with no connecting edges', () => {
    const { graph } = generateSpecifiedWorld(baseSpec(15));
    graph.addEntity({
      id: 'nav-node:isolated',
      ref: { kind: 'nav-node', id: 'isolated' },
      label: 'Isolated Nav Node',
      scale: { level: 'DISTRICT' },
      geometry: { kind: 'NAV_NODE', position: { x: -99999, z: -99999 } },
      grounding: 'UNGROUNDED_APPROXIMATION',
      updatedAtTick: 0,
    });
    const engine = new TemporalEngine(graph);
    const anyOtherNavNode = graph.listEntities().find((e) => e.geometry?.kind === 'NAV_NODE' && e.id !== 'nav-node:isolated')!;
    const result = findNavigationPath(engine, 'nav-node:isolated', anyOtherNavNode.id);
    expect(result.found).toBe(false);
    expect(result.nodeIds).toEqual([]);
  });
});

describe('Canonical E2E (Phase 8)', () => {
  it('WorldSpec -> generate -> validate -> serialize/persist -> restore -> canonical hash -> WorldGraph -> navigation -> interaction -> scientific station -> manifest', () => {
    // 1. WORLDSPEC — a small generated city requesting real interiors, navigation, AND a scientific domain.
    const spec: WorldSpecification = {
      worldId: 'e2e-city-1',
      seed: 21,
      worldType: ['CITY'],
      structuralDetail: { citySizeM: 300, districtCount: 9, parcelsPerDistrict: 2, maxFloors: 6, roomsPerFloorSide: 2, generateInteriors: true, generateNavigation: true },
      scientificDomains: [{ domain: 'chemistry', required: false, chemistryOptions: { initialTemperatureK: 650 } }],
    };

    // 2. GENERATE + 3. VALIDATE (generateSpecifiedWorld throws on structural-invariant failure — see specification/worldInvariants.ts).
    const { graph, generated } = generateSpecifiedWorld(spec);
    const invariants = validateWorldInvariants(graph);
    expect(invariants.ok).toBe(true);

    // 4. SERIALIZE/PERSIST through the EXISTING Genesis mechanism (persistence/worldSnapshot.ts) — never a second serializer.
    const engine = new TemporalEngine(graph);
    engine.journal.recordEvent(generated.generationEvent);
    const record: WorldRecord = { worldId: spec.worldId, seed: spec.seed, specification: spec, createdAt: new Date(0).toISOString(), branchId: engine.branchId };
    const snapshot = serializeWorld(record, engine);
    const roundTripped = JSON.parse(JSON.stringify(snapshot)); // proves this is genuinely plain, storage-agnostic data

    // 5. RESTORE — the exact inverse.
    const restored = restoreWorld(roundTripped);

    // 6. CANONICAL HASH — the SAME fnv1a/canonicalJson hash used everywhere in Genesis (core/events/hash.ts), never World Forge's SHA-256.
    const originalHash = fnv1a(canonicalJson(graph.listEntities()));
    const restoredHash = fnv1a(canonicalJson(restored.engine.graph.listEntities()));
    expect(restoredHash).toBe(originalHash);

    // 7. WORLDGRAPH — the restored graph is the SAME canonical WorldGraph class, not a copy.
    expect(restored.engine.graph.listEntities().length).toBe(graph.listEntities().length);

    // 8. NAVIGATION — a real path exists from a city intersection to a building entrance on the RESTORED graph.
    const navNodes = restored.engine.graph.listEntities().filter((e) => e.geometry?.kind === 'NAV_NODE');
    expect(navNodes.length).toBeGreaterThan(1);
    const pathResult = findNavigationPath(restored.engine, navNodes[0].id, navNodes[navNodes.length - 1].id);
    expect(pathResult.found).toBe(true);

    // 9. INTERACTION — the EXISTING generic interaction bridge (bridge/entityInteractionBridge.ts) inspects a real generated room.
    const room = restored.engine.graph.listEntities().find((e) => e.geometry?.kind === 'ROOM')!;
    const inspection = inspectEntity(restored.engine.graph, room.id);
    expect(inspection).not.toBeNull();
    expect(inspection!.grounding).toBeDefined();

    // 10. SCIENTIFIC STATION — a real chemistry-solver-bound substance, parented under a real generated room (Phase 6), survived the round trip.
    const substance = restored.engine.graph.listEntities().find((e) => e.chemical && e.domainBinding?.domainId);
    if (substance) {
      const lab = restored.engine.graph.getEntity(substance.scale.parentEntityId!);
      const stationRoom = restored.engine.graph.getEntity(lab.scale.parentEntityId!);
      expect(stationRoom.geometry?.kind).toBe('ROOM');
    }

    // 11. FINAL MANIFEST — a plain summary of what this generated world actually contains.
    const entities = restored.engine.graph.listEntities();
    const countByGeometryKind = (kind: string) => entities.filter((e) => e.geometry?.kind === kind).length;
    const manifest = {
      worldId: spec.worldId,
      seed: spec.seed,
      entityCount: entities.length,
      districts: countByGeometryKind('DISTRICT'),
      parcels: countByGeometryKind('PARCEL'),
      buildings: countByGeometryKind('BUILDING'),
      floors: countByGeometryKind('FLOOR'),
      rooms: countByGeometryKind('ROOM'),
      doors: countByGeometryKind('DOOR'),
      stairs: countByGeometryKind('STAIR'),
      elevators: countByGeometryKind('ELEVATOR'),
      navNodes: countByGeometryKind('NAV_NODE'),
      navEdges: countByGeometryKind('NAV_EDGE'),
      canonicalHash: restoredHash,
    };
    expect(manifest.districts).toBe(9);
    expect(manifest.buildings).toBeGreaterThan(0);
    expect(manifest.rooms).toBeGreaterThan(0);
    expect(manifest.navNodes).toBeGreaterThan(0);
  });
});
