import type { CandidateEvidencePort, CandidateIdentityGuardPort, MolecularEnginePort } from "./ports.js";
import type { CandidateRecord, ComputeResult, ResearchGateDecision } from "./types.js";
import type { ResearchGateConfig } from "./config.js";
import { structuralIdentityCheck } from "./identity.js";
import { MultiFidelityCampaign } from "./multifidelity.js";
import { evidenceGate } from "./evidenceGate.js";
import { falsifyCandidate, type FalsificationResult } from "./falsification.js";
import { scoreResearchPriority, type ResearchPriorityScore } from "./scoring.js";

/**
 * FIX (red-team finding, most significant): V1 shipped identity/evidence/compute/
 * falsification/scoring/gate as separate, correctly-labeled building blocks with NO
 * orchestrating pipeline anywhere — `index.ts` was only a barrel re-export, and
 * `CandidateRecord.status` was never assigned by any function in the package. This
 * module is the real, wired pipeline the README implied:
 *   identity guard -> multi-fidelity compute -> falsification -> evidence gate
 *   (incl. CONFLICTING_EVIDENCE) -> research-priority score -> final status.
 * `candidate.status` is now genuinely transitioned through the state machine, and the
 * identity guard port (dead in V1) is actually called and can BLOCK a candidate before
 * any compute stage runs.
 */
export interface DrugDiscoveryPipelineDeps {
  identityGuard: CandidateIdentityGuardPort;
  engines: MolecularEnginePort[];
  evidence: CandidateEvidencePort;
}

export interface PipelineResult {
  candidateId: string;
  finalStatus: CandidateRecord["status"];
  identityIssues: string[];
  computeResults: ComputeResult[];
  gate?: ResearchGateDecision;
  falsification?: FalsificationResult;
  score?: ResearchPriorityScore;
}

export async function runCandidatePipeline(
  candidate: CandidateRecord,
  deps: DrugDiscoveryPipelineDeps,
  cfg: ResearchGateConfig
): Promise<PipelineResult> {
  candidate.status = "INGESTED";
  await deps.evidence.append({ type: "CANDIDATE_INGESTED", candidateId: candidate.identity.candidateId, payload: { candidateId: candidate.identity.candidateId } });

  const structuralIssues = structuralIdentityCheck(candidate);
  const guardResult = await deps.identityGuard.verify(candidate);
  const identityIssues = [...structuralIssues, ...guardResult.reasons];

  if (structuralIssues.length > 0 || !guardResult.valid) {
    candidate.status = "BLOCKED";
    await deps.evidence.append({ type: "CANDIDATE_IDENTITY_BLOCKED", candidateId: candidate.identity.candidateId, payload: { identityIssues } });
    return { candidateId: candidate.identity.candidateId, finalStatus: candidate.status, identityIssues, computeResults: [] };
  }

  const campaign = new MultiFidelityCampaign(deps.engines, deps.evidence);
  const computeResults = await campaign.run(candidate);

  const falsification = falsifyCandidate(candidate);
  if (falsification.falsified) {
    candidate.status = "FALSIFIED";
    await deps.evidence.append({ type: "CANDIDATE_FALSIFIED", candidateId: candidate.identity.candidateId, payload: falsification });
    return { candidateId: candidate.identity.candidateId, finalStatus: candidate.status, identityIssues, computeResults, falsification };
  }

  const gate = evidenceGate(candidate, cfg);
  let score: ResearchPriorityScore | undefined;

  if (gate.conflicting) {
    candidate.status = "CONFLICTING_EVIDENCE";
  } else if (!gate.pass) {
    candidate.status = "REJECTED";
  } else {
    score = scoreResearchPriority(candidate, cfg);
    candidate.status = score.score >= cfg.priorityFloor ? "RESEARCH_PRIORITY" : "RETAINED";
  }

  await deps.evidence.append({
    type: "CANDIDATE_RESEARCH_GATE",
    candidateId: candidate.identity.candidateId,
    payload: { status: candidate.status, gate, score: score ?? null }
  });

  return {
    candidateId: candidate.identity.candidateId,
    finalStatus: candidate.status,
    identityIssues,
    computeResults,
    gate,
    falsification,
    ...(score ? { score } : {})
  };
}
