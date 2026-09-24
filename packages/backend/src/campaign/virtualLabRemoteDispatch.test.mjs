import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openDatabase, createUser, createProject, getScienceRun, listScienceRuns } from '../store.mjs';
import { hashPassword } from '../auth.mjs';
import { handleApi } from '../api.mjs';
import * as campaignStore from './persistence.mjs';
import * as knowledgeApi from '../knowledgeApi.mjs';
import {
  VIRTUAL_EVENT,
  EXECUTION_STATUS,
  EPISTEMIC_CLASSIFICATION,
  REPLAY_STATUS,
  planVirtualExperiment,
  executeVirtualExperiment,
  executeVirtualExperimentDispatched,
  replayVirtualExperiment,
  linkVirtualExperimentEvidenceProposal,
  buildVirtualLabDossier,
} from './virtualLabClosedLoop.mjs';
import { capabilityAvailable } from './toolchain.mjs';
import { DISPATCH_STATE, MD_LIMITATIONS } from '../compute/scientificCapabilityContract.mjs';
import { createRemoteScientificWorkerClient, resolveWorkerConfig } from '../compute/remoteScientificWorkerClient.mjs';
import { maxRelativeDiff } from '../provenance.mjs';
import {
  TEST_WORKER_TOKEN,
  closedPortUrl,
  startCountingWorker,
  startFakeServer,
  startTamperingProxy,
} from '../compute/remoteScientificWorkerTestUtils.mjs';

/**
 * Virtual Lab -> private scientific worker -> canonical ScienceRun/Evidence/replay.
 *
 * Real worker servers (compute/workerServer.mjs) run in this process on ephemeral
 * ports and execute the real adapters. The Virtual Lab dispatches to them through
 * compute/remoteScientificWorkerClient.mjs exactly as the Railway main service
 * would; the only difference in production is the URL.
 */
const QM_ON = capabilityAvailable('quantum-chemistry');
const DOCK_ON = capabilityAvailable('molecular-docking');
const MD_ON = capabilityAvailable('molecular-dynamics');
const ADMET_ON = capabilityAvailable('admet-estimation');
const RDKIT_ON = capabilityAvailable('molecular-descriptors');
const missing = (name) => `${name} is not installed in this runtime`;

let db;
beforeEach(() => { db = openDatabase(); });

let fixtureCounter = 0;
function seed(db, smiles = 'CCO') {
  fixtureCounter += 1;
  const user = createUser(db, { email: `remote-vlab-${fixtureCounter}@lab.org`, displayName: `remote-vlab-${fixtureCounter}`, passwordHash: hashPassword('password123') });
  const project = createProject(db, { name: `Remote Virtual Lab ${fixtureCounter}`, ownerId: user.id });
  const campaign = campaignStore.createCampaign(db, {
    projectId: project.id, objective: 'Remote virtual lab fixture', domain: 'DRUG_DISCOVERY',
    budget: { maxGenerations: 1, maxGeneratedCandidates: 4 },
    stopping: { patience: 3, minImprovement: 1e-4, diversityFloor: 0.05 },
    strategy: { startingSmiles: ['c1ccccc1'], transformationWeights: {}, parentSelection: 'pareto' },
    createdBy: user.id,
  });
  const candidateId = campaignStore.addCandidate(db, { campaignId: campaign.id, generation: 0, canonicalSmiles: smiles, valid: true, status: 'retained' });
  return { projectId: project.id, campaignId: campaign.id, candidateId };
}

function plan(db, fixture, requestedCapability, { params = {}, expectation = null, hypothesis = null } = {}) {
  const planned = planVirtualExperiment(db, {
    projectId: fixture.projectId, campaignId: fixture.campaignId, candidateId: fixture.candidateId,
    hypothesis: hypothesis ?? `Probe ${requestedCapability} for this candidate (${fixtureCounter}).`,
    requestedCapability, params, expectation,
  });
  assert.equal(planned.ok, true, JSON.stringify(planned));
  return planned.plan.executionId;
}

const exec = (db, fixture, executionId, options) => executeVirtualExperimentDispatched(db, {
  campaignId: fixture.campaignId, candidateId: fixture.candidateId, executionId, executedBy: 'scientist-1',
}, options);

const eventsOf = (db, fixture, type) => campaignStore.listEvents(db, fixture.campaignId).filter((e) => e.type === type);

/** The scientific identity of a ScienceRun — everything except row identity, timing and where it ran. */
function scientificFields(run) {
  const { execution, artifactDurability, ...provenance } = run.provenance ?? {};
  void execution; void artifactDurability;
  return {
    engine: run.engine, engineVersion: run.engineVersion, capability: run.capability, method: run.method,
    status: run.status, evidenceClass: run.evidenceClass, inputs: run.inputs, outputs: run.outputs, units: run.units,
    provenance, inputHash: run.inputHash, outputHash: run.outputHash,
  };
}

let chem;
let structural;
let admetWorker;
const configAll = (overrides = {}) => resolveWorkerConfig({
  GENESIS_SCIENTIFIC_WORKER_TOKEN: TEST_WORKER_TOKEN,
  GENESIS_CHEM_LIGHT_WORKER_URL: chem.url,
  GENESIS_STRUCTURAL_WORKER_URL: structural.url,
  GENESIS_ADMET_WORKER_URL: admetWorker.url,
  ...overrides,
});

before(async () => {
  chem = await startCountingWorker({ workerGroup: 'chem-light', engineIds: ['pyscf', 'biopython'] });
  structural = await startCountingWorker({ workerGroup: 'structural', engineIds: ['openmm', 'vina'] });
  admetWorker = await startCountingWorker({ workerGroup: 'admet', engineIds: ['admet', 'toxicity'] });
});
after(async () => {
  await Promise.all([chem.close(), structural.close(), admetWorker.close()]);
});

describe('1. local RDKit remains unchanged', () => {
  test('descriptors run locally even with every worker configured, with the same scientific result as the classic path', { skip: !RDKIT_ON && missing('RDKit') }, async () => {
    const counts = [chem.calls.length, structural.calls.length, admetWorker.calls.length];
    const routed = seed(db, 'CC(=O)Oc1ccccc1C(=O)O');
    const expectation = { outputKey: 'crippenLogP', comparator: 'LTE', threshold: 2.5 };
    const r = await exec(db, routed, plan(db, routed, 'molecular-descriptors', { expectation }), { workerConfig: configAll() });
    assert.equal(r.ok, true);
    assert.equal(r.result.status, EXECUTION_STATUS.EXECUTED);
    assert.equal(r.result.dispatch.mode, DISPATCH_STATE.LOCAL_EXECUTION);
    assert.equal(r.result.dispatch.state, DISPATCH_STATE.LOCAL_EXECUTION);
    assert.equal(r.result.selectedEngine.engineName, 'RDKit');
    assert.deepEqual([chem.calls.length, structural.calls.length, admetWorker.calls.length], counts, 'no worker was contacted');

    const classic = seed(db, 'CC(=O)Oc1ccccc1C(=O)O');
    const c = executeVirtualExperiment(db, { campaignId: classic.campaignId, candidateId: classic.candidateId, executionId: plan(db, classic, 'molecular-descriptors', { expectation }) });
    assert.equal(c.result.epistemicClassification, r.result.epistemicClassification);
    assert.deepEqual(c.result.derivedOutput, r.result.derivedOutput);
    assert.equal(c.result.outputFingerprint, r.result.outputFingerprint);
    assert.equal(Object.prototype.hasOwnProperty.call(c.result, 'dispatch'), false, 'the classic entry point payload is unchanged');
  });
});

describe('2. configured PySCF worker — real remote quantum chemistry through the Virtual Lab', () => {
  test('executes remotely, persists one canonical ScienceRun, classifies in the main service, replays canonically', { skip: !QM_ON && missing('PySCF') }, async () => {
    const fx = seed(db, 'CCO');
    const executionId = plan(db, fx, 'quantum-chemistry', { expectation: { outputKey: 'energyHartree', comparator: 'LTE', threshold: 0 } });
    const before = chem.calls.length;
    const r = await exec(db, fx, executionId, { workerConfig: configAll() });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.result.status, EXECUTION_STATUS.EXECUTED);
    assert.equal(r.result.dispatch.mode, DISPATCH_STATE.REMOTE_EXECUTION);
    assert.equal(r.result.dispatch.state, DISPATCH_STATE.REMOTE_EXECUTION);
    assert.equal(r.result.dispatch.workerGroup, 'chem-light');
    assert.equal(r.result.selectedEngine.toolId, 'pyscf');
    assert.equal(r.result.epistemicClassification, EPISTEMIC_CLASSIFICATION.IN_SILICO_SUPPORT);
    assert.equal(chem.calls.length, before + 1, 'the chem-light worker ran the engine');

    const run = getScienceRun(db, r.result.scienceRunId);
    assert.equal(run.engine, 'PySCF');
    assert.equal(run.capability, 'quantum-chemistry');
    assert.equal(run.campaignId, fx.campaignId);
    assert.equal(run.candidateId, fx.candidateId);
    assert.equal(run.provenance.execution.mode, DISPATCH_STATE.REMOTE_EXECUTION);
    assert.equal(run.provenance.execution.executionId, executionId);
    assert.equal(run.environmentHash, r.result.dispatch.environmentFingerprint, 'the environment is the worker\'s');
    assert.equal(r.result.outputFingerprint, run.outputHash);
    assert.ok(r.result.limitations.some((l) => l.includes('private "chem-light" scientific worker')));

    // 18. replay remains canonical: the unchanged verify.mjs re-executes from the persisted inputs.
    const replay = replayVirtualExperiment(db, { campaignId: fx.campaignId, candidateId: fx.candidateId, executionId });
    assert.equal(replay.ok, true);
    assert.equal(replay.replay.replayStatus, REPLAY_STATUS.MATCH);
    assert.equal(buildVirtualLabDossier(db, fx.campaignId, fx.candidateId).dossier.nextAction.action, 'ESCALATE_TO_EXTERNAL_VALIDATION');
  });

  test('local and remote QM persist the same scientific ScienceRun (parity)', { skip: !QM_ON && missing('PySCF') }, async () => {
    const local = seed(db, 'CCO');
    const remote = seed(db, 'CCO');
    const params = { method: 'RHF', basis: 'sto-3g' };
    const l = await exec(db, local, plan(db, local, 'quantum-chemistry', { params }), { workerConfig: resolveWorkerConfig({}) });
    const r = await exec(db, remote, plan(db, remote, 'quantum-chemistry', { params }), { workerConfig: configAll() });
    assert.equal(l.result.dispatch.mode, DISPATCH_STATE.LOCAL_EXECUTION);
    assert.equal(r.result.dispatch.mode, DISPATCH_STATE.REMOTE_EXECUTION);
    assert.deepEqual(scientificFields(getScienceRun(db, r.result.scienceRunId)), scientificFields(getScienceRun(db, l.result.scienceRunId)));
  });
});

describe('3. structural worker dispatch (OpenMM + AutoDock Vina/Meeko)', () => {
  test('docking runs remotely with the same scientific result as a local dock; no worker path is persisted', { skip: !DOCK_ON && missing('AutoDock Vina/Meeko') }, async () => {
    const receptor = { receptorSmiles: 'c1ccc2[nH]ccc2c1', center: [0, 0, 0], boxSize: [20, 20, 20], exhaustiveness: 4, nPoses: 3, seed: 7 };
    const remote = seed(db, 'c1ccccc1O');
    const before = structural.calls.length;
    const r = await exec(db, remote, plan(db, remote, 'molecular-docking', { params: { receptor } }), { workerConfig: configAll() });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.result.status, EXECUTION_STATUS.EXECUTED);
    assert.equal(r.result.dispatch.workerGroup, 'structural');
    assert.equal(structural.calls.length, before + 1);
    const remoteRun = getScienceRun(db, r.result.scienceRunId);
    assert.equal(remoteRun.provenance.artifactDurability, 'REMOTE_WORKER_EPHEMERAL');
    for (const artifact of remoteRun.artifacts) {
      assert.deepEqual(Object.keys(artifact).sort(), ['kind', 'location', 'sha256']);
    }

    const local = seed(db, 'c1ccccc1O');
    const l = await exec(db, local, plan(db, local, 'molecular-docking', { params: { receptor } }), { workerConfig: resolveWorkerConfig({}) });
    const localRun = getScienceRun(db, l.result.scienceRunId);
    assert.deepEqual(scientificFields(remoteRun), scientificFields(localRun), 'same poses, scores, inputs and hashes');
  });

  test('bounded OpenMM MD runs remotely and keeps its honest replay limitation', { skip: !MD_ON && missing('OpenMM') }, async () => {
    const fx = seed(db, 'CCO');
    const executionId = plan(db, fx, 'molecular-dynamics', { params: { steps: 100 } });
    const r = await exec(db, fx, executionId, { workerConfig: configAll() });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.result.status, EXECUTION_STATUS.EXECUTED);
    assert.equal(r.result.dispatch.workerGroup, 'structural');
    for (const limitation of MD_LIMITATIONS) assert.ok(r.result.limitations.includes(limitation));
    const run = getScienceRun(db, r.result.scienceRunId);
    assert.equal(run.inputs.steps, 100);
    const replay = replayVirtualExperiment(db, { campaignId: fx.campaignId, candidateId: fx.candidateId, executionId });
    assert.equal(replay.replay.replayStatus, REPLAY_STATUS.UNSUPPORTED, 'never a fabricated MATCH');
  });
});

describe('4. ADMET worker dispatch (ADMET-AI)', () => {
  test('admet-estimation and toxicity-risk-estimation run remotely on the isolated admet worker', { skip: !ADMET_ON && missing('ADMET-AI') }, async () => {
    const fx = seed(db, 'CC(=O)Oc1ccccc1C(=O)O');
    const before = admetWorker.calls.length;
    const a = await exec(db, fx, plan(db, fx, 'admet-estimation'), { workerConfig: configAll() });
    const t = await exec(db, fx, plan(db, fx, 'toxicity-risk-estimation'), { workerConfig: configAll() });
    assert.equal(a.result.status, EXECUTION_STATUS.EXECUTED, JSON.stringify(a));
    assert.equal(t.result.status, EXECUTION_STATUS.EXECUTED, JSON.stringify(t));
    assert.equal(a.result.dispatch.workerGroup, 'admet');
    assert.equal(admetWorker.calls.length, before + 2);
    const admetRun = getScienceRun(db, a.result.scienceRunId);
    const toxRun = getScienceRun(db, t.result.scienceRunId);
    assert.equal(admetRun.capability, 'admet-estimation');
    assert.equal(toxRun.capability, 'toxicity-risk-estimation');
    assert.ok(Object.keys(toxRun.outputs).length > 0);
    assert.equal(listScienceRuns(db, fx.campaignId).length, 2, 'exactly one run per remote execution');

    // Parity with the local ADMET path within the replay engine's own documented ADMET tolerance.
    const local = seed(db, 'CC(=O)Oc1ccccc1C(=O)O');
    const l = await exec(db, local, plan(db, local, 'admet-estimation'), { workerConfig: resolveWorkerConfig({}) });
    const localRun = getScienceRun(db, l.result.scienceRunId);
    assert.deepEqual(Object.keys(admetRun.outputs).sort(), Object.keys(localRun.outputs).sort());
    assert.ok(maxRelativeDiff(localRun.outputs, admetRun.outputs) <= 1e-4);
  });
});

describe('5-7. honest blocked states — nothing fabricated, nothing silently run elsewhere', () => {
  test('5. worker URL set but token missing -> BLOCKED_WORKER_NOT_CONFIGURED, retryable, no RESULT', async () => {
    const fx = seed(db, 'CCO');
    const executionId = plan(db, fx, 'quantum-chemistry');
    const config = resolveWorkerConfig({ GENESIS_CHEM_LIGHT_WORKER_URL: chem.url });
    const before = chem.calls.length;
    const r = await exec(db, fx, executionId, { workerConfig: config });
    assert.equal(r.ok, false);
    assert.equal(r.error, DISPATCH_STATE.BLOCKED_WORKER_NOT_CONFIGURED);
    assert.equal(r.retryable, true);
    assert.equal(chem.calls.length, before);
    assert.equal(eventsOf(db, fx, VIRTUAL_EVENT.RESULT).length, 0);
    assert.equal(eventsOf(db, fx, VIRTUAL_EVENT.DISPATCH_FAILED).length, 1);
    assert.equal(listScienceRuns(db, fx.campaignId).length, 0, 'no silent local fallback even though PySCF may be installed here');
  });

  test('6. unreachable worker -> BLOCKED_WORKER_UNAVAILABLE; a later retry with a healthy worker executes exactly once', { skip: !QM_ON && missing('PySCF') }, async () => {
    const fx = seed(db, 'CCO');
    const executionId = plan(db, fx, 'quantum-chemistry');
    const down = await exec(db, fx, executionId, { workerConfig: configAll({ GENESIS_CHEM_LIGHT_WORKER_URL: await closedPortUrl() }) });
    assert.equal(down.ok, false);
    assert.equal(down.error, DISPATCH_STATE.BLOCKED_WORKER_UNAVAILABLE);
    assert.equal(down.status, EXECUTION_STATUS.BLOCKED_RUNTIME_UNAVAILABLE);
    assert.equal(listScienceRuns(db, fx.campaignId).length, 0);
    const dossier = buildVirtualLabDossier(db, fx.campaignId, fx.candidateId).dossier;
    assert.equal(dossier.results.length, 0);
    assert.equal(dossier.dispatchFailures.length, 1);
    assert.equal(dossier.nextAction.reason, 'REMOTE_DISPATCH_FAILED_RETRYABLE');
    assert.ok(dossier.executionTimeline.some((e) => e.status === 'BLOCKED' && e.detail.includes('BLOCKED_WORKER_UNAVAILABLE')));

    const up = await exec(db, fx, executionId, { workerConfig: configAll() });
    assert.equal(up.ok, true);
    assert.equal(up.result.status, EXECUTION_STATUS.EXECUTED);
    assert.equal(listScienceRuns(db, fx.campaignId).length, 1);
    assert.equal(eventsOf(db, fx, VIRTUAL_EVENT.RESULT).length, 1);
  });

  test('7. timeout -> WORKER_TIMEOUT, retryable, nothing persisted as a result', async () => {
    const hanging = await startFakeServer(() => { /* never answers */ });
    try {
      const fx = seed(db, 'CCO');
      const executionId = plan(db, fx, 'protein-structure-ingestion', { params: { pdbText: 'ATOM      1  N   ALA A   1       0.000   0.000   0.000  1.00  0.00           N\nEND\n' } });
      const config = configAll({ GENESIS_CHEM_LIGHT_WORKER_URL: hanging.url });
      const client = createRemoteScientificWorkerClient({ config, timeoutMs: 250 });
      const r = await exec(db, fx, executionId, { workerConfig: config, client });
      assert.equal(r.ok, false);
      assert.equal(r.error, DISPATCH_STATE.WORKER_TIMEOUT);
      assert.equal(r.retryable, true);
      assert.equal(eventsOf(db, fx, VIRTUAL_EVENT.RESULT).length, 0);
    } finally {
      await hanging.close();
    }
  });
});

describe('8-10. invalid worker responses are discarded, never persisted', () => {
  const tamperCases = [
    ['8. invalid response (unexpected envelope field)', (json) => ({ ...json, note: 'extra' })],
    ['9. wrong engine identity', (json) => ({ ...json, engine: { ...json.engine, name: 'NotPySCF' } })],
    ['10. output-hash mismatch', (json) => ({ ...json, result: { ...json.result, data: { ...json.result.data, energyHartree: -1 } } })],
  ];
  for (const [name, mutate] of tamperCases) {
    test(name, { skip: !QM_ON && missing('PySCF') }, async () => {
      const proxy = await startTamperingProxy(chem.url, mutate);
      try {
        const fx = seed(db, 'CCO');
        const executionId = plan(db, fx, 'quantum-chemistry');
        const r = await exec(db, fx, executionId, { workerConfig: configAll({ GENESIS_CHEM_LIGHT_WORKER_URL: proxy.url }) });
        assert.equal(r.ok, false);
        assert.equal(r.error, DISPATCH_STATE.WORKER_RESPONSE_INVALID);
        assert.equal(listScienceRuns(db, fx.campaignId).length, 0);
        assert.equal(eventsOf(db, fx, VIRTUAL_EVENT.RESULT).length, 0);
      } finally {
        await proxy.close();
      }
    });
  }
});

describe('13, 16. idempotency — ScienceRun persisted exactly once', () => {
  test('a repeated call is deduped and concurrent calls share one worker execution', { skip: !QM_ON && missing('PySCF') }, async () => {
    const fx = seed(db, 'CCO');
    const executionId = plan(db, fx, 'quantum-chemistry');
    const before = chem.calls.length;
    const [a, b] = await Promise.all([exec(db, fx, executionId, { workerConfig: configAll() }), exec(db, fx, executionId, { workerConfig: configAll() })]);
    assert.equal(a.result.scienceRunId, b.result.scienceRunId);
    assert.equal(chem.calls.length, before + 1, 'one worker execution for two concurrent calls');
    const again = await exec(db, fx, executionId, { workerConfig: configAll() });
    assert.equal(again.deduped, true);
    assert.equal(again.result.scienceRunId, a.result.scienceRunId);
    assert.equal(listScienceRuns(db, fx.campaignId).length, 1);
    assert.equal(eventsOf(db, fx, VIRTUAL_EVENT.RESULT).length, 1);
    assert.equal(chem.calls.length, before + 1);
  });
});

describe('9 (isolation). the worker never sees tenancy, and tenancy is enforced in the main service', () => {
  test('the wire request carries only scientific input; a plan cannot be executed under another campaign', { skip: !QM_ON && missing('PySCF') }, async () => {
    const fx = seed(db, 'CCO');
    const other = seed(db, 'CCO');
    const executionId = plan(db, fx, 'quantum-chemistry');
    const sent = [];
    const config = configAll();
    const client = createRemoteScientificWorkerClient({
      config,
      fetchImpl: (url, init) => { sent.push(JSON.parse(init.body)); return fetch(url, init); },
    });
    const r = await exec(db, fx, executionId, { workerConfig: config, client });
    assert.equal(r.result.status, EXECUTION_STATUS.EXECUTED);
    const wire = JSON.stringify(sent);
    for (const id of [fx.projectId, fx.campaignId, fx.candidateId]) assert.ok(!wire.includes(id), 'no tenancy id leaves the main service');
    assert.ok(!wire.includes('Probe quantum-chemistry'), 'the hypothesis stays in the main service');
    assert.deepEqual(Object.keys(sent[0]).sort(), ['capabilityId', 'contractVersion', 'executionId', 'input', 'inputFingerprint']);

    const crossCampaign = await executeVirtualExperimentDispatched(db, { campaignId: other.campaignId, candidateId: fx.candidateId, executionId }, { workerConfig: config });
    assert.equal(crossCampaign.ok, false);
    assert.equal(crossCampaign.error, 'candidate_not_found');
    const crossPlan = await executeVirtualExperimentDispatched(db, { campaignId: other.campaignId, candidateId: other.candidateId, executionId }, { workerConfig: config });
    assert.equal(crossPlan.error, 'plan_not_found');
  });
});

describe('19. a client cannot submit a fabricated output', () => {
  test('outputs or a classification smuggled into plan params block the experiment before any worker call', async () => {
    const fx = seed(db, 'CCO');
    const executionId = plan(db, fx, 'quantum-chemistry', {
      params: { method: 'RHF', outputs: { energyHartree: -999 }, epistemicClassification: 'IN_SILICO_SUPPORT' },
    });
    const before = chem.calls.length;
    const r = await exec(db, fx, executionId, { workerConfig: configAll() });
    assert.equal(r.ok, true);
    assert.equal(r.result.status, EXECUTION_STATUS.BLOCKED_INVALID_INPUT);
    assert.equal(r.result.dispatch.state, DISPATCH_STATE.BLOCKED_INVALID_INPUT);
    assert.equal(r.result.epistemicClassification, EPISTEMIC_CLASSIFICATION.UNKNOWN);
    assert.equal(r.result.derivedOutput, null);
    assert.equal(chem.calls.length, before);
    assert.equal(listScienceRuns(db, fx.campaignId).length, 0);
  });

  test('a worker that tries to supply a classification is rejected as an invalid response', { skip: !QM_ON && missing('PySCF') }, async () => {
    const proxy = await startTamperingProxy(chem.url, (json) => ({ ...json, epistemicClassification: 'IN_SILICO_SUPPORT' }));
    try {
      const fx = seed(db, 'CCO');
      const r = await exec(db, fx, plan(db, fx, 'quantum-chemistry'), { workerConfig: configAll({ GENESIS_CHEM_LIGHT_WORKER_URL: proxy.url }) });
      assert.equal(r.error, DISPATCH_STATE.WORKER_RESPONSE_INVALID);
      assert.equal(listScienceRuns(db, fx.campaignId).length, 0);
    } finally {
      await proxy.close();
    }
  });
});

describe('20. local and remote execution share one scientific classification boundary', () => {
  test('the same expectation yields the same classification whichever route ran the engine', { skip: !QM_ON && missing('PySCF') }, async () => {
    for (const [comparator, expected] of [['GTE', EPISTEMIC_CLASSIFICATION.IN_SILICO_CONFLICT], ['LTE', EPISTEMIC_CLASSIFICATION.IN_SILICO_SUPPORT]]) {
      const expectation = { outputKey: 'energyHartree', comparator, threshold: 0 };
      const local = seed(db, 'CCO');
      const remote = seed(db, 'CCO');
      const l = await exec(db, local, plan(db, local, 'quantum-chemistry', { expectation }), { workerConfig: resolveWorkerConfig({}) });
      const r = await exec(db, remote, plan(db, remote, 'quantum-chemistry', { expectation }), { workerConfig: configAll() });
      assert.equal(l.result.dispatch.mode, DISPATCH_STATE.LOCAL_EXECUTION);
      assert.equal(r.result.dispatch.mode, DISPATCH_STATE.REMOTE_EXECUTION);
      assert.equal(l.result.epistemicClassification, expected);
      assert.equal(r.result.epistemicClassification, expected);
    }
  });

  test('without an expectation both routes stay at COMPUTATIONAL_HYPOTHESIS; evidence stays in-silico', { skip: !QM_ON && missing('PySCF') }, async () => {
    const fx = seed(db, 'CCO');
    const r = await exec(db, fx, plan(db, fx, 'quantum-chemistry'), { workerConfig: configAll() });
    assert.equal(r.result.epistemicClassification, EPISTEMIC_CLASSIFICATION.COMPUTATIONAL_HYPOTHESIS);
    assert.equal(r.result.clinicalEfficacy, 'UNKNOWN');
  });
});

describe('17. Evidence proposal deduplicated through the API (the production entry point)', () => {
  const ENV_KEYS = ['GENESIS_SCIENTIFIC_WORKER_TOKEN', 'GENESIS_CHEM_LIGHT_WORKER_URL', 'GENESIS_STRUCTURAL_WORKER_URL', 'GENESIS_ADMET_WORKER_URL'];
  let saved;
  before(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  });
  after(() => {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  });

  test('retries through the API reuse one ScienceRun and one Evidence proposal; a transport failure is a 503', { skip: !QM_ON && missing('PySCF') }, async () => {
    const call = (method, pathname, { token, body, query } = {}) => handleApi(db, { method, pathname, token, body, query });
    const owner = (await call('POST', '/api/auth/register', { body: { email: `remote-api-${Date.now()}@lab.org`, password: 'password123' } })).body;
    const project = (await call('POST', '/api/projects', { token: owner.token, body: { name: 'Remote dispatch API' } })).body.project;
    const campaign = campaignStore.createCampaign(db, {
      projectId: project.id, objective: 'Remote dispatch API fixture', domain: 'DRUG_DISCOVERY',
      budget: { maxGenerations: 1, maxGeneratedCandidates: 4 }, stopping: { patience: 3, minImprovement: 1e-4, diversityFloor: 0.05 },
      strategy: { startingSmiles: ['c1ccccc1'], transformationWeights: {}, parentSelection: 'pareto' }, createdBy: owner.user.id,
    });
    const candidateId = campaignStore.addCandidate(db, { campaignId: campaign.id, generation: 0, canonicalSmiles: 'CCO', valid: true, status: 'retained' });
    const base = `/api/projects/${project.id}/campaigns/${campaign.id}/virtual-lab`;

    const planned = await call('POST', base, {
      token: owner.token,
      body: { candidateId, hypothesis: 'Ethanol has a negative RHF/STO-3G total energy.', requestedCapability: 'quantum-chemistry', expectation: { outputKey: 'energyHartree', comparator: 'LTE', threshold: 0 } },
    });
    assert.equal(planned.status, 201);
    const executionId = planned.body.plan.executionId;

    process.env.GENESIS_SCIENTIFIC_WORKER_TOKEN = TEST_WORKER_TOKEN;
    process.env.GENESIS_CHEM_LIGHT_WORKER_URL = await closedPortUrl();
    const unavailable = await call('POST', `${base}/execute`, { token: owner.token, body: { candidateId, executionId } });
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.error, DISPATCH_STATE.BLOCKED_WORKER_UNAVAILABLE);

    process.env.GENESIS_CHEM_LIGHT_WORKER_URL = chem.url;
    const first = await call('POST', `${base}/execute`, { token: owner.token, body: { candidateId, executionId } });
    const second = await call('POST', `${base}/execute`, { token: owner.token, body: { candidateId, executionId } });
    assert.equal(first.status, 201);
    assert.equal(first.body.result.dispatch.mode, DISPATCH_STATE.REMOTE_EXECUTION);
    assert.equal(first.body.result.epistemicClassification, EPISTEMIC_CLASSIFICATION.IN_SILICO_SUPPORT);
    assert.equal(second.body.deduped, true);
    assert.equal(second.body.evidenceProposal.proposalId, first.body.evidenceProposal.proposalId, 'one proposal on the canonical ledger');
    const pending = knowledgeApi.listProposals().proposals.filter((p) => p.proposalId === first.body.evidenceProposal.proposalId);
    assert.equal(pending.length, 1);
    assert.equal(pending[0].status, 'pending', 'propose-only, never auto-published');

    // Linking the same proposal again is itself idempotent.
    const relinked = linkVirtualExperimentEvidenceProposal(db, { campaignId: campaign.id, candidateId, executionId, proposalId: first.body.evidenceProposal.proposalId });
    assert.equal(relinked.deduped, true);

    const dossier = await call('GET', base, { token: owner.token, query: { candidate: candidateId } });
    assert.equal(dossier.body.dossier.results.length, 1);
    assert.equal(dossier.body.dossier.evidenceLinks.length, 1);
    assert.equal(dossier.body.dossier.dispatchFailures.length, 1);
    assert.equal(listScienceRuns(db, campaign.id).length, 1);

    const replayed = await call('POST', `${base}/${executionId}/replay`, { token: owner.token, body: { candidateId } });
    assert.equal(replayed.status, 201);
    assert.equal(replayed.body.replay.replayStatus, REPLAY_STATUS.MATCH);
  });
});

describe('production topology — a main service WITHOUT PySCF dispatching to a worker WITH it', () => {
  const execFileAsync = promisify(execFile);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const moduleUrl = (rel) => pathToFileURL(path.join(here, rel)).href;
  const childScript = `
    const { openDatabase, createUser, createProject } = await import(${JSON.stringify(moduleUrl('../store.mjs'))});
    const { hashPassword } = await import(${JSON.stringify(moduleUrl('../auth.mjs'))});
    const store = await import(${JSON.stringify(moduleUrl('./persistence.mjs'))});
    const vlab = await import(${JSON.stringify(moduleUrl('./virtualLabClosedLoop.mjs'))});
    const { capabilityAvailable } = await import(${JSON.stringify(moduleUrl('./toolchain.mjs'))});
    const db = openDatabase();
    const user = createUser(db, { email: 'topology@lab.org', displayName: 'topology', passwordHash: hashPassword('password123') });
    const project = createProject(db, { name: 'Topology', ownerId: user.id });
    const campaign = store.createCampaign(db, { projectId: project.id, objective: 'topology', domain: 'DRUG_DISCOVERY',
      budget: { maxGenerations: 1, maxGeneratedCandidates: 4 }, stopping: { patience: 3, minImprovement: 1e-4, diversityFloor: 0.05 },
      strategy: { startingSmiles: ['c1ccccc1'], transformationWeights: {}, parentSelection: 'pareto' }, createdBy: user.id });
    const candidateId = store.addCandidate(db, { campaignId: campaign.id, generation: 0, canonicalSmiles: 'CCO', valid: true, status: 'retained' });
    const planned = vlab.planVirtualExperiment(db, { projectId: project.id, campaignId: campaign.id, candidateId,
      hypothesis: 'Topology probe', requestedCapability: 'quantum-chemistry', expectation: { outputKey: 'energyHartree', comparator: 'LTE', threshold: 0 } });
    const executed = await vlab.executeVirtualExperimentDispatched(db, { campaignId: campaign.id, candidateId, executionId: planned.plan.executionId });
    const replay = executed.ok && executed.result.scienceRunId
      ? await vlab.replayVirtualExperimentDispatched(db, { campaignId: campaign.id, candidateId, executionId: planned.plan.executionId }) : null;
    process.stdout.write(JSON.stringify({ localQm: capabilityAvailable('quantum-chemistry'), executed, replay }));
  `;
  const runChild = async (env) => {
    const { stdout } = await execFileAsync(process.execPath, ['--no-warnings', '--input-type=module', '-e', childScript], {
      env: { ...process.env, GENESIS_PYSCF_PYTHON: '/nonexistent/genesis-no-pyscf/python3', ...env },
      timeout: 240_000, maxBuffer: 8 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  };

  test('with the chem-light worker configured, QM executes and replays remotely while the main process has no PySCF', { skip: !QM_ON && missing('PySCF (for the worker)') }, async () => {
    const out = await runChild({ GENESIS_SCIENTIFIC_WORKER_TOKEN: TEST_WORKER_TOKEN, GENESIS_CHEM_LIGHT_WORKER_URL: chem.url });
    assert.equal(out.localQm, false, 'the main service really has no PySCF');
    assert.equal(out.executed.ok, true, JSON.stringify(out.executed));
    assert.equal(out.executed.result.status, EXECUTION_STATUS.EXECUTED);
    assert.equal(out.executed.result.dispatch.mode, DISPATCH_STATE.REMOTE_EXECUTION);
    assert.equal(out.executed.result.selectedEngine.engineName, 'PySCF');
    assert.match(out.executed.result.selectedEngine.engineVersion, /^\d+\.\d+/, 'the version the worker proved, not the absent local one');
    assert.equal(out.executed.result.epistemicClassification, EPISTEMIC_CLASSIFICATION.IN_SILICO_SUPPORT);
    assert.equal(out.replay.replay.replayStatus, REPLAY_STATUS.MATCH);
  });

  test('without any worker configured, the same experiment is persisted as BLOCKED_WORKER_NOT_CONFIGURED', async () => {
    const out = await runChild({
      GENESIS_SCIENTIFIC_WORKER_TOKEN: '', GENESIS_CHEM_LIGHT_WORKER_URL: '', GENESIS_STRUCTURAL_WORKER_URL: '', GENESIS_ADMET_WORKER_URL: '',
    });
    assert.equal(out.localQm, false);
    assert.equal(out.executed.ok, true);
    assert.equal(out.executed.result.status, EXECUTION_STATUS.BLOCKED_RUNTIME_UNAVAILABLE);
    assert.equal(out.executed.result.dispatch.state, DISPATCH_STATE.BLOCKED_WORKER_NOT_CONFIGURED);
    assert.ok(out.executed.result.reason.includes('GENESIS_CHEM_LIGHT_WORKER_URL'));
    assert.equal(out.executed.result.scienceRunId, null);
  });
});
