import type { CapabilityEvidence } from "./evidenceLevels.js";
import { meetsEvidenceRequirement } from "./evidenceLevels.js";

export interface V6V7GateReport {
  capabilities: CapabilityEvidence[];
  passed: number;
  total: number;
  allPass: boolean;
  failedIds: string[];
}

export function evaluateV6V7Gate(capabilities: readonly CapabilityEvidence[]): V6V7GateReport {
  const failedIds = capabilities.filter((x) => !meetsEvidenceRequirement(x)).map((x) => x.id);
  return {
    capabilities: capabilities.map((x) => structuredClone(x)),
    passed: capabilities.length - failedIds.length,
    total: capabilities.length,
    allPass: failedIds.length === 0,
    failedIds
  };
}
