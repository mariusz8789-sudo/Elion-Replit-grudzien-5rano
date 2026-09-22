import { solveKinematics, solveLogistic, solveSeir, solveDiffusion1D, solveExponentialDecay } from "../src/kernel.js";
import { near } from "./utils.js";
export async function runSolvers(){
  let p=0;
  const k=solveKinematics({x0:0,v0:10,a:2,t:3}); near(k.x,39,1e-9,"kinematics"); p++;
  const l=solveLogistic({n0:10,r:.5,k:100,dt:.01,steps:100}); if(!(l>10&&l<100))throw new Error("logistic"); p++;
  const s=solveSeir({s:990,e:5,i:5,r:0,beta:.4,sigma:.2,gamma:.1,dt:.1,steps:20}); near(s.total,1000,1e-6,"seir conservation"); p++;
  const d=solveDiffusion1D({values:[0,0,1,0,0],diffusivity:.1,dx:1,dt:.1,steps:10}); if(!(d[2]!<1&&d[1]!>0))throw new Error("diffusion"); p++;
  near(solveExponentialDecay(100,.1,10),100*Math.exp(-1),1e-9,"decay"); p++;
  return p;
}
