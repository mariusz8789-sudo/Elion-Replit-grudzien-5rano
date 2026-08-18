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
    case 'REAL_ENGINE': return null;
  }
}

export function resultOriginForCapability(capability: KnowledgeCapability): ExperimentProvenance['resultOrigin'] {
  switch (capability) {
    case 'REAL_ENGINE': return 'real-engine';
    case 'KNOWLEDGE_ONLY': return 'knowledge-only';
    case 'CAPABILITY_SEAM': return 'capability-seam';
    case 'ENGINE_NOT_AVAILABLE': return 'engine-not-available';
  }
}

export function createExperimentProvenance(input: {
  request: StructuredExperimentRequest;
  plan: ExperimentPlan;
  result: ExperimentResult;
  knowledgeSources: readonly KnowledgeCorpusFile[];
  supplementalKnowledgeIds: readonly string[];
  deterministic: boolean;
}): ExperimentProvenance {
  const requestFingerprint = fingerprintStructuredRequest(input.request);
  const runFingerprint = `run_${fnv1a(canonicalJson({
    requestFingerprint,
    planFingerprint: fingerprintExperimentPlan(input.plan),
    status: input.result.status,
    outputs: input.result.outputs,
    units: input.result.units,
    warnings: input.result.warnings,
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
    resultOrigin: input.result.status === 'completed'
      ? 'real-engine'
      : resultOriginForCapability(input.plan.intent.capability),
  };
}
