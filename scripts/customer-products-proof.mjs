/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * Executable customer-product proof:
 * onboarding -> one canonical ResearchRun -> literature -> two real RDKit cases
 * -> Evidence/Replay -> server-side commercial admission -> four deterministic
 * JSON exports -> SQLite restart -> identical Research Sprint artifact.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { handleApi } from '../packages/backend/src/api.mjs';
import { openDatabase } from '../packages/backend/src/store.mjs';
import { detect as rdkitDetect } from '../packages/backend/src/compute/rdkitAdapter.mjs';
import {
  CUSTOMER_DELIVERY_STATUS,
  CUSTOMER_PRODUCT,
  CUSTOMER_PRODUCT_STATUS,
} from '../packages/backend/src/customerResearchDelivery.mjs';

const runtime = rdkitDetect();
assert.equal(runtime.available, true, `RDKit runtime unavailable: ${runtime.reason ?? 'unknown'}`);

const source = Object.freeze({
  sourceId: 'europe-pmc:MED:product-proof-1',
  title: 'Descriptor context for product proof',
  authors: ['Genesis proof fixture'],
  doi: '10.1000/product-proof-1',
  pmid: 'product-proof-1',
  pmcid: null,
  canonicalUrl: 'https://doi.org/10.1000/product-proof-1',
  publicationDate: '2025-01-02',
  sourceProvider: 'EUROPE_PMC',
  licence: 'CC-BY-4.0',
  licenceStatus: 'CONDITIONAL',
  retrievalStatus: 'METADATA_ONLY',
  fullTextAvailability: 'NONE',
  retrievalTimestamp: '2026-10-02T00:00:00.000Z',
  metadataHash: 'a'.repeat(64),
  provenance: { provider: 'EUROPE_PMC', providerRecordId: 'product-proof-1' },
});
const contradiction = Object.freeze({
  ...source,
  sourceId: 'europe-pmc:MED:product-proof-2',
  title: 'Contradiction-search context for product proof',
  doi: '10.1000/product-proof-2',
  pmid: 'product-proof-2',
  canonicalUrl: 'https://doi.org/10.1000/product-proof-2',
  metadataHash: 'b'.repeat(64),
  provenance: { provider: 'EUROPE_PMC', providerRecordId: 'product-proof-2' },
});

function literatureResult(intent, query, item) {
  return {
    intent,
    query,
    status: 'METADATA_ONLY',
    sources: [item],
    links: [{
      claimId: 'product-proof',
      sourceId: item.sourceId,
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
  findForClaim: async (request) => literatureResult('CLAIM_CONTEXT', request.query, source),
  findContradictionsForClaim: async () => literatureResult('CONTRADICTION_SEARCH', 'descriptor negative result', contradiction),
};

const baseHypothesis = {
  claim: 'Aspirin weighs below 200 Da and passes Lipinski.',
  claimType: 'PREDICTION',
  assumptions: [],
  supportingEvidenceRefs: [source.sourceId],
  contradictingEvidenceRefs: [contradiction.sourceId],
  missingEvidence: ['Reviewed full text'],
  uncertainty: { level: 'MEDIUM', statement: 'Metadata is contextual only.' },
  falsificationProposal: 'RDKit reports molWt at or above 200 or Lipinski failure.',
  experimentProposal: {
    kind: 'COMPUTATIONAL',
    engineId: 'rdkit',
    description: 'Pinned aspirin descriptor case.',
    parameters: {
      smiles: 'CC(=O)Oc1ccccc1C(=O)O',
      predictions: [
        { observable: 'molWt', operator: '<', value: 200, critical: true },
        { observable: 'lipinskiPass', operator: '==', value: true, critical: true },
      ],
    },
    parameterChanges: [],
  },
};

const plan = {
  subProblems: [{ question: 'Do two reference molecules satisfy frozen descriptor criteria?', whyItMatters: 'Bounded customer-product proof.' }],
  hypotheses: [
    baseHypothesis,
    {
      ...baseHypothesis,
      claim: 'Ibuprofen weighs below 250 Da and passes Lipinski.',
      falsificationProposal: 'RDKit reports molWt at or above 250 or Lipinski failure.',
      experimentProposal: {
        ...baseHypothesis.experimentProposal,
        description: 'Pinned ibuprofen descriptor case.',
        parameters: {
          smiles: 'CC(C)CC1=CC=C(C=C1)C(C)C(=O)O',
          predictions: [
            { observable: 'molWt', operator: '<', value: 250, critical: true },
            { observable: 'lipinskiPass', operator: '==', value: true, critical: true },
          ],
        },
      },
    },
  ],
  nextActions: ['Review the bounded computational product export.'],
};

const reasoningProvider = {
  providerId: 'PRIVATE_LOCAL',
  model: 'customer-product-proof-model',
  configured: true,
  reason: null,
  describe: () => ({
    providerId: 'PRIVATE_LOCAL',
    model: 'customer-product-proof-model',
    configured: true,
    status: 'CONFIGURED',
    reason: null,
  }),
  async complete() {
    return { model: 'customer-product-proof-model', text: JSON.stringify(plan) };
  },
};

function admittedItem(required, declaredUse) {
  return {
    itemId: required.itemId,
    category: required.category,
    identity: required.identity,
    intendedUses: [declaredUse],
    status: 'APPROVED',
    licenceEvidence: {
      sourceUrl: `https://licences.genesis.test/${encodeURIComponent(required.itemId)}`,
      termsSha256: 'c'.repeat(64),
    },
    obligations: [],
    decision: {
      owner: 'customer-product-proof-reviewer',
      decidedAt: '2026-10-02T00:00:00.000Z',
    },
    evidenceRefs: [required.evidenceRef],
  };
}

const commercialAdmissionProvider = {
  resolve: ({ requiredItems, declaredUse }) => ({
    ok: true,
    items: requiredItems.map((required) => admittedItem(required, declaredUse)),
  }),
};

const outputDir = path.resolve(process.env.GENESIS_CUSTOMER_PRODUCTS_PROOF_DIR ?? 'artifacts/customer-products-proof');
mkdirSync(outputDir, { recursive: true });
const tempDir = mkdtempSync(path.join(tmpdir(), 'genesis-customer-products-proof-'));
const dbPath = path.join(tempDir, 'genesis.db');

let db = openDatabase(dbPath);
const call = (method, pathname, { token, body } = {}) => handleApi(db, {
  method,
  pathname,
  token,
  body,
  query: {},
  literaturePort,
  reasoningProvider,
  commercialAdmissionProvider,
});

try {
  const owner = call('POST', '/api/auth/register', {
    body: { email: 'customer-products-proof@genesis.test', password: 'password123' },
  }).body;
  const project = call('POST', '/api/projects', {
    token: owner.token,
    body: { name: 'Customer products proof' },
  }).body.project;
  const base = `/api/projects/${project.id}`;
  const started = await call('POST', `${base}/research-runs`, {
    token: owner.token,
    body: { question: 'Compare two frozen drug-like descriptor cases.' },
  });
  assert.equal(started.status, 201);
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
  const onboarding = {
    customerReference: 'proof-customer-ref',
    objective: 'Receive reviewable Genesis product artifacts.',
    acceptanceCriteria: ['Verified chain', 'Replay MATCH', 'Explicit truth boundaries'],
    dataClassification: 'CONFIDENTIAL',
  };

  const earlyBenchmark = await call('POST', endpoint, {
    token: owner.token,
    body: {
      releaseId: 'benchmark-too-early',
      productId: CUSTOMER_PRODUCT.BENCHMARK,
      onboarding,
      includeExportArtifact: true,
    },
  });
  assert.equal(earlyBenchmark.body.delivery.status, CUSTOMER_DELIVERY_STATUS.PRODUCT_BLOCKED);
  assert.equal(earlyBenchmark.body.exportArtifact.ok, false);

  assert.equal((await call('POST', `${base}/research-runs/${runId}/experiments`, {
    token: owner.token,
  })).status, 201);

  const products = [];
  for (const productId of Object.values(CUSTOMER_PRODUCT)) {
    const response = await call('POST', endpoint, {
      token: owner.token,
      body: {
        releaseId: `release-${productId.toLowerCase()}`,
        productId,
        declaredUse: 'CLIENT_FORGED_USE',
        onboarding,
        includeExportArtifact: true,
      },
    });
    assert.equal(response.status, 200);
    const { delivery, exportArtifact } = response.body;
    assert.equal(delivery.status, CUSTOMER_DELIVERY_STATUS.READY);
    assert.equal(delivery.productDelivery.status, CUSTOMER_PRODUCT_STATUS.READY);
    assert.equal(delivery.commercialAdmission.exportAllowed, true);
    assert.notEqual(delivery.commercialAdmission.declaredUse, 'CLIENT_FORGED_USE');
    assert.equal(exportArtifact.ok, true);
    assert.equal(createHash('sha256').update(exportArtifact.artifact.content).digest('hex'), exportArtifact.artifact.sha256);

    const target = path.join(outputDir, exportArtifact.artifact.fileName);
    writeFileSync(target, exportArtifact.artifact.content, 'utf8');
    const persistedBytes = readFileSync(target);
    assert.equal(createHash('sha256').update(persistedBytes).digest('hex'), exportArtifact.artifact.sha256);
    products.push({
      productId,
      productKind: delivery.productDelivery.deliverable.kind,
      deliveryFingerprint: delivery.deliveryFingerprint,
      artifactFileName: exportArtifact.artifact.fileName,
      artifactSha256: exportArtifact.artifact.sha256,
      byteLength: exportArtifact.artifact.byteLength,
      declaredUse: delivery.commercialAdmission.declaredUse,
      delivered: delivery.delivered,
      customerAccepted: delivery.customerAccepted,
      paymentStatus: delivery.paymentStatus,
      agreementStatus: delivery.agreementStatus,
      enterpriseStatus: delivery.enterpriseStatus,
    });
  }

  db.close();
  db = openDatabase(dbPath);
  const recovered = await call('POST', endpoint, {
    token: owner.token,
    body: {
      releaseId: 'release-genesis_research_sprint',
      productId: CUSTOMER_PRODUCT.RESEARCH_SPRINT,
      onboarding,
      includeExportArtifact: true,
    },
  });
  const sprint = products.find((item) => item.productId === CUSTOMER_PRODUCT.RESEARCH_SPRINT);
  assert.equal(recovered.body.exportArtifact.artifact.sha256, sprint.artifactSha256);
  assert.equal(recovered.body.delivery.deliveryFingerprint, sprint.deliveryFingerprint);

  const missingOnboarding = await call('POST', endpoint, {
    token: owner.token,
    body: {
      releaseId: 'missing-onboarding',
      productId: CUSTOMER_PRODUCT.VERIFY,
      includeExportArtifact: true,
    },
  });
  assert.equal(missingOnboarding.body.delivery.status, CUSTOMER_DELIVERY_STATUS.PRODUCT_BLOCKED);
  assert.equal(missingOnboarding.body.exportArtifact.ok, false);

  const receipt = {
    schemaVersion: 'genesis.customer-products-proof@1',
    sourceCommit: process.env.GITHUB_SHA ?? 'LOCAL_WORKTREE',
    runtime: {
      engine: 'rdkit',
      version: runtime.version,
      executable: runtime.executable ?? null,
    },
    researchRunId: runId,
    canonicalEventCount: recovered.body.delivery.report.researchState.chainLength,
    chainHead: recovered.body.delivery.report.researchState.headChainHash,
    literatureSourceCount: recovered.body.delivery.report.literature.sources.length,
    completedExperimentCount: recovered.body.delivery.report.experiments.length,
    replayVerdicts: recovered.body.delivery.report.experiments.map((experiment) => experiment.replay.verdict),
    earlyBenchmarkGate: {
      status: earlyBenchmark.body.delivery.status,
      blockers: earlyBenchmark.body.delivery.productDelivery.blockers,
      exportAllowed: earlyBenchmark.body.delivery.exportAllowed,
    },
    missingOnboardingGate: {
      status: missingOnboarding.body.delivery.status,
      blockers: missingOnboarding.body.delivery.productDelivery.blockers,
      exportAllowed: missingOnboarding.body.delivery.exportAllowed,
    },
    restart: {
      productId: CUSTOMER_PRODUCT.RESEARCH_SPRINT,
      deliveryFingerprintStable: recovered.body.delivery.deliveryFingerprint === sprint.deliveryFingerprint,
      artifactSha256Stable: recovered.body.exportArtifact.artifact.sha256 === sprint.artifactSha256,
    },
    products,
    commercialAdmissionProof: 'TEST_FIXTURE_APPROVER_NOT_PRODUCTION_RIGHTS',
    truthBoundary: {
      billing: 'NOT_INTEGRATED',
      agreement: 'NOT_SIGNED',
      enterprise: 'BLOCKED_EXTERNAL_ENTERPRISE_CONTRACT',
      physicalValidation: 'NOT_CLAIMED',
    },
  };
  const receiptJson = `${JSON.stringify(receipt, null, 2)}\n`;
  writeFileSync(path.join(outputDir, 'customer-products-proof.json'), receiptJson, 'utf8');
  process.stdout.write(receiptJson);
} finally {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
}
