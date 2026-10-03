import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FAILURE_LAYER,
  FLIGHT_STATUS,
  projectScienceFlightControl,
} from './scienceFlightControl.mjs';

const event = (id, type, createdAt, payload) => ({ id, type, createdAt, payload });
const plan = event('plan-1', 'VIRTUAL_EXPERIMENT_PLANNED', 1, {
  executionId: 'exp-1', inputFingerprint: 'input-1', candidateId: 'candidate-1',
  requestedCapability: 'molecular-descriptors', budget: { maxComputeSeconds: 2 },
  expectation: { outputKey: 'crippenLogP', comparator: 'LTE', threshold: 2.5, tolerance: 0 },
  researchGate: { verdict: 'PROCEED', reason: 'WITHIN_RESEARCH_BOUNDARY' },
  clinicalEfficacy: 'UNKNOWN', claimBoundary: 'In-silico only.',
});
const result = event('result-1', 'VIRTUAL_EXPERIMENT_RESULT', 2, {
  executionId: 'exp-1', candidateId: 'candidate-1', requestedCapability: 'molecular-descriptors',
  status: 'EXECUTED_COMPUTATIONAL_EXPERIMENT', scienceRunId: 'science-1', outputFingerprint: 'output-1',
  durationMs: 25, selectedEngine: { engineName: 'RDKit', engineVersion: '2025.03' },
  epistemicClassification: 'IN_SILICO_SUPPORT',
});
const evidence = event('evidence-1', 'VIRTUAL_EXPERIMENT_EVIDENCE_PROPOSED', 3, { executionId: 'exp-1', proposalId: 'proposal-1' });
const replay = event('replay-1', 'VIRTUAL_EXPERIMENT_REPLAY', 4, { executionId: 'exp-1', replayStatus: 'REPLAY_MATCH', verificationId: 'verify-1' });

describe('Science Flight Control / Experiment Firewall projection', () => {
  test('projects cleared preflight through Evidence and Replay into a BYT-eligible verified flight', () => {
    const control = projectScienceFlightControl({ plans: [plan], results: [result], evidenceLinks: [evidence], replays: [replay] });
    const flight = control.flights[0];
    assert.equal(control.mode, 'READ_ONLY_PROJECTION_OF_CANONICAL_EVENTS');
    assert.equal(flight.preflight.decision, 'CLEARED');
    assert.ok(flight.preflight.checks.every((check) => check.status === 'PASS'));
    assert.equal(flight.executionDelta.inputIntegrity, 'MATCH');
    assert.equal(flight.executionDelta.budgetVerdict, 'WITHIN_BUDGET');
    assert.equal(flight.status, FLIGHT_STATUS.VERIFIED);
    assert.equal(flight.failureAttribution, null);
    assert.equal(flight.evidenceUpdate.proposalId, 'proposal-1');
    assert.equal(flight.replay.verificationId, 'verify-1');
    assert.equal(flight.bytUpdate.persistence, 'NONE');
    assert.equal(flight.bytUpdate.status, 'ELIGIBLE_FOR_SELF_MODEL_PROJECTION');
    assert.equal(flight.bytUpdate.epistemicState, 'SIMULATED');
    assert.equal(control.summary.verified, 1);
  });

  test('attributes a retryable worker transport failure without inventing a result', () => {
    const failedDispatch = event('dispatch-1', 'VIRTUAL_EXPERIMENT_DISPATCH_FAILED', 2, {
      executionId: 'exp-1', reason: 'worker timed out', dispatch: { state: 'WORKER_TIMEOUT' },
    });
    const flight = projectScienceFlightControl({ plans: [plan], dispatchFailures: [failedDispatch] }).flights[0];
    assert.equal(flight.status, FLIGHT_STATUS.BLOCKED_RETRYABLE);
    assert.equal(flight.failureAttribution.layer, FAILURE_LAYER.WORKER_TRANSPORT);
    assert.equal(flight.failureAttribution.code, 'WORKER_TIMEOUT');
    assert.equal(flight.failureAttribution.retryable, true);
    assert.equal(flight.executionDelta.observed, false);
    assert.equal(flight.bytUpdate.epistemicState, 'UNKNOWN');
  });

  test('attributes runtime, engine and replay failures to distinct layers', () => {
    const runtime = event('result-runtime', 'VIRTUAL_EXPERIMENT_RESULT', 2, {
      ...result.payload, status: 'BLOCKED_RUNTIME_UNAVAILABLE', reason: 'engine absent', scienceRunId: null,
    });
    const engine = event('result-engine', 'VIRTUAL_EXPERIMENT_RESULT', 2, {
      ...result.payload, status: 'FAILED_ENGINE', reason: 'solver failed', scienceRunId: null,
    });
    const drift = event('replay-drift', 'VIRTUAL_EXPERIMENT_REPLAY', 4, {
      executionId: 'exp-1', replayStatus: 'REPLAY_DRIFT', verificationId: 'verify-drift', detail: 'output hash changed',
    });
    assert.equal(projectScienceFlightControl({ plans: [plan], results: [runtime] }).flights[0].failureAttribution.layer, FAILURE_LAYER.RUNTIME);
    assert.equal(projectScienceFlightControl({ plans: [plan], results: [engine] }).flights[0].failureAttribution.layer, FAILURE_LAYER.ENGINE);
    const replayFlight = projectScienceFlightControl({ plans: [plan], results: [result], evidenceLinks: [evidence], replays: [drift] }).flights[0];
    assert.equal(replayFlight.failureAttribution.layer, FAILURE_LAYER.REPLAY);
    assert.equal(replayFlight.status, FLIGHT_STATUS.BLOCKED);
    assert.equal(replayFlight.bytUpdate.status, 'INCOMPLETE');
  });

  test('is deterministic and leaves canonical event inputs untouched', () => {
    const input = { plans: [plan], results: [result], evidenceLinks: [evidence], replays: [replay] };
    const before = JSON.stringify(input);
    const first = projectScienceFlightControl(input);
    const second = projectScienceFlightControl(input);
    assert.deepEqual(first, second);
    assert.equal(JSON.stringify(input), before);
  });
});
