import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser, createProject, listScienceRuns } from './store.mjs';
import { hashPassword } from './auth.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';
import { detect as dockDetect } from './compute/dockingAdapter.mjs';
import { detect as qmDetect } from './compute/qmAdapter.mjs';
import { createCampaign, addCandidate, listEvents } from './campaign/persistence.mjs';
import { runMultiFidelityStage, dockCandidate, qmCandidate, detectDescriptorDockingConflict, STAGE_REASON } from './campaign/multiFidelity.mjs';

/**
 * Overnight Science Task 6 (Drug Discovery): the two gaps identified by audit against the
 * required flow — a REAL, unmocked engine failure (not BLOCKED_BY_RUNTIME, not success) must
 * produce a FAILED stage result rather than being silently dropped, and the descriptor/docking
 * MODEL_CONFLICT detector must itself be exercised directly, not only its downstream consumer.
 * Neither test mocks or stubs an engine — an invalid ligand SMILES makes AutoDock Vina/Meeko and
 * PySCF's RDKit 3D-embed step genuinely fail, exactly the failure path a real bad candidate would
 * hit in production.
 */
const RDKIT = rdkitDetect().available;
const DOCK = dockDetect().available;
const QM = qmDetect().available;

function seedProject(db) {
  const u = createUser(db, { email: 'ddfp@lab.org', displayName: 'DDFP', passwordHash: hashPassword('password123') });
  return createProject(db, { name: 'DDFP', ownerId: u.id });
}

function seedCampaignShell(db) {
  const p = seedProject(db);
  return createCampaign(db, {
    projectId: p.id, objective: 'Failure-path proof (software validation)', domain: 'DRUG_DISCOVERY',
    budget: { maxGenerations: 1, maxGeneratedCandidates: 1 },
    stopping: { patience: 1, minImprovement: 1e-4, diversityFloor: 0.05 },
    strategy: { startingSmiles: [], transformationWeights: {}, parentSelection: 'pareto' },
  });
}

/** A candidate object that never went through the real generation pipeline, deliberately carrying
 * a ligand string no chemistry engine can parse -- the honest way to force a REAL engine failure. */
function invalidCandidate(overrides = {}) {
  return {
    id: 'synthetic-invalid-candidate', canonicalSmiles: 'NOT_A_VALID_SMILES###', objectiveVector: { x: 0 }, generation: 0,
    ...overrides,
  };
}

describe('dockCandidate — a real, unmocked docking failure is FAILED, not dropped', () => {
  (RDKIT && DOCK ? test : test.skip)('an unparseable ligand produces ok:false with a real engine error, never a fabricated pose', () => {
    const db = openDatabase();
    const campaign = seedCampaignShell(db);
    const ctx = { campaignId: campaign.id, projectId: campaign.projectId };
    const r = dockCandidate(db, ctx, invalidCandidate(), { receptorSmiles: 'c1ccc2[nH]ccc2c1', center: [0, 0, 0] });
    assert.equal(r.ok, false);
    assert.ok(typeof r.error === 'string' && r.error.length > 0);
    assert.equal(listScienceRuns(db, campaign.id).length, 0, 'a failed dock persists no Scientific Run');
  });

  (RDKIT && DOCK ? test : test.skip)('runMultiFidelityStage persists DOCKING_FAILED for the real failure and keeps the candidate visible, never silently dropped', () => {
    const db = openDatabase();
    const campaign = seedCampaignShell(db);
    addCandidate(db, { campaignId: campaign.id, generation: 0, canonicalSmiles: 'NOT_A_VALID_SMILES###', objectiveVector: { x: 0 }, pareto: true, status: 'retained' });

    const report = runMultiFidelityStage(db, campaign.id, { docking: { enabled: true, budget: 1, receptor: { receptorSmiles: 'c1ccc2[nH]ccc2c1', center: [0, 0, 0] } } });
    assert.equal(report.docking.executed, true);
    const failedEntry = report.docking.docked.find((d) => d.failed);
    assert.ok(failedEntry, 'the failed candidate is reported, not omitted');
    assert.ok(typeof failedEntry.error === 'string' && failedEntry.error.length > 0);

    const events = listEvents(db, campaign.id).filter((e) => e.type === 'STAGE_RESULT' && e.payload.stage === 'docking');
    assert.ok(events.some((e) => e.payload.reason === STAGE_REASON.DOCKING_FAILED), 'a real DOCKING_FAILED event is persisted');
    assert.equal(listScienceRuns(db, campaign.id).filter((r) => r.capability === 'molecular-docking').length, 0, 'no Scientific Run is fabricated for the failed run');
  });
});

describe('qmCandidate — a real, unmocked QM failure is FAILED, not dropped', () => {
  (RDKIT && QM ? test : test.skip)('an unparseable ligand fails 3D embedding with a real RDKit error, never a fabricated energy', () => {
    const db = openDatabase();
    const campaign = seedCampaignShell(db);
    const ctx = { campaignId: campaign.id, projectId: campaign.projectId };
    const r = qmCandidate(db, ctx, invalidCandidate());
    assert.equal(r.ok, false);
    assert.equal(r.error, 'embed_failed');
    assert.equal(listScienceRuns(db, campaign.id).length, 0, 'a failed QM single-point persists no Scientific Run');
  });

  (RDKIT && QM ? test : test.skip)('runMultiFidelityStage persists QM_FAILED for the real failure and keeps the candidate visible, never silently dropped', () => {
    const db = openDatabase();
    const campaign = seedCampaignShell(db);
    addCandidate(db, { campaignId: campaign.id, generation: 0, canonicalSmiles: 'NOT_A_VALID_SMILES###', objectiveVector: { x: 0 }, pareto: true, status: 'retained' });

    const report = runMultiFidelityStage(db, campaign.id, { quantum: { enabled: true, budget: 1 } });
    assert.equal(report.quantum.executed, true);
    const failedEntry = report.quantum.computed.find((c) => c.failed);
    assert.ok(failedEntry, 'the failed candidate is reported, not omitted');
    assert.equal(failedEntry.error, 'embed_failed');

    const events = listEvents(db, campaign.id).filter((e) => e.type === 'STAGE_RESULT' && e.payload.stage === 'quantum');
    assert.ok(events.some((e) => e.payload.reason === STAGE_REASON.QM_FAILED), 'a real QM_FAILED event is persisted');
  });
});

describe('detectDescriptorDockingConflict — the MODEL_CONFLICT producer itself, not just its consumer', () => {
  test('a favorable descriptor scalar with a poor real docking affinity is classified MODEL_CONFLICT and persisted, never averaged', () => {
    const db = openDatabase();
    const campaign = seedCampaignShell(db);
    const ctx = { campaignId: campaign.id, projectId: campaign.projectId };
    const cand = { id: 'cand-conflict', campaignId: campaign.id, generation: 0, canonicalSmiles: 'c1ccccc1', objectiveVector: { x: 0.5 } };

    const conflict = detectDescriptorDockingConflict(db, ctx, cand, -1.0, { affinityThreshold: -3.0, scalarThreshold: 1.5 });
    assert.ok(conflict, 'favorable descriptor (0.5 <= 1.5) + poor docking (-1.0 > -3.0) is a real conflict');
    assert.equal(conflict.classification, 'MODEL_CONFLICT');
    assert.equal(conflict.resultA.engine, 'RDKit descriptors (MPO scalar)');
    assert.equal(conflict.resultB.engine, 'AutoDock Vina (docking)');

    const events = listEvents(db, campaign.id).filter((e) => e.type === 'MODEL_CONFLICT');
    assert.equal(events.length, 1);
    assert.equal(events[0].payload.candidateId, 'cand-conflict');
  });

  test('agreeing descriptor and docking results never produce a fabricated conflict', () => {
    const db = openDatabase();
    const campaign = seedCampaignShell(db);
    const ctx = { campaignId: campaign.id, projectId: campaign.projectId };
    const cand = { id: 'cand-agree', campaignId: campaign.id, generation: 0, canonicalSmiles: 'c1ccccc1', objectiveVector: { x: 0.5 } };

    const conflict = detectDescriptorDockingConflict(db, ctx, cand, -8.0, { affinityThreshold: -3.0, scalarThreshold: 1.5 });
    assert.equal(conflict, null, 'strong docking (-8.0 < -3.0) agrees with the favorable descriptor — no conflict invented');
    assert.equal(listEvents(db, campaign.id).filter((e) => e.type === 'MODEL_CONFLICT').length, 0);
  });
});
