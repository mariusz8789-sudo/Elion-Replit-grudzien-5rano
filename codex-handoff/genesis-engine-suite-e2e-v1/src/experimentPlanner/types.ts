export interface Hypothesis {
  id:string;
  statement:string;
  status:"OPEN"|"SUPPORTED"|"FALSIFIED"|"INCONCLUSIVE";
  prior:number;
  evidenceRefs:string[];
}
export interface ExperimentCandidate {
  id:string;
  hypothesisId:string;
  title:string;
  expectedInformationGain:number;
  estimatedCost:number;
  estimatedRisk:number;
  requiredSolverId:string;
  input:unknown;
}
export interface PlannedExperiment extends ExperimentCandidate {
  utility:number;
}
