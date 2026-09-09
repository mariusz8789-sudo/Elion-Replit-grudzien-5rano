import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createRealExperimentRun,
  type DerivedMeasurement,
  type RawMeasurement,
  type RealExperimentRequest,
} from '../core/experimentFabric/realExperiment';
import type { StructuredExperimentRequest } from '../core/experimentFabric/types';
import { createScientificEvidencePack } from '../core/experimentFabric/evidencePack';
import type { ScientificEvidenceChain } from '../core/experimentFabric/scientificDiscovery';

function makeFakeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

const structuredRequest: StructuredExperimentRequest = {
  contractVersion: '1.0.0',
  sourceText: 'zmierz przeżywalność komórek po dawce X w warunkach realnego laboratorium',
  domainId: 'cell-culture',
  operation: 'compute',
  modelId: 'cell-culture-real-assay',
  parameters: { doseUm: 5 },
};

function makeRequest(overrides?: Partial<RealExperimentRequest>): RealExperimentRequest {
  return {
    structuredRequest,
    physicalProtocolRef: 'protocol:cell-viability-assay-v1',
    ...overrides,
  };
}

function makeRaw(channel: string, value: number): RawMeasurement {
  return { channel, value, unit: 'a.u.', capturedAt: '2026-09-09T00:00:00.000Z' };
}

describe('createRealExperimentRun — the seam a later real result enters through', () => {
  it('produces a run honestly tagged REAL_EXPERIMENTAL, never SIMULATED', () => {
    const derived: DerivedMeasurement[] = [
      { outputKey: 'viabilityFraction', value: 0.62, unit: 'fraction', derivedFrom: [makeRaw('od600', 0.31), makeRaw('od600-control', 0.5)] },
    ];
    const run = createRealExperimentRun({ request: makeRequest(), derived, summary: 'Real cell-viability assay, dose 5 uM.' });

    expect(run.provenance.dataProvenance).toBe('REAL_EXPERIMENTAL');
    expect(run.provenance.dataProvenance).not.toBe('SIMULATED');
    // Honest reuse: a real measurement is even more legitimately "not a parser or LLM"
    // than a solver run, so it participates in every existing real-engine gate unchanged.
    expect(run.provenance.resultOrigin).toBe('real-engine');
    expect(run.result.status).toBe('completed');
  });

  it('derived measurements land in ExperimentResult.outputs unchanged — no new consumer shape needed', () => {
    const derived: DerivedMeasurement[] = [
      { outputKey: 'viabilityFraction', value: 0.62, unit: 'fraction', derivedFrom: [makeRaw('od600', 0.31)] },
      { outputKey: 'cellCount', value: 184000, unit: 'cells/mL', derivedFrom: [makeRaw('hemocytometer', 184000)] },
    ];
    const run = createRealExperimentRun({ request: makeRequest(), derived, summary: 'Two-channel assay.' });

    expect(run.result.outputs).toEqual({ viabilityFraction: 0.62, cellCount: 184000 });
    expect(run.result.units).toEqual({ viabilityFraction: 'fraction', cellCount: 'cells/mL' });
  });

  it('raw measurement lineage is not decorative — changing it changes the run fingerprint', () => {
    const derived = (rawValue: number): DerivedMeasurement[] => [
      { outputKey: 'viabilityFraction', value: 0.62, unit: 'fraction', derivedFrom: [makeRaw('od600', rawValue)] },
    ];
    const runA = createRealExperimentRun({ request: makeRequest(), derived: derived(0.31), summary: 'Assay.' });
    const runB = createRealExperimentRun({ request: makeRequest(), derived: derived(0.30), summary: 'Assay.' });

    // Same derived value, same summary, same request — only the RAW reading differs.
    expect(runA.result.outputs).toEqual(runB.result.outputs);
    expect(runA.runId).not.toBe(runB.runId);
    expect(runA.provenance.runFingerprint).not.toBe(runB.provenance.runFingerprint);
  });

  it('flows into a ScientificEvidencePack unchanged — no code in evidencePack.ts had to be touched', () => {
    const run = createRealExperimentRun({
      request: makeRequest(),
      derived: [{ outputKey: 'viabilityFraction', value: 0.62, unit: 'fraction', derivedFrom: [makeRaw('od600', 0.31)] }],
      summary: 'Real assay for Evidence Pack fixture.',
    });
    const criterion = { metric: 'viabilityFraction', relation: 'less-than' as const, expectedValue: 0.7, rationale: 'Dose 5 uM reduces viability below 0.7.' };
    const chain: ScientificEvidenceChain = {
      contractVersion: '1.0.0',
      evidenceId: 'evidence:real-experiment-fixture',
      design: {
        contractVersion: '1.0.0',
        designId: 'design:real-experiment-fixture',
        hypothesis: {
          contractVersion: '1.0.0',
          hypothesisId: 'hypothesis:real-experiment-fixture',
          statement: 'Dose 5 uM reduces viability below 0.7.',
          domainId: 'cell-culture',
          modelId: 'cell-culture-real-assay',
          assessment: 'CANDIDATE',
          knowledgeSources: [],
          declaredAssumptions: [],
          falsification: criterion,
          disclaimer: 'Fixture only.',
        },
        primaryMetric: 'viabilityFraction',
        arms: [],
        repetitionsPerArm: 1,
        protocolAssumptions: [],
        protocolFingerprint: 'proto_fixture',
      },
      arms: [],
      assessment: {
        assessment: 'SUPPORTED_WITHIN_PROTOCOL',
        message: 'Viability 0.62 < 0.7 threshold.',
        criterion,
        referenceRunIds: [run.runId],
      },
      allRuns: [run],
      provenanceFingerprint: 'chain_fixture',
      createdFromRealRunsOnly: true,
    };

    const pack = createScientificEvidencePack(chain);
    expect(pack.runs).toHaveLength(1);
    expect(pack.runs[0]!.provenance.dataProvenance).toBe('REAL_EXPERIMENTAL');
    expect(pack.runs[0]!.provenance.resultOrigin).toBe('real-engine');
  });
});

describe('a REAL_EXPERIMENTAL run reaches Scientific Memory without being mistaken for SIMULATED', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('saveExperimentRunToMemory preserves dataProvenance through the save/read round trip', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { saveExperimentRunToMemory, getExperiment } = await import('../core/scienceMemory');

    const run = createRealExperimentRun({
      request: makeRequest(),
      derived: [{ outputKey: 'viabilityFraction', value: 0.62, unit: 'fraction', derivedFrom: [makeRaw('od600', 0.31)] }],
      summary: 'Real assay saved to memory.',
    });

    const saved = saveExperimentRunToMemory(run);
    const record = getExperiment(saved.id);

    expect(record).not.toBeUndefined();
    expect(record!.execution?.dataProvenance).toBe('REAL_EXPERIMENTAL');
    expect(record!.execution?.resultOrigin).toBe('real-engine');
  });
});
