import type { CandidateRecord } from "./types.js";
import type { ResearchGateConfig } from "./config.js";

export interface ResearchPriorityScore {
  candidateId: string;
  score: number;
  components: Record<string, number>;
  label: "RESEARCH_PRIORITY_NOT_EFFICACY";
}

/** Unchanged from V1 (audit confirmed: `label` is a compile-time-enforced literal
 * type, not just a comment — no numeric value in this package can pass through the
 * type system as an unlabeled efficacy percentage). */
export function scoreResearchPriority(candidate: Readonly<CandidateRecord>, cfg: ResearchGateConfig): ResearchPriorityScore {
  const evidenceQuality = candidate.evidence.length === 0
    ? 0
    : candidate.evidence.reduce((s, e) => s + e.strength, 0) / candidate.evidence.length;
  const safetyPenalty = Math.max(0, ...candidate.safetySignals.map((x) => x.severity)) / 3;
  const uncertainty = candidate.evidence.some((e) => e.class === "UNKNOWN") ? 1 : 0;
  const conflict = candidate.evidence.some((e) => e.conflicts.length > 0) ? 1 : 0;
  const computeSupport = candidate.compute.filter((x) => x.status === "COMPLETED").length / 4;

  const raw =
    evidenceQuality +
    computeSupport -
    safetyPenalty +
    uncertainty * cfg.uncertaintyPenalty +
    conflict * cfg.conflictPenalty;

  const score = Math.max(0, Math.min(1, raw / 2));

  return {
    candidateId: candidate.identity.candidateId,
    score,
    components: { evidenceQuality, computeSupport, safetyPenalty, uncertainty, conflict },
    label: "RESEARCH_PRIORITY_NOT_EFFICACY"
  };
}
