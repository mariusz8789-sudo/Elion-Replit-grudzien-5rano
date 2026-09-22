import type {
  AuthorizedScope,
  EvidenceRef,
  SecurityFinding,
  SecurityReport,
  ThreatHypothesis
} from "./types.js";

export interface RepoInventoryPort {
  inventory(scope: AuthorizedScope): Promise<{
    components: string[];
    entrypoints: string[];
    dependencies: string[];
    configFiles: string[];
  }>;
}

export interface ThreatModelPort {
  propose(input: {
    scope: AuthorizedScope;
    inventory: Awaited<ReturnType<RepoInventoryPort["inventory"]>>;
    existingFindings: SecurityFinding[];
  }): Promise<ThreatHypothesis[]>;
}

/**
 * One generic port for every analysis "kind" (static analysis, dependency, config,
 * secret scan, fuzz, SBOM, advisory). None of these is implemented by this package —
 * `EvidenceRef.kind` is a type-level vocabulary only. A real deployment needs one real
 * tool bound per kind (e.g. Semgrep/CodeQL for STATIC_ANALYSIS, OSV-Scanner/npm audit
 * for DEPENDENCY, gitleaks/trufflehog for SECRET_SCAN, a real fuzzer for FUZZ, syft/
 * cyclonedx for SBOM, an OSV/NVD client for ADVISORY). Do not credit any of these as
 * "implemented" from this package alone.
 */
export interface DefensiveAnalyzerPort {
  readonly id: string;
  readonly kind: EvidenceRef["kind"];
  supports(hypothesis: ThreatHypothesis): boolean;
  run(input: {
    scope: AuthorizedScope;
    hypothesis: ThreatHypothesis;
  }): Promise<{
    evidence: EvidenceRef[];
    finding?: SecurityFinding;
    hypothesisStatus: ThreatHypothesis["status"];
  }>;
}

export interface PatchProposalPort {
  propose(input: {
    finding: SecurityFinding;
    scope: AuthorizedScope;
  }): Promise<{
    patchId: string;
    summary: string;
    diffRef: string;
    requiresApproval: true;
  }>;
}

export interface ApprovalPort {
  approved(input: { action: string; artifactId: string; scopeId: string }): Promise<boolean>;
}

export interface RetestPort {
  retest(input: {
    finding: SecurityFinding;
    patchId: string;
    scope: AuthorizedScope;
  }): Promise<{ status: "PASS" | "FAIL"; evidence: EvidenceRef[] }>;
}

export interface CyberEvidencePort {
  append(event: {
    type:
      | "CYBER_CAMPAIGN_STARTED"
      | "CYBER_HYPOTHESIS_CREATED"
      | "CYBER_ANALYZER_RUN"
      | "CYBER_FINDING_RECORDED"
      | "CYBER_PATCH_PROPOSED"
      | "CYBER_PATCH_BUDGET_EXCEEDED"
      | "CYBER_RETEST_COMPLETED"
      | "CYBER_CAMPAIGN_COMPLETED";
    campaignId: string;
    payload: unknown;
  }): Promise<void> | void;
}

export interface SecurityReportPort {
  publish(report: SecurityReport): Promise<void> | void;
}

export interface CyberMatrixPort {
  record(input: {
    nodes: Array<{ id: string; type: string; labels: string[] }>;
    edges: Array<{ from: string; to: string; relation: string }>;
  }): Promise<void> | void;
}
