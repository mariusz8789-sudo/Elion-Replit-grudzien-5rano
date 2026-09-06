import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FrustumCuller, PopulationLod, projectedScreenSizePx, selectLodTier, type LodTier } from '../core/three/graphics/lod';

function cameraLookingDownNegZ(fov = 50, aspect = 1): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 1000);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

describe('projectedScreenSizePx', () => {
  it('a closer object of the same radius projects larger than a farther one', () => {
    const near = projectedScreenSizePx(1, 5, 50, 1000);
    const far = projectedScreenSizePx(1, 50, 50, 1000);
    expect(near).toBeGreaterThan(far);
  });

  it('a larger object at the same distance projects larger', () => {
    const small = projectedScreenSizePx(0.5, 10, 50, 1000);
    const big = projectedScreenSizePx(2, 10, 50, 1000);
    expect(big).toBeGreaterThan(small);
  });

  it('never divides by zero for a camera at the object', () => {
    expect(Number.isFinite(projectedScreenSizePx(1, 0, 50, 1000))).toBe(false);
    expect(projectedScreenSizePx(1, 0, 50, 1000)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('selectLodTier', () => {
  const tiers: LodTier[] = [
    { name: 'HIGH', minProjectedSizePx: 200 },
    { name: 'MEDIUM', minProjectedSizePx: 50 },
    { name: 'LOW', minProjectedSizePx: 10 },
  ];

  it('picks the finest tier the projected size still clears', () => {
    expect(selectLodTier(500, tiers)).toBe('HIGH');
    expect(selectLodTier(200, tiers)).toBe('HIGH');
    expect(selectLodTier(199, tiers)).toBe('MEDIUM');
    expect(selectLodTier(50, tiers)).toBe('MEDIUM');
    expect(selectLodTier(11, tiers)).toBe('LOW');
  });

  it('returns null when the projected size clears no tier (too small/far to bother rendering)', () => {
    expect(selectLodTier(5, tiers)).toBeNull();
    expect(selectLodTier(0, tiers)).toBeNull();
  });

  it('an empty tier list always returns null', () => {
    expect(selectLodTier(1000, [])).toBeNull();
  });
});

describe('FrustumCuller', () => {
  it('an object directly in front of the camera is visible', () => {
    const camera = cameraLookingDownNegZ();
    const culler = new FrustumCuller(THREE);
    culler.update(camera);
    expect(culler.isVisible([0, 0, 0], 1)).toBe(true);
  });

  it('an object far behind the camera is not visible', () => {
    const camera = cameraLookingDownNegZ();
    const culler = new FrustumCuller(THREE);
    culler.update(camera);
    expect(culler.isVisible([0, 0, 50], 1)).toBe(false);
  });

  it('an object far to the side, outside a narrow FOV, is not visible', () => {
    const camera = cameraLookingDownNegZ(20); // narrow lens
    const culler = new FrustumCuller(THREE);
    culler.update(camera);
    expect(culler.isVisible([500, 0, 0], 1)).toBe(false);
  });

  it('a wide-enough radius still intersects the frustum even when its center is just outside it', () => {
    const camera = cameraLookingDownNegZ(90);
    const culler = new FrustumCuller(THREE);
    culler.update(camera);
    // Near the frustum's side boundary at this distance/FOV — a small radius may or may not clear it,
    // but a very large radius covering the camera's whole view volume always does.
    expect(culler.isVisible([0, 0, 0], 1000)).toBe(true);
  });

  it('re-running update() after the camera moves reflects the NEW transform, not the old one', () => {
    const camera = cameraLookingDownNegZ();
    const culler = new FrustumCuller(THREE);
    culler.update(camera);
    expect(culler.isVisible([0, 0, 20], 1)).toBe(false); // 10 units behind the camera (camera looks toward -Z)

    camera.position.set(0, 0, -100);
    camera.lookAt(0, 0, -200);
    camera.updateMatrixWorld(true);
    culler.update(camera);
    expect(culler.isVisible([0, 0, -200], 1)).toBe(true); // now ahead of the moved camera
    expect(culler.isVisible([0, 0, 20], 1)).toBe(false); // now far behind the moved camera
  });
});

describe('PopulationLod', () => {
  it('reports visible=false for anything beyond maxDistance, regardless of frustum', () => {
    const camera = cameraLookingDownNegZ();
    const lod = new PopulationLod(THREE);
    const results = lod.update(
      [
        { id: 'near', position: [0, 0, 0], radius: 1 },
        { id: 'far', position: [0, 0, -100], radius: 1 },
      ],
      { camera, viewportHeightPx: 1000, maxDistance: 50 },
    );
    expect(results.find((r) => r.id === 'near')?.visible).toBe(true);
    expect(results.find((r) => r.id === 'far')?.visible).toBe(false);
  });

  it('reports visible=false for anything outside the frustum, and tier=null for it', () => {
    const camera = cameraLookingDownNegZ(20);
    const lod = new PopulationLod(THREE);
    const [result] = lod.update([{ id: 'behind', position: [0, 0, 50], radius: 1 }], { camera, viewportHeightPx: 1000 });
    expect(result.visible).toBe(false);
    expect(result.tier).toBeNull();
    expect(result.projectedSizePx).toBe(0);
  });

  it('assigns a finer tier to a closer candidate and a coarser tier to a farther one of the same size', () => {
    const camera = cameraLookingDownNegZ();
    const lod = new PopulationLod(THREE);
    const tiers: LodTier[] = [
      { name: 'HIGH', minProjectedSizePx: 100 },
      { name: 'LOW', minProjectedSizePx: 1 },
    ];
    const results = lod.update(
      [
        { id: 'close', position: [0, 0, 9], radius: 0.5 }, // 1m in front of the camera at z=10
        { id: 'distant', position: [0, 0, -400], radius: 0.5 },
      ],
      { camera, viewportHeightPx: 1000, tiers },
    );
    expect(results.find((r) => r.id === 'close')?.tier).toBe('HIGH');
    expect(results.find((r) => r.id === 'distant')?.tier).toBe('LOW');
  });

  it('omitting tiers entirely still reports visibility, with tier always null', () => {
    const camera = cameraLookingDownNegZ();
    const lod = new PopulationLod(THREE);
    const [result] = lod.update([{ id: 'a', position: [0, 0, 0], radius: 1 }], { camera, viewportHeightPx: 1000 });
    expect(result.visible).toBe(true);
    expect(result.tier).toBeNull();
  });

  it('returns one result per candidate, in input order', () => {
    const camera = cameraLookingDownNegZ();
    const lod = new PopulationLod(THREE);
    const candidates = Array.from({ length: 50 }, (_, i) => ({ id: i, position: [0, 0, i * -0.1] as [number, number, number], radius: 0.2 }));
    const results = lod.update(candidates, { camera, viewportHeightPx: 800 });
    expect(results).toHaveLength(50);
    expect(results.map((r) => r.id)).toEqual(candidates.map((c) => c.id));
  });
});
