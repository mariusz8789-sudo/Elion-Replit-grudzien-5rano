export type HistoricalLabel="EVIDENCE_BACKED"|"INFERRED"|"SIMULATED"|"CINEMATIC";
export interface WorldRequest {
  id:string;
  prompt:string;
  kind:"CITY"|"HISTORICAL"|"LAB"|"MARS"|"CUSTOM";
  year?:number;
  population:"OFF"|"SPARSE"|"NORMAL"|"CROWD";
  runtime:"THREE"|"UNREAL_FUTURE";
}
export interface Zone {
  id:string;
  kind:"ROAD"|"BUILDING"|"LAB"|"TERRAIN"|"OPEN_SPACE";
  position:[number,number,number];
  size:[number,number,number];
}
export interface WorldProposal {
  requestId:string;
  title:string;
  zones:Zone[];
  capabilities:string[];
  claims:Array<{feature:string;label:HistoricalLabel;sourceRefs:string[]}>;
  warnings:string[];
}
