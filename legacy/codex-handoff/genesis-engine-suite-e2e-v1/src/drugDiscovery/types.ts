import type { ProvenanceRef } from "../common/types.js";
export type CandidateState="INGESTED"|"IDENTITY_REJECTED"|"CONFLICTING_EVIDENCE"|"BLOCKED"|"FALSIFIED"|"RESEARCH_PRIORITY";
export interface DrugCandidate {
  id:string;
  canonicalSmiles:string;
  provenance:ProvenanceRef[];
  state:CandidateState;
  evidence:Array<{id:string;strength:number;sourceId:string;supports:string[];conflicts:string[]}>;
  safety:Array<{id:string;severity:0|1|2|3}>;
  compute:Array<{stage:"CHEAP"|"DOCKING"|"QM"|"ADMET";engineId:string;status:"COMPLETED"|"BLOCKED"|"FAILED";outputs:Record<string,number|string|boolean|null>}>;
  rationale:string[];
}
