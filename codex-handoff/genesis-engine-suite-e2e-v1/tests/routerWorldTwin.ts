import { EvidenceLedgerEngine, ReferenceHashPort, ModelRouterEngine, WorldAuthorDirectorEngine, DigitalTwinOrchestrationEngine } from "../src/kernel.js";
import { FixedClock, eq } from "./utils.js";
export async function runRouterWorldTwin(){
  let p=0;
  const ledger=new EvidenceLedgerEngine(new ReferenceHashPort(),new FixedClock());
  const router=new ModelRouterEngine(ledger);
  router.register({descriptor:{id:"astra",model:"astra",enabled:true,capabilities:[{task:"WORLD_AUTHOR",quality:5,costClass:"HIGH",structured:true}]},async run(){return{proposal:true}}});
  const r=await router.run({id:"m1",class:"WORLD_AUTHOR",input:{},requireStructured:true,maxCostClass:"HIGH"});
  eq(r.providerId,"astra","router"); p++;
  const v=router.attachSolverVerification(r,["solver:e1"]); eq(v.verification,"VERIFIED_BY_SOLVER","solver verification"); p++;

  const world=new WorldAuthorDirectorEngine(
    {async propose(req){return{requestId:req.id,title:"world",zones:[{id:"z",kind:"LAB",position:[0,0,0],size:[1,1,1]}],capabilities:["LAB"],claims:[{feature:"layout",label:"SIMULATED",sourceRefs:[]}],warnings:[]}}},
    {async execute({request}){return{worldId:`w:${request.id}`,worldGraphRef:"canonical-world-graph",evidenceRefs:["world:e"]}}},
    ledger
  );
  const wr=await world.create({id:"w1",prompt:"lab",kind:"LAB",population:"OFF",runtime:"THREE"});
  eq(wr.status,"EXECUTED","world"); p++;

  const twin=new DigitalTwinOrchestrationEngine({async simulate({state,dt}){return{...state,time:state.time+dt,variables:{...state.variables,x:{...state.variables.x!,value:state.variables.x!.value+1,status:"SIMULATED"}}}}},ledger);
  const t=await twin.step({twinId:"t",time:0,modelVersion:"1",variables:{x:{id:"x",value:1,unit:"u",status:"SUPPORTED",evidenceRefs:[]}}},{id:"i",kind:"test",parameters:{},label:"SIMULATION_ONLY"},1);
  eq(t.variables.x?.value,2,"twin"); p++;
  return p;
}
