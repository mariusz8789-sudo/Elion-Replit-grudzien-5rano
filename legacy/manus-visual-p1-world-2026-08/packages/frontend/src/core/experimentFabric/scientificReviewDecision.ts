import { canonicalJson, fnv1a } from '../events/hash';
import type { DiscoveryCaseRecord } from './discoveryCaseRecord';

/**
 * A source-bound record of a declared human scientific review. The record does
 * not authenticate the reviewer, execute a protocol, or promote a candidate to
 * a discovery. Authentication and persistence belong to a future identity and
 * workflow layer.
 */
export const SCIENTIFIC_REVIEW_DECISION_VERSION = '1.0.0';

export type ScientificReviewDecisionKind =
  | 'ACCEPT_FOR_PREREGISTRATION'
  | 'RETURN_FOR_MORE_EVIDENCE'
  | 'REJECT_CANDIDATE';

export interface ScientificReviewDecisionInput {
  /** An opaque reference supplied by the reviewer; identity is not verified here. */
  reviewerReference: string;
  /** Canonical ISO-8601 instant supplied by the reviewer/workflow. */
  reviewedAt: string;
  decision: ScientificReviewDecisionKind;
  /** Scientific rationale for the declared decision, retained verbatim in provenance. */
  rationale: string;
}

export interface ScientificReviewDecision {
  contractVersion: string;
  reviewId: string;
  decision: ScientificReviewDecisionKind;
  reviewerReference: string;
  reviewedAt: string;
  rationale: string;
  caseId: string;
  caseFingerprint: string;
  candidateId: string;
  candidateFingerprint: string;
  evidenceId: string;
  evidenceFingerprint: string;
  provenance: {
    reviewerIdentity: 'DECLARED_NOT_VERIFIED';
    caseStatusAtReview: 'READY_FOR_REVIEW';
    researchPacketFingerprint: string;
    evidenceFingerprint: string;
    candidateFingerprint: string;
  };
  reviewFingerprint: string;
  disclaimer: string;
}

function requiredText(value: string, field: string, minLength: number, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length < minLength || trimmed.length > maxLength) {
    throw new Error(`[ScientificReviewDecision] '${field}' must contain ${minLength}-${maxLength} non-whitespace characters.`);
  }
  return trimmed;
}

function canonicalIsoInstant(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error('[ScientificReviewDecision] reviewedAt must be a canonical ISO-8601 instant, for example 2026-08-22T00:00:00.000Z.');
  }
  return value;
}

/**
 * Records a declared human review only after compatible source-bound artifacts
 * reached READY_FOR_REVIEW. It does not create a formal follow-up hypothesis;
 * acceptance merely permits a human to separately preregister one.
 */
export function createScientificReviewDecision(
  record: DiscoveryCaseRecord,
  input: ScientificReviewDecisionInput,
): ScientificReviewDecision {
  if (record.status !== 'READY_FOR_REVIEW') {
    throw new Error(`[ScientificReviewDecision] Case '${record.caseId}' has status '${record.status}', not READY_FOR_REVIEW.`);
  }
  const reviewerReference = requiredText(input.reviewerReference, 'reviewerReference', 2, 128);
  const rationale = requiredText(input.rationale, 'rationale', 10, 4000);
  const reviewedAt = canonicalIsoInstant(input.reviewedAt);
  const reviewFingerprint = `scientific_review_${fnv1a(canonicalJson({
    version: SCIENTIFIC_REVIEW_DECISION_VERSION,
    decision: input.decision,
    reviewerReference,
    reviewedAt,
    rationale,
    caseFingerprint: record.caseFingerprint,
    candidateFingerprint: record.candidate.selectionFingerprint,
    evidenceFingerprint: record.evidence.provenanceFingerprint,
  }))}`;

  return {
    contractVersion: SCIENTIFIC_REVIEW_DECISION_VERSION,
    reviewId: reviewFingerprint,
    decision: input.decision,
    reviewerReference,
    reviewedAt,
    rationale,
    caseId: record.caseId,
    caseFingerprint: record.caseFingerprint,
    candidateId: record.candidate.candidateId,
    candidateFingerprint: record.candidate.selectionFingerprint,
    evidenceId: record.evidence.evidenceId,
    evidenceFingerprint: record.evidence.provenanceFingerprint,
    provenance: {
      reviewerIdentity: 'DECLARED_NOT_VERIFIED',
      caseStatusAtReview: 'READY_FOR_REVIEW',
      researchPacketFingerprint: record.provenance.researchPacketFingerprint,
      evidenceFingerprint: record.provenance.evidenceFingerprint,
      candidateFingerprint: record.provenance.candidateFingerprint,
    },
    reviewFingerprint,
    disclaimer: 'Ten rekord dokumentuje zadeklarowaną decyzję ludzkiego review dla zgodnego Discovery Case. Nie uwierzytelnia tożsamości reviewer-a, nie jest zatwierdzeniem prawdziwości hipotezy, nie stanowi odkrycia, nie uruchamia eksperymentu i nie zastępuje niezależnej prerejestracji follow-up protocol.',
  };
}

export function serializeScientificReviewDecision(decision: ScientificReviewDecision): string {
  return canonicalJson(decision);
}

/** Deterministic replay rebuilds only the immutable review record; it never executes a model. */
export function replayScientificReviewDecision(
  record: DiscoveryCaseRecord,
  input: ScientificReviewDecisionInput,
): ScientificReviewDecision {
  return createScientificReviewDecision(record, input);
}
