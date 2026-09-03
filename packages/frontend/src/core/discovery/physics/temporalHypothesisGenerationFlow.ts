/**
 * TEMPORAL HYPOTHESIS GENERATION FLOW — the full unseen-question loop.
 *
 * Wires the question through STRUCTURED REQUEST -> GENERATION (both
 * strategies) -> NEXT ACTION -> EVIDENCE/MEMORY -> REPLAY, reusing every
 * piece unchanged:
 *
 *   parseNaturalLanguageScientificRequest   (unchanged)
 *   generateSpacetimeHypotheses             (unchanged, constraint combination)
 *   generatePhysicsModelCandidates          (unchanged, equation transformation + real falsification)
 *   buildNextScientificAction               (unchanged)
 *   saveExperiment (via each generator's own save function)
 *
 * This is the smallest orchestration that proves the 10-point unseen-
 * question requirement end to end without inventing a third generation
 * strategy or a third memory/replay mechanism.
 */
import {
  parseNaturalLanguageScientificRequest,
  type StructuredScientificRequest,
} from '../molecular/naturalLanguageScientificRequest';
import {
  generateSpacetimeHypotheses,
  replayGeneratedSpacetimeHypotheses,
  saveGeneratedSpacetimeHypothesesToMemory,
  type GeneratedSpacetimeHypothesesResult,
} from './generatedSpacetimeHypotheses';
import {
  generatePhysicsModelCandidates,
  replayGeneratedPhysicsModelCandidates,
  saveGeneratedPhysicsModelCandidatesToMemory,
  type GeneratedPhysicsModelCandidatesResult,
} from './generatedPhysicsModelCandidates';
import { buildNextScientificAction, type NextScientificAction } from '../nextScientificAction';
import type { GeneratedHypothesis, HypothesisGenerationReplay } from '../hypothesisGeneration';
import type { SavedExperiment } from '../../scienceMemory';

export const TEMPORAL_HYPOTHESIS_GENERATION_FLOW_VERSION = '1.0.0';

export interface TemporalHypothesisGenerationFlowResult {
  contractVersion: string;
  structuredRequest: StructuredScientificRequest;
  temporalGeneration: GeneratedSpacetimeHypothesesResult;
  physicsGeneration: GeneratedPhysicsModelCandidatesResult;
  nextActions: readonly NextScientificAction[];
}

function nextActionForCandidate(candidate: GeneratedHypothesis): NextScientificAction {
  return buildNextScientificAction({
    actionId: `${candidate.hypothesisId}:next`,
    question: `Does further work support, weaken, or resolve: ${candidate.statement}`,
    targetHypothesisIds: [candidate.hypothesisId],
    requiredInputs: [...candidate.dependencyIds, 'additional-analysis'],
    availableInputs: [...candidate.dependencyIds],
    method: candidate.requiredComputation.length > 0 ? candidate.requiredComputation.join('; ') : 'Not specified by this generated candidate.',
    expectedDiscriminatingPower: candidate.verdict === 'UNRESOLVED' ? 'HIGH' : candidate.verdict === 'WEAKENED' ? 'MODERATE' : 'LOW',
    discriminatingPowerReasoning: `This candidate's current verdict is ${candidate.verdict ?? 'PENDING'}. ${candidate.verdictReasoning ?? ''}`,
    constraints: candidate.requiredData,
    expectedOutputs: [candidate.expectedPrediction],
    successCriteria: candidate.expectedPrediction,
    falsificationCriteria: candidate.falsificationCriteria,
    availability: 'REQUIRES_THEORETICAL_ADVANCE',
    estimatedBurden: 'UNKNOWN',
    burdenReasoning: 'Genesis has no basis to estimate cost, duration, or feasibility for resolving a generated candidate further.',
  });
}

/**
 * Runs both generation strategies for one question and produces a
 * NextScientificAction for every candidate that is not already a settled
 * SUPPORTED/BLOCKED result — an UNRESOLVED or WEAKENED candidate genuinely
 * needs a next step; so, honestly, does understanding WHY a generated
 * model was FALSIFIED.
 */
export function runTemporalHypothesisGenerationFlow(question: string, requestId: string): TemporalHypothesisGenerationFlowResult {
  const structuredRequest = parseNaturalLanguageScientificRequest(question, requestId);
  const temporalGeneration = generateSpacetimeHypotheses(question);
  const physicsGeneration = generatePhysicsModelCandidates();

  const needsNextAction: readonly GeneratedHypothesis[] = [
    ...temporalGeneration.candidates.filter((c) => c.verdict === 'UNRESOLVED' || c.verdict === 'WEAKENED'),
    ...physicsGeneration.candidates.filter((c) => c.verdict === 'FALSIFIED'),
  ];

  return {
    contractVersion: TEMPORAL_HYPOTHESIS_GENERATION_FLOW_VERSION,
    structuredRequest,
    temporalGeneration,
    physicsGeneration,
    nextActions: needsNextAction.map(nextActionForCandidate),
  };
}

export interface TemporalHypothesisGenerationFlowReplay {
  status: HypothesisGenerationReplay['status'];
  reason: string;
}

export function replayTemporalHypothesisGenerationFlow(saved: TemporalHypothesisGenerationFlowResult): TemporalHypothesisGenerationFlowReplay {
  const reparsed = parseNaturalLanguageScientificRequest(saved.structuredRequest.rawText, saved.structuredRequest.requestId);
  if (JSON.stringify(reparsed) !== JSON.stringify(saved.structuredRequest)) {
    return { status: 'DRIFT', reason: 'Re-parsing the same raw text produced a different structured request.' };
  }

  const temporalReplay = replayGeneratedSpacetimeHypotheses(saved.temporalGeneration);
  if (temporalReplay.status !== 'MATCH') {
    return { status: temporalReplay.status, reason: `Temporal generation: ${temporalReplay.reason}` };
  }

  const physicsReplay = replayGeneratedPhysicsModelCandidates(saved.physicsGeneration);
  if (physicsReplay.status !== 'MATCH') {
    return { status: physicsReplay.status, reason: `Physics generation: ${physicsReplay.reason}` };
  }

  return { status: 'MATCH', reason: '' };
}

export interface TemporalHypothesisGenerationFlowMemory {
  temporal: SavedExperiment;
  physics: SavedExperiment;
}

/**
 * Two distinct memory entries, one per generation strategy — the same
 * granularity every other flow in this engine uses (a flow-level save
 * layered on top of, not replacing, each component's own save).
 */
export function saveTemporalHypothesisGenerationFlowToMemory(result: TemporalHypothesisGenerationFlowResult): TemporalHypothesisGenerationFlowMemory {
  return {
    temporal: saveGeneratedSpacetimeHypothesesToMemory(result.temporalGeneration),
    physics: saveGeneratedPhysicsModelCandidatesToMemory(result.physicsGeneration),
  };
}
