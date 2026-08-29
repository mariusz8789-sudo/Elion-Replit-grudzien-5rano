import { describe, expect, it } from 'vitest';
import {
  AME2020_OBSERVATIONS,
  AME2020_RAW_SHA256,
  compareAme2020Observations,
  compareNuclearObservation,
  replayAme2020ObservationFixture,
} from '../core/observation/nuclearAme2020';


describe('AME2020 nuclear SEMF observation admission', () => {
  it('compares the existing SEMF prediction with independent pinned observations', () => {
    const result = compareAme2020Observations();

    expect(result.modelId).toBe('nuclear-semf');
    expect(result.observable).toBe('bindingEnergyPerNucleon');
    expect(result.unit).toBe('MeV/nucleon');
    expect(result.comparisons).toHaveLength(3);
    expect(result.comparisons.every((comparison) => comparison.observation !== comparison.prediction)).toBe(true);
    expect(result.comparisons.map((comparison) => comparison.status)).toEqual(['DRIFT', 'DRIFT', 'MATCH']);
    expect(result.meanAbsoluteError).toBeGreaterThan(0);
    expect(result.rootMeanSquareError).toBeGreaterThanOrEqual(result.meanAbsoluteError);
  });

  it('keeps the source uncertainty and refuses to claim calibration from three points', () => {
    const result = compareAme2020Observations();

    expect(result.comparisons[0].observationUncertainty).toBe(0.0000048);
    expect(result.calibration.status).toBe('INSUFFICIENT_DATA');
    expect(result.calibration.reason).toContain('no calibrated accuracy percentage');
    expect(result.provenance.rawPayloadSha256).toBe(AME2020_RAW_SHA256);
    expect(result.provenance.replayInput).toContain('no network refetch');
  });

  it('is deterministic and changes fingerprint when the observation changes', () => {
    const first = compareAme2020Observations();
    const second = compareAme2020Observations();
    const changed = compareNuclearObservation({
      ...AME2020_OBSERVATIONS[0],
      bindingEnergyPerNucleonMeV: AME2020_OBSERVATIONS[0].bindingEnergyPerNucleonMeV + 0.1,
    });

    expect(first.fingerprint).toBe(second.fingerprint);
    expect(changed.provenanceFingerprint).not.toBe(first.comparisons[0].provenanceFingerprint);
  });

  it('marks estimated source values inconclusive rather than treating them as measurements', () => {
    const estimated = compareNuclearObservation({ ...AME2020_OBSERVATIONS[0], estimated: true });

    expect(estimated.status).toBe('INCONCLUSIVE');
    expect(estimated.reason).toContain('estimated');
  });

  it('replays the pinned fixture without network access and detects integrity drift', () => {
    const comparison = compareAme2020Observations();
    const match = replayAme2020ObservationFixture(AME2020_OBSERVATIONS, comparison.provenance);
    const drift = replayAme2020ObservationFixture(
      [{ ...AME2020_OBSERVATIONS[0], bindingEnergyPerNucleonMeV: AME2020_OBSERVATIONS[0].bindingEnergyPerNucleonMeV + 0.001 }, ...AME2020_OBSERVATIONS.slice(1)],
      comparison.provenance,
    );
    const blocked = replayAme2020ObservationFixture(AME2020_OBSERVATIONS, { ...comparison.provenance, replayInput: 'network source' });

    expect(match.status).toBe('MATCH');
    expect(match.reason).toContain('without network access');
    expect(drift.status).toBe('DRIFT');
    expect(blocked.status).toBe('BLOCKED');
  });
});
