import type { Objective, Verdict, WinnerRecordRef } from '../orchestrator/contracts';
import type { EvidenceClass } from '../agent/evidenceProvenance';

/**
 * D-062 DISCOVERY CHALLENGE — contracts.
 *
 * Authored from `docs/QWEN-A2-DISCOVERY-CHALLENGE-BRIEF.md` (Qwen's delivery,
 * confronted with the real repo and corrected — docs/DECISIONS.md D-062).
 *
 * ZERO NEW SCIENCE. This module holds shapes only. Every decision-making
 * function this challenge calls is imported, unmodified, from an existing
 * Genesis module through the thin `A2DomainPorts` seam below (real wiring:
 * `orchestrator/d062Ports.ts`) — no second ranking, adjudication,
 * falsification or recipe engine.
 */

export type LineageClass = 'A_BASELINE' | 'B_RETRIEVED' | 'C_INITIAL_SPACE' | 'D_MUTATED' | 'E_NEW_MECHANISM' | 'F_SYMBOLIC';

export interface BaselineRecord {
  readonly baselineId: string;
  readonly label: string;
  readonly source: string;
  readonly provenanceRefs: readonly string[];
  readonly evidenceClass: EvidenceClass;
  readonly knownOutcomeMetrics: Readonly<Record<string, number>>;
  readonly applicabilityConditions: readonly string[];
  readonly fingerprint: string;
}

export interface BetterRule {
  readonly efficacyRelation: '>=';
  readonly harmRelation: '<';
  readonly minObservations: number;
  readonly minStrong: number;
  readonly safetyConditions: readonly string[];
  readonly metricNames: readonly string[];
  /** Preregistration fingerprints this rule's numeric terms are inherited from — never re-tuned here. */
  readonly inheritedFrom: readonly string[];
}

/** The minimal shape every candidate in this challenge carries, whatever its lineage. */
export interface A2CandidateLike {
  readonly candidateId: string;
  readonly label: string;
  readonly mechanism: string;
  readonly efficacy: number;
  readonly harm: number;
  readonly evidenceRefs: readonly string[];
  readonly evidenceClass: EvidenceClass;
  readonly observationCount: number;
}

export interface ChallengeCandidate extends A2CandidateLike {
  readonly lineage: LineageClass;
  readonly hypothesisRef: string | null;
  readonly modelFingerprint: string | null;
  readonly predictionRefs: readonly string[];
  readonly falsificationCriterionRef: string | null;
  readonly candidateFingerprint: string;
}

export interface BeliefUpdateRec {
  readonly hypothesisId: string;
  readonly before: number;
  readonly after: number;
  readonly assessment: string;
  readonly reason: string;
}

export interface RoundRecord {
  readonly round: number;
  readonly poolFingerprints: readonly string[];
  readonly excludedFingerprints: readonly string[];
  readonly experimentLabels: readonly string[];
  readonly survivors: readonly string[];
  readonly falsified: readonly string[];
  readonly beliefUpdates: readonly BeliefUpdateRec[];
  readonly nextDirection: string;
  readonly roundFingerprint: string;
}

export interface FalsificationReport {
  readonly survived: readonly boolean[];
  readonly executedProbes: number;
  readonly availableProbes: number;
  readonly unavailableReason: string;
}

export interface ChallengeResult {
  readonly kind: 'RUN';
  readonly mode: 'PRODUCTION' | 'SYNTHETIC_TEST_ONLY';
  readonly baseline: BaselineRecord;
  readonly betterRuleFingerprint: string;
  readonly rounds: readonly RoundRecord[];
  readonly bestCandidate: ChallengeCandidate | null;
  /** true iff the best candidate is NOT the frozen baseline and NOT a member of the fixed A2 retrieval set (B_RETRIEVED). */
  readonly wasAbsentFromFixedSet: boolean;
  readonly trueDiscoveryRun: boolean;
  readonly improvementVsBaseline: Readonly<Record<string, number>> | null;
  readonly verdict: Verdict | 'ABORTED';
  readonly d057: { readonly outcome: 'PROMOTE' | 'NO_PROMOTION'; readonly reasons: readonly string[] };
  readonly winnerRecord: WinnerRecordRef | null;
  readonly recipeFingerprint: string | null;
  readonly noveltyLevel: 0 | 1 | 2 | 3;
  readonly priorArtAxis: string;
  readonly falsification: FalsificationReport;
  readonly blockers: readonly string[];
  readonly nextExperiment: string;
  readonly auditFingerprint: string;
}

export interface ChallengeBlocked {
  readonly kind: 'EXECUTION_BLOCKED';
  readonly error: string;
  readonly code: ChallengeFailClosedCode;
  readonly fingerprint: string;
}

export type ChallengeFailClosedCode =
  | 'MALFORMED_PROBLEM'
  | 'BASELINE_NOT_FROZEN'
  | 'RULE_CHANGED_AFTER_FREEZE'
  | 'INVALID_EVIDENCE_PROVENANCE'
  | 'BACKEND_UNAVAILABLE'
  | 'MISSING_EXPERIMENT_RESULT'
  | 'CORRUPTED_RESEARCH_STATE'
  | 'AMBIGUOUS_TERMINAL'
  | 'RETRIEVAL_ONLY_BEST';

export class ChallengeFailClosedError extends Error {
  constructor(message: string, public readonly code: ChallengeFailClosedCode) {
    super(`FAIL_CLOSED[${code}]: ${message}`);
    this.name = 'ChallengeFailClosedError';
  }
}

/**
 * THE THIN SEAM (brief §7.3). Every port below delegates to an EXISTING,
 * unmodified Genesis function — real wiring lives in `orchestrator/d062Ports.ts`.
 * A mismatch between what this seam expects and what the real function
 * returns is a compile error here, never a runtime surprise downstream.
 */
export interface A2DomainPorts {
  /** -> the fixed 12-molecule A2 space (loadCandidateSummaries + runA2Analysis), lineage B_RETRIEVED — "what Genesis already knew". */
  readonly retrievedCandidates: () => readonly A2CandidateLike[];
  /** -> the real dose strata enumerated from the pinned trial's own arms, lineage C_INITIAL_SPACE — absent from the fixed retrieval list above. */
  readonly generatedCandidates: () => readonly A2CandidateLike[];
  /** -> one L2/D_MUTATED candidate (e.g. an interpolated dose with no measuring arm), disclosed for completeness. null when none is proposed. NEVER carries real observationCount > 0 — it must never be promotable (brief §9). */
  readonly interpolatedCandidate: () => A2CandidateLike | null;
  /** -> rankForLowerHarm-equivalent: hard-filter (efficacy floor + existential safety veto) AND safety-dominant ranking in one real pass, exactly mirroring govLowerHarmAdapters.ts's own hardFilter/rank split. */
  readonly hardFilterAndRank: (cs: readonly A2CandidateLike[]) => {
    readonly qualifying: readonly A2CandidateLike[];
    readonly eliminated: readonly { readonly candidateId: string; readonly reason: string }[];
  };
  /** -> checkDiversity-equivalent: reports, never eliminates. */
  readonly checkDiversity: (cs: readonly A2CandidateLike[]) => { readonly ok: boolean; readonly reason: string };
  /** -> freezeFalsificationCriteria-equivalent, computed BEFORE falsify() runs. */
  readonly freezeFalsification: (top2: readonly A2CandidateLike[], now: string) => { readonly fingerprint: string };
  /** -> runG2Falsification + the self-falsification battery, honestly reporting n/13. */
  readonly falsify: (top2: readonly A2CandidateLike[], sealFp: string) => FalsificationReport;
  /** -> evaluatePracticalCandidate/surfaceFor + decideFunnelVerdict (the real safety/governance gate + WINNER/NO_WINNER conjunction). `winnerId` is null unless the verdict is WINNER. `runFingerprint` covers the full decision chain and is stable across two identical runs (never includes a re-minted artifactId — D-059). */
  readonly adjudicate: (top2: readonly A2CandidateLike[], sealFp: string) => { readonly verdict: Verdict; readonly winnerId: string | null; readonly marginNote: string; readonly runFingerprint: string };
  /** -> field assembly onto the existing, additively-extended LowerHarmResearchRecipe. `experimentRefs` are THIS round's own plan labels (no cross-round state needed — see docs/DECISIONS.md D-062). Returns null (LOCKED) when the winner carries no usable evidence. */
  readonly buildRecipe: (winner: WinnerRecordRef, best: ChallengeCandidate, experimentRefs: readonly string[]) => { readonly recipeFingerprint: string } | null;
  /** Provenance only (D-040 clock rule) — supplied, never read from the system clock. */
  readonly now: () => string;
}

export type { Objective, Verdict, WinnerRecordRef };
