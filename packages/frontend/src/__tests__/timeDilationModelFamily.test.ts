import { describe, expect, it } from 'vitest';
import {
  HOLDOUT_DATA,
  HOLDOUT_TOLERANCE,
  netFractionalRateAtAltitude,
  replayTimeDilationModelFamily,
  runTimeDilationModelFamily,
  saveTimeDilationModelFamilyToMemory,
  TRAINING_DATA,
} from '../core/discovery/physics/timeDilationModelFamily';

describe('timeDilationModelFamily — real derived data, no fabrication', () => {
  it('training and holdout points are disjoint real orbital altitudes', () => {
    const trainingIds = new Set(TRAINING_DATA.map((d) => d.evidenceRecordId));
    for (const d of HOLDOUT_DATA) {
      expect(trainingIds.has(d.evidenceRecordId)).toBe(false);
    }
  });

  it('derived net rates reproduce the known SR/GR crossover: negative (SR-dominated) at low LEO, positive (GR-dominated) at GPS/GEO altitude', () => {
    expect(netFractionalRateAtAltitude(400_000)).toBeLessThan(0);
    expect(netFractionalRateAtAltitude(20_200_000)).toBeGreaterThan(0);
    expect(netFractionalRateAtAltitude(35_786_000)).toBeGreaterThan(0);
  });
});

describe('timeDilationModelFamily — the correct functional form wins on real held-out computation', () => {
  it('the correct variant (linear in 1/r) is genuinely SUPPORTED', () => {
    const result = runTimeDilationModelFamily();
    const correct = result.outcomes.find((o) => o.variantId === 'linear-in-inverse-radius')!;
    expect(correct.candidate.status).toBe('TESTED');
    expect(correct.candidate.verdict).toBe('SUPPORTED');
    expect(correct.holdoutMeanAbsoluteError).not.toBeNull();
    expect(correct.holdoutMeanAbsoluteError!).toBeLessThanOrEqual(HOLDOUT_TOLERANCE);
  });

  it('both wrong variants (linear in r; linear in 1/r^2) are genuinely FALSIFIED, by computation', () => {
    const result = runTimeDilationModelFamily();
    for (const variantId of ['linear-in-radius', 'linear-in-inverse-radius-squared']) {
      const outcome = result.outcomes.find((o) => o.variantId === variantId)!;
      expect(outcome.candidate.verdict).toBe('FALSIFIED');
      expect(outcome.holdoutMeanAbsoluteError!).toBeGreaterThan(HOLDOUT_TOLERANCE);
    }
  });

  it('END-TO-END: the family declares the physically correct variant as the winner', () => {
    const result = runTimeDilationModelFamily();
    expect(result.winningVariantId).toBe('linear-in-inverse-radius');
    expect(result.trainingPointCount).toBe(TRAINING_DATA.length);
    expect(result.holdoutPointCount).toBe(HOLDOUT_DATA.length);
  });

  it('is deterministic across runs', () => {
    const a = runTimeDilationModelFamily();
    const b = runTimeDilationModelFamily();
    expect(a.resultFingerprint).toBe(b.resultFingerprint);
  });
});

describe('timeDilationModelFamily — replay and memory', () => {
  it('replays MATCH against a freshly recomputed result', () => {
    const saved = runTimeDilationModelFamily();
    expect(replayTimeDilationModelFamily(saved).status).toBe('MATCH');
  });

  it('replays DRIFT when the saved fingerprint is tampered with', () => {
    const saved = runTimeDilationModelFamily();
    const tampered = { ...saved, resultFingerprint: `${saved.resultFingerprint}0` };
    expect(replayTimeDilationModelFamily(tampered).status).toBe('DRIFT');
  });

  it('saves to memory with the correct variant declared winner', () => {
    const result = runTimeDilationModelFamily();
    const saved = saveTimeDilationModelFamilyToMemory(result);
    expect(saved.epistemicStatus).toContain('WINNER=linear-in-inverse-radius');
  });
});
