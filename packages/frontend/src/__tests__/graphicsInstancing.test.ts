import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { InstanceBatch, setInstanceColor, setInstanceTransform } from '../core/three/graphics/instancing';

describe('InstanceBatch — transforms', () => {
  it('returns null from build() when nothing was ever added', () => {
    const scene = new THREE.Scene();
    const batch = new InstanceBatch(THREE, new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    expect(batch.build(scene)).toBeNull();
    expect(scene.children).toHaveLength(0);
  });

  it('bakes N added instances into one InstancedMesh with count N', () => {
    const scene = new THREE.Scene();
    const batch = new InstanceBatch(THREE, new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    batch.add([0, 0, 0]).add([1, 0, 0]).add([2, 0, 0]);
    const mesh = batch.build(scene);
    expect(mesh).not.toBeNull();
    expect(mesh!.count).toBe(3);
    expect(batch.count).toBe(3);
    expect(scene.children).toContain(mesh);
  });

  it('records each instance transform correctly (position/rotation/scale)', () => {
    const scene = new THREE.Scene();
    const batch = new InstanceBatch(THREE, new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    batch.add([1, 2, 3], [0, Math.PI / 2, 0], 2);
    const mesh = batch.build(scene)!;
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(0, matrix);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    matrix.decompose(position, quaternion, scale);
    expect(position.toArray()).toEqual([1, 2, 3]);
    expect(scale.toArray()).toEqual([2, 2, 2]);
    const expectedQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
    expect(quaternion.x).toBeCloseTo(expectedQuat.x);
    expect(quaternion.y).toBeCloseTo(expectedQuat.y);
    expect(quaternion.z).toBeCloseTo(expectedQuat.z);
  });

  it('accepts a non-uniform scale tuple', () => {
    const scene = new THREE.Scene();
    const batch = new InstanceBatch(THREE, new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    batch.add([0, 0, 0], [0, 0, 0], [1, 2, 3]);
    const mesh = batch.build(scene)!;
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(0, matrix);
    const scale = new THREE.Vector3();
    matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    expect(scale.toArray()).toEqual([1, 2, 3]);
  });

  it('defaults castShadow to false, honors an explicit true', () => {
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshStandardMaterial();
    const defaultCast = new InstanceBatch(THREE, geometry, material).add([0, 0, 0]).build(new THREE.Scene());
    expect(defaultCast!.castShadow).toBe(false);
    const explicitCast = new InstanceBatch(THREE, geometry, material).add([0, 0, 0]).build(new THREE.Scene(), true);
    expect(explicitCast!.castShadow).toBe(true);
  });

  it('has no instanceColor attribute when no instance was ever colored', () => {
    const scene = new THREE.Scene();
    const batch = new InstanceBatch(THREE, new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    batch.add([0, 0, 0]);
    const mesh = batch.build(scene)!;
    expect(mesh.instanceColor).toBeNull();
  });
});

describe('InstanceBatch — per-instance color', () => {
  it('sets material.vertexColors and populates instanceColor when any instance is colored', () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial();
    expect(material.vertexColors).toBe(false);
    const batch = new InstanceBatch(THREE, new THREE.BoxGeometry(), material);
    batch.add([0, 0, 0], undefined, undefined, 0xff0000);
    const mesh = batch.build(scene)!;
    expect(material.vertexColors).toBe(true);
    expect(mesh.instanceColor).not.toBeNull();
    const color = new THREE.Color();
    mesh.getColorAt(0, color);
    expect(color.getHex()).toBe(0xff0000);
  });

  it('defaults uncolored instances to white when mixed with colored ones in the same batch', () => {
    const scene = new THREE.Scene();
    const batch = new InstanceBatch(THREE, new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    batch.add([0, 0, 0], undefined, undefined, 0x00ff00);
    batch.add([1, 0, 0]); // no color given
    const mesh = batch.build(scene)!;
    const color = new THREE.Color();
    mesh.getColorAt(1, color);
    expect(color.getHex()).toBe(0xffffff);
  });
});

describe('setInstanceColor', () => {
  it('updates one instance color after build and flags instanceColor for a GPU upload', () => {
    const scene = new THREE.Scene();
    const batch = new InstanceBatch(THREE, new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    batch.add([0, 0, 0], undefined, undefined, 0xffffff).add([1, 0, 0], undefined, undefined, 0xffffff);
    const mesh = batch.build(scene)!;
    // `needsUpdate` is a write-only setter on BufferAttribute (bumps `.version` internally) — read
    // `.version` back to confirm the GPU-upload flag was actually set, not the setter-only prop.
    const versionBefore = mesh.instanceColor!.version;
    setInstanceColor(mesh, 1, new THREE.Color(0x0000ff));
    const color = new THREE.Color();
    mesh.getColorAt(1, color);
    expect(color.getHex()).toBe(0x0000ff);
    expect(mesh.instanceColor!.version).toBeGreaterThan(versionBefore);
  });

  it('throws a clear error when the mesh was never built with any colored instance', () => {
    const scene = new THREE.Scene();
    const batch = new InstanceBatch(THREE, new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const mesh = batch.add([0, 0, 0]).build(scene)!;
    expect(() => setInstanceColor(mesh, 0, new THREE.Color(0xff0000))).toThrow(/instanceColor/);
  });

  it('throws on an out-of-range index rather than silently corrupting an adjacent instance', () => {
    const scene = new THREE.Scene();
    const mesh = new InstanceBatch(THREE, new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
      .add([0, 0, 0], undefined, undefined, 0xffffff)
      .build(scene)!;
    expect(() => setInstanceColor(mesh, 5, new THREE.Color(0xff0000))).toThrow(/out of range/);
    expect(() => setInstanceColor(mesh, -1, new THREE.Color(0xff0000))).toThrow(/out of range/);
  });

  it('scopes the GPU upload to exactly this instance\'s 3 floats — the actual fix for "1% of 10,000 changing must not re-upload all 10,000"', () => {
    const scene = new THREE.Scene();
    const batch = new InstanceBatch(THREE, new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    for (let i = 0; i < 10; i++) batch.add([i, 0, 0], undefined, undefined, 0xffffff);
    const mesh = batch.build(scene)!;
    mesh.instanceColor!.clearUpdateRanges();
    setInstanceColor(mesh, 4, new THREE.Color(0x00ff00));
    expect(mesh.instanceColor!.updateRanges).toEqual([{ start: 12, count: 3 }]); // instance 4 * itemSize 3
  });
});

describe('setInstanceTransform', () => {
  function buildBatch(n = 3) {
    const scene = new THREE.Scene();
    const batch = new InstanceBatch(THREE, new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    for (let i = 0; i < n; i++) batch.add([i, 0, 0]);
    return batch.build(scene)!;
  }

  it('moves one instance after build without touching the others', () => {
    const mesh = buildBatch(3);
    setInstanceTransform(THREE, mesh, 1, [10, 20, 30]);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    mesh.getMatrixAt(1, matrix);
    matrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
    expect(position.toArray()).toEqual([10, 20, 30]);

    mesh.getMatrixAt(0, matrix);
    matrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
    expect(position.toArray()).toEqual([0, 0, 0]); // instance 0 untouched
  });

  it('applies rotation and scale, defaulting scale to uniform 1', () => {
    const mesh = buildBatch(1);
    setInstanceTransform(THREE, mesh, 0, [0, 0, 0], [0, Math.PI / 2, 0], 3);
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(0, matrix);
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    matrix.decompose(new THREE.Vector3(), quaternion, scale);
    expect(scale.toArray()).toEqual([3, 3, 3]);
    const expectedQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
    expect(quaternion.y).toBeCloseTo(expectedQuat.y);
  });

  it('bumps instanceMatrix.version so a caller can confirm the GPU-upload flag was set', () => {
    const mesh = buildBatch(2);
    const versionBefore = mesh.instanceMatrix.version;
    setInstanceTransform(THREE, mesh, 0, [1, 1, 1]);
    expect(mesh.instanceMatrix.version).toBeGreaterThan(versionBefore);
  });

  it('throws on an out-of-range index', () => {
    const mesh = buildBatch(2);
    expect(() => setInstanceTransform(THREE, mesh, 2, [0, 0, 0])).toThrow(/out of range/);
    expect(() => setInstanceTransform(THREE, mesh, -1, [0, 0, 0])).toThrow(/out of range/);
  });

  it('scopes the GPU upload to exactly this instance\'s 16 floats, not the whole matrix buffer', () => {
    const mesh = buildBatch(10);
    mesh.instanceMatrix.clearUpdateRanges();
    setInstanceTransform(THREE, mesh, 4, [1, 2, 3]);
    expect(mesh.instanceMatrix.updateRanges).toEqual([{ start: 64, count: 16 }]); // instance 4 * itemSize 16
  });
});
