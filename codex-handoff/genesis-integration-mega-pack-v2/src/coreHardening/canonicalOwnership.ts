/**
 * ADAPTER/VALIDATOR UTILITY (fix area 6) — this module is a pure function over
 * externally-supplied facts (`ImplementationRef[]`). It is not itself a registry of the
 * real repo's canonical systems and does not introspect the repo. A real-repo
 * integration must feed it real `ImplementationRef` rows (gathered by Codex from the
 * actual source tree) as part of a release-gate step; this module never becomes a
 * second source of truth about what is canonical.
 */
export type CanonicalRole =
  | "WORLD_GRAPH"
  | "WORLD_GENERATOR"
  | "TEMPORAL_ENGINE"
  | "EVIDENCE_LEDGER"
  | "WORLD_JOURNAL"
  | "SCIENCE_MEMORY"
  | "SOLVER_ROUTER"
  | "KERNEL_PROVIDER_REGISTRY"
  | "COMMAND_EVENT_INFRA"
  | "HUMAN_DIGITAL_TWIN"
  | "EXPERIMENT_SESSION"
  | "PROVENANCE_REPLAY";

export interface ImplementationRef {
  role: CanonicalRole;
  symbol: string;
  path: string;
  productionReachable: boolean;
  sourceOfTruth: boolean;
  notes?: string;
}

const EXACTLY_ONE: ReadonlySet<CanonicalRole> = new Set([
  "WORLD_GRAPH",
  "WORLD_GENERATOR",
  "TEMPORAL_ENGINE",
  "EVIDENCE_LEDGER",
  "SOLVER_ROUTER",
  "KERNEL_PROVIDER_REGISTRY",
  "COMMAND_EVENT_INFRA",
  "HUMAN_DIGITAL_TWIN",
  "EXPERIMENT_SESSION",
  "PROVENANCE_REPLAY"
]);

export interface OwnershipIssue {
  role: CanonicalRole;
  severity: "ERROR" | "WARNING";
  message: string;
}

export function auditCanonicalOwnership(refs: readonly ImplementationRef[]): OwnershipIssue[] {
  const issues: OwnershipIssue[] = [];
  for (const role of EXACTLY_ONE) {
    const candidates = refs.filter((x) => x.role === role && x.sourceOfTruth);
    if (candidates.length !== 1) {
      issues.push({
        role,
        severity: "ERROR",
        message: `Expected exactly one source-of-truth implementation for ${role}, found ${candidates.length}.`
      });
    } else if (!candidates[0]!.productionReachable) {
      issues.push({
        role,
        severity: "ERROR",
        message: `${role} source of truth is not production reachable: ${candidates[0]!.path}`
      });
    }
  }

  const worldJournal = refs.filter((x) => x.role === "WORLD_JOURNAL" && x.sourceOfTruth);
  if (worldJournal.length > 1) {
    issues.push({
      role: "WORLD_JOURNAL",
      severity: "WARNING",
      message: "WorldJournal should be branch/temporal journal, not multiple competing sources of truth."
    });
  }

  const scienceMemory = refs.filter((x) => x.role === "SCIENCE_MEMORY" && x.sourceOfTruth);
  if (scienceMemory.length > 0) {
    issues.push({
      role: "SCIENCE_MEMORY",
      severity: "WARNING",
      message: "scienceMemory should be UX/saved-experiment persistence, not canonical scientific evidence truth."
    });
  }
  return issues;
}
