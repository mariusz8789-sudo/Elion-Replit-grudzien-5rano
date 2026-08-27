import { canonicalJson, fnv1a } from '../events/hash';
import type { KnowledgeCapability, KnowledgeCorpusFile } from '../knowledge/registry';
import {
  EXPERIMENT_FABRIC_VERSION,
  type ExperimentPlan,
  type ExperimentProvenance,
  type ExperimentResult,
  type ExperimentRunStatus,
  type StructuredExperimentRequest,
} from './types';

function stableRequest(request: StructuredExperimentRequest) {
  return {
    contractVersion: request.contractVersion,
    sourceText: request.sourceText.trim(),
    domainId: request.domainId,
    operation: request.operation,
    modelId: request.modelId ?? null,
    parameters: request.parameters,
    requestedVisualization: request.requestedVisualization ?? null,
    seed: request.seed ?? null,
  };
}

export function fingerprintStructuredRequest(request: StructuredExperimentRequest): string {
  return `req_${fnv1a(canonicalJson(stableRequest(request)))}`;
}

export function fingerprintExperimentPlan(plan: ExperimentPlan): string {
  return `plan_${fnv1a(canonicalJson({
    request: stableRequest(plan.intent.request),
    capability: plan.intent.capability,
    supplementalKnowledgeIds: plan.intent.supplementalKnowledgeIds,
    engine: plan.engine,
    modelVersion: plan.modelVersion,
    parameterSchema: plan.parameterSchema,
    route: plan.route ?? null,
  }))}`;
}

export function statusForCapability(capability: KnowledgeCapability): ExperimentRunStatus | null {
  switch (capability) {
    case 'KNOWLEDGE_ONLY': return 'knowledge_only';
    case 'CAPABILITY_SEAM': return 'capability_seam';
    case 'ENGINE_NOT_AVAILABLE': return 'engine_not_available';
    case 'HYPOTHETICAL_VISUALIZATION': return 'hypothetical_visualization';
    case 'REAL_ENGINE': return null;
    case 'BACKEND_REAL_ENGINE': return null;
  }
}

/**
 * A run that did not complete produced no engine output, so its origin is reported from the
 * actual run status. Only a completed run may be stamped `real-engine`; a `rejected` or `failed`
 * REAL_ENGINE run never executed a solver and must not claim one.
 */
export function resultOriginForRunStatus(
  status: ExperimentRunStatus,
  capability: KnowledgeCapability,
): ExperimentProvenance['resultOrigin'] {
  switch (status) {
    case 'completed': return 'real-engine';
    case 'knowledge_only': return 'knowledge-only';
    case 'capability_seam': return 'capability-seam';
    case 'engine_not_available': return 'engine-not-available';
    case 'hypothetical_visualization': return 'hypothetical-visualization';
    case 'rejected':
    case 'failed': {
      const declared = resultOriginForCapability(capability);
      return declared === 'real-engine' ? 'engine-not-available' : declared;
    }
  }
}

export function resultOriginForCapability(capability: KnowledgeCapability): ExperimentProvenance['resultOrigin'] {
  switch (capability) {
    case 'REAL_ENGINE': return 'real-engine';
    case 'BACKEND_REAL_ENGINE': return 'real-engine';
    case 'KNOWLEDGE_ONLY': return 'knowledge-only';
    case 'CAPABILITY_SEAM': return 'capability-seam';
    case 'ENGINE_NOT_AVAILABLE': return 'engine-not-available';
    case 'HYPOTHETICAL_VISUALIZATION': return 'hypothetical-visualization';
  }
}

export function createExperimentProvenance(input: {
  request: StructuredExperimentRequest;
  plan: ExperimentPlan;
  result: ExperimentResult;
  knowledgeSources: readonly KnowledgeCorpusFile[];
  supplementalKnowledgeIds: readonly string[];
  deterministic: boolean;
  backendExecution?: ExperimentProvenance['backendExecution'];
}): ExperimentProvenance {
  const requestFingerprint = fingerprintStructuredRequest(input.request);
  const runFingerprint = `run_${fnv1a(canonicalJson({
    requestFingerprint,
    planFingerprint: fingerprintExperimentPlan(input.plan),
    status: input.result.status,
    outputs: input.result.outputs,
    units: input.result.units,
    warnings: input.result.warnings,
    backendExecution: input.backendExecution === undefined ? null : {
      backendEngine: input.backendExecution.backendEngine,
      backendModelVersion: input.backendExecution.backendModelVersion,
      backendProvenance: input.backendExecution.backendProvenance,
    },
  }))}`;
  return {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    requestFingerprint,
    runFingerprint,
    knowledgeSources: input.knowledgeSources,
    supplementalKnowledgeIds: input.supplementalKnowledgeIds,
    domainId: input.request.domainId,
    modelId: input.request.modelId,
    modelVersion: input.plan.modelVersion ?? undefined,
    engine: input.plan.engine,
    parameterSnapshot: { ...input.request.parameters },
    seed: input.request.seed,
    deterministic: input.deterministic,
    resultOrigin: resultOriginForRunStatus(input.result.status, input.plan.intent.capability),
    ...(input.backendExecution === undefined ? {} : { backendExecution: input.backendExecution }),
  };
}
