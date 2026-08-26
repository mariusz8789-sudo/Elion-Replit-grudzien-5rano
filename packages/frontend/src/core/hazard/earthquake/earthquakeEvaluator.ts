/**
 * EARTHQUAKE MODULE — the run-stage evaluator.
 *
 * Implements Phase 0's `HazardReferenceEvaluator` (core/hazard/hazardReplay.ts)
 * for real: this is the earthquake scientific module's run computation,
 * reusing the SAME replay gate the Phase 0 foundation already built rather
 * than inventing a second one. `replayHazardRun({ evaluator: earthquakeEvaluator, ... })`
 * is what gives this vertical slice its MATCH/DRIFT/BLOCKED/NOT_REPRODUCIBLE
 * proof — see earthquakeVerticalSlice.test.ts.
 */
import { EARTHQUAKE_MODEL_VERSION, hypocentralDistanceKm, syntheticPeakGroundAcceleration, syntheticUncertaintyBandPercent, type EarthquakePoint } from './earthquakeModel';
import type { HazardReferenceEvaluator } from '../hazardReplay';
import type { EarthquakeRunOutputFields } from './earthquakeImpact';

interface EarthquakeScientificFields {
  readonly magnitude: number;
  readonly depthKm: number;
  readonly epicenter: EarthquakePoint;
}

export const earthquakeEvaluator: HazardReferenceEvaluator = {
  evaluate(input) {
    const scientificFields = input.scientificFields as unknown as EarthquakeScientificFields;
    const { magnitude, depthKm, epicenter } = scientificFields;
    const distanceAtEpicenterKm = hypocentralDistanceKm(epicenter, depthKm, epicenter);
    const peakGroundAccelerationAtEpicenterG = syntheticPeakGroundAcceleration(magnitude, distanceAtEpicenterKm);
    const seedNumber = typeof input.seed === 'number' ? input.seed : 0;
    const uncertaintyBandPercent = syntheticUncertaintyBandPercent(seedNumber);

    const outputFields: EarthquakeRunOutputFields = {
      magnitude,
      depthKm,
      epicenter,
      hazardModuleVersion: EARTHQUAKE_MODEL_VERSION,
      datasetStatus: 'SCENARIO',
      peakGroundAccelerationAtEpicenterG,
      uncertaintyBandPercent,
    };
    return outputFields as unknown as Readonly<Record<string, unknown>>;
  },
};
