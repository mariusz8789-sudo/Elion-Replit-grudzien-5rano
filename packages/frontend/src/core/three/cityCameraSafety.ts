/**
 * CITY3D CAMERA FOCUS SAFETY — rendering guard, not a scientific parameter.
 *
 * Pure geometry for the existing City3D renderer. It keeps a tracked-agent
 * camera outside visual building volumes without touching simulation state.
 */

export interface CameraOccluder {
  readonly centerX: number;
  readonly centerZ: number;
  readonly halfWidth: number;
  readonly halfDepth: number;
  readonly top: number;
}

export const CAMERA_ROOF_CLEARANCE = 0.14;
export const CAMERA_FACADE_MARGIN = 0.05;
export const MIN_HORIZONTAL_RADIUS_FRACTION = 0.18;

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const DEFAULT_FOCUS_DIRECTION: Vec3 = (() => {
  const length = Math.hypot(1, 0.72, 1);
  return { x: 1 / length, y: 0.72 / length, z: 1 / length };
})();

export function isPointInsideOccluder(point: Vec3, occluder: CameraOccluder): boolean {
  if (point.y >= occluder.top + CAMERA_ROOF_CLEARANCE) return false;
  if (point.y < 0) return false;
  return Math.abs(point.x - occluder.centerX) <= occluder.halfWidth + CAMERA_FACADE_MARGIN
    && Math.abs(point.z - occluder.centerZ) <= occluder.halfDepth + CAMERA_FACADE_MARGIN;
}

export function focusCameraPosition(target: Vec3, direction: Vec3, distance: number): Vec3 {
  return {
    x: target.x + direction.x * distance,
    y: target.y + direction.y * distance,
    z: target.z + direction.z * distance,
  };
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z);
  if (length <= 1e-9) return v;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

/** Returns a safe direction, or null when the intended focus is already clear. */
export function resolveSafeFocusDirection(
  target: Vec3,
  direction: Vec3,
  distance: number,
  occluders: readonly CameraOccluder[],
): Vec3 | null {
  if (!(distance > 0) || occluders.length === 0) return null;

  const unit = normalize(direction);
  const candidate = focusCameraPosition(target, unit, distance);
  let requiredTop = -Infinity;
  for (const occluder of occluders) {
    if (isPointInsideOccluder(candidate, occluder)) {
      requiredTop = Math.max(requiredTop, occluder.top);
    }
  }
  if (requiredTop === -Infinity) return null;

  const requiredRise = requiredTop + CAMERA_ROOF_CLEARANCE - target.y + 1e-6;
  if (requiredRise <= unit.y * distance) return null;

  const maxRise = distance * Math.sqrt(1 - MIN_HORIZONTAL_RADIUS_FRACTION ** 2);
  const rise = Math.min(requiredRise, maxRise);
  const horizontalRadius = Math.sqrt(Math.max(0, distance * distance - rise * rise));
  const horizontalLength = Math.hypot(unit.x, unit.z);
  if (horizontalLength <= 1e-9) return null;
  const scale = horizontalRadius / horizontalLength;

  return normalize({ x: unit.x * scale, y: rise, z: unit.z * scale });
}
