export type Id = string;

export type EpistemicStatus =
  | "MEASURED"
  | "SUPPORTED"
  | "INFERRED"
  | "SIMULATED"
  | "ASSUMED"
  | "UNKNOWN"
  | "CONTRADICTED"
  | "UNVERIFIED";

/** Kept for backward-compatible session/API shape. For the canonical, cross-package
 * safety model use `../deviceSafety/deviceSafetyContract.js` and map via
 * `../deviceSafety/legacyAdapters.js::fromBayMode` (fix area 2). */
export type BayMode =
  | "SIMULATION_ONLY"
  | "DIGITAL_TWIN_REHEARSAL"
  | "DEVICE_SHADOW_MODE";

export type BayStage =
  | "IDLE"
  | "OBSERVE"
  | "LOCALIZE"
  | "TWIN_SYNC"
  | "PROPOSE"
  | "SIMULATE"
  | "REVIEW"
  | "APPROVAL"
  | "SHADOW"
  | "COMPARE"
  | "EVIDENCE"
  | "COMPLETE"
  | "BLOCKED"
  | "EMERGENCY_STOP";

export type SourceKind =
  | "SYNTHETIC"
  | "SIMULATED"
  | "IMPORTED_RESEARCH_DATA"
  | "DEVICE_SHADOW_TELEMETRY"
  | "REAL_DEVICE_TELEMETRY";

export interface ProvenanceRef {
  sourceId: string;
  sourceKind: SourceKind;
  epistemicStatus: EpistemicStatus;
  version?: string;
  capturedAt?: string;
  hash?: string;
}

export interface Observation {
  id: Id;
  kind: string;
  value: unknown;
  unit?: string;
  targetId?: Id;
  epistemicStatus: EpistemicStatus;
  provenance: ProvenanceRef[];
}

export interface TargetRegion {
  id: Id;
  label: string;
  canonicalAnatomyId?: string;
  canonicalWorldEntityId?: string;
  epistemicStatus: EpistemicStatus;
  provenance: ProvenanceRef[];
}

export interface ResearchOption {
  id: Id;
  label: string;
  category:
    | "ADDITIONAL_OBSERVATION"
    | "IMAGING_MODEL"
    | "ROBOTIC_POSITIONING_MODEL"
    | "FOCUSED_ENERGY_MODEL"
    | "RADIATION_MODEL"
    | "DRUG_DELIVERY_MODEL"
    | "BIOPSY_MODEL"
    | "OTHER_RESEARCH_MODEL";
  targetId: Id;
  rationale: string;
  expectedModelOutcome: string;
  uncertainty: string;
  provenance: ProvenanceRef[];
  epistemicStatus: EpistemicStatus;
  executableOnRealDevice: false;
}

export interface SimulationResult {
  runId: Id;
  optionId: Id;
  outputs: Record<string, unknown>;
  uncertainty: Record<string, unknown>;
  provenance: ProvenanceRef[];
  epistemicStatus: "SIMULATED";
}

export interface PredictionObservationComparison {
  id: Id;
  simulationRunId: Id;
  observedIds: Id[];
  status: "MATCH" | "DRIFT" | "INSUFFICIENT_DATA";
  summary: string;
  provenance: ProvenanceRef[];
}

export interface HumanApproval {
  id: Id;
  actorId: Id;
  role: string;
  scope: string[];
  approvedAt: string;
}

export interface BaySessionState {
  id: Id;
  mode: BayMode;
  stage: BayStage;
  revision: number;
  observations: Observation[];
  target?: TargetRegion;
  options: ResearchOption[];
  simulations: SimulationResult[];
  comparisons: PredictionObservationComparison[];
  approvals: HumanApproval[];
  blockers: string[];
  emergencyStop: boolean;
}

export interface EvidenceEvent {
  type:
    | "D142_SESSION_CREATED"
    | "D142_STAGE_CHANGED"
    | "D142_OBSERVATION_RECORDED"
    | "D142_TARGET_LOCALIZED"
    | "D142_OPTION_PROPOSED"
    | "D142_SIMULATION_COMPLETED"
    | "D142_APPROVAL_RECORDED"
    | "D142_SHADOW_CONNECTED"
    | "D142_COMPARISON_RECORDED"
    | "D142_EMERGENCY_STOP"
    | "D142_SESSION_COMPLETED";
  sessionId: Id;
  payload: unknown;
}
