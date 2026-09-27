import type { CandidateRecord, ComputeResult } from "./types.js";

export interface CandidateEvidencePort {
  append(event: {
    type:
      | "CANDIDATE_INGESTED"
      | "CANDIDATE_IDENTITY_BLOCKED"
      | "CANDIDATE_STAGE_SELECTED"
      | "CANDIDATE_COMPUTE_RESULT"
      | "CANDIDATE_FALSIFIED"
      | "CANDIDATE_RESEARCH_GATE";
    candidateId: string;
    payload: unknown;
  }): Promise<void> | void;
}

/** RDKit/docking/QM/ADMET seam — this package computes no chemistry itself (confirmed
 * by audit: zero cheminformatics math anywhere in src/). `available()` returning false
 * AND a stage having no bound engine at all now both produce an explicit BLOCKED
 * ComputeResult (see `multifidelity.ts` fix) — never a fabricated/guessed result. */
export interface MolecularEnginePort {
  readonly id: string;
  readonly stage: "CHEAP" | "DOCKING" | "QM" | "ADMET";
  available(): Promise<boolean>;
  run(candidate: Readonly<CandidateRecord>): Promise<ComputeResult>;
}

export interface CandidateIdentityGuardPort {
  verify(candidate: Readonly<CandidateRecord>): Promise<{ valid: boolean; reasons: string[] }>;
}
