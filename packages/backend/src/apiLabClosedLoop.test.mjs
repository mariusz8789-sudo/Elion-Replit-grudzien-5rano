import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, saveScienceRun } from './store.mjs';
import { handleApi } from './api.mjs';
import * as campaignStore from './campaign/persistence.mjs';
import * as knowledgeApi from './knowledgeApi.mjs';

/**
 * Genesis Laboratory Closed Loop — the software bridge from a real campaign
 * candidate to an external laboratory observation, through human review, into
 * the SAME canonical EvidenceLedger (propose-only), and a model-vs-observation
 * comparison. Proves the route layer, RBAC, dedupe, the propose-only Evidence
 * boundary, and the explicit-tolerance comparison — never a fabricated result.
 *
 * Candidates and Scientific Runs are seeded directly through the existing
 * canonical persistence/store functions (no RDKit dependency needed — these
 * are raw, deterministic fixture rows, matching the pattern already
 * established in campaignVerify.test.mjs).
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
  return call('POST', '/api/projects', { token, body: { name: 'Lab Closed Loop' } }).body.project;
}
function seedCampaignAndCandidate(db, projectId, createdBy) {
  const campaign = campaignStore.createCampaign(db, {
    projectId,
    objective: 'Lab closed loop fixture',
    domain: 'DRUG_DISCOVERY',
    budget: { maxGenerations: 1, maxGeneratedCandidates: 4 },
    stopping: { patience: 3, minImprovement: 1e-4, diversityFloor: 0.05 },
    strategy: { startingSmiles: ['c1ccccc1'], transformationWeights: {}, parentSelection: 'pareto' },
    createdBy,
  });
  const candidateId = campaignStore.addCandidate(db, {
    campaignId: campaign.id,
    generation: 0,
    canonicalSmiles: 'c1ccccc1',
    valid: true,
    status: 'retained',
  });
  return { campaignId: campaign.id, candidateId };
}
function seedScienceRun(db, campaignId, candidateId, outputs, units = {}) {
  return saveScienceRun(db, {
    projectId: null, campaignId, candidateId,
    engine: 'test-engine', engineVersion: '1.0.0', capability: 'test-capability',
    method: 'fixture', status: 'ok', evidenceClass: 'MODEL_ESTIMATE',
    inputs: {}, outputs, units, warnings: [], provenance: {},
    inputHash: 'fixture-in', outputHash: 'fixture-out', artifacts: [], durationMs: 1,
  });
}
function realisticObservation(overrides = {}) {
  return {
    endpointId: 'target-binding-score',
    value: 0.42,
    unit: 'uM',
    observedAt: '2026-01-15T10:00:00.000Z',
    methodReference: 'SPR binding assay, single concentration screen',
    source: {
      labId: 'acme-cro',
      providerType: 'CRO',
      externalObservationId: 'ACME-OBS-001',
      sourceUri: 'https://acme-cro.example/reports/ACME-OBS-001',
    },
    quality: { status: 'QC_PASSED', confidence: 0.9 },
    ...overrides,
  };
}

describe('Test: full closed loop — request -> observation -> human review -> Evidence proposal -> comparison', () => {
  test('a complete, honest round trip produces exactly the expected sequence of governed events', async () => {
    const owner = register('lab-owner@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);

    const created = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token,
      body: {
        candidateId,
        objective: 'Independent external validation of predicted target-binding score.',
        endpointPlan: [{ endpointId: 'target-binding-score', expectedUnit: 'uM', comparisonOutputKey: 'bindingScore' }],
        externalProvider: { providerId: 'acme-cro', providerType: 'CRO' },
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.request.status, created.body.request.researchGate.verdict === 'RESEARCH_PRIORITY_ELIGIBLE' ? 'READY_FOR_EXTERNAL_LAB_REVIEW' : 'DRAFT_BLOCKED_BY_RESEARCH_GATE');
    assert.match(created.body.request.requestId, /^LABREQ-/);
    const requestId = created.body.request.requestId;

    // Not yet Evidence: only a governed request exists so far.
    const dossierBefore = await call('GET', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, { token: owner.token, query: { candidate: candidateId } });
    assert.equal(dossierBefore.status, 200);
    assert.equal(dossierBefore.body.dossier.requests.length, 1);
    assert.equal(dossierBefore.body.dossier.observations.length, 0);
    assert.equal(dossierBefore.body.dossier.nextResearchAction.action, 'AWAIT_EXTERNAL_OBSERVATION');

    const ingested = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, {
      token: owner.token,
      body: { candidateId, requestId, observation: realisticObservation() },
    });
    assert.equal(ingested.status, 201);
    assert.equal(ingested.body.observation.status, 'INGESTED_UNREVIEWED');
    assert.equal(ingested.body.observation.clinicalEfficacy, 'UNKNOWN');
    const observationId = ingested.body.observation.observationId;

    // Before human review: the dossier itself must not yet show an Evidence link — that is the
    // real "not Evidence yet" proof (the knowledgeApi ledger is a process-wide, accumulating
    // singleton shared by other tests/files, so it is checked by containment below, never a total count).
    const beforeReview = await call('GET', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, { token: owner.token, query: { candidate: candidateId } });
    assert.equal(beforeReview.body.dossier.evidenceLinks.length, 0);

    const review = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations/${observationId}/review`, {
      token: owner.token,
      body: { candidateId, verdict: 'ACCEPTED_AS_OBSERVATION', note: 'Accepted for research comparison only.' },
    });
    assert.equal(review.status, 201);
    assert.equal(review.body.review.verdict, 'ACCEPTED_AS_OBSERVATION');
    assert.ok(review.body.evidenceProposal, 'accepting an observation must produce a real Evidence proposal');
    assert.equal(review.body.evidenceProposal.mode, 'PROPOSE_ONLY');

    // Evidence is a PENDING proposal on the SAME canonical ledger — never auto-published.
    const mine = knowledgeApi.listProposals().proposals.find((p) => p.proposalId === review.body.evidenceProposal.proposalId);
    assert.ok(mine, 'the proposal must be visible on the same canonical ledger every other proposal uses');
    assert.equal(mine.status, 'pending');
    assert.equal(mine.sourceKind, 'dataset');

    const scienceRun = seedScienceRun(db, campaignId, candidateId, { bindingScore: 0.5 }, { bindingScore: 'uM' });

    const compared = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/comparisons`, {
      token: owner.token,
      body: { candidateId, scienceRunId: scienceRun.id, observationId, outputKey: 'bindingScore', tolerance: { absolute: 0.1 } },
    });
    assert.equal(compared.status, 201);
    assert.equal(compared.body.comparison.verdict, 'AGREES_WITHIN_TOLERANCE');
    assert.equal(compared.body.comparison.modelValue, 0.5);
    assert.equal(compared.body.comparison.observedValue, 0.42);
    assert.equal(compared.body.comparison.clinicalEfficacy, 'UNKNOWN');

    const finalDossier = await call('GET', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, { token: owner.token, query: { candidate: candidateId } });
    assert.equal(finalDossier.body.dossier.comparisons.length, 1);
    assert.equal(finalDossier.body.dossier.evidenceLinks.length, 1);
    // A single-lab observation, even agreeing within tolerance, is honestly not yet "accumulation ready".
    assert.equal(finalDossier.body.dossier.nextResearchAction.action, 'SEEK_INDEPENDENT_REPLICATION');
    assert.ok(finalDossier.body.dossier.dossierFingerprint);
  });

  test('a disagreement is reported honestly and drives REVISE_MODEL_OR_HYPOTHESIS, never smoothed over', async () => {
    const owner = register('lab-disagree@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const created = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }] },
    });
    const requestId = created.body.request.requestId;
    const ingested = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, {
      token: owner.token, body: { candidateId, requestId, observation: realisticObservation({ endpointId: 'e1', value: 10, unit: 'nM' }) },
    });
    const observationId = ingested.body.observation.observationId;
    await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations/${observationId}/review`, {
      token: owner.token, body: { candidateId, verdict: 'ACCEPTED_AS_OBSERVATION' },
    });
    const scienceRun = seedScienceRun(db, campaignId, candidateId, { potency: 1000 }, { potency: 'nM' });
    const compared = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/comparisons`, {
      token: owner.token, body: { candidateId, scienceRunId: scienceRun.id, observationId, outputKey: 'potency', tolerance: { absolute: 1 } },
    });
    assert.equal(compared.body.comparison.verdict, 'DISAGREES_OUTSIDE_TOLERANCE');
    const dossier = await call('GET', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, { token: owner.token, query: { candidate: candidateId } });
    assert.equal(dossier.body.dossier.nextResearchAction.action, 'REVISE_MODEL_OR_HYPOTHESIS');
  });
});

describe('Test: RBAC — a viewer cannot mutate the lab closed loop', () => {
  test('viewer is forbidden from creating a request, ingesting, reviewing, or comparing', async () => {
    const owner = register('lab-rbac-owner@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const viewer = register('lab-rbac-viewer@lab.org');
    const addMember = await call('POST', `/api/projects/${project.id}/members`, { token: owner.token, body: { email: 'lab-rbac-viewer@lab.org', role: 'viewer' } });
    assert.equal(addMember.status, 200);

    const request = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: viewer.token, body: { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }] },
    });
    assert.equal(request.status, 403);

    const observations = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, {
      token: viewer.token, body: { candidateId, requestId: 'LABREQ-does-not-matter', observation: realisticObservation() },
    });
    assert.equal(observations.status, 403);

    const review = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations/LABOBS-x/review`, {
      token: viewer.token, body: { candidateId, verdict: 'ACCEPTED_AS_OBSERVATION' },
    });
    assert.equal(review.status, 403);

    const comparisons = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/comparisons`, {
      token: viewer.token, body: { candidateId, scienceRunId: 'x', observationId: 'x', outputKey: 'x', tolerance: { absolute: 1 } },
    });
    assert.equal(comparisons.status, 403);

    // A viewer CAN read the dossier.
    const read = await call('GET', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, { token: viewer.token, query: { candidate: candidateId } });
    assert.equal(read.status, 200);
  });

  test('a stranger with no project membership gets 404, never a leaked dossier', async () => {
    const owner = register('lab-stranger-owner@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const stranger = register('lab-stranger@lab.org');
    const r = await call('GET', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, { token: stranger.token, query: { candidate: candidateId } });
    assert.equal(r.status, 404);
  });
});

describe('Test: deterministic dedupe', () => {
  test('an identical validation request dedupes to the SAME requestId/eventId, never a duplicate event', async () => {
    const owner = register('lab-dedupe-req@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const body = { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }] };
    const first = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, { token: owner.token, body });
    const second = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, { token: owner.token, body });
    assert.equal(first.body.request.requestId, second.body.request.requestId);
    assert.equal(second.body.deduped, true);
    assert.equal(campaignStore.listEvents(db, campaignId).filter((e) => e.type === 'LAB_VALIDATION_REQUESTED').length, 1);
  });

  test('re-ingesting the SAME external observation content dedupes to the SAME observationId', async () => {
    const owner = register('lab-dedupe-obs@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const created = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }] },
    });
    const requestId = created.body.request.requestId;
    const obsBody = { candidateId, requestId, observation: realisticObservation({ endpointId: 'e1' }) };
    const first = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, { token: owner.token, body: obsBody });
    const second = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, { token: owner.token, body: obsBody });
    assert.equal(first.body.observation.observationId, second.body.observation.observationId);
    assert.equal(second.body.deduped, true);
  });
});

describe('Test: fail-closed refusals', () => {
  test('comparing before human acceptance is refused, never silently allowed', async () => {
    const owner = register('lab-unaccepted@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const created = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }] },
    });
    const requestId = created.body.request.requestId;
    const ingested = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, {
      token: owner.token, body: { candidateId, requestId, observation: realisticObservation({ endpointId: 'e1' }) },
    });
    const observationId = ingested.body.observation.observationId;
    const scienceRun = seedScienceRun(db, campaignId, candidateId, { e1: 1 }, { e1: 'uM' });
    const compared = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/comparisons`, {
      token: owner.token, body: { candidateId, scienceRunId: scienceRun.id, observationId, outputKey: 'e1', tolerance: { absolute: 1 } },
    });
    assert.equal(compared.status, 400);
    assert.equal(compared.body.error, 'observation_not_accepted');
  });

  test('a unit mismatch between model output and observation fails closed', async () => {
    const owner = register('lab-unitmismatch@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const created = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }] },
    });
    const requestId = created.body.request.requestId;
    const ingested = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, {
      token: owner.token, body: { candidateId, requestId, observation: realisticObservation({ endpointId: 'e1', unit: 'nM' }) },
    });
    const observationId = ingested.body.observation.observationId;
    await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations/${observationId}/review`, {
      token: owner.token, body: { candidateId, verdict: 'ACCEPTED_AS_OBSERVATION' },
    });
    const scienceRun = seedScienceRun(db, campaignId, candidateId, { e1: 1 }, { e1: 'uM' });
    const compared = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/comparisons`, {
      token: owner.token, body: { candidateId, scienceRunId: scienceRun.id, observationId, outputKey: 'e1', tolerance: { absolute: 1 } },
    });
    assert.equal(compared.status, 400);
    assert.equal(compared.body.error, 'unit_mismatch');
  });

  test('a missing tolerance is refused rather than defaulted', async () => {
    const owner = register('lab-notolerance@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const created = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }] },
    });
    const requestId = created.body.request.requestId;
    const ingested = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, {
      token: owner.token, body: { candidateId, requestId, observation: realisticObservation({ endpointId: 'e1' }) },
    });
    const observationId = ingested.body.observation.observationId;
    await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations/${observationId}/review`, {
      token: owner.token, body: { candidateId, verdict: 'ACCEPTED_AS_OBSERVATION' },
    });
    const scienceRun = seedScienceRun(db, campaignId, candidateId, { e1: 1 }, { e1: 'uM' });
    const compared = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/comparisons`, {
      token: owner.token, body: { candidateId, scienceRunId: scienceRun.id, observationId, outputKey: 'e1' },
    });
    assert.equal(compared.status, 400);
    assert.equal(compared.body.error, 'explicit_tolerance_required');
  });

  test('a NEEDS_CLARIFICATION or REJECTED_INTEGRITY review never creates an Evidence proposal', async () => {
    const owner = register('lab-notaccepted@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const created = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }] },
    });
    const requestId = created.body.request.requestId;
    const ingested = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, {
      token: owner.token, body: { candidateId, requestId, observation: realisticObservation({ endpointId: 'e1' }) },
    });
    const observationId = ingested.body.observation.observationId;
    const review = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations/${observationId}/review`, {
      token: owner.token, body: { candidateId, verdict: 'REJECTED_INTEGRITY', note: 'Chain of custody unclear.' },
    });
    assert.equal(review.status, 201);
    assert.equal(review.body.evidenceProposal, null);
  });

  test('malformed identifiers (unknown candidate) are rejected with a clear error, never a fabricated 201', async () => {
    const owner = register('lab-badcandidate@lab.org');
    const project = makeProject(owner.token);
    const { campaignId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const r = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId: 'does-not-exist', objective: 'x', endpointPlan: [{ endpointId: 'e1' }] },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'candidate_not_found');
  });
});
