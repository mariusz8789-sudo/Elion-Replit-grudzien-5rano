import type { CandidateRecord } from "./types.js";

export interface FalsificationResult {
  candidateId: string;
  falsified: boolean;
  reasons: string[];
}

export function falsifyCandidate(candidate: Readonly<CandidateRecord>): FalsificationResult {
  const reasons: string[] = [];
  const severe = candidate.safetySignals.filter((x) => x.severity >= 3);
  if (severe.length > 0) reasons.push("severe safety signal");
  const failedEngines = candidate.compute.filter((x) => x.status === "FAILED");
  if (failedEngines.length >= 2) reasons.push("multiple compute stages failed");
  const directConflicts = candidate.evidence.flatMap((e) => e.conflicts);
  if (directConflicts.length >= 2) reasons.push("multiple evidence conflicts");
  return {
    candidateId: candidate.identity.candidateId,
    falsified: reasons.length > 0,
    reasons
  };
}
