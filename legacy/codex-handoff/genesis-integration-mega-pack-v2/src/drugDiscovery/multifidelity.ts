import type { CandidateEvidencePort, MolecularEnginePort } from "./ports.js";
import type { CandidateRecord, ComputeResult } from "./types.js";

const STAGE_ORDER = ["CHEAP", "DOCKING", "QM", "ADMET"] as const;

export class MultiFidelityCampaign {
  constructor(
    private readonly engines: MolecularEnginePort[],
    private readonly evidence: CandidateEvidencePort
  ) {}

  async run(candidate: CandidateRecord, maxStages = 4): Promise<ComputeResult[]> {
    const out: ComputeResult[] = [];
    for (const stage of STAGE_ORDER.slice(0, maxStages)) {
      const engine = this.engines.find((e) => e.stage === stage);

      /**
       * FIX (red-team finding): V1's `if (!engine) continue;` silently skipped an
       * unbound stage with NO ComputeResult and no ledger entry at all — weaker than
       * the required "unavailable engine -> explicit BLOCKED" rule, since a host that
       * simply forgot to wire a stage got silence instead of a visible block.
       * "No engine bound" is now treated identically to "engine bound but
       * available()===false": both produce an explicit BLOCKED record.
       */
      if (!engine) {
        const blocked: ComputeResult = {
          candidateId: candidate.identity.candidateId,
          engineId: `UNBOUND:${stage}`,
          stage,
          status: "BLOCKED",
          outputs: {},
          provenance: []
        };
        candidate.compute.push(blocked);
        out.push(blocked);
        await this.evidence.append({ type: "CANDIDATE_COMPUTE_RESULT", candidateId: candidate.identity.candidateId, payload: blocked });
        continue;
      }

      const available = await engine.available();
      if (!available) {
        const blocked: ComputeResult = {
          candidateId: candidate.identity.candidateId,
          engineId: engine.id,
          stage,
          status: "BLOCKED",
          outputs: {},
          provenance: []
        };
        candidate.compute.push(blocked);
        out.push(blocked);
        await this.evidence.append({ type:"CANDIDATE_COMPUTE_RESULT", candidateId:candidate.identity.candidateId, payload:blocked });
        continue;
      }

      const result = await engine.run(candidate);
      candidate.compute.push(result);
      out.push(result);
      await this.evidence.append({
        type: "CANDIDATE_COMPUTE_RESULT",
        candidateId: candidate.identity.candidateId,
        payload: result
      });

      if (result.status === "FAILED") break;
    }
    return out;
  }
}
