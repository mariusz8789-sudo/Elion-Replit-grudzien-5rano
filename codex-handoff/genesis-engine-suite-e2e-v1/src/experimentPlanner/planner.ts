import type { ExperimentCandidate, PlannedExperiment } from "./types.js";
export class ExperimentPlannerEngine {
  rank(candidates:readonly ExperimentCandidate[]):PlannedExperiment[]{
    return candidates.map((c)=>({
      ...c,
      utility:c.expectedInformationGain/(Math.max(c.estimatedCost,1e-9)*(1+c.estimatedRisk))
    })).sort((a,b)=>b.utility-a.utility);
  }
  choose(candidates:readonly ExperimentCandidate[]):PlannedExperiment{
    const first=this.rank(candidates)[0];
    if(!first)throw new Error("no experiment candidates");
    return first;
  }
}
