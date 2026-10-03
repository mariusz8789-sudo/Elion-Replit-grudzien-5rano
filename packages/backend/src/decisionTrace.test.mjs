import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildDecisionTrace, DECISION_TRACE_VERSION } from './decisionTrace.mjs';

const input = {
  decisionId: 'decision:run-1:exp-1:next',
  summary: 'NEXT_EXPERIMENT EXECUTE_NEXT_HYPOTHESIS; protocol verdict SUPPORTED_WITHIN_PROTOCOL; replay MATCH.',
  evidenceRefs: [{ id: 'execution:exp-1', contentHash: 'a'.repeat(64) }],
  alternatives: [
    { id: 'h-1', status: 'REJECTED', rejectedReasonCode: 'ALREADY_EXECUTED' },
    { id: 'h-2', status: 'SELECTED' },
  ],
  selectedCapability: 'rdkit',
  inputClassification: 'COMPUTATIONAL_RESULT',
  outputClassification: 'PROPOSED',
  solverId: 'GENESIS_FIXED_RULE',
  solverVersion: 'research-run-next-experiment@1',
  suggestedNextExperiment: 'h-2',
};

describe('backend DecisionTrace contract', () => {
  test('is deterministic and compatible with the D-141 shape', () => {
    const first = buildDecisionTrace(input);
    const second = buildDecisionTrace(JSON.parse(JSON.stringify(input)));
    assert.equal(first.contractVersion, DECISION_TRACE_VERSION);
    assert.equal(first.traceFingerprint, second.traceFingerprint);
    assert.match(first.traceFingerprint, /^trace_[0-9a-f]{8}$/);
    assert.deepEqual(first.alternatives, input.alternatives);
  });

  test('rejects multiple selected alternatives and rejected alternatives without a reason code', () => {
    assert.throws(() => buildDecisionTrace({ ...input, alternatives: input.alternatives.map((item) => ({ ...item, status: 'SELECTED', rejectedReasonCode: undefined })) }), /more than one SELECTED/);
    assert.throws(() => buildDecisionTrace({ ...input, alternatives: [{ id: 'h-1', status: 'REJECTED' }] }), /no reason code/);
  });

  test('refuses hidden-reasoning prose or a sentience claim', () => {
    assert.throws(() => buildDecisionTrace({ ...input, summary: 'I believe this because I am self-aware.' }), /prohibited summary pattern/);
  });
});
