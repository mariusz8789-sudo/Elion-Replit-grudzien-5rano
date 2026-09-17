import { createHash } from 'node:crypto';
export const mulberry32 = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export interface Clock { now(): number; }
export interface BioResult<T> { readonly payload: T; readonly dataLabel: 'BIOLOGICAL_SYNTHETIC_ESTIMATE'; readonly fingerprint: string; }
const rk4 = (y: number[], dt: number, f: (y: number[]) => number[]): number[] => { const k1 = f(y); const k2 = f(y.map((v, i) => v + (dt / 2) * k1[i])); const k3 = f(y.map((v, i) => v + (dt / 2) * k2[i])); const k4 = f(y.map((v, i) => v + dt * k3[i])); return y.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])); };
/** Analytic logistic replication (closed form => no integration error). */
export const logisticReplication = (r: number, K: number, V0: number, t: number): number => +(K / (1 + ((K - V0) / V0) * Math.exp(-r * t))).toFixed(9);
/** Deterministic mutation accumulation: wildtype fraction = (1-mu)^g. */
export const mutationCurve = (muPerRep: number, generations: number): { wildtypeFraction: number; variantFraction: number } => { const w = Math.pow(1 - muPerRep, generations); return { wildtypeFraction: +w.toFixed(9), variantFraction: +(1 - w).toFixed(9) }; };
/** 1-D diffusion with reflective boundaries (mass-conserving, stable for dt<=dx^2/(4D)). */
export function diffuseMedium(D: number, dx: number, dt: number, steps: number, initial: Float64Array): Float64Array {
  let c = Float64Array.from(initial); const n = c.length; const k = (D * dt) / (dx * dx);
  for (let s = 0; s < steps; s++) { const next = Float64Array.from(c);
    for (let i = 0; i < n; i++) { const l = i > 0 ? c[i - 1] : c[i]; const r = i < n - 1 ? c[i + 1] : c[i]; next[i] = c[i] + k * (l - 2 * c[i] + r); }
    c = next; }
  return c;
}
export const massOf = (c: Float64Array): number => +Array.from(c).reduce((a, b) => a + b, 0).toFixed(9);
/** Lock-and-key antibody-antigen binding kinetics (RK4, deterministic). */
export function bindingKinetics(kon: number, koff: number, Ab0: number, Ag0: number, dt: number, steps: number): { complex: number; neutralization: number } {
  let y = [0];
  const f = (yy: number[]) => { const C = yy[0]; const Ab = Math.max(0, Ab0 - C); const Ag = Math.max(0, Ag0 - C); return [kon * Ab * Ag - koff * C]; };
  for (let i = 0; i < steps; i++) y = rk4(y, dt, f);
  const C = Math.min(y[0], Math.min(Ab0, Ag0));
  return { complex: +C.toFixed(9), neutralization: +(C / Math.max(1e-12, Ag0)).toFixed(9) };
}
/** Central-dogma expression dynamics (transcription/translation/degradation) + analytic steady state. */
export function expressionDynamics(alpha: number, delta: number, beta: number, gamma: number, M0: number, P0: number, dt: number, steps: number): { mRNA: number; protein: number; steadyMRNA: number; steadyProtein: number } {
  let y = [M0, P0];
  const f = (yy: number[]) => [alpha - delta * yy[0], beta * yy[0] - gamma * yy[1]];
  for (let i = 0; i < steps; i++) y = rk4(y, dt, f);
  return { mRNA: +y[0].toFixed(9), protein: +y[1].toFixed(9), steadyMRNA: +(alpha / delta).toFixed(9), steadyProtein: +((beta * alpha) / (delta * gamma)).toFixed(9) };
}
export const gcContent = (seq: string): number => { const s = seq.toUpperCase(); let gc = 0; for (const ch of s) if (ch === 'G' || ch === 'C') gc++; return +(gc / Math.max(1, s.length)).toFixed(6); };
/** Deterministic Franklin-style helix diffraction peak positions (layer-line spacing from pitch). */
export const franklinLayerLines = (helixPitchNm: number, layerSpacingNm: number, count: number): number[] => Array.from({ length: count }, (_, i) => +((i + 1) * (layerSpacingNm / helixPitchNm)).toFixed(6));
/** Fleming-style inhibition zone radius from diffusion + concentration (deterministic proxy). */
export const flemingInhibitionZoneMm = (diffCoeff: number, concentration: number, micThreshold: number): number => +(Math.sqrt(Math.max(0, (4 * diffCoeff * Math.log(Math.max(1, concentration / micThreshold)))))).toFixed(4);
export class GenesisBioVirologyEngine {
  constructor(private clock: Clock, private seed: number) {}
  wrap<T>(payload: T): BioResult<T> { return { payload, dataLabel: 'BIOLOGICAL_SYNTHETIC_ESTIMATE', fingerprint: sha256hex(stableStringify({ seed: this.seed, payload })) }; }
}
