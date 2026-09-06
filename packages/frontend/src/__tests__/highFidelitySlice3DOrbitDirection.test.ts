import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HighFidelityStreetSlice3D } from '../core/three/highFidelitySlice3D';

/**
 * Regression coverage for a render-loop allocation audit finding:
 * getOrbitCameraDirection() is called every frame by useThreeLoop.ts's
 * render loop whenever an orbit target with a focus distance is active,
 * and used to allocate a fresh THREE.Vector3 on every call. It now reuses
 * one scratch vector (the same fix already applied to epidemicCity3D.ts's
 * own getOrbitCameraDirection()).
 *
 * Deliberately bypasses the full `init()` (it loads real textures via
 * TextureLoader, which needs a DOM `document` this test environment
 * doesn't provide) and instead sets exactly the private fields
 * `getOrbitCameraDirection()` itself reads — isolating this one method's
 * logic without invoking scene construction.
 */
describe('HighFidelityStreetSlice3D.getOrbitCameraDirection — scratch-vector reuse', () => {
  function sliceWithScratch(): HighFidelityStreetSlice3D {
    const slice = new HighFidelityStreetSlice3D({}, {});
    Object.assign(slice as unknown as Record<string, unknown>, {
      THREE,
      scratchOrbitDirection: new THREE.Vector3(),
    });
    return slice;
  }

  it('returns the SAME Vector3 instance across repeated calls (no per-call allocation)', () => {
    const slice = sliceWithScratch();
    Object.assign(slice as unknown as Record<string, unknown>, { cameraMode: 'street', followTarget: new THREE.Vector3(1, 2, 3) });

    const first = slice.getOrbitCameraDirection();
    const second = slice.getOrbitCameraDirection();
    expect(first).not.toBeNull();
    expect(first).toBe(second); // same object reference — the scratch vector, not a fresh allocation
  });

  it('still returns the correct, normalized direction per camera mode', () => {
    const slice = sliceWithScratch();
    Object.assign(slice as unknown as Record<string, unknown>, { followTarget: new THREE.Vector3(0, 0, 0) });

    Object.assign(slice as unknown as Record<string, unknown>, { cameraMode: 'street' });
    const street = slice.getOrbitCameraDirection()!;
    expect(street.length()).toBeCloseTo(1, 5);
    expect(new THREE.Vector3(1.35, 0.012, 2.6).normalize().distanceTo(street)).toBeCloseTo(0, 5);

    Object.assign(slice as unknown as Record<string, unknown>, { cameraMode: 'event' });
    const event = slice.getOrbitCameraDirection()!;
    expect(new THREE.Vector3(3.2, 0.46, 3.8).normalize().distanceTo(event)).toBeCloseTo(0, 5);
  });

  it('returns null when there is no follow target', () => {
    const slice = sliceWithScratch();
    expect(slice.getOrbitCameraDirection()).toBeNull();
  });
});
