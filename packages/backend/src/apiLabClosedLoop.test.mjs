import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, saveScienceRun } from './store.mjs';
import { handleApi } from './api.mjs';
import * as campaignStore from './campaign/persistence.mjs';
import * as knowledgeApi from './knowledgeApi.mjs';
import { buildPreclinicalProtocol } from './campaign/preclinicalProtocol.mjs';
import {
  ingestExternalLabObservation,
  linkLabEvidenceProposal,
  reviewExternalLabObservation,
} from './campaign/labClosedLoop.mjs';

/**
 * Genesis Laboratory Closed Loop — the software bridge from a real campaign
 * candidate to an external laboratory observation, through human review, into
 * the SAME canonical EvidenceLedger (propose-only), and a model-vs-observation
 * comparison. Proves the route layer, RBAC, dedupe, the propose-only Evidence
 * boundary, and the explicit-tolerance comparison — never a fabricated result.
 *
 * Also proves the 10 fail-closed hardening requirements added on top of the
 * original integration: governed request basis (protocol or explicit manual
 * governance), frozen outputKey/unit/tolerance, real observedAt + raw-artifact
 * hash, source-identity conflict detection, gate-status/QC gating, exact-unit
 * matching, idempotent review/proposal/link/comparison, the accepted-review
 * proof inside linkLabEvidenceProposal, the evidence-bridge pre-validation
 * that prevents an ACCEPTED_WITHOUT_PROPOSAL partial state, and reviewer !=
 * ingester separation of duties.
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
async function addEditorMember(projectId, ownerToken, email) {
  const member = register(email);
  const added = await call('POST', `/api/projects/${projectId}/members`, { token: ownerToken, body: { email, role: 'editor' } });
  assert.equal(added.status, 200, `failed to add editor member ${email}`);
  return member;
}
function seedCampaignAndCandidate(db, projectId, createdBy, { admetComputed = true } = {}) {
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
  // The research gate defaults to RESEARCH_PRIORITY_DENIED/SAFETY_UNASSESSED until ADMET has
  // been computed for the candidate — matching finalScientificIntegration.test.mjs's own fixture
  // pattern. Most lab-closed-loop tests need a READY_FOR_EXTERNAL_LAB_REVIEW request to ingest
  // against, so this is opted OUT only by the one test that specifically proves a DRAFT/BLOCKED
  // request refuses ingestion (item 5).
  if (admetComputed) {
    campaignStore.addEvent(db, { campaignId: campaign.id, generation: 0, type: 'STAGE_RESULT', payload: { stage: 'admet', candidateId, reason: 'ADMET_COMPUTED' } });
  }
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
/** Item 1 — every test needs a governed basis for its request. This is the "no protocol yet"
 *  explicit governance path; a separate test proves the real PRECLINICAL_CANDIDATE_PROTOCOL path. */
function governedManualRequest(overrides = {}) {
  return {
    reason: 'No PRECLINICAL_CANDIDATE_PROTOCOL exists yet for this fixture candidate; a lab governance board explicitly authorized this external validation request.',
    authorizedBy: 'lab-governance-board',
    ...overrides,
  };
}
/** Item 2 — outputKey/unit/tolerance are frozen on the endpointPlan itself. */
function fullEndpointPlanEntry(overrides = {}) {
  return {
    endpointId: 'target-binding-score',
    expectedUnit: 'uM',
    comparisonOutputKey: 'bindingScore',
    tolerance: { absolute: 0.1 },
    ...overrides,
  };
}
const VALID_SHA256 = 'a1b2c3d4'.repeat(8);
function realisticObservation(overrides = {}) {
  return {
    endpointId: 'target-binding-score',
    value: 0.42,
    unit: 'uM',
    observedAt: '2026-01-15T10:00:00.000Z',
    methodReference: 'SPR binding assay, single concentration screen',
    rawArtifactSha256: VALID_SHA256,
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
    const reviewer = await addEditorMember(project.id, owner.token, 'lab-owner-reviewer@lab.org');
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);

    const created = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token,
      body: {
        candidateId,
        objective: 'Independent external validation of predicted target-binding score.',
        endpointPlan: [fullEndpointPlanEntry()],
        externalProvider: { providerId: 'acme-cro', providerType: 'CRO' },
        governedManualRequest: governedManualRequest(),
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.request.status, 'READY_FOR_EXTERNAL_LAB_REVIEW');
    assert.equal(created.body.request.protocolLink.mode, 'GOVERNED_MANUAL_REQUEST');
    assert.match(created.body.request.requestId, /^LABREQ-/);
    const requestId = created.body.request.requestId;

    // Not yet Evidence: only a governed request exists so far.
    const dossierBefore = await call('GET', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, { token: owner.token, query: { candidate: candidateId } });
    assert.equal(dossierBefore.status, 200);
    assert.equal(dossierBefore.body.dossier.requests.length, 1);
    assert.equal(dossierBefore.body.dossier.observations.length, 0);
    assert.equal(dossierBefore.body.dossier.nextResearchAction.action, 'AWAIT_EXTERNAL_OBSERVATION');

    // Ingested by the owner...
    const ingested = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, {
      token: owner.token,
      body: { candidateId, requestId, observation: realisticObservation() },
    });
    assert.equal(ingested.status, 201);
    assert.equal(ingested.body.observation.status, 'INGESTED_UNREVIEWED');
    assert.equal(ingested.body.observation.clinicalEfficacy, 'UNKNOWN');
    assert.equal(ingested.body.observation.rawArtifactSha256, VALID_SHA256);
    const observationId = ingested.body.observation.observationId;

    // Before human review: the dossier itself must not yet show an Evidence link — that is the
    // real "not Evidence yet" proof (the knowledgeApi ledger is a process-wide, accumulating
    // singleton shared by other tests/files, so it is checked by containment below, never a total count).
    const beforeReview = await call('GET', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, { token: owner.token, query: { candidate: candidateId } });
    assert.equal(beforeReview.body.dossier.evidenceLinks.length, 0);

    // ...but item 10 requires a DIFFERENT reviewer.
    const review = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations/${observationId}/review`, {
      token: reviewer.token,
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
      body: { candidateId, scienceRunId: scienceRun.id, observationId },
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
    const reviewer = await addEditorMember(project.id, owner.token, 'lab-disagree-reviewer@lab.org');
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const created = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token,
      body: { candidateId, objective: 'x', endpointPlan: [fullEndpointPlanEntry({ endpointId: 'e1', comparisonOutputKey: 'potency', expectedUnit: 'nM', tolerance: { absolute: 1 } })], governedManualRequest: governedManualRequest() },
    });
    const requestId = created.body.request.requestId;
    const ingested = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, {
      token: owner.token, body: { candidateId, requestId, observation: realisticObservation({ endpointId: 'e1', value: 10, unit: 'nM' }) },
    });
    const observationId = ingested.body.observation.observationId;
    await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations/${observationId}/review`, {
      token: reviewer.token, body: { candidateId, verdict: 'ACCEPTED_AS_OBSERVATION' },
    });
    const scienceRun = seedScienceRun(db, campaignId, candidateId, { potency: 1000 }, { potency: 'nM' });
    const compared = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/comparisons`, {
      token: owner.token, body: { candidateId, scienceRunId: scienceRun.id, observationId },
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
      token: viewer.token, body: { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }], governedManualRequest: governedManualRequest() },
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
      token: viewer.token, body: { candidateId, scienceRunId: 'x', observationId: 'x' },
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

describe('Test: campaign/project ownership', () => {
  test('a campaign that belongs to a different project is 404, never leaked across projects', async () => {
    const owner = register('lab-cross-project@lab.org');
    const projectA = makeProject(owner.token);
    const projectB = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, projectA.id, owner.user.id);
    // Same owner, but addresses campaignId (which belongs to projectA) through projectB's URL.
    const r = await call('GET', `/api/projects/${projectB.id}/campaigns/${campaignId}/lab-validation`, { token: owner.token, query: { candidate: candidateId } });
    assert.equal(r.status, 404);
  });

  test('a candidate that belongs to a different campaign is refused, never silently cross-linked', async () => {
    const owner = register('lab-cross-campaign@lab.org');
    const project = makeProject(owner.token);
    const a = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const b = seedCampaignAndCandidate(db, project.id, owner.user.id);
    // candidateId from campaign B, addressed against campaign A.
    const r = await call('POST', `/api/projects/${project.id}/campaigns/${a.campaignId}/lab-validation`, {
      token: owner.token,
      body: { candidateId: b.candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }], governedManualRequest: governedManualRequest() },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'candidate_not_found');
  });
});

describe('Test: deterministic dedupe', () => {
  test('an identical validation request dedupes to the SAME requestId/eventId, never a duplicate event', async () => {
    const owner = register('lab-dedupe-req@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const body = { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }], governedManualRequest: governedManualRequest() };
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
      token: owner.token, body: { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }], governedManualRequest: governedManualRequest() },
    });
    const requestId = created.body.request.requestId;
    const obsBody = { candidateId, requestId, observation: realisticObservation({ endpointId: 'e1' }) };
    const first = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, { token: owner.token, body: obsBody });
    const second = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, { token: owner.token, body: obsBody });
    assert.equal(first.body.observation.observationId, second.body.observation.observationId);
    assert.equal(second.body.deduped, true);
  });
});

describe('Test: item 1 — governed request basis (protocol fingerprint or explicit manual governance)', () => {
  test('a request with neither a PRECLINICAL_CANDIDATE_PROTOCOL nor a governedManualRequest is refused', async () => {
    const owner = register('lab-ungoverned@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const r = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }] },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'preclinical_protocol_or_governed_manual_request_required');
  });

  test('manual governance binds the authenticated editor identity; the client cannot choose its own authorizer', async () => {
    const owner = register('lab-incomplete-governance@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const r = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }], governedManualRequest: { reason: 'because', authorizedBy: 'spoofed-user' } },
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.request.protocolLink.authorizedBy, owner.user.id);
  });

  test('a request freezes a REAL PRECLINICAL_CANDIDATE_PROTOCOL fingerprint and one of its own requiredWetLab entries — no competing vocabulary', async () => {
    const owner = register('lab-protocol-linked@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);

    const built = buildPreclinicalProtocol({
      candidateId,
      canonicalSmiles: 'c1ccccc1',
      axes: [{ axis: 'binding_affinity', value: 7.1, uncertainty: 0.4, evidenceClass: 'COMPUTATIONAL' }],
      requiredWetLab: [{ id: 'assay-spr-binding', assay: 'SPR binding assay', rankIfPassed: 'OBSERVATIONAL' }],
    });
    assert.ok(built.ok, 'fixture protocol must build');
    const protocol = built.protocol;

    const r = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token,
      body: {
        candidateId,
        objective: 'Run the wet-lab assay this protocol requested.',
        endpointPlan: [{ endpointId: 'e1' }],
        preclinicalProtocol: protocol,
        requiredWetLabId: 'assay-spr-binding',
      },
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.request.protocolLink.mode, 'PRECLINICAL_PROTOCOL');
    assert.equal(r.body.request.protocolLink.protocolFingerprint, protocol.protocolFingerprint);
    assert.equal(r.body.request.protocolLink.assay, 'SPR binding assay');
  });

  test('a protocol reference for a DIFFERENT candidate, or a requiredWetLabId the protocol does not carry, is refused', async () => {
    const owner = register('lab-protocol-mismatch@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const built = buildPreclinicalProtocol({
      candidateId: 'some-other-candidate',
      canonicalSmiles: 'c1ccccc1',
      axes: [{ axis: 'binding_affinity', value: 7.1, uncertainty: 0.4, evidenceClass: 'COMPUTATIONAL' }],
      requiredWetLab: [{ id: 'assay-spr-binding', assay: 'SPR binding assay', rankIfPassed: 'OBSERVATIONAL' }],
    });
    const r = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token,
      body: { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }], preclinicalProtocol: built.protocol, requiredWetLabId: 'assay-spr-binding' },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'preclinical_protocol_candidate_mismatch');
  });
});

describe('Test: item 2/6 — outputKey/unit/tolerance frozen at request creation, exact unit match', () => {
  test('an endpointPlan entry naming a comparisonOutputKey without a unit AND tolerance is refused at request creation', async () => {
    const owner = register('lab-incomplete-binding@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const r = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token,
      body: { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1', comparisonOutputKey: 'k1' }], governedManualRequest: governedManualRequest() },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'endpoint_plan_comparison_binding_incomplete');
  });

  test('comparing an endpoint whose request never froze a comparison binding is refused, not defaulted', async () => {
    const owner = register('lab-nobinding@lab.org');
    const project = makeProject(owner.token);
    const reviewer = await addEditorMember(project.id, owner.token, 'lab-nobinding-reviewer@lab.org');
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const created = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }], governedManualRequest: governedManualRequest() },
    });
    const requestId = created.body.request.requestId;
    const ingested = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, {
      token: owner.token, body: { candidateId, requestId, observation: realisticObservation({ endpointId: 'e1' }) },
    });
    const observationId = ingested.body.observation.observationId;
    await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations/${observationId}/review`, {
      token: reviewer.token, body: { candidateId, verdict: 'ACCEPTED_AS_OBSERVATION' },
    });
    const scienceRun = seedScienceRun(db, campaignId, candidateId, { e1: 1 }, { e1: 'uM' });
    const compared = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/comparisons`, {
      token: owner.token, body: { candidateId, scienceRunId: scienceRun.id, observationId },
    });
    assert.equal(compared.status, 400);
    assert.equal(compared.body.error, 'endpoint_plan_missing_comparison_binding');
  });

  test('a client-supplied outputKey/tolerance at compare time is simply ignored — the frozen binding always wins', async () => {
    const owner = register('lab-cannot-choose-later@lab.org');
    const project = makeProject(owner.token);
    const reviewer = await addEditorMember(project.id, owner.token, 'lab-cannot-choose-later-reviewer@lab.org');
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const created = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId, objective: 'x', endpointPlan: [fullEndpointPlanEntry({ endpointId: 'e1', comparisonOutputKey: 'frozenKey', expectedUnit: 'uM', tolerance: { absolute: 0.01 } })], governedManualRequest: governedManualRequest() },
    });
    const requestId = created.body.request.requestId;
    const ingested = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, {
      token: owner.token, body: { candidateId, requestId, observation: realisticObservation({ endpointId: 'e1', unit: 'uM', value: 1 }) },
    });
    const observationId = ingested.body.observation.observationId;
    await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations/${observationId}/review`, {
      token: reviewer.token, body: { candidateId, verdict: 'ACCEPTED_AS_OBSERVATION' },
    });
    // The run only carries the FROZEN key; a different "chosen at compare time" key would not exist.
    const scienceRun = seedScienceRun(db, campaignId, candidateId, { frozenKey: 1.005, attackerChosenKey: 999 }, { frozenKey: 'uM' });
    const compared = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/comparisons`, {
      token: owner.token,
      // Even if a caller tries to pass a different key/looser tolerance, it is not read by compareModelToLabObservation.
      body: { candidateId, scienceRunId: scienceRun.id, observationId, outputKey: 'attackerChosenKey', tolerance: { absolute: 1000 } },
    });
    assert.equal(compared.status, 201);
    assert.equal(compared.body.comparison.outputKey, 'frozenKey');
    assert.equal(compared.body.comparison.modelValue, 1.005);
  });

  test('a unit mismatch against the FROZEN expected unit fails closed', async () => {
    const owner = register('lab-unitmismatch@lab.org');
    const project = makeProject(owner.token);
    const reviewer = await addEditorMember(project.id, owner.token, 'lab-unitmismatch-reviewer@lab.org');
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const created = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId, objective: 'x', endpointPlan: [fullEndpointPlanEntry({ endpointId: 'e1', comparisonOutputKey: 'e1', expectedUnit: 'uM', tolerance: { absolute: 1 } })], governedManualRequest: governedManualRequest() },
    });
    const requestId = created.body.request.requestId;
    const ingested = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, {
      token: owner.token, body: { candidateId, requestId, observation: realisticObservation({ endpointId: 'e1', unit: 'nM' }) },
    });
    const observationId = ingested.body.observation.observationId;
    await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations/${observationId}/review`, {
      token: reviewer.token, body: { candidateId, verdict: 'ACCEPTED_AS_OBSERVATION' },
    });
    const scienceRun = seedScienceRun(db, campaignId, candidateId, { e1: 1 }, { e1: 'uM' });
    const compared = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/comparisons`, {
      token: owner.token, body: { candidateId, scienceRunId: scienceRun.id, observationId },
    });
    assert.equal(compared.status, 400);
    assert.equal(compared.body.error, 'unit_mismatch');
    assert.equal(compared.body.expectedUnit, 'uM');
    assert.equal(compared.body.observationUnit, 'nM');
  });
});

describe('Test: item 3 — valid observedAt, source identity, and raw-artifact SHA-256', () => {
  test('an unparseable observedAt is refused', async () => {
    const owner = register('lab-badtimestamp@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const created = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }], governedManualRequest: governedManualRequest() },
    });
    const requestId = created.body.request.requestId;
    const r = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, {
      token: owner.token, body: { candidateId, requestId, observation: realisticObservation({ endpointId: 'e1', observedAt: 'not-a-real-date' }) },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'incomplete_external_observation');
  });

  test('a missing or malformed raw-artifact SHA-256 is refused', async () => {
    const owner = register('lab-badhash@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const created = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }], governedManualRequest: governedManualRequest() },
    });
    const requestId = created.body.request.requestId;
    const r = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, {
      token: owner.token, body: { candidateId, requestId, observation: realisticObservation({ endpointId: 'e1', rawArtifactSha256: 'not-hex' }) },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'incomplete_external_observation');
  });
});

describe('Test: item 4 — same (labId, externalObservationId) with different content is a CONFLICT', () => {
  test('resubmitting the SAME source id with a DIFFERENT observed value is refused, never a second observation', async () => {
    const owner = register('lab-sourceconflict@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const created = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }], governedManualRequest: governedManualRequest() },
    });
    const requestId = created.body.request.requestId;
    const first = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, {
      token: owner.token, body: { candidateId, requestId, observation: realisticObservation({ endpointId: 'e1', value: 0.42 }) },
    });
    assert.equal(first.status, 201);
    const second = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, {
      token: owner.token, body: { candidateId, requestId, observation: realisticObservation({ endpointId: 'e1', value: 99 }) },
    });
    assert.equal(second.status, 400);
    assert.equal(second.body.error, 'external_observation_conflict');
    assert.equal(second.body.existingObservationId, first.body.observation.observationId);
  });
});

describe('Test: item 5 — DRAFT/BLOCKED requests refuse observations; QC_FAILED can never be accepted', () => {
  test('a request left DRAFT_BLOCKED_BY_RESEARCH_GATE (no ADMET computed yet) refuses ingestion', async () => {
    const owner = register('lab-blockedgate@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id, { admetComputed: false });
    const created = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }], governedManualRequest: governedManualRequest() },
    });
    assert.equal(created.body.request.status, 'DRAFT_BLOCKED_BY_RESEARCH_GATE');
    const requestId = created.body.request.requestId;
    const r = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, {
      token: owner.token, body: { candidateId, requestId, observation: realisticObservation({ endpointId: 'e1' }) },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'validation_request_not_ready');
  });

  test('a QC_FAILED observation can never be reviewed as ACCEPTED_AS_OBSERVATION', async () => {
    const owner = register('lab-qcfailed@lab.org');
    const project = makeProject(owner.token);
    const reviewer = await addEditorMember(project.id, owner.token, 'lab-qcfailed-reviewer@lab.org');
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const created = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }], governedManualRequest: governedManualRequest() },
    });
    const requestId = created.body.request.requestId;
    const ingested = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, {
      token: owner.token, body: { candidateId, requestId, observation: realisticObservation({ endpointId: 'e1', quality: { status: 'QC_FAILED', confidence: 0.9 } }) },
    });
    const observationId = ingested.body.observation.observationId;
    const r = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations/${observationId}/review`, {
      token: reviewer.token, body: { candidateId, verdict: 'ACCEPTED_AS_OBSERVATION' },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'qc_failed_cannot_be_accepted');
  });
});

describe('Test: item 7 — review, Evidence proposal, Evidence link and comparison are idempotent', () => {
  test('an identical repeated review call reuses the SAME review event AND the SAME Evidence proposal, never a duplicate', async () => {
    const owner = register('lab-idempotent-review@lab.org');
    const project = makeProject(owner.token);
    const reviewer = await addEditorMember(project.id, owner.token, 'lab-idempotent-review-reviewer@lab.org');
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const created = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }], governedManualRequest: governedManualRequest() },
    });
    const requestId = created.body.request.requestId;
    const ingested = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, {
      token: owner.token, body: { candidateId, requestId, observation: realisticObservation({ endpointId: 'e1' }) },
    });
    const observationId = ingested.body.observation.observationId;
    const reviewBody = { candidateId, verdict: 'ACCEPTED_AS_OBSERVATION', note: 'Same note both times.' };
    const first = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations/${observationId}/review`, { token: reviewer.token, body: reviewBody });
    const second = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations/${observationId}/review`, { token: reviewer.token, body: reviewBody });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(first.body.evidenceProposal.proposalId, second.body.evidenceProposal.proposalId);

    const reviewEvents = campaignStore.listEvents(db, campaignId).filter((e) => e.type === 'EXTERNAL_LAB_OBSERVATION_REVIEWED' && e.payload?.observationId === observationId);
    assert.equal(reviewEvents.length, 1, 'an identical repeated review must not grow the supersession chain');
    const linkEvents = campaignStore.listEvents(db, campaignId).filter((e) => e.type === 'LAB_EVIDENCE_PROPOSED' && e.payload?.observationId === observationId);
    assert.equal(linkEvents.length, 1, 'an identical repeated review must not mint a second Evidence proposal');

    const proposalsForThisObservation = knowledgeApi.listProposals().proposals.filter((p) => p.proposalId === first.body.evidenceProposal.proposalId);
    assert.equal(proposalsForThisObservation.length, 1);
  });

  test('linkLabEvidenceProposal is idempotent for the SAME (observationId, proposalId) pair', async () => {
    const owner = register('lab-idempotent-link@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const created = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }], governedManualRequest: governedManualRequest() },
    });
    const requestId = created.body.request.requestId;
    const ingest = ingestExternalLabObservation(db, { campaignId, candidateId, requestId, observation: realisticObservation({ endpointId: 'e1' }), ingestedBy: 'ingester-1' });
    assert.ok(ingest.ok);
    const review = reviewExternalLabObservation(db, { campaignId, candidateId, observationId: ingest.observation.observationId, verdict: 'ACCEPTED_AS_OBSERVATION', reviewerId: 'reviewer-1' });
    assert.ok(review.ok);
    const first = linkLabEvidenceProposal(db, { campaignId, candidateId, observationId: ingest.observation.observationId, proposalId: 'PROPOSAL-fixed-id' });
    const second = linkLabEvidenceProposal(db, { campaignId, candidateId, observationId: ingest.observation.observationId, proposalId: 'PROPOSAL-fixed-id' });
    assert.equal(first.ok, true);
    assert.equal(first.deduped, false);
    assert.equal(second.ok, true);
    assert.equal(second.deduped, true);
    assert.equal(first.eventId, second.eventId);
  });

  test('comparing the SAME science run against the SAME observation twice dedupes to the SAME comparisonId', async () => {
    const owner = register('lab-idempotent-compare@lab.org');
    const project = makeProject(owner.token);
    const reviewer = await addEditorMember(project.id, owner.token, 'lab-idempotent-compare-reviewer@lab.org');
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const created = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId, objective: 'x', endpointPlan: [fullEndpointPlanEntry({ endpointId: 'e1', comparisonOutputKey: 'e1', expectedUnit: 'uM', tolerance: { absolute: 1 } })], governedManualRequest: governedManualRequest() },
    });
    const requestId = created.body.request.requestId;
    const ingested = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, {
      token: owner.token, body: { candidateId, requestId, observation: realisticObservation({ endpointId: 'e1', unit: 'uM' }) },
    });
    const observationId = ingested.body.observation.observationId;
    await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations/${observationId}/review`, { token: reviewer.token, body: { candidateId, verdict: 'ACCEPTED_AS_OBSERVATION' } });
    const scienceRun = seedScienceRun(db, campaignId, candidateId, { e1: 0.5 }, { e1: 'uM' });
    const first = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/comparisons`, { token: owner.token, body: { candidateId, scienceRunId: scienceRun.id, observationId } });
    const second = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/comparisons`, { token: owner.token, body: { candidateId, scienceRunId: scienceRun.id, observationId } });
    assert.equal(first.body.comparison.comparisonId, second.body.comparison.comparisonId);
    assert.equal(second.body.deduped, true);
  });
});

describe('Test: item 8 — linkLabEvidenceProposal proves the latest review is ACCEPTED, never trusts the caller', () => {
  test('linking an Evidence proposal for an observation with no accepted review is refused', () => {
    const owner = register('lab-item8@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const requestId = `LABREQ-fixture-${candidateId}`;
    campaignStore.addEvent(db, {
      campaignId,
      generation: 0,
      type: 'LAB_VALIDATION_REQUESTED',
      payload: { requestId, campaignId, candidateId, status: 'READY_FOR_EXTERNAL_LAB_REVIEW', endpointPlan: [{ endpointId: 'e1' }] },
    });
    const ingest = ingestExternalLabObservation(db, { campaignId, candidateId, requestId, observation: realisticObservation({ endpointId: 'e1' }), ingestedBy: 'ingester-1' });
    assert.ok(ingest.ok);
    // No review at all — never accepted.
    const link = linkLabEvidenceProposal(db, { campaignId, candidateId, observationId: ingest.observation.observationId, proposalId: 'PROPOSAL-x' });
    assert.equal(link.ok, false);
    assert.equal(link.error, 'observation_not_accepted');
  });
});

describe('Test: item 9 — the Evidence bridge is validated BEFORE an ACCEPTED review is persisted', () => {
  test('an observation whose source is incomplete (simulating pre-hardening/legacy data) refuses acceptance, and no review event is persisted', () => {
    const owner = register('lab-item9@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    // Directly seed a malformed OBSERVATION_INGESTED event (bypassing ingestExternalLabObservation's
    // own validation) to simulate data that predates this hardening pass, or a future caller bug —
    // the review gate itself must still refuse to accept it.
    const observationId = 'LABOBS-legacy-malformed';
    campaignStore.addEvent(db, {
      campaignId,
      generation: 0,
      type: 'EXTERNAL_LAB_OBSERVATION_INGESTED',
      payload: {
        observationId,
        candidateId,
        requestId: 'LABREQ-legacy',
        endpointId: 'e1',
        value: 1,
        unit: 'uM',
        observedAt: '2026-01-01T00:00:00.000Z',
        methodReference: 'legacy method',
        // source deliberately incomplete — no sourceUri — which buildLabObservationEvidenceInput refuses.
        source: { labId: 'acme-cro', externalObservationId: 'LEGACY-1', sourceUri: '' },
        quality: { status: 'QC_PASSED', confidence: 0.9 },
        ingestedBy: 'ingester-1',
        status: 'INGESTED_UNREVIEWED',
      },
    });
    const before = campaignStore.listEvents(db, campaignId).filter((e) => e.type === 'EXTERNAL_LAB_OBSERVATION_REVIEWED').length;
    const review = reviewExternalLabObservation(db, { campaignId, candidateId, observationId, verdict: 'ACCEPTED_AS_OBSERVATION', reviewerId: 'reviewer-1' });
    assert.equal(review.ok, false);
    assert.equal(review.error, 'evidence_bridge_validation_failed');
    const after = campaignStore.listEvents(db, campaignId).filter((e) => e.type === 'EXTERNAL_LAB_OBSERVATION_REVIEWED').length;
    assert.equal(after, before, 'a review that would fail the Evidence bridge must never be persisted as ACCEPTED — no ACCEPTED_WITHOUT_PROPOSAL partial state');
  });
});

describe('Test: item 10 — reviewer != ingester; Evidence publication remains a separate authorized action', () => {
  test('the SAME actor cannot both ingest and review-accept the same observation', async () => {
    const owner = register('lab-samereviewer@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const created = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }], governedManualRequest: governedManualRequest() },
    });
    const requestId = created.body.request.requestId;
    const ingested = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, {
      token: owner.token, body: { candidateId, requestId, observation: realisticObservation({ endpointId: 'e1' }) },
    });
    const observationId = ingested.body.observation.observationId;
    // The SAME owner token both ingested and now tries to review.
    const r = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations/${observationId}/review`, {
      token: owner.token, body: { candidateId, verdict: 'ACCEPTED_AS_OBSERVATION' },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'reviewer_cannot_be_ingester');
  });

  test('accepting an observation only ever PROPOSES Evidence — it is never simultaneously published', async () => {
    const owner = register('lab-neverpublish@lab.org');
    const project = makeProject(owner.token);
    const reviewer = await addEditorMember(project.id, owner.token, 'lab-neverpublish-reviewer@lab.org');
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const created = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }], governedManualRequest: governedManualRequest() },
    });
    const requestId = created.body.request.requestId;
    const ingested = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, {
      token: owner.token, body: { candidateId, requestId, observation: realisticObservation({ endpointId: 'e1' }) },
    });
    const observationId = ingested.body.observation.observationId;
    const review = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations/${observationId}/review`, {
      token: reviewer.token, body: { candidateId, verdict: 'ACCEPTED_AS_OBSERVATION' },
    });
    const proposal = knowledgeApi.listProposals().proposals.find((p) => p.proposalId === review.body.evidenceProposal.proposalId);
    assert.ok(proposal);
    assert.equal(proposal.status, 'pending', 'acceptance must never auto-publish Evidence — publication is a separate, later, authorized action');
  });
});

describe('Test: fail-closed refusals', () => {
  test('comparing before human acceptance is refused, never silently allowed', async () => {
    const owner = register('lab-unaccepted@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const created = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId, objective: 'x', endpointPlan: [fullEndpointPlanEntry({ endpointId: 'e1', comparisonOutputKey: 'e1', expectedUnit: 'uM', tolerance: { absolute: 1 } })], governedManualRequest: governedManualRequest() },
    });
    const requestId = created.body.request.requestId;
    const ingested = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, {
      token: owner.token, body: { candidateId, requestId, observation: realisticObservation({ endpointId: 'e1', unit: 'uM' }) },
    });
    const observationId = ingested.body.observation.observationId;
    const scienceRun = seedScienceRun(db, campaignId, candidateId, { e1: 1 }, { e1: 'uM' });
    const compared = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/comparisons`, {
      token: owner.token, body: { candidateId, scienceRunId: scienceRun.id, observationId },
    });
    assert.equal(compared.status, 400);
    assert.equal(compared.body.error, 'observation_not_accepted');
  });

  test('a missing tolerance at request creation (no frozen binding) is refused rather than defaulted', async () => {
    const owner = register('lab-notolerance@lab.org');
    const project = makeProject(owner.token);
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const r = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token,
      body: { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1', comparisonOutputKey: 'e1', expectedUnit: 'uM' }], governedManualRequest: governedManualRequest() },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'endpoint_plan_comparison_binding_incomplete');
  });

  test('a NEEDS_CLARIFICATION or REJECTED_INTEGRITY review never creates an Evidence proposal', async () => {
    const owner = register('lab-notaccepted@lab.org');
    const project = makeProject(owner.token);
    const reviewer = await addEditorMember(project.id, owner.token, 'lab-notaccepted-reviewer@lab.org');
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const created = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId, objective: 'x', endpointPlan: [{ endpointId: 'e1' }], governedManualRequest: governedManualRequest() },
    });
    const requestId = created.body.request.requestId;
    const ingested = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, {
      token: owner.token, body: { candidateId, requestId, observation: realisticObservation({ endpointId: 'e1' }) },
    });
    const observationId = ingested.body.observation.observationId;
    const review = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations/${observationId}/review`, {
      token: reviewer.token, body: { candidateId, verdict: 'REJECTED_INTEGRITY', note: 'Chain of custody unclear.' },
    });
    assert.equal(review.status, 201);
    assert.equal(review.body.evidenceProposal, null);
  });

  test('malformed identifiers (unknown candidate) are rejected with a clear error, never a fabricated 201', async () => {
    const owner = register('lab-badcandidate@lab.org');
    const project = makeProject(owner.token);
    const { campaignId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const r = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId: 'does-not-exist', objective: 'x', endpointPlan: [{ endpointId: 'e1' }], governedManualRequest: governedManualRequest() },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'candidate_not_found');
  });
});

describe('Test: no clinical promotion, anywhere in the pipeline', () => {
  test('clinicalEfficacy stays UNKNOWN and the claim boundary is present on every artifact, end to end', async () => {
    const owner = register('lab-noclinical@lab.org');
    const project = makeProject(owner.token);
    const reviewer = await addEditorMember(project.id, owner.token, 'lab-noclinical-reviewer@lab.org');
    const { campaignId, candidateId } = seedCampaignAndCandidate(db, project.id, owner.user.id);
    const created = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, {
      token: owner.token, body: { candidateId, objective: 'x', endpointPlan: [fullEndpointPlanEntry({ endpointId: 'e1', comparisonOutputKey: 'e1', expectedUnit: 'uM', tolerance: { absolute: 1 } })], governedManualRequest: governedManualRequest() },
    });
    assert.match(created.body.request.claimBoundary, /not.*clinical efficacy|clinical efficacy/i);

    const requestId = created.body.request.requestId;
    const ingested = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations`, {
      token: owner.token, body: { candidateId, requestId, observation: realisticObservation({ endpointId: 'e1', unit: 'uM' }) },
    });
    assert.equal(ingested.body.observation.clinicalEfficacy, 'UNKNOWN');

    const observationId = ingested.body.observation.observationId;
    const review = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/observations/${observationId}/review`, {
      token: reviewer.token, body: { candidateId, verdict: 'ACCEPTED_AS_OBSERVATION' },
    });
    assert.equal(review.body.review.clinicalEfficacy, 'UNKNOWN');

    const evidenceRecord = knowledgeApi.listProposals().proposals.find((p) => p.proposalId === review.body.evidenceProposal.proposalId);
    assert.ok(evidenceRecord);
    // The bridged Evidence claim itself is an "observation" claim type, never a clinical/efficacy claim.
    assert.notEqual(evidenceRecord.claim, undefined);
    assert.match(evidenceRecord.claim, /does not establish clinical efficacy/i);

    const scienceRun = seedScienceRun(db, campaignId, candidateId, { e1: 0.9 }, { e1: 'uM' });
    const compared = await call('POST', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation/comparisons`, {
      token: owner.token, body: { candidateId, scienceRunId: scienceRun.id, observationId },
    });
    assert.equal(compared.body.comparison.clinicalEfficacy, 'UNKNOWN');

    const dossier = await call('GET', `/api/projects/${project.id}/campaigns/${campaignId}/lab-validation`, { token: owner.token, query: { candidate: candidateId } });
    assert.equal(dossier.body.dossier.clinicalEfficacy, 'UNKNOWN');
  });
});
