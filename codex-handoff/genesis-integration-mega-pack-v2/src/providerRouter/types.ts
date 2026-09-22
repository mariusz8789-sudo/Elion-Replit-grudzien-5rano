export type ProviderKind = "OPENAI" | "ANTHROPIC" | "LOCAL" | "OTHER";

/**
 * FIX (red-team finding): the original package's `TaskClass` had no
 * `CYBER_SCIENTIST_REASONING` member, only `CYBER_DEFENSIVE_REVIEW`/
 * `CYBER_REMEDIATION_REVIEW`, which didn't match the integration brief's vocabulary.
 * `CYBER_SCIENTIST_REASONING` is added as the general-purpose cyber-reasoning class;
 * the original two are kept for backward compatibility with existing callers/tests.
 */
export type TaskClass =
  | "WORLD_AUTHOR"
  | "CYBER_SCIENTIST_REASONING"
  | "CYBER_DEFENSIVE_REVIEW"
  | "CYBER_REMEDIATION_REVIEW"
  | "SCIENTIFIC_REASONING"
  | "DRUG_CANDIDATE_RESEARCH"
  | "META_COGNITION"
  | "GENERAL_CODING";

/** Task classes where a raw model result must never be treated as a verified
 * scientific/security/clinical result on its own — see fix area below. */
export const REASONING_ONLY_BY_DEFAULT: ReadonlySet<TaskClass> = new Set([
  "SCIENTIFIC_REASONING",
  "DRUG_CANDIDATE_RESEARCH",
  "CYBER_SCIENTIST_REASONING",
]);

export interface ProviderCapability {
  task: TaskClass;
  quality: 1 | 2 | 3 | 4 | 5;
  costClass: "LOW" | "MEDIUM" | "HIGH";
  supportsTools: boolean;
  supportsStructuredOutput: boolean;
}

export interface ProviderDescriptor {
  id: string;
  kind: ProviderKind;
  model: string;
  capabilities: ProviderCapability[];
  enabled: boolean;
  tags: string[];
}

export interface ModelTask {
  taskId: string;
  class: TaskClass;
  instructions: string;
  input: unknown;
  requireStructuredOutput: boolean;
  maxCostClass: "LOW" | "MEDIUM" | "HIGH";
  preferredProviderIds?: string[];
  forbiddenProviderIds?: string[];
  metadata?: Record<string, string | number | boolean | null>;
}

/**
 * FIX (red-team finding, highest priority): V1's `ModelResult` had no field
 * distinguishing "this is raw model reasoning" from "this is a verified computational
 * result" — nothing stopped a caller from treating LLM text as a real drug-candidate or
 * scientific/security finding. `resultKind` makes this explicit and machine-checkable:
 * `REASONING_ONLY` (the only kind a bare provider call can ever produce) vs.
 * `VERIFIED_BY_SOLVER` (only assignable by `router.ts::attachSolverVerification`, which
 * requires a real `solverEvidenceRef`). See `router.ts` for the enforcement.
 */
export type ModelResultKind = "REASONING_ONLY" | "VERIFIED_BY_SOLVER";

export interface ModelResult {
  taskId: string;
  providerId: string;
  model: string;
  output: unknown;
  resultKind: ModelResultKind;
  solverEvidenceRef?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  evidenceRefs: string[];
}

export interface RoutingDecision {
  taskId: string;
  selectedProviderId: string;
  reason: string;
  alternatives: string[];
}
