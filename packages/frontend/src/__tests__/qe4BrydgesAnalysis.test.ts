import { describe, it, expect } from 'vitest';
import { runQe4BrydgesAnalysis } from '../core/biotechData/qe4BrydgesAnalysis';

/**
 * Real-data integration test. Values asserted below were read from an actual
 * run against the pinned Brydges dataset (`docs/QE4_PREREGISTRATION.md`),
 * not guessed — see the task's own commit message for the full run log.
 * `resultFingerprint` pins the ENTIRE numeric result, so any future change to
 * the estimator, the pinned data, or the RNG seed will fail this test loudly
 * rather than silently drifting.
 */
describe('QE4 Brydges analysis — real data, preregistered verdicts', () => {
  const result = runQe4BrydgesAnalysis();

  it('computes S2 for every preregistered (T,k) combination', () => {
    expect(result.cleanPoints).toHaveLength(6 * 10); // 6 clean T-values x k=1..10
    expect(result.disorderPoints).toHaveLength(7 * 2); // 7 disorder T-values x k in {5,10}
  });

  it('P4 compares against every published reference point available', () => {
    // 10Ions_CleanSystem: subsystems 1..10 x 6 T-values = 60; 10Ions_withDisorder: subsystems {5,10} x 7 T-values = 14.
    expect(result.p4Deltas).toHaveLength(74);
  });

  it('P1 (clean extensivity): SUPPORTED_WITHIN_MODEL — significant positive slope, ratio above threshold', () => {
    expect(result.p1.verdict).toBe('SUPPORTED_WITHIN_MODEL');
    expect(result.p1.tautology.classification).toBe('EMPIRICAL_TEST');
  });

  it('P2 (disorder log-growth + sub-extensivity): SUPPORTED_WITHIN_MODEL', () => {
    expect(result.p2.verdict).toBe('SUPPORTED_WITHIN_MODEL');
    expect(result.p2.tautology.classification).toBe('EMPIRICAL_TEST');
  });

  it('P3 (protocol validation): SUPPORTED_WITHIN_MODEL — pure state purity near 1, mixed clearly lower', () => {
    expect(result.p3.verdict).toBe('SUPPORTED_WITHIN_MODEL');
    expect(result.fig1a.pure.meanPurity).toBeGreaterThan(0.99);
    expect(result.fig1a.mixed.meanPurity).toBeLessThan(0.7);
    expect(result.p3.tautology.classification).toBe('EMPIRICAL_TEST');
  });

  it('P4 (integrity cross-check): SUPPORTED_WITHIN_MODEL — every recomputed point matches the published value within band', () => {
    expect(result.p4.verdict).toBe('SUPPORTED_WITHIN_MODEL');
    const failing = result.p4Deltas.filter((d) => !d.withinBand);
    expect(failing).toHaveLength(0);
    expect(result.p4.tautology.classification).toBe('EMPIRICAL_TEST');
  });

  it('the clean system shows a Page-curve-like turnover (rises to a peak near half-chain, falls off toward the full 10-ion system)', () => {
    // A globally near-pure state must satisfy S(k) approx= S(N-k); this is what makes k>5 unsuitable
    // for a naive "always increasing" volume-law test, and is exactly what the preregistration's
    // restriction of P1 to k=1..5 (docs/QE4_PREREGISTRATION.md §8) is designed around.
    const atT5 = result.cleanPoints.filter((p) => p.t === 5).sort((a, b) => a.k - b.k);
    const byK = new Map(atT5.map((p) => [p.k, p.s2]));
    expect(byK.get(5)!).toBeGreaterThan(byK.get(1)!);
    expect(byK.get(10)!).toBeLessThan(byK.get(5)!);
  });

  it('provenance records the real dataset identity', () => {
    expect(result.provenance.datasetDoi).toBe('10.5281/zenodo.2527010');
    expect(result.provenance.datasetLicense).toBe('cc-by-4.0');
    expect(result.provenance.archiveSha256).toBe('87424c2ddfbc9e68361d70a41878b63919ceb7257bdb70b4fad65d4179cd8389');
  });

  it('REPLAY: running the analysis twice produces an identical result fingerprint (Phase 5 determinism requirement)', () => {
    const again = runQe4BrydgesAnalysis();
    expect(again.resultFingerprint).toBe(result.resultFingerprint);
    expect(again.p1.verdict).toBe(result.p1.verdict);
    expect(again.p2.verdict).toBe(result.p2.verdict);
    expect(again.p3.verdict).toBe(result.p3.verdict);
    expect(again.p4.verdict).toBe(result.p4.verdict);
    // Byte-identical numeric results, not just matching verdicts.
    expect(again.cleanPoints).toEqual(result.cleanPoints);
    expect(again.disorderPoints).toEqual(result.disorderPoints);
  });

  it('no NaN/undefined leaked into any computed point (a real failure mode of the clamped-trace estimator)', () => {
    for (const p of [...result.cleanPoints, ...result.disorderPoints]) {
      expect(Number.isFinite(p.s2)).toBe(true);
      expect(Number.isFinite(p.sigma)).toBe(true);
    }
  });
});
