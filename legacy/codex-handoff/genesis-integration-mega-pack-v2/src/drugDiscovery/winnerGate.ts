import type { CandidateRecord } from "./types.js";
import type { ResearchGateConfig } from "./config.js";
import { evidenceGate } from "./evidenceGate.js";
import { scoreResearchPriority } from "./scoring.js";

export interface ResearchSelection {
  selectedCandidateIds: string[];
  rejected: Array<{ candidateId: string; reasons: string[]; conflicting: boolean }>;
  label: "RESEARCH_SELECTION_NOT_CLINICAL_WINNER";
}

/** Genuine multi-conjunct gate (audit-confirmed): evidence-class/independent-source
 * criteria AND safety veto AND conflict-free, THEN score floor — not a bare
 * threshold. `rejected` entries now carry the explicit `conflicting` flag from
 * `evidenceGate` instead of requiring callers to string-match `reasons`. */
export function selectResearchPriorities(
  candidates: readonly CandidateRecord[],
  cfg: ResearchGateConfig
): ResearchSelection {
  const accepted: Array<{ id: string; score: number }> = [];
  const rejected: Array<{ candidateId: string; reasons: string[]; conflicting: boolean }> = [];

  for (const candidate of candidates) {
    const gate = evidenceGate(candidate, cfg);
    if (!gate.pass) {
      rejected.push({ candidateId: candidate.identity.candidateId, reasons: gate.reasons, conflicting: gate.conflicting });
      continue;
    }
    const score = scoreResearchPriority(candidate, cfg);
    if (score.score < cfg.priorityFloor) {
      rejected.push({ candidateId: candidate.identity.candidateId, reasons: [`priority score ${score.score.toFixed(3)} below floor ${cfg.priorityFloor}`], conflicting: false });
      continue;
    }
    accepted.push({ id: candidate.identity.candidateId, score: score.score });
  }

  accepted.sort((a,b)=>b.score-a.score || a.id.localeCompare(b.id));
  return {
    selectedCandidateIds: accepted.map((x)=>x.id),
    rejected,
    label: "RESEARCH_SELECTION_NOT_CLINICAL_WINNER"
  };
}
