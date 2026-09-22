import { describe, expect, it } from 'vitest';
import { findScientificInteriorTarget } from '../core/temporalCinematic/scientificInteriorVisuals';
import { buildHistoricalWorldSpecification } from '../core/temporalCinematic/historicalWorldParameters';
import { applyGeometryRenderReadiness } from '../core/temporalCinematic/renderReadiness';
import { generateSpecifiedWorld } from '../core/worldModel/specification/compiler';
import * as THREE from 'three';
import { createScientificAssetSlotVisual } from '../core/temporalCinematic/scientificInteriorVisuals';
import type { HighFidelityMaterialPalette } from '../core/three/graphics/highFidelityMaterialRegistry';
import { entityId } from '../core/worldModel/ecs/types';
import { canonicalJson, fnv1a } from '../core/events/hash';
import { validateWorldInvariants } from '../core/worldModel/specification/worldInvariants';
import { generateBuildingInterior } from '../core/worldModel/generation/geometry/interiorGenerator';
import type { GeneratedBuilding } from '../core/worldModel/generation/geometry/buildingGenerator';

describe('V6 generated scientific interiors', () => {
  it('uses the SAME generated WorldGraph and finds a real ROOM + its canonical ASSET_SLOTs', () => {
    const spec = buildHistoricalWorldSpecification({ place: 'Geneva', year: 2026, generateInteriors: true });
    const generated = generateSpecifiedWorld(spec);
    applyGeometryRenderReadiness(generated.graph);
    const target = findScientificInteriorTarget(generated.graph);
    expect(target).not.toBeNull();
    expect(target!.roomId).toMatch(/^room:/);
    const room = generated.graph.getEntity(target!.roomId);
    expect(room.geometry?.kind).toBe('ROOM');
    for (const slotId of target!.assetSlotIds) {
      const slot = generated.graph.getEntity(slotId);
      expect(slot.geometry?.kind).toBe('ASSET_SLOT');
    }
  });

  it('has no interior target when generation explicitly leaves interiors off', () => {
    const generated = generateSpecifiedWorld(buildHistoricalWorldSpecification({ place: 'Geneva', year: 2026, generateInteriors: false }));
    expect(findScientificInteriorTarget(generated.graph)).toBeNull();
  });

  it('generates a materials room with three real instrument slots in the Vienna WorldGraph', () => {
    const spec = buildHistoricalWorldSpecification({ place: 'Vienna', year: 2026, generateInteriors: true, generateNavigation: true });
    const { graph } = generateSpecifiedWorld(spec);
    const target = findScientificInteriorTarget(graph, 'MATERIALS_LAB');
    expect(target).not.toBeNull();
    const room = graph.getEntity(target!.roomId);
    if (room.geometry?.kind !== 'ROOM') throw new Error('Expected generated room');
    const building = graph.getEntity(entityId(room.geometry.buildingRef));
    expect(building.geometry?.kind === 'BUILDING' && building.geometry.buildingType).toBe('RESEARCH_CAMPUS');
    const slots = target!.assetSlotIds.map((id) => graph.getEntity(id));
    expect(slots.map((slot) => slot.geometry?.kind === 'ASSET_SLOT' && slot.geometry.slotType).sort()).toEqual([
      'COMPUTE_STATION', 'SPECTROMETER_STATION', 'THERMAL_STAGE_STATION',
    ]);
    // This Node test measures actual meshes/footprints, not WebGL or texture quality.
    const material = new THREE.MeshStandardMaterial();
    const palette: HighFidelityMaterialPalette = {
      white: material, dark: material, stainless: material, chrome: material,
      glass: material, medical: material, floor: material, wall: material,
      concrete: material, asphalt: material, wetAsphalt: material, brick: material,
      ground: material, foliage: material, skin: material, fabric: material,
      blueGlow: material, redGlow: material,
    };
    const occupied: THREE.Box3[] = [];
    for (const slot of slots) {
      if (slot.geometry?.kind !== 'ASSET_SLOT') throw new Error('Expected generated slot');
      expect(entityId(slot.geometry.roomRef)).toBe(room.id);
      const visual = createScientificAssetSlotVisual(THREE, slot, palette);
      expect(visual.name).not.toBe('genesis-empty-asset-slot');
      expect(visual.children.length).toBeGreaterThan(0);
      visual.position.set(slot.geometry.position.x, 0, slot.geometry.position.z);
      const footprint = new THREE.Box3().setFromObject(visual);
      const bounds = room.geometry.bounds;
      expect(footprint.min.x).toBeGreaterThan(bounds.minX);
      expect(footprint.max.x).toBeLessThan(bounds.maxX);
      expect(footprint.min.z).toBeGreaterThan(bounds.minZ);
      expect(footprint.max.z).toBeLessThan(bounds.maxZ);
      expect(occupied.some((other) => other.intersectsBox(footprint))).toBe(false);
      occupied.push(footprint);
      const interaction = graph.listEntities().find((entity) => entity.geometry?.kind === 'INTERACTION_POINT' && entityId(entity.geometry.targetRef) === slot.id);
      expect(interaction?.geometry?.kind === 'INTERACTION_POINT' && interaction.geometry.interactionKind).toBe('INSPECT');
      if (slot.geometry.slotType === 'COMPUTE_STATION') expect(visual.userData.computeBinding).toBe('UNBOUND');
    }
    const door = graph.listEntities().find((entity) => entity.geometry?.kind === 'DOOR' && entityId(entity.geometry.fromRef) === room.id);
    if (door?.geometry?.kind !== 'DOOR') throw new Error('Missing canonical room door');
    // Door-to-centre aisle, including a 1.2m-wide approach, stays clear.
    const aisle = new THREE.Box3(
      new THREE.Vector3(Math.min(target!.center[0], door.geometry.position.x), 0, door.geometry.position.z - 0.6),
      new THREE.Vector3(Math.max(target!.center[0], door.geometry.position.x), 2, door.geometry.position.z + 0.6),
    );
    expect(occupied.some((footprint) => footprint.intersectsBox(aisle))).toBe(false);
    expect(validateWorldInvariants(graph).violations).toEqual([]);
    const replay = generateSpecifiedWorld(spec);
    expect(fnv1a(canonicalJson(graph.listEntities()))).toBe(fnv1a(canonicalJson(replay.graph.listEntities())));
    material.dispose();
  });

  it('retains campus rooms and stable primary station ids, with compute slots on laboratory floors', () => {
    const building: GeneratedBuilding = {
      ref: { kind: 'building', id: 'campus' }, bounds: { minX: -12, maxX: 12, minZ: -10, maxZ: 10 },
      buildingType: 'RESEARCH_CAMPUS', floorCount: 3,
      parcelRef: { kind: 'parcel', id: 'parcel' }, districtRef: { kind: 'district', id: 'district' },
    };
    const interior = generateBuildingInterior(building, 2);
    expect(interior.rooms.filter((room) => room.roomType === 'MATERIALS_LAB')).toHaveLength(1);
    const labs = interior.rooms.filter((room) => room.roomType === 'LAB_BENCH_ROOM');
    expect(labs).toHaveLength(7);
    for (const room of labs) {
      const slots = interior.assetSlots.filter((slot) => slot.roomRef.id === room.ref.id);
      expect(slots.map((slot) => slot.slotType)).toEqual(['LAB_BENCH_STATION', 'COMPUTE_STATION']);
      expect(slots[0].ref.id).toBe(`${room.ref.id}-slot-0`);
      expect(slots[0].position).toEqual({ x: (room.bounds.minX + room.bounds.maxX) / 2, z: (room.bounds.minZ + room.bounds.maxZ) / 2 });
    }
    expect(generateBuildingInterior({ ...building, floorCount: 1 }, 2).assetSlots).toEqual([]);
    const cramped = generateBuildingInterior({ ...building, bounds: { minX: 0, maxX: 4, minZ: 0, maxZ: 4 } }, 2);
    const materialsRoom = cramped.rooms.find((room) => room.roomType === 'MATERIALS_LAB')!;
    expect(cramped.assetSlots.filter((slot) => slot.roomRef.id === materialsRoom.ref.id)).toEqual([]);
  });
});
