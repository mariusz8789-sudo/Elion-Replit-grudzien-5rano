import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';
import * as campaignStore from './campaign/persistence.mjs';
import * as knowledgeApi from './knowledgeApi.mjs';

/**
 * Genesis Virtual Lab Closed Loop — API layer. Proves RBAC, project/campaign
 * ownership isolation, the real plan -> execute -> replay route sequence
 * (real RDKit descriptors — genuinely available in this environment), the
 * propose-only Evidence bridge on the SAME canonical ledger every other
 * proposal uses, and honest client-input rejection (never a fabricated 201).
 */
let db;
beforeEach(() => { db = openDatabase(); });

function call(method, pathname, { token, body, query } = {}) {
  return handleApi(db, { method, pathname, token, body, query });
}
function register(email) {
  return call('POST', '/api/auth/register', { body: { email, password: 'password123' } }).body;
}
function makeProject(token) {
  return call('POST', '/api/projects', { token, body: { name: 'Virtual Lab Closed Loop' } }).body.project;
}
function seedCampaignAndCandidate(db, projectId, createdBy) {
  const campaign = campaignStore.createCampaign(db, {
    projectId,
    objective: 'Virtual lab API fixture',
    domain: 'DRUG_DISCOVERY',
    budget: { maxGenerations: 1, maxGeneratedCandidates: 4 },
    stopping: { patience: 3, minImprovement: 1e-4, diversityFloor: 0.05 },
    strategy: { startingSmiles: ['c1ccccc1'], transformationWeights: {}, parentSelection: 'pareto' },
    createdBy,
  });
  const candidateId = campaignStore.addCandidate(db, {
    campaignId: campaign.id, generation: 0, canonicalSmiles: 'CC(=O)Oc1ccccc1C(=O)O', valid: true, status: 'retained',
  });
  return { campaignId: campaign.id, candidateId };
}

describe('Test: full closed loop — plan -> execute -> Evidence proposal -> replay', () => {
  test('a complete, honest round trip produces exactly the expected sequence of governed events', async () => {
    const owner = register('vlab-owner@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);

    const planned = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/virtual-lab`, {
      token: owner.token,
      body: {
        candidateId,
        hypothesis: 'Aspirin has a computed LogP consistent with prior published estimates.',
        requestedCapability: 'molecular-descriptors',
        expectation: { outputKey: 'crippenLogP', comparator: 'LTE', threshold: 2.5 },
      },
    });
    assert.equal(planned.status, 201);
    assert.equal(planned.body.plan.status, 'PLANNED');
    assert.equal(planned.body.plan.clinicalEfficacy, 'UNKNOWN');
    const executionId = planned.body.plan.executionId;

    const dossierBefore = await call('GET', `/api/projects/${project.id}/campaigns/${campaignId}/virtual-lab`, { token: owner.token, query: { candidate: candidateId } });
    assert.equal(dossierBefore.status, 200);
    assert.equal(dossierBefore.body.dossier.plans.length, 1);
    assert.equal(dossierBefore.body.dossier.results.length, 0);
    assert.equal(dossierBefore.body.dossier.nextAction.action, 'EXECUTE_VIRTUAL_EXPERIMENT');

    const executed = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/virtual-lab/execute`, {
      token: owner.token, body: { candidateId, executionId },
    });
    assert.equal(executed.status, 201);
    assert.equal(executed.body.result.status, 'EXECUTED_COMPUTATIONAL_EXPERIMENT');
    assert.equal(executed.body.result.selectedEngine.engineName, 'RDKit');
    assert.equal(executed.body.result.epistemicClassification, 'IN_SILICO_SUPPORT');
    assert.ok(executed.body.evidenceProposal, 'a real execution must produce a real Evidence proposal');
    assert.equal(executed.body.evidenceProposal.mode, 'PROPOSE_ONLY');

    // Evidence is a PENDING proposal on the SAME canonical ledger — never auto-published.
    const mine = knowledgeApi.listProposals().proposals.find((p) => p.proposalId === executed.body.evidenceProposal.proposalId);
    assert.ok(mine, 'the proposal must be visible on the same canonical ledger every other proposal uses');
    assert.equal(mine.status, 'pending');
    assert.equal(mine.sourceKind, 'dataset');

    const replayed = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/virtual-lab/${executionId}/replay`, {
      token: owner.token, body: { candidateId },
    });
    assert.equal(replayed.status, 201);
    assert.equal(replayed.body.replay.replayStatus, 'REPLAY_MATCH');

    const finalDossier = await call('GET', `/api/projects/${project.id}/campaigns/${campaignId}/virtual-lab`, { token: owner.token, query: { candidate: candidateId } });
    assert.equal(finalDossier.body.dossier.results.length, 1);
    assert.equal(finalDossier.body.dossier.replays.length, 1);
    assert.equal(finalDossier.body.dossier.evidenceLinks.length, 1);
    assert.equal(finalDossier.body.dossier.nextAction.action, 'ESCALATE_TO_EXTERNAL_VALIDATION');
    assert.ok(finalDossier.body.dossier.dossierFingerprint);
  });
});

describe('Test: RBAC — a viewer cannot mutate the virtual lab', () => {
  test('viewer is forbidden from planning, executing, or replaying; can still read the dossier', async () => {
    const owner = register('vlab-rbac-owner@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const viewer = register('vlab-rbac-viewer@lab.org');
    const addMember = await call('POST', `/api/projects/${project.id}/members`, { token: owner.token, body: { email: 'vlab-rbac-viewer@lab.org', role: 'viewer' } });
    assert.equal(addMember.status, 200);

    const planned = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/virtual-lab`, {
      token: viewer.token, body: { candidateId, hypothesis: 'x', requestedCapability: 'molecular-descriptors' },
    });
    assert.equal(planned.status, 403);

    const executed = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/virtual-lab/execute`, {
      token: viewer.token, body: { candidateId, executionId: 'VEXP-does-not-matter' },
    });
    assert.equal(executed.status, 403);

    const replayed = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/virtual-lab/VEXP-x/replay`, {
      token: viewer.token, body: { candidateId },
    });
    assert.equal(replayed.status, 403);

    const read = await call('GET', `/api/projects/${project.id}/campaigns/${campaignId}/virtual-lab`, { token: viewer.token, query: { candidate: candidateId } });
    assert.equal(read.status, 200);
  });

  test('a stranger with no project membership gets 404, never a leaked dossier', async () => {
    const owner = register('vlab-stranger-owner@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const stranger = register('vlab-stranger@lab.org');
    const r = await call('GET', `/api/projects/${project.id}/campaigns/${campaignId}/virtual-lab`, { token: stranger.token, query: { candidate: candidateId } });
    assert.equal(r.status, 404);
  });
});

describe('Test: campaign/project ownership', () => {
  test('a campaign belonging to a different project is 404', async () => {
    const owner = register('vlab-cross-project@lab.org');
    const projectA = makeProject(owner.token);
    const projectB = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, projectA.id, owner.user.id);
    const r = await call('GET', `/api/projects/${projectB.id}/campaigns/${campaignId}/virtual-lab`, { token: owner.token, query: { candidate: candidateId } });
    assert.equal(r.status, 404);
  });

  test('a candidate from a different campaign is refused, never silently cross-linked', async () => {
    const owner = register('vlab-cross-campaign@lab.org');
    const project = makeProject(owner.token);
    const a = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const b = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const r = await call('POST', `/api/projects/${project.id}/campaigns/${a.campaignId}/virtual-lab`, {
      token: owner.token, body: { candidateId: b.candidateId, hypothesis: 'x', requestedCapability: 'molecular-descriptors' },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'candidate_not_found');
  });
});

describe('Test: honest client-input rejection — never a fabricated success', () => {
  test('a client cannot submit a fabricated output or epistemic classification — the API contract has no such field', async () => {
    const owner = register('vlab-no-fabrication@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const planned = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/virtual-lab`, {
      token: owner.token,
      body: {
        candidateId, hypothesis: 'x', requestedCapability: 'molecular-descriptors',
        // A hostile client tries to inject a fabricated result directly into the plan body.
        status: 'EXECUTED_COMPUTATIONAL_EXPERIMENT', epistemicClassification: 'IN_SILICO_SUPPORT', derivedOutput: { crippenLogP: 999 },
      },
    });
    assert.equal(planned.status, 201);
    assert.equal(planned.body.plan.status, 'PLANNED', 'the plan step never accepts a client-supplied execution status');
    assert.equal(Object.prototype.hasOwnProperty.call(planned.body.plan, 'derivedOutput'), false);
  });

  test('an unknown capability is refused, never silently coerced into a real one', async () => {
    const owner = register('vlab-badcapability@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const r = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/virtual-lab`, {
      token: owner.token, body: { candidateId, hypothesis: 'x', requestedCapability: 'made-up-capability' },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'unknown_capability');
  });

  test('malformed identifiers (unknown candidate) are rejected with a clear error, never a fabricated 201', async () => {
    const owner = register('vlab-badcandidate@lab.org');
    const project = makeProject(owner.token);
    const { campaignId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const r = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/virtual-lab`, {
      token: owner.token, body: { candidateId: 'does-not-exist', hypothesis: 'x', requestedCapability: 'molecular-descriptors' },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'candidate_not_found');
  });

  test('replaying an executionId that was never planned is refused', async () => {
    const owner = register('vlab-noplan-replay@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const r = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/virtual-lab/VEXP-never-planned/replay`, {
      token: owner.token, body: { candidateId },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'result_not_found');
  });
});

describe('Test: BLOCKED_UNBOUND_ENGINE via the API — never a fabricated result', () => {
  test('a capability with no campaign-level execution binding is honestly blocked, and produces no Evidence proposal', async () => {
    const owner = register('vlab-unbound@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const planned = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/virtual-lab`, {
      token: owner.token, body: { candidateId, hypothesis: 'FDTD probe.', requestedCapability: 'maxwell-fdtd' },
    });
    const executed = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/virtual-lab/execute`, {
      token: owner.token, body: { candidateId, executionId: planned.body.plan.executionId },
    });
    assert.equal(executed.status, 201);
    assert.equal(executed.body.result.status, 'BLOCKED_UNBOUND_ENGINE');
    assert.equal(executed.body.evidenceProposal, null);
  });
});
