import type { EvidenceLedgerEngine } from "../evidenceReplay/ledger.js";
import type { DigitalTwinState, TwinIntervention } from "./types.js";

export interface TwinSolverPort {
  simulate(input:{state:DigitalTwinState;intervention:TwinIntervention;dt:number}):Promise<DigitalTwinState>;
}

export class DigitalTwinOrchestrationEngine {
  constructor(private readonly solver:TwinSolverPort,private readonly ledger:EvidenceLedgerEngine){}
  async step(state:DigitalTwinState,intervention:TwinIntervention,dt:number):Promise<DigitalTwinState>{
    if(intervention.label!=="SIMULATION_ONLY")throw new Error("only simulation interventions are allowed");
    const next=await this.solver.simulate({state,intervention,dt});
    this.ledger.append({streamId:state.twinId,type:"DIGITAL_TWIN_SIMULATION_STEP",epistemicStatus:"SIMULATED",payload:{before:state,intervention,after:next}});
    return next;
  }
}
