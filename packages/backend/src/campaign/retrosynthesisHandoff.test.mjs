/* Proprietary / All Rights Reserved - Genesis OS */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser, createProject, saveScienceRun } from '../store.mjs';
import { hashPassword } from '../auth.mjs';
import { createCampaign, addCandidate } from './persistence.mjs';
import { preregisterExperiment, sealExperimentSession, hypothesisFingerprint } from '../experimentMemory.mjs';
import {
  buildRetrosynthesisHandoff, resumeRetrosynthesisHandoff, finalistContentHash,
  HANDOFF_KIND, HANDOFF_CONTRACT_VERSION,
} from './retrosynthesisHandoff.mjs';
import * as retro from '../compute/retroAdapter.mjs';

/**
 * THE HANDOFF — what must survive an engine that cannot run.
 *
 * The route-search models may be unreachable when a campaign ends. The campaign has still DECIDED
 * which molecule it would hand to a planner, and these tests hold that decision to three promises:
 * it names the same finalist the protocol names, it carries enough identity to detect drift, and it
 * never, under any runtime state, contains a route.
 */
const ENGINE_READY = retro.detect().available;

const IMATINIB = 'Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1';
const ANALOGUE = 'Cc1ccc(NC(=O)c2ccc(CN3CCN(CC)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1';

function seed({ dock = true, seal = true } = {}) {
  const db = openDatabase(':memory:');
  const u = createUser(db, { email: `h${Math.random().toString(36).slice(2)}@lab.org`, displayName: 'H', passwordHash: hashPassword('password123') });
  const p = createProject(db, { name: 'Handoff', ownerId: u.id });
  const c = createCampaign(db, {
    projectId: p.id, objective: 'Find a binder for ABL1', domain: 'DRUG_DISCOVERY',
    budget: { maxGenerations: 2, maxGeneratedCandidates: 6 },
    stopping: { patience: 1, minImprovement: 1e-4, diversityFloor: 0.05 },
    strategy: { startingSmiles: [IMATINIB], transformationWeights: {}, parentSelection: 'pareto' },
    createdBy: u.id,
  });
  const seedId = addCandidate(db, { campaignId: c.id, generation: 0, canonicalSmiles: IMATINIB, status: 'retained' });
  const childId = addCandidate(db, {
    campaignId: c.id, generation: 1, canonicalSmiles: ANALOGUE, status: 'retained',
    parentId: seedId, parentSmiles: IMATINIB, transformation: 'n_alkylation',
  });

  const hypothesis = {
    subject: 'ABL1 kinase',
    statement: 'An imatinib analogue docks at least as well as imatinib against ABL1.',
    target: { targetId: 'ABL1_1IEP', pdbId: '1IEP', chain: 'A' },
    criteria: [{ id: 'docking', label: 'best affinity <= -9.0 kcal/mol', threshold: -9.0, critical: true, evidence: 'REAL_ENGINE_OUTPUT' }],
    plan: ['RDKit', 'AutoDock Vina'],
  };
  // Preregistration must precede every engine result — the store refuses it once a run exists.
  if (seal) {
    const prereg = preregisterExperiment(db, { projectId: p.id, campaign: c, hypothesis, userId: u.id });
    assert.equal(prereg.ok, true, prereg.error);
  }

  if (dock) {
    // Two docked candidates so the ranking in the handoff has something to be a ranking OF.
    saveScienceRun(db, {
      projectId: p.id, campaignId: c.id, candidateId: seedId,
      engine: 'AutoDock Vina', engineVersion: '1.2.5', capability: 'molecular-docking',
      method: 'vina', status: 'ok', evidenceClass: 'REAL_ENGINE_OUTPUT',
      inputs: { smiles: IMATINIB }, outputs: { bestAffinityKcalMol: -9.4, poseSha256: 'a'.repeat(64), nPoses: 5 },
      units: {}, warnings: [], provenance: {}, inputHash: 'i1', outputHash: 'o1', durationMs: 10, environmentHash: 'e1',
    });
    saveScienceRun(db, {
      projectId: p.id, campaignId: c.id, candidateId: childId,
      engine: 'AutoDock Vina', engineVersion: '1.2.5', capability: 'molecular-docking',
      method: 'vina', status: 'ok', evidenceClass: 'REAL_ENGINE_OUTPUT',
      inputs: { smiles: ANALOGUE }, outputs: { bestAffinityKcalMol: -10.8, poseSha256: 'b'.repeat(64), nPoses: 5 },
      units: {}, warnings: [], provenance: {}, inputHash: 'i2', outputHash: 'o2', durationMs: 10, environmentHash: 'e2',
    });
  }

  if (seal) {
    const sealed = sealExperimentSession(db, {
      projectId: p.id, campaign: c, userId: u.id,
      session: {
        hypothesisFingerprint: hypothesisFingerprint(hypothesis),
        verdict: 'SUPPORTED', rule: 'every critical criterion met', stateHash: 'state-1',
        criteria: [{ id: 'docking', status: 'MET', observed: -10.8 }],
      },
    });
    assert.equal(sealed.ok, true, sealed.error);
  }
  return { db, projectId: p.id, campaignId: c.id, seedId, childId };
}

describe('the handoff names the molecule the protocol already named', () => {
  test('the finalist is the best-docking retained candidate, with its lineage and a content hash', () => {
    const ctx = seed();
    const r = buildRetrosynthesisHandoff(ctx.db, ctx.campaignId);
    assert.equal(r.ok, true, r.error);
    const h = r.handoff;

    assert.equal(h.kind, HANDOFF_KIND);
    assert.equal(h.contractVersion, HANDOFF_CONTRACT_VERSION);
    assert.equal(h.campaignId, ctx.campaignId);
    assert.equal(h.projectId, ctx.projectId);

    // -10.8 beats -9.4: the analogue is the finalist, not the seed it came from.
    assert.equal(h.finalist.candidateId, ctx.childId);
    assert.equal(h.finalist.canonicalSmiles, ANALOGUE);
    assert.equal(h.finalist.rank, 1);
    assert.equal(h.finalist.dockingScoreKcalMol, -10.8);
    assert.equal(h.finalist.poseSha256, 'b'.repeat(64));
    assert.equal(h.finalist.meetsRegisteredThreshold, true);

    // Parent + transformation travel with it: the route will be planned for a molecule whose origin
    // is on the record, not for a bare string.
    assert.equal(h.finalist.generation, 1);
    assert.equal(h.finalist.parentSmiles, IMATINIB);
    assert.equal(h.finalist.transformation, 'n_alkylation');

    assert.match(h.finalist.contentHash, /^[0-9a-f]{64}$/);
    assert.match(h.handoffFingerprint, /^[0-9a-f]{64}$/);
  });

  test('the ranking that produced the choice is reproduced, so the selection can be audited', () => {
    const ctx = seed();
    const h = buildRetrosynthesisHandoff(ctx.db, ctx.campaignId).handoff;
    assert.equal(h.selection.rankedOver, 2);
    assert.deepEqual(h.selection.ranking.map((x) => x.scoreKcalMol), [-10.8, -9.4]);
    assert.equal(h.selection.ranking[0].candidateId, h.finalist.candidateId);
    assert.match(h.selection.rule, /docking score/i);
  });

  test('preregistration and sealed evidence identity are carried, not recomputed later', () => {
    const ctx = seed();
    const h = buildRetrosynthesisHandoff(ctx.db, ctx.campaignId).handoff;
    assert.equal(h.preregistration.registeredBeforeExecution, true);
    assert.match(h.preregistration.fingerprint, /^[0-9a-f]+$/);
    assert.ok(h.preregistration.preregistrationId);
    assert.ok(h.evidence.sessionRecordId);
    assert.equal(h.evidence.serverVerdict, 'SUPPORTED');
    assert.equal(h.evidence.chainOk, true);
    assert.ok(h.evidence.headChainHash);
    assert.match(h.evidence.protocolFingerprint, /^[0-9a-f]{64}$/);
  });

  test('the fingerprint is stable across rebuilds and moves when the finalist changes', () => {
    const ctx = seed();
    const a = buildRetrosynthesisHandoff(ctx.db, ctx.campaignId).handoff;
    const b = buildRetrosynthesisHandoff(ctx.db, ctx.campaignId).handoff;
    assert.equal(a.handoffFingerprint, b.handoffFingerprint);
    assert.equal(a.finalist.contentHash, b.finalist.contentHash);

    // A better-docking newcomer changes who is handed off — and the content hash must say so.
    const newId = addCandidate(ctx.db, { campaignId: ctx.campaignId, generation: 2, canonicalSmiles: 'CCO', status: 'retained', parentId: ctx.childId, parentSmiles: ANALOGUE, transformation: 'truncation' });
    saveScienceRun(ctx.db, {
      projectId: ctx.projectId, campaignId: ctx.campaignId, candidateId: newId,
      engine: 'AutoDock Vina', engineVersion: '1.2.5', capability: 'molecular-docking',
      method: 'vina', status: 'ok', evidenceClass: 'REAL_ENGINE_OUTPUT',
      inputs: {}, outputs: { bestAffinityKcalMol: -12.1, poseSha256: 'c'.repeat(64) },
      units: {}, warnings: [], provenance: {}, inputHash: 'i3', outputHash: 'o3', durationMs: 1, environmentHash: 'e3',
    });
    const c = buildRetrosynthesisHandoff(ctx.db, ctx.campaignId).handoff;
    assert.equal(c.finalist.candidateId, newId);
    assert.notEqual(c.finalist.contentHash, a.finalist.contentHash);
  });

  test('the content hash is bound to the campaign: the same molecule elsewhere is a different subject', () => {
    const base = { candidateId: 'cand-1', canonicalSmiles: ANALOGUE, generation: 1, parentSmiles: IMATINIB, transformation: 'n_alkylation' };
    assert.notEqual(
      finalistContentHash({ campaignId: 'camp-A', ...base }),
      finalistContentHash({ campaignId: 'camp-B', ...base }),
    );
    // And it is insensitive to nothing that matters: same inputs, same hash.
    assert.equal(
      finalistContentHash({ campaignId: 'camp-A', ...base }),
      finalistContentHash({ campaignId: 'camp-A', ...base }),
    );
  });

  test('a campaign with nothing docked has nothing to hand off, and says so', () => {
    const ctx = seed({ dock: false, seal: false });
    const r = buildRetrosynthesisHandoff(ctx.db, ctx.campaignId);
    assert.equal(r.ok, false);
    assert.equal(r.error, 'no_finalist');
  });

  test('an unknown campaign is refused, not invented', () => {
    const ctx = seed();
    assert.equal(buildRetrosynthesisHandoff(ctx.db, 'nope').error, 'campaign_not_found');
  });
});

describe('the handoff never contains chemistry', () => {
  test('no route, no disconnection and no conditions appear anywhere in it', () => {
    const ctx = seed();
    const h = buildRetrosynthesisHandoff(ctx.db, ctx.campaignId).handoff;
    assert.equal(h.route, null);

    // Structure, not prose: the boundary text is allowed to say the word "disconnection", but no
    // route-shaped FIELD may exist anywhere in the record.
    const forbidden = new Set(['reactionSmiles', 'reactionsForward', 'startingMaterials', 'disconnections', 'topRoute', 'routes', 'conditions', 'yield']);
    const walk = (node, path = '$') => {
      if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`));
      if (!node || typeof node !== 'object') return;
      for (const [k, v] of Object.entries(node)) {
        assert.equal(forbidden.has(k), false, `route-shaped field ${path}.${k} must not exist in a handoff`);
        walk(v, `${path}.${k}`);
      }
    };
    walk(h);
    // No reaction SMILES can hide in a string value either.
    assert.equal(/>>/.test(JSON.stringify(h)), false, 'no reaction arrow may appear in a handoff');

    assert.match(h.boundary, /IDENTITY RECORD ONLY/);
    assert.match(h.boundary, /no route/i);
  });

  test('the request names the engine and its licence, and puts the reference case first', () => {
    const ctx = seed();
    const h = buildRetrosynthesisHandoff(ctx.db, ctx.campaignId).handoff;
    assert.equal(h.request.capability, 'retrosynthesis-route-search');
    assert.equal(h.request.engine, 'AiZynthFinder');
    assert.match(h.request.license, /MIT/);
    assert.equal(h.request.evidenceClass, 'MODEL_ESTIMATE');
    assert.equal(h.request.smiles, h.finalist.canonicalSmiles);
    assert.equal(h.request.referenceCaseFirst.smiles, 'CC(=O)Oc1ccccc1C(=O)O');
    assert.match(h.resume.join(' '), /aspirin/i);
  });

  test('the runtime state is recorded as the adapter reports it, never assumed', () => {
    const ctx = seed();
    const h = buildRetrosynthesisHandoff(ctx.db, ctx.campaignId).handoff;
    if (ENGINE_READY) {
      assert.equal(h.runtime.status, 'AVAILABLE');
      assert.equal(h.runtime.missingModelFiles, null);
    } else {
      assert.equal(h.runtime.status, 'BLOCKED_BY_RUNTIME');
      assert.ok(['MODEL_FILES_MISSING', 'ENGINE_NOT_INSTALLED'].includes(h.runtime.blocker));
      assert.ok(typeof h.runtime.reason === 'string' && h.runtime.reason.length > 0);
    }
  });
});

describe('resuming the handoff', () => {
  test('a drifted finalist is refused before any engine is asked', () => {
    const ctx = seed();
    let planCalled = false;
    const r = resumeRetrosynthesisHandoff(ctx.db, ctx.campaignId, {
      expectedContentHash: 'f'.repeat(64),
      plan: () => { planCalled = true; return { ok: true }; },
    });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'finalist_drifted');
    assert.equal(planCalled, false, 'a drifted handoff must not reach the engine');
    assert.match(r.reason, /different molecule/i);
    assert.equal(r.expectedContentHash, 'f'.repeat(64));
    assert.match(r.actualContentHash, /^[0-9a-f]{64}$/);
  });

  test('a blocked engine refuses with the runtime state and plans nothing', () => {
    if (ENGINE_READY) return;
    const ctx = seed();
    const h = buildRetrosynthesisHandoff(ctx.db, ctx.campaignId).handoff;
    let planCalled = false;
    const r = resumeRetrosynthesisHandoff(ctx.db, ctx.campaignId, {
      expectedContentHash: h.finalist.contentHash,
      plan: () => { planCalled = true; return { ok: true }; },
    });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'BLOCKED_BY_RUNTIME');
    assert.equal(planCalled, false);
    assert.equal(r.runtime.status, 'BLOCKED_BY_RUNTIME');
    assert.equal(r.handoff.finalist.candidateId, ctx.childId);
  });

  test('with a matching hash and a runnable engine it plans THAT candidate and no other', () => {
    const ctx = seed();
    const h = buildRetrosynthesisHandoff(ctx.db, ctx.campaignId).handoff;
    if (h.runtime.status !== 'AVAILABLE') return; // covered by the blocked case above
    const seen = [];
    const r = resumeRetrosynthesisHandoff(ctx.db, ctx.campaignId, {
      expectedContentHash: h.finalist.contentHash,
      plan: (_db, args) => { seen.push(args); return { ok: true, run: { id: 'run-x' } }; },
      options: { iterationLimit: 50 },
    });
    assert.equal(r.ok, true);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].candidateId, ctx.childId);
    assert.equal(seen[0].campaignId, ctx.campaignId);
    assert.equal(seen[0].options.iterationLimit, 50);
  });
});
