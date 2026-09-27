import { EvidenceLedgerEngine, ReferenceHashPort, DrugDiscoveryEngine, CandidateRankingFalsificationEngine } from "../src/kernel.js";
import { FixedClock, eq } from "./utils.js";
export async function runDrugCandidate(){
  let p=0;
  const ledger=new EvidenceLedgerEngine(new ReferenceHashPort(),new FixedClock());
  const stages=["CHEAP","DOCKING","QM","ADMET"] as const;
  const engine=new DrugDiscoveryEngine(
    {async verify(c){return{valid:Boolean(c.canonicalSmiles&&c.provenance.length),reasons:[]}}},
    stages.map((stage)=>({id:`engine:${stage}`,stage,async available(){return true},async run(c){return{stage,engineId:`engine:${stage}`,status:"COMPLETED" as const,outputs:{candidate:c.id}}}})),
    ledger
  );
  const out=await engine.run({id:"d1",canonicalSmiles:"CCO",provenance:[{source:"fixture",sourceId:"1"}],state:"INGESTED",evidence:[{id:"e1",strength:.8,sourceId:"s1",supports:["identity"],conflicts:[]},{id:"e2",strength:.7,sourceId:"s2",supports:["model"],conflicts:[]}],safety:[],compute:[],rationale:[]});
  eq(out.state,"RESEARCH_PRIORITY","drug pipeline"); p++;
  eq(out.compute.length,4,"all drug stages"); p++;
  const generic=new CandidateRankingFalsificationEngine();
  const ranked=generic.rank([{id:"a",features:{x:.8},evidenceStrength:.8,uncertainty:.1,safetyPenalty:0,conflictPenalty:0},{id:"b",features:{x:.2},evidenceStrength:.3,uncertainty:.4,safetyPenalty:.2,conflictPenalty:0}]);
  eq(ranked[0]?.id,"a","rank"); p++;
  return p;
}
