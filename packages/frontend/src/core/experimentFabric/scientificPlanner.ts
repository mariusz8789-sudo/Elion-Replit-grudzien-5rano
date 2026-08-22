import { canonicalJson, fnv1a } from '../events/hash';
import { getKnowledgeDomain, knowledgeSourcesForDomain } from '../knowledge/registry';
import { getRouterModel } from './router';
import { resolveHypothesisKnowledgeReferences } from './scientificHypothesisEvidence';
import { SCIENTIFIC_DISCOVERY_VERSION, type ExperimentArm, type ScientificExperimentDesign, type ScientificExperimentInput, type ScientificHypothesis } from './scientificDiscovery';
import type { ExperimentValue, StructuredExperimentRequest } from './types';

const MAX_VARIANTS = 12;
const MAX_REPETITIONS = 5;

function cloneRequest(request: StructuredExperimentRequest, parameter: string, value: ExperimentValue): StructuredExperimentRequest {
  return { ...request, parameters: { ...request.parameters, [parameter]: value } };
}

function valueKey(value: ExperimentValue): string { return `${typeof value}:${String(value)}`; }

function buildArmId(designSeed: object, suffix: string): string {
  return `arm_${fnv1a(canonicalJson({ designSeed, suffix }))}`;
}

/**
 * Creates a preregistered protocol. Accepts REAL_ENGINE (local synchronous) and
 * BACKEND_REAL_ENGINE (async backend Fabric) models. All other capabilities are
 * rejected so that the Discovery Layer never designs a protocol for a missing
 * solver, a hypothetical visualization, or a knowledge-only domain.
 *
 * For BACKEND_REAL_ENGINE designs, use executeScientificExperimentOnBackend()
 * instead of the synchronous executeScientificExperiment().
 */
export function designScientificExperiment(input: ScientificExperimentInput): ScientificExperimentDesign {
  const { hypothesis, baselineRequest, sweep, replication } = input;
  const domain = getKnowledgeDomain(hypothesis.domainId);
  const routerModel = getRouterModel(hypothesis.modelId);
  const admissibleCapabilities: readonly string[] = ['REAL_ENGINE', 'BACKEND_REAL_ENGINE'];
  if (!domain || !routerModel || !admissibleCapabilities.includes(domain.capability) || !domain.realModels.includes(hypothesis.modelId)) {
    throw new Error('Scientific Discovery Layer can design a protocol only for an existing REAL_ENGINE or BACKEND_REAL_ENGINE registered in Knowledge Registry.');
  }
  if (baselineRequest.domainId !== hypothesis.domainId || baselineRequest.modelId !== hypothesis.modelId) {
    throw new Error('Baseline request must target the same domain and model as the hypothesis.');
  }
  if ((sweep === undefined) === (replication === undefined)) {
    throw new Error('Scientific protocol requires exactly one bounded sweep or one explicit replication arm.');
  }
  if (sweep !== undefined && !domain.parameters.includes(sweep.parameter)) {
    throw new Error(`Parameter '${sweep.parameter}' is not declared by Knowledge Registry for ${hypothesis.domainId}.`);
  }
  if (sweep !== undefined && (sweep.values.length === 0 || sweep.values.length > MAX_VARIANTS)) {
    throw new Error(`Sweep requires 1–${MAX_VARIANTS} predeclared values.`);
  }
  const uniqueValues = sweep === undefined ? [] : [...new Map(sweep.values.map((value) => [valueKey(value), value])).values()];
  if (sweep !== undefined && uniqueValues.length !== sweep.values.length) throw new Error('Sweep values must be unique.');
  if (replication !== undefined && (replication.label.trim().length < 2 || replication.rationale.trim().length < 10)) {
    throw new Error('Replication requires a label and a rationale of at least 10 characters.');
  }
  const repetitions = input.repetitionsPerArm ?? 2;
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > MAX_REPETITIONS) {
    throw new Error(`repetitionsPerArm must be an integer from 1 to ${MAX_REPETITIONS}.`);
  }

  // Resolve existing knowledge before building the immutable protocol fingerprint.
  // The resolver rejects unknown, cross-domain, fictional and scenario-only
  // records; it never generates a source or changes any model capability.
  const knowledgeReferences = resolveHypothesisKnowledgeReferences({
    domainId: hypothesis.domainId,
    modelId: hypothesis.modelId,
    supplementalKnowledgeIds: hypothesis.supplementalKnowledgeIds,
  });
  const seed = {
    version: SCIENTIFIC_DISCOVERY_VERSION,
    hypothesis: {
      statement: hypothesis.statement,
      domainId: hypothesis.domainId,
      modelId: hypothesis.modelId,
      declaredAssumptions: hypothesis.declaredAssumptions,
      falsification: hypothesis.falsification,
      knowledgeReferences,
    },
    baselineRequest, sweep: sweep ?? null, replication: replication ?? null, repetitions,
    positiveControl: input.positiveControl ?? null,
    knowledgeSources: knowledgeSourcesForDomain(hypothesis.domainId),
  };
  const protocolFingerprint = `protocol_${fnv1a(canonicalJson(seed))}`;
  const hypothesisRecord: ScientificHypothesis = {
    contractVersion: SCIENTIFIC_DISCOVERY_VERSION,
    hypothesisId: `hyp_${fnv1a(canonicalJson({ statement: hypothesis.statement, protocolFingerprint }))}`,
    statement: hypothesis.statement,
    modelId: hypothesis.modelId,
    domainId: hypothesis.domainId,
    assessment: 'CANDIDATE',
    knowledgeSources: knowledgeSourcesForDomain(hypothesis.domainId),
    knowledgeReferences,
    declaredAssumptions: [...new Set([...domain.assumptions, ...hypothesis.declaredAssumptions])],
    falsification: hypothesis.falsification,
    disclaimer: 'To kandydat hipotezy w granicach wskazanego modelu. Nie jest odkryciem, dowodem przyczynowym ani predykcją poza zakresem modelu.',
  };

  const arms: ExperimentArm[] = [{
    armId: buildArmId(seed, 'baseline'), label: 'Baseline', kind: 'baseline', request: { ...baselineRequest, parameters: { ...baselineRequest.parameters } },
    expectedRole: 'Punkt odniesienia. Wynik nie jest z góry zakładany.',
  }];
  if (sweep !== undefined) {
    for (const value of uniqueValues) {
      const isBaselineValue = valueKey(value) === valueKey(baselineRequest.parameters[sweep.parameter] ?? 'undefined');
      if (isBaselineValue) continue;
      arms.push({
        armId: buildArmId(seed, `variant:${valueKey(value)}`), label: `${sweep.label}: ${String(value)}`, kind: 'variant',
        request: cloneRequest(baselineRequest, sweep.parameter, value),
        expectedRole: `Jedna predeclared zmiana: ${sweep.parameter}=${String(value)}.`,
      });
    }
    if (arms.length < 2) throw new Error('At least one sweep value must differ from the baseline parameter.');
  } else if (replication !== undefined) {
    arms.push({
      armId: buildArmId(seed, 'replication'), label: replication.label.trim(), kind: 'replication',
      request: { ...baselineRequest, parameters: { ...baselineRequest.parameters } },
      expectedRole: `Świeża prerejestrowana replikacja identycznego requestu. ${replication.rationale.trim()}`,
    });
  }
  if (input.positiveControl) {
    if (input.positiveControl.request.domainId !== hypothesis.domainId || input.positiveControl.request.modelId !== hypothesis.modelId) {
      throw new Error('Positive control must target the same domain and model.');
    }
    arms.push({ ...input.positiveControl, armId: buildArmId(seed, 'positive-control'), kind: 'positive-control' });
  }

  return {
    contractVersion: SCIENTIFIC_DISCOVERY_VERSION,
    designId: `design_${fnv1a(canonicalJson({ protocolFingerprint, arms: arms.map((arm) => ({ armId: arm.armId, kind: arm.kind, request: arm.request })) }))}`,
    hypothesis: hypothesisRecord,
    primaryMetric: hypothesis.falsification.metric,
    arms,
    repetitionsPerArm: repetitions,
    protocolAssumptions: [
      'Każdy arm jest wykonany przez istniejący Experiment Router.',
      'Kontrola i warianty są predeclared przed odczytaniem wyników.',
      'Powtórzenia korzystają z identycznego requestu; dla modeli deterministycznych oczekiwany jest zgodny wynik.',
      ...(replication === undefined ? [] : ['Arm replikacji nie jest wariantem parametru ani dodatkowym solver inputem; sprawdza wyłącznie świeżą odtwarzalność identycznego requestu.']),
    ],
    protocolFingerprint,
  };
}
