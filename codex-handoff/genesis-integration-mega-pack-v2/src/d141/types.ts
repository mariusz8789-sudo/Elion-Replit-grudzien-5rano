export type EpistemicState =
  | 'KNOWN'
  | 'SUPPORTED'
  | 'INFERRED'
  | 'SIMULATED'
  | 'ASSUMED'
  | 'UNKNOWN'
  | 'CONTRADICTED'
  | 'UNVERIFIED';

export type AuditStatus = 'PASS' | 'PASS_WITH_WARNINGS' | 'FAIL';
export type CapabilityAvailability = 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE' | 'UNKNOWN';
export type GoalStatus = 'ACTIVE' | 'BLOCKED' | 'SATISFIED' | 'ABANDONED';

export interface ProvenanceRef {
  readonly sourceId: string;
  readonly evidenceId?: string;
  readonly version?: string;
  readonly observedAtSimulationTime?: number;
}

export interface KnowledgeClaim {
  readonly claimId: string;
  readonly subject: string;
  readonly predicate: string;
  readonly value: string | number | boolean | null;
  /** State as originally asserted by the caller. Never overwritten in place — see
   * `EffectiveClaim.derivedState` for the CONTRADICTED-aware read view (fix area 3). */
  readonly state: EpistemicState;
  /** Confidence in the representation/source/model, never a declaration of medical/scientific truth. */
  readonly confidence?: number;
  readonly provenance: readonly ProvenanceRef[];
  readonly assumptions?: readonly string[];
  readonly scope?: string;
}

/**
 * V2 fix area 3: `GenesisMetaCognitionEngine.getClaim()`/`snapshot()` return this instead
 * of a bare `KnowledgeClaim`. `state` remains exactly what the caller originally
 * asserted (an honest historical record); `derivedState` is 'CONTRADICTED' whenever the
 * claim currently appears in an active contradiction, computed at read time — never
 * mutated into storage, so the original assertion is never lost.
 */
export interface EffectiveClaim extends KnowledgeClaim {
  readonly derivedState: EpistemicState;
}

export interface KnowledgeGap {
  readonly gapId: string;
  readonly question: string;
  readonly reason: string;
  readonly relatedClaimIds: readonly string[];
  readonly priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  readonly status: 'OPEN' | 'RESOLVED' | 'BLOCKED';
}

export interface ContradictionRecord {
  readonly contradictionId: string;
  readonly subject: string;
  readonly predicate: string;
  readonly claimIds: readonly [string, string];
  readonly values: readonly [KnowledgeClaim['value'], KnowledgeClaim['value']];
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly resolution: 'UNRESOLVED' | 'SOURCE_PRIORITY_REQUIRED' | 'NEW_EXPERIMENT_REQUIRED';
}

export interface CapabilityRecord {
  readonly capabilityId: string;
  readonly availability: CapabilityAvailability;
  readonly provider?: string;
  readonly reason?: string;
  readonly provenance?: readonly ProvenanceRef[];
}

export interface GoalRecord {
  readonly goalId: string;
  readonly description: string;
  readonly status: GoalStatus;
  readonly requiredCapabilities: readonly string[];
  readonly successCriteria: readonly string[];
}

export interface PredictionRecord {
  readonly predictionId: string;
  readonly target: string;
  readonly expected: string | number | boolean | null;
  readonly tolerance?: number;
  readonly modelRef: string;
  readonly provenance: readonly ProvenanceRef[];
}

export interface ObservationRecord {
  readonly observationId: string;
  readonly target: string;
  readonly observed: string | number | boolean | null;
  readonly provenance: readonly ProvenanceRef[];
}

export interface SurpriseRecord {
  readonly surpriseId: string;
  readonly predictionId: string;
  readonly observationId: string;
  readonly kind: 'WITHIN_EXPECTATION' | 'UNEXPECTED' | 'NOT_COMPARABLE';
  readonly normalizedError?: number;
  readonly explanation: string;
}

export interface ExperimentCandidate {
  readonly experimentId: string;
  readonly description: string;
  readonly targetsGapIds: readonly string[];
  readonly targetsContradictionIds: readonly string[];
  /** Caller-supplied estimate in [0,1], not invented by the meta engine. */
  readonly expectedUncertaintyReduction: number;
  /** Caller-supplied normalized cost in [0,1]. */
  readonly normalizedCost: number;
  /** Caller-supplied normalized safety/operational risk in [0,1]. */
  readonly normalizedRisk: number;
  readonly requiredCapabilities: readonly string[];
}

export interface RankedExperiment {
  readonly experiment: ExperimentCandidate;
  readonly score: number;
  readonly blockers: readonly string[];
  readonly rationale: readonly string[];
}


export interface CounterfactualRecord {
  readonly counterfactualId: string;
  readonly kind: 'COUNTERFACTUAL';
  readonly basedOnClaimIds: readonly string[];
  readonly assumptionChanges: Readonly<Record<string, string | number | boolean | null>>;
  readonly predictedConsequences: readonly string[];
  readonly state: 'SIMULATED';
  readonly provenance: readonly ProvenanceRef[];
}

export interface MetaLearningRecord {
  readonly lessonId: string;
  readonly triggerRefs: readonly string[];
  readonly lesson: string;
  readonly proposedPolicyChange?: string;
  readonly status: 'RECORDED' | 'REVIEW_REQUIRED' | 'REJECTED' | 'APPROVED_EXTERNALLY';
}

export interface SelfRepairProposal {
  readonly proposalId: string;
  readonly issue: string;
  readonly proposedChange: string;
  readonly evidenceRefs: readonly string[];
  readonly requiresHumanApproval: true;
  readonly status: 'PROPOSED' | 'APPROVED_EXTERNALLY' | 'REJECTED' | 'APPLIED_BY_EXTERNAL_TOOL';
}

export interface TemporalSelfState {
  readonly sequence: number;
  readonly simulationTimeSeconds?: number;
  readonly campaignCycle?: number;
  readonly activeWorldId?: string;
  readonly activeExperimentId?: string;
  readonly lastEvidenceRef?: string;
}

export interface DecisionTrace {
  readonly traceId: string;
  readonly decision: string;
  readonly inputs: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly assumptions: readonly string[];
  readonly rejectedAlternatives: readonly string[];
  readonly uncertaintyNotes: readonly string[];
  readonly fingerprint: string;
}

export interface SelfModelSnapshot {
  readonly snapshotVersion: 1;
  readonly claims: readonly EffectiveClaim[];
  readonly gaps: readonly KnowledgeGap[];
  readonly contradictions: readonly ContradictionRecord[];
  readonly capabilities: readonly CapabilityRecord[];
  readonly goals: readonly GoalRecord[];
  readonly predictions: readonly PredictionRecord[];
  readonly observations: readonly ObservationRecord[];
  readonly surprises: readonly SurpriseRecord[];
  readonly decisionTraces: readonly DecisionTrace[];
  readonly counterfactuals: readonly CounterfactualRecord[];
  readonly metaLearning: readonly MetaLearningRecord[];
  readonly selfRepairProposals: readonly SelfRepairProposal[];
  readonly temporalState?: TemporalSelfState;
  readonly fingerprint: string;
}

export interface MetaAuditResult {
  readonly status: AuditStatus;
  readonly issues: readonly {
    readonly code: string;
    readonly severity: 'INFO' | 'WARNING' | 'ERROR';
    readonly message: string;
    readonly refs: readonly string[];
  }[];
  readonly snapshotFingerprint: string;
}

export interface MetaEvidenceEvent {
  readonly type:
    | 'META_CLAIM_RECORDED'
    | 'META_GAP_RECORDED'
    | 'META_CONTRADICTION_DETECTED'
    | 'META_PREDICTION_RECORDED'
    | 'META_OBSERVATION_RECORDED'
    | 'META_SURPRISE_RECORDED'
    | 'META_DECISION_TRACE'
    | 'META_COUNTERFACTUAL'
    | 'META_LEARNING_RECORDED'
    | 'META_SELF_REPAIR_PROPOSED'
    | 'META_TEMPORAL_STATE'
    | 'META_AUDIT';
  readonly refId: string;
  readonly fingerprint: string;
  readonly payload: Readonly<Record<string, unknown>>;
}
