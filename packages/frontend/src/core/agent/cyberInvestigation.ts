import type { DataProvenance } from '../dataProvenance';
import type { HypothesisAssessment } from '../experimentFabric/scientificDiscovery';

/**
 * CYBER INVESTIGATION — the type contract, decided after inspecting the real
 * repo (not guessed from a Knowledge Pack).
 *
 * WHY THIS IS ITS OWN SHAPE, NOT A CYBER "QuestionShape" ON `runDiscovery`:
 * `discoveryOrchestrator.ts::DiscoveryRequest` is a closed union of exactly
 * `MechanismRequest | ParameterRequest | CalibrationRequest`, and all three
 * carry a WorldGraph-rooted substrate — `WorldLeverCatalog`, `InquiryLoopInput`
 * (a numeric `probeParameterId` swept over a declared system), or
 * `WorldParameterCalibrationInput` (a `hiddenValue`/`buildWorldAt` world). A
 * vulnerability hypothesis ("this endpoint bypasses auth") is not a numeric
 * lever on a simulated physical world; forcing it into that shape would mean
 * inventing a fake catalog/world purely to satisfy a type, which is worse
 * than an honest new shape.
 *
 * `replaySavedWorldDiscoveryRun`/`saveWorldDiscoveryRunToMemory` are equally
 * WorldGraph-specific: replay calls `resolveWorldLeverCatalog` and re-runs
 * `runAutonomousDiscoveryWithEngines`, the physics engine — there is no
 * physics engine here to re-run.
 *
 * WHAT IS GENUINELY REUSABLE, AND IS REUSED: the three verdict vocabularies
 * that are already substrate-agnostic by construction — `DataProvenance`
 * (`core/dataProvenance.ts`), `HypothesisAssessment`
 * (`core/experimentFabric/scientificDiscovery.ts`), and `ReplayVerdict`
 * (`core/matrixFoundation/replayVerdict.ts`, whose own doc comment says
 * exactly this: "a small, pure, reusable primitive a future domain... can
 * build its own replay function on top of, instead of re-deriving the same
 * if/else chain a third time") — plus the one persistence seam every other
 * investigation shape already uses, `saveExperiment` (`scienceMemory.ts`).
 * This is the same discipline every one of the six existing Science Memory
 * shapes already follows: each gets its OWN build/save/is/replay, because
 * each is a genuinely different substrate, but none invents a second
 * verdict vocabulary or a second persistence seam.
 *
 * `FalsificationCriterion` (`scientificDiscovery.ts`) is deliberately NOT
 * reused: it is `metric` + numeric `relation`/`tolerance`, built for a
 * continuous measurement. A security test's falsifier is categorical (a
 * response code, a header's presence), so `SecurityFalsifier` below is its
 * own, honest shape rather than a numeric relation bent to fit text.
 */

export const CYBER_INVESTIGATION_CONTRACT_VERSION = '1.0.0';

/** One real observation against the synthetic target — never fixture metadata read directly as a verdict. */
export interface CyberObservation {
  readonly observationId: string;
  readonly endpoint: string;
  readonly method: string;
  readonly statusCode: number;
  readonly responseSummary: string;
}

export type AttackSurfaceAssetKind = 'ENDPOINT' | 'AUTH_BOUNDARY' | 'DATA_STORE';

/** An asset MUST be derived from at least one real observation — `derivedFromObservationIds` is never empty. */
export interface AttackSurfaceAsset {
  readonly assetId: string;
  readonly kind: AttackSurfaceAssetKind;
  readonly derivedFromObservationIds: readonly string[];
}

export interface AttackSurface {
  readonly assets: readonly AttackSurfaceAsset[];
  readonly trustBoundaries: readonly string[];
}

export type VulnerabilityHypothesisKind = 'AUTH_BYPASS' | 'INJECTION' | 'PRIVILEGE_ESCALATION' | 'INFO_DISCLOSURE';

/**
 * A structured, matchable observable — not a free-text description. At least
 * one field must be present; `judgeVerdict`-style matching treats every
 * present field as an AND, every list field as an OR within itself.
 */
export interface ObservableExpectation {
  readonly statusCode?: number;
  readonly statusCodeIn?: readonly number[];
  readonly summaryContains?: readonly string[];
  readonly summaryNotContains?: readonly string[];
}

/** What would be seen if the hypothesis holds, and what would be seen if it does not — a categorical falsifier. */
export interface SecurityFalsifier {
  readonly predictedObservable: ObservableExpectation;
  readonly falsifyingObservable: ObservableExpectation;
}

/**
 * A hypothesis MUST be derived from real attack-surface observations
 * (`derivedFromAssetIds` non-empty, tracing back through `AttackSurfaceAsset`
 * to real `CyberObservation`s) — never a literal hardcoded in engine code.
 */
export interface VulnerabilityHypothesis {
  readonly hypothesisId: string;
  readonly kind: VulnerabilityHypothesisKind;
  readonly statement: string;
  readonly derivedFromAssetIds: readonly string[];
  readonly falsifier: SecurityFalsifier;
}

/** A structured observation of one controlled execution — what `judgeVerdict` actually compares against a falsifier. */
export interface ObservedResult {
  readonly statusCode: number;
  readonly body: string;
  readonly responseSummary: string;
}

/** A real, independent execution against the synthetic target — one per hypothesis test. */
export interface SecurityTestResult {
  readonly testId: string;
  readonly hypothesisId: string;
  readonly executedAt: string;
  readonly observedResult: ObservedResult;
  readonly provenance: DataProvenance;
}

/** The comparison of `SecurityFalsifier` against a `SecurityTestResult` — never read straight off fixture metadata. */
export interface SecurityVerdict {
  readonly hypothesisId: string;
  readonly assessment: HypothesisAssessment;
  readonly reasoning: string;
}

/**
 * An edge carries its OWN evidence (`derivedFromTestIds`), never inferred
 * from "both endpoint nodes are SUPPORTED" — the exact bug the prototype
 * package flagged in its own audit (Section 6.1, #5).
 */
export interface AttackPathEdge {
  readonly fromAssetId: string;
  readonly toAssetId: string;
  readonly derivedFromTestIds: readonly string[];
  readonly status: HypothesisAssessment;
}

export interface AttackPath {
  readonly assetIds: readonly string[];
  readonly edges: readonly AttackPathEdge[];
}

/**
 * `remediationId` MUST equal whatever identifier the synthetic target checks
 * to apply the fix — the exact bug the prototype package flagged (Section
 * 6.1, #1: `'rem-1'` vs `'admin-auth-fix'`). This type does not prevent that
 * mismatch by itself; the engine that constructs one is responsible for
 * reading the target's own check identifier, never inventing a fresh one.
 */
export interface RemediationAction {
  readonly remediationId: string;
  readonly targetAssetId: string;
  readonly description: string;
}

export interface CyberInvestigationResult {
  readonly investigationId: string;
  readonly goal: string;
  readonly observations: readonly CyberObservation[];
  readonly attackSurface: AttackSurface;
  readonly hypotheses: readonly VulnerabilityHypothesis[];
  readonly testResults: readonly SecurityTestResult[];
  readonly verdicts: readonly SecurityVerdict[];
  readonly attackPath: AttackPath | null;
  readonly remediation: RemediationAction | null;
  /** Present only once a remediation has actually been applied and independently re-tested. */
  readonly retestResult: SecurityTestResult | null;
  readonly retestVerdict: SecurityVerdict | null;
  /**
   * Hypothesis ids whose `verdicts` history (across every test this
   * investigation ran against them) holds BOTH a SUPPORTED_WITHIN_PROTOCOL
   * and a FALSIFIED_WITHIN_PROTOCOL assessment — preserved here, never
   * averaged away. Same rule `runAdaptiveInvestigation`'s own `conflicts`
   * already applies live in `cyberReasoningKernel.ts`; this field is what
   * lets that same information survive into the PERSISTED record (it did
   * not before — see `toCyberInvestigationResultFromAdaptive`'s doc).
   * Always an array, never omitted: empty means none, not "not computed".
   */
  readonly conflicts: readonly string[];
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isCyberObservation(value: unknown): value is CyberObservation {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return nonEmptyString(v.observationId) && nonEmptyString(v.endpoint) && nonEmptyString(v.method)
    && typeof v.statusCode === 'number' && Number.isFinite(v.statusCode) && nonEmptyString(v.responseSummary);
}

function isObservableExpectation(value: unknown): value is ObservableExpectation {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const hasAnyField = v.statusCode !== undefined || v.statusCodeIn !== undefined
    || v.summaryContains !== undefined || v.summaryNotContains !== undefined;
  if (!hasAnyField) return false;
  if (v.statusCode !== undefined && typeof v.statusCode !== 'number') return false;
  if (v.statusCodeIn !== undefined && !Array.isArray(v.statusCodeIn)) return false;
  if (v.summaryContains !== undefined && !Array.isArray(v.summaryContains)) return false;
  if (v.summaryNotContains !== undefined && !Array.isArray(v.summaryNotContains)) return false;
  return true;
}

function isVulnerabilityHypothesis(value: unknown): value is VulnerabilityHypothesis {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!nonEmptyString(v.hypothesisId) || !nonEmptyString(v.statement)) return false;
  if (!Array.isArray(v.derivedFromAssetIds) || v.derivedFromAssetIds.length === 0) return false;
  const falsifier = v.falsifier as Record<string, unknown> | undefined;
  return !!falsifier && isObservableExpectation(falsifier.predictedObservable) && isObservableExpectation(falsifier.falsifyingObservable);
}

function isObservedResult(value: unknown): value is ObservedResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.statusCode === 'number' && Number.isFinite(v.statusCode) && typeof v.body === 'string' && nonEmptyString(v.responseSummary);
}

function isSecurityTestResult(value: unknown): value is SecurityTestResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return nonEmptyString(v.testId) && nonEmptyString(v.hypothesisId) && nonEmptyString(v.executedAt)
    && isObservedResult(v.observedResult) && v.provenance === 'SIMULATED';
}

/**
 * Structural validation before anything is banked to Science Memory — the
 * same defensive stance `isSavedMechanismComposition`/
 * `isSavedResearchChainManifest` already take, applied to this shape's own
 * anti-fabrication requirements: every hypothesis must trace to real
 * observations, and there must be at least one of each of
 * observations/hypotheses/testResults/verdicts for a result to be a real
 * investigation rather than an empty shell.
 */
export function isWellFormedCyberInvestigation(value: unknown): value is CyberInvestigationResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!nonEmptyString(v.investigationId) || !nonEmptyString(v.goal)) return false;
  if (!Array.isArray(v.observations) || v.observations.length === 0 || !v.observations.every(isCyberObservation)) return false;
  if (!Array.isArray(v.hypotheses) || v.hypotheses.length === 0 || !v.hypotheses.every(isVulnerabilityHypothesis)) return false;
  if (!Array.isArray(v.testResults) || v.testResults.length === 0 || !v.testResults.every(isSecurityTestResult)) return false;
  if (!Array.isArray(v.verdicts) || v.verdicts.length === 0) return false;
  if (!Array.isArray(v.conflicts) || !v.conflicts.every((c) => typeof c === 'string')) return false;
  // Every hypothesis's derivedFromAssetIds must resolve to a real declared asset — anti-fabrication, not just non-empty.
  const attackSurface = v.attackSurface as AttackSurface | undefined;
  const assetIds = new Set((attackSurface?.assets ?? []).map((a) => a.assetId));
  for (const h of v.hypotheses as VulnerabilityHypothesis[]) {
    if (!h.derivedFromAssetIds.every((id) => assetIds.has(id))) return false;
  }
  // Every conflict must name a hypothesis this investigation actually declared — never a fabricated id.
  const hypothesisIds = new Set((v.hypotheses as VulnerabilityHypothesis[]).map((h) => h.hypothesisId));
  if (!(v.conflicts as string[]).every((id) => hypothesisIds.has(id))) return false;
  return true;
}
