export interface LogisticInput { n0:number;r:number;k:number;dt:number;steps:number; }
export function solveLogistic(x:LogisticInput):number{
  let n=x.n0;
  for(let i=0;i<x.steps;i++) n += x.dt*x.r*n*(1-n/x.k);
  return n;
}
