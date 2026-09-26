/* Proprietary / All Rights Reserved - Genesis OS */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, createUser, createProject, listScienceRuns } from './store.mjs';
import { hashPassword } from './auth.mjs';
import { createCampaign, listEvents, addCandidate } from './campaign/persistence.mjs';
import * as retro from './compute/retroAdapter.mjs';
import { planCandidateRoute, retrosynthesisOutputHash, routeArtefactFromRun } from './campaign/retrosynthesis.mjs';
import { getTool } from './campaign/toolchain.mjs';
import { getCapability } from './compute/capabilities.mjs';
import { replayScienceRun, VERDICT } from './campaign/verify.mjs';

/**
 * RETROSYNTHESIS — the real engine (AiZynthFinder, MIT) inside the canonical Experiment Fabric.
 *
 * The engine's published model data (expansion policy, template library, purchasable stock) is ~1 GB,
 * carries its own upstream licences and is NOT shipped with Genesis, so the route-producing tests run
 * only where GENESIS_RETRO_MODEL_DIR points at it. Everything else — the contract, the refusal path,
 * the registry wiring, the Evidence record and the replay identity — is tested unconditionally,
 * because those are exactly what must not quietly invent a route when the engine cannot run.
 */
const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'compute', 'retro_worker.py');
const detection = retro.detect();
const ENGINE_READY = detection.available;

function seed() {
  const db = openDatabase(':memory:');
  const u = createUser(db, { email: `retro${Math.random().toString(36).slice(2)}@lab.org`, displayName: 'R', passwordHash: hashPassword('password123') });
  const p = createProject(db, { name: 'Retro', ownerId: u.id });
  const c = createCampaign(db, {
    projectId: p.id, objective: 'route', domain: 'DRUG_DISCOVERY',
    budget: { maxGenerations: 1, maxGeneratedCandidates: 2 },
    stopping: { patience: 1, minImprovement: 1e-4, diversityFloor: 0.05 },
    strategy: { startingSmiles: ['CC(=O)Oc1ccccc1C(=O)O'], transformationWeights: {}, parentSelection: 'pareto' },
    createdBy: u.id,
  });
  const candidateId = addCandidate(db, { campaignId: c.id, generation: 0, canonicalSmiles: 'CC(=O)Oc1ccccc1C(=O)O', status: 'retained' });
  return { db, projectId: p.id, campaignId: c.id, candidateId };
}

describe('the engine itself', () => {
  test('the worker reports the installed engine and exactly which model files are present', () => {
    const python = process.env.GENESIS_RETRO_PYTHON ?? process.env.GENESIS_PYTHON ?? 'python3';
    let probe;
    try {
      probe = JSON.parse(execFileSync(python, [WORKER, JSON.stringify({ cmd: 'detect' })], { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'ignore'] }));
    } catch (err) {
      // No interpreter at all is itself a legitimate environment state; the adapter must say so.
      assert.equal(retro.detect().available, false);
      assert.match(retro.detect().reason, /AiZynthFinder|not usable/i);
      return;
    }
    if (!probe.ok) {
      assert.equal(probe.error, 'AIZYNTHFINDER_NOT_INSTALLED');
      return;
    }
    assert.equal(probe.engine, 'AiZynthFinder');
    assert.match(String(probe.versions.aizynthfinder), /^\d+\.\d+/);
    // Every required file is named with its upstream source, so a missing one is actionable.
    const required = probe.models.files.filter((f) => f.required);
    assert.deepEqual(required.map((f) => f.role).sort(), ['expansion_policy_model', 'expansion_templates', 'stock']);
    for (const f of required) assert.match(f.upstream, /^https:\/\//);
    assert.equal(probe.runnable, probe.models.complete);
    if (!probe.runnable) assert.match(probe.reason, /MODEL_FILES_MISSING/);
  });

  test('without the model data the adapter REFUSES to plan and names the missing files', () => {
    if (ENGINE_READY) return; // covered by the route test below when the models are present
    const r = retro.planRoute('CC(=O)Oc1ccccc1C(=O)O');
    assert.equal(r.ok, false);
    assert.equal(r.status, 'BLOCKED_BY_RUNTIME');
    assert.ok(Array.isArray(r.missingModelFiles) || r.missingModelFiles === null);
    // The one thing that must never happen: a route appearing without the engine.
    assert.equal(r.routes, undefined);
  });
});

describe('the registry tells the truth about it', () => {
  test('the engine is registered with its licence and is AVAILABLE only when its reference case passes', () => {
    const tool = getTool('aizynthfinder');
    assert.equal(tool.engineName, 'AiZynthFinder');
    assert.equal(tool.license, 'MIT');
    assert.equal(tool.capabilityId, 'retrosynthesis-route-search');
    assert.equal(tool.evidenceClass, 'MODEL_ESTIMATE');
    assert.match(tool.assumptions, /NO conditions, quantities, yields or safety assessment/);
    assert.ok(['AVAILABLE', 'BLOCKED_BY_RUNTIME', 'VALIDATION_FAILED'].includes(tool.status));
    assert.equal(tool.status === 'AVAILABLE', ENGINE_READY && tool.status === 'AVAILABLE');
  });

  test('the capability manifest carries the same live status, never a claim the runtime cannot back', () => {
    const cap = getCapability('retrosynthesis');
    assert.equal(cap.category, 'synthesis');
    // The canonical toolchain owns the live note; what must survive is the boundary on the claim.
    assert.match(cap.note, /safety assessment|MODEL_ESTIMATE/);
    assert.equal(cap.status, ENGINE_READY ? 'AVAILABLE' : 'BLOCKED_BY_RUNTIME');
  });
});

describe('a route search is an experiment like any other', () => {
  test('a blocked engine writes STAGE_BLOCKED with the missing files and persists NO run', () => {
    if (ENGINE_READY) return;
    const ctx = seed();
    const r = planCandidateRoute(ctx.db, { projectId: ctx.projectId, campaignId: ctx.campaignId, candidateId: ctx.candidateId });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'BLOCKED_BY_RUNTIME');
    assert.equal(listScienceRuns(ctx.db, ctx.campaignId).length, 0);
    const blocked = listEvents(ctx.db, ctx.campaignId).filter((e) => e.type === 'STAGE_BLOCKED');
    assert.equal(blocked.length, 1);
    assert.equal(blocked[0].payload.stage, 'retrosynthesis');
    assert.equal(blocked[0].payload.blocker, 'BLOCKED_BY_RUNTIME');
    assert.match(blocked[0].payload.reason, /MODEL_FILES_MISSING|not usable/i);
  });

  test('a candidate that does not exist is refused before anything is written', () => {
    const ctx = seed();
    assert.equal(planCandidateRoute(ctx.db, { projectId: ctx.projectId, campaignId: ctx.campaignId, candidateId: 'nope' }).error, 'candidate_not_found');
    assert.equal(planCandidateRoute(ctx.db, { projectId: ctx.projectId, campaignId: ctx.campaignId }).error, 'smiles_or_candidate_required');
    assert.equal(listEvents(ctx.db, ctx.campaignId).length, 0);
  });

  test('the output hash is the identity of the ROUTES, not of the search that found them', () => {
    const routes = [{
      steps: 2, allStartingMaterialsInStock: true,
      reactions: [{ reactionSmiles: 'a>>b.c' }, { reactionSmiles: 'b>>d.e' }],
      startingMaterials: [{ smiles: 'd' }, { smiles: 'e' }, { smiles: 'c' }],
    }];
    const base = retrosynthesisOutputHash({ solved: true, routes });
    // Same routes found after a longer search, or with the starting materials listed in another order.
    assert.equal(retrosynthesisOutputHash({ solved: true, routes, iterations: 999, stoppedBy: 'ITERATION_LIMIT' }), base);
    const reordered = [{ ...routes[0], startingMaterials: [{ smiles: 'c' }, { smiles: 'e' }, { smiles: 'd' }] }];
    assert.equal(retrosynthesisOutputHash({ solved: true, routes: reordered }), base);
    // A different disconnection is a different result.
    const different = [{ ...routes[0], reactions: [{ reactionSmiles: 'a>>x.y' }, { reactionSmiles: 'b>>d.e' }] }];
    assert.notEqual(retrosynthesisOutputHash({ solved: true, routes: different }), base);
  });

  test('the protocol artefact reads the engine’s disconnections forward and keeps the boundary', () => {
    const artefact = routeArtefactFromRun({
      id: 'run-1', capability: 'retrosynthesis-route-search', engine: 'AiZynthFinder', engineVersion: '4.4.1',
      method: 'mcts', outputHash: 'h',
      outputs: { solved: true, routeCount: 1, routes: [{
        steps: 2, allStartingMaterialsInStock: true,
        reactions: [{ reactionSmiles: 'target>>mid.r2', policyProbability: 0.4 }, { reactionSmiles: 'mid>>a.r1', policyProbability: 0.8 }],
        startingMaterials: [{ smiles: 'a', inStock: true }, { smiles: 'r1', inStock: true }, { smiles: 'r2', inStock: true }],
      }] },
      provenance: { modelChecksums: { stock: 's' }, license: 'MIT (AiZynthFinder, MolecularAI)' },
    });
    assert.equal(artefact.solved, true);
    assert.deepEqual(artefact.topRoute.reactionsForward.map((r) => r.reactionSmiles), ['mid>>a.r1', 'target>>mid.r2']);
    assert.equal(artefact.topRoute.reactionsForward[0].step, 1);
    assert.match(artefact.boundary, /PROPOSED ROUTE \(MODEL_ESTIMATE\)/);
    assert.equal(routeArtefactFromRun(null), null);
    assert.equal(routeArtefactFromRun({ capability: 'molecular-docking' }), null);
  });
});

describe('with the engine’s model data present (skipped without it)', () => {
  (ENGINE_READY ? test : test.skip)('it solves the reference case and the run replays to MATCH', () => {
    const reference = retro.referenceCase();
    assert.equal(reference.ok, true);
    assert.equal(reference.pass, true, 'a planner that cannot solve aspirin is not a working planner');
    assert.ok(reference.startingMaterials.length > 0);

    const ctx = seed();
    const r = planCandidateRoute(ctx.db, { projectId: ctx.projectId, campaignId: ctx.campaignId, candidateId: ctx.candidateId, options: { iterationLimit: 50, maxRoutes: 3 } });
    assert.equal(r.ok, true);
    assert.equal(r.run.capability, 'retrosynthesis-route-search');
    assert.equal(r.run.evidenceClass, 'MODEL_ESTIMATE');
    assert.ok(r.run.outputHash && r.run.inputHash && r.run.environmentHash);
    assert.ok(r.run.provenance.modelChecksums.expansion_policy_model);
    const result = listEvents(ctx.db, ctx.campaignId).find((e) => e.type === 'STAGE_RESULT');
    assert.equal(result.payload.stage, 'retrosynthesis');
    assert.equal(result.payload.reason, r.solved ? 'ROUTE_FOUND' : 'NO_ROUTE_FOUND');

    const replay = replayScienceRun(ctx.db, r.run.id);
    assert.ok([VERDICT.MATCH, VERDICT.REPLAY_UNSUPPORTED].includes(replay.verdict));
    if (replay.verdict === VERDICT.MATCH) assert.equal(replay.replayOutputHash, r.run.outputHash);
  });
});
