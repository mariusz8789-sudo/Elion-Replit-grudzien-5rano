import { createHash } from 'node:crypto';
/** Deterministic helpers. NO Math.random, NO Date.now. */
export const mulberry32 = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');

export type ElementId = 'H' | 'C' | 'N' | 'O' | 'S' | 'F' | 'Cl' | 'P';
export const ATOMIC_MASS: Record<ElementId, number> = { H: 1.008, C: 12.011, N: 14.007, O: 15.999, S: 32.06, F: 18.998, Cl: 35.45, P: 30.974 };
export const VALENCE: Record<ElementId, number> = { H: 1, C: 4, N: 3, O: 2, S: 2, F: 1, Cl: 1, P: 3 };
export type CandidateLabel = 'MODEL_ESTIMATE' | 'SYNTHETIC_CANDIDATE' | 'VALENCE_VERIFIED';

export interface MolecularGraph { readonly atoms: readonly ElementId[]; readonly bonds: readonly (readonly [number, number, number])[]; }
export interface Descriptors { readonly mw: number; readonly logP: number; readonly hbd: number; readonly hba: number; readonly ringCount: number; }
export interface CandidateAssessment {
  readonly candidateId: string; readonly valenceOk: boolean; readonly valenceViolations: readonly string[];
  readonly descriptors: Descriptors; readonly lipinskiPass: boolean; readonly stabilityScore: number;
  readonly rejected: boolean; readonly reasons: readonly string[]; readonly labels: readonly CandidateLabel[];
  readonly fingerprint: string;
}
export const countElements = (g: MolecularGraph): Record<ElementId, number> => {
  const c = { H: 0, C: 0, N: 0, O: 0, S: 0, F: 0, Cl: 0, P: 0 } as Record<ElementId, number>;
  for (const a of g.atoms) c[a] += 1; return c;
};
export const molecularWeight = (g: MolecularGraph): number => { const c = countElements(g); return +Object.keys(c).reduce((s, k) => s + c[k as ElementId] * ATOMIC_MASS[k as ElementId], 0).toFixed(3); };
/** Simple documented fragment-based logP proxy (MODEL_ESTIMATE, not measured). */
export const estimateLogP = (g: MolecularGraph): number => { const c = countElements(g); return +(0.54 * c.C + 0.2 * c.S - 1.5 * c.O - 1.0 * c.N).toFixed(3); };
export const estimateHBA = (g: MolecularGraph): number => { const c = countElements(g); return c.N + c.O; };
export const estimateHBD = (g: MolecularGraph): number => { const c = countElements(g); return Math.floor((c.N + c.O) / 2); };
export const countRings = (g: MolecularGraph): number => { const n = g.atoms.length; const e = g.bonds.length; return Math.max(0, e - n + 1); };
export function validateValence(g: MolecularGraph): { ok: boolean; violations: string[] } {
  const used = new Array(g.atoms.length).fill(0);
  const violations: string[] = [];
  for (const [a, b, o] of g.bonds) { used[a] += o; used[b] += o; }
  for (let i = 0; i < g.atoms.length; i++) { const max = VALENCE[g.atoms[i]]; if (used[i] > max) violations.push(`atom${i}:${g.atoms[i]} used ${used[i]} > valence ${max}`); }
  return { ok: violations.length === 0, violations };
}
export function lipinskiPass(d: Descriptors): boolean { return d.mw <= 500 && d.logP <= 5 && d.hbd <= 5 && d.hba <= 10; }
/** Proxy thermodynamic-stability score in [0,1] (MODEL_ESTIMATE). */
export function stabilityScore(g: MolecularGraph, d: Descriptors): number {
  const rings = d.ringCount; const n = g.atoms.length;
  const sizePenalty = Math.min(1, Math.abs(n - 18) / 40);
  const ringPenalty = Math.min(0.3, rings * 0.05);
  return +Math.max(0, Math.min(1, 1 - sizePenalty - ringPenalty)).toFixed(4);
}
export function assessCandidate(g: MolecularGraph, seed: number): CandidateAssessment {
  const val = validateValence(g);
  const descriptors: Descriptors = { mw: molecularWeight(g), logP: estimateLogP(g), hbd: estimateHBD(g), hba: estimateHBA(g), ringCount: countRings(g) };
  const lip = lipinskiPass(descriptors);
  const stab = stabilityScore(g, descriptors);
  const reasons: string[] = [];
  if (!val.ok) reasons.push('VALENCE_VIOLATION');
  if (!lip) reasons.push('LIPINSKI_FAIL');
  if (stab < 0.2) reasons.push('LOW_STABILITY');
  const labels: CandidateLabel[] = ['MODEL_ESTIMATE', 'SYNTHETIC_CANDIDATE']; if (val.ok) labels.push('VALENCE_VERIFIED');
  const fingerprint = sha256hex(stableStringify({ seed, atoms: g.atoms, bonds: g.bonds, descriptors, valenceOk: val.ok }));
  return { candidateId: 'CAND-' + fingerprint.slice(0, 12), valenceOk: val.ok, valenceViolations: val.violations, descriptors, lipinskiPass: lip, stabilityScore: stab, rejected: reasons.length > 0, reasons, labels, fingerprint };
}
