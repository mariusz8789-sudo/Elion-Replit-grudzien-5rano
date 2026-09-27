export type EpistemicStatus =
  | "REAL_OBSERVATION"
  | "VERIFIED_SOURCE"
  | "MODEL"
  | "SIMULATION"
  | "HYPOTHESIS"
  | "SPECULATIVE"
  | "INSUFFICIENT_EVIDENCE"
  | "NOT_MODELED"
  | "FICTION_INSPIRED";

export type ConfidenceBand = "LOW" | "MEDIUM" | "HIGH";
export type GoalPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type PlanStatus = "PROPOSED" | "APPROVED" | "EXECUTING" | "COMPLETED" | "BLOCKED" | "FAILED";
export type EvidenceRelation = "SUPPORTS" | "CONTRADICTS" | "INCONCLUSIVE";

export interface EvidenceRef {
  id: string;
  sourceType: "OBSERVATION" | "LEDGER" | "EXTERNAL_SOURCE" | "MODEL_OUTPUT" | "REPLAY";
  epistemicStatus: EpistemicStatus;
  strength: number;
  hash?: string;
  provenance?: string;
}

export interface Observation {
  id: string;
  timestamp: number;
  subject: string;
  predicate: string;
  value: string | number | boolean;
  unit?: string;
  source: "WORLD" | "INSTRUMENT" | "HUMAN" | "EXPERIMENT" | "IMPORT";
  epistemicStatus: EpistemicStatus;
  evidenceRefs: string[];
}

export interface Goal {
  id: string;
  description: string;
  priority: GoalPriority;
  targetEntityIds: string[];
  preconditions: string[];
  successCriteria: string[];
  createdAt: number;
  deadline?: number;
}

export interface PlanStep {
  id: string;
  actionType: string;
  description: string;
  commandType?: string;
  targetEntityId?: string;
  requiresApproval: boolean;
  deterministic: boolean;
  expectedEvidence: string[];
}

export interface Plan {
  id: string;
  goalId: string;
  status: PlanStatus;
  rationale: string;
  steps: PlanStep[];
  createdAt: number;
}

export interface Hypothesis {
  id: string;
  statement: string;
  variables: string[];
  predictions: string[];
  falsifiers: string[];
  priorConfidence: number;
  epistemicStatus: "HYPOTHESIS";
  evidenceRefs: string[];
  createdAt: number;
}

export interface ExperimentProposal {
  id: string;
  hypothesisId: string;
  objective: string;
  intervention: Record<string, string | number | boolean>;
  controls: Record<string, string | number | boolean>;
  observations: string[];
  stoppingRules: string[];
  safetyRequirements: string[];
  requiresHumanApproval: boolean;
}

export interface DecisionRecord {
  id: string;
  timestamp: number;
  goalId?: string;
  selectedPlanId?: string;
  facts: string[];
  constraints: string[];
  uncertainty: number;
  outcome: "SELECTED" | "BLOCKED" | "DEFERRED" | "REJECTED";
  reason: string;
}

export interface CognitiveProposal {
  kind: "GOAL" | "HYPOTHESIS" | "PLAN" | "QUESTION";
  payload: unknown;
  source: "MODEL" | "RULE" | "HUMAN";
  epistemicStatus: "HYPOTHESIS" | "MODEL" | "INSUFFICIENT_EVIDENCE";
}

export interface WorldEntity {
  id: string;
  type: string;
  label: string;
  properties: Record<string, string | number | boolean | null>;
  tags: string[];
}

export interface WorldRelation {
  subjectId: string;
  relation: string;
  objectId: string;
}

export interface CognitiveSnapshot {
  timestamp: number;
  activeGoals: Goal[];
  activeHypotheses: Hypothesis[];
  pendingPlans: Plan[];
  recentObservations: Observation[];
  decisions: DecisionRecord[];
}

export interface CommandEnvelope {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  issuedBy: "COGNITIVE_CORE" | "HUMAN" | "AGENT";
  requiresApproval: boolean;
  safetyClass: "READ_ONLY" | "REVERSIBLE" | "IRREVERSIBLE" | "BIOLOGICAL";
}

export interface CommandBusAdapter {
  dispatch(command: CommandEnvelope): Promise<{ accepted: boolean; result?: unknown; reason?: string }>;
}

export interface ExperimentFabricAdapter {
  proposeExperiment(proposal: ExperimentProposal): Promise<{ accepted: boolean; sessionId?: string; reason?: string }>;
}

export interface EvidenceLedgerAdapter {
  append(entry: {
    id: string;
    kind: string;
    epistemicStatus: EpistemicStatus;
    data: unknown;
    provenance?: string;
  }): Promise<{ id: string; hash?: string }>;
}

export interface ScienceMemoryAdapter {
  write(record: unknown): Promise<void>;
  read(topic: string, limit: number): Promise<unknown[]>;
}

export interface WorldRuntimeAdapter {
  listEntities(): Promise<WorldEntity[]>;
  listRelations(): Promise<WorldRelation[]>;
}

export interface LanguageModelAdapter {
  propose(input: {
    objective: string;
    context: string;
    allowedKinds: CognitiveProposal["kind"][];
  }): Promise<CognitiveProposal[]>;
}
