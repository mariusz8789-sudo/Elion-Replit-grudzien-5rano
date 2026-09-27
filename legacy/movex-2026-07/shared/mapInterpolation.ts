// Pure, framework-agnostic geometry for gliding a live vehicle marker between GPS pings
// (kept out of the React component so it is deterministically unit-testable). Positions are
// [lng, lat] tuples to match Mapbox GL's ordering.
export type LngLat = [number, number];

/** Linear interpolation between two scalars. t is clamped to [0, 1]. */
export function lerp(a: number, b: number, t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return a + (b - a) * c;
}

/**
 * Linear interpolation between two [lng, lat] points. At t=0 returns start, at t=1 returns
 * end. Over the short hops between consecutive GPS pings the earth's curvature is negligible,
 * so straight-line lerp gives the smooth, Uber-style glide without great-circle math.
 */
export function interpolateLngLat(start: LngLat, end: LngLat, t: number): LngLat {
  return [lerp(start[0], end[0], t), lerp(start[1], end[1], t)];
}

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Great-circle distance in metres between two [lng, lat] points (haversine). */
export function haversineMeters(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Compass bearing in degrees (0=N, 90=E, 180=S, 270=W) from start to end - used to rotate a
 * directional vehicle icon so a truck visually points the way it is travelling. Returns a
 * value in [0, 360).
 */
export function bearingDegrees(start: LngLat, end: LngLat): number {
  const lat1 = toRad(start[1]);
  const lat2 = toRad(end[1]);
  const dLng = toRad(end[0] - start[0]);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export interface DurationOptions {
  /** Assumed ground speed used to derive how long the glide should take, in m/s. */
  metersPerSecond?: number;
  minMs?: number;
  maxMs?: number;
}

/**
 * How long a marker should take to travel a given distance so the motion reads as real
 * movement rather than a teleport - proportional to distance, clamped so tiny GPS jitter
 * still animates briefly and a large jump never crawls for too long.
 */
export function interpolationDurationMs(distanceMeters: number, opts: DurationOptions = {}): number {
  const speed = opts.metersPerSecond ?? 14; // ~50 km/h, a sensible default for road vehicles
  const minMs = opts.minMs ?? 500;
  const maxMs = opts.maxMs ?? 5000;
  const raw = (distanceMeters / speed) * 1000;
  return Math.min(maxMs, Math.max(minMs, raw));
}
