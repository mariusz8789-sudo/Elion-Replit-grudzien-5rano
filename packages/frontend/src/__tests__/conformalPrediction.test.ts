import { describe, expect, test } from 'vitest';
import {
  CONFORMAL_SPLIT_SEED,
  calibrateConformalPredictor,
  buildConformalInterval,
  classifyConformalObservationGap,
  conformalQuantile,
  deterministicCalibrationSplit,
  discriminabilityFromConformalIntervals,
  evaluateCoverage,
  splitPoints,
  type ConformalInterval,
} from '../core/agent/conformalPrediction';
import { fitModelSpec, type ModelFit, type ModelPoint, type ModelSpec } from '../core/agent/modelSpace';
import { classifyObservationGap } from '../core/agent/observationGap';
import { computeReplayVerdict } from '../core/matrixFoundation/replayVerdict';

function linearSpec(): ModelSpec {
  return { id: 'conformal-test-linear', terms: [{ basis: 'CONSTANT' }, { basis: 'LINEAR', variable: 'x' }], lineage: null };
}

function fitLinear(points: readonly ModelPoint[]): Extract<ModelFit, { ok: true }> {
  const fit = fitModelSpec(linearSpec(), points);
  if (!fit.ok) throw new Error(`test setup: fit failed: ${fit.reason}`);
  return fit;
}

/** Deterministic pseudo-noise (no Math.random) so datasets are reproducible and inspectable. */
function noise(i: number): number {
  return Math.sin(i * 12.9898) * 0.5;
}

function makeLinearDataset(n: number, slope: number, intercept: number, amplitude: number): ModelPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const x = i + 1;
    return { x, y: slope * x + intercept + amplitude * noise(i), sigma: 1 };
  });
}

const interval = (prediction: number, lo: number, hi: number): ConformalInterval => ({
  prediction,
  lo,
  hi,
  quantile: (hi - lo) / 2,
  confidenceLevel: 0.9,
  calibrationFingerprint: 'test-fixture',
  fingerprint: `fixture:${lo}:${hi}`,
});

describe('conformalPrediction — split conformal core', () => {
  // 1. simple linear dataset
  test('1. simple linear dataset: calibrated interval covers the true relationship at a fresh point', () => {
    const trainPoints = makeLinearDataset(30, 2, 3, 0.3);
    const fit = fitLinear(trainPoints);
    const calPoints = makeLinearDataset(20, 2, 3, 0.3).map((p) => ({ ...p, x: p.x + 100 }));
    const calibration = calibrateConformalPredictor({
      fit, calibrationPoints: calPoints, confidenceLevel: 0.9, splitFingerprint: 'fixture', provenance: 'SIMULATED',
    });
    const iv = buildConformalInterval({ x: 5, fit, calibration });
    expect(iv.lo).toBeLessThanOrEqual(iv.prediction);
    expect(iv.hi).toBeGreaterThanOrEqual(iv.prediction);
    expect(Math.abs(iv.prediction - (2 * 5 + 3))).toBeLessThan(0.5);
  });

  // 2. known deterministic case
  test('2. known deterministic case: quantile matches the hand-computed order statistic', () => {
    // n=4, level=0.8 -> k = ceil(5*0.8) = 4 -> index 3 (0-indexed) -> the MAX residual.
    const residuals = [1, 4, 2, 3];
    const result = conformalQuantile(residuals, 0.8);
    expect(result.quantile).toBe(4);
    expect(result.guaranteeAchievable).toBe(true);

    // n=4, level=0.5 -> k = ceil(5*0.5) = 3 -> index 2 (0-indexed) of the SORTED array [1,2,3,4] -> 3.
    const result2 = conformalQuantile(residuals, 0.5);
    expect(result2.quantile).toBe(3);
  });

  // 3. coverage case
  test('3. coverage case: empirical coverage on a real holdout is reported alongside sample size and method', () => {
    const points = makeLinearDataset(200, 1.5, -2, 1.2);
    const split = deterministicCalibrationSplit(points.length, { calibrationFraction: 0.5 });
    const { calibrationPoints, holdoutPoints } = splitPoints(points, split);
    const fit = fitLinear(calibrationPoints);
    const calibration = calibrateConformalPredictor({
      fit, calibrationPoints, confidenceLevel: 0.9, splitFingerprint: split.fingerprint, provenance: 'SIMULATED',
    });
    const coverage = evaluateCoverage({ fit, calibration, holdoutPoints });
    expect(coverage.nominalCoverage).toBe(0.9);
    expect(coverage.sampleSize).toBe(holdoutPoints.length);
    expect(coverage.method).toBe('SPLIT_CONFORMAL');
    expect(coverage.observedCoverage).toBeGreaterThan(0.5);
    expect(coverage.averageIntervalWidth).toBeGreaterThan(0);
  });

  // 4. small-sample case
  test('4. small-sample case: too few calibration points flags guaranteeAchievable=false, does not throw', () => {
    const points = makeLinearDataset(3, 1, 0, 0.1);
    const fit = fitLinear(points);
    const calibration = calibrateConformalPredictor({
      fit, calibrationPoints: points, confidenceLevel: 0.9, splitFingerprint: 'fixture', provenance: 'SIMULATED',
    });
    expect(calibration.guaranteeAchievable).toBe(false);
    expect(calibration.warnings.some((w) => w.includes('coverage guarantee'))).toBe(true);
  });

  // 5. duplicate rows
  test('5. duplicate rows: identical repeated calibration points do not crash and stay deterministic', () => {
    const base = makeLinearDataset(10, 1, 1, 0.2);
    const withDuplicates = [...base, ...base.slice(0, 5)];
    const fit = fitLinear(base);
    const a = calibrateConformalPredictor({
      fit, calibrationPoints: withDuplicates, confidenceLevel: 0.9, splitFingerprint: 'fixture', provenance: 'SIMULATED',
    });
    const b = calibrateConformalPredictor({
      fit, calibrationPoints: withDuplicates, confidenceLevel: 0.9, splitFingerprint: 'fixture', provenance: 'SIMULATED',
    });
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.sampleSize).toBe(withDuplicates.length);
  });

  // 6. deterministic replay
  test('6. deterministic replay: two independent runs of the same calibration MATCH via computeReplayVerdict', () => {
    const points = makeLinearDataset(25, 3, 1, 0.4);
    const fit = fitLinear(points);
    const run = () => calibrateConformalPredictor({
      fit, calibrationPoints: points, confidenceLevel: 0.9, splitFingerprint: 'fixture', provenance: 'SIMULATED',
    });
    const first = run();
    const second = run();
    const verdict = computeReplayVerdict({
      inputsAvailable: true,
      recordFound: true,
      recordedFingerprint: first.fingerprint,
      recomputedFingerprint: second.fingerprint,
    });
    expect(verdict).toBe('MATCH');
  });

  // 7. same input -> same fingerprint
  test('7. same input -> same split fingerprint (no hidden randomness across calls)', () => {
    const splitA = deterministicCalibrationSplit(50, { seed: CONFORMAL_SPLIT_SEED, calibrationFraction: 0.6 });
    const splitB = deterministicCalibrationSplit(50, { seed: CONFORMAL_SPLIT_SEED, calibrationFraction: 0.6 });
    expect(splitA.fingerprint).toBe(splitB.fingerprint);
    expect(splitA.calibrationIndices).toEqual(splitB.calibrationIndices);
    expect(splitA.holdoutIndices).toEqual(splitB.holdoutIndices);
  });

  // 8. different calibration data -> different result
  test('8. different calibration data (or seed) -> different fingerprint', () => {
    const points = makeLinearDataset(20, 1, 0, 0.2);
    const fit = fitLinear(points);
    const a = calibrateConformalPredictor({
      fit, calibrationPoints: points, confidenceLevel: 0.9, splitFingerprint: 'fixture', provenance: 'SIMULATED',
    });
    const mutated = points.map((p, i) => (i === 0 ? { ...p, y: p.y + 5 } : p));
    const b = calibrateConformalPredictor({
      fit, calibrationPoints: mutated, confidenceLevel: 0.9, splitFingerprint: 'fixture', provenance: 'SIMULATED',
    });
    expect(a.fingerprint).not.toBe(b.fingerprint);

    const splitA = deterministicCalibrationSplit(20, { seed: 1 });
    const splitB = deterministicCalibrationSplit(20, { seed: 2 });
    expect(splitA.fingerprint).not.toBe(splitB.fingerprint);
  });
});

describe('conformalPrediction — M1 (ObservationGapRequest) integration', () => {
  // 9. two models with overlapping intervals -> indistinguishable
  test('9. two heavily overlapping intervals (spec example [9.8,10.2] vs [9.9,10.1]) are flagged as a gap', () => {
    const a = interval(10.0, 9.8, 10.2);
    const b = interval(10.0, 9.9, 10.1);
    const discriminability = discriminabilityFromConformalIntervals(a, b);
    expect(discriminability).toBeLessThan(1);
    const trigger = classifyConformalObservationGap({ unobservedCount: 3, intervals: [a, b] });
    expect(trigger).not.toBeNull();
  });

  // 10. two clearly separated intervals -> discriminable
  test('10. two clearly separated intervals (spec example [7,8] vs [11,12]) are discriminable', () => {
    const a = interval(7.5, 7.0, 8.0);
    const b = interval(11.5, 11.0, 12.0);
    const discriminability = discriminabilityFromConformalIntervals(a, b);
    expect(discriminability).toBeGreaterThan(1);
    const trigger = classifyConformalObservationGap({ unobservedCount: 3, intervals: [a, b] });
    expect(trigger).toBeNull();
  });

  // 11. integration with M1: composition, not a new engine
  test('11. classifyConformalObservationGap is EXACTLY classifyObservationGap fed a conformal-derived number', () => {
    const a = interval(10.0, 9.0, 11.0);
    const b = interval(12.0, 11.5, 12.5);
    const bestDiscriminability = discriminabilityFromConformalIntervals(a, b);
    const direct = classifyObservationGap({ unobservedCount: 2, bestDiscriminability });
    const viaConformal = classifyConformalObservationGap({ unobservedCount: 2, intervals: [a, b] });
    expect(viaConformal).toBe(direct);
  });

  test('11b. no intervals (nothing left to compare) reads as NO_ATTACHED_EXPERIMENT, same as M1 with no discriminability', () => {
    const direct = classifyObservationGap({ unobservedCount: 0, bestDiscriminability: null });
    const viaConformal = classifyConformalObservationGap({ unobservedCount: 0, intervals: null });
    expect(viaConformal).toBe(direct);
    expect(viaConformal).toBe('NO_ATTACHED_EXPERIMENT');
  });
});

describe('conformalPrediction — adversarial / structural rejection', () => {
  // 12. malformed input
  test('12. malformed input: splitPoints rejects a points array whose length does not match the split', () => {
    const split = deterministicCalibrationSplit(10);
    const wrongPoints = makeLinearDataset(9, 1, 0, 0);
    expect(() => splitPoints(wrongPoints, split)).toThrow(/received 9/);
  });

  test('12b. malformed input: a model producing a non-finite prediction is refused, not silently NaN-propagated', () => {
    const brokenFit: Extract<ModelFit, { ok: true }> = { ok: true, coefficients: [], rss: 0, predict: () => Number.NaN, standardErrors: null };
    const points = makeLinearDataset(5, 1, 0, 0);
    expect(() => calibrateConformalPredictor({
      fit: brokenFit, calibrationPoints: points, confidenceLevel: 0.9, splitFingerprint: 'fixture', provenance: 'SIMULATED',
    })).toThrow(/non-finite/);
  });

  // 13. insufficient calibration data (structural, distinct from "small-sample" warning case)
  test('13. insufficient calibration data: an empty calibration set throws rather than warns', () => {
    const fit = fitLinear(makeLinearDataset(5, 1, 0, 0));
    expect(() => calibrateConformalPredictor({
      fit, calibrationPoints: [], confidenceLevel: 0.9, splitFingerprint: 'fixture', provenance: 'SIMULATED',
    })).toThrow(/empty/);
    expect(() => conformalQuantile([], 0.9)).toThrow(/non-empty/);
  });

  // 14. edge quantile
  test('14. edge quantile: k===n is exactly achievable, k===n+1 is exactly not', () => {
    const residuals = Array.from({ length: 9 }, (_, i) => i + 1); // 1..9, n=9
    // level=0.9 -> k = ceil(10*0.9) = 9 = n -> achievable, uses the max (9).
    const atBoundary = conformalQuantile(residuals, 0.9);
    expect(atBoundary.guaranteeAchievable).toBe(true);
    expect(atBoundary.quantile).toBe(9);
    // level=0.95 -> k = ceil(10*0.95) = 10 > n=9 -> not achievable, clamped to max (9).
    const overBoundary = conformalQuantile(residuals, 0.95);
    expect(overBoundary.guaranteeAchievable).toBe(false);
    expect(overBoundary.quantile).toBe(9);
  });

  // 15. negative control: adversarial inputs designed to break the math
  test('15a. negative control: confidenceLevel outside (0,1) is rejected', () => {
    expect(() => conformalQuantile([1, 2, 3], 1)).toThrow(/\(0,1\)/);
    expect(() => conformalQuantile([1, 2, 3], 0)).toThrow(/\(0,1\)/);
    expect(() => conformalQuantile([1, 2, 3], 1.5)).toThrow(/\(0,1\)/);
    expect(() => conformalQuantile([1, 2, 3], -0.1)).toThrow(/\(0,1\)/);
  });

  test('15b. negative control: NaN/Infinity in calibration points is rejected, never silently propagated', () => {
    const fit = fitLinear(makeLinearDataset(10, 1, 0, 0));
    const withNaN: ModelPoint[] = [...makeLinearDataset(9, 1, 0, 0), { x: 5, y: Number.NaN, sigma: 1 }];
    expect(() => calibrateConformalPredictor({
      fit, calibrationPoints: withNaN, confidenceLevel: 0.9, splitFingerprint: 'fixture', provenance: 'SIMULATED',
    })).toThrow(/finite/);

    const withInfiniteSigma: ModelPoint[] = [...makeLinearDataset(9, 1, 0, 0), { x: 5, y: 5, sigma: Number.POSITIVE_INFINITY }];
    expect(() => calibrateConformalPredictor({
      fit, calibrationPoints: withInfiniteSigma, confidenceLevel: 0.9, splitFingerprint: 'fixture', provenance: 'SIMULATED',
    })).toThrow(/finite/);
  });

  test('15c. negative control: leakage — a hand-crafted split with overlapping calibration/holdout indices is refused', () => {
    const points = makeLinearDataset(10, 1, 0, 0);
    const maliciousSplit = {
      seed: 1, sampleSize: 10, calibrationFraction: 0.5,
      calibrationIndices: [0, 1, 2, 3, 4],
      holdoutIndices: [4, 5, 6, 7, 8, 9], // 4 leaks into both
      fingerprint: 'malicious',
    };
    expect(() => splitPoints(points, maliciousSplit)).toThrow(/overlap/);
  });

  test('15d. negative control: nondeterministic-split defense — negative or non-integer sampleSize is refused', () => {
    expect(() => deterministicCalibrationSplit(-5)).toThrow(/integer >= 2/);
    expect(() => deterministicCalibrationSplit(1.5)).toThrow(/integer >= 2/);
    expect(() => deterministicCalibrationSplit(1)).toThrow(/integer >= 2/);
  });

  test('15e. negative control: model-derived pseudo-observation (all-zero residuals) is FLAGGED, not hard-blocked', () => {
    const points = makeLinearDataset(10, 2, 1, 0);
    const fit = fitLinear(points);
    // calibration "observations" are exactly the model's own predictions — a pseudo-observation.
    const pseudoObserved = points.map((p) => ({ ...p, y: fit.predict(p.x) }));
    const calibration = calibrateConformalPredictor({
      fit, calibrationPoints: pseudoObserved, confidenceLevel: 0.9, splitFingerprint: 'fixture', provenance: 'SIMULATED',
    });
    expect(calibration.quantile).toBeCloseTo(0, 6);
    expect(calibration.warnings.some((w) => w.includes('derived from this same model'))).toBe(true);
  });
});
