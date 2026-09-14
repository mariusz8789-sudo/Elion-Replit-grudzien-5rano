# GENESIS MIND — QWEN IMPLEMENTATION PACKAGE REQUEST

**You are the primary BUILDER for this stage. Claude integrates and verifies what you deliver.**

Baseline commits: **C1 = `17351a3`**, **C2 = `62bfcb2`**.
You do not have repository access. Everything you need is in this document. Where a
contract is quoted verbatim, code against it exactly. Where only a signature is given,
code against the signature and **declare your assumption explicitly** in your delivery —
do not silently invent field names.

---

## 0. READ THIS FIRST — THE FINDING THAT CHANGES THE MISSION

The mission as originally framed was "build the missing Genesis Mind." That framing is
**wrong**, and building against it would destroy the repository.

**The Mind's organs already exist.** `packages/frontend/src/core/agent/` contains **89
modules**, and they already implement — with real code, real tests, real fingerprints —
almost every capability on the Genesis Mind list: hypothesis generation, mechanism
generation, model-form generation *and mutation*, prediction registration with
freeze-ordering guards, differentiating-experiment design, a 13-probe self-falsification
battery, a novelty gate, an epistemic state graph, and five different next-experiment
selectors unified behind one shape.

**The real defect is that they are not connected to the execution backbone.** Verified
mechanically at `62bfcb2`:

```
core/agent/**  →  imports from core/orchestrator/   :  ZERO
core/orchestrator/**  →  imports from core/agent/   :  exactly 4 small constants
     winnerGate.ts        ← MINIMUM_OBSERVATIONS, DEFAULT_EVIDENCE_CLASS_RANK
     evidenceClassMapping.ts ← DEFAULT_EVIDENCE_CLASS_RANK, EvidenceClass
     govLowerHarmAdapters.ts ← one type import
```

Two disconnected continents. The Mind's output never reaches
`runScientificDiscovery()`; the orchestrator's `generate()` port never asks the Mind for
candidates. On top of that, **19 of the most Mind-relevant modules are orphaned** — built,
unit-tested, and never reached from the running application at all (list in §4.3).

### 0.1 The autonomy is even less wired than the orphan list suggests

`moduleReachability.test.ts` counts `import type` as a real import. The **only** reason
`campaignOrchestrator.ts`, `directionFinder.ts` and `noveltyGate.ts` are not on the orphan
list is this, in `core/agent/phaseELabels.ts` (an i18n label table reached from a physics
screen):

```ts
import type { ResultLabel, NoveltyLevel } from './noveltyGate';
import type { OrchestratorStopReason } from './campaignOrchestrator';
import type { DirectionGenerationMethod } from './directionFinder';
```

Grepped for runtime call sites: **`runAutonomousOrchestrator(`, `findNextDirections(`,
`assessNovelty(` and `fulfillExperimentGap(` have ZERO callers** outside their own modules,
their own tests, and the orphaned `genuineDiscoveryOrchestrator.ts`.

**So the autonomous research loop is fully built, fully tested, and nothing in the running
application ever executes it.** Treat every one of these as "built, not wired."

**Therefore your mission is:**

1. **BRIDGE** the Mind to the C1/C2 backbone (the single highest-value deliverable).
2. **RE-WIRE** the orphaned organs into that live path.
3. **BUILD ONLY the genuinely missing organs** (§6) — a fact-level knowledge layer with
   provenance classes, problem→domain routing, and the multi-round outer research loop.

**Every capability you deliver MUST be classified REUSE / EXTEND / NEW, and every NEW
classification must be justified against the module list in §4.** A package that
re-implements `modelSpace.ts`, `noveltyGate.ts`, `predictionRegistry.ts`,
`selfFalsificationBattery.ts` or `nextAction.ts` is **rejected on delivery**, however good
the code is.

---

## 1. THE VERIFIED EXECUTION BACKBONE (C1/C2) — DO NOT REBUILD

Pipeline, all real, all passing:

```
Problem → generate → normalizeDedup → hardFilter → diversity → rank
       → TOP10 → TOP2 → FREEZE/PREREG → plan → execute → ingestEvidence
       → falsify → adjudicate(D-047) → compare → verdict
       → WinnerPromotionGate(D-057) → WinnerRecord | NO_WINNER
       → ResearchRecipe | LOCKED → audit → replay → nextExperiment
```

Proven by execution:

| Run | Mode | Verdict |
|---|---|---|
| LOWER-HARM, real pinned ChEMBL + ClinicalTrials.gov | PRODUCTION | `NO_WINNER`, recipe LOCKED |
| LOWER-HARM, engineered fixture through the *real* decision functions | SYNTHETIC_TEST_ONLY | `WINNER` → WinnerRecord → Recipe |
| E2E-01, real pinned 2671-molecule generated space | PRODUCTION | `NO_WINNER`, recipe LOCKED |

**You must not create:** a second orchestrator, ranker, adjudicator, falsification engine,
evidence gate, Winner gate, or Recipe engine. You must not modify `orchestrator.ts`'s
decision logic. Ports and adapters only.

---

## 2. REAL PATHS AND VERBATIM CONTRACTS

All paths are relative to repository root. Frontend package root is
`packages/frontend/`. Everything below is from commit `62bfcb2`.

### 2.1 `packages/frontend/src/core/orchestrator/contracts.ts` — VERBATIM. DO NOT MODIFY.

```ts
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
  | '01_FORMALIZE' | '02_NL_TO_REQUEST' | '03_GENERATE' | '04_NORMALIZE_DEDUP'
  | '05_HARD_FILTER' | '06_DIVERSITY' | '07_RANK' | '08_TOP10' | '09_TOP2'
  | '10_FREEZE_PREREG' | '11_EXPERIMENT_PLAN' | '12_EXECUTE' | '13_EVIDENCE'
  | '14_FALSIFY' | '15_ADJUDICATE_D047' | '16_COMPARE' | '17_VERDICT'
  | '18_RECIPE_OR_LOCK' | '19_AUDIT_REPLAY' | '20_NEXT_EXPERIMENT';

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

export interface OrchestratorAdapters {
  generate(req: StructuredExperimentRequest): readonly Candidate[];
  normalizeDedup(cs: readonly Candidate[]): readonly Candidate[];
  hardFilter(cs: readonly Candidate[]): readonly Candidate[];
  diversity(cs: readonly Candidate[]): readonly Candidate[];
  rank(cs: readonly Candidate[]): readonly Candidate[];
  top10(cs: readonly Candidate[]): readonly Candidate[];
  top2(cs: readonly Candidate[]): readonly Candidate[];
  seal(problem: ProblemRecord): FreezeSeal;
  verifySealUnchanged(seal: FreezeSeal): boolean;
  planExperiments(top2: readonly Candidate[], seal: FreezeSeal): readonly string[];
  execute(plan: readonly string[]): readonly ExecutedExperiment[];
  ingestEvidence(executed: readonly ExecutedExperiment[]): readonly IngestedEvidence[];
  falsify(top2: readonly Candidate[], evidence: readonly ExecutedExperiment[], seal: FreezeSeal): FalsificationOutcome;
  adjudicate(top2: readonly Candidate[], evidence: readonly ExecutedExperiment[], seal: FreezeSeal): AdjudicationOutcome;
  compare(top2: readonly Candidate[], seal: FreezeSeal): string;
  buildRecipe(winner: WinnerRecordRef): RecipeOutcome | null;
  recommendNext(run: DiscoveryRun): string;
  hash(value: unknown): string;
}
```

**CRITICAL CONSTRAINT: every port above is SYNCHRONOUS.** No port may return a Promise.
Any async work (I/O, fetch, store access) must happen **before** the pipeline starts, in
your entry-point wrapper, and the resolved value injected into the adapter factory. This
is exactly how C2 solved evidence custody — copy that pattern, do not change the contract.

**`top2()` has no length-2 constraint** — it is `(cs) => readonly Candidate[]`. "TOP2" is a
stage-name convention only. The E2E-01 adapter legitimately returns 3.

### 2.2 `packages/frontend/src/core/orchestrator/nl.ts` — VERBATIM. DO NOT MODIFY.

```ts
export interface NLInput {
  readonly text: string;
  readonly objectives?: readonly Objective[];
  readonly constraints?: readonly string[];
  readonly population?: string;
  readonly harmAxes?: readonly string[];
  readonly evidenceMinimum?: string;
}

export function parseProblem(id: string, input: NLInput, hash: (value: unknown) => string): ProblemRecord;
```

Fail-closed rules it already enforces (do **not** duplicate these checks elsewhere):
- `objectives.length === 0` → missing
- any objective lacking `metric` or `direction` → missing
- absent `evidenceMinimum` → missing
- any missing → `status: 'NEEDS_INPUT'`, and `runScientificDiscovery` aborts at stage 01.

`llmAssisted` is currently hardcoded `true`. Problem formalization is **REUSE**, not NEW.
If you need richer structure (entities, variables, unknowns, causal candidates), deliver it
as a **separate record that references `ProblemRecord.problemId`** — never as a competing parser.

### 2.3 `packages/frontend/src/core/orchestrator/orchestrator.ts` — DO NOT MODIFY.

```ts
export const STAGES: readonly StageId[];
export function runScientificDiscovery(
  problem: ProblemRecord,
  A: OrchestratorAdapters,
  mode: 'PRODUCTION' | 'SYNTHETIC_TEST_ONLY' = 'PRODUCTION',
): DiscoveryRun;
export function replayRunDeterministic(
  problem: ProblemRecord, A: OrchestratorAdapters, mode: 'PRODUCTION' | 'SYNTHETIC_TEST_ONLY',
): boolean;
```

It enforces exactly three things itself and computes nothing scientific:
1. `NEEDS_INPUT` → abort at stage 01.
2. `!verifySealUnchanged(seal)` → abort `HARK_DETECTED` at stage 11.
3. Recipe only for a real `WINNER` that also clears the Winner Promotion Gate.

### 2.4 `packages/frontend/src/core/orchestrator/winnerGate.ts` — DO NOT MODIFY.

```ts
export interface EvidenceInventoryItem { readonly evidenceClass: EvidenceClass; readonly observationCount: number; }
export interface PromotionInput { readonly adjudicationVerdict: Verdict; readonly inventory: readonly EvidenceInventoryItem[]; readonly minimumStrong?: number; }
export type PromotionOutcome = 'PROMOTE' | 'NO_PROMOTION';
export interface PromotionResult {
  readonly outcome: PromotionOutcome; readonly reasons: readonly string[];
  readonly totalObservations: number; readonly strongCount: number;
  readonly minimumObservations: number; readonly fingerprint: string;
}
export function asEvidenceClass(value: string): EvidenceClass;
export function canPromoteToWinnerRecord(input: PromotionInput): PromotionResult;
```

`MINIMUM_OBSERVATIONS = 3`, imported from `core/agent/practicalCandidateGate.ts`. **Never
redeclare this number.** "Strong" means rank ≥ `INDIRECT_RANDOMISED`.

### 2.5 `packages/frontend/src/core/agent/evidenceProvenance.ts` — the ONE evidence taxonomy.

```ts
export type EvidenceClass =
  | 'DIRECT_RANDOMISED' | 'INDIRECT_RANDOMISED' | 'POOLED_META' | 'NETWORK_META'
  | 'OBSERVATIONAL' | 'REGULATORY_LABEL' | 'POST_MARKETING' | 'MECHANISTIC'
  | 'COMPUTATIONAL' | 'UNVERIFIED';

export type EvidenceRanking = Readonly<Record<EvidenceClass, number>>;
export const DEFAULT_EVIDENCE_CLASS_RANK: EvidenceRanking;
export function rankingFingerprint(ranking: EvidenceRanking): string;
export function strongestEvidenceClass(comparisons, ranking?): EvidenceClass | null;
export function classifyComparisonEvidenceClass(exposed, reference): EvidenceClass;
export function compareCountedOutcomes(exposed, reference): RiskRatioComparison | null;
```

Your knowledge-layer status classes (`REAL_EVIDENCE` / `MODEL_OUTPUT` / `ASSUMPTION` /
`HYPOTHESIS` / `SYNTHETIC_TEST_ONLY` / `UNKNOWN`) are a **different, orthogonal axis** from
`EvidenceClass`. Keep both: `EvidenceClass` says *how strong*, your class says *what kind of
thing this is*. Do not collapse them and do not re-rank `EvidenceClass`.

### 2.6 `packages/frontend/src/core/agent/genesisAdjudicationProtocol.ts` (D-047) — REUSE FOR ALL FREEZING.

This is a **generic, typed, reusable** preregistration→freeze→execute protocol. Your
prediction-freezing MUST use it rather than inventing a new freeze.

```ts
export type CustodyStatus = 'PINNED_VERIFIED' | 'PINNED_UNVERIFIED_HASH' | 'NO_ACCESS' | 'FABRICATED_REJECTED';

export interface AuditedEvidenceRecord {
  readonly source: string; readonly sourceId: string; readonly hash: string | null;
  readonly custodyStatus: CustodyStatus; readonly evidenceClass: string;
  readonly classificationMethod: string; readonly rankingFingerprint: string;
}

export interface PreRegistration<TRule> {
  readonly phase: 'PRE_REGISTRATION'; readonly protocolId: string; readonly subjectId: string;
  readonly question: string; readonly rule: TRule; readonly declaredAt: string;
}
export function preRegister<TRule>(input: {
  protocolId: string; subjectId: string; question: string; rule: TRule; declaredAt: string;
}): PreRegistration<TRule>;

export interface FrozenProtocol<TRule> {
  readonly phase: 'FROZEN'; readonly preRegistration: PreRegistration<TRule>;
  readonly ruleFingerprint: string; readonly frozenAt: string;
}
export function freeze<TRule>(pre: PreRegistration<TRule>, frozenAt: string): FrozenProtocol<TRule>;

export interface ExecuteInput<TRule, TResult> {
  readonly rule: TRule;
  readonly evidenceUsed: readonly AuditedEvidenceRecord[];
  readonly runResult: (rule: TRule, evidence: readonly AuditedEvidenceRecord[]) => TResult;
}
export function execute<TRule, TResult>(frozen: FrozenProtocol<TRule>, input: ExecuteInput<TRule, TResult>): ExecutedProtocol<TRule, TResult>;

export function readjudicate<TRule, TResult>(...): ReAdjudicatedProtocol<TRule, TResult>;
export function compare<TRule, TResult>(...): ComparedProtocol<TRule, TResult>;
export function audit<TRule, TResult>(...): AuditedProtocol<TRule, TResult>;
export function printReport(report: GenesisAdjudicationReport): string;
export const GENESIS_RECIPE = 'INPUT -> VERIFY -> CLASSIFY -> FREEZE -> EXECUTE -> FALSIFY -> RE-ADJUDICATE -> COMPARE -> AUDIT -> REPRODUCE';
```

Guarantees it already enforces, which you inherit free:
- **HARK guard**: re-fingerprints the rule at execute; mismatch → throws.
- **Reproducibility guard**: runs `runResult` twice, requires byte-identical output.
- **No-evidence guard**: empty `evidenceUsed` → throws ("a clean pass without evidence is a fabrication").
- **Phase-order guard**: PRE_REGISTRATION → FROZEN → EXECUTED → … enforced.

### 2.7 `packages/frontend/src/core/evidenceConnectors/` (D-057) — the ONLY custody store.

```ts
// contracts.ts
export type HashPolicy = 'sha256' | 'fnv1a-canonical';
export interface SourceConfig { readonly sourceId: string; readonly name: string; readonly url: string; readonly hashPolicy: HashPolicy; readonly category: string; }
export interface FrozenArtifact { readonly sourceId: string; readonly artifactId: string; readonly hash: string; readonly hashPolicy: HashPolicy; readonly bytesLength: number; readonly retrievedFromUrl: string; readonly fetchedAt: number; }
export type IngestStatus = 'FROZEN' | 'HASH_MISMATCH_SUPERSEDED' | 'FETCH_FAILED';
export interface IngestRecord { readonly sourceId: string; readonly status: IngestStatus; readonly artifact: FrozenArtifact | null; readonly supersedes: string | null; readonly note: string; readonly recordedAt: number; readonly fingerprint: string; }
export interface ConnectorPort { fetchBytes(source: SourceConfig): Promise<Uint8Array>; }
export interface ReplayResult { readonly ok: boolean; readonly sourceId: string; readonly artifactId: string; readonly hashPolicy: HashPolicy; readonly expectedHash: string; readonly actualHash: string | null; readonly note: string; }
export class FailClosedError extends Error { constructor(message: string, code: 'UNKNOWN_SOURCE' | 'NO_FROZEN_ARTIFACT' | 'FETCH_FAILED' | 'REPLAY_UNAVAILABLE'); }

// store.ts
export class EvidenceConnectorStore {
  ingest(source: SourceConfig, port: ConnectorPort): Promise<IngestRecord>;
  replay(sourceId: string, artifactId: string, port: ConnectorPort): Promise<ReplayResult>;
  allRecords(sourceId: string): Promise<readonly IngestRecord[]>;
  driftReport(sourceId: string): Promise<DriftReport>;
  allSourceIds(): Promise<readonly string[]>;
}
```

Append-only. **KNOWN TRAP, already cost one bug in C2:** `ingest()` mints a **new
`artifactId` on every call**, even when the content hash is unchanged ("re-affirmed"),
because the id incorporates the store's record count. **Never fold `artifactId` into
anything replay-sensitive** — use `hash` + `hashPolicy`, which are stable.

### 2.8 `packages/frontend/src/core/orchestrator/evidenceCustody.ts` (D-059) — REUSE.

```ts
export interface EvidenceCustodyResult {
  readonly ok: boolean; readonly sourceId: string;
  readonly record: IngestRecord | null; readonly replay: ReplayResult | null; readonly reason: string;
}
export async function verifyEvidenceCustody(store: EvidenceConnectorStore, source: SourceConfig, port: ConnectorPort): Promise<EvidenceCustodyResult>;
```

Fails closed on fetch failure, hash drift, or replay mismatch. Never throws. Call it
**before** the synchronous pipeline, PRODUCTION mode only.

### 2.9 `packages/frontend/src/core/orchestrator/genesisDomainRegistry.ts` (D-059) — YOUR ENTRY POINT.

```ts
export type GenesisDomainId = 'LOWER_HARM' | 'E2E01';
export type GenesisDomainRunOptions = RunGovLowerHarmDiscoveryOptions;
export type GenesisDomainResult = GovLowerHarmDiscoveryResult | GovE2E01DiscoveryResult;
export interface GenesisDomainReplayResult { readonly ok: boolean; readonly first: GenesisDomainResult; readonly second: GenesisDomainResult; }
export interface GenesisDomainDescriptor {
  readonly domainId: GenesisDomainId; readonly label: string;
  run(opts?: GenesisDomainRunOptions): Promise<GenesisDomainResult>;
  replay(opts?: GenesisDomainRunOptions): Promise<GenesisDomainReplayResult>;
}
export const GENESIS_DOMAINS: readonly GenesisDomainDescriptor[];
export class UnknownGenesisDomainError extends Error { readonly requestedDomainId: string; }
export function getGenesisDomain(domainId: string): GenesisDomainDescriptor;   // throws on unknown
export async function runGenesisDomainDiscovery(domainId: string, opts?): Promise<GenesisDomainResult>;
export async function replayGenesisDomainDiscovery(domainId: string, opts?): Promise<GenesisDomainReplayResult>;
```

**This is where your Mind domain plugs in.** Extending `GenesisDomainId` and adding a
descriptor is the sanctioned integration seam.

### 2.10 Domain entry-point shape to copy — `govE2E01Discovery.ts` / `govLowerHarmDiscovery.ts`.

```ts
export interface ExecutionBlockedResult {
  readonly kind: 'EXECUTION_BLOCKED'; readonly problem: ProblemRecord;
  readonly error: string; readonly code: string; readonly fingerprint: string;
  readonly evidenceCustody: EvidenceCustodyResult | null;
}
export type RunResult = { readonly kind: 'RUN'; readonly evidenceCustody: EvidenceCustodyResult | null } & DiscoveryRun;
export type GovE2E01DiscoveryResult = RunResult | ExecutionBlockedResult;

export interface RunGovE2E01DiscoveryOptions {
  readonly mode?: 'PRODUCTION' | 'SYNTHETIC_TEST_ONLY';
  readonly nl?: string;
  readonly problemInput?: NLInput;              // passed AS-IS to parseProblem
  readonly evidenceStore?: EvidenceConnectorStore;
  readonly evidenceConnectorPort?: ConnectorPort;
}
export async function runGovE2E01Discovery(opts?): Promise<GovE2E01DiscoveryResult>;
export async function replayGovE2E01Discovery(opts?): Promise<{ ok: boolean; first; second }>;
```

Copy this shape exactly for your Mind domain. Results are `Object.freeze`d.

### 2.11 `packages/frontend/src/core/events/hash.ts` — THE hash provider.

```ts
export function fnv1a(input: string): string;          // 8-char hex
export function canonicalJson(value: unknown): string;  // stable key order
```

Fingerprint idiom used everywhere: `fnv1a(canonicalJson(value))`. Do not add a hash
function. For externally-presentable digests there is
`core/discovery/evidenceCrypto.ts::sha256Hex`.

---

## 3. THE MODEL AND KNOWLEDGE SUBSTRATE THAT ALREADY EXISTS

### 3.1 `core/agent/modelSpace.ts` — REAL model generation AND mutation. **REUSE.**

This is the single most important "do not rebuild". It already does generation, mutation,
fitting, complexity penalty, held-out scoring and fingerprinting of **model forms**:

```ts
export type ModelBasis = 'CONSTANT' | 'LINEAR' | 'LOG' | 'POWER' | 'EXP_SATURATION' | 'RECIPROCAL' | 'INTERACTION';
export type ModelTerm = /* discriminated union over ModelBasis */;
export type ModelInput = number | Readonly<Record<string, number>>;
export interface ModelLineage { /* parent/derivation provenance */ }
export interface ModelSpec { /* terms + lineage + variable(s) */ }
export interface ModelPoint { /* input + observed output */ }
export type ModelFit = /* union: fitted coefficients / failure */;
export interface ModelSpaceConstraints { /* bases, maxTerms, variables, … */ }

export function generateModelSpace(constraints: ModelSpaceConstraints): readonly ModelSpec[];
export function mutateModelSpec(parent: ModelSpec, constraints: Omit<ModelSpaceConstraints,'maxTerms'> & { maxTerms?: number }): readonly ModelSpec[];
export function fitModelSpec(spec: ModelSpec, points: readonly ModelPoint[]): ModelFit;
export function modelSelectionScore(rss: number, estimatedCoefficients: number, pointCount: number): number;
export function holdoutSplit<T>(points: readonly T[], stride?: number): { fit: readonly T[]; heldOut: readonly T[] };
export function holdoutScore(spec: ModelSpec, points: readonly ModelPoint[], stride?: number): number | null;
export function modelSpecFingerprint(spec: ModelSpec): string;
export function compareModelSpecs(a: ModelSpec, b: ModelSpec): boolean;
export function modelComplexity(spec: ModelSpec): number;
export function renderModelSpec(spec: ModelSpec): string;
export function normalizeModelSpec(spec: ModelSpec): ModelSpec;
export function basisValue(term: ModelTerm, input: ModelInput): number;
export function termKey(term: ModelTerm): string;
export function estimatedCoefficientCount(spec: ModelSpec): number;
```

MODEL SELECTION = `generateModelSpace` + `fitModelSpec` + `modelSelectionScore`.
MODEL MODIFICATION = `mutateModelSpec`.
MODEL INVENTION beyond the `ModelBasis` vocabulary is the **only** part that may be NEW —
and if you extend `ModelBasis`, extend the union, do not fork the module.

### 3.2 `core/modelGraph/graph.ts` — executable causal model DAG. **REUSE.**

```ts
export type NodeDerivation = 'direct' | 'approximate' | 'interpretive';
export interface ModelNodeDef {
  id: string; label: string; unit: string; domain: string;
  honesty: HonestyLevel; honestyNote: string; derivation: NodeDerivation;
  inputs: string[];
  compute: (inputValues: Record<string, number>) => number;
  formula: string;
}
export interface PropagationStep { nodeId: string; value: number; previousValue: number; causedBy: string[]; }
export class ModelGraph {
  addNode(def: ModelNodeDef, initialValue?: number): void;   // DAG by construction
  getNode(id): ModelNodeDef | undefined;
  getAllNodes(): ModelNodeDef[];
  getParameterNodeIds(): string[];
  getParameterSnapshot(): Record<string, number>;
  getValue(id: string): number;
  /* + setParameter/propagation returning PropagationStep[] in true topological order */
}
```

15 real graphs exist already: `bohrModelGraph`, `drakeEquationGraph`, `newtonianEnergyGraph`,
`specialRelativityGraph`, `relativisticEnergyGraph`, `logisticGrowthGraph`,
`chemistryKineticsGraph`, `orbitalGraph`, `nuclearGraph`, `photonGraph`, `lightSpeedGraph`,
`gaussianGraph`, `atmosphericEscapeGraph`, `relativisticAstroGraph`, `labConsequence`.

`HonestyLevel` (from `core/types.ts`) is the repo-wide honesty taxonomy — **reuse it, do not
add a parallel one**:

```ts
export type HonestyLevel = 'exact' | 'simplified' | 'educational' | 'theoretical' | 'cinematic';
```

Note `ModelNodeDef` already carries **two orthogonal honesty axes** (`honesty` = how
trustworthy the model is; `derivation` = how it relates to its own inputs). Mirror that
discipline; don't flatten it.

### 3.3 `core/knowledge/` — domain-level knowledge registry (NOT a fact store).

```ts
export type KnowledgeScale = 'meta' | 'micro' | 'micro-meso' | 'meso' | 'macro' | 'cosmic' | 'micro-cosmic';
export type KnowledgeCapability = 'REAL_ENGINE' | 'BACKEND_REAL_ENGINE' | 'KNOWLEDGE_ONLY' | 'CAPABILITY_SEAM' | 'ENGINE_NOT_AVAILABLE' | 'HYPOTHETICAL_VISUALIZATION';
export type KnowledgeVisualization = 'numeric' | 'graph' | 'canvas-2d' | 'scene-3d' | 'world-3d' | 'narrative';
export interface KnowledgeDomainDescriptor { /* id, scale, capability, visualization, sources… */ }
export function listKnowledgeDomains(): readonly KnowledgeDomainDescriptor[];
export function getKnowledgeDomain(id: string): KnowledgeDomainDescriptor | undefined;
export function findKnowledgeDomains(text: string): readonly KnowledgeDomainDescriptor[];
export function knowledgeSourcesForDomain(id: string): readonly KnowledgeCorpusFile[];
export function validateKnowledgeRegistry(): { ok: boolean; missing; duplicateFiles };
// context.ts
export function findGenesisKnowledgeContext(text: string): KnowledgeContextMatch;
```

**This routes a problem to a DOMAIN. It does not store facts, claims, equations,
observations or contradictions.** That fact-level layer is genuinely missing and is yours
to build (§6.1) — but it must **reuse `KnowledgeCapability` for capability honesty** and
**`findGenesisKnowledgeContext` for problem→domain routing** instead of adding a second
router.

### 3.4 `core/knowledge/supplementalRegistry.ts` — **THE EXISTING PROVENANCE-CLASS AXIS. REUSE IT.**

You were going to invent `REAL_EVIDENCE / MODEL_OUTPUT / ASSUMPTION / HYPOTHESIS /
SYNTHETIC_TEST_ONLY / UNKNOWN`. **A near-identical axis already exists and is in use:**

```ts
export const SUPPLEMENTAL_KNOWLEDGE_VERSION = '1.0.0';
export type KnowledgeEpistemicStatus =
  | 'FACT' | 'MODEL' | 'THEORY' | 'HYPOTHESIS' | 'SCENARIO_ASSUMPTION' | 'FICTIONAL_REFERENCE';
export type KnowledgeSourceKind =
  | 'institutional-reference' | 'historical-reference' | 'peer-reviewed-publication'
  | 'user-supplied-video' | 'fictional-reference';
export interface SupplementalKnowledgeRecord { /* id, status, sourceKind, sourceUrl, claim, … */ }
export function listSupplementalKnowledge(): readonly SupplementalKnowledgeRecord[];
export function getSupplementalKnowledge(id: string): SupplementalKnowledgeRecord | undefined;
export function findSupplementalKnowledge(text: string): readonly SupplementalKnowledgeRecord[];
```

**Extend this union if you need more values. Do not create a parallel one.** Three further
provenance axes already exist and must also be reused rather than duplicated:

```ts
// core/dataProvenance.ts
export type DataProvenance = 'SIMULATED' | 'REFERENCE' | 'REAL_EXPERIMENTAL';

// core/epistemicReliability.ts — the canonical cross-system ranking bridge
export const RELIABILITY_RANK_ORDER;
export function reliabilityRankIndex(status): number;
export function knowledgeToCanonicalReliability(status);
export function biotechToCanonicalReliability(status);
export function canonicalReliabilityLabel(status): string;

// core/engineeringGraph/provenance.ts — weakest-link provenance propagation over a graph
export function provenanceRank(p: Provenance): number;
export function weakerProvenance(a: Provenance, b: Provenance): Provenance;
export function propagateProvenance(graph, config): Map<string, EffectiveProvenance>;
```

`propagateProvenance` is exactly the "a conclusion is only as strong as its weakest input"
algorithm your knowledge layer needs. **Reuse it.**

### 3.5 `core/provenance/recordStore.ts` — the generic persistence primitive. **REUSE for ResearchState.**

```ts
export interface KeyedRecordStore<T> { get(key): Promise<T|undefined>; put(key, value): Promise<void>; list(): Promise<readonly string[]>; }
export class InMemoryRecordStore<T> implements KeyedRecordStore<T> {}
export class LocalRecordStore<T> implements KeyedRecordStore<T> {}
export type DuplicateIdPolicy = /* … */;
export class DuplicateRecordConflictError extends Error {}
export class MalformedRecordCollectionError extends Error {}
export class UnsafeRecordIdError extends Error {}
export class LocalRecordPersistenceError extends Error {}
```

`EvidenceConnectorStore` is already built on this. Your append-only `ResearchState` log
must be too — **do not add a storage mechanism.**

### 3.6 `core/experimentFabric/` — THE MOST COMPLETE EXISTING RESEARCH-STATE MACHINE

This directory was missing from the original mission framing entirely. All modules REACHED.

**`experimentFabric/hypothesisLoop.ts` (1000+ lines)** — preregistration, anti-HARKing,
competing-hypothesis generation, execution, next-experiment selection, save + replay. This
is closer to "the Mind" than anything else in the repo:

```ts
export const HYPOTHESIS_LOOP_CONTRACT_VERSION = '1.0.0';
export interface HypothesisProblem { /* id, question, domain, … */ }
export const HYPOTHESIS_PROBLEMS: readonly HypothesisProblem[];   // built-in problem catalogue
export interface PreregisteredHypothesis { /* … */ }
export interface HypothesisSet { /* … */ }
export interface PreregistrationAnchor { /* … */ }
export interface Preregistration { /* hypotheses, anchor, anchoredFingerprints, registeredAt */ }
export interface AntiHarkingCheck { /* ok, reason, … */ }
export interface HypothesisOutcome { /* … */ }
export interface HypothesisLoopResult { /* outcomes, discrimination, … */ }
export const NEXT_EXPERIMENT_PRIORITY: readonly string[];

export function generateCompetingHypotheses(problem: HypothesisProblem): HypothesisSet;
export function deriveNarrowedHypothesisProblem(result: HypothesisLoopResult): NarrowedHypothesisResult;
export function preregisterHypotheses(set: HypothesisSet, anchor: PreregistrationAnchor, now?): Preregistration;
export function verifyPreregistrationIntact(prereg, hypotheses?): { intact: boolean; reason: string };
export function checkAntiHarkingAnchor(anchoredFingerprints, usedFingerprints): AntiHarkingCheck;
export function verifyAntiHarkingAnchor(prereg, outcomes): AntiHarkingCheck;
export function executePreregisteredHypotheses(prereg: Preregistration): HypothesisLoopResult;
export async function executePreregisteredHypothesesAsync(prereg): Promise<HypothesisLoopResult>;
export function selectNextHypothesisExperiment(result): NextHypothesisExperiment;
export function buildSavedHypothesisLoop(result): SavedHypothesisLoop;
export function replaySavedHypothesisLoop(saved: unknown): HypothesisLoopReplay;
```

**`experimentFabric/beliefRevision.ts`** — the belief-revision engine. Log-odds Bayesian
confidence update with append-only history. **This is capability 10; REUSE it.**

```ts
export type HypothesisGenerationMechanism =
  | 'INITIAL' | 'RELATION_FLIP' | 'TOLERANCE_WIDENED'
  | 'STRUCTURAL_ALTERNATIVE' | 'REGIME_FIT_FROM_GRID' | 'RESIDUAL_FROM_FIT';
export interface ConfidenceUpdateRecord { readonly stepIndex: number; readonly beforeConfidence: number; readonly afterConfidence: number; readonly assessment: HypothesisAssessment; readonly evidenceMagnitude: number; readonly reason: string; }
export interface Hypothesis {
  readonly id: string; readonly criterion: FalsificationCriterion;
  readonly confidence: number;                 // clamped [0.01, 0.99]
  readonly status: HypothesisAssessment | 'ACTIVE';
  readonly parentHypothesisId: string | null;
  readonly generatedBy: HypothesisGenerationMechanism;
  readonly history: readonly ConfidenceUpdateRecord[];
}
export function createHypothesis(id, criterion, priorConfidence, generatedBy?, parentHypothesisId?): Hypothesis;
export function updateConfidence(hypothesis, assessment, evidenceMagnitude, reason, stepIndex): Hypothesis;
export function evidenceMagnitudeWithinTolerance(observed, expected, tolerance): number;
export function rankHypotheses(hypotheses): readonly Hypothesis[];
export function activeHypotheses(hypotheses): readonly Hypothesis[];
export function checkDiscriminability(/* … */): DiscriminabilityCheck;
export function selectMostDiscriminatingExperiment(/* … */);
```

**`experimentFabric/scientificDiscovery.ts`** — the shared vocabulary everything imports:

```ts
export type HypothesisAssessment = 'CANDIDATE' | 'SUPPORTED_WITHIN_PROTOCOL' | 'FALSIFIED_WITHIN_PROTOCOL' | 'INCONCLUSIVE';
export type ExperimentArmKind = 'baseline' | 'variant' | 'negative-control' | 'positive-control' | 'replication';
export type ReproductionVerdict = 'MATCH' | 'DRIFT' | 'NOT_COMPARABLE' | 'NOT_EXECUTED';
export interface FalsificationCriterion { /* metric, relation, threshold?, tolerance?, rationale */ }
```

Also present: `modelVsModelCompare.ts` (`MODEL_AGREEMENT_THRESHOLD = 0.05`,
`compareModelVsModel`, `sweepModelDivergence` — the closest thing to a model tournament),
`counterfactualCompare.ts`, `falsificationRelation.ts`, `whyNextExperiment.ts`,
`provenance.ts`, and the `evidencePack*` family.

### 3.7 `core/agent/discoveryCampaign.ts` (47 KB) — THE EXISTING CAMPAIGN ENGINE

The real round loop: enumerate/derive model space → fit → falsify → select most
discriminating next experiment → stop with a named reason.

```ts
export interface CampaignLaboratory {
  readonly labId: string; readonly problem: string;
  readonly candidateX: readonly number[];
  readonly observe: (x: number) => ModelPoint | null;
  readonly xRange: { readonly min: number; readonly max: number };
  readonly xLabel: string; readonly yLabel: string;
  readonly declareObservable?: () => RequiredObservable;
  readonly declareFeasibility?: (trigger: string) => ObservationGapFeasibility;
  readonly gapRecipient?: ObservationGapRecipient;
  readonly candidateVars?: (x: number) => Readonly<Record<string, number>> | undefined;
}
export type CampaignStopReason =
  | 'CONVERGENCE' | 'NO_INFORMATION_GAIN' | 'EXPERIMENT_SPACE_EXHAUSTED'
  | 'ROUND_BUDGET_EXHAUSTED' | 'ANTI_HARKING_VIOLATION' | 'ALL_MODELS_UNFITTABLE' | 'OBSERVATION_GAP';
export interface CampaignResult { /* rounds, stopReason, discovery, campaignFingerprint, observationGaps, liveModelSpecs, integrityFlags, … */ }
export function runDiscoveryCampaign(lab: CampaignLaboratory, options?: CampaignOptions): CampaignResult;
export function falsificationPowerAt(/* … */): number;
```

**`'NO_INFORMATION_GAIN'` here is a string label, not a computed quantity** — see §6.

### 3.8 `core/agent/domainAdapter.ts` — THE EXISTING CROSS-DOMAIN SEAM

```ts
export interface DomainAdapterCapabilities { readonly domainId: string; readonly description: string; readonly xLabel: string; readonly yLabel: string; }
export interface DomainAdapterProvenance { readonly sourceUrl: string; readonly sourceVersion: string; readonly license: string | null; readonly retrievedAt: string | null; }
export interface DomainAdapter {
  readonly capabilities: DomainAdapterCapabilities;
  readonly availableData: () => readonly number[];
  readonly laboratory: CampaignLaboratory;
  readonly provenance: DomainAdapterProvenance;
  readonly limitations: readonly string[];
}
export function runExperimentViaAdapter(adapter: DomainAdapter, options?: CampaignOptions): CampaignResult;
export function observeViaAdapter(adapter: DomainAdapter, x: number): ModelPoint | null;
export function compareDomainAdapterReplay(first, second): 'MATCH' | 'DRIFT';
export function meetsProductionContract(registry: DomainAdapterRegistry): boolean;
```

**`DomainAdapter` (the Mind's domain seam) and `OrchestratorAdapters` (the backbone's port
set) are the two sides your bridge must join.** Concrete adapters already exist in
`core/biotechData/domainAdapterRegistry.ts` and `campaignLabs.ts` (both ORPHAN): QE4 quantum
and Kepler/NASA planetary.

### 3.9 `core/mathExpr.ts` — a full symbolic AST layer, **unconnected to `modelSpace.ts`**

```ts
export function tokenize(src: string);
export function parseExpression(src: string): Node;
export type Node = /* num | var | bin | neg | call */;
export function numNode(...); export function varNode(...); export function binNode(...);
export function negNode(...); export function callNode(...);
export function evaluate(node: Node, bindings: Record<string, number>): number;
export function compileUnary(expr: string, varName?: string): (x: number) => number;
export function nodeToString(node: Node): string;
export function simplify(node: Node): Node;
export function differentiate(node: Node, v: string): Node;
export function differentiateWithSteps(node: Node, v: string): { node: Node; steps: DiffStep[] };
export function simpsonIntegral(...); export function findRoots(...);
export function stepOdeRK4(...); export function solveOde(...);
export const FUNCTIONS; export const CONSTANTS;
```

`ModelSpec` is a **term list**; `mathExpr.Node` is an **AST**. They are not connected.
**Bridging them is the single most credible route to genuine MODEL INVENTION** (symbolic
forms outside the fixed `ModelBasis` vocabulary) — and it is legitimately NEW work.

---

## 4. THE 89 EXISTING `core/agent/` MODULES — YOUR REUSE/EXTEND BASELINE

Full list at `62bfcb2`:

```
agentTool  atomicIonizationLeverCatalog  bannedStringScanner  blindDataset
campaignOrchestrator  causalInference  causalLadder  cellCultureLeverCatalog
chemistryLeverCatalog  competingModels  conformalPrediction  crossActionComparison
crossDomainSynthesis  cyberInvestigation  cyberReasoningKernel  cyberTestPlanner
datasetLaboratory  decipherment/  differentiatingExperimentGenerator  directionFinder
discoveryAdmission  discoveryCampaign  discoveryCertificate  discoveryContracts
discoveryGraph  discoveryLoop  discoveryOrchestrator  discoveryReplicationEngine
discoveryReport  discoveryStrategies  discoveryStrategy  discoveryTrace  domainAdapter
domeWorld/  electricalGeneratorLeverCatalog  entanglementInquiry
epidemicInfectiousDaysCalibration  epidemicLeverCatalog  epistemicStateGraph
evidenceImpact  evidenceProvenance  experimentFulfillment  externalDatasetCase
falsifiedModelRegistry  genesisAdjudicationProtocol  genesisAgentTools  genesisMatrix
genesisNarration  genuineDiscoveryOrchestrator  inquiryLoop  inquirySession
integrityGates  intervalNarrowing  leverCriterion  literatureNoveltyAdapter
lowerHarmLabels  matrixRelations  mechanismGeneration  mechanismInteraction
modelSpace  modelSufficiency  nextAction  nextQuestion  novelHypothesisGenerator
noveltyGate  observationGap  parameterAlternative  particleAtomicLabEnvironments
particlePhysicsLeverCatalog  phaseELabels  practicalCandidateGate  predictionRegistry
predictionVerification  proofLadder  proteinFoldingInquiry  qe4RegimeInquiryLoop
quantumTunnelingInquiry  rainfallRunoffLeverCatalog  researchChain  residualStructure
selfFalsificationBattery  sovereignTruthAnswer  structuralAlternative
structuralDiscovery  tautologyGate  trialRegistry  worldDiscoverySession
worldGoalIntent  worldParameterCalibration
```

### 4.1 Capability → existing module map (**this is your REUSE table**)

| # | Capability | Existing module(s) | Verdict |
|---|---|---|---|
| 1 | Problem formalization | `orchestrator/nl.ts::parseProblem`; `experimentFabric/hypothesisLoop.ts::HYPOTHESIS_PROBLEMS`; `discovery/discoveryGoalIntent.ts::parseDiscoveryGoal` | **REUSE** |
| 2 | Knowledge layer | `knowledge/supplementalRegistry.ts` (`KnowledgeEpistemicStatus`!), `knowledge/registry.ts`, `evidenceProvenance.ts`, `engineeringGraph/provenance.ts`, `epistemicReliability.ts`, `dataProvenance.ts` | **EXTEND** — provenance axes exist; a fact/claim index does not |
| 3 | Hypothesis engine | `novelHypothesisGenerator.ts` (ORPHAN), `experimentFabric/hypothesisLoop.ts::generateCompetingHypotheses`, `experimentFabric/beliefRevision.ts::Hypothesis`, `worldCounterfactual.ts::generateAlternativeHypotheses`, `competingModels.ts` | **REUSE** — four generators already exist |
| 4 | Mechanism generation | `mechanismGeneration.ts::generateJointMechanismFrom`, `mechanismInteraction.ts` | **REUSE** |
| 5 | Model generation / modification | `modelSpace.ts` (`generateModelSpace`/`mutateModelSpec`), `residualStructure.ts::proposeModelsFromResiduals`, `structuralDiscovery.ts` (ORPHAN), `falsifiedModelRegistry.ts`, `modelGraph/`, `mathExpr.ts` | **REUSE** for selection+modification; **NEW only** for symbolic invention via the `mathExpr` ↔ `ModelSpec` bridge (§3.9) |
| 6 | Prediction engine | `predictionRegistry.ts` (ORPHAN — freeze-ordering already solved), `predictionVerification.ts`, `conformalPrediction.ts` (ORPHAN) | **REUSE** |
| 7 | Experiment design | `differentiatingExperimentGenerator.ts`, `observationGap.ts`, `experimentFulfillment.ts` | **REUSE** |
| 8 | Information gain / discrimination | only surrogates exist: `discriminability` in σ-units, `falsificationPowerAt`, `intervalNarrowing.ts`, `leverCriterion.ts` | **NEW (justified)** — see §6.0: **no numeric information gain exists anywhere** |
| 9 | Research state | `scienceMemory.ts` (204 KB, ~130 exports), `epistemicStateGraph.ts`, `discoveryStrategy.ts::StrategyRun`, `discoveryGraph.ts`, `provenance/recordStore.ts` | **NEW assembly over existing parts** — no `ResearchState` module exists, but do **not** add persistence |
| 10 | Evidence update | `experimentFabric/beliefRevision.ts` (log-odds Bayesian + history), `evidenceImpact.ts`, `discoveryAdmission.ts` | **REUSE** |
| 11 | Self-falsification | `selfFalsificationBattery.ts` — 13 probes (ORPHAN), `tautologyGate.ts`, `integrityGates.ts`, `blindDataset.ts` (ORPHAN) | **REUSE** |
| 12 | Next-experiment selection | `nextAction.ts` (unifies 5 selectors), `nextQuestion.ts`, `hypothesisLoop.ts::selectNextHypothesisExperiment`, `beliefRevision.ts::selectMostDiscriminatingExperiment` | **REUSE** |
| 13 | Autonomous research loop | `campaignOrchestrator.ts::runAutonomousOrchestrator` (**zero runtime callers**, §0.1), `discoveryCampaign.ts::runDiscoveryCampaign`, `discoveryLoop.ts`, `genuineDiscoveryOrchestrator.ts` (ORPHAN), `discoveryOrchestrator.ts` | **WIRE, then EXTEND** — the loop exists and runs nothing; none of them reaches `runScientificDiscovery` |
| 14 | Novelty test | `noveltyGate.ts` (L1–L4), `discoveryContracts.ts` (ORPHAN, L1–L6 taxonomy), `literatureNoveltyAdapter.ts` (ORPHAN, real OpenAlex/Crossref), `discoveryCertificate.ts` (ORPHAN), `core/benchmark/` (whole orphaned bench suite) | **REUSE** |

**Only rows 8, 9 and the invention half of 5 are genuinely NEW.** Everything else is
connection work. If your delivered table disagrees with this one, justify each difference
against the named module.

### 4.2 Contracts you should build on, verbatim signatures

```ts
// noveltyGate.ts
export type NoveltyLevel = 'UNKNOWN' | 'NOT_NEW' | 'POSSIBLY_NOVEL' | 'NOVEL_WITHIN_CHECKED_CORPUS';
export type ResultLabel = 'DISCOVERY' | 'REPRODUCTION' | 'HYPOTHESIS_UNKNOWN' | 'NO_ACCESS_DECLARED';
export function assessNovelty(input: NoveltyGateInput): NoveltyAssessment;
export function classifyResultLabel(input: ClassifyResultLabelInput): ResultLabelDecision;
export function assertValidResultLabel(input: AssertValidResultLabelInput): void;  // throws NoveltyGateViolationError
export function recordKnownFinding(input: RecordKnownFindingInput): KnownFindingRecord;
export function listKnownFindings(): readonly KnownFindingRecord[];

// novelHypothesisGenerator.ts
export interface CompetingExplanation { /* … */ }
export interface NovelHypothesis { /* mechanism, competingExplanations, falsifier, requiredExperiment, … */ }
export interface GenerateNovelHypothesisInput { /* … */ }
export class NovelHypothesisViolationError extends Error {}
export function assertHypothesisWellFormed(input: Pick<GenerateNovelHypothesisInput,'mechanism'|'competingExplanations'|'falsifier'|'requiredExperiment'>): void;
export function generateNovelHypothesis(input: GenerateNovelHypothesisInput): NovelHypothesis;
```
→ note the shape it already enforces: **a hypothesis is not well-formed without a mechanism,
competing explanations, a falsifier, and a required experiment.** Reuse that invariant.

```ts
// predictionRegistry.ts  (freeze-before-observe, already solved)
export interface PredictionInterval { /* … */ }
export interface PredictionInput { /* … */ }
export interface RegisteredPrediction extends PredictionInput { /* … */ }
export interface PredictionRegistry { /* … */ }
export function createPredictionRegistry(registryId: string): PredictionRegistry;
export function registerPrediction(registry, input: PredictionInput): RegisteredPrediction;
export function listPredictions(registry): readonly RegisteredPrediction[];
export type PredictionOrderingVerdict = 'FROZEN_BEFORE_OBSERVED' | 'VIOLATED';
export function checkPredictionOrdering(registry, outcome: PredictionOutcome): PredictionCheck;
export function registryFingerprint(registry: PredictionRegistry): string;
```

```ts
// discoveryContracts.ts  (the discovery taxonomy — reuse, don't re-taxonomize)
export type DiscoveryStatus = /* 6-value union */;
export type DiscoveryStrategy = 'RESIDUAL' | 'ANOMALY' | 'SCALING' | 'CROSS_DOMAIN' | 'CONTRADICTION' | 'MECHANISM' | 'TEMPORAL_SPATIAL';
export type NoveltyOverall = 'KNOWN' | 'NO_KNOWN_PRIOR_FOUND' | 'UNVERIFIABLE' | 'NO_ACCESS';
export type DisjointnessProof = 'DIFFERENT_SOURCE' | 'DIFFERENT_TIME_WINDOW' | 'DISJOINT_SKY_REGION' | 'HELD_OUT_SPLIT';
export type ExternalValidationStatus = 'NOT_SOUGHT' | 'PENDING' | 'CONFIRMED' | 'REFUTED';
export type SelfFalsificationProbeName = /* 13-value union */;
export const ALL_SELF_FALSIFICATION_PROBES: readonly SelfFalsificationProbeName[];
export interface EvidenceRef { /* id, kind, summary */ }
export interface NoveltyEvidence { /* searchedCorpus, matchedPriorArt, overall */ }
export interface DiscoveryRecord { /* the full discovery claim */ }
export interface DiscoveryChainLink { /* … */ }
export class DiscoveryContractViolationError extends Error {}
export function makeEvidenceRef(id: string, kind: string, summary: string): EvidenceRef;
export function assertNoveltyEvidenceHonest(evidence: NoveltyEvidence): void;
export function assertReplicationDisjoint(discoveryDatasetFingerprint: string, replicationDatasetFingerprint: string): void;
export function assertSelfFalsificationComplete(report: SelfFalsificationReport): void;
export function classifyDiscoveryStatus(input): /* DiscoveryStatus */;
export function assertValidDiscoveryStatus(input): void;
```

### 4.3 THE 19 ORPHANED MODULES — built, tested, **never reached from the running app**

Mechanically verified against `src/__tests__/moduleReachability.test.ts`'s `ALLOWED_ORPHANS`:

```
core/agent/bannedStringScanner.ts        core/agent/blindDataset.ts
core/agent/causalInference.ts            core/agent/causalLadder.ts
core/agent/conformalPrediction.ts        core/agent/discoveryCertificate.ts
core/agent/discoveryContracts.ts         core/agent/discoveryReplicationEngine.ts
core/agent/discoveryTrace.ts             core/agent/genesisAdjudicationProtocol.ts
core/agent/genuineDiscoveryOrchestrator.ts  core/agent/literatureNoveltyAdapter.ts
core/agent/novelHypothesisGenerator.ts   core/agent/predictionRegistry.ts
core/agent/proofLadder.ts                core/agent/qe4RegimeInquiryLoop.ts
core/agent/selfFalsificationBattery.ts   core/agent/sovereignTruthAnswer.ts
core/agent/structuralDiscovery.ts
```

**The newest and most Mind-critical organs are exactly the orphaned ones.** Bringing them
onto the live path is a first-class deliverable, not a side effect. `moduleReachability.test.ts`
enforces this: when a module becomes genuinely reachable from `main.tsx`, its
`ALLOWED_ORPHANS` entry **must be removed** or the test fails.

---

## 5. YOUR PRIMARY DELIVERABLE — THE BRIDGE

The one thing that does not exist in any form.

### 5.1 `MindCandidate` → `Candidate` projection

The Mind reasons in `ModelSpec` / `NovelHypothesis` / `DiscoveryRecord`. The backbone
consumes `Candidate`. Define a lossless, fingerprinted projection:

```
ModelSpec | NovelHypothesis  →  Candidate {
  candidateId    : stable fingerprint of the model/hypothesis (modelSpecFingerprint or equivalent)
  mechanismClass : the REAL mechanism identity — never a renamed variant (fake diversity is a test failure)
  score          : 0 at generation; real score only after the domain's own ranking runs
  riskGrade      : 'UNSCREENED' until a real gate assigns one
  evidenceRefs   : real refs into your knowledge layer / EvidenceConnectorStore artifacts
}
```

Rich Mind state (hypotheses, competing explanations, predictions, information-gain
figures) travels on a **diagnostics side-channel object returned alongside `adapters`** —
the pattern D-058/D-059 already established:

```ts
export interface MindAdapterBundle {
  readonly adapters: OrchestratorAdapters;     // the generic contract, untouched
  readonly diagnostics: MindAdapterDiagnostics; // rich real state for UI/audit/tests
}
```

`orchestrator.ts` never reads diagnostics. This is how you get expressiveness without
touching the contract.

### 5.2 `createMindAdapters(opts): MindAdapterBundle`

Implements every `OrchestratorAdapters` port by delegating to existing modules:

| Port | Delegate to |
|---|---|
| `generate` | your Mind generator over `modelSpace.generateModelSpace` / `mechanismGeneration` / `novelHypothesisGenerator` |
| `normalizeDedup` | `modelSpecFingerprint` / `compareModelSpecs` |
| `hardFilter` | `tautologyGate`, `integrityGates`, `falsifiedModelRegistry` (never re-propose a falsified model) |
| `diversity` | real mechanism-class distinctness — report, don't silently drop |
| `rank` | `modelSelectionScore` + `holdoutScore` (**never** an economic term) |
| `top10` / `top2` | slice; no length games |
| `seal` / `verifySealUnchanged` | `genesisAdjudicationProtocol.preRegister` + `freeze` |
| `planExperiments` | `differentiatingExperimentGenerator`, `observationGap` |
| `execute` | a real backend; fail closed if unavailable — **never** substitute a model output |
| `ingestEvidence` | your knowledge layer + custody refs (hash/hashPolicy, **not** artifactId) |
| `falsify` | `selfFalsificationBattery` (13 probes) |
| `adjudicate` | `genesisAdjudicationProtocol` — return `WINNER` only if the real functions say so |
| `compare` | the real reason string from the adjudicator |
| `buildRecipe` | a domain-scoped recipe builder, or `null` (LOCKED) |
| `recommendNext` | `nextAction` / `nextQuestion` |
| `hash` | `fnv1a(canonicalJson(v))` |

### 5.3 `runMindDiscovery(opts)` entry point + registry entry

Same shape as §2.10. Extend `GenesisDomainId` with `'MIND'` and add the descriptor to
`GENESIS_DOMAINS`. Unknown domain ids must keep failing closed.

### 5.4 `runResearch(problem, options)` — the OUTER multi-round loop

The single genuinely new orchestration piece. It **calls `runScientificDiscovery` once per
round** and decides whether to run another:

```
round N: formalize → knowledge → hypotheses → mechanisms → models → predictions (FROZEN)
       → discriminating experiment → runScientificDiscovery(...)   ← existing backbone, unmodified
       → evidence update → self-falsification → ResearchState transition
       → NEXT_EXPERIMENT | SCIENTIFIC_STOP | NO_WINNER | EXECUTION_BLOCKED
```

It is **not** a second orchestrator: it never re-implements a single one of the 20 stages.
It sequences *rounds*. Terminal states are the four above; a WINNER emerges only from the
existing gate. Never force one. State transitions must be append-only and replayable.

---

## 6. THE GENUINELY MISSING ORGANS (build these NEW, justified)

### 6.0 What was mechanically verified NOT to exist

Each of these was confirmed by repo-wide grep at `62bfcb2`. These — and only these — are
your safe NEW territory:

1. **No numeric information gain.** `informationGain|expectedInformationGain|infoGain|
   entropyReduction|mutualInformation` matches only `core/agent/cyberTestPlanner.ts` (a
   cyber-domain test planner, unrelated to scientific EIG). **`'NO_INFORMATION_GAIN'` in
   `CampaignStopReason`/`OrchestratorStopReason` is a string label, not a computed
   quantity.** Existing surrogates: `discriminability` in σ-units
   (`differentiatingExperimentGenerator.ts`, `observationGap.ts`) and `falsificationPowerAt`
   (`discoveryCampaign.ts`). A real expected-information-gain / entropy-reduction selector
   does not exist.
2. **No `ResearchState` module.** Zero matches. De-facto state is split across
   `scienceMemory.ts` (persistence), `discoveryStrategy.ts::StrategyRun` (normalized run
   shape) and `epistemicStateGraph.ts` (belief graph).
3. **No general knowledge graph / triple store / cross-campaign claim index.**
   `discoveryGraph.ts` is per-campaign; `scienceMemory.ts` is per-artefact-envelope;
   `supplementalRegistry.ts` is a hand-curated frozen array.
4. **No bridge between `mathExpr.ts` symbolic ASTs and `modelSpace.ts` `ModelSpec`s.**
5. **No `modelTournament` core module** — only a React panel; the real logic is
   `experimentFabric/modelVsModelCompare.ts`.
6. **The autonomous loop has no runtime caller** (§0.1).

### 6.1 Fact-level knowledge layer

`knowledge/registry.ts` routes to domains; nothing indexes facts/claims/observations/
equations/contradictions across campaigns. Build that index — but:

- **Reuse `KnowledgeEpistemicStatus`** from `supplementalRegistry.ts` (`FACT` / `MODEL` /
  `THEORY` / `HYPOTHESIS` / `SCENARIO_ASSUMPTION` / `FICTIONAL_REFERENCE`), extending the
  union if needed. **Do not invent a parallel status axis.**
- Keep it orthogonal to `EvidenceClass` (strength) and `DataProvenance` (origin).
- Reuse `propagateProvenance` for weakest-link derivation strength.
- Persist through `provenance/recordStore.ts`, not a new store.
- **An LLM statement is never a `FACT`.** It enters as `HYPOTHESIS` at best, with
  `llmAssisted: true` recorded.

### 6.2 Structured problem representation

Referencing `ProblemRecord.problemId` — entities, variables, observables, unknowns,
candidate causal relations, falsification targets. Deterministic and replayable for a
given (input, knowledge snapshot). Reuse `HYPOTHESIS_PROBLEMS` and `parseDiscoveryGoal`
as prior art for the shape.

### 6.3 `ResearchState`

Append-only/event-sourced, fingerprinted per transition, assembled **over**
`epistemicStateGraph` + `scienceMemory` + `StrategyRun` rather than re-persisting any of
them. Storage via `KeyedRecordStore`.

### 6.4 A real information-gain / discrimination metric

The one genuinely absent scientific primitive. Build it explicitly on top of the existing
σ-unit `discriminability` and `falsificationPowerAt` rather than beside them, and
**document precisely what your metric means and what it does NOT mean** — if it is not a
true expected-information-gain in the information-theoretic sense, say so in the name and
the docstring.

### 6.5 The `mathExpr` ↔ `ModelSpec` bridge (model invention)

The only credible route to model forms outside the fixed `ModelBasis` vocabulary. Whatever
you generate stays a `MODEL_CANDIDATE` until tested, carries `ModelLineage`, and is
fingerprinted and falsifiable like any other spec.

### 6.6 The bridge and outer loop of §5, and the novelty harness of §7 — both mandatory.

---

## 7. THE NOVELTY TEST — MANDATORY, AND THE THING WE WILL JUDGE YOU ON

Deliver a test that mechanically separates, for a given run:

| Level | Meaning |
|---|---|
| **L0** | fixed candidate retrieval — the candidate was already in a list |
| **L1** | template mutation — a pre-declared form with different parameters |
| **L2** | model modification — `mutateModelSpec` produced a form not in the initial space |
| **L3** | genuine structural generation — a model/mechanism composition no list contained |

The test must report the **actual level reached**, computed from lineage
(`ModelLineage`, `modelSpecFingerprint`, the initial `generateModelSpace` set), **not
asserted**. Reuse `noveltyGate.assessNovelty` and `discoveryContracts.assertNoveltyEvidenceHonest`
for the prior-art axis.

**If the package only reaches L1, say so.** A truthful "L1, and here is exactly why" is a
PASS. A claim of L3 that the test cannot demonstrate is an outright FAIL of the mission.

---

## 8. FAIL-CLOSED REQUIREMENTS

Malformed problem · insufficient knowledge provenance · inconsistent model · missing
prediction · missing falsification criterion · inability to freeze · unavailable backend ·
invalid evidence provenance · replay mismatch · missing experiment result · corrupted
ResearchState · ambiguous terminal decision · unknown domain id.

Follow the established idiom: a typed error class with a `code` union
(`LowerHarmFailClosedError` / `E2E01FailClosedError` / `FailClosedError` are the models),
converted at the entry point into a structured `EXECUTION_BLOCKED` result — never an
uncaught throw, never silently swallowed.

---

## 9. MANDATORY TEST PACKAGE — NEGATIVE-FIRST

Write the failing/negative case first in every group.

1. problem formalization 2. malformed problem → NEEDS_INPUT 3. knowledge provenance
4. hypothesis generation 5. mechanism diversity (real, not renamed) 6. model generation
7. prediction generation 8. prediction freeze ordering (`FROZEN_BEFORE_OBSERVED` vs `VIOLATED`)
9. experiment design 10. information gain / discrimination 11. ResearchState transition
12. evidence update 13. self-falsification 14. next-experiment selection 15. stopping condition
16. NO_WINNER path 17. existing WINNER → Recipe integration still intact
18. replay determinism 19. synthetic-vs-real boundary 20. economic/public-value firewall
21. unavailable-backend fail-closed 22. **novelty/discovery level test (§7)**
23. autonomous research-loop E2E 24. unknown domain id fails closed
25. synthetic fixture unreachable from PRODUCTION

**Economic firewall (absolute):** no cost/ROI/public-value/funding field may exist on any
type read by any ranking or adjudication function. Prove it structurally — inject such
fields onto a real record and assert byte-identical ranking output.

Test conventions: **vitest**, files at `packages/frontend/src/__tests__/*.test.ts`,
`import { describe, expect, it } from 'vitest'`.

---

## 10. HARD PROHIBITIONS

No second orchestrator / ranker / adjudicator / falsification engine / recipe engine /
evidence store / hash provider / NL parser / evidence taxonomy / honesty taxonomy.
No modification of `orchestrator.ts` decision logic, D-047, D-048, D-050, Genesis Core, or
any historical campaign or anchor. No threshold, veto, or evidence-rule changes. No
hardcoded or forced winner. No post-hoc predictions. No LLM output silently promoted to
evidence. No model output presented as a real-world observation. No synthetic evidence
labelled real. No economic ranking inside scientific discovery. No cosmetic "autonomy".
**Async ports.** **`artifactId` in any replay-sensitive value.**

---

## 11. HISTORY ANCHORS — Claude re-verifies these by execution after integration

`npm run e2e:gov-drug` → 18/18, `399221f5` / `f528c881`, `NO_WINNER` ·
`npm run e2e:gov-campaign` → 16/16, `5179c99f` ·
`npm run a2:demo` → 14/14, `CONFLICTING_EVIDENCE`, `a5e0f164` / `4642088a` ·
`npm run lower-harm-funnel:demo` → 5/5 ·
`npm run physics-world:demo` → 5 demos, M-COUL-001 `validationDelta=0.00196`.

If your package changes any of these numbers, it is rejected. Gate:
`vitest run` → `tsc --noEmit` → `eslint` → `npm run build` → banned-string scan →
`moduleReachability.test.ts`. Current baseline: **6299 frontend tests, 0 failures; 402
backend tests, 0 failures.**

---

## 12. SUCCESS CRITERION

A genuinely new problem → structured representation → generated hypotheses → generated
mechanisms → candidate model(s) → **frozen** pre-experiment predictions → discriminating
experiment → **the existing backbone** → evidence → falsification → ResearchState update →
next experiment or a scientifically justified stop → eventual WINNER / NO_WINNER, and for
a legitimate winner only, WinnerRecord → ResearchRecipe.

**A package that reports an honest `NO_WINNER` with a truthful novelty level PASSES. A
package that reports a WINNER without new real evidence FAILS.**

---

## 13. YOUR DELIVERABLE

**A.** Architecture summary — **opening with your REUSE / EXTEND / NEW table covering all
14 capabilities, justified against §4.1. Any NEW must state why the existing module is
insufficient.**
**B.** Complete implementation package (coherent files, not snippets), with the file tree.
**C.** Tests per §9.
**D.** Integration instructions for Claude — exact order, exact expected wiring points.
**E.** Exact novelty boundary reached (§7), with the test that demonstrates it.
**F.** Exact REAL / SYNTHETIC_TEST_ONLY limitations of every component.
**G.** Exact known gaps and what you deliberately did not build.
**H.** Execution instructions.
**I.** Expected test results.

Where you had to assume a field name not quoted verbatim here, list the assumption in **G**
so Claude can correct it against the real file instead of discovering it as a compile error.

---

## 14. ALSO YOURS TO IMPLEMENT (beyond the 14 Mind capabilities)

1. **Mind ↔ backbone bridge** (§5) — highest priority; nothing like it exists. Concretely:
   join `DomainAdapter` (§3.8, the Mind's domain seam) to `OrchestratorAdapters` (§2.1,
   the backbone's port set).
2. **Give the autonomous loop a runtime caller** (§0.1) — `runAutonomousOrchestrator`,
   `findNextDirections`, `assessNovelty` and `fulfillExperimentGap` currently execute only
   in tests. Wiring them into a real path is a first-class deliverable.
3. **Re-wiring the 19 orphans** (§4.3) onto the live path, with `ALLOWED_ORPHANS` entries
   removed — `moduleReachability.test.ts` fails if a now-reachable module keeps its entry.
4. **`runResearch()` outer multi-round loop** (§5.4).
5. **Fact-level knowledge index** reusing `KnowledgeEpistemicStatus` (§6.1).
6. **Structured problem representation** referencing `ProblemRecord` (§6.2).
7. **`ResearchState`** append-only event log + replay over existing stores (§6.3).
8. **A real information-gain metric** (§6.4) — the one absent scientific primitive.
9. **The `mathExpr` ↔ `ModelSpec` bridge** for genuine model invention (§6.5).
10. **Novelty-level harness L0–L3** (§7). Note `core/benchmark/` already holds an orphaned
    `discoveryBench*` suite (manifest, fixture data, adapter, scorer, runner) — check it
    before building a benchmark harness from scratch.
11. **A read-only Mind console projection** — same discipline as `GenesisConsole.tsx`:
   it computes NOTHING, renders only what the real functions returned, shows per run
   `domainId` / mode chip / prereg fingerprint / verdict / novelty level, and renders
   `EXECUTION_BLOCKED` explicitly.
12. **A runnable demonstrator script** (`scripts/genesis-mind-e2e.mjs`) in the style of
    `scripts/gov-drug-discovery-e2e-scenario.mjs`: numbered `OK/FAIL` property checks,
    exit 0 only if every property held, and a final honest `OUTCOME:` line.
13. **`docs/DECISIONS.md` entry draft** (next free `D-0NN`) in the established style:
    what was reused, what is new and why, what it does NOT do, the anchors, the gate.

Do not weaken the scope to "candidate generation." The deliverable is the scientific
reasoning layer, **connected to the machine that already works.**
