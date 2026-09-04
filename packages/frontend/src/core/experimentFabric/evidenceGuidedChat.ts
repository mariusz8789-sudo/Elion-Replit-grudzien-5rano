import { canonicalJson, fnv1a } from '../events/hash';
import { quantumEvidenceCardsForKnowledge, type QuantumEvidenceCard } from '../knowledge/quantumEvidenceCard';
import { executeEarthquakeCommandCenterScenario } from '../simulationRenderer/earthquakeCommandCenter';
import { setPendingEarthquakeOverlay } from '../simulationRenderer/earthquakeChatBridge';
import { codeCommitHash } from '../build/commitHash';
import { InMemoryHazardProvenanceStore, LocalHazardProvenanceStore } from '../hazard/hazardProvenanceStore';
import { createExperimentProvenance } from './provenance';
import { runExperiment } from './executor';
import { createExperimentIntent, createExperimentPlan, getRouterModel, validateStructuredExperimentRequest } from './router';
import type { ExperimentPlan, ExperimentResult, ExperimentRun, StructuredExperimentRequest } from './types';

export const EVIDENCE_GUIDED_CHAT_VERSION = '1.0.0';

export type EvidenceGuidedPlanStatus = 'READY_FOR_CONFIRMATION' | 'READY_FOR_HYPOTHETICAL_CONFIRMATION' | 'ENGINE_NOT_AVAILABLE' | 'INVALID_REQUEST';

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
  quantumEvidenceCards: readonly QuantumEvidenceCard[];
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

/** Read-only presentation contract: it only re-expresses an already confirmed plan and real run. */
export interface EvidenceGuidedExperimentCapsule {
  contractVersion: string;
  capsuleId: string;
  status: 'CONFIRMED_REAL_RUN';
  planId: string;
  confirmationId: string;
  modelId?: string;
  engine: string;
  modelVersion: string;
  parameters: Readonly<Record<string, string | number | boolean>>;
  seed?: number;
  runId: string;
  runFingerprint: string;
  resultOrigin: ExperimentRun['provenance']['resultOrigin'];
  backendExecution?: ExperimentRun['provenance']['backendExecution'];
  route: ExperimentRun['result']['route'];
  outputs: ExperimentRun['result']['outputs'];
  units: ExperimentRun['result']['units'];
  limitations: readonly string[];
  evidencePack: EvidenceGuidedOutcomeHandoff['evidencePack'];
  counterfactual: EvidenceGuidedOutcomeHandoff['counterfactual'];
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
  if (plan.intent.capability === 'HYPOTHETICAL_VISUALIZATION' && plan.runnable) return 'READY_FOR_HYPOTHETICAL_CONFIRMATION';
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
    resultWillComeFromRealRun: plan.runnable && (intent.capability === 'REAL_ENGINE' || intent.capability === 'BACKEND_REAL_ENGINE'),
    requestedParameters: request.parameters,
    parameterSchema: plan.parameterSchema,
    ...(request.seed === undefined ? {} : { seed: request.seed }),
    route: plan.route,
    rationale: intent.rationale,
    requiredSolver: intent.requiredSolver,
    limitations: limitationsFor(plan),
    knowledgeSources: intent.knowledgeSources,
    quantumEvidenceCards: quantumEvidenceCardsForKnowledge(intent.supplementalKnowledgeIds),
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
export function capsuleFromConfirmedExperiment(confirmed: ConfirmedEvidenceGuidedExperiment): EvidenceGuidedExperimentCapsule {
  const { plan, run, handoff } = confirmed;
  if (run.result.status !== 'completed' || run.provenance.resultOrigin !== 'real-engine') {
    throw new Error('Evidence-Guided Capsule requires a completed real-engine run.');
  }
  return {
    contractVersion: EVIDENCE_GUIDED_CHAT_VERSION,
    capsuleId: `capsule_${fnv1a(canonicalJson({ planId: plan.plan.planId, confirmationId: plan.confirmationId, runFingerprint: run.provenance.runFingerprint }))}`,
    status: 'CONFIRMED_REAL_RUN', planId: plan.plan.planId, confirmationId: plan.confirmationId,
    ...(plan.disclosure.modelId === undefined ? {} : { modelId: plan.disclosure.modelId }),
    engine: plan.disclosure.engine ?? 'unknown-engine', modelVersion: plan.disclosure.modelVersion ?? 'unknown-version',
    parameters: plan.disclosure.requestedParameters,
    ...(plan.disclosure.seed === undefined ? {} : { seed: plan.disclosure.seed }),
    runId: run.runId, runFingerprint: run.provenance.runFingerprint, resultOrigin: run.provenance.resultOrigin,
    ...(run.provenance.backendExecution === undefined ? {} : { backendExecution: run.provenance.backendExecution }),
    route: run.result.route, outputs: run.result.outputs, units: run.result.units,
    limitations: plan.disclosure.limitations, evidencePack: handoff.evidencePack, counterfactual: handoff.counterfactual,
  };
}

export async function confirmEarthquakeEvidenceGuidedExperiment(reviewedPlan: EvidenceGuidedExperimentPlan): Promise<ConfirmedEvidenceGuidedExperiment> {
  const canonicalPlan = planEvidenceGuidedExperiment(reviewedPlan.request);
  if (canonicalJson(canonicalPlan) !== canonicalJson(reviewedPlan)) {
    throw new Error('Evidence-Guided Chat Plan was modified after review; rebuild and present the plan before confirmation.');
  }
  if (canonicalPlan.status !== 'READY_FOR_CONFIRMATION' || canonicalPlan.request.modelId !== 'earthquake-scenario') {
    throw new Error(`Earthquake plan cannot be confirmed: ${canonicalPlan.status}.`);
  }
  const params = canonicalPlan.request.parameters;
  const execution = await executeEarthquakeCommandCenterScenario({
    // Hazard provenance store jest immutable; kolejne kliknięcie tego samego planu musi mieć nowy scenario ID.
    // Same parametry i seed pozostają jawne, a Experiment Fabric fingerprintuje wynik, nie zegar.
    scenarioLabel: `science-chat-${canonicalPlan.confirmationId}-${Date.now()}`,
    magnitude: typeof params.magnitude === 'number' ? params.magnitude : 5.4,
    depthKm: typeof params.depthKm === 'number' ? params.depthKm : 12,
    epicenter: {
      x: typeof params.epicenterX === 'number' ? params.epicenterX : 0,
      y: typeof params.epicenterY === 'number' ? params.epicenterY : 0,
    },
    seed: canonicalPlan.request.seed ?? 42,
  }, { commitHash: codeCommitHash(), store: typeof window === 'undefined' ? new InMemoryHazardProvenanceStore() : new LocalHazardProvenanceStore() });
  if (execution.status === 'READY') setPendingEarthquakeOverlay(execution.overlay);
  const result: ExperimentResult = execution.status === 'READY'
    ? {
        contractVersion: canonicalPlan.request.contractVersion,
        status: 'completed',
        summary: `Earthquake run gotowy: ${execution.scenario.impacts.length} ImpactResult, ${execution.scenario.damageAssessments.length} DamageAssessment, mapowanie City3D i Replay ${execution.replay.status}.`,
        outputs: {
          magnitude: typeof params.magnitude === 'number' ? params.magnitude : 5.4,
          depthKm: typeof params.depthKm === 'number' ? params.depthKm : 12,
          impactCount: execution.scenario.impacts.length,
          damageAssessmentCount: execution.scenario.damageAssessments.length,
          datasetStatus: execution.envelope.datasetStatus,
          replayStatus: execution.replay.status,
          overlayStatus: execution.overlayGate.enabled ? 'ENABLED' : 'BLOCKED',
          structuralDamage: 'NOT_MODELED',
        },
        units: { magnitude: '', depthKm: 'km', impactCount: 'records', damageAssessmentCount: 'records', datasetStatus: '', replayStatus: '', overlayStatus: '', structuralDamage: '' },
        warnings: [...execution.moduleDescriptor.notModeled, 'Wartości są syntetycznym scenariuszem demonstracyjnym; nie są pomiarem ani prognozą.'],
        validity: 'Istniejący Earthquake command center z deterministycznym ImpactResult, DamageAssessment, mapowaniem fixture→CityWorld, Evidence i Replay.',
        assumptions: ['Scenariusz wejściowy jest syntetyczny i jawnie oznaczony SCENARIO.', 'Structural damage pozostaje NOT_MODELED; brak danych nie jest zastępowany estymacją.'],
        visualization: ['world-3d'],
        route: canonicalPlan.plan.route ?? { kind: 'none' },
      }
    : {
        contractVersion: canonicalPlan.request.contractVersion,
        status: 'failed', summary: `Earthquake nie został dopuszczony do City3D: ${execution.blockCode}.`, outputs: { blockCode: execution.blockCode }, units: { blockCode: '' },
        warnings: [execution.blockReason], assumptions: [], visualization: [], route: { kind: 'none' }, validity: 'Envelope Earthquake wymaga spełnienia wszystkich bramek provenance, evidence, replay i derived-layer determinism.',
      };
  const provenance = createExperimentProvenance({ request: canonicalPlan.request, plan: canonicalPlan.plan, result, knowledgeSources: canonicalPlan.plan.intent.knowledgeSources, supplementalKnowledgeIds: canonicalPlan.plan.intent.supplementalKnowledgeIds, deterministic: result.status === 'completed' });
  const run: ExperimentRun = { contractVersion: canonicalPlan.request.contractVersion, runId: provenance.runFingerprint, request: canonicalPlan.request, intent: canonicalPlan.plan.intent, plan: canonicalPlan.plan, result, provenance };
  return {
    contractVersion: EVIDENCE_GUIDED_CHAT_VERSION, plan: canonicalPlan, run,
    handoff: {
      evidencePack: { status: 'PROTOCOL_REQUIRED', reason: execution.status === 'READY' ? `Earthquake envelope zawiera Evidence Pack ${execution.evidence.missingFields.length === 0 ? 'COMPLETE' : 'INCOMPLETE'}; pełny protokół ScientificEvidencePack nadal wymaga prerejestracji.` : 'Brak Evidence Pack, ponieważ envelope został zablokowany.', canonicalRunId: run.runId },
      counterfactual: { status: 'VARIANT_REQUIRED', reason: 'A/B wymaga drugiego jawnie zatwierdzonego scenariusza Earthquake; nie tworzę wariantu automatycznie.', canonicalRunId: run.runId },
    },
  };
}

export function confirmEvidenceGuidedExperiment(reviewedPlan: EvidenceGuidedExperimentPlan): ConfirmedEvidenceGuidedExperiment {
  const canonicalPlan = planEvidenceGuidedExperiment(reviewedPlan.request);
  if (canonicalJson(canonicalPlan) !== canonicalJson(reviewedPlan)) {
    throw new Error('Evidence-Guided Chat Plan was modified after review; rebuild and present the plan before confirmation.');
  }
  if (canonicalPlan.status !== 'READY_FOR_CONFIRMATION' && canonicalPlan.status !== 'READY_FOR_HYPOTHETICAL_CONFIRMATION') {
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
