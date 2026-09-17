/**
 * GENESIS RESEARCH ORCHESTRATOR — contracts (docs/DECISIONS.md D-055).
 *
 * This module contains ZERO new science: no ranking, no adjudication, no
 * falsification, no recipe logic of its own. It is ONLY sequencing +
 * contracts + audit + a HARK-stop + fail-closed — the discipline of
 * "run existing Genesis modules in the right order, and refuse to proceed
 * quietly when something goes wrong." `OrchestratorAdapters` is a set of
 * PORTS: `orchestrator.ts` calls them in a fixed order and records what
 * each returned; it never computes a candidate, a verdict, or a recipe
 * itself.
 *
 * SCOPE (see this file's sibling `toyAdapters.ts` and D-055's own "what
 * this entry does NOT do"): the adapters shipped in THIS pass are
 * `SYNTHETIC_TEST_ONLY` — sandbox/test fixtures, never real Genesis
 * pipelines. Wiring a port to a real module (`runGovDrugDiscoveryCampaign`,
 * `runLowerHarmFunnel`, `generateDifferentiatingExperiment`,
 * `genesisAdjudicationProtocol`, a real `buildRecipe`) is explicit future
 * work, not done here — doing it well requires re-verifying "no second
 * engine" against an actual live call site, not a taxonomy string, exactly
 * the same caveat `core/virtualBio/gov.ts` states for its own pillar hooks.
 */

export interface Objective {
  readonly metric: string;
  readonly direction: 'minimize' | 'maximize';
  readonly floor?: number;
}

export interface ProblemRecord {
  readonly problemId: string;
  readonly nlInput: string;
  readonly objectives: readonly Objective[];
  readonly constraints: readonly string[];
  readonly population?: string;
  readonly harmAxes: readonly string[];
  readonly evidenceMinimum: string;
  readonly missingInputs: readonly string[];
  readonly status: 'FORMALIZED' | 'NEEDS_INPUT';
  readonly llmAssisted: boolean;
  readonly fingerprint: string;
}

export interface StructuredExperimentRequest {
  readonly problemId: string;
  readonly modelFamilies: readonly string[];
  readonly seedBase: number;
  readonly paramGridNote: string;
}

export interface Candidate {
  readonly candidateId: string;
  readonly mechanismClass: string;
  readonly score: number;
  readonly riskGrade: string;
  readonly evidenceRefs: readonly string[];
}

export interface FreezeSeal {
  readonly decisionRule: string;
  readonly falsificationCriteria: string;
  readonly evidenceMinimum: string;
  readonly comparisonRule: string;
  readonly sealFingerprint: string;
  readonly sealedAt: string;
}

export interface WinnerRecordRef {
  readonly winnerId: string;
  readonly verdict: 'WINNER';
  readonly conjunctionOk: boolean;
  readonly fingerprints: Readonly<Record<string, string>>;
}

export type Verdict = 'WINNER' | 'NO_WINNER' | 'CONFLICTING_EVIDENCE' | 'INSUFFICIENT_EVIDENCE';

export type StageId =
  | '01_FORMALIZE'
  | '02_NL_TO_REQUEST'
  | '03_GENERATE'
  | '04_NORMALIZE_DEDUP'
  | '05_HARD_FILTER'
  | '06_DIVERSITY'
  | '07_RANK'
  | '08_TOP10'
  | '09_TOP2'
  | '10_FREEZE_PREREG'
  | '11_EXPERIMENT_PLAN'
  | '12_EXECUTE'
  | '13_EVIDENCE'
  | '14_FALSIFY'
  | '15_ADJUDICATE_D047'
  | '16_COMPARE'
  | '17_VERDICT'
  | '18_RECIPE_OR_LOCK'
  | '19_AUDIT_REPLAY'
  | '20_NEXT_EXPERIMENT';

export interface StageRecord {
  readonly stage: StageId;
  readonly status: 'OK' | 'ABORTED' | 'LOCKED';
  readonly fingerprint: string;
  readonly note?: string;
}

export interface ExecutedExperiment {
  readonly experimentId: string;
  readonly evidenceClass: string;
  readonly summary: Readonly<Record<string, number>>;
}

export interface IngestedEvidence {
  readonly ref: string;
  readonly provenance: string;
}

export interface FalsificationOutcome {
  readonly survived: readonly boolean[];
  readonly note: string;
}

export interface AdjudicationOutcome {
  readonly verdict: Verdict;
  readonly winner?: WinnerRecordRef;
}

export interface RecipeOutcome {
  readonly recipeFingerprint: string;
}

export interface DiscoveryRun {
  readonly runId: string;
  readonly problem: ProblemRecord;
  readonly stages: readonly StageRecord[];
  readonly verdict: Verdict | 'ABORTED';
  readonly abortReason?: string;
  readonly winner?: WinnerRecordRef;
  readonly recipeFingerprint?: string;
  readonly nextExperiment?: string;
  readonly auditFingerprint: string;
  readonly mode: 'PRODUCTION' | 'SYNTHETIC_TEST_ONLY';
}

/**
 * ADAPTER PORTS — each one maps 1:1 to an EXISTING Genesis mechanism (see
 * each field's own comment for which one). The orchestrator calls these
 * and records what they returned; it never substitutes its own logic for
 * theirs. `toyAdapters.ts` in this pass implements every port with
 * SYNTHETIC_TEST_ONLY fixtures — a real, `PRODUCTION`-mode implementation
 * wiring these to the actual Genesis modules is out of this pass's scope.
 */
export interface OrchestratorAdapters {
  /** -> LOWER_HARM candidate generation / A2 candidate space (existing). */
  generate(req: StructuredExperimentRequest): readonly Candidate[];
  /** -> canonical fingerprint-based dedup (existing pattern, e.g. diversity/redundancy checks in govDrugLowerHarmFunnel.ts). */
  normalizeDedup(cs: readonly Candidate[]): readonly Candidate[];
  /** -> existing veto/constraint filtering (e.g. A2's safety veto, LOWER-HARM's efficacy floor). */
  hardFilter(cs: readonly Candidate[]): readonly Candidate[];
  /** -> existing diversity/redundancy check (govDrugLowerHarmFunnel.ts::checkDiversity). */
  diversity(cs: readonly Candidate[]): readonly Candidate[];
  /** -> existing pre-registered ranking rule (e.g. rankForLowerHarm). */
  rank(cs: readonly Candidate[]): readonly Candidate[];
  top10(cs: readonly Candidate[]): readonly Candidate[];
  top2(cs: readonly Candidate[]): readonly Candidate[];
  /** -> the D-048-style preregistration seal, frozen BEFORE the experiment runs. */
  seal(problem: ProblemRecord): FreezeSeal;
  /** HARK detector input: true iff the rule frozen in `seal` genuinely has not changed since. */
  verifySealUnchanged(seal: FreezeSeal): boolean;
  /** -> G2's experiment planner (core/agent/observationGap.ts::generateDifferentiatingExperiment lineage). */
  planExperiments(top2: readonly Candidate[], seal: FreezeSeal): readonly string[];
  /** -> a real execution backend (physics/bio/real-data). */
  execute(plan: readonly string[]): readonly ExecutedExperiment[];
  /** -> provenance ingestion (evidenceProvenance.ts lineage, D-042+). */
  ingestEvidence(executed: readonly ExecutedExperiment[]): readonly IngestedEvidence[];
  /** -> G2 falsification. */
  falsify(top2: readonly Candidate[], evidence: readonly ExecutedExperiment[], seal: FreezeSeal): FalsificationOutcome;
  /** -> the Genesis Adjudication Protocol (D-047, genesisAdjudicationProtocol.ts). */
  adjudicate(top2: readonly Candidate[], evidence: readonly ExecutedExperiment[], seal: FreezeSeal): AdjudicationOutcome;
  /** -> a comparison record (D-047's `compare` phase lineage). */
  compare(top2: readonly Candidate[], seal: FreezeSeal): string;
  /** -> a real RecipeBuilder (its own gates decide READY vs LOCKED internally). Returns null when locked. */
  buildRecipe(winner: WinnerRecordRef): RecipeOutcome | null;
  /** -> a gap-request / next-question recommendation (discovery-loop lineage). */
  recommendNext(run: DiscoveryRun): string;
  /** The shared Genesis hash provider (fnv1a via core/events/hash.ts — see `toyAdapters.ts`). */
  hash(value: unknown): string;
}
