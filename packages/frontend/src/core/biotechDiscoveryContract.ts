import { canonicalJson, fnv1a } from './events/hash';

/** Epistemic status is explicit; prediction and inference never become facts. */
export type BiotechEpistemicStatus =
  | 'FACT'
  | 'OBSERVED'
  | 'LITERATURE_SUPPORTED'
  | 'PREDICTION'
  | 'INFERENCE'
  | 'HYPOTHESIS'
  | 'UNKNOWN'
  | 'BLOCKED';

export type BiotechRecordKind =
  | 'natural-material'
  | 'compound'
  | 'biological-target'
  | 'mechanism'
  | 'safety-signal'
  | 'biological-evidence'
  | 'therapeutic-candidate'
  | 'therapeutic-hypothesis';

export interface BiotechIdentity {
  kind: BiotechRecordKind;
  /** Stable local or external identifier; no timestamp or runtime id. */
  id: string;
  namespace: string;
}

export interface BiotechProvenance {
  source: string;
  sourceId: string;
  evidenceType: string;
  status: BiotechEpistemicStatus;
  uncertainty?: string;
  sourceUrl?: string;
  sourceVersion?: string;
  retrievedAt?: string;
}

export interface BiotechRecord extends BiotechIdentity {
  label: string;
  status: BiotechEpistemicStatus;
  provenance: readonly BiotechProvenance[];
}

export interface NaturalMaterial extends BiotechRecord {
  kind: 'natural-material';
  sourceDescription: string;
}

export interface Compound extends BiotechRecord {
  kind: 'compound';
  structureRef?: string;
  parentMaterialIds: readonly string[];
}

export interface TherapeuticCandidate extends BiotechRecord {
  kind: 'therapeutic-candidate';
  materialId: string;
  compoundIds: readonly string[];
  targetIds: readonly string[];
  mechanismIds: readonly string[];
  supportingEvidenceIds: readonly string[];
  safetySignalIds: readonly string[];
  hypothesisIds: readonly string[];
}

export interface BiologicalTarget extends BiotechRecord {
  kind: 'biological-target';
  targetType: string;
}

export interface Mechanism extends BiotechRecord {
  kind: 'mechanism';
  targetIds: readonly string[];
  description: string;
}

export type SafetyEvidenceQuality = 'UNKNOWN' | 'LOW' | 'MODERATE' | 'HIGH';

export interface SafetySignal extends BiotechRecord {
  kind: 'safety-signal';
  signalType: 'toxicity' | 'adverse-effect' | 'interaction' | 'uncertainty';
  description: string;
  evidenceQuality: SafetyEvidenceQuality;
  uncertainty: string;
}

export interface BiologicalEvidence extends BiotechRecord {
  kind: 'biological-evidence';
  claim: string;
  subjectIds: readonly string[];
}

export type CandidateRankingStatus = 'UNKNOWN' | 'PREDICTION';
export type CandidateEvidenceQuality = 'UNKNOWN' | 'LOW' | 'MODERATE' | 'HIGH';

export interface CandidateRanking {
  candidateId: string;
  score: number;
  components: {
    evidenceQuality: number;
    targetRelevance: number;
    safetyPenalty: number;
    uncertaintyPenalty: number;
  };
  rationale: string;
  uncertainty: string;
  epistemicStatus: CandidateRankingStatus;
}

export function rankTherapeuticCandidate(input: {
  candidate: TherapeuticCandidate;
  evidenceQuality: CandidateEvidenceQuality;
  targetRelevance: number;
  safetySignals: readonly SafetySignal[];
  uncertaintyPenalty: number;
}): CandidateRanking {
  if (!Number.isFinite(input.targetRelevance) || input.targetRelevance < 0 || input.targetRelevance > 1) throw new Error('Target relevance musi być w zakresie 0..1.');
  if (!Number.isFinite(input.uncertaintyPenalty) || input.uncertaintyPenalty < 0 || input.uncertaintyPenalty > 1) throw new Error('Uncertainty penalty musi być w zakresie 0..1.');
  const evidenceQuality = { UNKNOWN: 0, LOW: 0.33, MODERATE: 0.66, HIGH: 1 }[input.evidenceQuality];
  const safetyPenalty = Math.min(1, input.safetySignals.length / Math.max(1, input.candidate.safetySignalIds.length));
  const components = { evidenceQuality, targetRelevance: input.targetRelevance, safetyPenalty, uncertaintyPenalty: input.uncertaintyPenalty };
  const score = Number((0.4 * evidenceQuality + 0.3 * input.targetRelevance - 0.2 * safetyPenalty - 0.1 * input.uncertaintyPenalty).toFixed(4));
  return {
    candidateId: input.candidate.id, score, components,
    rationale: 'Deterministic research-priority heuristic: evidence and target relevance increase priority; safety signals and uncertainty reduce it. Score is not efficacy or probability.',
    uncertainty: 'No clinical efficacy or safety conclusion; source quality and target relevance require independent evidence.', epistemicStatus: 'PREDICTION',
  };
}

export interface CandidateDiscoveryReport {
  reportId: string;
  candidateId: string;
  materialId: string;
  compoundIds: readonly string[];
  targetIds: readonly string[];
  mechanismIds: readonly string[];
  evidenceIds: readonly string[];
  safetySignalIds: readonly string[];
  hypothesisId: string;
  experimentRequestId?: string;
  ranking?: CandidateRanking;
  epistemicStatus: BiotechEpistemicStatus;
  uncertainty: string;
  provenance: readonly BiotechProvenance[];
  scientificFingerprint: string;
}

export function createCandidateDiscoveryReport(input: {
  candidate: TherapeuticCandidate;
  hypothesis: TherapeuticHypothesis;
  experimentRequest?: BiologicalExperimentRequest;
  ranking?: CandidateRanking;
  uncertainty: string;
}): CandidateDiscoveryReport {
  if (input.hypothesis.candidateId !== input.candidate.id) throw new Error('Raport wymaga zgodności candidateId i hypothesis.candidateId.');
  if (!input.uncertainty.trim()) throw new Error('Raport wymaga jawnej niepewności.');
  const report = {
    candidateId: input.candidate.id,
    materialId: input.candidate.materialId,
    compoundIds: input.candidate.compoundIds,
    targetIds: input.candidate.targetIds,
    mechanismIds: input.candidate.mechanismIds,
    evidenceIds: input.hypothesis.supportingEvidenceIds,
    safetySignalIds: input.hypothesis.safetySignalIds,
    hypothesisId: input.hypothesis.id,
    ...(input.experimentRequest === undefined ? {} : { experimentRequestId: input.experimentRequest.requestId }),
    ...(input.ranking === undefined ? {} : { ranking: input.ranking }),
    epistemicStatus: input.hypothesis.status,
    uncertainty: input.uncertainty,
  };
  const scientificFingerprint = fnv1a(canonicalJson(report));
  return { ...report, reportId: `report:${scientificFingerprint}`, provenance: [...input.candidate.provenance, ...input.hypothesis.provenance], scientificFingerprint };
}

export type BiologicalExperimentRequestStatus = 'NOT_EXECUTED' | 'BLOCKED';

export interface BiologicalExperimentRequest {
  requestId: string;
  hypothesisId: string;
  candidateId: string;
  targetIds: readonly string[];
  researchQuestion: string;
  primaryMetric: string;
  constraints: Readonly<Record<string, string | number | boolean>>;
  status: BiologicalExperimentRequestStatus;
  blockedReason?: string;
}

export function biologicalExperimentRequestFingerprint(request: Omit<BiologicalExperimentRequest, 'requestId' | 'status' | 'blockedReason'>): string {
  return fnv1a(canonicalJson(request));
}

export interface TherapeuticHypothesis extends BiotechRecord {
  kind: 'therapeutic-hypothesis';
  claim: string;
  candidateId: string;
  targetIds: readonly string[];
  mechanismIds: readonly string[];
  supportingEvidenceIds: readonly string[];
  safetySignalIds: readonly string[];
}

/**
 * Stable scientific fingerprint. It intentionally excludes timestamps,
 * backend run ids and volatile execution metadata, while including the full
 * scientific record so a changed claim/status/provenance is detectable.
 */
export function biotechScientificFingerprint(record: BiotechRecord): string {
  return fnv1a(canonicalJson(record));
}

export function isPredictiveBiotechStatus(status: BiotechEpistemicStatus): boolean {
  return status === 'PREDICTION' || status === 'INFERENCE' || status === 'HYPOTHESIS';
}
