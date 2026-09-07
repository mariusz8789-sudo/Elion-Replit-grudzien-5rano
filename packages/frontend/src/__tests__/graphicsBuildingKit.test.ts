import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createRooftopEquipment, createAmbulanceBay, createIndustrialBuilding, createFacadeBuilding } from '../core/three/graphics/buildingKit';

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

describe('createFacadeBuilding', () => {
  function build(overrides: Partial<Parameters<typeof createFacadeBuilding>[1]> = {}) {
    return createFacadeBuilding(THREE, {
      position: [0, 0, 0], width: 6, depth: 5, height: 9, seed: 3,
      wallMaterial: material(), windowMaterial: material(), ...overrides,
    });
  }

  function windowMesh(group: THREE.Group): THREE.InstancedMesh | undefined {
    return group.children.find((c) => (c as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh | undefined;
  }

  it('builds a body of exactly the requested footprint, standing ON the ground plane (not centred through it)', () => {
    const group = build();
    const body = group.children.find((c) => (c as THREE.Mesh).geometry instanceof THREE.BoxGeometry) as THREE.Mesh;
    const params = (body.geometry as THREE.BoxGeometry).parameters;
    expect(params.width).toBe(6);
    expect(params.depth).toBe(5);
    expect(params.height).toBe(9);
    // Base sits at y=0, so the centre must be at half the height.
    expect(body.position.y).toBeCloseTo(4.5, 6);
  });

  it('REGRESSION (draw calls): every window on all four facades is ONE InstancedMesh, never a mesh per window', () => {
    // The whole reason this function exists rather than copying epidemicCity3D.ts's hand-rolled
    // per-window-Mesh approach, which PERFORMANCE.md measured as the city scene's largest cost.
    const group = build();
    const instanced = group.children.filter((c) => (c as THREE.InstancedMesh).isInstancedMesh);
    expect(instanced).toHaveLength(1);
    expect((instanced[0] as THREE.InstancedMesh).count).toBeGreaterThan(20);
    // No individual window meshes leaked in alongside the batch.
    const plainMeshes = group.children.filter((c) => (c as THREE.Mesh).isMesh && !(c as THREE.InstancedMesh).isInstancedMesh);
    expect(plainMeshes.length).toBeLessThanOrEqual(2); // body (+ optional roof platform)
  });

  it('puts more windows on a taller building — rows really are derived from height', () => {
    const short = windowMesh(build({ height: 4 }))!.count;
    const tall = windowMesh(build({ height: 12 }))!.count;
    expect(tall).toBeGreaterThan(short);
  });

  it('is deterministic: the same seed produces the same window count, a different seed may differ', () => {
    expect(windowMesh(build({ seed: 11 }))!.count).toBe(windowMesh(build({ seed: 11 }))!.count);
  });

  it('keeps every window within the building footprint (windows sit on the facade, not floating off it)', () => {
    const group = build();
    const mesh = windowMesh(group)!;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix);
      expect(Math.abs(position.x)).toBeLessThanOrEqual(6 / 2 + 0.05);
      expect(Math.abs(position.z)).toBeLessThanOrEqual(5 / 2 + 0.05);
      expect(position.y).toBeGreaterThan(0);
      expect(position.y).toBeLessThan(9);
    }
  });

  it('is tagged decorative by default, matching every other context-massing generator in this kit', () => {
    expect(build().userData.visualOnlyContext).toBe(true);
  });
});
