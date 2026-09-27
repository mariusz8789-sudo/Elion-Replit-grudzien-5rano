import { EvidenceLedgerEngine, ReplayEngine, ReferenceHashPort, MetaCognitionEngine } from "../src/kernel.js";
import { FixedClock, eq, ok } from "./utils.js";
export async function runEvidenceMeta(){
  let p=0;
  const ledger=new EvidenceLedgerEngine(new ReferenceHashPort(),new FixedClock());
  ledger.append({streamId:"x",type:"A",epistemicStatus:"KNOWN",payload:{n:1}});
  ledger.append({streamId:"x",type:"B",epistemicStatus:"SUPPORTED",payload:{n:2}});
  ok(ledger.verify().valid,"ledger verify"); p++;
  const snap=ledger.snapshot();
  const ledger2=new EvidenceLedgerEngine(new ReferenceHashPort(),new FixedClock());
  ledger2.restore(snap); eq(ledger2.list().length,2,"restore"); p++;
  const replay=new ReplayEngine().replay(ledger.list(),{initial:()=>0,apply:(s,e)=>s+(typeof (e.payload as {n?:unknown}).n==="number"?(e.payload as {n:number}).n:0)});
  eq(replay.state,3,"replay"); p++;
  const meta=new MetaCognitionEngine(ledger);
  const cs=meta.findContradictions([
    {id:"c1",subject:"x",predicate:"value",value:1,status:"SUPPORTED",confidence:.9,evidenceRefs:[],rationale:""},
    {id:"c2",subject:"x",predicate:"value",value:2,status:"SUPPORTED",confidence:.8,evidenceRefs:[],rationale:""}
  ]);
  eq(cs.length,1,"contradiction"); p++;
  return p;
}
