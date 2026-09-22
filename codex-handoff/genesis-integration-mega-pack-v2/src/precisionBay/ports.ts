import type {
  BaySessionState,
  EvidenceEvent,
  HumanApproval,
  Observation,
  PredictionObservationComparison,
  ResearchOption,
  SimulationResult,
  TargetRegion
} from "./domain.js";

export interface EvidencePort {
  append(event: EvidenceEvent): Promise<void> | void;
}

export interface CanonicalHumanTwinPort {
  applyObservations(input: {
    sessionId: string;
    observations: Observation[];
  }): Promise<void>;
  localizeTarget(input: {
    sessionId: string;
    observations: Observation[];
    requestedLabel?: string;
  }): Promise<TargetRegion>;
}

export interface CanonicalResearchPlannerPort {
  propose(input: {
    session: Readonly<BaySessionState>;
    target: TargetRegion;
  }): Promise<ResearchOption[]>;
}

export interface CanonicalSimulationPort {
  simulate(input: {
    session: Readonly<BaySessionState>;
    option: ResearchOption;
  }): Promise<SimulationResult>;
}

export interface CanonicalComparisonPort {
  compare(input: {
    session: Readonly<BaySessionState>;
    simulation: SimulationResult;
    observations: Observation[];
  }): Promise<PredictionObservationComparison>;
}

export interface HumanApprovalPort {
  validate(input: {
    session: Readonly<BaySessionState>;
    approval: HumanApproval;
    requiredScope: string[];
  }): Promise<boolean>;
}

export interface CanonicalCommandPort {
  publish(command: {
    type: string;
    payload: unknown;
    source: "D142_PRECISION_INTERVENTION_BAY";
  }): Promise<void> | void;
}

export interface MetaCognitionPort {
  ingest(input: {
    sessionId: string;
    kind:
      | "OBSERVATION"
      | "SIMULATION"
      | "COMPARISON"
      | "CONTRADICTION"
      | "KNOWLEDGE_GAP";
    payload: unknown;
  }): Promise<void> | void;
}

export interface IdPort {
  next(prefix: string): string;
}

export interface ClockPort {
  nowIso(): string;
}
