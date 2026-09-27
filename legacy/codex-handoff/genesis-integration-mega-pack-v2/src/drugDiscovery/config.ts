export interface ResearchGateConfig {
  minimumIndependentEvidence: number;
  minimumEvidenceStrength: number;
  maximumSafetySeverity: number;
  uncertaintyPenalty: number;
  conflictPenalty: number;
  priorityFloor: number;
}

export const GENESIS_PREREGISTERED_DEFAULTS: Readonly<ResearchGateConfig> = {
  minimumIndependentEvidence: 2,
  minimumEvidenceStrength: 0.5,
  maximumSafetySeverity: 2,
  uncertaintyPenalty: -0.5,
  conflictPenalty: -1,
  priorityFloor: 0.7
};
