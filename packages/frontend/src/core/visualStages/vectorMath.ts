import type { Vec3 } from './contracts';
export const add = (a: Vec3,b: Vec3): Vec3 => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export const sub = (a: Vec3,b: Vec3): Vec3 => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const scale = (a: Vec3,s:number): Vec3 => [a[0]*s,a[1]*s,a[2]*s];
export const length = (a: Vec3): number => Math.hypot(a[0],a[1],a[2]);
export const distance = (a: Vec3,b: Vec3): number => length(sub(a,b));
export const lerp = (a: Vec3,b: Vec3,t:number): Vec3 => [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
export const smoothstep = (t:number): number => { const x=Math.max(0,Math.min(1,t)); return x*x*(3-2*x); };
