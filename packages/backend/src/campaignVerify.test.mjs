import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser, createProject, listScienceRuns, saveScienceRun } from './store.mjs';
import { hashPassword } from './auth.mjs';
import { detect as dockDetect } from './compute/dockingAdapter.mjs';
import { detect as qmDetect } from './compute/qmAdapter.mjs';
import { detect as admetDetect } from './compute/admetAdapter.mjs';
import { availableTransformations } from './campaign/drugAdapter.mjs';
import { createCampaign } from './campaign/persistence.mjs';
import { runCampaign } from './campaign/orchestrator.mjs';
import { runMultiFidelityStage } from './campaign/multiFidelity.mjs';
import { replayScienceRun, verifyScienceRun, getVerificationHistory, VERDICT } from './campaign/verify.mjs';

/**
 * Scientific Reproducibility (Priority B) — replay-verification on REAL
 * engines. A Scientific Run is re-executed from its stored inputs and
 * compared against the stored output; the verdict must reflect what was
 * actually measured (see campaign/verify.mjs for why docking/QM use a
 * tolerance of 0 while ADMET-AI does not — a real, measured finding).
 */
const DOCK = dockDetect().available;
const QM = qmDetect().available;
const ADMET = admetDetect().available;

function seedCampaign(db) {
  const u = createUser(db, { email: 'verify@lab.org', displayName: 'V', passwordHash: hashPassword('password123') });
  const p = createProject(db, { name: 'V', ownerId: u.id });
  const tx = availableTransformations();
  const c = createCampaign(db, {
    projectId: p.id, objective: 'MPO + docking (software validation)', domain: 'DRUG_DISCOVERY',
    budget: { maxGenerations: 1, maxGeneratedCandidates: 6 },
    stopping: { patience: 3, minImprovement: 1e-4, diversityFloor: 0.05 },
    strategy: { startingSmiles: ['c1ccccc1', 'Oc1ccccc1'], transformationWeights: Object.fromEntries(tx.map((t) => [t, 1])), parentSelection: 'pareto' },
    createdBy: u.id,
  });
  runCampaign(db, c.id);
  return { campaignId: c.id, projectId: p.id };
}

describe('replay verification of real Scientific Runs', () => {
  (DOCK ? test : test.skip)('molecular-docking replay matches exactly (deterministic seeded search)', () => {
    const db = openDatabase(':memory:');
    const { campaignId } = seedCampaign(db);
    runMultiFidelityStage(db, campaignId, { docking: { enabled: true, budget: 1 } });
    const [run] = listScienceRuns(db, campaignId).filter((r) => r.capability === 'molecular-docking');
    assert.ok(run, 'expected a persisted docking run');
    const v = verifyScienceRun(db, run.id);
    assert.equal(v.ok, true);
    assert.equal(v.verification.verdict, VERDICT.MATCH);
    assert.equal(v.verification.detail.maxRelativeDiff, 0, 'docking must be bit-exact reproducible');
  });

  (QM ? test : test.skip)('quantum-chemistry replay matches exactly (deterministic HF/fixed geometry)', () => {
    const db = openDatabase(':memory:');
    const { campaignId } = seedCampaign(db);
    runMultiFidelityStage(db, campaignId, { quantum: { enabled: true, budget: 1 } });
    const [run] = listScienceRuns(db, campaignId).filter((r) => r.capability === 'quantum-chemistry');
    assert.ok(run, 'expected a persisted quantum-chemistry run');
    const v = verifyScienceRun(db, run.id);
    assert.equal(v.ok, true);
    assert.equal(v.verification.verdict, VERDICT.MATCH);
  });

  (ADMET ? test : test.skip)('admet-estimation replay matches within the documented batch-composition tolerance', () => {
    const db = openDatabase(':memory:');
    const { campaignId } = seedCampaign(db);
    runMultiFidelityStage(db, campaignId, { admet: { enabled: true } });
    const runs = listScienceRuns(db, campaignId).filter((r) => r.capability === 'admet-estimation');
    assert.ok(runs.length >= 1, 'expected persisted admet-estimation runs');
    const v = verifyScienceRun(db, runs[0].id);
    assert.equal(v.ok, true);
    assert.equal(v.verification.verdict, VERDICT.MATCH, `expected MATCH within tolerance, got detail=${JSON.stringify(v.verification.detail)}`);
    assert.ok(v.verification.detail.maxRelativeDiff <= v.verification.detail.tolerance);
  });

  (ADMET ? test : test.skip)('verification history is append-only, never overwritten', () => {
    const db = openDatabase(':memory:');
    const { campaignId } = seedCampaign(db);
    runMultiFidelityStage(db, campaignId, { admet: { enabled: true } });
    const [run] = listScienceRuns(db, campaignId).filter((r) => r.capability === 'admet-estimation');
    verifyScienceRun(db, run.id);
    const afterFirst = getVerificationHistory(db, run.id);
    assert.equal(afterFirst.length, 1);
    verifyScienceRun(db, run.id);
    const afterSecond = getVerificationHistory(db, run.id);
    assert.equal(afterSecond.length, 2, 'a second verify must append, not replace');
    assert.equal(afterSecond[0].id, afterFirst[0].id, 'the first record must be untouched');
  });

  test('replaying a nonexistent run is honest, never fabricated', () => {
    const db = openDatabase(':memory:');
    const r = replayScienceRun(db, 'does-not-exist');
    assert.equal(r.ok, false);
    assert.equal(r.error, 'run_not_found');
    const v = verifyScienceRun(db, 'does-not-exist');
    assert.equal(v.ok, false);
  });

  test('a capability with no wired replay path returns REPLAY_UNSUPPORTED, not a crash or a fabricated MATCH', () => {
    const db = openDatabase(':memory:');
    const u = createUser(db, { email: 'unsup@lab.org', displayName: 'U', passwordHash: hashPassword('password123') });
    const p = createProject(db, { name: 'U', ownerId: u.id });
    const run = saveScienceRun(db, {
      projectId: p.id, campaignId: null, candidateId: null,
      engine: 'Biopython', engineVersion: '1.87', capability: 'protein-structure-ingestion',
      method: 'parse', status: 'ok', evidenceClass: 'DETERMINISTIC',
      inputs: { pdb: 'ATOM ...' }, outputs: { chains: 1 }, units: {}, warnings: [], provenance: {},
      inputHash: 'abc', outputHash: 'def', artifacts: [], durationMs: 5,
    });
    const r = replayScienceRun(db, run.id);
    assert.equal(r.ok, true);
    assert.equal(r.verdict, VERDICT.REPLAY_UNSUPPORTED);
  });
});
