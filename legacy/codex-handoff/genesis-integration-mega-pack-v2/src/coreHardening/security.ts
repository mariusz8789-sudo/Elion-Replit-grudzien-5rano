/** ADAPTER/VALIDATOR UTILITY (fix area 6). `evaluateCommandPolicy` unconditionally
 * denies DEVICE_ACTUATION and FORBIDDEN — verified by this package's own tests. */
export type RiskClass = "READ_ONLY" | "REVERSIBLE" | "MATERIAL_CHANGE" | "DEVICE_ACTUATION" | "FORBIDDEN";

export interface AuthorizedCommand {
  commandId: string;
  actorId: string;
  capability: string;
  riskClass: RiskClass;
  humanApproved: boolean;
  emergencyStopAvailable: boolean;
}

export interface PolicyDecision {
  allow: boolean;
  reasons: string[];
}

export function evaluateCommandPolicy(command: AuthorizedCommand): PolicyDecision {
  const reasons: string[] = [];
  if (command.riskClass === "FORBIDDEN") reasons.push("Forbidden command class.");
  if (command.riskClass === "DEVICE_ACTUATION") reasons.push("Real device actuation requires device-specific validated policy outside this generic package.");
  if (command.riskClass === "MATERIAL_CHANGE" && !command.humanApproved) reasons.push("Human approval required.");
  if ((command.riskClass === "MATERIAL_CHANGE" || command.riskClass === "DEVICE_ACTUATION") && !command.emergencyStopAvailable) {
    reasons.push("Emergency-stop capability required.");
  }
  return { allow: reasons.length === 0, reasons };
}
