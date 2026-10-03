import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { handleApi } from './api.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';
import { openDatabase } from './store.mjs';

const RDKIT = rdkitDetect();
const needsRdkit = RDKIT.available ? {} : { skip: `RDKit runtime unavailable: ${RDKIT.reason}` };
const ASPIRIN = 'CC(=O)Oc1ccccc1C(=O)O';

const plan = (claim, prediction) => ({
  subProblems: [{ question: claim, whyItMatters: 'Bounded real-engine self-model proof.' }],
  hypotheses: [{
    claim,
    claimType: 'PREDICTION',
    assumptions: [],
    supportingEvidenceRefs: [],
    contradictingEvidenceRefs: [],
    missingEvidence: [],
    uncertainty: { level: 'UNKNOWN', statement: 'No probability calibration is claimed.' },
    falsificationProposal: `The frozen ${prediction.observable} criterion is not met.`,
    experimentProposal: {
      kind: 'COMPUTATIONAL',
      engineId: 'rdkit',
      description: 'Real RDKit descriptor execution.',
      parameters: { smiles: ASPIRIN, predictions: [prediction] },
      parameterChanges: [],
    },
  }],
  nextActions: ['Human review'],
});

const providerFor = (answer) => ({
  providerId: 'PRIVATE_LOCAL',
  model: 'byt-restart-fixture',
  configured: true,
  reason: null,
  describe: () => ({ providerId: 'PRIVATE_LOCAL', model: 'byt-restart-fixture', configured: true, status: 'CONFIGURED', reason: null }),
  async complete() { return { text: JSON.stringify(answer), model: 'byt-restart-fixture' }; },
});

test('BYT reconstructs cross-run Prediction Ledger, Surprise, Necropolis and DecisionTrace after a real database restart', needsRdkit, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-byt-restart-'));
  const dbPath = path.join(dir, 'genesis.db');
  let db = openDatabase(dbPath);
  let currentPlan = null;
  const call = (method, pathname, { token, body } = {}) => handleApi(db, {
    method,
    pathname,
    token,
    body,
    query: {},
    reasoningProvider: providerFor(currentPlan),
  });

  try {
    const owner = call('POST', '/api/auth/register', {
      body: { email: 'byt-restart@genesis.test', password: 'password123' },
    }).body;
    const project = call('POST', '/api/projects', {
      token: owner.token,
      body: { name: 'BYT cross-run restart proof' },
    }).body.project;
    const base = `/api/projects/${project.id}`;

    currentPlan = plan('Aspirin molecular weight is below 200 Da.', {
      observable: 'molWt', operator: '<', value: 200, critical: true,
      expectedValue: 100, surpriseTolerance: 5,
    });
    const first = await call('POST', `${base}/research-runs`, {
      token: owner.token,
      body: { question: 'What is the bounded molecular-weight outcome for aspirin?' },
    });
    const firstId = first.body.researchRun.researchRunId;
    assert.equal((await call('POST', `${base}/research-runs/${firstId}/proposals`, { token: owner.token })).status, 201);
    const firstExecution = await call('POST', `${base}/research-runs/${firstId}/experiments`, { token: owner.token });
    assert.equal(firstExecution.status, 201, JSON.stringify(firstExecution.body));
    assert.equal(firstExecution.body.experiment.falsification.verdict, 'SUPPORTED_WITHIN_PROTOCOL');

    currentPlan = plan('Aspirin Crippen logP is above 3.', {
      observable: 'crippenLogP', operator: '>', value: 3, critical: true,
    });
    const second = await call('POST', `${base}/research-runs`, {
      token: owner.token,
      body: { question: 'Does aspirin exceed the frozen Crippen logP threshold?' },
    });
    const secondId = second.body.researchRun.researchRunId;
    assert.notEqual(secondId, firstId);
    assert.equal((await call('POST', `${base}/research-runs/${secondId}/proposals`, { token: owner.token })).status, 201);
    const secondExecution = await call('POST', `${base}/research-runs/${secondId}/experiments`, { token: owner.token });
    assert.equal(secondExecution.status, 201, JSON.stringify(secondExecution.body));
    assert.equal(secondExecution.body.experiment.falsification.verdict, 'FALSIFIED_WITHIN_PROTOCOL');

    const before = (await call('GET', `${base}/cognitive-state`, { token: owner.token })).body.cognitiveState.byt;
    assert.equal(before.continuity.researchRuns, 2);
    assert.equal(before.continuity.verifiedRuns, 2);
    assert.equal(before.continuity.brokenRuns, 0);
    assert.equal(before.predictionLedger.length, 2);
    assert.deepEqual(new Set(before.predictionLedger.map((entry) => entry.researchRunId)), new Set([firstId, secondId]));
    assert.ok(before.predictionLedger.every((entry) => entry.replay.verdict === 'MATCH'));
    assert.equal(before.surprise.status, 'AVAILABLE');
    assert.equal(before.surprise.evaluatedRules, 1);
    assert.equal(before.surprise.detected.length, 1);
    assert.equal(before.surprise.detected[0].researchRunId, firstId);
    assert.equal(before.surprise.detected[0].epistemicStatus, 'NOT_EVIDENCE');
    assert.equal(before.necropolis.length, 1);
    assert.equal(before.necropolis[0].researchRunId, secondId);
    assert.equal(before.necropolis[0].status, 'FALSIFIED_WITHIN_PROTOCOL');
    assert.equal(before.necropolis[0].replay.verdict, 'MATCH');
    assert.equal(before.necropolis[0].reopening, 'REQUIRES_NEW_EVIDENCE_AND_HUMAN_APPROVAL');
    assert.equal(before.decisionTraces.length, 2);
    assert.ok(before.decisionTraces.every((entry) => entry.trace.traceFingerprint));
    assert.equal(before.calibration.probabilisticCalibration, 'NOT_AVAILABLE');

    db.close();
    db = openDatabase(dbPath);
    const after = (await call('GET', `${base}/cognitive-state`, { token: owner.token })).body.cognitiveState.byt;
    assert.deepEqual(after, before);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
