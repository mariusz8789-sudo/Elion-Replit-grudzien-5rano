import { EvidenceLedgerEngine, ReferenceHashPort, ExperimentPlannerEngine, AutonomousResearchCampaignEngine } from "../src/kernel.js";
import { FixedClock, eq } from "./utils.js";
export async function runPlannerCampaign(){
  let p=0;
  const planner=new ExperimentPlannerEngine();
  const chosen=planner.choose([
    {id:"e1",hypothesisId:"h1",title:"low",expectedInformationGain:1,estimatedCost:10,estimatedRisk:0,requiredSolverId:"x",input:{}},
    {id:"e2",hypothesisId:"h1",title:"high",expectedInformationGain:1,estimatedCost:1,estimatedRisk:0,requiredSolverId:"x",input:{}}
  ]);
  eq(chosen.id,"e2","planner"); p++;
  const ledger=new EvidenceLedgerEngine(new ReferenceHashPort(),new FixedClock());
  const engine=new AutonomousResearchCampaignEngine(planner,{async run(){return{numericResult:42,evidenceRefs:["solver:1"]}}},ledger);
  const out=await engine.run({
    id:"camp",cycles:0,status:"RUNNING",
    hypotheses:[{id:"h1",statement:"answer=42",status:"OPEN",prior:.5,evidenceRefs:[]}],
    experiments:[{id:"e",hypothesisId:"h1",title:"measure",expectedInformationGain:1,estimatedCost:1,estimatedRisk:0,requiredSolverId:"x",input:{expected:42,tolerance:0}}],
    observations:[]
  },2);
  eq(out.hypotheses[0]?.status,"SUPPORTED","campaign support"); p++;
  return p;
}
