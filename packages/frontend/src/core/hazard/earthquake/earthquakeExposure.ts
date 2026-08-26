/**
 * EARTHQUAKE MODULE — synthetic exposure registry.
 *
 * A fixed, versioned list of fixture sites in the same opaque local
 * coordinate frame as `EarthquakePoint` (kilometers, not real-world
 * geodesy). This is NOT Genesis's epidemic CityWorld — it is a standalone
 * fixture built only for this vertical slice, so nothing here reads from
 * `core/simulation/epidemicCity.ts` or any epidemic location data (audit
 * doc: "Treating synthetic CityWorld locations as real facilities" is
 * explicitly prohibited for `ExposureSnapshot`).
 */
import type { ExposureSite, ExposureSnapshot } from '../contracts';

export const EXPOSURE_MAPPING_METHOD = 'earthquake-synthetic-fixture-registry-v1';

/**
 * Five fixture sites at varying distance/vulnerability from a nominal
 * origin — purely for exercising the pipeline. Every `ExposureSnapshot`
 * built by `buildSyntheticExposureSnapshot` shares this SAME array (and
 * these same site objects) by reference, across every scenario, for the
 * lifetime of the process — genuinely global, shared, mutable-by-default
 * state (TypeScript's `readonly` is compile-time only). Both the array and
 * each site are `Object.freeze`d for real so a caller mutating one
 * scenario's exposure data cannot corrupt every other scenario's.
 */
export const SYNTHETIC_EXPOSURE_SITES: readonly ExposureSite[] = Object.freeze([
  Object.freeze({ siteId: 'site-alpha', assetLabel: 'Fixture Site Alpha (near-field)', vulnerabilityClass: 'HIGH', x: 2, y: 1 }),
  Object.freeze({ siteId: 'site-bravo', assetLabel: 'Fixture Site Bravo (near-field)', vulnerabilityClass: 'MEDIUM', x: -3, y: 2 }),
  Object.freeze({ siteId: 'site-charlie', assetLabel: 'Fixture Site Charlie (mid-field)', vulnerabilityClass: 'MEDIUM', x: 15, y: -10 }),
  Object.freeze({ siteId: 'site-delta', assetLabel: 'Fixture Site Delta (mid-field)', vulnerabilityClass: 'LOW', x: -20, y: 8 }),
  Object.freeze({ siteId: 'site-echo', assetLabel: 'Fixture Site Echo (far-field)', vulnerabilityClass: 'LOW', x: 60, y: 40 }),
] as const);

export function buildSyntheticExposureSnapshot(exposureSnapshotId: string): ExposureSnapshot {
  return Object.freeze({
    exposureSnapshotId,
    mappingMethod: EXPOSURE_MAPPING_METHOD,
    sites: SYNTHETIC_EXPOSURE_SITES,
    datasetStatus: 'SCENARIO',
  });
}
