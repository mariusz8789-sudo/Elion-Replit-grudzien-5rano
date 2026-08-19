import { canonicalJson, fnv1a } from '../events/hash';
import { getRouterModel } from './router';
import type { CrossDomainLink } from './scientificDiscovery';
import type { ExperimentRun, ExperimentValue, StructuredExperimentRequest } from './types';

export const ORCHESTRATION_CONTRACT_VERSION = '1.0.0';

export type CrossDomainPlanStatus = 'READY_FOR_REAL_EXECUTION' | 'BLOCKED_SOURCE_RUN' | 'BLOCKED_OUTPUT' | 'BLOCKED_TARGET' | 'BLOCKED_UNITS' | 'BLOCKED_TRANSFORM';

export interface CrossDomainOrchestrationPlan {
  contractVersion: string;
  planId: string;
  link: CrossDomainLink;
  sourceRunId: string;
  targetRequest: StructuredExperimentRequest;
  derivedRequest?: StructuredExperimentRequest;
  status: CrossDomainPlanStatus;
  reason: string;
}

/**
 * The only currently approved cross-domain transfer. `equilibriumTempK` is an
 * existing output in K and `temperatureK` is an existing Arrhenius input in K.
 * It is a parameter hand-off, not a claim that the atmospheric model predicts
 * a real laboratory reaction condition.
 */
export const ATMOSPHERIC_TEMPERATURE_TO_ARRHENIUS_LINK: CrossDomainLink = {
  fromDomainId: 'universe',
  toDomainId: 'chemistry',
  outputKey: 'equilibriumTempK',
  targetParameter: 'temperatureK',
  transform: 'identity-only',
  status: 'NOT_WIRED',
  reason: 'Jawny transfer T_eq [K] do temperatury Arrheniusa [K]; oba modele są realnymi, ograniczonymi solverami Fabric.',
};

function planId(link: CrossDomainLink, sourceRun: ExperimentRun, targetRequest: StructuredExperimentRequest): string {
  return `cascade_${fnv1a(canonicalJson({ link, source: sourceRun.provenance.runFingerprint, target: targetRequest }))}`;
}

/**
 * Validates a potential cascade without executing a secondary model. Only an
 * explicit identity mapping with matching declared units can become READY.
 */
export function planCrossDomainOrchestration(
  link: CrossDomainLink,
  sourceRun: ExperimentRun,
  targetRequest: StructuredExperimentRequest,
): CrossDomainOrchestrationPlan {
  const base = { contractVersion: ORCHESTRATION_CONTRACT_VERSION, planId: planId(link, sourceRun, targetRequest), link, sourceRunId: sourceRun.runId, targetRequest };
  if (link.status !== 'NOT_WIRED') return { ...base, status: 'BLOCKED_TRANSFORM', reason: link.reason };
  if (link.transform !== 'identity-only') return { ...base, status: 'BLOCKED_TRANSFORM', reason: 'Genesis nie wykonuje niejawnych transformacji między domenami.' };
  if (sourceRun.result.status !== 'completed' || sourceRun.provenance.resultOrigin !== 'real-engine') {
    return { ...base, status: 'BLOCKED_SOURCE_RUN', reason: 'Źródłowy run nie jest ukończonym wynikiem realnego engine.' };
  }
  const value = sourceRun.result.outputs[link.outputKey];
  const unit = sourceRun.result.units[link.outputKey];
  if (typeof value !== 'number' || !Number.isFinite(value) || !unit) {
    return { ...base, status: 'BLOCKED_OUTPUT', reason: `Źródłowy output ${link.outputKey} nie jest skończoną wartością numeryczną z jednostką.` };
  }
  const targetModel = targetRequest.modelId ? getRouterModel(targetRequest.modelId) : undefined;
  const targetParameter = targetModel?.parameters.find((parameter) => parameter.id === link.targetParameter);
  if (!targetModel || !targetParameter) {
    return { ...base, status: 'BLOCKED_TARGET', reason: `Docelowy adapter lub parametr ${link.targetParameter} nie jest zarejestrowany.` };
  }
  if (targetParameter.type !== 'number' || targetParameter.unit !== unit) {
    return { ...base, status: 'BLOCKED_UNITS', reason: `Jednostki nie są zgodne: ${unit} → ${targetParameter.unit || '(brak)'}. Wymagany jest osobny, zwalidowany transform.` };
  }
  const derivedRequest: StructuredExperimentRequest = {
    ...targetRequest,
    parameters: { ...targetRequest.parameters, [link.targetParameter]: value as ExperimentValue },
  };
  return { ...base, derivedRequest, status: 'READY_FOR_REAL_EXECUTION', reason: 'Jawny transfer identity-only między zgodnymi jednostkami. Wykonanie docelowego modelu wymaga osobnego wywołania Experiment Fabric.' };
}

/**
 * Prepares the reviewed Universe → Chemistry hand-off. The caller retains the
 * target request and must explicitly execute the derived request through the
 * established Experiment Fabric flow.
 */
export function planAtmosphericTemperatureToArrhenius(
  sourceRun: ExperimentRun,
  targetRequest: StructuredExperimentRequest,
): CrossDomainOrchestrationPlan {
  return planCrossDomainOrchestration(ATMOSPHERIC_TEMPERATURE_TO_ARRHENIUS_LINK, sourceRun, targetRequest);
}
