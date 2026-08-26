/**
 * EARTHQUAKE MODULE — synthetic, illustrative ground-motion attenuation.
 *
 * NOT A CALIBRATED GROUND-MOTION PREDICTION EQUATION (GMPE). Not fit to any
 * observed earthquake catalog. Not reviewed by a seismologist. This exists
 * to give the Phase 0 replay gate (and this vertical slice's Exposure/Impact
 * stages) a genuine deterministic physical computation to exercise —
 * magnitude and depth increase shaking, distance attenuates it — architected
 * exactly where a real, domain-reviewed GMPE would plug in later. Treating
 * this output as a real hazard assessment is precisely the "false
 * precision" risk docs/MULTI_HAZARD_ARCHITECTURE_AUDIT.md §6 warns against.
 * Every output this module produces is tagged `datasetStatus: 'SCENARIO'`
 * for exactly this reason — see docs/EARTHQUAKE_VERTICAL_SLICE.md.
 */
import { seededUnitInterval } from './rng';

export const EARTHQUAKE_MODEL_VERSION = 'earthquake-synthetic-attenuation-v1';

/** An opaque local planar coordinate in kilometers — not an assertion of real-world geodesy. */
export interface EarthquakePoint {
  readonly x: number;
  readonly y: number;
}

export function hypocentralDistanceKm(epicenter: EarthquakePoint, depthKm: number, point: EarthquakePoint): number {
  const dx = point.x - epicenter.x;
  const dy = point.y - epicenter.y;
  const epicentralDistanceKm = Math.sqrt(dx * dx + dy * dy);
  return Math.sqrt(epicentralDistanceKm ** 2 + depthKm ** 2);
}

/**
 * Synthetic peak ground acceleration in units of g, decaying with the log of
 * hypocentral distance and scaling with magnitude. Deterministic, pure,
 * unitless-illustrative — see module doc comment above.
 */
export function syntheticPeakGroundAcceleration(magnitude: number, distanceKm: number): number {
  const safeDistanceKm = Math.max(distanceKm, 1);
  const logPga = 0.5 * magnitude - 1.5 * Math.log10(safeDistanceKm) - 1.2;
  return Math.pow(10, logPga);
}

/** Deterministic, seed-derived uncertainty band width (percent) around a point estimate — never a bare unqualified number. */
export function syntheticUncertaintyBandPercent(seed: number): number {
  return 10 + 10 * seededUnitInterval(seed);
}

export function classifySeverity(pgaG: number): 'NONE' | 'MINOR' | 'MODERATE' | 'SEVERE' {
  if (pgaG < 0.02) return 'NONE';
  if (pgaG < 0.1) return 'MINOR';
  if (pgaG < 0.3) return 'MODERATE';
  return 'SEVERE';
}

/** Vulnerability multiplies the raw PGA into a site-adjusted severity score — still illustrative, still `SCENARIO`. */
export function vulnerabilityMultiplier(vulnerabilityClass: 'LOW' | 'MEDIUM' | 'HIGH'): number {
  switch (vulnerabilityClass) {
    case 'LOW': return 0.7;
    case 'MEDIUM': return 1.0;
    case 'HIGH': return 1.4;
  }
}
