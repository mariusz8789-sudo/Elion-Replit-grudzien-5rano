export type AuthorizationMode = "REPOSITORY_ONLY" | "SANDBOX_RANGE" | "CI_EPHEMERAL";

/**
 * NOTE (red-team finding, safety-critical): this package contains zero network,
 * filesystem, or process-execution code anywhere (verified by full-source audit).
 * `AuthorizedScope` is therefore a self-consistency-checked DATA CONTRACT, not an
 * enforced sandbox boundary — it cannot itself guarantee `repositoryRefs`/`sandboxIds`
 * correspond to a real isolated environment, nor that a real analyzer tool a host binds
 * later will honor it. Real enforcement (OS/network/filesystem-level) is entirely the
 * host's responsibility; see `scope.ts::targetAllowed` and CODEX_INTEGRATION_PROMPT.md.
 */
export interface AuthorizedScope {
  scopeId: string;
  mode: AuthorizationMode;
  repositoryRefs: string[];
  sandboxIds: string[];
  allowNetworkTargets: string[];
  denyNetworkTargets: string[];
  expiresAt?: string;
}

export type FindingSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type FindingConfidence = "LOW" | "MEDIUM" | "HIGH";

export interface EvidenceRef {
  id: string;
  kind: "STATIC_ANALYSIS" | "DEPENDENCY" | "CONFIG" | "SECRET_SCAN" | "FUZZ" | "TEST" | "SBOM" | "ADVISORY" | "MANUAL";
  source: string;
  hash?: string;
}

export interface ThreatHypothesis {
  id: string;
  title: string;
  description: string;
  affectedComponents: string[];
  expectedIndicators: string[];
  priority: number;
  status: "OPEN" | "SUPPORTED" | "FALSIFIED" | "INCONCLUSIVE";
  evidenceRefs: string[];
}

export interface SecurityFinding {
  id: string;
  title: string;
  description: string;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  affectedComponents: string[];
  evidenceRefs: string[];
  reproducibility: "REPRODUCIBLE" | "PARTIAL" | "NOT_REPRODUCED";
  proposedFix?: string;
  regressionTestRef?: string;
  retestStatus?: "NOT_RUN" | "PASS" | "FAIL";
}

export interface SecurityCampaignBudget {
  maxAnalyzerRuns: number;
  maxHypotheses: number;
  maxPatchProposals: number;
}

export interface SecurityCampaignState {
  campaignId: string;
  scope: AuthorizedScope;
  hypotheses: ThreatHypothesis[];
  findings: SecurityFinding[];
  analyzerRuns: number;
  patchProposals: number;
  status: "RUNNING" | "WAITING_APPROVAL" | "COMPLETE" | "BLOCKED";
}

export interface SecurityReport {
  campaignId: string;
  findings: SecurityFinding[];
  hypotheses: ThreatHypothesis[];
  summary: string;
  evidenceRefs: string[];
}
