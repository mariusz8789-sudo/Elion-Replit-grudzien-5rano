export type TaskClass =
  | "WORLD_AUTHOR"
  | "CYBER_DEFENSIVE_REVIEW"
  | "CYBER_SCIENTIST_REASONING"
  | "SCIENTIFIC_REASONING"
  | "DRUG_CANDIDATE_RESEARCH"
  | "META_COGNITION"
  | "GENERAL_CODING";

export interface ProviderCapability {
  task: TaskClass;
  quality: 1|2|3|4|5;
  costClass: "LOW"|"MEDIUM"|"HIGH";
  structured: boolean;
}

export interface ProviderDescriptor {
  id: string;
  model: string;
  enabled: boolean;
  capabilities: ProviderCapability[];
}

export interface ModelTask {
  id: string;
  class: TaskClass;
  input: unknown;
  requireStructured: boolean;
  maxCostClass: "LOW"|"MEDIUM"|"HIGH";
  preferred?: string[];
}

export interface ModelOutput {
  taskId: string;
  providerId: string;
  model: string;
  output: unknown;
  verification: "REASONING_ONLY"|"VERIFIED_BY_SOLVER";
  solverEvidenceRefs: string[];
}
