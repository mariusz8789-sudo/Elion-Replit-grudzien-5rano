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
import { admitCommercialRelease } from './commercialReleaseAdmission.mjs';
import { getResearchRun } from './researchRun.mjs';

export const CUSTOMER_DELIVERY_KIND = 'GENESIS_CUSTOMER_RESEARCH_DELIVERY';
export const CUSTOMER_DELIVERY_VERSION = '1.0.0';

export const CUSTOMER_DELIVERY_STATUS = Object.freeze({
  READY: 'READY_FOR_AUTHORISED_EXPORT',
  SCIENTIFIC_BLOCKED: 'BLOCKED_SCIENTIFIC_INCOMPLETE',
  COMMERCIAL_BLOCKED: 'BLOCKED_COMMERCIAL_POLICY',
});

const DECLARED_USE = 'CUSTOMER_REPORT_EXPORT';

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
      headChainHash: run.researchState.chain.headChainHash ?? null,
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
  items = [],
  commercialDecisionSource = 'DIRECT_INTERNAL_CALL',
} = {}) {
  const run = getResearchRun(db, projectId, runId);
  if (!run) return { ok: false, status: 'NOT_FOUND' };

  const sources = literatureSources(run);
  const experiments = completedExperiments(run);
  const report = reportOf(run, sources, experiments);
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
    declaredUse,
    items,
  });

  let status = CUSTOMER_DELIVERY_STATUS.READY;
  if (scientificBlockers_.length > 0) status = CUSTOMER_DELIVERY_STATUS.SCIENTIFIC_BLOCKED;
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
      requiredCommercialItems: requiredItems,
      commercialAdmission: admission,
      exportAllowed: status === CUSTOMER_DELIVERY_STATUS.READY,
      delivered: false,
      customerAccepted: false,
      paymentStatus: 'NOT_INTEGRATED',
      commercialDecisionSource,
      approvalBoundary: 'READY permits an authorised export step only. Delivery, acceptance, payment and external validation require separate real-world records.',
      deliveryFingerprint: canonicalHash(fingerprintBody),
    },
  };
}
