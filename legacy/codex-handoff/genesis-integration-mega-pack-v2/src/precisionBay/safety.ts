import type { BaySessionState, HumanApproval } from "./domain.js";
import type { HumanApprovalPort } from "./ports.js";

export class SafetyViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafetyViolation";
  }
}

export function assertResearchOnly(state: Readonly<BaySessionState>): void {
  if (state.emergencyStop) throw new SafetyViolation("Emergency stop is active.");
  if (state.blockers.length > 0) throw new SafetyViolation(`Blocked: ${state.blockers.join("; ")}`);
}

export function assertNoRealActuation(): never {
  throw new SafetyViolation(
    "D-142 V2 intentionally contains no real medical-device actuation path. " +
    "Only simulation, rehearsal and read-only device-shadow workflows are allowed."
  );
}

export async function requireApproval(
  port: HumanApprovalPort,
  state: Readonly<BaySessionState>,
  approval: HumanApproval,
  requiredScope: string[]
): Promise<void> {
  const ok = await port.validate({ session: state, approval, requiredScope });
  if (!ok) throw new SafetyViolation("Human approval is missing or insufficient.");
}
