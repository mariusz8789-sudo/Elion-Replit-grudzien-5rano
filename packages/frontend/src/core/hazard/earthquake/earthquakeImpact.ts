/**
 * EARTHQUAKE MODULE — Impact stage.
 *
 * Projects one `HazardRun`'s ground-motion output onto one `ExposureSnapshot`,
 * producing one `ImpactResult` per site. This is the science → visualization
 * boundary described in docs/MULTI_HAZARD_ARCHITECTURE_AUDIT.md §3.2:
 * everything here is a pure function of the run's already-computed output
 * and the exposure sites' already-fixed coordinates — nothing here reads
 * back from a projection or from City3D.
 */
import { EARTHQUAKE_MODEL_VERSION, classifySeverity, hypocentralDistanceKm, syntheticPeakGroundAcceleration, vulnerabilityMultiplier, type EarthquakePoint } from './earthquakeModel';
import type { ExposureSnapshot, HazardRun, ImpactResult } from '../contracts';

export interface EarthquakeRunOutputFields {
  readonly magnitude: number;
  readonly depthKm: number;
  readonly epicenter: EarthquakePoint;
  readonly hazardModuleVersion: string;
  readonly datasetStatus: 'SCENARIO';
  readonly peakGroundAccelerationAtEpicenterG: number;
  readonly uncertaintyBandPercent: number;
}

export function readEarthquakeOutputFields(run: HazardRun): EarthquakeRunOutputFields {
  return run.outputFields as unknown as EarthquakeRunOutputFields;
}

function impactResultId(hazardRunId: string, siteId: string): string {
  return `impact_${hazardRunId}_${siteId}`;
}

/** One ImpactResult per exposure site, deterministic given the run's frozen output. */
export function computeImpactResults(run: HazardRun, exposure: ExposureSnapshot): readonly ImpactResult[] {
  const output = readEarthquakeOutputFields(run);
  const uncertaintyFraction = output.uncertaintyBandPercent / 100;

  return Object.freeze(exposure.sites.map((site) => {
    const distanceKm = hypocentralDistanceKm(output.epicenter, output.depthKm, { x: site.x, y: site.y });
    const rawPgaG = syntheticPeakGroundAcceleration(output.magnitude, distanceKm);
    const siteAdjustedPgaG = rawPgaG * vulnerabilityMultiplier(site.vulnerabilityClass);

    return Object.freeze({
      impactResultId: impactResultId(run.hazardRunId, site.siteId),
      hazardRunId: run.hazardRunId,
      exposureSnapshotId: exposure.exposureSnapshotId,
      siteId: site.siteId,
      resultType: 'GROUND_SHAKING_IMPACT',
      severity: classifySeverity(siteAdjustedPgaG),
      severityValue: siteAdjustedPgaG,
      uncertainty: Object.freeze({
        low: siteAdjustedPgaG * (1 - uncertaintyFraction),
        high: siteAdjustedPgaG * (1 + uncertaintyFraction),
      }),
      datasetStatus: 'SCENARIO',
      provenance: Object.freeze({ hazardRunId: run.hazardRunId, hazardModuleVersion: EARTHQUAKE_MODEL_VERSION }),
    });
  }));
}
