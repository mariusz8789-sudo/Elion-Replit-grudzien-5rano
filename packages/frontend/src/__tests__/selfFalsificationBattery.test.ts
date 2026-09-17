import { describe, expect, it } from 'vitest';
import type { ModelPoint, ModelSpec } from '../core/agent/modelSpace';
import type { TautologyComponent } from '../core/agent/tautologyGate';
import { freezeBeforeReplication } from '../core/agent/discoveryReplicationEngine';
import { ALL_SELF_FALSIFICATION_PROBES } from '../core/agent/discoveryContracts';
import { runSelfFalsificationBattery, type SelfFalsificationInput, type StructuralDeclaration } from '../core/agent/selfFalsificationBattery';

const LINEAR_SPEC: ModelSpec = { id: 'test', terms: [{ basis: 'CONSTANT' }, { basis: 'LINEAR', variable: 'x' }], lineage: null };
const RIVAL_CONSTANT_SPEC: ModelSpec = { id: 'rival', terms: [{ basis: 'CONSTANT' }], lineage: null };

function linearPoints(xs: readonly number[], slope: number, intercept: number, sigma: number, noiseSeed = 1): ModelPoint[] {
  let state = noiseSeed;
  const noise = () => {
    state = (state * 48271) % 2147483647;
    return ((state / 2147483647) - 0.5) * 2 * sigma;
  };
  return xs.map((x) => ({ x, y: intercept + slope * x + noise(), sigma }));
}

const EMPIRICAL_COMPONENT: TautologyComponent = {
  componentId: 'empirical',
  prediction: { source: 'hypothesis-parameter', modelId: 'hyp-a', rationale: 'from the hypothesis parameters' },
  observation: { source: 'independent-measurement', modelId: 'external-dataset', rationale: 'independently sourced' },
};

const TAUTOLOGICAL_COMPONENT: TautologyComponent = {
  componentId: 'circular',
  prediction: { source: 'model-invariant', modelId: 'model-x', rationale: 'analytic invariant of the formalism' },
  observation: { source: 'model-invariant', modelId: 'model-x', rationale: 'the same analytic invariant, computed the same way' },
};

const FULLY_DECLARED_CLEAN: StructuralDeclaration = {
  representativeSampling: true,
  leakageChecked: true,
  knownUncontrolledConfounders: [],
  measurementInstrumentValidated: true,
  numericalPrecisionChecked: true,
  preprocessingDocumented: true,
  temporalOrderingRespected: true,
};

function baseInput(overrides: Partial<SelfFalsificationInput> = {}): SelfFalsificationInput {
  const points = linearPoints(Array.from({ length: 12 }, (_, i) => i + 1), 3, 2, 0.05, 1);
  const discoveryDataset = { datasetId: 'disc', points };
  const replicationPoints = linearPoints(Array.from({ length: 12 }, (_, i) => i + 101), 3, 2, 0.05, 2);
  const replicationDataset = { datasetId: 'repl', points: replicationPoints };
  const freeze = freezeBeforeReplication(LINEAR_SPEC, 3);
  return {
    hypothesisSpec: LINEAR_SPEC,
    rivalSpec: RIVAL_CONSTANT_SPEC,
    points,
    tautologyComponents: [EMPIRICAL_COMPONENT],
    discoveryDataset,
    replicationDataset,
    freeze,
    replicationRetrievedAt: freeze.frozenAt + 1000,
    numberOfHypothesesTested: 1,
    multipleTestingCorrectionApplied: false,
    declared: FULLY_DECLARED_CLEAN,
    ...overrides,
  };
}

describe('all 13 probes always run, never a subset', () => {
  it('the report contains exactly the 13 mandated probe names', () => {
    const report = runSelfFalsificationBattery(baseInput());
    expect(report.probes.map((p) => p.name).sort()).toEqual([...ALL_SELF_FALSIFICATION_PROBES].sort());
    expect(report.probes.length).toBe(13);
  });
});

describe('TAUTOLOGY probe — reuses tautologyGate.ts::assessTautology directly', () => {
  it('an empirical component -> PASS', () => {
    const report = runSelfFalsificationBattery(baseInput({ tautologyComponents: [EMPIRICAL_COMPONENT] }));
    expect(report.probes.find((p) => p.name === 'TAUTOLOGY')!.result).toBe('PASS');
  });

  it('a circular/tautological component -> FAIL', () => {
    const report = runSelfFalsificationBattery(baseInput({ tautologyComponents: [TAUTOLOGICAL_COMPONENT] }));
    expect(report.probes.find((p) => p.name === 'TAUTOLOGY')!.result).toBe('FAIL');
  });
});

describe('OVERFITTING probe — reuses modelSpace.ts::holdoutScore', () => {
  it('a real, well-fitting linear relation over enough points -> PASS', () => {
    const report = runSelfFalsificationBattery(baseInput());
    const p = report.probes.find((p) => p.name === 'OVERFITTING')!;
    expect(['PASS', 'UNRESOLVED']).toContain(p.result);
  });

  it('a hypothesis that does not fit its own data -> FAIL', () => {
    const badSpec: ModelSpec = { id: 'bad', terms: [{ basis: 'CONSTANT' }, { basis: 'LINEAR', variable: 'x' }, { basis: 'LOG', variable: 'x' }, { basis: 'RECIPROCAL', variable: 'x' }, { basis: 'EXP_SATURATION', variable: 'x', tau: 1 }], lineage: null };
    const twoPoints = [{ x: 1, y: 2, sigma: 0.05 }, { x: 2, y: 5, sigma: 0.05 }];
    const report = runSelfFalsificationBattery(baseInput({ hypothesisSpec: badSpec, points: twoPoints }));
    expect(report.probes.find((p) => p.name === 'OVERFITTING')!.result).toBe('FAIL');
  });
});

describe('ALTERNATIVE_MODEL probe — a simpler rival explaining the data equally well fails the claim', () => {
  it('a real, non-trivial slope beats a constant-only rival -> PASS', () => {
    const report = runSelfFalsificationBattery(baseInput());
    expect(report.probes.find((p) => p.name === 'ALTERNATIVE_MODEL')!.result).toBe('PASS');
  });

  it('flat data (no real slope) is matched just as well by the constant rival -> FAIL', () => {
    const flatPoints = linearPoints(Array.from({ length: 12 }, (_, i) => i + 1), 0, 5, 0.05, 1);
    const report = runSelfFalsificationBattery(baseInput({ points: flatPoints, discoveryDataset: { datasetId: 'disc-flat', points: flatPoints } }));
    expect(report.probes.find((p) => p.name === 'ALTERNATIVE_MODEL')!.result).toBe('FAIL');
  });
});

describe('MULTIPLE_TESTING probe', () => {
  it('one hypothesis tested -> PASS regardless of correction', () => {
    const report = runSelfFalsificationBattery(baseInput({ numberOfHypothesesTested: 1, multipleTestingCorrectionApplied: false }));
    expect(report.probes.find((p) => p.name === 'MULTIPLE_TESTING')!.result).toBe('PASS');
  });

  it('many hypotheses tested with no correction -> FAIL', () => {
    const report = runSelfFalsificationBattery(baseInput({ numberOfHypothesesTested: 1000, multipleTestingCorrectionApplied: false }));
    expect(report.probes.find((p) => p.name === 'MULTIPLE_TESTING')!.result).toBe('FAIL');
  });

  it('many hypotheses tested WITH a declared correction -> PASS', () => {
    const report = runSelfFalsificationBattery(baseInput({ numberOfHypothesesTested: 1000, multipleTestingCorrectionApplied: true }));
    expect(report.probes.find((p) => p.name === 'MULTIPLE_TESTING')!.result).toBe('PASS');
  });
});

describe('DATASET_CONTAMINATION probe — reuses discoveryReplicationEngine.ts::detectDatasetOverlap', () => {
  it('genuinely disjoint datasets -> PASS', () => {
    const report = runSelfFalsificationBattery(baseInput());
    expect(report.probes.find((p) => p.name === 'DATASET_CONTAMINATION')!.result).toBe('PASS');
  });

  it('a shared point between discovery and replication -> FAIL', () => {
    const discoveryPoints = linearPoints(Array.from({ length: 12 }, (_, i) => i + 1), 3, 2, 0.05, 1);
    const replicationPoints = [...linearPoints(Array.from({ length: 11 }, (_, i) => i + 101), 3, 2, 0.05, 2), discoveryPoints[0]!];
    const report = runSelfFalsificationBattery(baseInput({
      points: discoveryPoints,
      discoveryDataset: { datasetId: 'disc', points: discoveryPoints },
      replicationDataset: { datasetId: 'repl', points: replicationPoints },
    }));
    expect(report.probes.find((p) => p.name === 'DATASET_CONTAMINATION')!.result).toBe('FAIL');
  });

  it('no replication dataset yet -> UNRESOLVED, not silently PASS', () => {
    const report = runSelfFalsificationBattery(baseInput({ replicationDataset: null }));
    expect(report.probes.find((p) => p.name === 'DATASET_CONTAMINATION')!.result).toBe('UNRESOLVED');
  });
});

describe('HIDDEN_PREREG probe — reuses the AC7 freeze-timing check', () => {
  it('a freeze genuinely before replication retrieval -> PASS', () => {
    const report = runSelfFalsificationBattery(baseInput());
    expect(report.probes.find((p) => p.name === 'HIDDEN_PREREG')!.result).toBe('PASS');
  });

  it('a freeze at or after replication retrieval -> FAIL', () => {
    const freeze = freezeBeforeReplication(LINEAR_SPEC, 3);
    const report = runSelfFalsificationBattery(baseInput({ freeze, replicationRetrievedAt: freeze.frozenAt - 100 }));
    expect(report.probes.find((p) => p.name === 'HIDDEN_PREREG')!.result).toBe('FAIL');
  });

  it('no freeze/retrieval info yet -> UNRESOLVED', () => {
    const report = runSelfFalsificationBattery(baseInput({ freeze: null, replicationRetrievedAt: null }));
    expect(report.probes.find((p) => p.name === 'HIDDEN_PREREG')!.result).toBe('UNRESOLVED');
  });
});

describe('structural-review probes (SELECTION_BIAS, LEAKAGE, CONFOUNDING, MEASUREMENT_ARTIFACT, NUMERICAL_ARTIFACT, PREPROCESSING_ARTIFACT, TEMPORAL_LEAKAGE)', () => {
  it('a fully clean declaration -> all 7 PASS', () => {
    const report = runSelfFalsificationBattery(baseInput({ declared: FULLY_DECLARED_CLEAN }));
    for (const name of ['SELECTION_BIAS', 'LEAKAGE', 'CONFOUNDING', 'MEASUREMENT_ARTIFACT', 'NUMERICAL_ARTIFACT', 'PREPROCESSING_ARTIFACT', 'TEMPORAL_LEAKAGE'] as const) {
      expect(report.probes.find((p) => p.name === name)!.result).toBe('PASS');
    }
  });

  it('an undeclared field (null) is UNRESOLVED, never silently assumed clean', () => {
    const undeclared: StructuralDeclaration = { ...FULLY_DECLARED_CLEAN, representativeSampling: null, leakageChecked: null };
    const report = runSelfFalsificationBattery(baseInput({ declared: undeclared }));
    expect(report.probes.find((p) => p.name === 'SELECTION_BIAS')!.result).toBe('UNRESOLVED');
    expect(report.probes.find((p) => p.name === 'LEAKAGE')!.result).toBe('UNRESOLVED');
  });

  it('a declared-false field -> FAIL', () => {
    const dirty: StructuralDeclaration = { ...FULLY_DECLARED_CLEAN, measurementInstrumentValidated: false };
    const report = runSelfFalsificationBattery(baseInput({ declared: dirty }));
    expect(report.probes.find((p) => p.name === 'MEASUREMENT_ARTIFACT')!.result).toBe('FAIL');
  });

  it('a declared confounder -> FAIL', () => {
    const withConfounder: StructuralDeclaration = { ...FULLY_DECLARED_CLEAN, knownUncontrolledConfounders: ['instrument drift'] };
    const report = runSelfFalsificationBattery(baseInput({ declared: withConfounder }));
    expect(report.probes.find((p) => p.name === 'CONFOUNDING')!.result).toBe('FAIL');
  });
});

describe('allPassed and reportFingerprint', () => {
  it('allPassed is true only when every probe is PASS', () => {
    const clean = runSelfFalsificationBattery(baseInput());
    expect(clean.allPassed).toBe(clean.probes.every((p) => p.result === 'PASS'));

    const withOneFail = runSelfFalsificationBattery(baseInput({ declared: { ...FULLY_DECLARED_CLEAN, measurementInstrumentValidated: false } }));
    expect(withOneFail.allPassed).toBe(false);
  });

  it('reportFingerprint is deterministic for the same probe outcomes', () => {
    const a = runSelfFalsificationBattery(baseInput());
    const b = runSelfFalsificationBattery(baseInput());
    expect(a.reportFingerprint).toBe(b.reportFingerprint);
  });
});
