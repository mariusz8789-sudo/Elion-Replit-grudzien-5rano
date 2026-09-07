import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createStreetBench, createTrashBin, createHydrant, createPlanter, createBollardBarrier, createUtilityBox, createStreetLight, createSidewalk, createRoadMarkings,
} from '../core/three/graphics/streetKit';

function material() {
  return new THREE.MeshStandardMaterial();
}

describe('createStreetBench', () => {
  it('builds legs, seat, and backrest', () => {
    const bench = createStreetBench(THREE, { position: [1, 0, 2], seatMaterial: material() });
    expect(bench.name).toBe('genesis-street-bench');
    expect(bench.position.x).toBe(1);
    expect(bench.position.z).toBe(2);
    expect(bench.children.length).toBeGreaterThanOrEqual(6); // 4 legs + seat + back
  });
});

describe('createTrashBin', () => {
  it('builds a body and a lid', () => {
    const bin = createTrashBin(THREE, { position: [0, 0, 0], material: material() });
    expect(bin.children).toHaveLength(2);
  });
});

describe('createHydrant', () => {
  it('builds a body, a cap, and two nozzles', () => {
    const hydrant = createHydrant(THREE, { position: [0, 0, 0], material: material() });
    expect(hydrant.children).toHaveLength(4);
  });
});

describe('createPlanter', () => {
  it('builds just the box when no foliage material is given', () => {
    const planter = createPlanter(THREE, { position: [0, 0, 0], material: material() });
    expect(planter.children).toHaveLength(1);
  });

  it('adds a foliage clump when a foliage material is given', () => {
    const planter = createPlanter(THREE, { position: [0, 0, 0], material: material(), foliageMaterial: material() });
    expect(planter.children).toHaveLength(2);
  });
});

describe('createBollardBarrier', () => {
  it('clamps a request for a single post up to 2 (a barrier needs at least 2 posts)', () => {
    const barrier = createBollardBarrier(THREE, { from: [0, 0, 0], to: [1, 0, 0], postCount: 1, material: material() });
    expect(barrier.children.length).toBe(2); // clamps up to 2
  });

  it('places posts evenly along the run including both endpoints', () => {
    const barrier = createBollardBarrier(THREE, { from: [0, 0, 0], to: [2, 0, 0], postCount: 3, material: material() });
    expect(barrier.children).toHaveLength(3);
    const xs = barrier.children.map((c) => c.position.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(0, 5);
    expect(xs[1]).toBeCloseTo(1, 5);
    expect(xs[2]).toBeCloseTo(2, 5);
  });
});

describe('createUtilityBox', () => {
  it('builds a body and a panel', () => {
    const box = createUtilityBox(THREE, { position: [0, 0, 0], material: material() });
    expect(box.children).toHaveLength(2);
  });
});

describe('createStreetLight', () => {
  const mat = () => new THREE.MeshStandardMaterial();

  it('scales its whole silhouette from the requested height, so it works at both world scales this kit serves', () => {
    const small = createStreetLight(THREE, { position: [0, 0, 0], height: 0.3, poleMaterial: mat(), lampMaterial: mat() });
    const large = createStreetLight(THREE, { position: [0, 0, 0], height: 9, poleMaterial: mat(), lampMaterial: mat() });
    const lampOf = (g: THREE.Group) => g.children[g.children.length - 1];
    // The lamp head must sit near the top of the pole in BOTH cases, not at a fixed absolute height.
    expect(lampOf(small).position.y).toBeGreaterThan(0.3 * 0.9);
    expect(lampOf(large).position.y).toBeGreaterThan(9 * 0.9);
  });

  it('puts the lamp head out at the end of the arm, not on the pole itself', () => {
    const light = createStreetLight(THREE, { position: [0, 0, 0], height: 8, armLength: 2, poleMaterial: mat(), lampMaterial: mat() });
    const lamp = light.children[light.children.length - 1];
    expect(lamp.position.x).toBeCloseTo(2, 6);
  });

  it('stands at the position it was given', () => {
    const light = createStreetLight(THREE, { position: [3, 0, -4], height: 8, poleMaterial: mat(), lampMaterial: mat() });
    expect(light.position.toArray()).toEqual([3, 0, -4]);
  });

  it('adds no real light source — it is emissive geometry only (documented, and a real perf constraint)', () => {
    const light = createStreetLight(THREE, { position: [0, 0, 0], height: 8, poleMaterial: mat(), lampMaterial: mat() });
    let lights = 0;
    light.traverse((n) => { if ((n as THREE.Light).isLight) lights++; });
    expect(lights).toBe(0);
  });
});

describe('createSidewalk', () => {
  const mat = () => new THREE.MeshStandardMaterial();

  it('builds a slab plus a kerb face — 2 meshes per run regardless of length', () => {
    const short = createSidewalk(THREE, { from: [0, 0, 0], to: [0, 0, 10], width: 4, surfaceMaterial: mat() });
    const long = createSidewalk(THREE, { from: [0, 0, 0], to: [0, 0, 400], width: 4, surfaceMaterial: mat() });
    expect(short.children).toHaveLength(2);
    expect(long.children).toHaveLength(2);
  });

  it('sits between its endpoints and runs along them', () => {
    const walk = createSidewalk(THREE, { from: [0, 0, -20], to: [0, 0, 20], width: 4, surfaceMaterial: mat() });
    expect(walk.position.z).toBeCloseTo(0, 6);
    const slab = walk.children[0] as THREE.Mesh;
    expect((slab.geometry as THREE.BoxGeometry).parameters.depth).toBeCloseTo(40, 6);
  });

  it('is raised above the carriageway, so the kerb is a real height difference and not a painted line', () => {
    const walk = createSidewalk(THREE, { from: [0, 0, 0], to: [0, 0, 10], width: 4, kerbHeight: 0.2, surfaceMaterial: mat() });
    const slab = walk.children[0];
    expect(slab.position.y).toBeGreaterThan(0);
    expect((( walk.children[0] as THREE.Mesh).geometry as THREE.BoxGeometry).parameters.height).toBeCloseTo(0.2, 6);
  });
});

describe('createRoadMarkings', () => {
  const mat = () => new THREE.MeshBasicMaterial();

  it('batches every dash into ONE InstancedMesh, however long the run', () => {
    const run = createRoadMarkings(THREE, { from: [0, 0, -150], to: [0, 0, 150], dashLength: 3, gapLength: 4.5, width: 0.3, material: mat() });
    const instanced = run.children.filter((c) => (c as THREE.InstancedMesh).isInstancedMesh);
    expect(instanced).toHaveLength(1);
    expect((instanced[0] as THREE.InstancedMesh).count).toBeGreaterThan(30);
  });

  it('REGRESSION: a run along X is oriented correctly, not skewed by Euler composition', () => {
    // Composing the heading into each instance's Euler angles put dashes at wrong angles on any run
    // that was not axis-aligned with Z. The heading now lives on the group, like createSidewalk.
    const alongX = createRoadMarkings(THREE, { from: [-50, 0, 0], to: [50, 0, 0], dashLength: 3, gapLength: 4.5, width: 0.3, material: mat() });
    expect(alongX.rotation.y).toBeCloseTo(Math.PI / 2, 6);

    // Every dash must lie ON the run: for an X-aligned run, all world positions have z ~ 0.
    const mesh = alongX.children[0] as THREE.InstancedMesh;
    alongX.updateMatrixWorld(true);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      p.setFromMatrixPosition(m).applyMatrix4(alongX.matrixWorld);
      expect(Math.abs(p.z)).toBeLessThan(0.001);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(50);
    }
  });

  it('emits nothing rather than a degenerate dash when the run is shorter than one stride', () => {
    const tiny = createRoadMarkings(THREE, { from: [0, 0, 0], to: [0, 0, 1], dashLength: 3, gapLength: 4.5, width: 0.3, material: mat() });
    expect(tiny.children).toHaveLength(0);
  });
});
