import { describe, expect, it } from 'vitest';
import {
  buildPredictionMatrix,
  experimentGaps,
  assessObservable,
  generateDifferentiatingExperiment,
  type HypothesisPrediction,
  type CandidateObservable,
} from '../core/agent/differentiatingExperimentGenerator';

/**
 * DD-EXP — the mandate's own named fixture: H1/H2 differ on an AVAILABLE
 * observable X; H2/H3 differ ONLY on an UNAVAILABLE observable Y.
 * Expected: choose X; the decision rule separates H1 from {H2,H3}; H2-vs-H3
 * is reported honestly as unresolved; a real M1 gap request is raised for Y.
 */

const H1: HypothesisPrediction = { hypothesisId: 'H1', predictions: { X: 1.0, Y: 4.0 } };
const H2: HypothesisPrediction = { hypothesisId: 'H2', predictions: { X: 5.0, Y: 2.0 } };
const H3: HypothesisPrediction = { hypothesisId: 'H3', predictions: { X: 5.0, Y: 8.0 } };

const X_AVAILABLE: CandidateObservable = { observableId: 'X', quantity: 'quantity X', unit: 'unit', instrumentClass: 'pinned dataset', available: true, sigma: 0.5 };
const Y_UNAVAILABLE: CandidateObservable = { observableId: 'Y', quantity: 'quantity Y', unit: 'unit', instrumentClass: 'external archive', available: false, sigma: 0.5 };

describe('buildPredictionMatrix / experimentGaps', () => {
  it('builds the full (hypothesis, observable) matrix', () => {
    const matrix = buildPredictionMatrix([H1, H2, H3], [X_AVAILABLE, Y_UNAVAILABLE]);
    expect(matrix.length).toBe(6);
  });

  it('a hypothesis with no quantitative prediction is a real, reported EXPERIMENT_GAP, not silently skipped', () => {
    const noPrediction: HypothesisPrediction = { hypothesisId: 'H4', predictions: { X: null } };
    const matrix = buildPredictionMatrix([H1, noPrediction], [X_AVAILABLE]);
    const gaps = experimentGaps(matrix);
    expect(gaps).toEqual([{ hypothesisId: 'H4', observableId: 'X' }]);
  });
});

describe('assessObservable — worst-case pairwise discriminability', () => {
  it('X separates H1 from H2/H3 (8 sigma) but NOT H2 from H3 (0 sigma) -- worst case is 0', () => {
    const matrix = buildPredictionMatrix([H1, H2, H3], [X_AVAILABLE]);
    const assessment = assessObservable(matrix, 'X', 0.5);
    expect(assessment.discriminability).toBeCloseTo(0, 5); // H2 vs H3 tied on X
    expect(assessment.unresolvedPairs.some((p) => (p.hypothesisA === 'H2' && p.hypothesisB === 'H3') || (p.hypothesisA === 'H3' && p.hypothesisB === 'H2'))).toBe(true);
    expect(assessment.falsificationPower).toBeCloseTo(2 / 3, 5); // 2 of 3 pairs separated
  });

  it('Y separates H2 from H3 strongly (12 sigma)', () => {
    const matrix = buildPredictionMatrix([H1, H2, H3], [Y_UNAVAILABLE]);
    const assessment = assessObservable(matrix, 'Y', 0.5);
    const h2h3 = assessment.unresolvedPairs.find((p) => new Set([p.hypothesisA, p.hypothesisB]).has('H2') && new Set([p.hypothesisA, p.hypothesisB]).has('H3'));
    expect(h2h3).toBeUndefined(); // NOT unresolved -- Y separates H2/H3 cleanly
  });
});

describe('DD-EXP — the mandate\'s own fixture', () => {
  it('selects X (available), separates H1 from {H2,H3}, reports H2-vs-H3 unresolved, and raises a real gap request for Y', () => {
    const result = generateDifferentiatingExperiment({
      hypotheses: [H1, H2, H3],
      observables: [X_AVAILABLE, Y_UNAVAILABLE],
      campaignId: 'dd-exp-test',
      round: 1,
    });

    expect(result.outcome).toBe('EXPERIMENT_SELECTED');
    if (result.outcome !== 'EXPERIMENT_SELECTED') throw new Error('unreachable');

    expect(result.spec.observableId).toBe('X');
    expect(result.spec.feasibility).toBe('AVAILABLE');

    // Decision rule separates H1 from H2/H3.
    const h1Expected = result.spec.expectedOutcomePerHypothesis.find((e) => e.hypothesisId === 'H1')!;
    const h2Expected = result.spec.expectedOutcomePerHypothesis.find((e) => e.hypothesisId === 'H2')!;
    expect(Math.abs(h1Expected.expectedOutcome - h2Expected.expectedOutcome) / X_AVAILABLE.sigma).toBeGreaterThan(1);

    // H2 vs H3 honestly unresolved by this experiment.
    expect(result.spec.unresolvedPairs.some((p) => new Set([p.hypothesisA, p.hypothesisB]).has('H2') && new Set([p.hypothesisA, p.hypothesisB]).has('H3'))).toBe(true);

    // A real gap request for Y was raised in the SAME call.
    expect(result.spec.followUpGapRequest).not.toBeNull();
    expect(result.spec.followUpGapRequest!.requiredObservable.quantity).toBe('quantity Y');
    expect(result.spec.followUpGapRequest!.status).toBe('OPEN');

    // The decision rule was frozen -- a real, non-empty fingerprint.
    expect(result.spec.decisionRuleFingerprint.length).toBeGreaterThan(0);
  });

  it('is deterministic: identical inputs produce an identical decision-rule fingerprint', () => {
    const a = generateDifferentiatingExperiment({ hypotheses: [H1, H2, H3], observables: [X_AVAILABLE, Y_UNAVAILABLE], campaignId: 'dd-exp-det', round: 1 });
    const b = generateDifferentiatingExperiment({ hypotheses: [H1, H2, H3], observables: [X_AVAILABLE, Y_UNAVAILABLE], campaignId: 'dd-exp-det', round: 1 });
    if (a.outcome !== 'EXPERIMENT_SELECTED' || b.outcome !== 'EXPERIMENT_SELECTED') throw new Error('unreachable');
    expect(a.spec.decisionRuleFingerprint).toBe(b.spec.decisionRuleFingerprint);
  });
});

describe('FAIL condition — a non-discriminating observable is never chosen', () => {
  it('when every available observable ties all hypotheses, the generator refuses to select one and raises a gap request instead', () => {
    const tiedX: CandidateObservable = { ...X_AVAILABLE, observableId: 'X-tied' };
    const tiedHyps: HypothesisPrediction[] = [
      { hypothesisId: 'A', predictions: { 'X-tied': 3.0, Y: 4.0 } },
      { hypothesisId: 'B', predictions: { 'X-tied': 3.0, Y: 2.0 } },
      { hypothesisId: 'C', predictions: { 'X-tied': 3.0, Y: 8.0 } },
    ];
    const result = generateDifferentiatingExperiment({ hypotheses: tiedHyps, observables: [tiedX, Y_UNAVAILABLE], campaignId: 'dd-exp-tied', round: 1 });
    expect(result.outcome).toBe('NO_DISCRIMINATING_EXPERIMENT_AVAILABLE');
    if (result.outcome !== 'NO_DISCRIMINATING_EXPERIMENT_AVAILABLE') throw new Error('unreachable');
    expect(result.gapRequest).not.toBeNull();
  });

  it('when nothing at all -- available or knowable -- discriminates, reports honestly with no gap request', () => {
    const uselessX: CandidateObservable = { ...X_AVAILABLE, observableId: 'X-useless' };
    const uselessY: CandidateObservable = { ...Y_UNAVAILABLE, observableId: 'Y-useless' };
    const tiedEverywhere: HypothesisPrediction[] = [
      { hypothesisId: 'A', predictions: { 'X-useless': 1, 'Y-useless': 1 } },
      { hypothesisId: 'B', predictions: { 'X-useless': 1, 'Y-useless': 1 } },
    ];
    const result = generateDifferentiatingExperiment({ hypotheses: tiedEverywhere, observables: [uselessX, uselessY], campaignId: 'dd-exp-hopeless', round: 1 });
    expect(result.outcome).toBe('NO_DISCRIMINATING_EXPERIMENT_AVAILABLE');
    if (result.outcome !== 'NO_DISCRIMINATING_EXPERIMENT_AVAILABLE') throw new Error('unreachable');
    expect(result.gapRequest).toBeNull();
  });
});

describe('a clean case: an experiment that resolves every pair needs no follow-up gap request', () => {
  it('followUpGapRequest is null when unresolvedPairs is empty', () => {
    const cleanX: CandidateObservable = { observableId: 'X-clean', quantity: 'q', unit: 'u', instrumentClass: 'i', available: true, sigma: 0.5 };
    const cleanHyps: HypothesisPrediction[] = [
      { hypothesisId: 'A', predictions: { 'X-clean': 1 } },
      { hypothesisId: 'B', predictions: { 'X-clean': 5 } },
      { hypothesisId: 'C', predictions: { 'X-clean': 9 } },
    ];
    const result = generateDifferentiatingExperiment({ hypotheses: cleanHyps, observables: [cleanX], campaignId: 'dd-exp-clean', round: 1 });
    expect(result.outcome).toBe('EXPERIMENT_SELECTED');
    if (result.outcome !== 'EXPERIMENT_SELECTED') throw new Error('unreachable');
    expect(result.spec.unresolvedPairs).toEqual([]);
    expect(result.spec.followUpGapRequest).toBeNull();
  });
});
