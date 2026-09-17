import { describe, it, expect } from 'vitest';
import {
  runRegimeInquiryCore,
  runQe4DisorderRegimeInquiry,
  deriveResidualHypothesis,
} from '../core/agent/qe4RegimeInquiryLoop';
import type { Qe4PointResult } from '../core/biotechData/qe4BrydgesAnalysis';

function point(t: number, s2: number, sigma: number, k = 5): Qe4PointResult {
  return { t, k, s2, sigma, clamped: false };
}

describe('qe4RegimeInquiryLoop — P0-2 (grid-derived hypotheses + lineage)', () => {
  it('creates exactly three regime hypotheses tagged REGIME_FIT_FROM_GRID with no parent, not a hardcoded literal set', () => {
    const points = [1, 2, 4, 6, 10, 16, 20].map((t) => point(t, 1, 0.05));
    const result = runRegimeInquiryCore(points, { k: 5, maxRounds: 3 });
    const round3 = result.rounds[result.rounds.length - 1]!;
    expect(round3.hypotheses).toHaveLength(3);
    const ids = round3.hypotheses.map((h) => h.id).sort();
    expect(ids).toEqual(['qe4-regime-linear-k5', 'qe4-regime-logarithmic-k5', 'qe4-regime-saturating-k5']);
    for (const h of round3.hypotheses) {
      expect(h.generatedBy).toBe('REGIME_FIT_FROM_GRID');
      expect(h.parentHypothesisId).toBeNull();
    }
  });

  it('does not attempt a fit before the minimum-points threshold, and still runs the anti-HARK check on those rounds', () => {
    const points = [1, 2, 4, 6, 10, 16, 20].map((t) => point(t, 1, 0.05));
    const result = runRegimeInquiryCore(points, { k: 5, maxRounds: 2 });
    expect(result.rounds).toHaveLength(2);
    for (const round of result.rounds) {
      expect(round.fits).toBeNull();
      expect(round.decisive).toBe(false);
      expect(round.antiHarking.intact).toBe(true);
    }
    expect(result.winningHypothesisId).toBeNull();
  });

  it('recomputes hypotheses fresh from an admitted grid that grows round over round (real grid, not a literal)', () => {
    const points = [1, 2, 3, 4, 5].map((t) => point(t, 2 * t + 1, 0.01));
    const result = runRegimeInquiryCore(points, { k: 5, maxRounds: 3 });
    expect(result.rounds.map((r) => r.admittedTMs)).toEqual([[1], [1, 2], [1, 2, 3]]);
  });
});

describe('qe4RegimeInquiryLoop — P0-3 (CONVERGENCE / NO_INFORMATION_GAIN stop rules)', () => {
  it('stops with CONVERGENCE when one regime wins decisively on consecutive rounds and confidence crosses threshold', () => {
    // Perfectly linear, low-noise: LINEAR should dominate LOGARITHMIC/SATURATING immediately.
    const points = Array.from({ length: 10 }, (_, i) => i + 1).map((t) => point(t, 2 * t + 1, 0.01));
    const result = runRegimeInquiryCore(points, { k: 5 });
    expect(result.stopReason).toBe('CONVERGENCE');
    expect(result.winningHypothesisId).toBe('qe4-regime-linear-k5');
    expect(result.rounds.length).toBeLessThan(points.length);
    const winner = result.rounds[result.rounds.length - 1]!.hypotheses.find((h) => h.id === 'qe4-regime-linear-k5')!;
    expect(winner.confidence).toBeGreaterThanOrEqual(0.95);
    expect(winner.status).toBe('SUPPORTED_WITHIN_PROTOCOL');
  });

  it('stops with NO_INFORMATION_GAIN when the discriminating margin stops moving round over round without ever becoming decisive', () => {
    // Flat/noisy real-shaped data: no regime should ever pull decisively ahead,
    // and the margin should stabilize well before the grid (7 points) is exhausted.
    const tValues = [1, 2, 4, 6, 10, 16, 20];
    const s2Values = [1.0, 1.05, 0.98, 1.02, 1.0, 0.97, 1.03];
    const points = tValues.map((t, i) => point(t, s2Values[i]!, 0.05));
    const result = runRegimeInquiryCore(points, { k: 5 });
    expect(result.stopReason).toBe('NO_INFORMATION_GAIN');
    expect(result.winningHypothesisId).toBeNull();
    expect(result.rounds.every((r) => !r.decisive)).toBe(true);
    expect(result.rounds.length).toBeLessThan(tValues.length);
  });

  it('stops with ROUND_BUDGET_EXHAUSTED and still reports a winner when the last evaluable round is decisive but budget runs out first', () => {
    // Same clean linear data as the convergence case, but capped at exactly the
    // first evaluable round (3 points) — decisive immediately, but there is no
    // PREVIOUS round to compare against, so CONVERGENCE cannot fire yet.
    const points = Array.from({ length: 10 }, (_, i) => i + 1).map((t) => point(t, 2 * t + 1, 0.01));
    const result = runRegimeInquiryCore(points, { k: 5, maxRounds: 3 });
    expect(result.stopReason).toBe('ROUND_BUDGET_EXHAUSTED');
    expect(result.rounds).toHaveLength(3);
    expect(result.rounds[2]!.decisive).toBe(true);
    expect(result.winningHypothesisId).toBe('qe4-regime-linear-k5');
  });
});

describe('qe4RegimeInquiryLoop — P0-5 (mandatory, acted-on anti-HARK gate)', () => {
  it('runs the anti-HARK check every round unconditionally (present on every round record, decisive or not)', () => {
    const points = [1, 2, 3, 4, 5].map((t) => point(t, 2 * t + 1, 0.01));
    const result = runRegimeInquiryCore(points, { k: 5, maxRounds: 3 });
    for (const round of result.rounds) {
      expect(round.antiHarking).toBeDefined();
      expect(typeof round.antiHarking.intact).toBe('boolean');
    }
  });

  it('stops the loop with ANTI_HARKING_VIOLATION and refuses to report a winner when a later round reuses a fingerprint declared known before the run started', () => {
    const points = Array.from({ length: 10 }, (_, i) => i + 1).map((t) => point(t, 2 * t + 1, 0.01));
    const clean = runRegimeInquiryCore(points, { k: 5, maxRounds: 3 });
    expect(clean.rounds[2]!.antiHarking.intact).toBe(true);
    const knownFingerprint = clean.rounds[2]!.runFingerprint;

    const harked = runRegimeInquiryCore(points, { k: 5, maxRounds: 3, alreadyKnownFingerprints: [knownFingerprint] });
    expect(harked.stopReason).toBe('ANTI_HARKING_VIOLATION');
    expect(harked.winningHypothesisId).toBeNull();
    const violatingRound = harked.rounds[harked.rounds.length - 1]!;
    expect(violatingRound.antiHarking.intact).toBe(false);
    expect(violatingRound.antiHarking.contradictingFingerprints).toContain(knownFingerprint);
  });

  it('an honest blind run (default empty anchor) never trips the anti-HARK gate on real, distinct rounds', () => {
    const points = [1, 2, 4, 6, 10, 16, 20].map((t) => point(t, 1 + 0.01 * t, 0.05));
    const result = runRegimeInquiryCore(points, { k: 5 });
    expect(result.rounds.every((r) => r.antiHarking.intact)).toBe(true);
  });
});

describe('deriveResidualHypothesis — the other half of P0-2', () => {
  const parentId = 'qe4-regime-linear-k5';

  it('derives a new, untested, lineage-linked hypothesis when one admitted point is a clear outlier against the winning fit', () => {
    const points = [point(1, 3, 1), point(2, 5, 1), point(3, 7, 1), point(4, 20, 1), point(5, 11, 1)];
    const predict = (t: number) => 2 * t + 1; // true regime; t=4 (true 9) was bumped to 20
    const result = deriveResidualHypothesis('LINEAR', predict, points, 5, parentId);
    expect(result.hypothesis).not.toBeNull();
    expect(result.hypothesis!.id).toBe('qe4-residual-anomaly-k5-T4');
    expect(result.hypothesis!.parentHypothesisId).toBe(parentId);
    expect(result.hypothesis!.generatedBy).toBe('RESIDUAL_FROM_FIT');
    expect(result.hypothesis!.status).toBe('ACTIVE');
  });

  it('returns null when no admitted point deviates from the winning fit more than the disclosed anomaly ratio', () => {
    const points = [point(1, 3, 1), point(2, 5, 1), point(3, 7, 1), point(4, 9, 1), point(5, 11, 1)];
    const predict = (t: number) => 2 * t + 1; // exact fit, zero residuals everywhere
    const result = deriveResidualHypothesis('LINEAR', predict, points, 5, parentId);
    expect(result.hypothesis).toBeNull();
    expect(result.reason).toMatch(/no localized-anomaly hypothesis is warranted/i);
  });

  it('is wired into the full loop: a clean decisive run with no outlier reports no residual hypothesis, honestly', () => {
    const points = Array.from({ length: 10 }, (_, i) => i + 1).map((t) => point(t, 2 * t + 1, 0.01));
    const result = runRegimeInquiryCore(points, { k: 5 });
    expect(result.winningHypothesisId).not.toBeNull();
    expect(result.residual.hypothesis).toBeNull();
    expect(result.residual.reason).toMatch(/no localized-anomaly hypothesis is warranted/i);
  });

  it('reports the honest "no winner" reason when the loop never resolves a decisive regime', () => {
    const tValues = [1, 2, 4, 6, 10, 16, 20];
    const s2Values = [1.0, 1.05, 0.98, 1.02, 1.0, 0.97, 1.03];
    const points = tValues.map((t, i) => point(t, s2Values[i]!, 0.05));
    const result = runRegimeInquiryCore(points, { k: 5 });
    expect(result.winningHypothesisId).toBeNull();
    expect(result.residual.hypothesis).toBeNull();
    expect(result.residual.reason).toMatch(/no decisive winning regime was ever established/i);
  });
});

describe('qe4RegimeInquiryLoop — real-data entry point', () => {
  it('runs end-to-end against the real pinned Brydges disorder dataset without throwing, and is deterministic across two runs', () => {
    const first = runQe4DisorderRegimeInquiry(5);
    const second = runQe4DisorderRegimeInquiry(5);
    expect(first.rounds.length).toBeGreaterThan(0);
    expect(first.rounds.every((r) => r.antiHarking.intact)).toBe(true);
    expect(first.stopReason).toBe(second.stopReason);
    expect(first.winningHypothesisId).toBe(second.winningHypothesisId);
    expect(first.rounds.map((r) => r.runFingerprint)).toEqual(second.rounds.map((r) => r.runFingerprint));
  });

  it('k=10 also runs end-to-end without throwing', () => {
    const result = runQe4DisorderRegimeInquiry(10);
    expect(result.rounds.length).toBeGreaterThan(0);
  });
});
