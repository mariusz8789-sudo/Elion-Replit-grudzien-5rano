import { describe, expect, it } from 'vitest';
import {
  assessSingleTautology,
  assessTautology,
  evidenceCeiling,
  type TautologyComponent,
} from '../core/agent/tautologyGate';

/**
 * TAUTOLOGY / CIRCULARITY GATE — behavioral tests.
 *
 * These prove the gate DISTINGUISHES real cases from the QE1-3 audit, not
 * merely that the functions exist. Case numbering follows the P2.1
 * implementation brief exactly (6 minimum behavioral cases); CASE 2 and
 * CASE 3 (which are about discrimination across probe settings, not the
 * gate's own classification) are proven in `entanglementInquiryTautology.test.ts`
 * against the real QE1/QE2 systems and the real `inquiryLoop.ts` machinery,
 * not re-derived here.
 */

const TSIRELSON_PREDICTION: TautologyComponent = {
  componentId: 'qe1-tsirelson',
  prediction: {
    source: 'model-invariant',
    modelId: 'quantum-entanglement-measures',
    rationale: 'max CHSH over all measurement settings is 2√2 (Tsirelson bound) for every state this Hilbert-space formalism can express — the Horodecki criterion, not a run result',
  },
  observation: {
    source: 'model-invariant',
    modelId: 'quantum-entanglement-measures',
    rationale: 'the "measured" ceiling is the same analytic maximum, computed by the same formula',
  },
};

describe('CASE 1 — QE1 Tsirelson: prediction and limit from the same formalism', () => {
  it('classifies as CONSISTENCY_CHECK', () => {
    const result = assessSingleTautology(TSIRELSON_PREDICTION);
    expect(result.classification).toBe('CONSISTENCY_CHECK');
    expect(result.reasons.some((r) => /C3\/C4/.test(r))).toBe(true);
  });

  it('cannot raise scientific confidence — evidenceCeiling caps it at zero', () => {
    const result = assessSingleTautology(TSIRELSON_PREDICTION);
    expect(evidenceCeiling(result.classification)).toBe(0);
  });
});

describe('CASE 4 — independent measurement: prediction from model A, observation from an independent channel B', () => {
  it('classifies as EMPIRICAL_TEST', () => {
    const result = assessSingleTautology({
      componentId: 'external-check',
      prediction: {
        source: 'hypothesis-parameter',
        modelId: 'model-a',
        rationale: 'computed from this hypothesis\'s own claimed parameter values',
      },
      observation: {
        source: 'independent-measurement',
        modelId: 'external-dataset-b',
        rationale: 'a real, independently sourced dataset that shares no code path or free parameter with model-a',
      },
    });
    expect(result.classification).toBe('EMPIRICAL_TEST');
    expect(evidenceCeiling(result.classification)).toBeNull();
  });
});

describe('CASE 5 — mixed test: one component algebraically guaranteed, one measured independently', () => {
  it('classifies as MIXED_TEST and names which component is which', () => {
    const result = assessTautology([
      TSIRELSON_PREDICTION,
      {
        componentId: 'external-visibility-check',
        prediction: { source: 'hypothesis-parameter', modelId: 'quantum-entanglement-measures', rationale: 'this hypothesis\'s claimed visibility, run through the model' },
        observation: { source: 'independent-measurement', modelId: 'lab-calibration-log', rationale: 'a real source-brightness calibration reading, independent of the entanglement solver' },
      },
    ]);
    expect(result.classification).toBe('MIXED_TEST');
    expect(result.components).toHaveLength(2);
    expect(result.components.find((c) => c.componentId === 'qe1-tsirelson')!.classification).toBe('CONSISTENCY_CHECK');
    expect(result.components.find((c) => c.componentId === 'external-visibility-check')!.classification).toBe('EMPIRICAL_TEST');
  });
});

describe('CASE 6 — insufficient metadata: no declared source for prediction or observation', () => {
  it('classifies as UNTESTABLE rather than guessing, when observation derivation is missing', () => {
    const result = assessSingleTautology({
      componentId: 'unknown-provenance',
      prediction: { source: 'hypothesis-parameter', modelId: 'model-a', rationale: 'from this hypothesis\'s claimed values' },
      observation: null,
    });
    expect(result.classification).toBe('UNTESTABLE');
    expect(result.reasons[0]).toMatch(/not declared/);
  });

  it('classifies as UNTESTABLE when prediction derivation is missing', () => {
    const result = assessSingleTautology({
      componentId: 'unknown-provenance-2',
      prediction: null,
      observation: { source: 'independent-measurement', modelId: 'dataset-b', rationale: 'external reading' },
    });
    expect(result.classification).toBe('UNTESTABLE');
  });

  it('never returns CONSISTENCY_CHECK or EMPIRICAL_TEST from missing metadata alone — no false positives', () => {
    const result = assessSingleTautology({ componentId: 'x', prediction: null, observation: null });
    expect(result.classification).toBe('UNTESTABLE');
  });

  it('evidenceCeiling caps UNTESTABLE at zero too — an unknown cannot count as evidence either', () => {
    expect(evidenceCeiling('UNTESTABLE')).toBe(0);
  });
});

describe('C2 — derived from the same computed output (a stronger, narrower circularity than model-invariant)', () => {
  it('classifies as CONSISTENCY_CHECK even when both sides are otherwise hypothesis-parameter', () => {
    const result = assessSingleTautology({
      componentId: 'self-referential-normalization',
      prediction: { source: 'hypothesis-parameter', modelId: 'model-a', rationale: 'a probability mass computed from this hypothesis' },
      observation: { source: 'hypothesis-parameter', modelId: 'model-a', rationale: 'the same probability mass, read back after normalization forced it to sum to 1' },
      derivedFromSameComputation: true,
    });
    expect(result.classification).toBe('CONSISTENCY_CHECK');
    expect(result.reasons.some((r) => /C2/.test(r))).toBe(true);
  });
});

describe('the QE1-3 real case: same model on both sides, explicitly hypothesis-parameter, is NOT circular', () => {
  it('classifies as EMPIRICAL_TEST — a same-solver parameter inquiry is legitimate, not C1-circular', () => {
    const result = assessSingleTautology({
      componentId: 'qe1-maxCHSH-real',
      prediction: { source: 'hypothesis-parameter', modelId: 'quantum-entanglement-measures', rationale: 'this hypothesis\'s claimed visibility, run through the model' },
      observation: { source: 'hypothesis-parameter', modelId: 'quantum-entanglement-measures', rationale: 'the system\'s real (hidden) visibility, run through the same model' },
    });
    expect(result.classification).toBe('EMPIRICAL_TEST');
  });
});

describe('assessTautology aggregation — every non-empty combination of the three per-component outcomes', () => {
  const CONSISTENCY: TautologyComponent = TSIRELSON_PREDICTION;
  const EMPIRICAL: TautologyComponent = {
    componentId: 'empirical',
    prediction: { source: 'hypothesis-parameter', modelId: 'm', rationale: 'r' },
    observation: { source: 'independent-measurement', modelId: 'n', rationale: 'r2' },
  };
  const UNKNOWN: TautologyComponent = { componentId: 'unknown', prediction: null, observation: null };

  it('all CONSISTENCY_CHECK -> CONSISTENCY_CHECK', () => {
    expect(assessTautology([CONSISTENCY, CONSISTENCY]).classification).toBe('CONSISTENCY_CHECK');
  });
  it('all EMPIRICAL_TEST -> EMPIRICAL_TEST', () => {
    expect(assessTautology([EMPIRICAL, EMPIRICAL]).classification).toBe('EMPIRICAL_TEST');
  });
  it('all UNTESTABLE -> UNTESTABLE', () => {
    expect(assessTautology([UNKNOWN, UNKNOWN]).classification).toBe('UNTESTABLE');
  });
  it('CONSISTENCY_CHECK + EMPIRICAL_TEST -> MIXED_TEST', () => {
    expect(assessTautology([CONSISTENCY, EMPIRICAL]).classification).toBe('MIXED_TEST');
  });
  it('CONSISTENCY_CHECK + UNTESTABLE (no confirmed empirical part) -> UNTESTABLE, not MIXED_TEST', () => {
    expect(assessTautology([CONSISTENCY, UNKNOWN]).classification).toBe('UNTESTABLE');
  });
  it('EMPIRICAL_TEST + UNTESTABLE -> EMPIRICAL_TEST (the confirmed empirical part stands)', () => {
    expect(assessTautology([EMPIRICAL, UNKNOWN]).classification).toBe('EMPIRICAL_TEST');
  });
  it('all three together -> MIXED_TEST (a confirmed empirical part and a confirmed consistency part both exist)', () => {
    expect(assessTautology([CONSISTENCY, EMPIRICAL, UNKNOWN]).classification).toBe('MIXED_TEST');
  });
  it('empty component list -> UNTESTABLE, never a silent default', () => {
    expect(assessTautology([]).classification).toBe('UNTESTABLE');
  });
});

describe('evidenceCeiling — the one function a caller needs to honor "consistency check never raises confidence"', () => {
  it('MIXED_TEST is uncapped at the aggregate level — caller must consult per-component classifications instead', () => {
    expect(evidenceCeiling('MIXED_TEST')).toBeNull();
  });
});
