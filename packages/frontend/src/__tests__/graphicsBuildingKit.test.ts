import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createRooftopEquipment, createAmbulanceBay, createIndustrialBuilding } from '../core/three/graphics/buildingKit';

function material() {
  return new THREE.MeshStandardMaterial();
}

describe('createRooftopEquipment', () => {
  it('places the requested number of HVAC units plus their vents, plus an antenna by default', () => {
    const roof = createRooftopEquipment(THREE, { position: [0, 1, 0], footprintWidth: 1, footprintDepth: 1, unitCount: 3, material: material() });
    // 3 units * (box + vent) = 6, + 1 antenna column
    expect(roof.children).toHaveLength(7);
  });

  it('omits the antenna when antenna: false', () => {
    const roof = createRooftopEquipment(THREE, { position: [0, 1, 0], footprintWidth: 1, footprintDepth: 1, unitCount: 2, material: material(), antenna: false });
    expect(roof.children).toHaveLength(4);
  });

  it('keeps every unit within the requested footprint (with margin)', () => {
    const roof = createRooftopEquipment(THREE, { position: [0, 1, 0], footprintWidth: 1, footprintDepth: 1, unitCount: 5, material: material(), antenna: false });
    for (const child of roof.children) {
      expect(Math.abs(child.position.x)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(child.position.z)).toBeLessThanOrEqual(0.5);
    }
  });

  it('same seed is deterministic; different seed changes placement', () => {
    const a = createRooftopEquipment(THREE, { position: [0, 0, 0], footprintWidth: 2, footprintDepth: 2, unitCount: 3, material: material(), seed: 5 });
    const b = createRooftopEquipment(THREE, { position: [0, 0, 0], footprintWidth: 2, footprintDepth: 2, unitCount: 3, material: material(), seed: 5 });
    const c = createRooftopEquipment(THREE, { position: [0, 0, 0], footprintWidth: 2, footprintDepth: 2, unitCount: 3, material: material(), seed: 999 });
    expect(a.children[0]!.position.x).toBeCloseTo(b.children[0]!.position.x, 10);
    expect(a.children[0]!.position.x).not.toBeCloseTo(c.children[0]!.position.x, 5);
  });
});

describe('createAmbulanceBay', () => {
  it('builds a pad, four support columns, a canopy, and a sign', () => {
    const bay = createAmbulanceBay(THREE, {
      position: [0, 0, 0], width: 1, depth: 0.6, canopyMaterial: material(), padMaterial: material(),
    });
    expect(bay.children).toHaveLength(1 + 4 + 1 + 1);
    expect(bay.userData.visualOnlyContext).toBe(true);
  });
});

describe('createIndustrialBuilding', () => {
  it('builds a body, roof, door, and rooftop equipment group, tagged as decorative context', () => {
    const building = createIndustrialBuilding(THREE, {
      position: [0, 0, 0], width: 1, depth: 0.8, seed: 7, wallMaterial: material(), roofMaterial: material(),
    });
    expect(building.userData.visualOnlyContext).toBe(true);
    expect(building.children.length).toBeGreaterThanOrEqual(4); // body + roof + door + rooftop-equipment group
  });

  it('is deterministic: the same seed reproduces the same height', () => {
    const a = createIndustrialBuilding(THREE, { position: [0, 0, 0], width: 1, depth: 0.8, seed: 11, wallMaterial: material(), roofMaterial: material() });
    const b = createIndustrialBuilding(THREE, { position: [0, 0, 0], width: 1, depth: 0.8, seed: 11, wallMaterial: material(), roofMaterial: material() });
    const bodyA = a.children[0] as THREE.Mesh;
    const bodyB = b.children[0] as THREE.Mesh;
    expect((bodyA.geometry as THREE.BoxGeometry).parameters.height).toBe((bodyB.geometry as THREE.BoxGeometry).parameters.height);
  });

  it('warehouse kind is lower than industrial kind on average height parameter range', () => {
    const warehouse = createIndustrialBuilding(THREE, { position: [0, 0, 0], width: 1, depth: 0.8, seed: 3, kind: 'warehouse', wallMaterial: material(), roofMaterial: material() });
    const body = warehouse.children[0] as THREE.Mesh;
    expect((body.geometry as THREE.BoxGeometry).parameters.height).toBeLessThan(0.62); // 0.38 + up to 0.12
  });
});
