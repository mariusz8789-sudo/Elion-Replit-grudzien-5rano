import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';

/** Same minimal canvas/document stub as graphicsMaterials.test.ts — `createLightShaft` needs
 * `document.createElement('canvas')` for its gradient-alpha texture. `createDustMotes` doesn't
 * touch canvas at all (pure `BufferGeometry`), so it works with or without this stub. */
beforeAll(() => {
  const fakeContext: Partial<CanvasRenderingContext2D> = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    fillRect: () => {}, strokeRect: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
    stroke: () => {}, fillText: () => {}, clearRect: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    createLinearGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' }) as ImageData,
    putImageData: () => {},
    createImageData: ((w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' })) as unknown as CanvasRenderingContext2D['createImageData'],
  };
  const fakeCanvas = { width: 0, height: 0, getContext: () => fakeContext as CanvasRenderingContext2D };
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => (tag === 'canvas' ? { ...fakeCanvas } : {}),
  };
});

import { createDustMotes, createLightShaft } from '../core/three/graphics/atmosphere';

describe('createDustMotes', () => {
  it('places exactly `count` motes within the requested bounds', () => {
    const handle = createDustMotes(THREE, { count: 50, bounds: [2, 1, 3], center: [5, 1, -2], seed: 7 });
    expect(handle.points.geometry.getAttribute('position').count).toBe(50);
    const pos = handle.points.geometry.getAttribute('position');
    for (let i = 0; i < 50; i++) {
      expect(pos.getX(i)).toBeGreaterThanOrEqual(5 - 2);
      expect(pos.getX(i)).toBeLessThanOrEqual(5 + 2);
      expect(pos.getY(i)).toBeGreaterThanOrEqual(1 - 1);
      expect(pos.getY(i)).toBeLessThanOrEqual(1 + 1);
      expect(pos.getZ(i)).toBeGreaterThanOrEqual(-2 - 3);
      expect(pos.getZ(i)).toBeLessThanOrEqual(-2 + 3);
    }
  });

  it('is deterministic for a given seed (no flicker on remount)', () => {
    const a = createDustMotes(THREE, { count: 20, bounds: [1, 1, 1], seed: 42 });
    const b = createDustMotes(THREE, { count: 20, bounds: [1, 1, 1], seed: 42 });
    const posA = a.points.geometry.getAttribute('position');
    const posB = b.points.geometry.getAttribute('position');
    for (let i = 0; i < 20; i++) {
      expect(posA.getX(i)).toBeCloseTo(posB.getX(i));
      expect(posA.getY(i)).toBeCloseTo(posB.getY(i));
      expect(posA.getZ(i)).toBeCloseTo(posB.getZ(i));
    }
  });

  it('drifts positions over time and wraps anything that exits bounds back inside', () => {
    const handle = createDustMotes(THREE, { count: 30, bounds: [0.5, 0.5, 0.5], driftSpeed: 5, seed: 3 });
    const pos = handle.points.geometry.getAttribute('position');
    const before = Array.from({ length: 30 }, (_, i) => [pos.getX(i), pos.getY(i), pos.getZ(i)]);
    // A large dt with a fast drift speed all but guarantees at least one mote crosses a bound and
    // wraps — this is the behavior under test, not an incidental side effect.
    handle.update(2);
    let anyMoved = false;
    for (let i = 0; i < 30; i++) {
      expect(pos.getX(i)).toBeGreaterThanOrEqual(-0.5);
      expect(pos.getX(i)).toBeLessThanOrEqual(0.5);
      expect(pos.getY(i)).toBeGreaterThanOrEqual(-0.5);
      expect(pos.getY(i)).toBeLessThanOrEqual(0.5);
      expect(pos.getZ(i)).toBeGreaterThanOrEqual(-0.5);
      expect(pos.getZ(i)).toBeLessThanOrEqual(0.5);
      if (before[i]![0] !== pos.getX(i) || before[i]![1] !== pos.getY(i) || before[i]![2] !== pos.getZ(i)) anyMoved = true;
    }
    expect(anyMoved).toBe(true);
  });

  it('dispose() frees geometry and material without throwing', () => {
    const handle = createDustMotes(THREE, { count: 10, bounds: [1, 1, 1] });
    expect(() => handle.dispose()).not.toThrow();
  });
});

describe('createLightShaft', () => {
  it('rejects a non-positive length', () => {
    expect(() => createLightShaft(THREE, { origin: [0, 0, 0], direction: [0, -1, 0], length: 0 })).toThrow();
    expect(() => createLightShaft(THREE, { origin: [0, 0, 0], direction: [0, -1, 0], length: -3 })).toThrow();
  });

  it('positions the group at `origin` and builds two crossed planes', () => {
    const group = createLightShaft(THREE, { origin: [1, 2, 3], direction: [0, -1, 0], length: 4 });
    expect(group.position.toArray()).toEqual([1, 2, 3]);
    const meshes = group.children.filter((c) => c instanceof THREE.Mesh);
    expect(meshes.length).toBe(2);
    // The two planes are rotated 90° apart around the beam axis — a real cross, not two
    // coincident quads.
    expect(Math.abs(meshes[1]!.rotation.y - meshes[0]!.rotation.y)).toBeCloseTo(Math.PI / 2);
  });

  it('aligns the beam so a point translated along its local -Y lands along `direction` from `origin`', () => {
    const origin = new THREE.Vector3(0, 5, 0);
    const direction = new THREE.Vector3(1, -1, 0).normalize();
    const group = createLightShaft(THREE, { origin: origin.toArray(), direction: direction.toArray(), length: 2 });
    const farEndLocal = new THREE.Vector3(0, -2, 0); // the plane's far (fully-faded) edge, pre-rotation
    const farEndWorld = farEndLocal.clone().applyQuaternion(group.quaternion).add(group.position);
    const expected = origin.clone().addScaledVector(direction, 2);
    expect(farEndWorld.x).toBeCloseTo(expected.x, 5);
    expect(farEndWorld.y).toBeCloseTo(expected.y, 5);
    expect(farEndWorld.z).toBeCloseTo(expected.z, 5);
  });
});
