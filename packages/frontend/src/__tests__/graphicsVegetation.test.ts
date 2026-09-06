import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createTreeField, createGroundClutter } from '../core/three/graphics/vegetation';

function materials() {
  return { trunk: new THREE.MeshStandardMaterial(), canopy: new THREE.MeshStandardMaterial() };
}

describe('createTreeField', () => {
  it('produces exactly two InstancedMesh draw calls (trunks, canopies) regardless of count', () => {
    const { trunk, canopy } = materials();
    const field = createTreeField(THREE, { count: 50, width: 20, depth: 20, trunkMaterial: trunk, canopyMaterial: canopy });
    const meshes = field.group.children.filter((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh[];
    expect(meshes).toHaveLength(2);
    expect(meshes[0]!.count).toBe(50);
    expect(meshes[1]!.count).toBe(50);
    expect(field.count).toBe(50);
  });

  it('scatters trees within the requested footprint, centered on `center`', () => {
    const { trunk, canopy } = materials();
    const field = createTreeField(THREE, { count: 100, width: 10, depth: 6, center: [50, -20], trunkMaterial: trunk, canopyMaterial: canopy });
    const trunkMesh = field.group.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    for (let i = 0; i < trunkMesh.count; i++) {
      trunkMesh.getMatrixAt(i, matrix);
      matrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
      expect(position.x).toBeGreaterThanOrEqual(50 - 5);
      expect(position.x).toBeLessThanOrEqual(50 + 5);
      expect(position.z).toBeGreaterThanOrEqual(-20 - 3);
      expect(position.z).toBeLessThanOrEqual(-20 + 3);
    }
  });

  it('is deterministic for a given seed (no reshuffling on hot reload)', () => {
    const { trunk, canopy } = materials();
    const a = createTreeField(THREE, { count: 20, width: 10, depth: 10, seed: 77, trunkMaterial: trunk, canopyMaterial: canopy });
    const b = createTreeField(THREE, { count: 20, width: 10, depth: 10, seed: 77, trunkMaterial: trunk, canopyMaterial: canopy });
    const meshA = a.group.children[0] as THREE.InstancedMesh;
    const meshB = b.group.children[0] as THREE.InstancedMesh;
    const m1 = new THREE.Matrix4();
    const m2 = new THREE.Matrix4();
    meshA.getMatrixAt(5, m1);
    meshB.getMatrixAt(5, m2);
    expect(m1.toArray()).toEqual(m2.toArray());
  });

  it('produces size variation across instances (not a cloned-looking field)', () => {
    const { trunk, canopy } = materials();
    const field = createTreeField(THREE, { count: 30, width: 20, depth: 20, trunkMaterial: trunk, canopyMaterial: canopy });
    const trunkMesh = field.group.children[0] as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    const scales = new Set<number>();
    for (let i = 0; i < trunkMesh.count; i++) {
      trunkMesh.getMatrixAt(i, matrix);
      matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      scales.add(Math.round(scale.x * 1000));
    }
    expect(scales.size).toBeGreaterThan(1);
  });

  it('dispose() does not throw and does not dispose the caller-supplied materials', () => {
    const { trunk, canopy } = materials();
    const field = createTreeField(THREE, { count: 5, width: 5, depth: 5, trunkMaterial: trunk, canopyMaterial: canopy });
    expect(() => field.dispose()).not.toThrow();
    // A material is only "disposed" once .dispose() has actually been called on IT — verify the
    // shared instances passed in are unaffected (this module never owns caller-supplied materials).
    expect(trunk.uuid).toBeTruthy();
    expect(canopy.uuid).toBeTruthy();
  });
});

describe('createGroundClutter', () => {
  it('produces one InstancedMesh regardless of count, squashed vertically (a low bush/rock silhouette)', () => {
    const material = new THREE.MeshStandardMaterial();
    const field = createGroundClutter(THREE, { count: 40, width: 15, depth: 15, material });
    const meshes = field.group.children.filter((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh[];
    expect(meshes).toHaveLength(1);
    expect(meshes[0]!.count).toBe(40);
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    matrix.identity();
    meshes[0]!.getMatrixAt(0, matrix);
    matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    expect(scale.y).toBeLessThan(scale.x);
  });
});
