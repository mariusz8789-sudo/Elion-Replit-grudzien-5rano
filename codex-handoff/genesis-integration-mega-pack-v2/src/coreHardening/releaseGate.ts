/** ADAPTER/VALIDATOR UTILITY (fix area 6). */
export type GateStatus = "PASS" | "NEEDS_FIX" | "FAIL" | "NOT_RUN";

export interface GateCheck {
  id: string;
  required: boolean;
  status: GateStatus;
  evidenceRefs: string[];
  notes?: string;
}

export interface ReleaseGateReport {
  releaseId: string;
  checks: GateCheck[];
  decision: "GO" | "NO_GO";
  blockers: string[];
}

export function evaluateReleaseGate(releaseId: string, checks: readonly GateCheck[]): ReleaseGateReport {
  const blockers = checks
    .filter((x) => x.required && x.status !== "PASS")
    .map((x) => `${x.id}:${x.status}`);
  return {
    releaseId,
    checks: checks.map((x) => structuredClone(x)),
    decision: blockers.length === 0 ? "GO" : "NO_GO",
    blockers
  };
}
