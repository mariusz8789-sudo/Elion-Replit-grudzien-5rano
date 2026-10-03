/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * Customer delivery is a read-only projection of the canonical ResearchRun.
 *
 * It creates no customer lifecycle, scientific store, Evidence ledger or
 * commercial ledger. The only policy decision is delegated to the existing
 * commercial release admission gate. READY means an exact computational
 * report may enter an authorised export step; it never means delivered,
 * accepted, paid, clinically validated or wet-lab confirmed.
 */
import { canonicalHash } from './provenance.mjs';
import { canonicalJson } from './determinism.mjs';
import { admitCommercialRelease } from './commercialReleaseAdmission.mjs';
import { getResearchRun } from './researchRun.mjs';

export const CUSTOMER_DELIVERY_KIND = 'GENESIS_CUSTOMER_RESEARCH_DELIVERY';
export const CUSTOMER_DELIVERY_VERSION = '1.0.0';

export const CUSTOMER_DELIVERY_STATUS = Object.freeze({
  READY: 'READY_FOR_AUTHORISED_EXPORT',
  SCIENTIFIC_BLOCKED: 'BLOCKED_SCIENTIFIC_INCOMPLETE',
  COMMERCIAL_BLOCKED: 'BLOCKED_COMMERCIAL_POLICY',
  PRODUCT_BLOCKED: 'BLOCKED_PRODUCT_REQUIREMENTS',
});

const DECLARED_USE = 'CUSTOMER_REPORT_EXPORT';

export const CUSTOMER_PRODUCT = Object.freeze({
  VERIFY: 'GENESIS_VERIFY',
  BENCHMARK: 'GENESIS_BENCHMARK',
  RESEARCH_SPRINT: 'GENESIS_RESEARCH_SPRINT',
  EVIDENCE_PLATFORM: 'GENESIS_EVIDENCE_PLATFORM',
});

export const CUSTOMER_PRODUCT_STATUS = Object.freeze({
  READY: 'READY_FOR_AUTHORISED_EXPORT',
  BLOCKED: 'BLOCKED_PRODUCT_REQUIREMENTS',
  LEGACY: 'LEGACY_COMPUTATIONAL_REPORT',
});

const PRODUCT_DECLARED_USE = Object.freeze({
  [CUSTOMER_PRODUCT.VERIFY]: 'GENESIS_VERIFY_CUSTOMER_EXPORT',
  [CUSTOMER_PRODUCT.BENCHMARK]: 'GENESIS_BENCHMARK_CUSTOMER_EXPORT',
  [CUSTOMER_PRODUCT.RESEARCH_SPRINT]: 'GENESIS_RESEARCH_SPRINT_CUSTOMER_EXPORT',
  [CUSTOMER_PRODUCT.EVIDENCE_PLATFORM]: 'GENESIS_EVIDENCE_PLATFORM_CUSTOMER_EXPORT',
});

const DATA_CLASSIFICATIONS = new Set(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']);
const MAX_CUSTOMER_EXPORT_BYTES = 5 * 1024 * 1024;

function cleanText(value, max = 500) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, max) : null;
}

export function resolveCustomerDeclaredUse(productId, supplied = DECLARED_USE) {
  return PRODUCT_DECLARED_USE[productId] ?? supplied ?? DECLARED_USE;
}

function uniqueBy(items, keyOf) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function literatureSources(run) {
  const sources = [];
  for (const snapshot of run.literatureSnapshots ?? []) {
    sources.push(...(snapshot.primary?.sources ?? []), ...(snapshot.contradictionSearch?.sources ?? []));
  }
  return uniqueBy(sources, (source) => source.sourceId).sort((a, b) => a.sourceId.localeCompare(b.sourceId));
}

function completedExperiments(run) {
  return (run.experiments ?? []).filter((experiment) => (
    experiment.frozen
    && experiment.execution
    && experiment.falsification
    && experiment.evidence
    && experiment.next
  ));
}

export function requiredCommercialItemsOf(run) {
  const items = [];
  for (const source of literatureSources(run)) {
    items.push({
      itemId: `literature:${source.sourceId}`,
      category: 'SCIENTIFIC_SOURCE',
      identity: {
        sha256: source.metadataHash ?? null,
        accession: source.pmid ?? source.pmcid ?? source.doi ?? source.sourceId,
      },
      observedLicenceStatus: source.licenceStatus ?? 'UNKNOWN',
      evidenceRef: `literature-source:${source.sourceId}`,
    });
  }

  for (const experiment of completedExperiments(run)) {
    const engine = experiment.execution.engine ?? {};
    items.push({
      itemId: `engine:${engine.engineId ?? 'UNKNOWN'}:${engine.version ?? engine.engineLabel ?? 'UNKNOWN'}`,
      category: 'SCIENTIFIC_ENGINE',
      identity: {
        version: engine.version ?? engine.engineLabel ?? null,
      },
      observedLicenceStatus: 'UNKNOWN',
      evidenceRef: `execution:${experiment.execution.scienceRunId ?? experiment.experimentId}`,
    });
  }

  const generatedBy = run.plan?.generatedBy;
  if (generatedBy?.providerId && generatedBy?.model) {
    items.push({
      itemId: `model:${generatedBy.providerId}:${generatedBy.model}:${generatedBy.version ?? 'UNKNOWN'}`,
      category: 'REASONING_MODEL',
      identity: { version: generatedBy.version ?? generatedBy.model },
      observedLicenceStatus: 'UNKNOWN',
      evidenceRef: `research-plan:${generatedBy.responseFingerprint ?? run.researchRunId}`,
    });
  }

  return uniqueBy(items, (item) => item.itemId).sort((a, b) => a.itemId.localeCompare(b.itemId));
}

function scientificBlockers(run, experiments) {
  const blockers = [];
  const executedExperiments = experiments.filter((experiment) => experiment.execution?.status === 'EXECUTED');
  if (run.researchState?.chain?.ok !== true) blockers.push('RESEARCH_STATE_CHAIN_INVALID');
  if (!run.problem) blockers.push('QUESTION_MISSING');
  if ((run.literatureSnapshots ?? []).length === 0) blockers.push('LITERATURE_SNAPSHOT_MISSING');
  if (!run.plan) blockers.push('RESEARCH_PLAN_MISSING');
  if (experiments.length === 0) blockers.push('COMPLETE_EXPERIMENT_MISSING');
  if ((run.experiments ?? []).length !== experiments.length) blockers.push('OPEN_OR_INCOMPLETE_EXPERIMENT');
  if (executedExperiments.length === 0) {
    blockers.push('REAL_EXECUTION_MISSING');
  }
  if (executedExperiments.length === 0) {
    blockers.push('POSITIVE_REPLAY_MISSING');
  } else if (executedExperiments.some((experiment) => experiment.next?.replay?.verdict !== 'MATCH')) {
    blockers.push('REPLAY_MISMATCH_OR_MISSING');
  }
  if (!experiments.every((experiment) => (
    typeof experiment.execution?.inputHash === 'string'
    && typeof experiment.execution?.outputHash === 'string'
    && typeof experiment.falsification?.verdict === 'string'
    && typeof experiment.evidence?.evidenceProposalId === 'string'
  ))) {
    blockers.push('EVIDENCE_CHAIN_INCOMPLETE');
  }
  return blockers;
}

function onboardingOf(run, productId, input) {
  if (!productId) {
    return Object.freeze({
      provided: false,
      status: 'NOT_REQUIRED_LEGACY',
      blockers: Object.freeze([]),
      fingerprint: null,
    });
  }

  const source = input && typeof input === 'object' ? input : {};
  const acceptanceCriteria = [...new Set((Array.isArray(source.acceptanceCriteria) ? source.acceptanceCriteria : [])
    .map((item) => cleanText(item, 300))
    .filter(Boolean))].slice(0, 20);
  const normalized = {
    customerReference: cleanText(source.customerReference, 128),
    objective: cleanText(source.objective, 1_000),
    acceptanceCriteria,
    dataClassification: DATA_CLASSIFICATIONS.has(source.dataClassification) ? source.dataClassification : null,
    requestedProduct: productId,
    researchRunId: run.researchRunId,
  };
  const blockers = [];
  if (!normalized.customerReference) blockers.push('CUSTOMER_REFERENCE_REQUIRED');
  if (!normalized.objective) blockers.push('CUSTOMER_OBJECTIVE_REQUIRED');
  if (normalized.acceptanceCriteria.length === 0) blockers.push('ACCEPTANCE_CRITERIA_REQUIRED');
  if (!normalized.dataClassification) blockers.push('DATA_CLASSIFICATION_REQUIRED');
  const body = { ...normalized, blockers };
  return Object.freeze({
    ...body,
    provided: true,
    status: blockers.length === 0 ? 'READY' : 'BLOCKED',
    blockers: Object.freeze(blockers),
    fingerprint: canonicalHash(body),
  });
}

function productDeliveryOf(run, sources, experiments, productId, onboarding) {
  if (!productId) {
    return Object.freeze({
      productId: null,
      status: CUSTOMER_PRODUCT_STATUS.LEGACY,
      declaredUse: DECLARED_USE,
      blockers: Object.freeze([]),
      deliverable: null,
      fingerprint: null,
    });
  }

  const knownProduct = Object.values(CUSTOMER_PRODUCT).includes(productId);
  const executed = experiments.filter((experiment) => experiment.execution?.status === 'EXECUTED');
  const replayMatches = executed.filter((experiment) => experiment.next?.replay?.verdict === 'MATCH');
  const evidenceProposals = executed.filter((experiment) => typeof experiment.evidence?.evidenceProposalId === 'string');
  const blockers = [...onboarding.blockers];
  if (!knownProduct) blockers.push('CUSTOMER_PRODUCT_UNKNOWN');

  const common = {
    researchRunId: run.researchRunId,
    sourceCount: sources.length,
    hypothesisCount: run.plan?.hypotheses?.length ?? 0,
    completedExperimentCount: experiments.length,
    realExecutionCount: executed.length,
    replayMatchCount: replayMatches.length,
    evidenceProposalCount: evidenceProposals.length,
    chainOk: run.researchState?.chain?.ok === true,
  };

  let deliverable = { kind: 'UNKNOWN_PRODUCT', ...common };
  if (productId === CUSTOMER_PRODUCT.VERIFY) {
    if (executed.length === 0) blockers.push('VERIFIABLE_EXECUTION_REQUIRED');
    if (replayMatches.length !== executed.length) blockers.push('REPLAY_MATCH_REQUIRED');
    deliverable = {
      kind: 'GENESIS_VERIFY_RESULT',
      verificationScope: 'CANONICAL_RESEARCHRUN_CHAIN_AND_REPLAY',
      ...common,
      experimentIds: executed.map((experiment) => experiment.experimentId),
      replayVerdicts: executed.map((experiment) => experiment.next.replay.verdict),
    };
  } else if (productId === CUSTOMER_PRODUCT.BENCHMARK) {
    if (executed.length < 2) blockers.push('MINIMUM_TWO_PREREGISTERED_CASES_REQUIRED');
    if (replayMatches.length !== executed.length) blockers.push('REPLAY_MATCH_REQUIRED');
    deliverable = {
      kind: 'GENESIS_BENCHMARK_RESULT',
      benchmarkScope: 'PREREGISTERED_RESEARCHRUN_CASE_SET',
      independentMethodAgreement: 'NOT_CLAIMED',
      ...common,
      cases: executed.map((experiment) => ({
        experimentId: experiment.experimentId,
        engineId: experiment.execution.engine?.engineId ?? null,
        protocolVerdict: experiment.falsification?.verdict ?? null,
        replayVerdict: experiment.next?.replay?.verdict ?? null,
      })),
    };
  } else if (productId === CUSTOMER_PRODUCT.RESEARCH_SPRINT) {
    if (sources.length === 0) blockers.push('SPRINT_LITERATURE_REQUIRED');
    if (!run.plan) blockers.push('SPRINT_PLAN_REQUIRED');
    if (executed.length === 0) blockers.push('SPRINT_EXECUTION_REQUIRED');
    deliverable = {
      kind: 'GENESIS_RESEARCH_SPRINT_RESULT',
      sprintScope: 'QUESTION_TO_NEXT_EXPERIMENT',
      ...common,
      nextExperiments: experiments.map((experiment) => experiment.next?.proposal ?? null),
    };
  } else if (productId === CUSTOMER_PRODUCT.EVIDENCE_PLATFORM) {
    if (evidenceProposals.length === 0) blockers.push('EVIDENCE_PROPOSAL_REQUIRED');
    if (replayMatches.length !== executed.length) blockers.push('REPLAY_MATCH_REQUIRED');
    deliverable = {
      kind: 'GENESIS_EVIDENCE_PLATFORM_EXPORT',
      publicationAuthority: 'REQUIRES_HUMAN_APPROVAL',
      ...common,
      evidenceProposalIds: evidenceProposals.map((experiment) => experiment.evidence.evidenceProposalId),
      replayRecordIds: replayMatches.map((experiment) => experiment.next.replay.replayRecordId ?? null),
    };
  }

  const body = {
    productId,
    declaredUse: resolveCustomerDeclaredUse(productId),
    onboardingFingerprint: onboarding.fingerprint,
    blockers: [...new Set(blockers)],
    deliverable,
    truthBoundary: 'Product readiness means a bounded computational export is reviewable. It does not mean delivered, paid, signed, clinically validated or physically reproduced.',
  };
  return Object.freeze({
    ...body,
    status: body.blockers.length === 0 ? CUSTOMER_PRODUCT_STATUS.READY : CUSTOMER_PRODUCT_STATUS.BLOCKED,
    blockers: Object.freeze(body.blockers),
    fingerprint: canonicalHash(body),
  });
}

function reportOf(run, sources, experiments) {
  const body = {
    kind: 'GENESIS_COMPUTATIONAL_RESEARCH_REPORT',
    contractVersion: CUSTOMER_DELIVERY_VERSION,
    reportScope: 'COMPUTATIONAL_RESEARCH_ITERATION',
    researchRunId: run.researchRunId,
    question: run.question,
    researchState: {
      chainOk: run.researchState.chain.ok,
      chainLength: run.researchState.chain.length,
      headChainHash: run.researchState.chain.head ?? null,
    },
    literature: {
      snapshotCount: run.literatureSnapshots.length,
      sources: sources.map((source) => ({
        sourceId: source.sourceId,
        title: source.title,
        canonicalUrl: source.canonicalUrl,
        licence: source.licence,
        licenceStatus: source.licenceStatus,
        retrievalStatus: source.retrievalStatus,
        metadataHash: source.metadataHash,
      })),
      epistemicBoundary: 'SOURCE_METADATA_IS_NOT_EVIDENCE_UNTIL_REVIEWED_AND_ADMITTED',
    },
    plan: {
      status: run.plan?.status ?? null,
      epistemicStatus: run.plan?.epistemicStatus ?? null,
      hypotheses: (run.plan?.hypotheses ?? []).map((hypothesis) => ({
        hypothesisId: hypothesis.hypothesisId,
        claim: hypothesis.claim,
        uncertainty: hypothesis.uncertainty,
        experimentDecision: hypothesis.experimentProposal?.decision ?? null,
      })),
      generatedBy: run.plan?.generatedBy ?? null,
    },
    experiments: experiments.map((experiment) => ({
      experimentId: experiment.experimentId,
      hypothesisId: experiment.frozen.hypothesisId,
      predictionFingerprint: experiment.frozen.predictionFingerprint,
      preregistrationFingerprint: experiment.frozen.preregistrationFingerprint,
      engine: experiment.execution.engine,
      status: experiment.execution.status,
      inputHash: experiment.execution.inputHash,
      outputHash: experiment.execution.outputHash,
      protocolVerdict: experiment.falsification.verdict,
      verdictScope: experiment.falsification.scope,
      evidence: {
        proposalId: experiment.evidence.evidenceProposalId,
        status: experiment.evidence.status,
        publication: experiment.evidence.publication,
      },
      replay: experiment.next.replay,
      nextExperiment: experiment.next.proposal,
      decisionTrace: experiment.next.decisionTrace ?? null,
    })),
    limitations: [
      'This report describes computational research; it is not a clinical, therapeutic or safety claim.',
      'Evidence entries remain proposals until separately published by an authorised reviewer.',
      'Commercial admission does not establish scientific validity, customer acceptance, payment or physical laboratory confirmation.',
    ],
  };
  return { ...body, reportFingerprint: canonicalHash(body) };
}

/**
 * Build a deterministic customer report and run the exact release manifest
 * through the existing commercial admission gate.
 */
export function buildCustomerResearchDelivery(db, projectId, runId, {
  releaseId = null,
  declaredUse = DECLARED_USE,
  productId = null,
  onboarding = null,
  items = [],
  commercialDecisionSource = 'DIRECT_INTERNAL_CALL',
} = {}) {
  const run = getResearchRun(db, projectId, runId);
  if (!run) return { ok: false, status: 'NOT_FOUND' };

  const sources = literatureSources(run);
  const experiments = completedExperiments(run);
  const report = reportOf(run, sources, experiments);
  const onboardingRecord = onboardingOf(run, productId, onboarding);
  const productDelivery = productDeliveryOf(run, sources, experiments, productId, onboardingRecord);
  const resolvedDeclaredUse = resolveCustomerDeclaredUse(productId, declaredUse);
  const requiredItems = requiredCommercialItemsOf(run);
  const suppliedItems = Array.isArray(items) ? items : [];
  const providedIds = new Set(suppliedItems.map((item) => item?.itemId));
  const requiredIds = new Set(requiredItems.map((item) => item.itemId));
  const missingItemIds = requiredItems.map((item) => item.itemId).filter((itemId) => !providedIds.has(itemId));
  const unexpectedItemIds = suppliedItems
    .map((item) => item?.itemId ?? null)
    .filter((itemId) => !requiredIds.has(itemId));
  const suppliedById = new Map(suppliedItems.map((item) => [item?.itemId, item]));
  const itemIdentityMismatches = requiredItems
    .filter((required) => {
      const supplied = suppliedById.get(required.itemId);
      if (!supplied) return false;
      return supplied.category !== required.category
        || canonicalHash(supplied.identity ?? {}) !== canonicalHash(required.identity)
        || !Array.isArray(supplied.evidenceRefs)
        || !supplied.evidenceRefs.includes(required.evidenceRef);
    })
    .map((item) => item.itemId);
  const scientificBlockers_ = scientificBlockers(run, experiments);
  const admission = admitCommercialRelease({
    releaseId,
    researchRunId: run.researchRunId,
    declaredUse: resolvedDeclaredUse,
    items,
  });

  let status = CUSTOMER_DELIVERY_STATUS.READY;
  if (scientificBlockers_.length > 0) status = CUSTOMER_DELIVERY_STATUS.SCIENTIFIC_BLOCKED;
  else if (productDelivery.status === CUSTOMER_PRODUCT_STATUS.BLOCKED) status = CUSTOMER_DELIVERY_STATUS.PRODUCT_BLOCKED;
  else if (
    !admission.exportAllowed
    || missingItemIds.length > 0
    || unexpectedItemIds.length > 0
    || itemIdentityMismatches.length > 0
  ) status = CUSTOMER_DELIVERY_STATUS.COMMERCIAL_BLOCKED;

  const fingerprintBody = {
    kind: CUSTOMER_DELIVERY_KIND,
    contractVersion: CUSTOMER_DELIVERY_VERSION,
    researchRunId: run.researchRunId,
    reportFingerprint: report.reportFingerprint,
    productId: productDelivery.productId,
    productFingerprint: productDelivery.fingerprint,
    onboardingFingerprint: onboardingRecord.fingerprint,
    commercialManifestHash: admission.manifestHash,
    requiredItemIds: requiredItems.map((item) => item.itemId),
    missingItemIds,
    unexpectedItemIds,
    itemIdentityMismatches,
    scientificBlockers: scientificBlockers_,
    commercialDecisionSource,
    status,
  };

  return {
    ok: true,
    delivery: {
      ...fingerprintBody,
      report,
      onboarding: onboardingRecord,
      productDelivery,
      requiredCommercialItems: requiredItems,
      commercialAdmission: admission,
      exportAllowed: status === CUSTOMER_DELIVERY_STATUS.READY,
      delivered: false,
      customerAccepted: false,
      paymentStatus: 'NOT_INTEGRATED',
      agreementStatus: 'NOT_SIGNED',
      enterpriseStatus: 'BLOCKED_EXTERNAL_ENTERPRISE_CONTRACT',
      commercialDecisionSource,
      approvalBoundary: 'READY permits an authorised export step only. Delivery, acceptance, payment, contract signature and external validation require separate real-world records.',
      deliveryFingerprint: canonicalHash(fingerprintBody),
    },
  };
}

/**
 * Serialize an already-admitted delivery into a deterministic JSON artifact.
 * This creates bytes only; it does not sign, transmit, accept or bill.
 */
export function buildAuthorizedCustomerExport(delivery) {
  if (!delivery?.exportAllowed) {
    return Object.freeze({
      ok: false,
      status: 'EXPORT_BLOCKED',
      deliveryStatus: delivery?.status ?? null,
      scientificBlockers: Object.freeze(delivery?.scientificBlockers ?? []),
      productBlockers: Object.freeze(delivery?.productDelivery?.blockers ?? []),
    });
  }

  const payload = {
    schemaVersion: 'genesis.customer-product-export@1',
    productId: delivery.productDelivery?.productId ?? null,
    researchRunId: delivery.researchRunId,
    deliveryFingerprint: delivery.deliveryFingerprint,
    onboarding: delivery.onboarding,
    productDelivery: delivery.productDelivery,
    report: delivery.report,
    commercialAdmission: {
      status: delivery.commercialAdmission.status,
      declaredUse: delivery.commercialAdmission.declaredUse,
      manifestHash: delivery.commercialAdmission.manifestHash,
    },
    truthBoundary: {
      delivered: false,
      customerAccepted: false,
      paymentStatus: 'NOT_INTEGRATED',
      agreementStatus: 'NOT_SIGNED',
      enterpriseStatus: 'BLOCKED_EXTERNAL_ENTERPRISE_CONTRACT',
    },
  };
  const content = canonicalJson(payload);
  const byteLength = Buffer.byteLength(content, 'utf8');
  if (byteLength > MAX_CUSTOMER_EXPORT_BYTES) {
    return Object.freeze({
      ok: false,
      status: 'EXPORT_TOO_LARGE',
      byteLength,
      maxBytes: MAX_CUSTOMER_EXPORT_BYTES,
    });
  }
  const slug = (delivery.productDelivery?.productId ?? 'computational-report').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return Object.freeze({
    ok: true,
    status: 'AUTHORISED_EXPORT_ARTIFACT_READY',
    artifact: Object.freeze({
      fileName: `genesis-${slug}-${delivery.researchRunId}.json`,
      mediaType: 'application/json',
      byteLength,
      sha256: canonicalHash(payload),
      content,
    }),
  });
}
