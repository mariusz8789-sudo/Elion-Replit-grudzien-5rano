export interface SelfMonitorState {
  cycle: number;
  uncertainty: number;
  blockedActions: number;
  lastError?: string;
  integrity: "OK" | "DEGRADED" | "HALTED";
}

export class SelfMonitor {
  private state: SelfMonitorState = { cycle: 0, uncertainty: 1, blockedActions: 0, integrity: "OK" };

  nextCycle(): void { this.state.cycle += 1; }
  setUncertainty(value: number): void { this.state.uncertainty = Math.max(0, Math.min(1, value)); }
  blocked(): void { this.state.blockedActions += 1; }
  error(message: string): void { this.state.lastError = message; this.state.integrity = "DEGRADED"; }
  halt(message: string): void { this.state.lastError = message; this.state.integrity = "HALTED"; }
  snapshot(): SelfMonitorState { return { ...this.state }; }
}
