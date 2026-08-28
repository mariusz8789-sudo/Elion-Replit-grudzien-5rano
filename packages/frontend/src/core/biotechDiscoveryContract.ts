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

export interface SafetySignal extends BiotechRecord {
  kind: 'safety-signal';
  signalType: 'toxicity' | 'adverse-effect' | 'interaction' | 'uncertainty';
  description: string;
}

export interface BiologicalEvidence extends BiotechRecord {
  kind: 'biological-evidence';
  claim: string;
  subjectIds: readonly string[];
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
