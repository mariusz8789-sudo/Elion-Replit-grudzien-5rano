import type {
  CanonicalCommandPort,
  CanonicalComparisonPort,
  CanonicalHumanTwinPort,
  CanonicalResearchPlannerPort,
  CanonicalSimulationPort,
  EvidencePort,
  HumanApprovalPort,
  IdPort
} from "./ports.js";
import type {
  EvidenceEvent,
  HumanApproval,
  Observation,
  PredictionObservationComparison,
  ResearchOption,
  SimulationResult,
  TargetRegion
} from "./domain.js";
import { TEST_ONLY_HASH_PORT } from "../hashReplay/testHash.js";
import { BaySession } from "./session.js";
import { PrecisionInterventionBayController } from "./controller.js";
import type { DeviceShadowSnapshot, ReadOnlyDeviceShadowAdapter } from "./deviceShadow.js";

function fnv1a32(value: unknown): string {
  return TEST_ONLY_HASH_PORT.fingerprint(value);
}

class DeterministicIds implements IdPort {
  private counters = new Map<string, number>();
  constructor(private readonly seed: string) {}
  next(prefix: string): string {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    return `${prefix}:${this.seed}:${n}`;
  }
}

export class MemoryEvidence implements EvidencePort {
  readonly events: EvidenceEvent[] = [];
  append(event: EvidenceEvent): void { this.events.push(structuredClone(event)); }
}

class DemoTwin implements CanonicalHumanTwinPort {
  async applyObservations(): Promise<void> {}
  async localizeTarget(input: {
    sessionId: string;
    observations: Observation[];
    requestedLabel?: string;
  }): Promise<TargetRegion> {
    return {
      id: `target:${fnv1a32({ requestedLabel: input.requestedLabel, n: input.observations.length })}`,
      label: input.requestedLabel ?? "research target",
      epistemicStatus: "SIMULATED",
      provenance: [{
        sourceId: "demo-twin",
        sourceKind: "SIMULATED",
        epistemicStatus: "SIMULATED"
      }]
    };
  }
}

class DemoPlanner implements CanonicalResearchPlannerPort {
  async propose(input: {
    session: Readonly<import("./domain.js").BaySessionState>;
    target: TargetRegion;
  }): Promise<ResearchOption[]> {
    return [{
      id: `option:${fnv1a32({ target: input.target.id, kind: "ADDITIONAL_OBSERVATION" })}`,
      label: "Additional observation",
      category: "ADDITIONAL_OBSERVATION",
      targetId: input.target.id,
      rationale: "Increase information before considering any further modeled action.",
      expectedModelOutcome: "Reduced uncertainty in the virtual model.",
      uncertainty: "Research simulation only.",
      provenance: [{
        sourceId: "demo-planner",
        sourceKind: "SIMULATED",
        epistemicStatus: "SIMULATED"
      }],
      epistemicStatus: "SIMULATED",
      executableOnRealDevice: false
    }];
  }
}

class DemoSimulator implements CanonicalSimulationPort {
  async simulate(input: {
    session: Readonly<import("./domain.js").BaySessionState>;
    option: ResearchOption;
  }): Promise<SimulationResult> {
    return {
      runId: `run:${fnv1a32({ session: input.session.id, option: input.option.id })}`,
      optionId: input.option.id,
      outputs: { modelOutcome: "information_gain" },
      uncertainty: { status: "UNVALIDATED_RESEARCH_MODEL" },
      provenance: [{
        sourceId: "demo-simulator",
        sourceKind: "SIMULATED",
        epistemicStatus: "SIMULATED"
      }],
      epistemicStatus: "SIMULATED"
    };
  }
}

class DemoComparator implements CanonicalComparisonPort {
  async compare(input: {
    session: Readonly<import("./domain.js").BaySessionState>;
    simulation: SimulationResult;
    observations: Observation[];
  }): Promise<PredictionObservationComparison> {
    return {
      id: `cmp:${fnv1a32({ run: input.simulation.runId, obs: input.observations.map((x) => x.id) })}`,
      simulationRunId: input.simulation.runId,
      observedIds: input.observations.map((x) => x.id),
      status: input.observations.length > 0 ? "MATCH" : "INSUFFICIENT_DATA",
      summary: input.observations.length > 0 ? "Deterministic demo comparison." : "No observations available.",
      provenance: [{
        sourceId: "demo-comparator",
        sourceKind: "SIMULATED",
        epistemicStatus: "SIMULATED"
      }]
    };
  }
}

class DemoApproval implements HumanApprovalPort {
  async validate(input: {
    session: Readonly<import("./domain.js").BaySessionState>;
    approval: HumanApproval;
    requiredScope: string[];
  }): Promise<boolean> {
    return input.requiredScope.every((x) => input.approval.scope.includes(x));
  }
}

class DemoCommands implements CanonicalCommandPort {
  readonly commands: unknown[] = [];
  publish(command: { type: string; payload: unknown; source: "D142_PRECISION_INTERVENTION_BAY" }): void {
    this.commands.push(structuredClone(command));
  }
}

class DemoShadow implements ReadOnlyDeviceShadowAdapter {
  async connect(): Promise<DeviceShadowSnapshot> {
    return {
      adapterId: "demo-shadow",
      connected: true,
      capabilities: [{ id: "telemetry.read", label: "Read telemetry", readOnly: true }],
      telemetry: [],
      provenance: [{
        sourceId: "demo-shadow",
        sourceKind: "DEVICE_SHADOW_TELEMETRY",
        epistemicStatus: "SIMULATED"
      }]
    };
  }
  async read(): Promise<DeviceShadowSnapshot> { return this.connect(); }
  async disconnect(): Promise<void> {}
}

export function createDemo(sessionId: string, shadow = false) {
  const evidence = new MemoryEvidence();
  const ids: IdPort = new DeterministicIds(sessionId);
  const session = new BaySession(sessionId, shadow ? "DEVICE_SHADOW_MODE" : "SIMULATION_ONLY", evidence, ids);
  const commands = new DemoCommands();
  const controller = new PrecisionInterventionBayController(session, {
    evidence,
    twin: new DemoTwin(),
    planner: new DemoPlanner(),
    simulator: new DemoSimulator(),
    comparator: new DemoComparator(),
    approvals: new DemoApproval(),
    commands,
    deviceShadow: new DemoShadow()
  });
  return { controller, evidence, commands };
}
