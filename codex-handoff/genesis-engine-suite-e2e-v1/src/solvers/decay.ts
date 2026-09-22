export function solveExponentialDecay(n0:number,lambda:number,t:number):number{
  if(lambda<0||t<0)throw new Error("lambda and time must be non-negative");
  return n0*Math.exp(-lambda*t);
}
