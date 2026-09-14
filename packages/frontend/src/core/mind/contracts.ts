import type { Candidate, OrchestratorAdapters } from '../orchestrator/contracts';
import type { ModelSpec } from '../agent/modelSpace';
import type { FalsificationCriterion } from '../experimentFabric/scientificDiscovery';
import type { KnowledgeEpistemicStatus } from '../knowledge/supplementalRegistry';

/**
 * GENESIS MIND — contracts (docs/DECISIONS.md D-060).
 *
 * The Mind reasons in `ModelSpec` / hypotheses / predictions; the D-055
 * orchestrator consumes `Candidate`. This module holds only the shapes that
 * join the two. It contains ZERO science: no ranking, no adjudication, no
 * falsification, no recipe logic — every one of those stays in the existing,
 * unmodified module that already owns it (see D-060's REUSE table).
 */

/**
 * EXTENDS the EXISTING epistemic-status axis
 * (`knowledge/supplementalRegistry.ts::KnowledgeEpistemicStatus`) rather than
 * introducing a parallel one. Two values are added for states that axis has
 * no member for; everything else is reused verbatim. This is deliberately
 * ORTHOGONAL to `EvidenceClass` (how strong) and `DataProvenance` (origin) —
 * three axes, never collapsed into one.
 */
export type MindKnowledgeStatus = KnowledgeEpistemicStatus | 'CONTRADICTION_RECORD' | 'OPEN_QUESTION';

export interface MindKnowledgeItem {
  readonly itemId: string;
  readonly status: MindKnowledgeStatus;
  readonly claim: string;
  readonly provenanceRefs: readonly string[];
  /** `engineeringGraph/provenance.ts::provenanceRank` values — higher is better-supported. */
  readonly provenanceRanks: readonly number[];
  /** Weakest-link fold: a claim is never better supported than its weakest input. */
  readonly weakestLinkRank: number;
  readonly evidenceClass?: string;
  readonly llmAssisted: boolean;
  readonly fingerprint: string;
}

/** References `ProblemRecord.problemId` — never a competing parser (D-060, §6.2 of the brief). */
export interface StructuredProblemExtension {
  readonly problemId: string;
  readonly entities: readonly string[];
  readonly variables: readonly string[];
  readonly observables: readonly string[];
  readonly unknowns: readonly string[];
  readonly causalCandidates: readonly { readonly cause: string; readonly effect: string }[];
  readonly falsificationTargets: readonly string[];
  readonly fingerprint: string;
}

/** A symbolic form that `modelSpace.ts`'s `ModelBasis` vocabulary cannot express. MODEL_CANDIDATE until tested — never presented as true. */
export interface SymbolicModelCandidate {
  readonly astSource: string;
  readonly lineageParentFingerprint: string | null;
  readonly fingerprint: string;
  readonly status: 'MODEL_CANDIDATE';
}

export interface MindHypothesis {
  readonly hypothesisId: string;
  readonly statement: string;
  readonly mechanismId: string;
  readonly modelSpec: ModelSpec | null;
  readonly symbolic: SymbolicModelCandidate | null;
  readonly observable: string;
  readonly predictedValue: number;
  readonly tolerance: number;
  readonly falsificationCriterion: FalsificationCriterion;
  /** Never empty for a registered prediction — the real `predictionRegistry` refuses a claim that distinguishes nothing. */
  readonly competingHypothesisIds: readonly string[];
  readonly generationRationale: string;
  readonly provenanceRefs: readonly string[];
  readonly fingerprint: string;
}

export interface PairDiscrimination {
  readonly hypothesisA: string;
  readonly hypothesisB: string;
  readonly predictedDifference: number;
  readonly pooledSigma: number;
}

export interface DiscriminationGainRecord {
  readonly experimentLabel: string;
  readonly pairIds: readonly [string, string];
  readonly sigmaSeparation: number;
  readonly gain: number;
}

/** L0 fixed retrieval · L1 initial declared space · L2 mutation · L3 symbolic composition. Computed from lineage, never asserted. */
export type MindLineage = 'FIXED_LIST' | 'INITIAL_SPACE' | 'MUTATED' | 'SYMBOLIC_COMPOSITION';

export interface NoveltyLevelReport {
  readonly level: 0 | 1 | 2 | 3;
  readonly perCandidate: readonly { readonly candidateId: string; readonly level: 0 | 1 | 2 | 3; readonly evidence: string }[];
  readonly priorArtAxis: string;
}

/**
 * Rich real state for UI/audit/tests, returned ALONGSIDE `adapters` — the
 * side-channel pattern D-058/D-059 established. `orchestrator.ts` never reads
 * it, so the generic contract stays untouched.
 */
export interface MindAdapterDiagnostics {
  readonly hypotheses: readonly MindHypothesis[];
  readonly predictionsRegistryFingerprint: string;
  readonly discriminationGains: readonly DiscriminationGainRecord[];
  readonly noveltyLevel: NoveltyLevelReport;
  readonly researchStateHead: string;
  readonly knowledgeSnapshotFingerprint: string;
  readonly initialSpaceFingerprints: readonly string[];
  readonly lineage: readonly { readonly candidateId: string; readonly lineage: MindLineage }[];
  /** Reported, never used to silently drop a candidate — the diversity port returns its input unchanged. */
  readonly distinctMechanismClasses: number;
}

export interface MindAdapterBundle {
  readonly adapters: OrchestratorAdapters;
  readonly diagnostics: MindAdapterDiagnostics;
}

export type MindTerminal = 'WINNER' | 'NO_WINNER' | 'SCIENTIFIC_STOP' | 'EXECUTION_BLOCKED';

export type { Candidate };
