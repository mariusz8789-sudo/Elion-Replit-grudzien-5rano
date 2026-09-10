/**
 * Genesis Cyber Reasoning Engine — Domain Types
 *
 * Cyber domain types mapped onto existing Genesis primitives.
 * Does NOT create a competing framework.
 *
 * `DataProvenance` and `ReplayVerdict` are imported from the real Genesis
 * canonical modules (not re-declared locally) — the original draft of this
 * module (staged as raw text alongside this one) declared its own local
 * copies of both, which is exactly the "parallel subsystem" duplication
 * this project's rules forbid. There is nothing behavioral in a type-only
 * import, so this is safe even while this module stays isolated and
 * unwired from the rest of Genesis.
 */

import type { DataProvenance } from '../dataProvenance';
import type { ReplayVerdict } from '../matrixFoundation/replayVerdict';

export type { DataProvenance, ReplayVerdict };

// ============================================================
// CYBER OBSERVATION
// ============================================================

export interface CyberObservation {
  readonly observationId: string;
  readonly timestamp: string;
  readonly source: string;
  readonly dataProvenance: DataProvenance;
  readonly rawEvent: Record<string, unknown>;
  readonly normalizedMetrics: Record<string, number>;
  readonly severity: number;
}

// ============================================================
// CYBER ASSET / ATTACK SURFACE
// ============================================================

export interface CyberAsset {
  readonly assetId: string;
  readonly name: string;
  readonly type: 'SERVICE' | 'ENDPOINT' | 'PROTOCOL' | 'DATASTORE' | 'IDENTITY_BOUNDARY' | 'TRUST_BOUNDARY';
  readonly exposed: boolean;
  readonly parentAssetId: string | null;
}

export interface AttackSurface {
  readonly surfaceId: string;
  readonly targetId: string;
  readonly assets: readonly CyberAsset[];
  readonly totalExposed: number;
  readonly timestamp: string;
}

// ============================================================
// VULNERABILITY HYPOTHESIS
// ============================================================

export type SecurityVerdict = 'SUPPORTED' | 'FALSIFIED' | 'INCONCLUSIVE' | 'BLOCKED';

export interface VulnerabilityHypothesis {
  readonly hypothesisId: string;
  readonly statement: string;
  readonly vulnClass: string;
  readonly attackSurfaceRefs: readonly string[];
  readonly assumptions: readonly string[];
  readonly falsifier: string;
  readonly prediction: CyberPrediction;
  readonly timestamp: string;
}

export interface CyberPrediction {
  readonly predictionId: string;
  readonly hypothesisId: string;
  readonly testAction: string;
  readonly expectedObservable: Record<string, unknown>;
  readonly falsifyingObservable: Record<string, unknown>;
  readonly timestamp: string;
}

// ============================================================
// SECURITY TEST
// ============================================================

export interface SecurityTestSpec {
  readonly testId: string;
  readonly hypothesisId: string;
  readonly targetId: string;
  readonly preconditions: readonly string[];
  readonly testAction: CyberTestAction;
  readonly expectedObservable: Record<string, unknown>;
  readonly falsifyingObservable: Record<string, unknown>;
  readonly safetyConstraints: readonly string[];
  readonly evidenceCaptureFields: readonly string[];
  readonly deterministic: boolean;
  readonly timestamp: string;
}

export interface CyberTestAction {
  readonly type: 'HTTP_REQUEST' | 'AUTH_ATTEMPT' | 'PRIVILEGE_CHECK' | 'STATE_QUERY' | 'CONFIG_CHECK';
  readonly method: string;
  readonly path: string;
  readonly headers: Record<string, string>;
  readonly body: string | null;
}

export interface SecurityTestResult {
  readonly testId: string;
  readonly hypothesisId: string;
  readonly executedAt: string;
  readonly observedResult: Record<string, unknown>;
  readonly executionDurationMs: number;
  readonly dataProvenance: DataProvenance;
  readonly error: string | null;
}

// ============================================================
// SECURITY EVIDENCE
// ============================================================

export interface SecurityEvidence {
  readonly evidenceId: string;
  readonly testId: string;
  readonly hypothesisId: string;
  readonly observation: Record<string, unknown>;
  readonly prediction: Record<string, unknown>;
  readonly comparison: ComparisonResult;
  readonly dataProvenance: DataProvenance;
  readonly source: string;
  readonly timestamp: string;
}

export interface ComparisonResult {
  readonly predictionMatchesObservation: boolean;
  readonly falsifierTriggered: boolean;
  readonly verdict: SecurityVerdict;
  readonly reasoning: string;
  readonly metricComparisons: readonly MetricComparison[];
}

export interface MetricComparison {
  readonly fieldName: string;
  readonly predictedValue: unknown;
  readonly observedValue: unknown;
  readonly matches: boolean;
}

// ============================================================
// ATTACK PATH
// ============================================================

export type PathNodeStatus = 'UNVERIFIED' | 'SUPPORTED' | 'FALSIFIED' | 'BLOCKED';

export interface AttackPathNode {
  readonly nodeId: string;
  readonly hypothesisId: string;
  readonly description: string;
  readonly verificationStatus: PathNodeStatus;
  readonly evidenceRefs: readonly string[];
  readonly dataProvenance: DataProvenance;
  readonly required: boolean;
}

export interface AttackPathEdge {
  readonly edgeId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly relationship: string;
  readonly verificationStatus: PathNodeStatus;
  readonly evidenceRefs: readonly string[];
  readonly required: boolean;
}

export interface AttackPath {
  readonly pathId: string;
  readonly nodes: readonly AttackPathNode[];
  readonly edges: readonly AttackPathEdge[];
  readonly overallStatus: 'VERIFIED' | 'FALSIFIED' | 'BLOCKED' | 'UNVERIFIED' | 'PARTIALLY_VERIFIED';
  readonly verificationCoverage: number;
  readonly timestamp: string;
}

// ============================================================
// REMEDIATION
// ============================================================

export interface RemediationAction {
  readonly remediationId: string;
  readonly vulnerabilityHypothesisId: string;
  readonly action: string;
  readonly targetComponent: string;
  readonly appliedAt: string;
  readonly appliedBy: string;
}

export interface RemediationResult {
  readonly remediationId: string;
  readonly retestResult: SecurityTestResult;
  readonly beforeVerdict: SecurityVerdict;
  readonly afterVerdict: SecurityVerdict;
  readonly outcomeVerdict: 'VERIFIED' | 'FAILED' | 'DRIFT' | 'BLOCKED';
  readonly analysis: string;
  readonly timestamp: string;
}

// ============================================================
// CYBER INVESTIGATION (full E2E record)
// ============================================================

export interface CyberInvestigation {
  readonly investigationId: string;
  readonly targetId: string;
  readonly startedAt: string;
  readonly observations: readonly CyberObservation[];
  readonly attackSurface: AttackSurface;
  readonly hypotheses: readonly VulnerabilityHypothesis[];
  readonly testSpecs: readonly SecurityTestSpec[];
  readonly testResults: readonly SecurityTestResult[];
  readonly evidence: readonly SecurityEvidence[];
  readonly verdicts: ReadonlyMap<string, SecurityVerdict>;
  readonly attackPaths: readonly AttackPath[];
  readonly remediations: readonly RemediationResult[];
  readonly replayFingerprint: string;
  readonly replayVerdict: ReplayVerdict | null;
  readonly nextQuestion: string | null;
  readonly dataProvenance: DataProvenance;
}
