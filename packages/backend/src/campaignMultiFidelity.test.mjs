import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser, createProject, listScienceRuns, listScienceRunsForCandidate } from './store.mjs';
import { hashPassword } from './auth.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';
import { detect as dockDetect } from './compute/dockingAdapter.mjs';
import { detect as qmDetect } from './compute/qmAdapter.mjs';
import { detect as admetDetect } from './compute/admetAdapter.mjs';
import { availableTransformations } from './campaign/drugAdapter.mjs';
import { createCampaign, listCandidates, listEvents } from './campaign/persistence.mjs';
import { runCampaign } from './campaign/orchestrator.mjs';
import { selectForStage, runMultiFidelityStage, buildScientificComputeReport } from './campaign/multiFidelity.mjs';

/**
 * Multi-fidelity: RDKit (cheap) → ADMET/toxicity filter → docking/QM (expensive)
 * on REAL engines. Every stage result is a persisted Scientific Run with
 * artifacts/hashes/provenance. Slow paths skipped when the engine is unavailable.
 */
const RDKIT = rdkitDetect().available;
const DOCK = dockDetect().available;
const QM = qmDetect().available;
const ADMET = admetDetect().available;

function seedCampaign(db) {
  const u = createUser(db, { email: 'mf@lab.org', displayName: 'MF', passwordHash: hashPassword('password123') });
  const p = createProject(db, { name: 'MF', ownerId: u.id });
  const tx = availableTransformations();
  const c = createCampaign(db, {
    projectId: p.id, objective: 'MPO + docking (software validation)', domain: 'DRUG_DISCOVERY',
    budget: { maxGenerations: 1, maxGeneratedCandidates: 8 },
    stopping: { patience: 3, minImprovement: 1e-4, diversityFloor: 0.05 },
    strategy: { startingSmiles: ['c1ccccc1', 'Oc1ccccc1'], transformationWeights: Object.fromEntries(tx.map((t) => [t, 1])), parentSelection: 'pareto' },
    createdBy: u.id,
  });
  runCampaign(db, c.id);
  return c.id;
}

describe('multi-fidelity selection accounting (pure)', () => {
  test('every retained candidate is either selected or explicitly not-selected', () => {
    const cands = [
      { id: 'a', status: 'retained', pareto: true, objectiveVector: { x: 1 }, canonicalSmiles: 'A' },
      { id: 'b', status: 'retained', pareto: false, objectiveVector: { x: 2 }, canonicalSmiles: 'B' },
      { id: 'c', status: 'retained', pareto: false, objectiveVector: { x: 3 }, canonicalSmiles: 'C' },
      { id: 'd', status: 'rejected', pareto: false, objectiveVector: {}, canonicalSmiles: 'D' },
    ];
    const { selected, notSelected } = selectForStage(cands, { budget: 1, mode: 'pareto' });
    assert.equal(selected.length, 1);
    assert.equal(selected[0].cand.id, 'a', 'Pareto candidate selected first (highest value)');
    // rejected candidates never enter an expensive stage
    const ids = [...selected, ...notSelected].map((x) => x.cand.id).sort();
    assert.deepEqual(ids, ['a', 'b', 'c']);
  });
});

describe('docking stage on a real campaign', () => {
  (RDKIT && DOCK ? test : test.skip)('docks selected Pareto candidates and persists Scientific Runs with artifacts', () => {
    const db = openDatabase();
    const id = seedCampaign(db);
    const report = runMultiFidelityStage(db, id, { docking: { enabled: true, budget: 1, mode: 'pareto', receptor: { receptorSmiles: 'c1ccc2[nH]ccc2c1', center: [0, 0, 0], exhaustiveness: 4, nPoses: 3 } } });

    assert.equal(report.docking.executed, true);
    assert.ok(report.docking.docked.length >= 1);
    const good = report.docking.docked.find((d) => !d.failed);
    assert.ok(good && typeof good.bestAffinityKcalMol === 'number', 'realny wynik Vina');

    // Scientific Run persisted with MODEL_ESTIMATE + artifacts + hashes.
    const runs = listScienceRuns(db, id);
    assert.ok(runs.length >= 1);
    const dr = runs.find((r) => r.capability === 'molecular-docking');
    assert.ok(dr);
    assert.equal(dr.evidenceClass, 'MODEL_ESTIMATE');
    assert.ok(dr.inputHash && dr.outputHash);
    assert.ok(dr.artifacts.some((a) => a.kind === 'ligand_pdbqt'));
    assert.equal(typeof dr.outputs.bestAffinityKcalMol, 'number');
    // Linked to a candidate.
    assert.ok(dr.candidateId);
    assert.ok(listScienceRunsForCandidate(db, dr.candidateId).length >= 1);

    // Selection reasons persisted for every retained candidate (no silent drops).
    const events = listEvents(db, id);
    const selEvents = events.filter((e) => e.type === 'STAGE_SELECTION' && e.payload.stage === 'docking');
    const retained = listCandidates(db, id).filter((c) => c.status === 'retained');
    assert.equal(selEvents.length, retained.length);
    assert.ok(events.some((e) => e.type === 'STAGE_RESULT'));

    const unified = buildScientificComputeReport(db, id);
    assert.ok(unified && unified.reportId);
    assert.ok(unified.stages.find((s) => s.capability === 'molecular-docking')?.runIds.includes(dr.id));
    assert.equal(unified.evidence, 'MODEL_ESTIMATE');
    assert.equal(unified.replay.find((r) => r.runId === dr.id)?.status, 'NOT_VERIFIED');
  });
});

describe('quantum stage on a real campaign', () => {
  (RDKIT && QM ? test : test.skip)('computes a real QM single-point for a selected candidate', () => {
    const db = openDatabase();
    const id = seedCampaign(db);
    const report = runMultiFidelityStage(db, id, { quantum: { enabled: true, budget: 1, mode: 'pareto', method: 'RHF', basis: 'sto-3g' } });
    assert.equal(report.quantum.executed, true);
    const good = report.quantum.computed.find((c) => !c.failed);
    assert.ok(good && typeof good.homoLumoGapEv === 'number', 'realny HOMO-LUMO gap');
    const runs = listScienceRuns(db, id).filter((r) => r.capability === 'quantum-chemistry');
    assert.ok(runs.length >= 1 && runs[0].evidenceClass === 'MODEL_ESTIMATE');
    assert.ok(runs[0].outputs.energyHartree < 0);
  });
});

describe('ADMET + toxicity filter stage on a real campaign', () => {
  (RDKIT && ADMET ? test : test.skip)('scores every retained candidate; unthresholded run computes but never rejects', () => {
    const db = openDatabase();
    const id = seedCampaign(db);
    const retained = listCandidates(db, id).filter((c) => c.status === 'retained');
    const report = runMultiFidelityStage(db, id, { admet: { enabled: true } });
    assert.equal(report.admet.executed, true);
    assert.equal(report.admet.results.length, retained.length, 'every retained candidate scored');
    assert.equal(report.admet.filtered, null, 'no thresholds supplied -> no filtering invented');

    // Two Scientific Runs per candidate (admet-estimation + toxicity-risk-estimation), both MODEL_ESTIMATE.
    const runs = listScienceRuns(db, id);
    const admetRuns = runs.filter((r) => r.capability === 'admet-estimation');
    const toxRuns = runs.filter((r) => r.capability === 'toxicity-risk-estimation');
    assert.equal(admetRuns.length, retained.length);
    assert.equal(toxRuns.length, retained.length);
    assert.ok(admetRuns.every((r) => r.evidenceClass === 'MODEL_ESTIMATE'));
    assert.ok(toxRuns.some((r) => 'hERG' in r.outputs), 'toxicity run carries real endpoint predictions');
    assert.ok(admetRuns.some((r) => 'molecular_weight' in r.outputs), 'admet run carries physchem endpoint');

    const events = listEvents(db, id).filter((e) => e.type === 'STAGE_RESULT' && e.payload.stage === 'admet');
    assert.equal(events.length, retained.length);
  });

  (RDKIT && ADMET ? test : test.skip)('explicit thresholds actually filter candidates, both directions proven', () => {
    const db = openDatabase();
    const id = seedCampaign(db);
    const retained = listCandidates(db, id).filter((c) => c.status === 'retained');

    // Impossible threshold -> everyone rejected (proves the reject path is real, not a safety claim).
    const strict = runMultiFidelityStage(db, id, { admet: { enabled: true, thresholds: { molecular_weight: { max: 1 } } } });
    assert.equal(strict.admet.filtered.rejected.length, retained.length);
    assert.equal(strict.admet.filtered.passed.length, 0);
    assert.equal(strict.admet.filtered.rejected[0].violates.endpointId, 'molecular_weight');

    // Trivially satisfied threshold -> everyone passes (proves the pass path is real).
    const lenient = runMultiFidelityStage(db, id, { admet: { enabled: true, thresholds: { molecular_weight: { max: 100000 } } } });
    assert.equal(lenient.admet.filtered.passed.length, retained.length);
    assert.equal(lenient.admet.filtered.rejected.length, 0);

    const rejectionEvents = listEvents(db, id).filter((e) => e.type === 'STAGE_SELECTION' && e.payload.stage === 'admet' && e.payload.reason === 'ADMET_FILTER_REJECTED');
    assert.ok(rejectionEvents.length >= retained.length, 'rejection reasons persisted for WHY');
  });

  (RDKIT && ADMET ? test : test.skip)('a filtered candidate pool actually changes downstream docking selection', () => {
    if (!DOCK) return;
    const db = openDatabase();
    const id = seedCampaign(db);
    const retained = listCandidates(db, id).filter((c) => c.status === 'retained');
    // Reject everyone via ADMET, then request docking — nothing should be selected.
    const report = runMultiFidelityStage(db, id, {
      admet: { enabled: true, thresholds: { molecular_weight: { max: 1 } } },
      docking: { enabled: true, budget: retained.length },
    });
    assert.equal(report.admet.filtered.passed.length, 0);
    assert.equal(report.docking.selected, 0, 'ADMET rejection actually excludes candidates from docking, not just cosmetic');
  });

  test('unavailable ADMET engine is an honest BLOCKED_BY_RUNTIME, never faked', () => {
    if (ADMET || !RDKIT) return; // this runtime has ADMET-AI — nothing to prove here
    const db = openDatabase();
    const id = seedCampaign(db);
    const report = runMultiFidelityStage(db, id, { admet: { enabled: true } });
    assert.equal(report.admet.executed, false);
    assert.equal(report.admet.blocker, 'BLOCKED_BY_RUNTIME');
  });
});

describe('blocked expensive stage is honest, not faked', () => {
  test('requesting a capability that is unavailable reports BLOCKED_BY_RUNTIME', () => {
    if (!RDKIT) return;
    const db = openDatabase();
    const id = seedCampaign(db);
    // Force an unavailable capability by requesting docking when docking is off.
    if (DOCK) return; // docking available here — nothing to prove
    const report = runMultiFidelityStage(db, id, { docking: { enabled: true, budget: 1 } });
    assert.equal(report.docking.executed, false);
    assert.equal(report.docking.blocker, 'BLOCKED_BY_RUNTIME');
  });
});
