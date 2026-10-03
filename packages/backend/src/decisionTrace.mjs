/**
 * D-141 DecisionTrace runtime contract for backend-owned canonical events.
 *
 * This is a fingerprinted decision record, not hidden reasoning, a new lifecycle or a store.
 * The owning event (for ResearchRun: NEXT_EXPERIMENT) remains the only persisted state.
 */
import { canonicalJson, fnv1a } from './determinism.mjs';

export const DECISION_TRACE_VERSION = '1.0.0';
const PROHIBITED_SUMMARY_PATTERNS = [
  /\bI (feel|think|believe|am aware)\b/i,
  /\bsentien(t|ce)\b/i,
  /\bconscious(ness)?\b/i,
  /\bself[- ]aware\b/i,
];
const MAX_SUMMARY_LENGTH = 400;

export function assertNoHiddenReasoningOrSentienceClaim(summary) {
  if (typeof summary !== 'string' || !summary.trim()) throw new Error('DECISION_TRACE_REJECTED: summary is required.');
  for (const pattern of PROHIBITED_SUMMARY_PATTERNS) {
    if (pattern.test(summary)) throw new Error(`DECISION_TRACE_REJECTED: prohibited summary pattern ${pattern.source}.`);
  }
  if (summary.length > MAX_SUMMARY_LENGTH) {
    throw new Error(`DECISION_TRACE_REJECTED: summary exceeds ${MAX_SUMMARY_LENGTH} characters.`);
  }
}

function validateAlternatives(alternatives) {
  if (!Array.isArray(alternatives)) throw new Error('DECISION_TRACE_REJECTED: alternatives are required.');
  const selected = alternatives.filter((alternative) => alternative?.status === 'SELECTED');
  if (selected.length > 1) throw new Error('DECISION_TRACE_REJECTED: more than one SELECTED alternative.');
  for (const alternative of alternatives) {
    if (!alternative?.id || !['SELECTED', 'REJECTED', 'NOT_EVALUATED'].includes(alternative.status)) {
      throw new Error('DECISION_TRACE_REJECTED: invalid alternative.');
    }
    if (alternative.status === 'REJECTED' && !alternative.rejectedReasonCode) {
      throw new Error(`DECISION_TRACE_REJECTED: rejected alternative ${alternative.id} has no reason code.`);
    }
  }
}

export function buildDecisionTrace(input) {
  assertNoHiddenReasoningOrSentienceClaim(input?.summary);
  validateAlternatives(input?.alternatives);
  const record = {
    decisionId: input.decisionId,
    summary: input.summary,
    evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs : [],
    alternatives: input.alternatives,
    selectedCapability: input.selectedCapability,
    inputClassification: input.inputClassification,
    outputClassification: input.outputClassification,
    ...(input.solverId ? { solverId: input.solverId } : {}),
    ...(input.solverVersion ? { solverVersion: input.solverVersion } : {}),
    ...(input.blockedReason ? { blockedReason: input.blockedReason } : {}),
    ...(input.suggestedNextExperiment ? { suggestedNextExperiment: input.suggestedNextExperiment } : {}),
  };
  const traceFingerprint = `trace_${fnv1a(canonicalJson(record))}`;
  return Object.freeze({ contractVersion: DECISION_TRACE_VERSION, ...record, traceFingerprint });
}
