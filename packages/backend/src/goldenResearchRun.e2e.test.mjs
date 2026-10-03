import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';
import { engineUnavailable } from './engineTestGate.mjs';
import { createLocalContentAddressedArtifactStorage } from './compute/localArtifactStorageBackend.mjs';
import { createResearchRunWorker } from './researchRunJobs.mjs';
import { DEFAULT_RESEARCH_TOOLS } from './researchRunEngines.mjs';

/**
 * GOLDEN E2E. One question travels the whole canonical path with a REAL engine and no mock executor:
 * question → ResearchRun → plan (the only fixture is the model's JSON answer) → frozen prediction + preregistration →
 * async queue → real RDKit → execution record → artifact custody → falsification → Evidence PROPOSED → Replay →
 * DecisionTrace → NEXT_EXPERIMENT → Scientific Memory recall. Then a worker crash after the freeze, a restart and recovery:
 * same identities, one execution, one artifact, no contradictory result.
 */
const RDKIT = rdkitDetect();
const skip = engineUnavailable('rdkit', RDKIT);
const ASPIRIN = 'CC(=O)Oc1ccccc1C(=O)O';
const hypothesis = (claim, prediction) => ({
  claim, claimType: 'PREDICTION', assumptions: [], supportingEvidenceRefs: [], contradictingEvidenceRefs: [], missingEvidence: [],
  uncertainty: { level: 'UNKNOWN', statement: 'No probability calibration is claimed.' },
  falsificationProposal: `The frozen ${prediction.observable} criterion is not met.`,
  experimentProposal: { kind: 'COMPUTATIONAL', engineId: 'rdkit', description: 'Real RDKit descriptor execution.', parameters: { smiles: ASPIRIN, predictions: [prediction] }, parameterChanges: [] },
});
const PLAN = {
  subProblems: [{ question: 'Is aspirin small and hydrophilic?', whyItMatters: 'Golden E2E.' }],
  hypotheses: [
    hypothesis('Aspirin molecular weight is below 200 Da.', { observable: 'molWt', operator: '<', value: 200, critical: true }),
    hypothesis('Aspirin Crippen logP is above 3.', { observable: 'crippenLogP', operator: '>', value: 3, critical: true }),
  ],
  nextActions: ['Human review'],
};
const provider = () => ({
  providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, reason: null,
  describe: () => ({ providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, status: 'CONFIGURED', reason: null }),
  async complete() { return { text: JSON.stringify(PLAN), model: 'fixture' }; },
});

test('GOLDEN: question → async real engine → artifact → verdict → evidence → replay → memory, with a crash, a restart and recovery', { skip }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-golden-'));
  const dbPath = path.join(dir, 'genesis.db');
  const artifactDir = path.join(dir, 'artifacts');
  let db = openDatabase(dbPath);
  let storage = createLocalContentAddressedArtifactStorage({ rootDir: artifactDir });
  const api = (method, pathname, { token, body, query = {} } = {}) => handleApi(db, { method, pathname, token, body, query, reasoningProvider: provider(), artifactStorage: storage });
  try {
    const owner = api('POST', '/api/auth/register', { body: { email: 'golden@genesis.test', password: 'password123' } }).body;
    const project = api('POST', '/api/projects', { token: owner.token, body: { name: 'Golden E2E' } }).body.project;
    const base = `/api/projects/${project.id}`;
    const started = await api('POST', `${base}/research-runs`, { token: owner.token, body: { question: 'Is aspirin small and hydrophilic?' } });
    const runId = started.body.researchRun.researchRunId;
    assert.equal((await api('POST', `${base}/research-runs/${runId}/proposals`, { token: owner.token })).status, 201);
    const view = async () => (await api('GET', `${base}/research-runs/${runId}`, { token: owner.token })).body.researchRun;
    const enqueue = () => api('POST', `${base}/research-runs/${runId}/experiments`, { token: owner.token, body: { async: true } });

    // 1. Crash: the engine dies after the prediction is frozen. Nothing is reported as a success.
    const crashing = { ...DEFAULT_RESEARCH_TOOLS, executors: { ...DEFAULT_RESEARCH_TOOLS.executors, rdkit: { ...DEFAULT_RESEARCH_TOOLS.executors.rdkit, run() { throw new Error('worker process killed'); } } } };
    const first = (await enqueue()).body.job;
    // The process dies mid-execution: runOnce never returns a result and the lease is simply abandoned.
    await assert.rejects(createResearchRunWorker(db, { workerId: 'worker-crash', artifactStorage: storage, tools: crashing }).runOnce(), /worker process killed/);
    assert.equal(api('GET', `${base}/research-runs/${runId}/experiment-jobs/${first.jobId}`, { token: owner.token }).body.job.state, 'CLAIMED');
    db.prepare('UPDATE jobs SET lease_expires_at = 0 WHERE id = ?').run(first.jobId);
    let mid = await view();
    assert.equal(mid.experiments.length, 1, 'the experiment is frozen');
    assert.ok(mid.experiments[0].frozen && !mid.experiments[0].execution, 'frozen but never executed');
    const frozenFingerprint = mid.experiments[0].frozen.predictionFingerprint;
    const experimentId = mid.experiments[0].experimentId;
    assert.equal(mid.researchState.events.filter((e) => e.type === 'ARTIFACT_PERSISTED').length, 0);

    // 2. Restart: new database handle, new storage instance.
    db.close();
    db = openDatabase(dbPath);
    storage = createLocalContentAddressedArtifactStorage({ rootDir: artifactDir });
    const login = api('POST', '/api/auth/login', { body: { email: 'golden@genesis.test', password: 'password123' } }).body;
    owner.token = login.token;
    mid = await view();
    assert.equal(mid.researchState.chain.ok, true);
    assert.equal(mid.experiments[0].frozen.predictionFingerprint, frozenFingerprint, 'the same frozen prediction survives');

    // 3. Recovery: a new job resumes the SAME experiment through the same path; both hypotheses run and are judged.
    const worker = createResearchRunWorker(db, { workerId: 'worker-golden', artifactStorage: storage });
    assert.equal((await worker.runOnce()).state, 'IDLE', 'an abandoned lease on the last allowed attempt is closed, not retried blindly');
    const dead = (await api('GET', `${base}/research-runs/${runId}/experiment-jobs/${first.jobId}`, { token: owner.token })).body.job;
    assert.equal(dead.state, 'DEAD_LETTER');
    assert.equal(dead.failure.code, 'LEASE_EXPIRED_AFTER_MAX_ATTEMPTS');
    const retry = (await enqueue()).body.job;
    assert.notEqual(retry.jobId, first.jobId);
    assert.equal((await worker.runOnce()).state, 'SUCCEEDED');
    assert.equal((await enqueue()).status, 202);
    assert.equal((await worker.runOnce()).state, 'SUCCEEDED');
    assert.equal((await worker.runOnce()).state, 'IDLE');

    const run = await view();
    assert.equal(run.researchState.chain.ok, true);
    assert.equal(run.experiments.length, 2);
    const [a, b] = run.experiments;
    assert.equal(a.experimentId, experimentId, 'recovery resumed the frozen experiment, it did not create another');
    assert.equal(a.frozen.predictionFingerprint, frozenFingerprint);
    assert.equal(a.execution.status, 'EXECUTED');
    assert.equal(a.execution.engine.engineId, 'rdkit');
    assert.equal(a.falsification.verdict, 'SUPPORTED_WITHIN_PROTOCOL');
    assert.equal(b.falsification.verdict, 'FALSIFIED_WITHIN_PROTOCOL');
    for (const x of [a, b]) {
      assert.equal(x.evidence.status, 'PROPOSED', 'evidence is only proposed; a human publishes');
      assert.equal(x.next.replay.verdict, 'MATCH');
      assert.equal(x.next.decisionTrace.solverId, 'GENESIS_FIXED_RULE');
      assert.ok(x.frozen.preregistrationFingerprint && x.execution.inputHash && x.execution.outputHash);
    }
    assert.equal(b.next.proposal.action, 'HUMAN_REVIEW', 'nothing left to run: the next step is a human');

    // 4. One artifact per executed experiment, verified read-back, bound to the execution record.
    const artifacts = run.researchState.events.filter((e) => e.type === 'ARTIFACT_PERSISTED');
    assert.equal(artifacts.length, 2);
    for (const x of [a, b]) {
      const got = await api('GET', `${base}/research-runs/${runId}/experiments/${x.experimentId}/artifact`, { token: owner.token });
      assert.equal(got.status, 200, JSON.stringify(got.body));
      assert.equal(got.body.verified, true);
      assert.equal(artifacts.find((e) => e.payload.experimentId === x.experimentId).payload.outputHash, x.execution.outputHash);
    }

    // 5. Replay after the restart, through the existing verifier.
    const replay = await api('POST', `${base}/research-runs/${runId}/experiments/${a.experimentId}/replays`, { token: owner.token });
    assert.equal(replay.status, 201, JSON.stringify(replay.body));
    assert.equal(replay.body.verification.verdict, 'MATCH');

    // 6. Scientific Memory: the verdicts are recallable from canonical state, traceable to this run.
    const synth = await api('GET', `${base}/knowledge/synthesis`, { token: owner.token, query: { q: 'aspirin Crippen logP above 3' } });
    assert.equal(synth.status, 200, JSON.stringify(synth.body));
    assert.ok(synth.body.synthesis.hits.some((h) => String(h.ref).includes(runId)), JSON.stringify(synth.body.synthesis.hits.map((h) => h.ref)));

    // 7. Restart once more: identity unchanged, nothing executes twice, the chain still verifies.
    const outputHashes = [a, b].map((x) => x.execution.outputHash);
    db.close();
    db = openDatabase(dbPath);
    storage = createLocalContentAddressedArtifactStorage({ rootDir: artifactDir });
    owner.token = api('POST', '/api/auth/login', { body: { email: 'golden@genesis.test', password: 'password123' } }).body.token;
    const after = await view();
    assert.equal(after.researchState.chain.ok, true);
    assert.deepEqual(after.experiments.map((x) => x.execution.outputHash), outputHashes);
    assert.equal(after.researchState.events.length, run.researchState.events.length, 'a replay adds a verification row, never a chain event');
    assert.equal((await createResearchRunWorker(db, { workerId: 'worker-after', artifactStorage: storage }).runOnce()).state, 'IDLE');
    for (const x of after.experiments) {
      assert.equal((await api('GET', `${base}/research-runs/${runId}/experiments/${x.experimentId}/artifact`, { token: owner.token })).body.verified, true);
    }
  } finally { try { db.close(); } catch { /* closed */ } rmSync(dir, { recursive: true, force: true }); }
});
