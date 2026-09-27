import { canonicalJson, fnv1a } from '../events/hash';
import type { DiscoveryCaseRecord } from './discoveryCaseRecord';
import type { ScientificReviewDecision } from './scientificReviewDecision';

/**
 * Conservative, source-bound conclusion of already executed evidence.
 * It is deliberately narrower than a scientific claim: it only reports how a
 * preregistered criterion evaluated within the existing model and protocol.
 */
export const SCIENTIFIC_CONCLUSION_VERSION = '1.0.0';

export type ScientificConclusionStatus =
  | 'OBSERVATION_SUPPORTED_WITHIN_PROTOCOL'
  | 'CRITERION_FALSIFIED_WITHIN_PROTOCOL'
  | 'INCONCLUSIVE'
  | 'BLOCKED_ARTIFACT_MISMATCH'
  | 'BLOCKED_REVIEW_MISMATCH';

export type ScientificConclusionReviewStatus =
  | 'NOT_REVIEWED'
  | 'DECLARED_REVIEW_RECORDED';

export interface ScientificConclusion {
  contractVersion: string;
  conclusionId: string;
  status: ScientificConclusionStatus;
  reviewStatus: ScientificConclusionReviewStatus;
  /** Exact, pre-existing assessment from the shared criterion evaluator. */
  protocolAssessment: DiscoveryCaseRecord['evidence']['assessment']['assessment'];
  statement: string;
  evidenceId: string;
  referenceRunIds: readonly string[];
  provenance: {
    researchPacketFingerprint: string;
    evidenceFingerprint: string;
    candidateFingerprint: string;
    caseFingerprint: string;
    reviewFingerprint?: string;
  };
  limitations: readonly string[];
  conclusionFingerprint: string;
  disclaimer: string;
}

function reviewMatchesCase(record: DiscoveryCaseRecord, review: ScientificReviewDecision): boolean {
  return review.caseId === record.caseId
    && review.caseFingerprint === record.caseFingerprint
    && review.candidateId === record.candidate.candidateId
    && review.candidateFingerprint === record.candidate.selectionFingerprint
    && review.evidenceId === record.evidence.evidenceId
    && review.evidenceFingerprint === record.evidence.provenanceFingerprint;
}

function statusFor(record: DiscoveryCaseRecord, review?: ScientificReviewDecision): ScientificConclusionStatus {
  if (record.status === 'BLOCKED_ARTIFACT_MISMATCH') return 'BLOCKED_ARTIFACT_MISMATCH';
  if (review !== undefined && !reviewMatchesCase(record, review)) return 'BLOCKED_REVIEW_MISMATCH';
  switch (record.evidence.assessment.assessment) {
    case 'SUPPORTED_WITHIN_PROTOCOL':
      return 'OBSERVATION_SUPPORTED_WITHIN_PROTOCOL';
    case 'FALSIFIED_WITHIN_PROTOCOL':
      return 'CRITERION_FALSIFIED_WITHIN_PROTOCOL';
    case 'INCONCLUSIVE':
      return 'INCONCLUSIVE';
    default:
      return 'INCONCLUSIVE';
  }
}

function statementFor(record: DiscoveryCaseRecord, status: ScientificConclusionStatus): string {
  const assessment = record.evidence.assessment;
  switch (status) {
    case 'OBSERVATION_SUPPORTED_WITHIN_PROTOCOL':
      return `W obrębie prerejestrowanego protokołu i istniejącego modelu kryterium było zgodne z realnymi runami. ${assessment.message}`;
    case 'CRITERION_FALSIFIED_WITHIN_PROTOCOL':
      return `W obrębie prerejestrowanego protokołu i istniejącego modelu kryterium nie było zgodne z realnymi runami. ${assessment.message}`;
    case 'INCONCLUSIVE':
      return `Wniosek pozostaje nierozstrzygający w obrębie prerejestrowanego protokołu. ${assessment.message}`;
    case 'BLOCKED_ARTIFACT_MISMATCH':
      return 'Nie można sformułować wniosku: Discovery Case zawiera niezgodne artefakty provenance.';
    case 'BLOCKED_REVIEW_MISMATCH':
      return 'Nie można połączyć decyzji review z tym Discovery Case: fingerprinty case, candidate lub evidence nie są zgodne.';
  }
}

/**
 * Builds an immutable conclusion over existing evidence only. A declared review
 * is recorded as workflow provenance, never as confirmation of scientific truth.
 */
export function concludeScientificDiscovery(
  record: DiscoveryCaseRecord,
  review?: ScientificReviewDecision,
): ScientificConclusion {
  const status = statusFor(record, review);
  const compatibleReview = review !== undefined && reviewMatchesCase(record, review);
  const provenance = {
    researchPacketFingerprint: record.provenance.researchPacketFingerprint,
    evidenceFingerprint: record.provenance.evidenceFingerprint,
    candidateFingerprint: record.provenance.candidateFingerprint,
    caseFingerprint: record.caseFingerprint,
    ...(compatibleReview ? { reviewFingerprint: review.reviewFingerprint } : {}),
  };
  const conclusionFingerprint = `scientific_conclusion_${fnv1a(canonicalJson({
    version: SCIENTIFIC_CONCLUSION_VERSION,
    status,
    protocolAssessment: record.evidence.assessment.assessment,
    evidenceId: record.evidence.evidenceId,
    referenceRunIds: record.evidence.assessment.referenceRunIds,
    provenance,
  }))}`;
  const limitations = [
    'Wniosek jest ograniczony do istniejącego modelu, jego wersji, prerejestrowanych inputów i ukończonych realnych runów Evidence Chain.',
    'Nie jest odkryciem, dowodem prawdziwości hipotezy, dowodem przyczynowości, p-value, przedziałem ufności ani predykcją poza granicami modelu.',
    'Zadeklarowana decyzja review dokumentuje workflow; nie uwierzytelnia reviewer-a i nie potwierdza naukowej prawdy.',
    ...record.evidence.design.hypothesis.declaredAssumptions,
  ];
  return {
    contractVersion: SCIENTIFIC_CONCLUSION_VERSION,
    conclusionId: conclusionFingerprint,
    status,
    reviewStatus: compatibleReview ? 'DECLARED_REVIEW_RECORDED' : 'NOT_REVIEWED',
    protocolAssessment: record.evidence.assessment.assessment,
    statement: statementFor(record, status),
    evidenceId: record.evidence.evidenceId,
    referenceRunIds: record.evidence.assessment.referenceRunIds,
    provenance,
    limitations,
    conclusionFingerprint,
    disclaimer: 'ScientificConclusion jest deterministyczną projekcją istniejącego source-bound Discovery Case. Nie wykonuje modelu, nie tworzy hipotezy, nie wybiera follow-up protocol i nie ogłasza odkrycia.',
  };
}

export function serializeScientificConclusion(conclusion: ScientificConclusion): string {
  return canonicalJson(conclusion);
}

/** Deterministic replay rebuilds only the conclusion; it never executes a model or review workflow. */
export function replayScientificConclusion(
  record: DiscoveryCaseRecord,
  review?: ScientificReviewDecision,
): ScientificConclusion {
  return concludeScientificDiscovery(record, review);
}
