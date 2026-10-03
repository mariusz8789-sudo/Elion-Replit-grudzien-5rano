import { describe, expect, it } from 'vitest';
import { buildDecisionTrace, DECISION_TRACE_VERSION, type DecisionTraceInput } from '../core/metaCognition/decisionTrace';
// @ts-expect-error — plain .mjs module without types
import * as backend from '../../../backend/src/decisionTrace.mjs';

/**
 * packages/backend/src/decisionTrace.mjs is a hand-written twin of core/metaCognition/decisionTrace.ts
 * (the backend cannot import TypeScript). Until one of them is generated from the other, this test is
 * the guard: the same decision must produce the same contract version and fingerprint on both sides,
 * and both sides must refuse the same invalid records.
 */
const base: DecisionTraceInput = {
  decisionId: 'decision-twin-1',
  summary: 'Selected the RDKit descriptor engine for the frozen input.',
  evidenceRefs: [{ id: 'science_run:abc', contentHash: 'h1' }],
  alternatives: [
    { id: 'rdkit', status: 'SELECTED' },
    { id: 'xtb', status: 'REJECTED', rejectedReasonCode: 'UNAVAILABLE' },
    { id: 'pyscf', status: 'NOT_EVALUATED' },
  ],
  selectedCapability: 'molecular-descriptors',
  inputClassification: 'FROZEN_INPUT',
  outputClassification: 'SIMULATED',
};

describe('DecisionTrace backend twin', () => {
  it('shares the contract version', () => {
    expect(backend.DECISION_TRACE_VERSION).toBe(DECISION_TRACE_VERSION);
  });

  it('fingerprints the same decision identically, with and without optional fields', () => {
    const samples: DecisionTraceInput[] = [
      base,
      { ...base, solverId: 'rdkit', solverVersion: '2024.03', suggestedNextExperiment: 'replay' },
      { ...base, alternatives: [{ id: 'none', status: 'REJECTED', rejectedReasonCode: 'OUT_OF_SCOPE' }], blockedReason: 'NO_ENGINE' },
    ];
    for (const input of samples) {
      expect(backend.buildDecisionTrace(input).traceFingerprint).toBe(buildDecisionTrace(input).traceFingerprint);
    }
  });

  it('refuses the same invalid records', () => {
    const invalid: DecisionTraceInput[] = [
      { ...base, summary: 'I think this is right.' },
      { ...base, summary: 'x'.repeat(401) },
      { ...base, alternatives: [{ id: 'a', status: 'SELECTED' }, { id: 'b', status: 'SELECTED' }] },
      { ...base, alternatives: [{ id: 'a', status: 'REJECTED' }] },
    ];
    for (const input of invalid) {
      expect(() => buildDecisionTrace(input)).toThrow(/DECISION_TRACE_REJECTED/);
      expect(() => backend.buildDecisionTrace(input)).toThrow(/DECISION_TRACE_REJECTED/);
    }
  });
});
