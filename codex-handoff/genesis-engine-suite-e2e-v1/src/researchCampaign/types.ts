import type { Hypothesis, ExperimentCandidate } from "../experimentPlanner/types.js";
export interface Observation {
  experimentId:string;
  hypothesisId:string;
  expected:number;
  observed:number;
  tolerance:number;
  evidenceRefs:string[];
}
export interface CampaignState {
  id:string;
  hypotheses:Hypothesis[];
  experiments:ExperimentCandidate[];
  observations:Observation[];
  cycles:number;
  status:"RUNNING"|"COMPLETE"|"BLOCKED";
}
