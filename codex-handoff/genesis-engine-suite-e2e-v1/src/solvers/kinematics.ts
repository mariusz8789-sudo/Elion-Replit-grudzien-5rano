export interface KinematicsInput { x0:number;v0:number;a:number;t:number; }
export function solveKinematics(x:KinematicsInput){
  return {x:x.x0+x.v0*x.t+0.5*x.a*x.t*x.t,v:x.v0+x.a*x.t};
}
