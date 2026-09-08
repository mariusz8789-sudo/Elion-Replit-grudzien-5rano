/**
 * Pure math extracted from `useThreeLoop.ts`'s orbit-follow render-loop block, so the
 * "camera eases toward a fixed viewing angle/distance around a target" behavior has direct
 * unit coverage instead of relying only on Sim3D-level tests or manual screenshot diffing.
 *
 * Kept dependency-free (plain {x,y,z} objects, no `three` import) so it can be unit-tested
 * without the canvas/WebGL/DOM stubbing every Sim3D test file needs.
 */

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Default viewing direction when a Sim3D doesn't opine via getOrbitCameraDirection(). */
export const DEFAULT_ORBIT_FOLLOW_DIRECTION: Vec3Like = { x: 1, y: 0.72, z: 1 };

/**
 * The camera position the orbit-follow block eases toward: `target + normalize(direction) * focusDistance`.
 * `presetDirection` need not be pre-normalized — callers (Sim3D.getOrbitCameraDirection()) may
 * hand back an arbitrary vector.
 */
export function orbitFollowDesiredPosition(
  target: Vec3Like,
  presetDirection: Vec3Like | undefined,
  focusDistance: number,
): Vec3Like {
  const raw = presetDirection ?? DEFAULT_ORBIT_FOLLOW_DIRECTION;
  const len = Math.hypot(raw.x, raw.y, raw.z) || 1;
  return {
    x: target.x + (raw.x / len) * focusDistance,
    y: target.y + (raw.y / len) * focusDistance,
    z: target.z + (raw.z / len) * focusDistance,
  };
}

/**
 * Standard linear interpolation. Extracted so the render loop's easing factor (0.09) and the
 * "this must actually move gradually, not snap" behavior are testable without a real THREE.Vector3.
 */
export function lerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}
