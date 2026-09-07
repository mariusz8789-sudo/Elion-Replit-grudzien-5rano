import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createStreetBench, createTrashBin, createHydrant, createPlanter, createBollardBarrier, createUtilityBox,
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
