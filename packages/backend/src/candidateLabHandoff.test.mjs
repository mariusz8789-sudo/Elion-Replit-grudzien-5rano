/* Proprietary / All Rights Reserved - Genesis OS */
import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { handleApi } from './api.mjs';
import { openDatabase, saveScienceRun, saveScienceRunVerification } from './store.mjs';
import * as campaignStore from './campaign/persistence.mjs';
import { proposeStructuredEvidence } from './knowledgeApi.mjs';
import { preregisterExperiment } from './experimentMemory.mjs';
import { prepareCandidateLabHandoff } from './campaign/candidateLabHandoff.mjs';
import { protocolInvariantHolds } from './campaign/preclinicalProtocol.mjs';

const tempDirs = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function call(db, method, pathname, { token, body, query } = {}) {
  return handleApi(db, { method, pathname, token, body, query });
}

function register(db, email) {
  return call(db, 'POST', '/api/auth/register', {
    body: { email, password: 'password123' },
  }).body;
}

function makeProject(db, token, name = 'Candidate lab handoff') {
  return call(db, 'POST', '/api/projects', {
    token,
    body: { name },
  }).body.project;
}

function seedEvidenceReplay(db, { campaignId, candidateId, run }) {
  const executionId = `fixture-${run.id}`;
  const proposed = proposeStructuredEvidence({
    sourceUrl: `genesis://virtual-lab/science-run/${run.id}`,
    sourceTimestamp: new Date().toISOString(),
    claim: `Fixture-backed computational result for ${run.capability}; no physical or clinical claim.`,
    claimType: 'model',
    confidence: 0.5,
    provenance: {
      sourceKind: 'dataset',
      retrievedBy: 'candidate-lab-handoff-test',
      independentSourceIds: [`science-run:${run.id}`],
    },
  });
  assert.equal(proposed.ok, true);
  campaignStore.addEvent(db, {
    campaignId, generation: 0, type: 'VIRTUAL_EXPERIMENT_RESULT',
    payload: { executionId, candidateId, scienceRunId: run.id, status: 'EXECUTED_COMPUTATIONAL_EXPERIMENT' },
  });
  campaignStore.addEvent(db, {
    campaignId, generation: 0, type: 'VIRTUAL_EXPERIMENT_EVIDENCE_PROPOSED',
    payload: {
      executionId, candidateId, proposalId: proposed.proposalId,
      evidenceContentHash: proposed.record.contentHash, mode: 'PROPOSE_ONLY', status: 'PENDING_HUMAN_PUBLICATION',
    },
  });
  const verification = saveScienceRunVerification(db, {
    scienceRunId: run.id, verdict: 'MATCH',
    originalOutputHash: run.outputHash, replayOutputHash: run.outputHash,
    originalEngineVersion: run.engineVersion, replayEngineVersion: run.engineVersion,
  });
  campaignStore.addEvent(db, {
    campaignId, generation: 0, type: 'VIRTUAL_EXPERIMENT_REPLAY',
    payload: {
      executionId, candidateId, scienceRunId: run.id, verificationId: verification.id,
      underlyingVerdict: 'MATCH', replayStatus: 'REPLAY_MATCH',
    },
  });
  return { proposed, verification };
}

function seedCampaign(db, { projectId, userId, assessed = true, withCandidate = true } = {}) {
  const campaign = campaignStore.createCampaign(db, {
    projectId,
    objective: 'Find a computational candidate for an external target-binding assay',
    domain: 'DRUG_DISCOVERY',
    budget: { maxGenerations: 1, maxGeneratedCandidates: 4 },
    stopping: { patience: 2, minImprovement: 1e-4, diversityFloor: 0.05 },
    strategy: { startingSmiles: ['c1ccccc1'], transformationWeights: {}, parentSelection: 'pareto' },
    createdBy: userId,
  });
  preregisterExperiment(db, {
    projectId,
    campaign: campaignStore.getCampaign(db, campaign.id),
    userId,
    hypothesis: {
      subject: 'benzene-fixture',
      target: { targetId: 'TARGET-1', pdbId: '1ABC', chain: 'A', protein: 'fixture protein' },
      statement: 'The candidate binds the preregistered target.',
      criteria: [
        { id: 'docking', critical: true, threshold: -7, evidence: 'REAL_ENGINE_OUTPUT', label: 'Vina score at or below -7 kcal/mol' },
        { id: 'retained', critical: false, threshold: null, evidence: 'REAL_ENGINE_OUTPUT', label: 'Candidate identity retained' },
      ],
      plan: [{ stage: 'docking', engine: 'AutoDock Vina', label: 'Docking', evidence: 'REAL_ENGINE_OUTPUT' }],
    },
  });

  if (!withCandidate) return { campaignId: campaign.id, candidateId: null };

  const candidateId = campaignStore.addCandidate(db, {
    campaignId: campaign.id,
    generation: 0,
    canonicalSmiles: 'c1ccccc1',
    valid: true,
    status: 'retained',
  });
  campaignStore.addEvent(db, {
    campaignId: campaign.id,
    generation: 0,
    type: 'STAGE_RESULT',
    payload: {
      stage: 'admet',
      candidateId,
      reason: assessed ? 'ADMET_COMPUTED' : 'ADMET_NOT_RUN',
      keyEndpoints: assessed ? { AMES: 0.11, hERG: 0.23 } : null,
    },
  });
  if (assessed) {
    const admetRun = saveScienceRun(db, {
      projectId,
      campaignId: campaign.id,
      candidateId,
      engine: 'ADMET-AI',
      engineVersion: '1.4.0',
      capability: 'admet-prediction',
      method: 'fixture model',
      status: 'ok',
      evidenceClass: 'MODEL_ESTIMATE',
      inputs: { smiles: 'c1ccccc1' },
      outputs: { AMES: 0.11, hERG: 0.23 },
      units: {},
      provenance: { model: 'fixture-pinned' },
      inputHash: 'admet-input-sha',
      outputHash: 'admet-output-sha',
      environmentHash: 'admet-env-sha',
      durationMs: 20,
    });
    seedEvidenceReplay(db, { campaignId: campaign.id, candidateId, run: admetRun });
  }
  const dockRun = saveScienceRun(db, {
    projectId,
    campaignId: campaign.id,
    candidateId,
    engine: 'AutoDock Vina',
    engineVersion: '1.2.7',
    capability: 'molecular-docking',
    method: 'vina fixed fixture',
    status: 'ok',
    evidenceClass: 'REAL_ENGINE_OUTPUT',
    inputs: {
      exhaustiveness: 8,
      nPoses: 5,
      seed: 42,
      center: [0, 0, 0],
      boxSize: [20, 20, 20],
      receptorPdbqtSha256: 'receptor-sha',
    },
    outputs: {
      bestAffinityKcalMol: -8.4,
      poseSha256: 'pose-sha',
      ligandPdbqtSha256: 'ligand-sha',
      nPoses: 5,
    },
    units: { bestAffinityKcalMol: 'kcal/mol' },
    provenance: { target: { targetId: 'TARGET-1', pdbId: '1ABC', chain: 'A' } },
    inputHash: 'dock-input-sha',
    outputHash: 'dock-output-sha',
    environmentHash: 'dock-env-sha',
    durationMs: 100,
  });
  seedEvidenceReplay(db, { campaignId: campaign.id, candidateId, run: dockRun });
  return { campaignId: campaign.id, candidateId };
}

describe('canonical candidate -> laboratory handoff E2E', () => {
  test('server projects persisted candidate evidence, creates one governed request and recovers it after restart', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-candidate-handoff-'));
    tempDirs.push(dir);
    const dbPath = path.join(dir, 'genesis.db');
    let db = openDatabase(dbPath);

    const owner = register(db, 'candidate-handoff@genesis.test');
    const project = makeProject(db, owner.token);
    const { campaignId, candidateId } = seedCampaign(db, {
      projectId: project.id,
      userId: owner.user.id,
      assessed: true,
    });

    const endpoint = `/api/projects/${project.id}/campaigns/${campaignId}/lab-handoff`;
    const body = {
      candidateId,
      externalProvider: { providerId: 'independent-cro', providerType: 'CRO' },
    };
    const first = call(db, 'POST', endpoint, { token: owner.token, body });

    assert.equal(first.status, 201);
    assert.equal(first.body.handoff.outcome, 'LAB_HANDOFF_READY');
    assert.equal(first.body.handoff.requiresHumanApproval, true);
    assert.equal(first.body.handoff.executionAuthority, 'EXTERNAL_LAB_ONLY');
    assert.equal(first.body.handoff.scientificTruth.scoreIsMeasurement, false);
    assert.equal(first.body.handoff.scientificTruth.physicalAssayExecuted, false);
    assert.equal(first.body.handoff.scientificTruth.clinicalEfficacy, 'UNKNOWN');
    assert.equal(first.body.handoff.evidenceReplayGate.status, 'READY');
    assert.equal(first.body.handoff.evidenceReplayGate.scienceRuns.length, 2);
    assert.ok(first.body.handoff.evidenceReplayGate.scienceRuns.every((run) => run.replayVerdict === 'MATCH'));
    assert.match(first.body.handoff.claimBoundary, /COMPUTATIONAL HANDOFF ONLY/);

    const preclinical = first.body.handoff.preclinicalProtocol;
    assert.equal(protocolInvariantHolds(preclinical), true);
    assert.equal(preclinical.gateLock.winnerRecordPossibleNow, false);
    assert.equal(preclinical.gateLock.recipePossibleNow, false);
    assert.ok(preclinical.axes.some((axis) => axis.axis === 'DOCKING_SCORE_KCAL_MOL' && axis.value === -8.4));
    assert.ok(preclinical.axes.some((axis) => axis.axis === 'ADMET_AMES' && axis.evidenceClass === 'MODEL_ESTIMATE'));
    assert.ok(preclinical.provenance.some((ref) => ref.includes('dock-output-sha')));
    assert.equal('recipe' in preclinical, false);
    assert.equal('winnerRecord' in preclinical, false);

    const request = first.body.handoff.validationRequest;
    assert.equal(request.status, 'READY_FOR_EXTERNAL_LAB_REVIEW');
    assert.equal(request.protocolLink.mode, 'PRECLINICAL_PROTOCOL');
    assert.equal(request.protocolLink.protocolFingerprint, preclinical.protocolFingerprint);
    assert.equal(request.endpointPlan[0].comparisonOutputKey, null, 'an IC50 assay must not be compared directly with a Vina score');
    assert.equal(request.endpointPlan[0].tolerance, null);
    assert.equal(request.externalProvider.providerId, 'independent-cro');
    assert.equal(request.computationalEvidence.status, 'READY');
    assert.equal(request.computationalEvidence.scienceRuns.length, 2);

    const repeated = call(db, 'POST', endpoint, { token: owner.token, body });
    assert.equal(repeated.status, 201);
    assert.equal(repeated.body.deduped, true);
    assert.equal(repeated.body.handoff.validationRequest.requestId, request.requestId);
    assert.equal(repeated.body.handoff.handoffFingerprint, first.body.handoff.handoffFingerprint);
    assert.equal(
      campaignStore.listEvents(db, campaignId).filter((event) => event.type === 'LAB_VALIDATION_REQUESTED').length,
      1,
    );

    db.close();
    db = openDatabase(dbPath);
    const afterRestart = call(db, 'POST', endpoint, { token: owner.token, body });
    assert.equal(afterRestart.status, 201);
    assert.equal(afterRestart.body.deduped, true);
    assert.equal(afterRestart.body.handoff.validationRequest.requestId, request.requestId);
    assert.equal(afterRestart.body.handoff.preclinicalProtocol.protocolFingerprint, preclinical.protocolFingerprint);
    assert.equal(afterRestart.body.handoff.handoffFingerprint, first.body.handoff.handoffFingerprint);

    const dossier = call(
      db,
      'GET',
      `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`,
      { token: owner.token, query: { candidate: candidateId } },
    );
    assert.equal(dossier.status, 200);
    assert.equal(dossier.body.dossier.requests.length, 1);
    assert.equal(dossier.body.dossier.nextResearchAction.action, 'AWAIT_EXTERNAL_OBSERVATION');
    db.close();
  });

  test('NO_WINNER and research-gate blockers remain explicit scientific outcomes', () => {
    const db = openDatabase(':memory:');
    const owner = register(db, 'candidate-handoff-boundaries@genesis.test');
    const project = makeProject(db, owner.token, 'Boundaries');

    const empty = seedCampaign(db, {
      projectId: project.id,
      userId: owner.user.id,
      withCandidate: false,
    });
    const noWinner = call(
      db,
      'POST',
      `/api/projects/${project.id}/campaigns/${empty.campaignId}/lab-handoff`,
      { token: owner.token, body: {} },
    );
    assert.equal(noWinner.status, 200);
    assert.equal(noWinner.body.handoff.outcome, 'NO_WINNER');
    assert.equal(noWinner.body.handoff.reason, 'NO_FINALIST_WITH_DOCKING_RESULT');
    assert.equal(noWinner.body.handoff.requiresHumanApproval, true);
    assert.equal(noWinner.body.handoff.evidenceReplayGate.status, 'NOT_APPLICABLE');
    assert.equal(
      campaignStore.listEvents(db, empty.campaignId).filter((event) => event.type === 'LAB_VALIDATION_REQUESTED').length,
      0,
    );

    const dockingBlocked = seedCampaign(db, {
      projectId: project.id,
      userId: owner.user.id,
      assessed: true,
    });
    db.prepare('DELETE FROM science_runs WHERE campaign_id = ? AND capability = ?')
      .run(dockingBlocked.campaignId, 'molecular-docking');
    campaignStore.addEvent(db, {
      campaignId: dockingBlocked.campaignId,
      generation: 0,
      type: 'STAGE_BLOCKED',
      payload: {
        stage: 'docking',
        blocker: 'BLOCKED_BY_RUNTIME',
        reason: 'AutoDock Vina runtime unavailable.',
      },
    });
    const runtimeBlocked = call(
      db,
      'POST',
      `/api/projects/${project.id}/campaigns/${dockingBlocked.campaignId}/lab-handoff`,
      { token: owner.token, body: { candidateId: dockingBlocked.candidateId } },
    );
    assert.equal(runtimeBlocked.status, 200);
    assert.equal(runtimeBlocked.body.handoff.outcome, 'BLOCKED');
    assert.equal(runtimeBlocked.body.handoff.reason, 'BLOCKED_BY_RUNTIME');
    assert.equal(
      campaignStore.listEvents(db, dockingBlocked.campaignId).filter((event) => event.type === 'LAB_VALIDATION_REQUESTED').length,
      0,
    );

    const blocked = seedCampaign(db, {
      projectId: project.id,
      userId: owner.user.id,
      assessed: false,
    });
    const blockedResult = call(
      db,
      'POST',
      `/api/projects/${project.id}/campaigns/${blocked.campaignId}/lab-handoff`,
      { token: owner.token, body: { candidateId: blocked.candidateId } },
    );
    assert.equal(blockedResult.status, 201);
    assert.equal(blockedResult.body.handoff.outcome, 'BLOCKED');
    assert.equal(blockedResult.body.handoff.reason, 'SAFETY_UNASSESSED');
    assert.equal(blockedResult.body.handoff.validationRequest.status, 'DRAFT_BLOCKED_BY_RESEARCH_GATE');

    const prepared = prepareCandidateLabHandoff(db, {
      campaignId: blocked.campaignId,
      candidateId: 'not-a-finalist',
    });
    assert.equal(prepared.ok, true);
    assert.equal(prepared.handoff.outcome, 'BLOCKED');
    assert.equal(prepared.handoff.reason, 'CANDIDATE_NOT_A_FINALIST');
    db.close();
  });

  test('a finalist without canonical Evidence and Replay is blocked before any laboratory request', () => {
    const db = openDatabase(':memory:');
    const owner = register(db, 'candidate-handoff-evidence-gate@genesis.test');
    const project = makeProject(db, owner.token, 'Evidence gate');
    const { campaignId, candidateId } = seedCampaign(db, {
      projectId: project.id,
      userId: owner.user.id,
      assessed: true,
    });
    db.prepare('DELETE FROM science_run_verifications WHERE science_run_id IN (SELECT id FROM science_runs WHERE campaign_id = ?)').run(campaignId);

    const blocked = call(
      db,
      'POST',
      `/api/projects/${project.id}/campaigns/${campaignId}/lab-handoff`,
      { token: owner.token, body: { candidateId } },
    );
    assert.equal(blocked.status, 200);
    assert.equal(blocked.body.handoff.outcome, 'BLOCKED');
    assert.equal(blocked.body.handoff.reason, 'REPLAY_VERIFICATION_MISSING');
    assert.ok(blocked.body.handoff.evidenceReplayGate.scienceRuns.every((run) => run.evidenceProposalId));
    assert.ok(blocked.body.handoff.evidenceReplayGate.scienceRuns.every((run) => run.replayVerificationId === null));
    assert.equal(
      campaignStore.listEvents(db, campaignId).filter((event) => event.type === 'LAB_VALIDATION_REQUESTED').length,
      0,
    );
    db.close();
  });
});
