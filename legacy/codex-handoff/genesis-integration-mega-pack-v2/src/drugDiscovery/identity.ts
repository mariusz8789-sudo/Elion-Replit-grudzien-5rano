import type { CandidateRecord } from "./types.js";

/** Structural presence check only — NOT a real name/label semantic identity guard.
 * FIX (red-team finding): V1's `CandidateIdentityGuardPort` was defined but never
 * called anywhere in the package; `pipeline.ts` now calls it, alongside this
 * structural check, before any candidate proceeds to compute/evidence stages. */
export function structuralIdentityCheck(candidate: Readonly<CandidateRecord>): string[] {
  const reasons: string[] = [];
  if (!candidate.identity.candidateId.trim()) reasons.push("candidateId missing");
  if (!candidate.identity.canonicalSmiles.trim()) reasons.push("canonicalSmiles missing");
  if (candidate.identity.provenance.length === 0) reasons.push("identity provenance missing");
  return reasons;
}
