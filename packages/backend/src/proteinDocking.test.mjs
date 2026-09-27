import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser, createProject, getScienceRun } from './store.mjs';
import { hashPassword } from './auth.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';
import * as docking from './compute/dockingAdapter.mjs';
import { getDockingTarget, prepareDockingTarget, listDockingTargets, DEFAULT_DOCKING_TARGET } from './compute/dockingTargets.mjs';
import { availableTransformations } from './campaign/drugAdapter.mjs';
import { createCampaign, listEvents } from './campaign/persistence.mjs';
import { runCampaign } from './campaign/orchestrator.mjs';
import { runMultiFidelityStage } from './campaign/multiFidelity.mjs';
import { verifyScienceRun } from './campaign/verify.mjs';

/**
 * Real protein docking: PDB 1IEP chain A (ABL1 kinase domain) with its co-crystallised, non-covalent
 * ligand imatinib. The receptor file and the crystal ligand are shipped with their sha256; preparation
 * is deterministic; the benchmark is a crystal-ligand redock judged by heavy-atom RMSD in the crystal
 * frame. Engine-dependent tests skip honestly when Vina/Meeko/RDKit are absent.
 */
const ENGINES = rdkitDetect().available && docking.detect().available;
const IMATINIB = 'Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1';

describe('docking target registry', () => {
  test('1IEP is a vetted target whose shipped files match their recorded sha256', () => {
    assert.deepEqual(listDockingTargets(), ['ABL1_1IEP']);
    assert.equal(DEFAULT_DOCKING_TARGET, 'ABL1_1IEP');
    const t = getDockingTarget('ABL1_1IEP');
    assert.equal(t.ok, true);
    assert.equal(t.pdbId, '1IEP');
    assert.equal(t.chain, 'A');
    assert.match(t.referenceLigand.binding, /non-covalent/);
    assert.deepEqual(t.pocket.center, [15.19, 53.903, 16.917]);
    assert.deepEqual(t.pocket.boxSize, [20, 20, 20]);
  });

  test('an unknown target is refused (the API can never name a path)', () => {
    assert.deepEqual(getDockingTarget('../../etc/passwd'), { ok: false, error: 'unknown_target' });
  });
});

describe('real protein docking (Vina + Meeko)', () => {
  (ENGINES ? test : test.skip)('receptor preparation is deterministic', () => {
    const a = docking.prepareReceptor({ pdbPath: getDockingTarget('ABL1_1IEP').pdbPath, center: [15.19, 53.903, 16.917], boxSize: [20, 20, 20] });
    const b = prepareDockingTarget('ABL1_1IEP');
    assert.equal(a.ok, true);
    assert.equal(a.data.receptorPdbqtSha256, b.receptorPdbqtSha256);
    assert.equal(a.data.sourceSha256, '5f6aee6029f9a2a2c2be32d4eb948ae70808690573e1b69a0850cdffd7048ca7');
    assert.ok(b.receptorAtoms > 2000, 'whole kinase domain, not a fragment');
  });

  (ENGINES ? test : test.skip)('crystal-ligand redock reproduces the 1IEP imatinib pose (RMSD < 2 Å)', () => {
    const t = getDockingTarget('ABL1_1IEP');
    const r = docking.redock({ pdbPath: t.pdbPath, ligandSdfPath: t.ligandSdfPath, center: t.pocket.center, boxSize: t.pocket.boxSize, exhaustiveness: 8, seed: 42 });
    assert.equal(r.ok, true, r.error);
    assert.ok(r.data.rmsdA < 2.0, `top-pose RMSD ${r.data.rmsdA} Å`);
    assert.ok(r.data.bestAffinityKcalMol < -9, `score ${r.data.bestAffinityKcalMol}`);
  });

  (ENGINES ? test : test.skip)('campaign docking stage: real steps as events, real pose + pocket persisted, replay MATCH', () => {
    const db = openDatabase();
    const u = createUser(db, { email: 'pd@lab.org', displayName: 'PD', passwordHash: hashPassword('password123') });
    const p = createProject(db, { name: 'PD', ownerId: u.id });
    const tx = availableTransformations();
    const c = createCampaign(db, {
      projectId: p.id, objective: 'imatinib analogs vs ABL1 (1IEP)', domain: 'DRUG_DISCOVERY',
      budget: { maxGenerations: 1, maxGeneratedCandidates: 3 },
      stopping: { patience: 3, minImprovement: 1e-4, diversityFloor: 0.05 },
      strategy: { startingSmiles: [IMATINIB], transformationWeights: Object.fromEntries(tx.map((x) => [x, 1])), parentSelection: 'pareto' },
      createdBy: u.id,
    });
    runCampaign(db, c.id);
    const before = listEvents(db, c.id).length;
    runMultiFidelityStage(db, c.id, { docking: { enabled: true, budget: 1, targetId: 'ABL1_1IEP', receptor: { exhaustiveness: 8, nPoses: 3 } } });
    const events = listEvents(db, c.id).slice(before);
    const docking_ = events.filter((e) => e.payload.stage === 'docking' && e.type !== 'STAGE_SELECTION' || e.payload.reason === 'SELECTED_FOR_DOCKING');
    const steps = docking_.map((e) => e.payload.step ?? e.payload.reason);
    assert.deepEqual(steps, ['RECEPTOR_PREPARED', 'SELECTED_FOR_DOCKING', 'LIGAND_PREPARED', 'VINA_STARTED', 'DOCKING_RESULT_RETAINED']);
    const result = docking_.at(-1).payload;
    assert.equal(result.targetId, 'ABL1_1IEP');
    assert.match(result.poseSha256, /^[0-9a-f]{64}$/);

    const run = getScienceRun(db, result.runId);
    assert.equal(run.inputs.targetId, 'ABL1_1IEP');
    assert.equal(run.inputs.receptorKind, 'protein_target');
    assert.equal(run.provenance.target.pdbId, '1IEP');
    assert.equal(run.provenance.target.chain, 'A');
    assert.equal(run.outputs.poseSha256, result.poseSha256);
    assert.ok(run.outputs.pose.atoms.length >= 20, 'real docked heavy atoms');
    assert.ok(run.outputs.pose.bonds.length >= run.outputs.pose.atoms.length - 1);
    assert.match(run.outputs.posePdbqt, /^MODEL 1/m);
    assert.ok(run.outputs.pocket.residues.length >= 8, 'pose sits in a lined pocket');
    const [cx, cy, cz] = run.inputs.center;
    const xs = run.outputs.pose.atoms.map((a) => a[1]);
    const mean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
    assert.ok(Math.abs(mean(xs) - cx) < 10 && Math.abs(mean(run.outputs.pose.atoms.map((a) => a[2])) - cy) < 10 && Math.abs(mean(run.outputs.pose.atoms.map((a) => a[3])) - cz) < 10, 'pose inside the documented box');

    const v = verifyScienceRun(db, run.id);
    assert.equal(v.ok, true, v.error);
    assert.equal(v.verification.verdict, 'MATCH', JSON.stringify(v.verification.detail ?? {}));
  });
});
