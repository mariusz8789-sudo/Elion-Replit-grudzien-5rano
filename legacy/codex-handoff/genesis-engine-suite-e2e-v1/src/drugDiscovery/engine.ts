import type { EvidenceLedgerEngine } from "../evidenceReplay/ledger.js";
import type { DrugCandidate } from "./types.js";

export interface DrugIdentityGuardPort { verify(c:Readonly<DrugCandidate>):Promise<{valid:boolean;reasons:string[]}>; }
export interface DrugComputeEnginePort {
  id:string;
  stage:"CHEAP"|"DOCKING"|"QM"|"ADMET";
  available():Promise<boolean>;
  run(c:Readonly<DrugCandidate>):Promise<DrugCandidate["compute"][number]>;
}

const STAGES=["CHEAP","DOCKING","QM","ADMET"] as const;

export class DrugDiscoveryEngine {
  constructor(
    private readonly identity:DrugIdentityGuardPort,
    private readonly engines:DrugComputeEnginePort[],
    private readonly ledger:EvidenceLedgerEngine
  ){}

  async run(candidate:DrugCandidate):Promise<DrugCandidate>{
    const c=structuredClone(candidate);
    const id=await this.identity.verify(c);
    if(!id.valid){c.state="IDENTITY_REJECTED";c.rationale.push(...id.reasons);return c;}
    if(c.evidence.some((e)=>e.conflicts.length>0)){
      c.state="CONFLICTING_EVIDENCE";
      c.rationale.push("conflicting evidence");
      return c;
    }
    if(Math.max(0,...c.safety.map((s)=>s.severity))>=3){
      c.state="FALSIFIED";
      c.rationale.push("severe safety signal");
      return c;
    }

    for(const stage of STAGES){
      const engine=this.engines.find((e)=>e.stage===stage);
      if(!engine){
        c.compute.push({stage,engineId:"UNBOUND",status:"BLOCKED",outputs:{}});
        c.state="BLOCKED";
        c.rationale.push(`unbound engine: ${stage}`);
        continue;
      }
      if(!(await engine.available())){
        c.compute.push({stage,engineId:engine.id,status:"BLOCKED",outputs:{}});
        c.state="BLOCKED";
        c.rationale.push(`engine unavailable: ${engine.id}`);
        continue;
      }
      const result=await engine.run(c);
      c.compute.push(result);
      this.ledger.append({streamId:c.id,type:"DRUG_COMPUTE_RESULT",epistemicStatus:"SUPPORTED",payload:result});
      if(result.status==="FAILED"){
        c.state="FALSIFIED";
        c.rationale.push(`engine failed: ${engine.id}`);
        return c;
      }
    }
    if(c.state!=="BLOCKED")c.state="RESEARCH_PRIORITY";
    this.ledger.append({streamId:c.id,type:"DRUG_CANDIDATE_FINAL_STATE",epistemicStatus:"SUPPORTED",payload:{state:c.state,rationale:c.rationale}});
    return c;
  }

  researchPriorityScore(c:Readonly<DrugCandidate>):number{
    const ev=c.evidence.length?c.evidence.reduce((s,e)=>s+e.strength,0)/c.evidence.length:0;
    const compute=c.compute.filter((x)=>x.status==="COMPLETED").length/4;
    const safety=Math.max(0,...c.safety.map((s)=>s.severity))/3;
    const conflict=c.evidence.some((e)=>e.conflicts.length>0)?1:0;
    return Math.max(0,Math.min(1,(ev+compute-safety-conflict)/2));
  }
}
