/**
 * FIX (red-team finding): `CONFLICTING_EVIDENCE` is restored as a first-class status —
 * V1 had no such member, so conflicting evidence was silently folded into the same
 * undifferentiated `reasons[]` array as insufficient-evidence or a safety veto,
 * collapsing a state this project's established design treated as distinguishable
 * (worth routing to human review, not auto-rejecting). See `evidenceGate.ts` and
 * `pipeline.ts` for where it's now actually assigned.
 */
export type CandidateStatus =
  | "INGESTED"
  | "RETAINED"
  | "REJECTED"
  | "BLOCKED"
  | "FALSIFIED"
  | "CONFLICTING_EVIDENCE"
  | "RESEARCH_PRIORITY";

export type EvidenceClass =
  | "IDENTITY_ONLY"
  | "COMPUTATIONAL_MODEL"
  | "EXTERNAL_DATABASE"
  | "EXPERIMENTAL_PRECLINICAL"
  | "CLINICAL"
  | "UNKNOWN";

export interface ProvenanceRef {
  source: string;
  sourceId: string;
  version?: string;
  retrievedAt?: string;
  hash?: string;
}

export interface CompoundIdentity {
  candidateId: string;
  canonicalSmiles: string;
  inchiKey?: string;
  formula?: string;
  molecularWeight?: number;
  provenance: ProvenanceRef[];
}

export interface CandidateEvidence {
  id: string;
  candidateId: string;
  class: EvidenceClass;
  strength: number;
  independentSourceId: string;
  supports: string[];
  conflicts: string[];
  provenance: ProvenanceRef[];
}

export interface SafetySignal {
  id: string;
  candidateId: string;
  kind: string;
  severity: 0 | 1 | 2 | 3;
  evidenceRefIds: string[];
}

export interface ComputeResult {
  candidateId: string;
  engineId: string;
  stage: "CHEAP" | "DOCKING" | "QM" | "ADMET";
  status: "COMPLETED" | "BLOCKED" | "FAILED";
  outputs: Record<string, number | string | boolean | null>;
  provenance: ProvenanceRef[];
}

export interface CandidateRecord {
  identity: CompoundIdentity;
  status: CandidateStatus;
  evidence: CandidateEvidence[];
  safetySignals: SafetySignal[];
  compute: ComputeResult[];
  objectiveVector: Record<string, number>;
  rationale: string[];
}

export interface ResearchGateDecision {
  candidateId: string;
  pass: boolean;
  /** FIX: explicit, machine-checkable signal distinguishing "rejected because of a
   * conflict" from every other rejection reason — never infer this by string-matching
   * `reasons`. */
  conflicting: boolean;
  reasons: string[];
  label: "RESEARCH_ONLY_NOT_EFFICACY";
}
