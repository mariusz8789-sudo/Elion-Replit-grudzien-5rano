export type EvidenceLevel =
  | "STRUCTURAL"
  | "NODE_E2E"
  | "REAL_BROWSER"
  | "EXTERNAL_VALIDATED";

const ORDER: Record<EvidenceLevel, number> = {
  STRUCTURAL: 1,
  NODE_E2E: 2,
  REAL_BROWSER: 3,
  EXTERNAL_VALIDATED: 4
};

export interface CapabilityEvidence {
  id: string;
  requiredLevel: EvidenceLevel;
  actualLevel: EvidenceLevel;
  evidenceRefs: string[];
  notes?: string;
}

export function meetsEvidenceRequirement(item: CapabilityEvidence): boolean {
  return ORDER[item.actualLevel] >= ORDER[item.requiredLevel] && item.evidenceRefs.length > 0;
}
