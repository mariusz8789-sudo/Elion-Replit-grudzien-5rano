import { EvidenceLedgerEngine, ReferenceHashPort, GenesisCyberScientistEngine } from "../src/kernel.js";
import { FixedClock, eq } from "./utils.js";
export async function runCyber(){
  let p=0;
  const ledger=new EvidenceLedgerEngine(new ReferenceHashPort(),new FixedClock());
  const cyber=new GenesisCyberScientistEngine(
    {async inventory(){return{components:["app"],entrypoints:["main"],dependencies:[]}}},
    {async hypotheses(){return[{id:"h1",title:"unsafe config",component:"app"}]}},
    [{id:"config",supports(){return true},async analyze(){return{evidenceRefs:["ev1"],finding:{id:"f1",title:"unsafe config",severity:"MEDIUM",confidence:"HIGH",component:"app",evidenceRefs:["ev1"],status:"OPEN"}}}}],
    {async propose(){return{patchId:"p1",summary:"fix config",requiresApproval:true}}},
    {async approved(){return true}},
    {async retest(){return{pass:true,evidenceRefs:["ev2"]}}},
    ledger
  );
  const r=await cyber.run({id:"s",mode:"REPOSITORY_ONLY",repositoryRefs:["repo"],sandboxIds:[],allowedTargets:[],deniedTargets:[]},{maxHypotheses:3,maxAnalyzerRuns:3,maxPatchProposals:1});
  eq(r.findings[0]?.status,"RETEST_PASS","cyber retest"); p++;
  eq(r.patchProposals,1,"patch budget"); p++;
  return p;
}
