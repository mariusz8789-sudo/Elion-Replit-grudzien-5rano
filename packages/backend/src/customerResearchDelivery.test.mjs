/* Proprietary / All Rights Reserved - Genesis OS */
import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';
import { CUSTOMER_DELIVERY_STATUS } from './customerResearchDelivery.mjs';

const RDKIT = rdkitDetect();
const needsRdkit = RDKIT.available ? {} : { skip: `RDKit runtime unavailable: ${RDKIT.reason}` };
const tempDirs = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const SOURCE = Object.freeze({
  sourceId: 'europe-pmc:MED:customer-1',
  title: 'Aspirin descriptor context',
  authors: ['Researcher A'],
  doi: '10.1000/customer-1',
  pmid: 'customer-1',
  pmcid: null,
  canonicalUrl: 'https://doi.org/10.1000/customer-1',
  publicationDate: '2025-01-02',
  sourceProvider: 'EUROPE_PMC',
  licence: 'CC-BY-4.0',
  licenceStatus: 'CONDITIONAL',
  retrievalStatus: 'METADATA_ONLY',
  fullTextAvailability: 'NONE',
  retrievalTimestamp: '2026-10-02T00:00:00.000Z',
  metadataHash: 'a'.repeat(64),
  provenance: { provider: 'EUROPE_PMC', providerRecordId: 'customer-1' },
});
const CONTRADICTION = Object.freeze({
  ...SOURCE,
  sourceId: 'europe-pmc:MED:customer-2',
  title: 'Contradictory descriptor context',
  doi: '10.1000/customer-2',
  pmid: 'customer-2',
  canonicalUrl: 'https://doi.org/10.1000/customer-2',
  metadataHash: 'b'.repeat(64),
  provenance: { provider: 'EUROPE_PMC', providerRecordId: 'customer-2' },
});

function literatureResult(intent, query, source) {
  return {
    intent,
    query,
    status: 'METADATA_ONLY',
    sources: [source],
    links: [{
      claimId: 'fixture',
      sourceId: source.sourceId,
      relationship: 'UNKNOWN',
      status: 'PROPOSED',
      epistemicStatus: 'NOT_EVIDENCE',
    }],
    support: [],
    contradictions: [],
    missingEvidence: ['Full-text human review required.'],
    accessBlockers: [],
  };
}

const literaturePort = {
  findForClaim: async (request) => literatureResult('CLAIM_CONTEXT', request.query, SOURCE),
  findContradictionsForClaim: async () => literatureResult('CONTRADICTION_SEARCH', 'aspirin negative result', CONTRADICTION),
};

const PLAN = {
  subProblems: [{ question: 'Does aspirin satisfy the frozen descriptor criteria?', whyItMatters: 'Bounded reference case.' }],
  hypotheses: [{
    claim: 'Aspirin weighs below 200 Da and passes Lipinski.',
    claimType: 'PREDICTION',
    assumptions: [],
    supportingEvidenceRefs: [SOURCE.sourceId],
    contradictingEvidenceRefs: [CONTRADICTION.sourceId],
    missingEvidence: ['Reviewed full text'],
    uncertainty: { level: 'MEDIUM', statement: 'Metadata is contextual only.' },
    falsificationProposal: 'RDKit reports molWt at or above 200 or Lipinski failure.',
    experimentProposal: {
      kind: 'COMPUTATIONAL',
      engineId: 'rdkit',
      description: 'Pinned RDKit descriptor calculation.',
      parameters: {
        smiles: 'CC(=O)Oc1ccccc1C(=O)O',
        predictions: [
          { observable: 'molWt', operator: '<', value: 200, critical: true },
          { observable: 'lipinskiPass', operator: '==', value: true, critical: true },
        ],
      },
      parameterChanges: [],
    },
  }],
  nextActions: ['Review the computational report.'],
};

const reasoningProvider = {
  providerId: 'PRIVATE_LOCAL',
  model: 'customer-fixture-model',
  configured: true,
  reason: null,
  describe: () => ({
    providerId: 'PRIVATE_LOCAL',
    model: 'customer-fixture-model',
    configured: true,
    status: 'CONFIGURED',
    reason: null,
  }),
  async complete() {
    return { model: 'customer-fixture-model', text: JSON.stringify(PLAN) };
  },
};

function admittedItem(required) {
  return {
    itemId: required.itemId,
    category: required.category,
    identity: required.identity,
    intendedUses: ['CUSTOMER_REPORT_EXPORT'],
    status: 'APPROVED',
    licenceEvidence: {
      sourceUrl: `https://licences.genesis.test/${encodeURIComponent(required.itemId)}`,
      termsSha256: 'c'.repeat(64),
    },
    obligations: [],
    decision: {
      owner: 'commercial-rights-reviewer',
      decidedAt: '2026-10-02T00:00:00.000Z',
    },
    evidenceRefs: [required.evidenceRef],
  };
}

describe('customer and monetization E2E over canonical ResearchRun', () => {
  test('question -> literature -> plan -> real RDKit -> Evidence/Replay -> rights gate -> review-ready export survives restart', needsRdkit, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-customer-delivery-'));
    tempDirs.push(dir);
    const dbPath = path.join(dir, 'genesis.db');
    let db = openDatabase(dbPath);
    const call = (method, pathname, { token, body, commercialAdmissionProvider } = {}) => handleApi(db, {
      method,
      pathname,
      token,
      body,
      query: {},
      literaturePort,
      reasoningProvider,
      commercialAdmissionProvider,
    });

    const owner = call('POST', '/api/auth/register', {
      body: { email: 'customer-e2e@genesis.test', password: 'password123' },
    }).body;
    const project = call('POST', '/api/projects', {
      token: owner.token,
      body: { name: 'Customer E2E' },
    }).body.project;
    const base = `/api/projects/${project.id}`;

    const started = await call('POST', `${base}/research-runs`, {
      token: owner.token,
      body: { question: 'Is aspirin drug-like under the frozen descriptor protocol?' },
    });
    const runId = started.body.researchRun.researchRunId;
    assert.equal((await call('POST', `${base}/research-runs/${runId}/literature`, {
      token: owner.token,
      body: { limit: 10 },
    })).status, 201);
    assert.equal((await call('POST', `${base}/research-runs/${runId}/proposals`, {
      token: owner.token,
    })).status, 201);
    assert.equal((await call('POST', `${base}/research-runs/${runId}/experiments`, {
      token: owner.token,
    })).status, 201);

    const endpoint = `${base}/research-runs/${runId}/customer-delivery`;
    const preview = await call('POST', endpoint, {
      token: owner.token,
      body: {
        releaseId: 'release-customer-e2e',
        items: [{ itemId: 'client-forged-approval', status: 'APPROVED' }],
      },
    });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.delivery.status, CUSTOMER_DELIVERY_STATUS.COMMERCIAL_BLOCKED);
    assert.equal(preview.body.delivery.exportAllowed, false);
    assert.ok(preview.body.delivery.requiredCommercialItems.some((item) => item.category === 'SCIENTIFIC_SOURCE'));
    assert.ok(preview.body.delivery.requiredCommercialItems.some((item) => item.category === 'SCIENTIFIC_ENGINE'));
    assert.ok(preview.body.delivery.requiredCommercialItems.some((item) => item.category === 'REASONING_MODEL'));
    assert.equal(preview.body.delivery.commercialDecisionSource, 'BLOCKED_EXTERNAL_LICENSE_REVIEW');
    assert.equal(preview.body.delivery.commercialAdmission.decisions.length, 0, 'client-supplied decisions must be ignored');

    const commercialAdmissionProvider = {
      resolve: ({ requiredItems }) => ({ ok: true, items: requiredItems.map(admittedItem) }),
    };
    const admitted = await call('POST', endpoint, {
      token: owner.token,
      body: { releaseId: 'release-customer-e2e', declaredUse: 'CUSTOMER_REPORT_EXPORT' },
      commercialAdmissionProvider,
    });
    assert.equal(admitted.status, 200);
    const delivery = admitted.body.delivery;
    assert.equal(delivery.status, CUSTOMER_DELIVERY_STATUS.READY);
    assert.equal(delivery.exportAllowed, true);
    assert.equal(delivery.delivered, false);
    assert.equal(delivery.customerAccepted, false);
    assert.equal(delivery.paymentStatus, 'NOT_INTEGRATED');
    assert.equal(delivery.commercialAdmission.exportAllowed, true);
    assert.equal(delivery.commercialDecisionSource, 'SERVER_SIDE_COMMERCIAL_POLICY_PROVIDER');
    assert.equal(delivery.missingItemIds.length, 0);
    assert.equal(delivery.unexpectedItemIds.length, 0);
    assert.equal(delivery.itemIdentityMismatches.length, 0);
    assert.equal(delivery.scientificBlockers.length, 0);
    assert.equal(delivery.report.researchRunId, runId);
    assert.equal(delivery.report.literature.sources.length, 2);
    assert.equal(delivery.report.experiments.length, 1);
    assert.equal(delivery.report.experiments[0].status, 'EXECUTED');
    assert.equal(delivery.report.experiments[0].replay.verdict, 'MATCH');
    assert.equal(delivery.report.experiments[0].evidence.status, 'PROPOSED');
    assert.equal(delivery.report.experiments[0].evidence.publication, 'REQUIRES_HUMAN_APPROVAL');
    assert.ok(delivery.report.experiments[0].decisionTrace);
    assert.match(delivery.approvalBoundary, /Delivery, acceptance, payment/);

    db.close();
    db = openDatabase(dbPath);
    const recovered = await call('POST', endpoint, {
      token: owner.token,
      body: { releaseId: 'release-customer-e2e', declaredUse: 'CUSTOMER_REPORT_EXPORT' },
      commercialAdmissionProvider,
    });
    assert.equal(recovered.body.delivery.status, CUSTOMER_DELIVERY_STATUS.READY);
    assert.equal(recovered.body.delivery.report.reportFingerprint, delivery.report.reportFingerprint);
    assert.equal(recovered.body.delivery.deliveryFingerprint, delivery.deliveryFingerprint);
    db.close();
  });

  test('missing rights, UNKNOWN rights, incomplete science and cross-tenant reads all fail closed', needsRdkit, async () => {
    const db = openDatabase(':memory:');
    const call = (method, pathname, { token, body, commercialAdmissionProvider } = {}) => handleApi(db, {
      method,
      pathname,
      token,
      body,
      query: {},
      literaturePort,
      reasoningProvider,
      commercialAdmissionProvider,
    });
    const owner = call('POST', '/api/auth/register', {
      body: { email: 'customer-boundaries@genesis.test', password: 'password123' },
    }).body;
    const project = call('POST', '/api/projects', {
      token: owner.token,
      body: { name: 'Customer boundaries' },
    }).body.project;
    const base = `/api/projects/${project.id}`;
    const started = await call('POST', `${base}/research-runs`, {
      token: owner.token,
      body: { question: 'Incomplete customer run?' },
    });
    const runId = started.body.researchRun.researchRunId;
    const endpoint = `${base}/research-runs/${runId}/customer-delivery`;

    const incomplete = await call('POST', endpoint, {
      token: owner.token,
      body: { releaseId: 'release-incomplete', items: [] },
    });
    assert.equal(incomplete.body.delivery.status, CUSTOMER_DELIVERY_STATUS.SCIENTIFIC_BLOCKED);
    assert.ok(incomplete.body.delivery.scientificBlockers.includes('LITERATURE_SNAPSHOT_MISSING'));
    assert.ok(incomplete.body.delivery.scientificBlockers.includes('COMPLETE_EXPERIMENT_MISSING'));

    await call('POST', `${base}/research-runs/${runId}/literature`, { token: owner.token, body: {} });
    await call('POST', `${base}/research-runs/${runId}/proposals`, { token: owner.token });
    await call('POST', `${base}/research-runs/${runId}/experiments`, { token: owner.token });
    const preview = await call('POST', endpoint, {
      token: owner.token,
      body: { releaseId: 'release-unknown', items: [] },
    });
    const items = preview.body.delivery.requiredCommercialItems.map(admittedItem);
    items[0] = { ...items[0], status: 'UNKNOWN' };
    const unknownProvider = { resolve: () => ({ ok: true, items }) };
    const unknown = await call('POST', endpoint, {
      token: owner.token,
      body: { releaseId: 'release-unknown' },
      commercialAdmissionProvider: unknownProvider,
    });
    assert.equal(unknown.body.delivery.status, CUSTOMER_DELIVERY_STATUS.COMMERCIAL_BLOCKED);
    assert.equal(unknown.body.delivery.exportAllowed, false);
    assert.ok(unknown.body.delivery.commercialAdmission.decisions.some((decision) => decision.errors.includes('RIGHTS_UNKNOWN')));

    const omitted = await call('POST', endpoint, {
      token: owner.token,
      body: { releaseId: 'release-omitted' },
      commercialAdmissionProvider: { resolve: () => ({ ok: true, items: items.slice(1) }) },
    });
    assert.equal(omitted.body.delivery.status, CUSTOMER_DELIVERY_STATUS.COMMERCIAL_BLOCKED);
    assert.ok(omitted.body.delivery.missingItemIds.length > 0);

    const tamperedItems = preview.body.delivery.requiredCommercialItems.map(admittedItem);
    tamperedItems[0] = {
      ...tamperedItems[0],
      identity: { version: 'different-artifact-with-same-item-id' },
    };
    const tampered = await call('POST', endpoint, {
      token: owner.token,
      body: { releaseId: 'release-tampered' },
      commercialAdmissionProvider: { resolve: () => ({ ok: true, items: tamperedItems }) },
    });
    assert.equal(tampered.body.delivery.status, CUSTOMER_DELIVERY_STATUS.COMMERCIAL_BLOCKED);
    assert.ok(tampered.body.delivery.itemIdentityMismatches.length > 0);

    const stranger = call('POST', '/api/auth/register', {
      body: { email: 'customer-stranger@genesis.test', password: 'password123' },
    }).body;
    const otherProject = call('POST', '/api/projects', {
      token: stranger.token,
      body: { name: 'Other tenant' },
    }).body.project;
    const leaked = await call(
      'POST',
      `/api/projects/${otherProject.id}/research-runs/${runId}/customer-delivery`,
      { token: stranger.token, body: { releaseId: 'leak-attempt' }, commercialAdmissionProvider: unknownProvider },
    );
    assert.equal(leaked.status, 404);
    db.close();
  });
});
