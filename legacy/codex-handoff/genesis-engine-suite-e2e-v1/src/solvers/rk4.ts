export function rk4Step(
  t: number,
  y: readonly number[],
  dt: number,
  f: (t:number,y:readonly number[])=>number[]
): number[] {
  const add=(a:readonly number[],b:readonly number[],s:number)=>a.map((v,i)=>v+s*(b[i] ?? 0));
  const k1=f(t,y);
  const k2=f(t+dt/2,add(y,k1,dt/2));
  const k3=f(t+dt/2,add(y,k2,dt/2));
  const k4=f(t+dt,add(y,k3,dt));
  return y.map((v,i)=>v+dt*((k1[i]??0)+2*(k2[i]??0)+2*(k3[i]??0)+(k4[i]??0))/6);
}
