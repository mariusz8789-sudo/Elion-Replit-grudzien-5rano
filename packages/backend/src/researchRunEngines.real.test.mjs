import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';
import { detect as pyscfDetect } from './compute/qmAdapter.mjs';
import { engineUnavailable } from './engineTestGate.mjs';
import { createResearchRunWorker } from './researchRunJobs.mjs';

// REAL engine proofs through the one ResearchRun path and the durable queue. No mock executor: each
// case runs the actual engine, freezes the prediction first, falsifies, replays through the existing
// verifier and survives a database reopen. Add one entry per engine once it is routed through ResearchRun.
const CASES = [
  {
    engineId: 'pyscf',
    skip: engineUnavailable('pyscf', pyscfDetect()) || engineUnavailable('rdkit', rdkitDetect()),
    smiles: 'C',
    parameters: { smiles: 'C', basis: 'sto-3g' },
    supported: { observable: 'energyHartree', operator: '<', value: -39, critical: true },
    refuted: { observable: 'energyHartree', operator: '>', value: -39, critical: true },
    scienceCapability: 'quantum-chemistry',
  },
];

const planFor = (c, prediction, claim) => ({
  subProblems: [{ question: claim, whyItMatters: 'Real engine proof.' }],
  hypotheses: [{
    claim, claimType: 'PREDICTION', assumptions: [], supportingEvidenceRefs: [], contradictingEvidenceRefs: [], missingEvidence: [],
    uncertainty: { level: 'UNKNOWN', statement: 'No probability calibration is claimed.' },
    falsificationProposal: `The frozen ${prediction.observable} criterion is not met.`,
    experimentProposal: { kind: 'COMPUTATIONAL', engineId: c.engineId, description: `Real ${c.engineId} execution.`, parameters: { ...c.parameters, predictions: [prediction] }, parameterChanges: [] },
  }],
  nextActions: ['Human review'],
});

for (const c of CASES) {
  test(`${c.engineId}: real engine through ResearchRun and the queue — supported, refuted, replay MATCH, restart`, { skip: c.skip }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), `genesis-rr-${c.engineId}-`));
    const dbPath = path.join(dir, 'genesis.db');
    let db = openDatabase(dbPath);
    let currentPlan = null;
    const provider = () => ({
      providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, reason: null,
      describe: () => ({ providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, status: 'CONFIGURED', reason: null }),
      async complete() { return { text: JSON.stringify(currentPlan), model: 'fixture' }; },
    });
    const call = (method, pathname, { token, body } = {}) => handleApi(db, { method, pathname, token, body, query: {}, reasoningProvider: provider() });
    try {
      const owner = call('POST', '/api/auth/register', { body: { email: `${c.engineId}@genesis.test`, password: 'password123' } }).body;
      const project = call('POST', '/api/projects', { token: owner.token, body: { name: `${c.engineId} real run` } }).body.project;
      const base = `/api/projects/${project.id}`;
      const worker = createResearchRunWorker(db, { workerId: `worker-${c.engineId}` });
      const outcomes = [];
      for (const [prediction, claim, expected] of [
        [c.supported, `${c.engineId} supported prediction`, 'SUPPORTED_WITHIN_PROTOCOL'],
        [c.refuted, `${c.engineId} refuted prediction`, 'FALSIFIED_WITHIN_PROTOCOL'],
      ]) {
        currentPlan = planFor(c, prediction, claim);
        const started = await call('POST', `${base}/research-runs`, { token: owner.token, body: { question: `${claim}?` } });
        const runId = started.body.researchRun.researchRunId;
        await call('POST', `${base}/research-runs/${runId}/proposals`, { token: owner.token });
        const queued = await call('POST', `${base}/research-runs/${runId}/experiments`, { token: owner.token, body: { async: true } });
        assert.equal(queued.status, 202, JSON.stringify(queued.body));
        assert.equal((await worker.runOnce()).state, 'SUCCEEDED');
        const run = (await call('GET', `${base}/research-runs/${runId}`, { token: owner.token })).body.researchRun;
        const x = run.experiments[0];
        assert.equal(x.execution.status, 'EXECUTED');
        assert.equal(x.execution.engine.engineId, c.engineId);
        assert.match(x.execution.engine.engineLabel ?? '', /\d/, 'engine version is recorded');
        assert.equal(x.falsification.verdict, expected);
        assert.equal(x.next.replay.verdict, 'MATCH', 'the existing verifier re-runs the real engine and matches');
        assert.equal(run.researchState.chain.ok, true);
        outcomes.push({ runId, experimentId: x.experimentId, outputHash: x.execution.outputHash, inputHash: x.execution.inputHash });
      }
      db.close();
      db = openDatabase(dbPath);
      const login = call('POST', '/api/auth/login', { body: { email: `${c.engineId}@genesis.test`, password: 'password123' } }).body;
      for (const o of outcomes) {
        const view = call('GET', `${base}/research-runs/${o.runId}`, { token: login.token }).body.researchRun;
        assert.equal(view.experiments[0].execution.outputHash, o.outputHash, 'same output identity after restart');
        assert.equal(view.experiments[0].execution.inputHash, o.inputHash);
        assert.equal(view.researchState.chain.ok, true);
      }
      assert.equal((await createResearchRunWorker(db, { workerId: `worker-${c.engineId}-2` }).runOnce()).state, 'IDLE', 'nothing executes twice after restart');
    } finally { try { db.close(); } catch { /* closed */ } rmSync(dir, { recursive: true, force: true }); }
  });
}
