import { describe, expect, it } from 'vitest';
import {
  computeInformationGain,
  computePredictionError,
  computeSurpriseScore,
  deriveKnowledgeGaps,
} from '../core/metaCognition/scientificMetrics';
import {
  assertNoHiddenReasoningOrSentienceClaim,
  buildDecisionTrace,
  type DecisionTraceInput,
} from '../core/metaCognition/decisionTrace';

describe('scientificMetrics — prediction error', () => {
  it('computes absolute and sigma error deterministically', () => {
    const result = computePredictionError({ predicted: 10, observed: 12, uncertaintySigma: 2 });
    expect(result.absoluteError).toBe(2);
    expect(result.sigmaError).toBe(1);
  });

  it('is deterministic across repeated calls with the same input', () => {
    const a = computePredictionError({ predicted: 5.5, observed: 4.1, uncertaintySigma: 0.7 });
    const b = computePredictionError({ predicted: 5.5, observed: 4.1, uncertaintySigma: 0.7 });
    expect(a).toEqual(b);
  });

  it('returns a finite sigmaError of 0 rather than Infinity for an unusable uncertainty', () => {
    const result = computePredictionError({ predicted: 1, observed: 5, uncertaintySigma: 0 });
    expect(result.sigmaError).toBe(0);
    expect(Number.isFinite(result.sigmaError)).toBe(true);
  });
});

describe('scientificMetrics — surprise', () => {
  it('is the deterministic Gaussian surprisal of the sigma error (sigmaError^2 / 2)', () => {
    expect(computeSurpriseScore(2)).toBe(2);
    expect(computeSurpriseScore(0)).toBe(0);
  });

  it('a larger prediction error always yields a larger or equal surprise', () => {
    expect(computeSurpriseScore(3)).toBeGreaterThan(computeSurpriseScore(1));
  });
});

describe('scientificMetrics — information gain and knowledge gaps', () => {
  const pairs = [
    { hypothesisA: 'A', hypothesisB: 'B', predictedDifference: 4, pooledSigma: 2 }, // 2σ, discriminated
    { hypothesisA: 'C', hypothesisB: 'D', predictedDifference: 0.5, pooledSigma: 2 }, // 0.25σ, gap
  ];

  it('computes information gain as the mean sigma-separation across hypothesis pairs', () => {
    const gain = computeInformationGain({ hypothesisPairs: pairs });
    expect(gain).toBeCloseTo((2 + 0.25) / 2, 6);
  });

  it('derives knowledge gaps for pairs below the sigma threshold, in original order', () => {
    const gaps = deriveKnowledgeGaps(pairs, 1);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.hypothesisPairIndex).toBe(1);
    expect(gaps[0]!.hypothesisA).toBe('C');
  });

  it('reports no gaps when every pair clears the threshold', () => {
    expect(deriveKnowledgeGaps(pairs, 0.1)).toHaveLength(0);
  });
});

const validTraceInput: DecisionTraceInput = {
  decisionId: 'd-1',
  summary: 'Wybrano solver logistic-growth dla klasy zadania SCIENTIFIC_REASONING.',
  evidenceRefs: [{ id: 'EV-1', contentHash: 'abc' }],
  alternatives: [
    { id: 'logistic-growth', status: 'SELECTED' },
    { id: 'epidemic-seir', status: 'REJECTED', rejectedReasonCode: 'OUT_OF_SCOPE' },
  ],
  selectedCapability: 'specialist-logistic-growth-closed-form',
  inputClassification: 'REASONING_ONLY',
  outputClassification: 'VERIFIED_BY_SOLVER',
};

describe('decisionTrace — structure and no hidden reasoning', () => {
  it('builds a fingerprinted trace for valid input', () => {
    const trace = buildDecisionTrace(validTraceInput);
    expect(trace.traceFingerprint).toMatch(/^trace_/);
    expect(trace.contractVersion).toBeTruthy();
  });

  it('is deterministic: identical input yields an identical fingerprint', () => {
    const a = buildDecisionTrace(validTraceInput);
    const b = buildDecisionTrace(validTraceInput);
    expect(a.traceFingerprint).toBe(b.traceFingerprint);
  });

  it('rejects a summary containing a sentience/consciousness claim', () => {
    expect(() => assertNoHiddenReasoningOrSentienceClaim('I am conscious of my own reasoning here.')).toThrow(
      /DECISION_TRACE_REJECTED/,
    );
  });

  it('rejects a summary that reads like hidden chain-of-thought (over the length cap)', () => {
    const longSummary = 'x'.repeat(500);
    expect(() => assertNoHiddenReasoningOrSentienceClaim(longSummary)).toThrow(/DECISION_TRACE_REJECTED/);
  });

  it('rejects more than one SELECTED alternative', () => {
    expect(() =>
      buildDecisionTrace({
        ...validTraceInput,
        alternatives: [
          { id: 'a', status: 'SELECTED' },
          { id: 'b', status: 'SELECTED' },
        ],
      }),
    ).toThrow(/DECISION_TRACE_REJECTED/);
  });

  it('rejects a REJECTED alternative with no reason code', () => {
    expect(() =>
      buildDecisionTrace({ ...validTraceInput, alternatives: [{ id: 'a', status: 'REJECTED' }] }),
    ).toThrow(/DECISION_TRACE_REJECTED/);
  });

  it('carries evidence record IDs and capability/classification fields through unchanged', () => {
    const trace = buildDecisionTrace(validTraceInput);
    expect(trace.evidenceRefs).toEqual(validTraceInput.evidenceRefs);
    expect(trace.selectedCapability).toBe(validTraceInput.selectedCapability);
    expect(trace.inputClassification).toBe('REASONING_ONLY');
    expect(trace.outputClassification).toBe('VERIFIED_BY_SOLVER');
  });

  it('accepts a BLOCKED trace with a blockedReason', () => {
    const trace = buildDecisionTrace({
      ...validTraceInput,
      alternatives: [{ id: 'logistic-growth', status: 'NOT_EVALUATED' }],
      blockedReason: 'Brak dostępnego dostawcy.',
    });
    expect(trace.blockedReason).toBe('Brak dostępnego dostawcy.');
  });
});
