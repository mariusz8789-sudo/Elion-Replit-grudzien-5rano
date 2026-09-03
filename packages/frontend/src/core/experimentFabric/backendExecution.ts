import { runFabricCompute, type ComputeRun } from '../backend/client';
import { canonicalJson } from '../events/hash';
import { getRouterModel } from './router';
import { getActiveKnowledgeProject } from '../backend/knowledgeProjectContext';
import { createExperimentProvenance } from './provenance';
import { planEvidenceGuidedExperiment, type ConfirmedEvidenceGuidedExperiment, type EvidenceGuidedExperimentPlan, type EvidenceGuidedOutcomeHandoff } from './evidenceGuidedChat';
import { EXPERIMENT_FABRIC_VERSION, type ExperimentResult, type ExperimentRun, type ExperimentValue } from './types';

export const BACKEND_EVIDENCE_EXECUTION_VERSION = '1.0.0';

function reviewedBackendPlan(reviewedPlan: EvidenceGuidedExperimentPlan): EvidenceGuidedExperimentPlan {
  const canonicalPlan = planEvidenceGuidedExperiment(reviewedPlan.request);
  if (canonicalJson(canonicalPlan) !== canonicalJson(reviewedPlan)) {
    throw new Error('Evidence-Guided Chat Plan was modified after review; rebuild and present the plan before confirmation.');
  }
  if (canonicalPlan.status !== 'READY_FOR_CONFIRMATION' || canonicalPlan.plan.intent.capability !== 'BACKEND_REAL_ENGINE') {
    throw new Error(`Plan cannot be executed by the backend: ${canonicalPlan.status}. ${canonicalPlan.disclosure.rationale}`);
  }
  return canonicalPlan;
}

function handoffFor(run: ExperimentRun): EvidenceGuidedOutcomeHandoff {
  return {
    evidencePack: {
      status: 'PROTOCOL_REQUIRED',
      reason: 'Pojedynczy backendowy run zachowuje provenance, lecz ScientificEvidencePack wymaga prerejestrowanego protokołu z wariantami, kontrolą lub powtórzeniami.',
      canonicalRunId: run.runId,
    },
    counterfactual: {
      status: 'VARIANT_REQUIRED',
      reason: 'A/B wymaga drugiego, jawnie zatwierdzonego requestu tego samego modelu. Genesis nie tworzy wariantu ani wyniku kontrfaktycznego automatycznie.',
      canonicalRunId: run.runId,
    },
  };
}

function backendProvenanceRecord(run: ComputeRun): Readonly<Record<string, string>> {
  const provenance = run.provenance;
  return {
    source: provenance?.source ?? 'backend provenance absent',
    formula: provenance?.formula ?? 'backend provenance absent',
    honesty: provenance?.honesty ?? 'unknown',
    engine: provenance?.engine ?? 'unknown',
    requiredEnvironmentVariable: provenance?.requiredEnvironmentVariable ?? 'unknown',
    classification: provenance?.classification ?? 'UNCLASSIFIED',
    referencePdb: provenance?.referencePdb ?? 'not-applicable',
    mobilePdb: provenance?.mobilePdb ?? 'not-applicable',
    referenceSha256: provenance?.referenceSha256 ?? 'not-applicable',
    mobileSha256: provenance?.mobileSha256 ?? 'not-applicable',
    requiredEnvironmentVariables: Array.isArray(provenance?.requiredEnvironmentVariables)
      ? provenance.requiredEnvironmentVariables.join(',')
      : 'not-applicable',
  };
}

function resultFromBackend(plan: EvidenceGuidedExperimentPlan, backendRun: ComputeRun): ExperimentResult {
  const model = plan.request.modelId ? getRouterModel(plan.request.modelId) : undefined;
  if (!model || backendRun.modelId !== model.id || backendRun.modelVersion !== model.modelVersion) {
    throw new Error('Backend returned a model identity or version different from the reviewed plan.');
  }
  for (const [key, expectedValue] of Object.entries(plan.request.parameters)) {
    if (backendRun.inputs !== undefined && backendRun.inputs[key] !== expectedValue) {
      throw new Error(`Backend returned input ${key} different from the reviewed plan; execution is blocked.`);
    }
  }
  if (!backendRun.provenance?.engine) {
    throw new Error('Backend did not provide engine provenance for the reviewed plan.');
  }
  if (!backendRun.outputs || !backendRun.units || backendRun.status !== 'ok') {
    throw new Error(backendRun.message ?? `Backend run finished with status ${backendRun.status}.`);
  }
  return {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    status: 'completed',
    summary: `Backend ${backendRun.provenance.engine} ukończył rzeczywisty run modelu ${model.id}${Object.keys(plan.request.parameters).length === 0 ? '' : ` dla zatwierdzonych parametrów: ${Object.entries(plan.request.parameters).map(([key, value]) => `${key}=${String(value)}`).join(', ')}`}.`,
    outputs: backendRun.outputs,
    units: backendRun.units,
    warnings: backendRun.warnings ?? [],
    validity: backendRun.validity ?? model.rationale,
    assumptions: backendRun.assumptions ?? [model.rationale],
    visualization: ['numeric', 'graph'],
    route: model.route,
  };
}

/**
 * Confirms an unchanged reviewed backend plan and invokes the canonical Fabric API.
 * It accepts no output from the caller and performs no science calculation in the browser.
 */
export async function confirmBackendEvidenceGuidedExperiment(
  reviewedPlan: EvidenceGuidedExperimentPlan,
): Promise<ConfirmedEvidenceGuidedExperiment> {
  const plan = reviewedBackendPlan(reviewedPlan);
  const flatInputs: Record<string, ExperimentValue> = {};
  for (const [key, value] of Object.entries(plan.request.parameters)) {
    if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean') {
      throw new Error(`Backend Fabric accepts only flat primitive input; ${key} is not a primitive.`);
    }
    if (typeof value === 'string' && value.length > 500) {
      throw new Error(`Backend Fabric input ${key} exceeds the reviewed text limit.`);
    }
    flatInputs[key] = value;
  }
  const response = await runFabricCompute({
    modelId: plan.request.modelId!,
    inputs: flatInputs,
    sourceText: plan.request.sourceText,
    domainId: plan.request.domainId,
    requestedVisualization: plan.request.requestedVisualization,
    ...(plan.request.seed === undefined ? {} : { seed: plan.request.seed }),
    ...(getActiveKnowledgeProject()?.id ? { projectId: getActiveKnowledgeProject()!.id } : {}),
  });
  if (!response.ok) {
    throw new Error(`Backend Fabric nie uruchomił modelu: ${response.error}. ${response.message}`);
  }
  const backendRun = response.data.run;
  const result = resultFromBackend(plan, backendRun);
  const backendExecution = {
    backendRunId: backendRun.runId,
    backendEngine: backendRun.engine ?? 'genesis-compute@unknown',
    backendModelVersion: backendRun.modelVersion,
    backendProvenance: backendProvenanceRecord(backendRun),
  };
  const run: ExperimentRun = {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    runId: backendRun.runId,
    request: plan.request,
    intent: plan.plan.intent,
    plan: plan.plan,
    result,
    provenance: createExperimentProvenance({
      request: plan.request,
      plan: plan.plan,
      result,
      knowledgeSources: plan.plan.intent.knowledgeSources,
      supplementalKnowledgeIds: plan.plan.intent.supplementalKnowledgeIds,
      deterministic: backendRun.deterministic === true,
      backendExecution,
    }),
  };
  return {
    contractVersion: BACKEND_EVIDENCE_EXECUTION_VERSION,
    plan,
    run,
    handoff: handoffFor(run),
  };
}

export function isBackendEvidenceGuidedPlan(plan: EvidenceGuidedExperimentPlan): boolean {
  return plan.status === 'READY_FOR_CONFIRMATION' && plan.plan.intent.capability === 'BACKEND_REAL_ENGINE';
}

export type BackendExperimentValue = ExperimentValue;
