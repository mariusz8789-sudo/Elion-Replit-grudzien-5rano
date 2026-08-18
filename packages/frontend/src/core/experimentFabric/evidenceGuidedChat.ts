import { canonicalJson, fnv1a } from '../events/hash';
import { runExperiment } from './executor';
import { createExperimentIntent, createExperimentPlan, getRouterModel, validateStructuredExperimentRequest } from './router';
import type { ExperimentPlan, ExperimentRun, StructuredExperimentRequest } from './types';

export const EVIDENCE_GUIDED_CHAT_VERSION = '1.0.0';

export type EvidenceGuidedPlanStatus = 'READY_FOR_CONFIRMATION' | 'ENGINE_NOT_AVAILABLE' | 'INVALID_REQUEST';

export interface EvidenceGuidedModelDisclosure {
  modelId?: string;
  modelVersion: string | null;
  engine: string | null;
  capability: string;
  runnable: boolean;
  resultWillComeFromRealRun: boolean;
  requestedParameters: Readonly<Record<string, string | number | boolean>>;
  parameterSchema: ExperimentPlan['parameterSchema'];
  seed?: number;
  route: ExperimentPlan['route'];
  rationale: string;
  requiredSolver: string;
  limitations: readonly string[];
  knowledgeSources: readonly string[];
}

/**
 * Immutable user-facing preflight. It has no scientific outputs and never executes a model.
 */
export interface EvidenceGuidedExperimentPlan {
  contractVersion: string;
  status: EvidenceGuidedPlanStatus;
  request: StructuredExperimentRequest;
  plan: ExperimentPlan;
  disclosure: EvidenceGuidedModelDisclosure;
  validationErrors: readonly string[];
  confirmationId: string;
}

export interface EvidenceGuidedOutcomeHandoff {
  evidencePack: {
    status: 'PROTOCOL_REQUIRED';
    reason: string;
    canonicalRunId: string;
  };
  counterfactual: {
    status: 'VARIANT_REQUIRED';
    reason: string;
    canonicalRunId: string;
  };
}

export interface ConfirmedEvidenceGuidedExperiment {
  contractVersion: string;
  plan: EvidenceGuidedExperimentPlan;
  run: ExperimentRun;
  handoff: EvidenceGuidedOutcomeHandoff;
}

function limitationsFor(plan: ExperimentPlan): readonly string[] {
  const intent = plan.intent;
  if (!plan.runnable) {
    return [
      intent.rationale,
      `Wymagany komponent: ${intent.requiredSolver}.`,
      'Genesis nie uruchomi ani nie wygeneruje wyniku, dopóki wskazany realny silnik nie jest dostępny.',
    ];
  }
  const model = intent.request.modelId ? getRouterModel(intent.request.modelId) : undefined;
  return [
    model?.rationale ?? intent.rationale,
    'Wynik obowiązuje wyłącznie w granicach modelu, parametrów i założeń wskazanych przed wykonaniem.',
    'Ten plan nie stanowi predykcji świata rzeczywistego, rekomendacji działania ani odkrycia naukowego.',
  ];
}

function statusFor(plan: ExperimentPlan, validationErrors: readonly string[]): EvidenceGuidedPlanStatus {
  if (validationErrors.length > 0) return 'INVALID_REQUEST';
  return plan.runnable ? 'READY_FOR_CONFIRMATION' : 'ENGINE_NOT_AVAILABLE';
}

function confirmationIdFor(status: EvidenceGuidedPlanStatus, request: StructuredExperimentRequest, plan: ExperimentPlan): string {
  return `guided_${fnv1a(canonicalJson({
    version: EVIDENCE_GUIDED_CHAT_VERSION,
    status,
    request,
    planId: plan.planId,
    engine: plan.engine,
    modelVersion: plan.modelVersion,
    runnable: plan.runnable,
  }))}`;
}

/**
 * Produces a deterministic, inspectable plan only. It deliberately does not call `runExperiment`.
 */
export function planEvidenceGuidedExperiment(request: StructuredExperimentRequest): EvidenceGuidedExperimentPlan {
  const validation = validateStructuredExperimentRequest(request);
  const intent = createExperimentIntent(request);
  const plan = createExperimentPlan(intent);
  const status = statusFor(plan, validation.errors);
  const disclosure: EvidenceGuidedModelDisclosure = {
    ...(request.modelId === undefined ? {} : { modelId: request.modelId }),
    modelVersion: plan.modelVersion,
    engine: plan.engine,
    capability: intent.capability,
    runnable: plan.runnable,
    resultWillComeFromRealRun: plan.runnable && intent.capability === 'REAL_ENGINE',
    requestedParameters: request.parameters,
    parameterSchema: plan.parameterSchema,
    ...(request.seed === undefined ? {} : { seed: request.seed }),
    route: plan.route,
    rationale: intent.rationale,
    requiredSolver: intent.requiredSolver,
    limitations: limitationsFor(plan),
    knowledgeSources: intent.knowledgeSources,
  };
  return {
    contractVersion: EVIDENCE_GUIDED_CHAT_VERSION,
    status,
    request,
    plan,
    disclosure,
    validationErrors: validation.errors,
    confirmationId: confirmationIdFor(status, request, plan),
  };
}

/**
 * Rebuilds the plan before execution to prevent callers from changing a reviewed model,
 * parameter, solver or capability between disclosure and confirmation.
 */
export function confirmEvidenceGuidedExperiment(reviewedPlan: EvidenceGuidedExperimentPlan): ConfirmedEvidenceGuidedExperiment {
  const canonicalPlan = planEvidenceGuidedExperiment(reviewedPlan.request);
  if (canonicalJson(canonicalPlan) !== canonicalJson(reviewedPlan)) {
    throw new Error('Evidence-Guided Chat Plan was modified after review; rebuild and present the plan before confirmation.');
  }
  if (canonicalPlan.status !== 'READY_FOR_CONFIRMATION') {
    throw new Error(`Plan cannot be confirmed: ${canonicalPlan.status}. ${canonicalPlan.disclosure.rationale}`);
  }
  const run = runExperiment(canonicalPlan.request);
  return {
    contractVersion: EVIDENCE_GUIDED_CHAT_VERSION,
    plan: canonicalPlan,
    run,
    handoff: {
      evidencePack: {
        status: 'PROTOCOL_REQUIRED',
        reason: 'Pojedynczy run zachowuje pełne provenance, ale istniejący ScientificEvidencePack wymaga prerejestrowanego protokołu z wariantami, kontrolą lub powtórzeniami. Nie tworzymy fikcyjnego Evidence Pack.',
        canonicalRunId: run.runId,
      },
      counterfactual: {
        status: 'VARIANT_REQUIRED',
        reason: 'Do porównania A/B potrzebny jest drugi, jawnie zatwierdzony request tego samego modelu. Nie tworzymy wariantu ani wyniku kontrfaktycznego automatycznie.',
        canonicalRunId: run.runId,
      },
    },
  };
}
