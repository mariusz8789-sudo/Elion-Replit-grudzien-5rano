/**
 * E2E tests for the Scientific Backend Executor adapter.
 *
 * These tests verify that:
 * 1. A preregistered ScientificExperimentDesign on a BACKEND_REAL_ENGINE model
 *    can be executed via the async backend Fabric path.
 * 2. Every arm produces a real ExperimentRun with backend provenance.
 * 3. Fingerprints are evaluated for determinism (MATCH / DRIFT).
 * 4. The returned ScientificEvidenceChain carries createdFromRealRunsOnly: true.
 * 5. The adapter rejects ENGINE_NOT_AVAILABLE, local REAL_ENGINE, and
 *    HYPOTHETICAL_VISUALIZATION models at admission.
 * 6. designScientificExperiment now accepts BACKEND_REAL_ENGINE domains.
 * 7. Evidence Pack can be created from the backend chain.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  designScientificExperiment,
  executeScientificExperimentOnBackend,
  isBackendDiscoveryDesign,
  createScientificEvidencePack,
  createBackendReplayReceipt,
  serializeBackendReplayReceipt,
  BACKEND_REPLAY_RECEIPT_VERSION,
  SCIENTIFIC_BACKEND_EXECUTOR_VERSION,
} from '../core/experimentFabric';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function makeBackendRun(overrides: {
  runId: string;
  modelId: string;
  modelVersion: string;
  domain: string;
  outputs: Record<string, number | string | boolean>;
  units: Record<string, string>;
  provenance: Record<string, string>;
}) {
  return {
    engine: 'genesis-compute@1.0.0',
    status: 'ok',
    deterministic: true,
    warnings: [],
    validity: 'Model-specific validity.',
    assumptions: ['Bounded model.'],
    ...overrides,
  };
}

// Gaussian backend run fixture (math-gaussian, BACKEND_REAL_ENGINE)
const gaussianRun = makeBackendRun({
  runId: '0aa4e400-0000-4000-8000-000000000018',
  modelId: 'math-gaussian',
  modelVersion: '1.0.0',
  domain: 'mathematics',
  outputs: { zScore: 1, pdfValue: 0.24197072451914337, probWithinZ: 0.6826894723352726 },
  units: { zScore: '', pdfValue: '', probWithinZ: '' },
  provenance: {
    source: 'core/modelGraph/gaussianGraph.ts',
    formula: 'f(x)=exp(−½z²)/(σ√2π), P=erf(|z|/√2)',
    honesty: 'exact',
    engine: 'Genesis ModelGraph (math-gaussian)',
    requiredEnvironmentVariable: 'not-required',
  },
});

// Lorentz backend run fixture (sr-lorentz, BACKEND_REAL_ENGINE)
const lorentzRun = makeBackendRun({
  runId: '0aa4e400-0000-4000-8000-000000000022',
  modelId: 'sr-lorentz',
  modelVersion: '1.0.0',
  domain: 'spacetime',
  outputs: { lorentzGammaFactor: 1.666666666666667, dilatedTimeSeconds: 1.666666666666667, contractedLengthMeters: 0.6 },
  units: { lorentzGammaFactor: '', dilatedTimeSeconds: 's', contractedLengthMeters: 'm' },
  provenance: {
    source: 'core/physics.ts:lorentzGamma',
    formula: 'γ = 1/√(1−β²)',
    honesty: 'exact',
    engine: 'Genesis ModelGraph (sr-lorentz)',
    requiredEnvironmentVariable: 'not-required',
  },
});

// Kepler backend run fixture (universe-kepler, BACKEND_REAL_ENGINE)
const keplerRun = makeBackendRun({
  runId: '0aa4e400-0000-4000-8000-000000000023',
  modelId: 'universe-kepler',
  modelVersion: '1.0.0',
  domain: 'universe',
  outputs: { orbitalPeriodYears: 2.8284271247461903, orbitalSpeedAuPerYear: 4.442882938158366, relativeTidalStrength: 0.125 },
  units: { orbitalPeriodYears: 'yr', orbitalSpeedAuPerYear: 'AU/yr', relativeTidalStrength: '' },
  provenance: {
    source: 'core/modelGraph/orbitalGraph.ts',
    formula: 'T = √(a³/M) [yr, AU, M☉]',
    honesty: 'exact',
    engine: 'Genesis ModelGraph (universe-kepler)',
    requiredEnvironmentVariable: 'not-required',
  },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SCIENTIFIC_BACKEND_EXECUTOR_VERSION', () => {
  it('exports a stable version string', () => {
    expect(SCIENTIFIC_BACKEND_EXECUTOR_VERSION).toBe('1.0.0');
  });
});

describe('designScientificExperiment — BACKEND_REAL_ENGINE admission', () => {
  it('accepts a BACKEND_REAL_ENGINE domain (mathematics / math-gaussian)', () => {
    const design = designScientificExperiment({
      hypothesis: {
        statement: 'W granicach modelu Gaussa wartość PDF maleje monotonicznie wraz ze wzrostem |z|.',
        domainId: 'mathematics',
        modelId: 'math-gaussian',
        declaredAssumptions: [],
        falsification: {
          metric: 'pdfValue',
          relation: 'monotonic-decrease',
          rationale: 'PDF rozkładu normalnego maleje symetrycznie od centrum.',
        },
      },
      baselineRequest: { domainId: 'mathematics', modelId: 'math-gaussian', parameters: { mean: 0, sigma: 1, xValue: 0 }, contractVersion: '1.0.0', operation: 'compute', sourceText: 'Prerejestrowany protokół Gaussian Discovery.' },
      sweep: { parameter: 'xValue', values: [0, 1, 2], label: 'x' },
      repetitionsPerArm: 1,
    });
    expect(design.hypothesis.assessment).toBe('CANDIDATE');
    expect(design.arms.length).toBeGreaterThanOrEqual(2);
    expect(design.protocolFingerprint).toMatch(/^protocol_/);
  });

  it('rejects a KNOWLEDGE_ONLY domain (discovery-timeline)', () => {
    expect(() =>
      designScientificExperiment({
        hypothesis: {
          statement: 'Test.',
          domainId: 'discovery-timeline',
          modelId: 'universe-kepler',
          declaredAssumptions: [],
          falsification: { metric: 'orbitalPeriodYears', relation: 'greater-than', rationale: 'Test.' },
        },
        baselineRequest: { domainId: 'discovery-timeline', modelId: 'universe-kepler', parameters: {}, contractVersion: '1.0.0', operation: 'compute', sourceText: 'Prerejestrowany protokół testowy.' },
        sweep: { parameter: 'centralMassSolar', values: [1, 2], label: 'M' },
      }),
    ).toThrow('REAL_ENGINE or BACKEND_REAL_ENGINE');
  });

  it('rejects a HYPOTHETICAL_VISUALIZATION domain (historical-legends)', () => {
    expect(() =>
      designScientificExperiment({
        hypothesis: {
          statement: 'Test.',
          domainId: 'historical-legends',
          modelId: 'math-gaussian',
          declaredAssumptions: [],
          falsification: { metric: 'pdfValue', relation: 'greater-than', rationale: 'Test.' },
        },
        baselineRequest: { domainId: 'historical-legends', modelId: 'math-gaussian', parameters: {}, contractVersion: '1.0.0', operation: 'compute', sourceText: 'Prerejestrowany protokół testowy.' },
        sweep: { parameter: 'xValue', values: [0, 1], label: 'x' },
      }),
    ).toThrow('REAL_ENGINE or BACKEND_REAL_ENGINE');
  });
});

describe('isBackendDiscoveryDesign', () => {
  it('returns true for a design whose arms target BACKEND_REAL_ENGINE models', () => {
    const design = designScientificExperiment({
      hypothesis: {
        statement: 'Test.',
        domainId: 'mathematics',
        modelId: 'math-gaussian',
        declaredAssumptions: [],
        falsification: { metric: 'pdfValue', relation: 'monotonic-decrease', rationale: 'Test.' },
      },
      baselineRequest: { domainId: 'mathematics', modelId: 'math-gaussian', parameters: { mean: 0, sigma: 1, xValue: 0 }, contractVersion: '1.0.0', operation: 'compute', sourceText: 'Prerejestrowany protokół Gaussian Discovery.' },
      sweep: { parameter: 'xValue', values: [0, 1], label: 'x' },
      repetitionsPerArm: 1,
    });
    expect(isBackendDiscoveryDesign(design)).toBe(true);
  });

  it('returns false for a design whose arms target local REAL_ENGINE models', () => {
    const design = designScientificExperiment({
      hypothesis: {
        statement: 'Test.',
        domainId: 'classical-mechanics',
        modelId: 'universe-lorenz-attractor',
        declaredAssumptions: [],
        falsification: { metric: 'finalSeparation', relation: 'greater-than', expectedValue: 0, rationale: 'Test.' },
      },
      baselineRequest: { domainId: 'classical-mechanics', modelId: 'universe-lorenz-attractor', parameters: { rho: 20, horizonTime: 2, divergence: true }, contractVersion: '1.0.0', operation: 'compute', sourceText: 'Prerejestrowany protokół Lorenza.' },
      sweep: { parameter: 'rho', values: [20, 28], label: 'ρ' },
      repetitionsPerArm: 1,
    });
    expect(isBackendDiscoveryDesign(design)).toBe(false);
  });
});

describe('executeScientificExperimentOnBackend — Gaussian (math-gaussian)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('executes a preregistered Gaussian protocol and returns a ScientificEvidenceChain', async () => {
    let runNumber = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      runNumber += 1;
      const run = { ...gaussianRun, runId: `gaussian-repeat-${String(runNumber).padStart(3, '0')}` };
      return Promise.resolve(fakeResponse({ contractVersion: '1.0.0', request: {}, run, persisted: false }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const design = designScientificExperiment({
      hypothesis: {
        statement: 'W granicach modelu Gaussa wartość PDF maleje monotonicznie wraz ze wzrostem |z|.',
        domainId: 'mathematics',
        modelId: 'math-gaussian',
        declaredAssumptions: [],
        falsification: {
          metric: 'pdfValue',
          relation: 'monotonic-decrease',
          rationale: 'PDF rozkładu normalnego maleje symetrycznie od centrum.',
        },
      },
      baselineRequest: { domainId: 'mathematics', modelId: 'math-gaussian', parameters: { mean: 0, sigma: 1, xValue: 0 }, contractVersion: '1.0.0', operation: 'compute', sourceText: 'Prerejestrowany protokół Gaussian Discovery.' },
      sweep: { parameter: 'xValue', values: [0, 1, 2], label: 'x' },
      repetitionsPerArm: 2,
    });

    const chain = await executeScientificExperimentOnBackend(design);

    expect(chain.createdFromRealRunsOnly).toBe(true);
    expect(chain.contractVersion).toBe('1.0.0');
    expect(chain.evidenceId).toMatch(/^evidence_backend_/);
    expect(chain.provenanceFingerprint).toMatch(/^evidence_backend_/);
    expect(chain.design.designId).toBe(design.designId);
    expect(chain.arms.length).toBe(design.arms.length);
    expect(chain.allRuns.length).toBe(design.arms.length * design.repetitionsPerArm);
    expect(chain.allRuns.every((run) => run.result.status === 'completed')).toBe(true);
    expect(chain.allRuns.every((run) => run.provenance.resultOrigin === 'real-engine')).toBe(true);
    expect(chain.allRuns.every((run) => Boolean(run.provenance.backendExecution?.backendRunId))).toBe(true);
    expect(new Set(chain.allRuns.map((run) => run.runId)).size).toBe(chain.allRuns.length);
    expect(chain.arms.every((arm) => arm.reproduction === 'MATCH')).toBe(true);
  });

  it('carries backend engine provenance in every run', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse({ contractVersion: '1.0.0', request: {}, run: gaussianRun, persisted: false }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const design = designScientificExperiment({
      hypothesis: {
        statement: 'Test provenance.',
        domainId: 'mathematics',
        modelId: 'math-gaussian',
        declaredAssumptions: [],
        falsification: { metric: 'pdfValue', relation: 'monotonic-decrease', rationale: 'Test.' },
      },
      baselineRequest: { domainId: 'mathematics', modelId: 'math-gaussian', parameters: { mean: 0, sigma: 1, xValue: 0 }, contractVersion: '1.0.0', operation: 'compute', sourceText: 'Prerejestrowany protokół Gaussian Discovery.' },
      sweep: { parameter: 'xValue', values: [0, 1], label: 'x' },
      repetitionsPerArm: 1,
    });

    const chain = await executeScientificExperimentOnBackend(design);

    for (const run of chain.allRuns) {
      expect(run.provenance.backendExecution?.backendRunId).toBe(gaussianRun.runId);
      expect(run.provenance.backendExecution?.backendEngine).toContain('genesis-compute');
    }
  });

  it('produces a valid Evidence Pack from the backend chain', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse({ contractVersion: '1.0.0', request: {}, run: gaussianRun, persisted: false }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const design = designScientificExperiment({
      hypothesis: {
        statement: 'Test Evidence Pack.',
        domainId: 'mathematics',
        modelId: 'math-gaussian',
        declaredAssumptions: [],
        falsification: { metric: 'pdfValue', relation: 'monotonic-decrease', rationale: 'Test.' },
      },
      baselineRequest: { domainId: 'mathematics', modelId: 'math-gaussian', parameters: { mean: 0, sigma: 1, xValue: 0 }, contractVersion: '1.0.0', operation: 'compute', sourceText: 'Prerejestrowany protokół Gaussian Discovery.' },
      sweep: { parameter: 'xValue', values: [0, 1], label: 'x' },
      repetitionsPerArm: 1,
    });

    const chain = await executeScientificExperimentOnBackend(design);
    const pack = createScientificEvidencePack(chain);

    expect(pack.runCount).toBe(chain.allRuns.length);
    expect(pack.reproducibility.allArmsMatched).toBe(true);
    expect(pack.evidencePackId).toMatch(/^pack_/);
    expect(pack.protocol.designId).toBe(design.designId);
  });
});

describe('Backend Replay Receipt', () => {
  afterEach(() => vi.unstubAllGlobals());

  function gaussianReplayDesign() {
    return designScientificExperiment({
      hypothesis: {
        statement: 'Replay receipt porównuje wyłącznie zgodność backendowego wykonania prerejestrowanego protokołu Gaussa.',
        domainId: 'mathematics',
        modelId: 'math-gaussian',
        declaredAssumptions: [],
        falsification: { metric: 'pdfValue', relation: 'monotonic-decrease', rationale: 'Kontrakt replay nie formułuje nowej hipotezy.' },
      },
      baselineRequest: { domainId: 'mathematics', modelId: 'math-gaussian', parameters: { mean: 0, sigma: 1, xValue: 0 }, contractVersion: '1.0.0', operation: 'compute', sourceText: 'Prerejestrowany backendowy replay receipt.' },
      sweep: { parameter: 'xValue', values: [0, 1], label: 'x' },
      repetitionsPerArm: 1,
    });
  }

  it('records MATCH only for a semantically equal real backend rerun and keeps invocation IDs distinct', async () => {
    let callNumber = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      callNumber += 1;
      const run = { ...gaussianRun, runId: `receipt-match-${String(callNumber).padStart(3, '0')}` };
      return Promise.resolve(fakeResponse({ contractVersion: '1.0.0', request: {}, run, persisted: false }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const design = gaussianReplayDesign();
    const source = await executeScientificExperimentOnBackend(design);
    const replay = await executeScientificExperimentOnBackend(design);
    const receipt = createBackendReplayReceipt(source, replay);

    expect(BACKEND_REPLAY_RECEIPT_VERSION).toBe('1.0.0');
    expect(receipt.status).toBe('MATCH');
    expect(receipt.armReceipts).toHaveLength(design.arms.length);
    expect(receipt.armReceipts.every((arm) => arm.status === 'MATCH')).toBe(true);
    expect(receipt.armReceipts.every((arm) => arm.sourceRunIds[0] !== arm.replayRunIds[0])).toBe(true);
    expect(receipt.receiptId).toMatch(/^replay_/);
    expect(serializeBackendReplayReceipt(receipt)).toBe(serializeBackendReplayReceipt(receipt));
    expect(receipt.disclaimer).toContain('nie oznacza niezależnej replikacji');
  });

  it('records DRIFT when a completed backend rerun has a different semantic outcome', async () => {
    let callNumber = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      callNumber += 1;
      const isReplay = callNumber > 2;
      const run = {
        ...gaussianRun,
        runId: `receipt-drift-${String(callNumber).padStart(3, '0')}`,
        outputs: isReplay ? { ...gaussianRun.outputs, pdfValue: 0.123456789 } : gaussianRun.outputs,
      };
      return Promise.resolve(fakeResponse({ contractVersion: '1.0.0', request: {}, run, persisted: false }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const design = gaussianReplayDesign();
    const source = await executeScientificExperimentOnBackend(design);
    const replay = await executeScientificExperimentOnBackend(design);
    const receipt = createBackendReplayReceipt(source, replay);

    expect(receipt.status).toBe('DRIFT');
    expect(receipt.armReceipts.some((arm) => arm.status === 'DRIFT')).toBe(true);
  });
});

describe('executeScientificExperimentOnBackend — Kepler orbit (universe-kepler)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('executes a preregistered Kepler protocol and assesses monotonic-increase', async () => {
    // Kepler: orbitalPeriodYears increases with orbitalRadiusAu
    const keplerRun1 = { ...keplerRun, outputs: { ...keplerRun.outputs, orbitalPeriodYears: 1 } };
    const keplerRun2 = { ...keplerRun, outputs: { ...keplerRun.outputs, orbitalPeriodYears: 2.83 } };
    const keplerRun3 = { ...keplerRun, outputs: { ...keplerRun.outputs, orbitalPeriodYears: 5.2 } };

    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      const run = [keplerRun1, keplerRun2, keplerRun3][callCount++] ?? keplerRun3;
      return Promise.resolve(fakeResponse({ contractVersion: '1.0.0', request: {}, run, persisted: false }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const design = designScientificExperiment({
      hypothesis: {
        statement: 'W granicach modelu Keplera okres orbitalny rośnie monotonicznie z odległością.',
        domainId: 'classical-mechanics',
        modelId: 'universe-kepler',
        declaredAssumptions: [],
        falsification: {
          metric: 'orbitalPeriodYears',
          relation: 'monotonic-increase',
          rationale: 'Trzecie prawo Keplera: T² ∝ a³.',
        },
      },
      baselineRequest: { domainId: 'classical-mechanics', modelId: 'universe-kepler', parameters: { centralMassSolar: 1, orbitalRadiusAu: 1 }, contractVersion: '1.0.0', operation: 'compute', sourceText: 'Prerejestrowany protokół Keplera.' },
      sweep: { parameter: 'orbitalRadiusAu', values: [1, 2, 4], label: 'a (AU)' },
      repetitionsPerArm: 1,
    });

    const chain = await executeScientificExperimentOnBackend(design);

    expect(chain.createdFromRealRunsOnly).toBe(true);
    expect(chain.assessment.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
    expect(chain.assessment.message).toContain('nie jest odkrycie');
    expect(chain.allRuns.every((run) => run.provenance.resultOrigin === 'real-engine')).toBe(true);
  });
});

describe('executeScientificExperimentOnBackend — Lorentz (sr-lorentz)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('executes a preregistered Lorentz protocol and assesses monotonic-increase of gamma', async () => {
    const lorentzRun1 = { ...lorentzRun, outputs: { ...lorentzRun.outputs, lorentzGammaFactor: 1.005 } };
    const lorentzRun2 = { ...lorentzRun, outputs: { ...lorentzRun.outputs, lorentzGammaFactor: 1.155 } };
    const lorentzRun3 = { ...lorentzRun, outputs: { ...lorentzRun.outputs, lorentzGammaFactor: 1.667 } };

    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      const run = [lorentzRun1, lorentzRun2, lorentzRun3][callCount++] ?? lorentzRun3;
      return Promise.resolve(fakeResponse({ contractVersion: '1.0.0', request: {}, run, persisted: false }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const design = designScientificExperiment({
      hypothesis: {
        statement: 'W granicach modelu Lorentza czynnik γ rośnie monotonicznie wraz z β.',
        domainId: 'spacetime-einstein',
        modelId: 'sr-lorentz',
        declaredAssumptions: [],
        falsification: {
          metric: 'lorentzGammaFactor',
          relation: 'monotonic-increase',
          rationale: 'γ = 1/√(1−β²) rośnie monotonicznie dla β ∈ (0,1).',
        },
      },
      baselineRequest: { domainId: 'spacetime-einstein', modelId: 'sr-lorentz', parameters: { velocityFraction: 0.1 }, contractVersion: '1.0.0', operation: 'compute', sourceText: 'Prerejestrowany protokół Lorentza.' },
      sweep: { parameter: 'velocityFraction', values: [0.1, 0.5, 0.8], label: 'β' },
      repetitionsPerArm: 1,
    });

    const chain = await executeScientificExperimentOnBackend(design);

    expect(chain.createdFromRealRunsOnly).toBe(true);
    expect(chain.assessment.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
    expect(chain.allRuns.every((run) => run.provenance.resultOrigin === 'real-engine')).toBe(true);
  });
});

describe('executeScientificExperimentOnBackend — admission rejection', () => {
  it('rejects a design with a local REAL_ENGINE model (universe-lorenz-attractor)', async () => {
    const design = designScientificExperiment({
      hypothesis: {
        statement: 'Test.',
        domainId: 'classical-mechanics',
        modelId: 'universe-lorenz-attractor',
        declaredAssumptions: [],
        falsification: { metric: 'finalSeparation', relation: 'greater-than', expectedValue: 0, rationale: 'Test.' },
      },
      baselineRequest: { domainId: 'classical-mechanics', modelId: 'universe-lorenz-attractor', parameters: { rho: 20, horizonTime: 2, divergence: true }, contractVersion: '1.0.0', operation: 'compute', sourceText: 'Prerejestrowany protokół Lorenza.' },
      sweep: { parameter: 'rho', values: [20, 28], label: 'ρ' },
      repetitionsPerArm: 1,
    });

    await expect(executeScientificExperimentOnBackend(design)).rejects.toThrow('Admission rejected');
  });

  it('rejects a design arm with no modelId', async () => {
    const design = designScientificExperiment({
      hypothesis: {
        statement: 'Test.',
        domainId: 'mathematics',
        modelId: 'math-gaussian',
        declaredAssumptions: [],
        falsification: { metric: 'pdfValue', relation: 'monotonic-decrease', rationale: 'Test.' },
      },
      baselineRequest: { domainId: 'mathematics', modelId: 'math-gaussian', parameters: { mean: 0, sigma: 1, xValue: 0 }, contractVersion: '1.0.0', operation: 'compute', sourceText: 'Prerejestrowany protokół Gaussian Discovery.' },
      sweep: { parameter: 'xValue', values: [0, 1], label: 'x' },
      repetitionsPerArm: 1,
    });

    // Mutate a copy to remove modelId from one arm
    const brokenDesign = {
      ...design,
      arms: design.arms.map((arm, index) =>
        index === 0 ? { ...arm, request: { ...arm.request, modelId: undefined as unknown as string } } : arm,
      ),
    };

    await expect(executeScientificExperimentOnBackend(brokenDesign)).rejects.toThrow('Admission rejected');
  });
});

describe('executeScientificExperimentOnBackend — backend error propagation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('marks arm as NOT_EXECUTED when backend returns an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(fakeResponse({ error: 'BACKEND_UNAVAILABLE', message: 'Compute node offline.' }, 503)),
    );

    const design = designScientificExperiment({
      hypothesis: {
        statement: 'Test error propagation.',
        domainId: 'mathematics',
        modelId: 'math-gaussian',
        declaredAssumptions: [],
        falsification: { metric: 'pdfValue', relation: 'monotonic-decrease', rationale: 'Test.' },
      },
      baselineRequest: { domainId: 'mathematics', modelId: 'math-gaussian', parameters: { mean: 0, sigma: 1, xValue: 0 }, contractVersion: '1.0.0', operation: 'compute', sourceText: 'Prerejestrowany protokół Gaussian Discovery.' },
      sweep: { parameter: 'xValue', values: [0, 1], label: 'x' },
      repetitionsPerArm: 1,
    });

    const chain = await executeScientificExperimentOnBackend(design);

    expect(chain.createdFromRealRunsOnly).toBe(true);
    expect(chain.assessment.assessment).toBe('INCONCLUSIVE');
    expect(chain.arms.some((arm) => arm.reproduction === 'NOT_EXECUTED')).toBe(true);
    expect(chain.arms.some((arm) => arm.anomalyFlags.some((flag) => flag.startsWith('BACKEND_EXECUTION_ERROR')))).toBe(true);
  });
});
