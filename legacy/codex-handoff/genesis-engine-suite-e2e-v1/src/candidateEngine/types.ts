export interface GenericCandidate {
  id:string;
  features:Record<string,number>;
  evidenceStrength:number;
  uncertainty:number;
  safetyPenalty:number;
  conflictPenalty:number;
}
export interface CandidateScore {
  id:string;
  score:number;
  components:Record<string,number>;
}
