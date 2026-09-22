import type { EvidenceLedgerEngine } from "../evidenceReplay/ledger.js";
import type { ExperimentPlannerEngine } from "../experimentPlanner/planner.js";
import type { CampaignState, Observation } from "./types.js";

export interface ScientificSolverPort {
  run(solverId:string,input:unknown):Promise<{numericResult:number;evidenceRefs:string[]}>;
}

export class AutonomousResearchCampaignEngine {
  constructor(
    private readonly planner:ExperimentPlannerEngine,
    private readonly solver:ScientificSolverPort,
    private readonly ledger:EvidenceLedgerEngine
  ){}

  async cycle(state:CampaignState):Promise<CampaignState>{
    const open=new Set(state.hypotheses.filter((h)=>h.status==="OPEN"||h.status==="INCONCLUSIVE").map((h)=>h.id));
    const candidates=state.experiments.filter((e)=>open.has(e.hypothesisId));
    if(candidates.length===0)return{...state,status:"COMPLETE"};

    const plan=this.planner.choose(candidates);
    this.ledger.append({streamId:state.id,type:"EXPERIMENT_PLANNED",epistemicStatus:"KNOWN",payload:plan});
    const result=await this.solver.run(plan.requiredSolverId,plan.input);
    const expected=typeof (plan.input as {expected?:unknown})?.expected==="number"?(plan.input as {expected:number}).expected:result.numericResult;
    const tolerance=typeof (plan.input as {tolerance?:unknown})?.tolerance==="number"?(plan.input as {tolerance:number}).tolerance:0;
    const obs:Observation={experimentId:plan.id,hypothesisId:plan.hypothesisId,expected,observed:result.numericResult,tolerance,evidenceRefs:result.evidenceRefs};
    const supported=Math.abs(obs.observed-obs.expected)<=obs.tolerance;
    const hypotheses=state.hypotheses.map((h)=>h.id===obs.hypothesisId?{...h,status:supported?"SUPPORTED" as const:"FALSIFIED" as const,evidenceRefs:[...h.evidenceRefs,...obs.evidenceRefs]}:h);
    this.ledger.append({streamId:state.id,type:"OBSERVATION_RECORDED",epistemicStatus:"SUPPORTED",payload:obs});
    this.ledger.append({streamId:state.id,type:supported?"HYPOTHESIS_SUPPORTED":"HYPOTHESIS_FALSIFIED",epistemicStatus:"SUPPORTED",payload:{hypothesisId:obs.hypothesisId,evidenceRefs:obs.evidenceRefs}});
    return{...state,hypotheses,observations:[...state.observations,obs],cycles:state.cycles+1,status:"RUNNING"};
  }

  async run(state:CampaignState,maxCycles:number):Promise<CampaignState>{
    let current=structuredClone(state);
    for(let i=0;i<maxCycles&&current.status==="RUNNING";i++)current=await this.cycle(current);
    if(current.status==="RUNNING"){
      const unresolved=current.hypotheses.some((h)=>h.status==="OPEN"||h.status==="INCONCLUSIVE");
      if(!unresolved)current={...current,status:"COMPLETE"};
    }
    return current;
  }
}
