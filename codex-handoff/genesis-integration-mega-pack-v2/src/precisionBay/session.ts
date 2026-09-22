import type { BayMode, BaySessionState, EvidenceEvent, HumanApproval, Observation } from "./domain.js";
import type { EvidencePort, IdPort } from "./ports.js";

export class BaySession {
  private readonly state: BaySessionState;

  constructor(
    id: string,
    mode: BayMode,
    private readonly evidence: EvidencePort,
    private readonly ids: IdPort
  ) {
    this.state = {
      id,
      mode,
      stage: "IDLE",
      revision: 0,
      observations: [],
      options: [],
      simulations: [],
      comparisons: [],
      approvals: [],
      blockers: [],
      emergencyStop: false
    };
    void this.emit({ type: "D142_SESSION_CREATED", sessionId: id, payload: { mode } });
  }

  snapshot(): Readonly<BaySessionState> {
    return structuredClone(this.state);
  }

  mutable(): BaySessionState {
    return this.state;
  }

  async stage(stage: BaySessionState["stage"]): Promise<void> {
    this.state.stage = stage;
    this.state.revision += 1;
    await this.emit({ type: "D142_STAGE_CHANGED", sessionId: this.state.id, payload: { stage } });
  }

  async observation(input: Omit<Observation, "id"> & { id?: string }): Promise<Observation> {
    const item: Observation = { ...input, id: input.id ?? this.ids.next("obs") };
    this.state.observations.push(item);
    this.state.revision += 1;
    await this.emit({
      type: "D142_OBSERVATION_RECORDED",
      sessionId: this.state.id,
      payload: item
    });
    return structuredClone(item);
  }

  async approval(item: HumanApproval): Promise<void> {
    this.state.approvals.push(structuredClone(item));
    this.state.revision += 1;
    await this.emit({
      type: "D142_APPROVAL_RECORDED",
      sessionId: this.state.id,
      payload: item
    });
  }

  block(reason: string): void {
    if (!this.state.blockers.includes(reason)) {
      this.state.blockers.push(reason);
      this.state.revision += 1;
    }
  }

  async stop(reason: string): Promise<void> {
    this.state.emergencyStop = true;
    this.state.stage = "EMERGENCY_STOP";
    this.state.blockers.push(`EMERGENCY_STOP:${reason}`);
    this.state.revision += 1;
    await this.emit({
      type: "D142_EMERGENCY_STOP",
      sessionId: this.state.id,
      payload: { reason }
    });
  }

  private async emit(event: EvidenceEvent): Promise<void> {
    await this.evidence.append(event);
  }
}
