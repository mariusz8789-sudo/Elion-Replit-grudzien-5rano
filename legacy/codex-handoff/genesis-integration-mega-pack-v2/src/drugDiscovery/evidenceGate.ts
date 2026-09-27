import type { CandidateRecord, ResearchGateDecision } from "./types.js";
import type { ResearchGateConfig } from "./config.js";

/** FIX (red-team finding): `conflicting` is now a distinct, explicit field instead of
 * being indistinguishable from any other rejection reason in the `reasons[]` array —
 * see types.ts's `CandidateStatus.CONFLICTING_EVIDENCE` and `pipeline.ts`, which route
 * a conflicting candidate differently from a plain evidence-insufficient rejection. */
export function evidenceGate(candidate: Readonly<CandidateRecord>, cfg: ResearchGateConfig): ResearchGateDecision {
  const reasons: string[] = [];
  const independent = new Set(
    candidate.evidence
      .filter((e) => e.strength >= cfg.minimumEvidenceStrength)
      .map((e) => e.independentSourceId)
  );
  if (independent.size < cfg.minimumIndependentEvidence) {
    reasons.push(`insufficient independent evidence: ${independent.size}/${cfg.minimumIndependentEvidence}`);
  }
  const maxSafety = Math.max(0, ...candidate.safetySignals.map((x) => x.severity));
  if (maxSafety > cfg.maximumSafetySeverity) {
    reasons.push(`safety veto: severity ${maxSafety} > ${cfg.maximumSafetySeverity}`);
  }
  const conflicts = candidate.evidence.flatMap((e) => e.conflicts);
  const conflicting = conflicts.length > 0;
  if (conflicting) reasons.push(`conflicting evidence: ${conflicts.length}`);
  return {
    candidateId: candidate.identity.candidateId,
    pass: reasons.length === 0,
    conflicting,
    reasons,
    label: "RESEARCH_ONLY_NOT_EFFICACY"
  };
}
