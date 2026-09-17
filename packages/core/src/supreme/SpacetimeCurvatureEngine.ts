import { createHash } from 'node:crypto';
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export const G = 6.67430e-11; export const C = 299792458;

export interface Clock { now(): number; }
export interface GeodesicPoint { readonly r: number; readonly phi: number; }
export interface SpacetimeSolution {
  readonly massKg: number; readonly schwarzschildRadiusM: number; readonly kerrOuterHorizonM: number;
  readonly timeDilationFactor: number; readonly gravitationalRedshiftZ: number; readonly deflectionRad: number;
  readonly trajectory: readonly GeodesicPoint[]; readonly simulationTime: number;
  readonly dataLabel: 'RELATIVISTIC_SIMULATION'; readonly fingerprint: string;
}
export const schwarzschildRadius = (massKg: number): number => (2 * G * massKg) / (C * C);
export const timeDilationFactor = (massKg: number, r: number): number => { const rs = schwarzschildRadius(massKg); return Math.sqrt(Math.max(0, 1 - rs / Math.max(r, rs + 1e-9))); };
export const kerrOuterHorizon = (massKg: number, aM: number): number => { const m = (G * massKg) / (C * C); const a = Math.min(Math.abs(aM), m); return m + Math.sqrt(Math.max(0, m * m - a * a)); };
export const gravitationalRedshiftZ = (massKg: number, rEmitter: number, rObserver: number): number => {
  const rs = schwarzschildRadius(massKg);
  const e = Math.sqrt(Math.max(1e-12, 1 - rs / Math.max(rEmitter, rs + 1e-9)));
  const o = Math.sqrt(Math.max(1e-12, 1 - rs / Math.max(rObserver, rs + 1e-9)));
  return +(e / o - 1).toFixed(9);
};
/** Deterministic null-geodesic integrator (Schwarzschild, u=1/r, RK4 fixed step). */
export function photonGeodesic(massKg: number, impactParamB: number, steps: number, h: number): { points: GeodesicPoint[]; deflectionRad: number } {
  const rs = schwarzschildRadius(massKg);
  const r0 = 1000 * Math.max(impactParamB, rs * 3);
  let u = 1 / r0;
  let du = -Math.sqrt(Math.max(0, 1 / (impactParamB * impactParamB) - u * u + rs * u * u * u));
  let phi = 0; const points: GeodesicPoint[] = [{ r: 1 / u, phi }];
  const f = (uu: number, dd: number): [number, number] => [dd, 1.5 * rs * uu * uu - uu];
  for (let i = 0; i < steps; i++) {
    const [k1u, k1d] = f(u, du); const [k2u, k2d] = f(u + (h / 2) * k1u, du + (h / 2) * k1d);
    const [k3u, k3d] = f(u + (h / 2) * k2u, du + (h / 2) * k2d); const [k4u, k4d] = f(u + h * k3u, du + h * k3d);
    u += (h / 6) * (k1u + 2 * k2u + 2 * k3u + k4u); du += (h / 6) * (k1d + 2 * k2d + 2 * k3d + k4d); phi += h;
    if (u <= 0) break; points.push({ r: +(1 / u).toFixed(3), phi: +phi.toFixed(6) });
    if (1 / u > r0 && du > 0) break;
  }
  return { points, deflectionRad: +(Math.abs(phi - Math.PI)).toFixed(6) };
}
export const weakDeflection = (massKg: number, b: number): number => (4 * G * massKg) / (C * C * b);

export class SpacetimeCurvatureEngine {
  constructor(private clock: Clock) {}
  solve(p: { massKg: number; radiusM: number; spinAM: number; impactParamB: number; steps?: number; stepSize?: number }): SpacetimeSolution {
    const rs = schwarzschildRadius(p.massKg);
    const geo = photonGeodesic(p.massKg, p.impactParamB, p.steps ?? 400, p.stepSize ?? 0.01);
    const partial = { massKg: p.massKg, schwarzschildRadiusM: +rs.toFixed(4), kerrOuterHorizonM: +kerrOuterHorizon(p.massKg, p.spinAM).toFixed(4),
      timeDilationFactor: +timeDilationFactor(p.massKg, p.radiusM).toFixed(9), gravitationalRedshiftZ: gravitationalRedshiftZ(p.massKg, p.radiusM, p.radiusM * 10),
      deflectionRad: geo.deflectionRad, trajectory: geo.points, simulationTime: this.clock.now() };
    return { ...partial, dataLabel: 'RELATIVISTIC_SIMULATION', fingerprint: sha256hex(stableStringify(partial)) };
  }
}
