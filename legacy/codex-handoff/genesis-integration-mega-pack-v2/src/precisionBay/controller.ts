import type {
  BaySessionState,
  HumanApproval,
  Observation,
  PredictionObservationComparison,
  ResearchOption,
  SimulationResult,
  TargetRegion
} from "./domain.js";
import type {
  CanonicalCommandPort,
  CanonicalComparisonPort,
  CanonicalHumanTwinPort,
  CanonicalResearchPlannerPort,
  CanonicalSimulationPort,
  EvidencePort,
  HumanApprovalPort,
  MetaCognitionPort
} from "./ports.js";
import type { ReadOnlyDeviceShadowAdapter, DeviceShadowSnapshot } from "./deviceShadow.js";
import { BaySession } from "./session.js";
import { assertResearchOnly, requireApproval } from "./safety.js";

export interface BayControllerDeps {
  evidence: EvidencePort;
  twin: CanonicalHumanTwinPort;
  planner: CanonicalResearchPlannerPort;
  simulator: CanonicalSimulationPort;
  comparator: CanonicalComparisonPort;
  approvals: HumanApprovalPort;
  commands: CanonicalCommandPort;
  meta?: MetaCognitionPort;
  deviceShadow?: ReadOnlyDeviceShadowAdapter;
}

export class PrecisionInterventionBayController {
  constructor(
    private readonly session: BaySession,
    private readonly deps: BayControllerDeps
  ) {}

  snapshot(): Readonly<BaySessionState> {
    return this.session.snapshot();
  }

  async observe(input: Omit<Observation, "id"> & { id?: string }): Promise<Observation> {
    assertResearchOnly(this.snapshot());
    await this.session.stage("OBSERVE");
    const obs = await this.session.observation(input);
    await this.deps.twin.applyObservations({ sessionId: this.snapshot().id, observations: [obs] });
    await this.deps.meta?.ingest({ sessionId: this.snapshot().id, kind: "OBSERVATION", payload: obs });
    return obs;
  }

  async localize(requestedLabel?: string): Promise<TargetRegion> {
    assertResearchOnly(this.snapshot());
    await this.session.stage("LOCALIZE");
    const state = this.session.mutable();
    const target = await this.deps.twin.localizeTarget({
      sessionId: state.id,
      observations: structuredClone(state.observations),
      ...(requestedLabel ? { requestedLabel } : {})
    });
    state.target = target;
    state.revision += 1;
    await this.deps.evidence.append({
      type: "D142_TARGET_LOCALIZED",
      sessionId: state.id,
      payload: target
    });
    await this.session.stage("TWIN_SYNC");
    return structuredClone(target);
  }

  async propose(): Promise<ResearchOption[]> {
    assertResearchOnly(this.snapshot());
    const target = this.snapshot().target;
    if (!target) throw new Error("Target must be localized first.");
    await this.session.stage("PROPOSE");
    const options = await this.deps.planner.propose({ session: this.snapshot(), target });
    const state = this.session.mutable();
    for (const option of options) {
      if (option.executableOnRealDevice !== false) {
        throw new Error("Only non-executable research options are accepted.");
      }
      state.options.push(structuredClone(option));
      state.revision += 1;
      await this.deps.evidence.append({
        type: "D142_OPTION_PROPOSED",
        sessionId: state.id,
        payload: option
      });
    }
    await this.session.stage("REVIEW");
    return structuredClone(options);
  }

  async simulate(optionId: string): Promise<SimulationResult> {
    assertResearchOnly(this.snapshot());
    const option = this.snapshot().options.find((x) => x.id === optionId);
    if (!option) throw new Error(`Unknown option: ${optionId}`);
    await this.session.stage("SIMULATE");
    const result = await this.deps.simulator.simulate({ session: this.snapshot(), option });
    const state = this.session.mutable();
    state.simulations.push(structuredClone(result));
    state.revision += 1;
    await this.deps.evidence.append({
      type: "D142_SIMULATION_COMPLETED",
      sessionId: state.id,
      payload: result
    });
    await this.deps.meta?.ingest({ sessionId: state.id, kind: "SIMULATION", payload: result });
    await this.session.stage("REVIEW");
    return structuredClone(result);
  }

  async compare(simulationRunId: string, observedIds: string[]): Promise<PredictionObservationComparison> {
    assertResearchOnly(this.snapshot());
    const simulation = this.snapshot().simulations.find((x) => x.runId === simulationRunId);
    if (!simulation) throw new Error(`Unknown simulation: ${simulationRunId}`);
    const observations = this.snapshot().observations.filter((x) => observedIds.includes(x.id));
    await this.session.stage("COMPARE");
    const comparison = await this.deps.comparator.compare({
      session: this.snapshot(),
      simulation,
      observations
    });
    const state = this.session.mutable();
    state.comparisons.push(structuredClone(comparison));
    state.revision += 1;
    await this.deps.evidence.append({
      type: "D142_COMPARISON_RECORDED",
      sessionId: state.id,
      payload: comparison
    });
    await this.deps.meta?.ingest({
      sessionId: state.id,
      kind: comparison.status === "DRIFT" ? "CONTRADICTION" : "COMPARISON",
      payload: comparison
    });
    return structuredClone(comparison);
  }

  /**
   * FIX (mega-pack V2, red-team finding, empirically confirmed): V1 was the only
   * state-mutating controller method that did NOT call `assertResearchOnly()` first —
   * every sibling method does. That meant a session could be under active
   * `emergencyStop` and `recordApproval()` would still succeed, overwriting `stage` from
   * `EMERGENCY_STOP` back to `APPROVAL`. It never created a path to real device
   * actuation (none exists in this package), but it was a real, reproducible
   * inconsistency in the emergency-stop enforcement pattern. Fixed by adding the same
   * guard every other method already has.
   */
  async recordApproval(approval: HumanApproval, requiredScope: string[]): Promise<void> {
    assertResearchOnly(this.snapshot());
    await requireApproval(this.deps.approvals, this.snapshot(), approval, requiredScope);
    await this.session.approval(approval);
    await this.session.stage("APPROVAL");
  }

  async connectShadow(): Promise<DeviceShadowSnapshot> {
    assertResearchOnly(this.snapshot());
    if (this.snapshot().mode !== "DEVICE_SHADOW_MODE") {
      throw new Error("Device shadow is available only in DEVICE_SHADOW_MODE.");
    }
    if (!this.deps.deviceShadow) throw new Error("No device-shadow adapter is configured.");
    const snap = await this.deps.deviceShadow.connect(this.snapshot().id);
    await this.deps.evidence.append({
      type: "D142_SHADOW_CONNECTED",
      sessionId: this.snapshot().id,
      payload: snap
    });
    await this.session.stage("SHADOW");
    return structuredClone(snap);
  }

  async publishResearchCommand(type: string, payload: unknown): Promise<void> {
    assertResearchOnly(this.snapshot());
    await this.deps.commands.publish({
      type,
      payload,
      source: "D142_PRECISION_INTERVENTION_BAY"
    });
  }

  async complete(): Promise<void> {
    assertResearchOnly(this.snapshot());
    await this.session.stage("EVIDENCE");
    await this.deps.evidence.append({
      type: "D142_SESSION_COMPLETED",
      sessionId: this.snapshot().id,
      payload: {
        observations: this.snapshot().observations.length,
        options: this.snapshot().options.length,
        simulations: this.snapshot().simulations.length,
        comparisons: this.snapshot().comparisons.length
      }
    });
    await this.session.stage("COMPLETE");
  }

  async emergencyStop(reason: string): Promise<void> {
    await this.session.stop(reason);
  }
}
