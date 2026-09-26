/* Proprietary / All Rights Reserved - Genesis OS */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser, createProject, saveScienceRun, saveScienceRunVerification } from './store.mjs';
import { hashPassword } from './auth.mjs';
import { addCandidate, addEvent, createCampaign, getCampaign, updateCampaign } from './campaign/persistence.mjs';
import { buildCandidateProtocol, PROTOCOL_KIND } from './campaign/candidateProtocol.mjs';
import { preregisterExperiment, sealExperimentSession } from './experimentMemory.mjs';

/**
 * THE FINAL PROTOCOL of a live experiment. Every row below is written to the store the way the real
 * pipeline writes it (candidates, append-only events, Science Runs, replay verifications, the
 * scientific-memory records), and the protocol is then assembled from that record alone.
 *
 * The assertions are about honesty as much as completeness: a rejected candidate keeps its reason, a
 * Vina score is never called a measurement, and the synthesis section refuses to propose a route
 * because Genesis has no retrosynthesis engine.
 */

const IMATINIB = 'Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1';
const HYPOTHESIS = {
  subject: 'imatinib',
  target: { targetId: 'ABL1_1IEP', pdbId: '1IEP', chain: 'A', protein: 'kinaza ABL1 (domena kinazowa)' },
  statement: 'Wiązanie w kieszeni ABL1 z wynikiem Vina ≤ -9.0 kcal/mol.',
  criteria: [
    { id: 'docking', critical: true, threshold: -9, evidence: 'REAL_ENGINE_OUTPUT', label: 'Wynik Vina ≤ -9.0 kcal/mol' },
    { id: 'retained', critical: false, threshold: null, evidence: 'REAL_ENGINE_OUTPUT', label: 'Co najmniej jeden kandydat lekopodobny' },
    { id: 'ames', critical: false, threshold: 0.5, evidence: 'MODEL_ESTIMATE', label: 'AMES ≤ 0.5' },
    { id: 'herg', critical: false, threshold: 0.5, evidence: 'MODEL_ESTIMATE', label: 'hERG ≤ 0.5' },
  ],
  plan: [{ stage: 'docking', engine: 'AutoDock Vina', label: 'Docking do 1IEP', evidence: 'REAL_ENGINE_OUTPUT' }],
};

/** A campaign with a preregistration, three candidates (one rejected), real runs and a replay. */
function seedRun() {
  const db = openDatabase(':memory:');
  const u = createUser(db, { email: 'proto@lab.org', displayName: 'P', passwordHash: hashPassword('password123') });
  const p = createProject(db, { name: 'Proto', ownerId: u.id });
  const c = createCampaign(db, {
    projectId: p.id, objective: 'Znajdź analog imatynibu wiążący ABL1', domain: 'DRUG_DISCOVERY',
    budget: { maxGenerations: 1, maxGeneratedCandidates: 4 },
    stopping: { patience: 2, minImprovement: 1e-4, diversityFloor: 0.05 },
    strategy: { startingSmiles: [IMATINIB], transformationWeights: {}, parentSelection: 'pareto' },
    createdBy: u.id,
  });
  const campaignId = c.id;
  preregisterExperiment(db, { projectId: p.id, campaign: getCampaign(db, campaignId), hypothesis: HYPOTHESIS, userId: u.id });

  const winner = addCandidate(db, { campaignId, generation: 0, canonicalSmiles: IMATINIB, descriptors: { molWt: 493.6, crippenLogP: 3.5, tpsa: 86.3 }, pareto: true, status: 'retained' });
  const second = addCandidate(db, { campaignId, generation: 1, parentSmiles: IMATINIB, transformation: 'add-fluoro', canonicalSmiles: `${IMATINIB}F`, descriptors: { molWt: 511.6 }, status: 'retained' });
  const dropped = addCandidate(db, { campaignId, generation: 1, parentSmiles: IMATINIB, transformation: 'add-amino', canonicalSmiles: `${IMATINIB}N`, descriptors: { molWt: 508.6 }, status: 'rejected', rejectedReason: 'constraint:lipinski_hbd', constraintViolations: ['lipinski_hbd'] });

  addEvent(db, { campaignId, type: 'STAGE_PROGRESS', payload: { stage: 'docking', step: 'RECEPTOR_PREPARED', targetId: 'ABL1_1IEP', pdbId: '1IEP', chain: 'A', protein: 'kinaza ABL1 (domena kinazowa)', receptorAtoms: 2578, sourceSha256: 'src-sha', receptorPdbqtSha256: 'rec-sha', center: [15.19, 53.903, 16.917], boxSize: [20, 20, 20], meekoVersion: '0.8.0' } });
  addEvent(db, { campaignId, type: 'STAGE_SELECTION', payload: { stage: 'docking', candidateId: winner, reason: 'SELECTED_FOR_DOCKING', why: 'on Pareto front of the latest generation' } });
  addEvent(db, { campaignId, type: 'STAGE_SELECTION', payload: { stage: 'docking', candidateId: second, reason: 'NOT_SELECTED_FOR_DOCKING' } });
  addEvent(db, { campaignId, type: 'STAGE_RESULT', payload: { stage: 'admet', candidateId: winner, reason: 'ADMET_COMPUTED', keyEndpoints: { AMES: 0.17, hERG: 0.36, DILI: 0.27, ClinTox: 0.08 } } });
  addEvent(db, { campaignId, type: 'STAGE_BLOCKED', payload: { stage: 'quantum', blocker: 'BLOCKED_BY_RUNTIME' } });

  const dockRun = saveScienceRun(db, {
    projectId: p.id, campaignId, candidateId: winner, engine: 'AutoDock Vina', engineVersion: '1.2.7',
    capability: 'molecular-docking', method: 'vina exhaustiveness=8', status: 'ok', evidenceClass: 'REAL_ENGINE_OUTPUT',
    inputs: { exhaustiveness: 8, nPoses: 5, seed: 42, center: [15.19, 53.903, 16.917], boxSize: [20, 20, 20], receptorPdbqtSha256: 'rec-sha' },
    outputs: { bestAffinityKcalMol: -12.6, poseSha256: 'pose-sha', ligandPdbqtSha256: 'lig-sha', nPoses: 5, pocket: { residues: ['A:315', 'A:318'] } },
    units: { bestAffinityKcalMol: 'kcal/mol' },
    provenance: { engine: 'AutoDock Vina 1.2.7 + Meeko 0.8.0', target: { targetId: 'ABL1_1IEP', pdbId: '1IEP', chain: 'A', pocketSource: 'co-crystallised ligand STI' } },
    inputHash: 'in-hash', outputHash: 'out-hash', environmentHash: 'env-hash', durationMs: 42_000,
  });
  saveScienceRun(db, {
    projectId: p.id, campaignId, candidateId: winner, engine: 'ADMET-AI', engineVersion: '1.4.0',
    capability: 'admet-prediction', method: 'Chemprop D-MPNN ensemble', status: 'ok', evidenceClass: 'MODEL_ESTIMATE',
    inputs: { smiles: IMATINIB }, outputs: { AMES: 0.17, hERG: 0.36 }, outputHash: 'admet-hash',
  });
  saveScienceRun(db, {
    projectId: p.id, campaignId, candidateId: winner, engine: 'PySCF', engineVersion: '2.6.2',
    capability: 'quantum-single-point', method: 'RHF/sto-3g', status: 'ok', evidenceClass: 'REAL_ENGINE_OUTPUT',
    inputs: { smiles: IMATINIB, method: 'RHF', basis: 'sto-3g', charge: 0, forceField: 'MMFF' },
    outputs: { energyHartree: -1234.5, homoLumoGapEv: 4.2, dipoleDebye: 3.1, converged: true },
    provenance: { geometry: 'RDKit 3D embed (MMFF)' }, outputHash: 'qm-hash',
  });
  saveScienceRunVerification(db, { scienceRunId: dockRun.id, verdict: 'MATCH', originalOutputHash: 'out-hash', replayOutputHash: 'out-hash', originalEngineVersion: '1.2.7', replayEngineVersion: '1.2.7' });
  updateCampaign(db, campaignId, { status: 'completed', stopReason: 'BUDGET_EXHAUSTED' });
  return { db, projectId: p.id, campaignId, ids: { winner, second, dropped }, dockRunId: dockRun.id };
}

function sealVerdict(ctx, verdict = 'SUPPORTED') {
  sealExperimentSession(ctx.db, {
    projectId: ctx.projectId, campaign: getCampaign(ctx.db, ctx.campaignId),
    session: {
      hypothesisFingerprint: require_fingerprint(ctx), verdict, rule: 'x', stateHash: 'state-hash',
      criteria: [
        { id: 'docking', status: verdict === 'SUPPORTED' ? 'MET' : 'UNRESOLVED', observed: '-12.60 kcal/mol' },
        { id: 'retained', status: 'MET', observed: '2/3' },
        { id: 'ames', status: 'MET', observed: 'AMES = 0.17' },
        { id: 'herg', status: 'MET', observed: 'hERG = 0.36' },
      ],
    },
  });
}
function require_fingerprint(ctx) {
  return buildCandidateProtocol(ctx.db, ctx.campaignId).protocol.hypothesis.fingerprint;
}

describe('the final computational candidate protocol', () => {
  test('it carries the question, the preregistered criteria and the verdict the server derived', () => {
    const ctx = seedRun();
    sealVerdict(ctx);
    const { ok, protocol } = buildCandidateProtocol(ctx.db, ctx.campaignId);
    assert.equal(ok, true);
    assert.equal(protocol.kind, PROTOCOL_KIND);
    assert.equal(protocol.question, 'Znajdź analog imatynibu wiążący ABL1');
    assert.equal(protocol.hypothesis.registeredBeforeExecution, true);
    assert.deepEqual(protocol.hypothesis.criteria.map((c) => c.id), ['docking', 'retained', 'ames', 'herg']);
    assert.equal(protocol.verdict.server, 'SUPPORTED');
    assert.equal(protocol.verdict.check, 'MATCH');
    assert.equal(protocol.verdict.preregCheck, 'MATCH');
    assert.equal(protocol.evidence.experimentRecords.chainOk, true);
    assert.equal(protocol.evidence.experimentRecords.sessionIds.length, 1);
  });

  test('it names every engine with its version, and the exact parameters the run used', () => {
    const ctx = seedRun();
    const { protocol } = buildCandidateProtocol(ctx.db, ctx.campaignId);
    const vina = protocol.engines.find((e) => e.engine === 'AutoDock Vina');
    assert.equal(vina.engineVersion, '1.2.7');
    assert.equal(vina.method, 'vina exhaustiveness=8');
    assert.deepEqual(vina.environmentHashes, ['env-hash']);
    assert.ok(protocol.engines.some((e) => e.engine === 'PySCF' && e.engineVersion === '2.6.2'));
    assert.ok(protocol.engines.some((e) => e.engine === 'ADMET-AI' && e.evidenceClass === 'MODEL_ESTIMATE'));
    assert.deepEqual(protocol.parameters.docking, {
      exhaustiveness: 8, nPoses: 5, seed: 42, center: [15.19, 53.903, 16.917], boxSize: [20, 20, 20],
      receptorPdbqtSha256: 'rec-sha', inputHash: 'in-hash',
    });
    assert.equal(protocol.parameters.quantum.method, 'RHF');
    assert.equal(protocol.parameters.quantum.basis, 'sto-3g');
    assert.equal(protocol.parameters.quantum.geometry, 'RDKit 3D embed (MMFF)');
  });

  test('the target section is the receptor the docking stage actually prepared, with its pocket box', () => {
    const ctx = seedRun();
    const { protocol } = buildCandidateProtocol(ctx.db, ctx.campaignId);
    assert.equal(protocol.target.pdbId, '1IEP');
    assert.equal(protocol.target.chain, 'A');
    assert.equal(protocol.target.receptorAtoms, 2578);
    assert.equal(protocol.target.sourceSha256, 'src-sha');
    assert.equal(protocol.target.receptorPdbqtSha256, 'rec-sha');
    assert.deepEqual(protocol.target.pocket.boxSize, [20, 20, 20]);
    assert.equal(protocol.target.pocket.source, 'co-crystallised ligand STI');
    assert.match(protocol.target.preparation.note, /loops NOT modelled/);
  });

  test('every candidate appears — including the rejected one, with the reason the pipeline recorded', () => {
    const ctx = seedRun();
    const { protocol } = buildCandidateProtocol(ctx.db, ctx.campaignId);
    assert.equal(protocol.candidates.length, 3);
    const dropped = protocol.candidates.find((c) => c.candidateId === ctx.ids.dropped);
    assert.equal(dropped.status, 'rejected');
    assert.equal(dropped.rejectedReason, 'constraint:lipinski_hbd');
    assert.deepEqual(dropped.constraintViolations, ['lipinski_hbd']);
    assert.equal(dropped.transformationClass, 'COMPUTATIONAL TRANSFORMATION (RDKit), not a synthesised compound');
    assert.deepEqual(protocol.funnel, {
      generated: 3, retained: 2, rejected: 1, docked: 1, admetAssessed: 1, quantumAssessed: 1,
      rejectionReasons: ['constraint:lipinski_hbd'],
    });
    const notSelected = protocol.candidates.find((c) => c.candidateId === ctx.ids.second);
    assert.equal(notSelected.selection[0].reason, 'NOT_SELECTED_FOR_DOCKING');
    assert.ok(protocol.selectionCriteria.pipelineRules.some((r) => r.includes('SELECTED_FOR_DOCKING: on Pareto front')));
    assert.deepEqual(protocol.evidence.blocked, [{ stage: 'quantum', blocker: 'BLOCKED_BY_RUNTIME', error: null }]);
  });

  test('the finalist carries its score, pose hash, endpoints and whether it met the REGISTERED threshold', () => {
    const ctx = seedRun();
    const { protocol } = buildCandidateProtocol(ctx.db, ctx.campaignId);
    assert.equal(protocol.finalists.length, 1);
    const [best] = protocol.finalists;
    assert.equal(best.rank, 1);
    assert.equal(best.candidateId, ctx.ids.winner);
    assert.equal(best.scoreKcalMol, -12.6);
    assert.equal(best.poseSha256, 'pose-sha');
    assert.equal(best.meetsRegisteredThreshold, true);
    assert.deepEqual(best.keyEndpoints, { AMES: 0.17, hERG: 0.36, DILI: 0.27, ClinTox: 0.08 });
    const winner = protocol.candidates.find((c) => c.candidateId === ctx.ids.winner);
    assert.match(winner.stages.docking.evidenceClass, /not a measured affinity/);
    assert.equal(winner.stages.quantum.energyHartree, -1234.5);
    assert.equal(winner.stages.quantum.homoLumoGapEv, 4.2);
    assert.equal(winner.researchGate.verdict, 'RESEARCH_PRIORITY_ELIGIBLE');
  });

  test('no synthesis route is invented, and the validation protocol is marked as needing a physical lab', () => {
    const ctx = seedRun();
    const { protocol } = buildCandidateProtocol(ctx.db, ctx.campaignId);
    assert.equal(protocol.synthesis.routeProvided, false);
    assert.equal(protocol.synthesis.engine, null);
    assert.equal(protocol.synthesis.status, 'NOT_ATTEMPTED');
    assert.match(protocol.synthesis.statement, /Genesis writes a route only when its retrosynthesis engine produced one/);
    assert.ok(['SOURCE_REQUIRED', 'BLOCKED'].includes(protocol.synthesis.readinessClassification));
    const v = protocol.proposedValidationProtocol;
    assert.equal(v.status, 'REQUIRES_PHYSICAL_LABORATORY');
    assert.equal(v.executedByGenesis, false);
    // One step per preregistered criterion, each tied to the criterion it would test.
    assert.deepEqual(v.steps.map((s) => s.criterionId), ['docking', 'retained', 'ames', 'herg']);
    for (const step of v.steps) {
      assert.equal(step.status, 'NOT_EXECUTED');
      assert.match(step.apparatus, /NOT_CONNECTED/);
      assert.ok(step.wouldFalsify.length > 10);
    }
    assert.equal(v.steps[0].criticalCriterion, true);
    assert.match(protocol.boundary, /Nothing in this protocol was measured on physical apparatus/);
  });

  test('every estimate is labelled as an estimate, and the replay identity is on record', () => {
    const ctx = seedRun();
    const { protocol } = buildCandidateProtocol(ctx.db, ctx.campaignId);
    const claims = protocol.uncertainty.map((u) => u.claim);
    assert.ok(claims.includes('Docking score'));
    assert.ok(claims.includes('ADMET and toxicity endpoints'));
    assert.match(protocol.uncertainty.find((u) => u.claim === 'Docking score').statement, /RIGID receptor/);
    assert.equal(protocol.replay.engineVerifications.length, 1);
    assert.equal(protocol.replay.engineVerifications[0].verdict, 'MATCH');
    assert.equal(protocol.replay.engineVerifications[0].runId, ctx.dockRunId);
    assert.equal(protocol.replay.howToReproduce.length, 3);
    assert.equal(protocol.evidence.scienceRuns.length, 3);
    assert.ok(protocol.evidence.scienceRuns.every((r) => r.outputHash));
  });

  test('without a preregistration the protocol says so instead of implying one, and the fingerprint follows the record', () => {
    const ctx = seedRun();
    const first = buildCandidateProtocol(ctx.db, ctx.campaignId).protocol;
    const again = buildCandidateProtocol(ctx.db, ctx.campaignId).protocol;
    assert.equal(first.protocolFingerprint, again.protocolFingerprint);
    // A new record (the sealed session) changes the protocol, so the fingerprint changes with it.
    sealVerdict(ctx);
    assert.notEqual(buildCandidateProtocol(ctx.db, ctx.campaignId).protocol.protocolFingerprint, first.protocolFingerprint);

    const bare = openDatabase(':memory:');
    const u = createUser(bare, { email: 'bare@lab.org', displayName: 'B', passwordHash: hashPassword('password123') });
    const p = createProject(bare, { name: 'Bare', ownerId: u.id });
    const c = createCampaign(bare, { projectId: p.id, objective: 'nic', domain: 'DRUG_DISCOVERY', budget: { maxGenerations: 1, maxGeneratedCandidates: 2 }, stopping: { patience: 1, minImprovement: 1e-4, diversityFloor: 0.05 }, strategy: { startingSmiles: ['c1ccccc1'], transformationWeights: {}, parentSelection: 'pareto' }, createdBy: u.id });
    const { protocol } = buildCandidateProtocol(bare, c.id);
    assert.equal(protocol.hypothesis.registeredBeforeExecution, false);
    assert.equal(protocol.hypothesis.why, 'no preregistration record exists for this campaign');
    assert.equal(protocol.verdict, null);
    assert.ok(protocol.uncertainty.some((u2) => u2.claim === 'Preregistration' && u2.label === 'MISSING'));
    assert.deepEqual(protocol.finalists, []);
    assert.match(protocol.nextStep, /re-run the docking stage/);
    assert.equal(buildCandidateProtocol(bare, 'nope').error, 'campaign_not_found');
  });
});

/* ---------------- the route, when the retrosynthesis engine really ran ---------------- */
import { addEvent as addCampaignEvent } from './campaign/persistence.mjs';

describe('the synthesis section carries the engine’s route, or the honest absence of one', () => {
  test('a persisted retrosynthesis run appears as a PROPOSED route, read forward, with its model identity', () => {
    const ctx = seedRun();
    saveScienceRun(ctx.db, {
      projectId: ctx.projectId, campaignId: ctx.campaignId, candidateId: ctx.ids.winner,
      engine: 'AiZynthFinder', engineVersion: '4.4.1', capability: 'retrosynthesis-route-search',
      method: 'mcts tree search, expansion policy uspto', status: 'ok', evidenceClass: 'MODEL_ESTIMATE',
      inputs: { smiles: IMATINIB, iterationLimit: 100, maxRoutes: 5 },
      outputs: {
        solved: true, routeCount: 1, stoppedBy: 'ITERATION_LIMIT',
        routes: [{
          rank: 1, steps: 2, allStartingMaterialsInStock: true, score: 0.99,
          // The engine returns disconnections target-first; the protocol must read them forward.
          reactions: [
            { reactionSmiles: 'target>>intermediate.reagentB', templateHash: 'h2', policyProbability: 0.41, policyName: 'uspto' },
            { reactionSmiles: 'intermediate>>materialA.reagentA', templateHash: 'h1', policyProbability: 0.72, policyName: 'uspto' },
          ],
          startingMaterials: [{ smiles: 'materialA', inStock: true }, { smiles: 'reagentA', inStock: true }, { smiles: 'reagentB', inStock: true }],
        }],
      },
      provenance: {
        engine: 'AiZynthFinder 4.4.1', license: 'MIT (AiZynthFinder, MolecularAI)',
        modelChecksums: { expansion_policy_model: 'model-sha', expansion_templates: 'tpl-sha', stock: 'stock-sha' },
        determinism: 'Bounded by the iteration limit — a replay on the same models reproduces the search.',
      },
      outputHash: 'route-hash',
    });
    const { protocol } = buildCandidateProtocol(ctx.db, ctx.campaignId);
    const s = protocol.synthesis;
    assert.equal(s.routeProvided, true);
    assert.equal(s.engine, 'AiZynthFinder 4.4.1');
    assert.equal(s.solved, true);
    assert.equal(s.candidateId, ctx.ids.winner);
    assert.equal(s.topRoute.steps, 2);
    assert.deepEqual(s.topRoute.reactionsForward.map((r) => [r.step, r.reactionSmiles]), [
      [1, 'intermediate>>materialA.reagentA'],
      [2, 'target>>intermediate.reagentB'],
    ]);
    assert.equal(s.topRoute.allStartingMaterialsInStock, true);
    assert.deepEqual(s.modelChecksums, { expansion_policy_model: 'model-sha', expansion_templates: 'tpl-sha', stock: 'stock-sha' });
    assert.equal(s.license, 'MIT (AiZynthFinder, MolecularAI)');
    assert.match(s.boundary, /no conditions, stoichiometry, yields, work-up or safety assessment/);
    assert.match(s.statement, /proposal, not a validated procedure/);
    assert.ok(protocol.uncertainty.some((u) => u.claim === 'Proposed synthesis route' && u.label === 'MODEL_ESTIMATE'));
  });

  test('when the engine could not run, the protocol names the missing model files instead of a route', () => {
    const ctx = seedRun();
    addCampaignEvent(ctx.db, {
      campaignId: ctx.campaignId, type: 'STAGE_BLOCKED',
      payload: { stage: 'retrosynthesis', candidateId: ctx.ids.winner, blocker: 'BLOCKED_BY_RUNTIME', reason: 'MODEL_FILES_MISSING', missingModelFiles: ['uspto_model.onnx', 'zinc_stock.hdf5'] },
    });
    const { protocol } = buildCandidateProtocol(ctx.db, ctx.campaignId);
    assert.equal(protocol.synthesis.routeProvided, false);
    assert.equal(protocol.synthesis.status, 'BLOCKED_BY_RUNTIME');
    assert.equal(protocol.synthesis.reason, 'MODEL_FILES_MISSING');
    assert.deepEqual(protocol.synthesis.missingModelFiles, ['uspto_model.onnx', 'zinc_stock.hdf5']);
    assert.equal(protocol.synthesis.topRoute, undefined);
  });
});
