import type { GenericCandidate, CandidateScore } from "./types.js";
export class CandidateRankingFalsificationEngine {
  score(c:GenericCandidate):CandidateScore{
    const featureMean=Object.values(c.features).length
      ? Object.values(c.features).reduce((a,b)=>a+b,0)/Object.values(c.features).length : 0;
    const raw=featureMean+c.evidenceStrength-c.uncertainty-c.safetyPenalty-c.conflictPenalty;
    return{id:c.id,score:raw,components:{featureMean,evidenceStrength:c.evidenceStrength,uncertainty:c.uncertainty,safetyPenalty:c.safetyPenalty,conflictPenalty:c.conflictPenalty}};
  }
  rank(cs:readonly GenericCandidate[]):CandidateScore[]{
    return cs.map((c)=>this.score(c)).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  }
  falsify(c:GenericCandidate, thresholds:{maxSafety:number;maxConflict:number;maxUncertainty:number}){
    const reasons:string[]=[];
    if(c.safetyPenalty>thresholds.maxSafety)reasons.push("safety");
    if(c.conflictPenalty>thresholds.maxConflict)reasons.push("conflicting evidence");
    if(c.uncertainty>thresholds.maxUncertainty)reasons.push("uncertainty");
    return{candidateId:c.id,falsified:reasons.length>0,reasons};
  }
}
