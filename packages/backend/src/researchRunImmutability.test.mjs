import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { appendServerResearchStateEvent, readResearchState } from './agentRun.mjs';
import { openDatabase } from './store.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';
import { executeResearchExperiment } from './researchRunExecution.mjs';
import { getResearchRun } from './researchRun.mjs';

const RDKIT = rdkitDetect();
const skip = RDKIT.available ? false : `RDKit runtime unavailable: ${RDKIT.reason}`;
const plan = {
  subProblems: [{ question: 'Aspirin molecular weight?', whyItMatters: 'Immutability proof.' }],
  hypotheses: [{
    claim: 'Aspirin molecular weight is below 200 Da.', claimType: 'PREDICTION', assumptions: [], supportingEvidenceRefs: [], contradictingEvidenceRefs: [], missingEvidence: [],
    uncertainty: { level: 'UNKNOWN', statement: 'No probability calibration is claimed.' }, falsificationProposal: 'The frozen molWt criterion is not met.',
    experimentProposal: { kind: 'COMPUTATIONAL', engineId: 'rdkit', description: 'Real RDKit descriptor execution.', parameters: { smiles: 'CC(=O)Oc1ccccc1C(=O)O', predictions: [{ observable: 'molWt', operator: '<', value: 200, critical: true }] }, parameterChanges: [] },
  }],
  nextActions: ['Human review'],
};
const provider = () => ({
  providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, reason: null,
  describe: () => ({ providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, status: 'CONFIGURED', reason: null }),
  async complete() { return { text: JSON.stringify(plan), model: 'fixture' }; },
});

test('after a result, the frozen success criteria cannot be changed, replaced or re-run', { skip }, async () => {
  const db = openDatabase();
  try {
    const call = (method, pathname, { token, body } = {}) => handleApi(db, { method, pathname, token, body, query: {}, reasoningProvider: provider() });
    const owner = call('POST', '/api/auth/register', { body: { email: 'frozen@genesis.test', password: 'password123' } }).body;
    const project = call('POST', '/api/projects', { token: owner.token, body: { name: 'Frozen criteria' } }).body.project;
    const base = `/api/projects/${project.id}`;
    const runId = (await call('POST', `${base}/research-runs`, { token: owner.token, body: { question: 'Aspirin molecular weight?' } })).body.researchRun.researchRunId;
    await call('POST', `${base}/research-runs/${runId}/proposals`, { token: owner.token });
    const executed = await call('POST', `${base}/research-runs/${runId}/experiments`, { token: owner.token, body: {} });
    assert.equal(executed.status, 201);
    const before = getResearchRun(db, project.id, runId);
    const x = before.experiments[0];
    assert.equal(x.falsification.verdict, 'SUPPORTED_WITHIN_PROTOCOL');

    // 1. Running it again is the same experiment, not a new one with new criteria.
    const again = await call('POST', `${base}/research-runs/${runId}/experiments`, { token: owner.token, body: { hypothesisId: x.frozen.hypothesisId } });
    assert.equal(again.body.deduped, true);

    // 2. Steering can add context, but it is not a channel for a new threshold.
    const steer = await call('POST', `${base}/research-runs/${runId}/steering`, { token: owner.token, body: { action: 'ADD_CONTEXT', text: 'Please change the molWt threshold to 150.' } });
    assert.equal(steer.status, 201);
    const afterSteer = getResearchRun(db, project.id, runId);
    assert.deepEqual(afterSteer.experiments[0].frozen, x.frozen);
    assert.deepEqual(afterSteer.experiments[0].falsification, x.falsification);

    // 3. A client can never write the chain.
    const forged = await call('POST', `${base}/agent-runs/${runId}/research-state`, { token: owner.token, body: { event: { seq: 99, type: 'PREDICTIONS_FROZEN', at: 'x', payload: { experimentId: x.experimentId, criteria: [] } } } });
    assert.equal(forged.body.error, 'server_managed_run');

    // 4. Even a server-side second PREDICTIONS_FROZEN or SELF_FALSIFICATION for the same experiment does not replace the first:
    //    the run stops with an integrity failure, and the original record stays the one that is shown.
    const doctored = { ...x.frozen, criteria: [{ ...x.frozen.criteria[0], value: 150 }] };
    assert.equal(appendServerResearchStateEvent(db, runId, 'PREDICTIONS_FROZEN', doctored).ok, true, 'the chain itself is append-only and accepts the event');
    const conflicted = getResearchRun(db, project.id, runId);
    assert.deepEqual(conflicted.experiments[0].frozen, x.frozen, 'the first frozen record stays the record');
    assert.equal(conflicted.experiments[0].conflicts[0].step, 'frozen');
    assert.equal(conflicted.nextStep, 'STATE_INTEGRITY_FAILURE');
    const refused = executeResearchExperiment(db, project.id, runId, {});
    assert.equal(refused.status, 'STATE_INTEGRITY_FAILURE');
    assert.equal(refused.reason, 'STEP_RECORDED_TWICE');
    assert.equal(JSON.stringify(conflicted.experiments[0].falsification), JSON.stringify(x.falsification), 'the verdict is unchanged');

    // 5. Editing a stored event in the database breaks the hash chain, which every read re-verifies.
    const row = db.prepare("SELECT id, observation_json FROM agent_run_steps WHERE agent_run_id = ? AND capability = 'PREDICTIONS_FROZEN' ORDER BY step_index LIMIT 1").get(runId);
    db.prepare('UPDATE agent_run_steps SET observation_json = ? WHERE id = ?').run(row.observation_json.replace('"value":200', '"value":150'), row.id);
    const tampered = readResearchState(db, runId);
    assert.equal(tampered.chain.ok, false);
    assert.equal(tampered.chain.reason, 'payload_fingerprint_mismatch');
    assert.equal(executeResearchExperiment(db, project.id, runId, {}).status, 'STATE_INTEGRITY_FAILURE');
  } finally { db.close(); }
});
