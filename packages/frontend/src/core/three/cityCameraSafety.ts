/**
 * CITY3D CAMERA FOCUS SAFETY — rendering guard, not a scientific parameter.
 *
 * When City3D focuses a tracked agent (`cameraPreset === 'agent'`, which is
 * what the "Ostatnia transmisja" action selects), the camera is pinned every
 * frame at a FIXED offset from that agent:
 *
 *   direction = Vector3(1, 0.72, 1).normalize()   ≈ (0.6301, 0.4537, 0.6301)
 *   distance  = 1.85                              (getOrbitFocusDistance())
 *   camera    = followTarget + direction * distance
 *
 * With `followTarget.y = 0.85` that puts the camera at y ≈ 1.6893 and only
 * ≈ 1.6486 horizontally from the agent. The tallest visual-context buildings
 * top out at 1.70 (body 1.50 + roof unit 0.20), so the camera skims roughly
 * 0.011 world units BELOW the tallest roofs while chasing a moving agent —
 * and measurably ends up inside a building volume on some frames.
 *
 * This module is pure geometry: given the focus target, the intended
 * direction/distance, and the real building volumes recorded at construction
 * time, it either confirms the intended direction is already safe (and
 * changes nothing) or raises the camera's elevation just enough to clear the
 * blocking volume — preserving the horizontal bearing and the total focus
 * distance, so the tracked agent stays framed.
 *
 * It owns no simulation state, no agent data and no scientific value. Every
 * constant here is a rendering clearance in City3D world units.
 */

/** An axis-aligned building volume, in City3D world units, recorded where the building is built. */
export interface CameraOccluder {
  readonly centerX: number;
  readonly centerZ: number;
  readonly halfWidth: number;
  readonly halfDepth: number;
  /** Highest point of the volume, including roof and roof units. */
  readonly top: number;
}

/**
 * Vertical clearance the camera must keep above a blocking roof. Sized well
 * above the ≈0.011 shortfall actually measured on the live base, so the guard
 * also covers roof detail that sits slightly proud of the recorded top.
 */
export const CAMERA_ROOF_CLEARANCE = 0.14;

/** Horizontal slack so a camera grazing a facade edge is still treated as blocked. */
export const CAMERA_FACADE_MARGIN = 0.05;

/**
 * The camera must keep at least this fraction of its focus distance as
 * horizontal radius, so a lifted camera never degenerates into a top-down
 * view that loses the agent's surroundings.
 */
export const MIN_HORIZONTAL_RADIUS_FRACTION = 0.18;

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * The unguarded focus direction the renderer falls back to when no preset
 * supplies one — `Vector3(1, 0.72, 1).normalize()`, declared once here so the
 * guard reasons about exactly the direction the renderer actually uses.
 */
export const DEFAULT_FOCUS_DIRECTION: Vec3 = (() => {
  const length = Math.hypot(1, 0.72, 1);
  return { x: 1 / length, y: 0.72 / length, z: 1 / length };
})();

/**
 * True when the point lies within the occluder's volume, including the
 * configured margins. A camera sitting exactly `CAMERA_ROOF_CLEARANCE` above
 * the roof counts as CLEAR — that is precisely the clearance the guard aims
 * for, so the comparison must not treat reaching it as still blocked.
 */
export function isPointInsideOccluder(point: Vec3, occluder: CameraOccluder): boolean {
  if (point.y >= occluder.top + CAMERA_ROOF_CLEARANCE) return false;
  if (point.y < 0) return false;
  return Math.abs(point.x - occluder.centerX) <= occluder.halfWidth + CAMERA_FACADE_MARGIN
    && Math.abs(point.z - occluder.centerZ) <= occluder.halfDepth + CAMERA_FACADE_MARGIN;
}

/** Camera position the renderer would use for an unguarded focus. */
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

/**
 * Returns a direction that keeps the camera out of building volumes, or
 * `null` when the intended direction is already safe.
 *
 * Returning `null` for the safe case is deliberate: an already-clear focus
 * must be left EXACTLY as the renderer computed it, so this guard can never
 * shift a shot that was never blocked.
 *
 * When blocked, only the elevation changes. The horizontal bearing and the
 * total focus distance are preserved, so the camera rises over the blocking
 * roof along the same approach line rather than jumping to a new viewpoint.
 */
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

  // Height the camera needs above the focus target to clear the blocking roof.
  // The small epsilon absorbs the rounding of the normalize() round-trip, so a
  // camera aimed exactly at the clearance line lands on or above it, never a
  // few ULPs under it.
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
