export interface Diffusion1DInput { values:number[]; diffusivity:number; dx:number; dt:number; steps:number; }
export function solveDiffusion1D(input:Diffusion1DInput):number[]{
  if(input.values.length<3)return [...input.values];
  const alpha=input.diffusivity*input.dt/(input.dx*input.dx);
  if(alpha>0.5)throw new Error("unstable explicit diffusion step: alpha > 0.5");
  let u=[...input.values];
  for(let s=0;s<input.steps;s++){
    const next=[...u];
    for(let i=1;i<u.length-1;i++) next[i]=u[i]!+alpha*(u[i+1]!-2*u[i]!+u[i-1]!);
    u=next;
  }
  return u;
}
