import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';
import { detect as pyscfDetect } from './compute/qmAdapter.mjs';
import { detect as dockingDetect } from './compute/dockingAdapter.mjs';
import { detect as mdDetect } from './compute/mdAdapter.mjs';
import { detect as admetDetect } from './compute/admetAdapter.mjs';
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
  {
    engineId: 'vina',
    skip: engineUnavailable('vina', dockingDetect()),
    parameters: { ligandSmiles: 'CC(=O)Oc1ccccc1C(=O)O', exhaustiveness: 8, nPoses: 3, seed: 42 },
    supported: { observable: 'bestAffinityKcalMol', operator: '<', value: -5, critical: true },
    refuted: { observable: 'bestAffinityKcalMol', operator: '>', value: -5, critical: true },
    scienceCapability: 'molecular-docking',
  },
  {
    engineId: 'openmm',
    skip: engineUnavailable('openmm', mdDetect()),
    parameters: { steps: 300 },
    supported: { observable: 'potentialEnergyMinimizedKjmol', operator: '<', value: 0, critical: true },
    refuted: { observable: 'potentialEnergyMinimizedKjmol', operator: '>', value: 0, critical: true },
    expectedReplay: 'NOT_APPLICABLE',
  },
  {
    engineId: 'admet',
    skip: engineUnavailable('admet', admetDetect()),
    parameters: { smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
    supported: { observable: 'logP', operator: '<', value: 3, critical: true },
    refuted: { observable: 'logP', operator: '>', value: 3, critical: true },
    scienceCapability: 'admet-estimation',
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
        assert.equal(x.next.replay.verdict, c.expectedReplay ?? 'MATCH', 'replay is MATCH where a bit-exact replayer exists, NOT_APPLICABLE where none is wired');
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

test('admet: a COMMERCIAL_PRODUCT use purpose is BLOCKED at execution time with no prediction made', async () => {
  const { RESEARCH_RUN_EXECUTORS } = await import('./researchRunEngines.mjs');
  const before = process.env.GENESIS_ENGINE_USE_PURPOSE;
  process.env.GENESIS_ENGINE_USE_PURPOSE = 'COMMERCIAL_PRODUCT';
  try {
    const out = await RESEARCH_RUN_EXECUTORS.admet.run({ smiles: 'CC(=O)Oc1ccccc1C(=O)O' });
    assert.equal(out.ok, false);
    assert.equal(out.status, 'BLOCKED');
    assert.equal(out.output, undefined);
  } finally { if (before === undefined) delete process.env.GENESIS_ENGINE_USE_PURPOSE; else process.env.GENESIS_ENGINE_USE_PURPOSE = before; }
});
