export function ok(v:unknown,m:string):asserts v{if(!v)throw new Error(m)}
export function eq<T>(a:T,b:T,m:string){if(a!==b)throw new Error(`${m}: ${String(a)} !== ${String(b)}`)}
export function near(a:number,b:number,eps:number,m:string){if(Math.abs(a-b)>eps)throw new Error(`${m}: ${a} vs ${b}`)}
export class FixedClock{private i=0;nowIso(){return`2026-09-22T00:00:${String(this.i++).padStart(2,"0")}Z`}}
