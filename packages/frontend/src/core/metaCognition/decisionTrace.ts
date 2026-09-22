import { canonicalJson, fnv1a } from '../events/hash';

/**
 * D-141 DECISION TRACE (Work Item 3).
 *
 * A structured, replayable record of ONE routing/selection decision — never a persisted
 * MetaMemory, never hidden chain-of-thought, never a sentience/consciousness claim. Pure
 * builder function; the caller owns storage (or does not store it at all).
 */
export const DECISION_TRACE_VERSION = '1.0.0';

export interface DecisionEvidenceRef {
  readonly id: string;
  readonly contentHash: string;
}

export type DecisionAlternativeStatus = 'SELECTED' | 'REJECTED' | 'NOT_EVALUATED';

export interface DecisionAlternative {
  readonly id: string;
  readonly status: DecisionAlternativeStatus;
  /** Required when status is REJECTED — a short machine-checkable code, e.g. "UNAVAILABLE", "OUT_OF_SCOPE", never free prose. */
  readonly rejectedReasonCode?: string;
}

export interface DecisionTraceInput {
  readonly decisionId: string;
  /** One-line structured summary of WHAT was decided — never a reasoning transcript. Validated by `assertNoHiddenReasoningOrSentienceClaim`. */
  readonly summary: string;
  readonly evidenceRefs: readonly DecisionEvidenceRef[];
  readonly alternatives: readonly DecisionAlternative[];
  readonly selectedCapability: string;
  /** Epistemic classification of what went INTO the decision (e.g. a ModelResultKind, an EpistemicStatus label already used elsewhere in this repo — this module does not define a new taxonomy). */
  readonly inputClassification: string;
  /** Epistemic classification of what came OUT of it. Same reuse note as `inputClassification`. */
  readonly outputClassification: string;
  readonly solverId?: string;
  readonly solverVersion?: string;
  /** Present only when the decision resolved to BLOCKED. */
  readonly blockedReason?: string;
  readonly suggestedNextExperiment?: string;
}

export interface DecisionTrace extends DecisionTraceInput {
  readonly contractVersion: string;
  readonly traceFingerprint: string;
}

const PROHIBITED_SUMMARY_PATTERNS: readonly RegExp[] = [
  /\bI (feel|think|believe|am aware)\b/i,
  /\bsentien(t|ce)\b/i,
  /\bconscious(ness)?\b/i,
  /\bself[- ]aware\b/i,
];

const MAX_SUMMARY_LENGTH = 400;

/**
 * Refuses to build a trace whose summary reads like private reasoning prose or claims
 * sentience/consciousness. A `DecisionTrace` is a structured decision record — id, evidence,
 * alternatives, classification — never a diary entry. The length cap keeps `summary` a
 * genuine one-line label, not an accumulated chain-of-thought dump.
 */
export function assertNoHiddenReasoningOrSentienceClaim(summary: string): void {
  for (const pattern of PROHIBITED_SUMMARY_PATTERNS) {
    if (pattern.test(summary)) {
      throw new Error(`DECISION_TRACE_REJECTED: summary zawiera zabronioną frazę (wzorzec: ${pattern.source}).`);
    }
  }
  if (summary.length > MAX_SUMMARY_LENGTH) {
    throw new Error(
      `DECISION_TRACE_REJECTED: summary (${summary.length} znaków) przekracza limit ${MAX_SUMMARY_LENGTH} — to ma być strukturalne podsumowanie, nie ukryty ciąg rozumowania.`,
    );
  }
}

function validateAlternatives(alternatives: readonly DecisionAlternative[]): void {
  const selected = alternatives.filter((a) => a.status === 'SELECTED');
  if (selected.length > 1) {
    throw new Error('DECISION_TRACE_REJECTED: więcej niż jedna alternatywa oznaczona jako SELECTED.');
  }
  for (const alt of alternatives) {
    if (alt.status === 'REJECTED' && !alt.rejectedReasonCode) {
      throw new Error(`DECISION_TRACE_REJECTED: alternatywa "${alt.id}" ma status REJECTED bez rejectedReasonCode.`);
    }
  }
}

/**
 * Builds one immutable, fingerprinted `DecisionTrace`. Throws (never silently truncates or
 * rewrites) when the summary would carry hidden reasoning/a sentience claim, or when the
 * alternatives list is internally inconsistent (more than one SELECTED, or a REJECTED entry
 * with no reason code).
 */
export function buildDecisionTrace(input: DecisionTraceInput): DecisionTrace {
  assertNoHiddenReasoningOrSentienceClaim(input.summary);
  validateAlternatives(input.alternatives);
  const traceFingerprint = `trace_${fnv1a(canonicalJson({ ...input }))}`;
  return { contractVersion: DECISION_TRACE_VERSION, ...input, traceFingerprint };
}
