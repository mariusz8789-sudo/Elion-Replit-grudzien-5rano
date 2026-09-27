import type { EpistemicStatus } from "../common/types.js";
export interface TwinVariable {
  id:string;
  value:number;
  unit:string;
  status:EpistemicStatus;
  evidenceRefs:string[];
}
export interface DigitalTwinState {
  twinId:string;
  time:number;
  variables:Record<string,TwinVariable>;
  modelVersion:string;
}
export interface TwinIntervention {
  id:string;
  kind:string;
  parameters:Record<string,number>;
  label:"SIMULATION_ONLY";
}
