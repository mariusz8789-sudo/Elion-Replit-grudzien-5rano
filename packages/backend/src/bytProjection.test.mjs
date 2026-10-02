import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBytProjection, BYT_EPISTEMIC_STATES } from './bytProjection.mjs';

const chain = { ok: true, head: 'head-1', length: 7 };
const run = (events, integrity = { ok: true, head: 'head-1', events: events.length }) => ({
  run: { id: 'run-1', domain: 'genesis.research-run' }, researchStateEvents: events, integrity,
});

const frozen = {
  seq: 2, type: 'PREDICTIONS_FROZEN', payload: {
    researchRunId: 'run-1', experimentId: 'exp-1', hypothesisId: 'h-1', claim: 'logP > 3', engineId: 'rdkit',
    predictionFingerprint: 'pred-1', preregistrationFingerprint: 'prereg-1', preregistrationRecordId: 'record-1', inputHash: 'in-1',
    criteria: [{ id: 'c0-logp', observable: 'logP', operator: '>', value: 3, critical: true, surpriseRule: { kind: 'ABSOLUTE_ERROR_EXCEEDS', expectedValue: 4, tolerance: 1 } }],
  },
};

describe('BYT canonical projection', () => {
  test('projects Prediction Ledger, calibration and Necropolis without owning state', () => {
    const events = [
      frozen,
      { seq: 3, type: 'EXPERIMENT_HANDOFF', payload: { experimentId: 'exp-1', status: 'EXECUTED', inputHash: 'in-1', outputHash: 'out-1', engine: { engineId: 'rdkit' } } },
      { seq: 4, type: 'SELF_FALSIFICATION', payload: { experimentId: 'exp-1', verdict: 'FALSIFIED_WITHIN_PROTOCOL', scope: 'this protocol only', criteria: [{ id: 'c0-logp', observable: 'logP', operator: '>', value: 3, observed: 1.2, critical: true, status: 'NOT_MET', surpriseRule: { kind: 'ABSOLUTE_ERROR_EXCEEDS', expectedValue: 4, tolerance: 1 } }] } },
      { seq: 5, type: 'SURPRISE_DETECTED', payload: { experimentId: 'exp-1', hypothesisId: 'h-1', sealRecordId: 'seal-1', scienceRunId: 'science-1', outputHash: 'out-1', status: 'DETECTED', epistemicStatus: 'NOT_EVIDENCE', scope: 'frozen anomaly only', items: [{ criterionId: 'c0-logp', observable: 'logP', rule: { kind: 'ABSOLUTE_ERROR_EXCEEDS', expectedValue: 4, tolerance: 1 }, observedValue: 1.2, absoluteError: 2.8 }] } },
      { seq: 6, type: 'EVIDENCE_UPDATE', payload: { experimentId: 'exp-1', sealRecordId: 'seal-1', evidenceProposalId: 'ev-1', evidenceContentHash: 'ev-hash', status: 'PROPOSED', publication: 'REQUIRES_HUMAN_APPROVAL' } },
      { seq: 7, type: 'NEXT_EXPERIMENT', payload: { experimentId: 'exp-1', replay: { verdict: 'MATCH' }, proposal: { action: 'HUMAN_REVIEW' }, decisionTrace: { traceFingerprint: 'trace-1', selectedCapability: 'HUMAN_REVIEW' } } },
    ];
    const byt = buildBytProjection({
      runs: [run(events)],
      registry: { chain, gaps: [{ status: 'OPEN' }], contradictions: [{ status: 'UNRESOLVED' }], claims: [{ status: 'PROPOSED' }] },
      selfModel: { identity: { entityId: 'genesis' }, availableEngines: ['rdkit'], blockedEngines: [], missingCapabilities: [] },
    });
    assert.equal(byt.view, 'DERIVED_FROM_CANONICAL_STATE');
    assert.deepEqual(byt.epistemicVocabulary, BYT_EPISTEMIC_STATES);
    assert.equal(byt.predictionLedger.length, 1);
    assert.equal(byt.predictionLedger[0].criteria[0].numericThresholdDelta, -1.8);
    assert.equal(byt.predictionLedger[0].replay.verdict, 'MATCH');
    assert.equal(byt.predictionLedger[0].decisionTrace.traceFingerprint, 'trace-1');
    assert.equal(byt.calibration.protocolCriteria.notMet, 1);
    assert.equal(byt.calibration.probabilisticCalibration, 'NOT_AVAILABLE');
    assert.equal(byt.necropolis[0].status, 'FALSIFIED_WITHIN_PROTOCOL');
    assert.deepEqual(byt.necropolis[0].failedCriteria, ['c0-logp']);
    assert.equal(byt.necropolis[0].replay.verdict, 'MATCH');
    assert.equal(byt.necropolis[0].decisionTrace.traceFingerprint, 'trace-1');
    assert.equal(byt.decisionTraces[0].trace.traceFingerprint, 'trace-1');
    assert.equal(byt.surprise.status, 'AVAILABLE');
    assert.equal(byt.surprise.evaluatedRules, 1);
    assert.equal(byt.surprise.detected.length, 1);
    assert.equal(byt.surprise.detected[0].epistemicStatus, 'NOT_EVIDENCE');
    assert.equal(byt.surprise.detected[0].scienceRunRef, 'science_run:science-1');
    assert.equal(byt.knowledgeState.openGaps, 1);
    assert.equal(byt.capabilities.availableNow[0], 'rdkit');
  });

  test('a broken run contributes only an integrity failure', () => {
    const byt = buildBytProjection({
      runs: [run([frozen], { ok: false, reason: 'STATE_INTEGRITY_FAILURE', brokenAt: 0 })],
      registry: { chain, gaps: [], contradictions: [], claims: [] },
    });
    assert.equal(byt.continuity.brokenRuns, 1);
    assert.deepEqual(byt.predictionLedger, []);
    assert.deepEqual(byt.necropolis, []);
    assert.equal(byt.calibration.status, 'NOT_AVAILABLE');
  });

  test('missing or broken canonical sources remain UNKNOWN', () => {
    const byt = buildBytProjection({ registry: { chain: { ok: false, reason: 'digest_mismatch' } } });
    assert.deepEqual(byt.knowledgeState, { status: 'UNKNOWN', reason: 'STATE_INTEGRITY_FAILURE' });
    assert.deepEqual(byt.capabilities, { status: 'UNKNOWN', reason: 'SELF_MODEL_UNAVAILABLE' });
    assert.equal(byt.surprise.status, 'AVAILABLE');
    assert.equal(byt.surprise.detected.length, 0);
  });

  test('generic agent state cannot enter the canonical Prediction Ledger', () => {
    const generic = { ...run([frozen]), run: { id: 'generic-1', domain: 'mind' } };
    const byt = buildBytProjection({ runs: [generic], registry: { chain, gaps: [], contradictions: [], claims: [] } });
    assert.equal(byt.continuity.researchRuns, 0);
    assert.deepEqual(byt.predictionLedger, []);
  });

  test('projects only traceable Flight Control observations and never owns their state', () => {
    const traceable = {
      executionId: 'exp-1', status: 'VERIFIED', flightFingerprint: 'flight-fingerprint-1',
      bytUpdate: { mode: 'DERIVED_READ_MODEL_ONLY', persistence: 'NONE', epistemicState: 'SIMULATED' },
    };
    const untraceable = { executionId: 'exp-2', status: 'VERIFIED', bytUpdate: { persistence: 'NEW_STORE' } };
    const byt = buildBytProjection({ flightControl: [traceable, untraceable] });
    assert.deepEqual(byt.scienceFlightControl.flights, [traceable]);
    assert.equal(byt.scienceFlightControl.verified, 1);
    assert.equal(byt.scienceFlightControl.rejectedUntraceableRecords, 1);
    assert.match(byt.scienceFlightControl.limitation, /not a second BYT store/i);
  });
});
