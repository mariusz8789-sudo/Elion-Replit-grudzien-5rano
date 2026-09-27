import { rk4Step } from "./rk4.js";
export interface SeirInput { s:number;e:number;i:number;r:number;beta:number;sigma:number;gamma:number;dt:number;steps:number; }
export interface SeirOutput { s:number;e:number;i:number;r:number; total:number; }
export function solveSeir(input:SeirInput):SeirOutput{
  let y=[input.s,input.e,input.i,input.r];
  let t=0;
  for(let step=0;step<input.steps;step++){
    y=rk4Step(t,y,input.dt,(_t,v)=>{
      const [s,e,i]=v; const n=v.reduce((a,b)=>a+b,0);
      if(!s||e===undefined||i===undefined||n<=0)return[0,0,0,0];
      const inf=input.beta*s*i/n;
      return[-inf,inf-input.sigma*e,input.sigma*e-input.gamma*i,input.gamma*i];
    });
    t+=input.dt;
  }
  return{s:y[0]!,e:y[1]!,i:y[2]!,r:y[3]!,total:y.reduce((a,b)=>a+b,0)};
}
