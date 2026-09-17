/* Proprietary / All Rights Reserved - Genesis OS */
import { createHash } from 'node:crypto';
export const mulberry32 = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export interface Clock { now(): number; }
export const ARCHAEO_DISCLAIMER = 'Procedural interior reconstruction inspired by monumental pyramids. NOT an archaeological survey, measured plan, or endorsement of energy-focus claims.';
export type ChamberKind = 'SUBTERRANEAN' | 'QUEENS' | 'KINGS' | 'GRAND_GALLERY' | 'RESONANT_SHAFT' | 'QUANTUM_FOCUS';
export interface Chamber { readonly id: string; readonly kind: ChamberKind; readonly center: readonly [number, number, number]; readonly dims: readonly [number, number, number]; }
export interface Passage { readonly id: string; readonly kind: 'ASCENDING' | 'DESCENDING'; readonly from: readonly [number, number, number]; readonly to: readonly [number, number, number]; readonly slopeDeg: number; }
export interface PyramidSpec { readonly baseM: number; readonly heightM: number; readonly seed: number; }
export interface PyramidLayout { readonly spec: PyramidSpec; readonly chambers: readonly Chamber[]; readonly passages: readonly Passage[]; readonly resonantFrequenciesHz: readonly number[]; readonly focalPoints: readonly (readonly [number, number, number])[]; readonly dataLabel: 'SYNTHETIC_ARCHAEO_RECONSTRUCTION'; readonly structuralFingerprint: string; }
const SPEED_OF_SOUND = 343;
/** Quarter-wave resonant shaft: f = c / (4 L). */
export const shaftResonanceHz = (lengthM: number): number => +(SPEED_OF_SOUND / (4 * Math.max(0.5, lengthM))).toFixed(3);
const slopeOf = (a: readonly [number, number, number], b: readonly [number, number, number]): number => { const dH = b[1] - a[1]; const dXZ = Math.hypot(b[0] - a[0], b[2] - a[2]); return +(Math.atan2(dH, Math.max(1e-6, dXZ)) * 180 / Math.PI).toFixed(2); };
export function generatePyramidLayout(spec: PyramidSpec): PyramidLayout {
  const rng = mulberry32(spec.seed);
  const subDepth = +(15 + rng() * 15).toFixed(2);
  const queensY = +(spec.heightM * 0.25).toFixed(2);
  const kingsY = +(spec.heightM * 0.42).toFixed(2);
  const chambers: Chamber[] = [
    { id: 'CH-SUB', kind: 'SUBTERRANEAN', center: [0, -subDepth, 0], dims: [14, 5, 8] },
    { id: 'CH-QUE', kind: 'QUEENS', center: [0, queensY, 0], dims: [5.7, 4.5, 5.2] },
    { id: 'CH-KIN', kind: 'KINGS', center: [0, kingsY, +(rng() * 4 - 2).toFixed(2)], dims: [10.4, 5.8, 5.2] },
    { id: 'CH-GAL', kind: 'GRAND_GALLERY', center: [0, +(kingsY * 0.6).toFixed(2), 8], dims: [47, 8.5, 2.1] },
  ];
  const shaftLens = [+(20 + rng() * 20).toFixed(2), +(20 + rng() * 20).toFixed(2)];
  chambers.push({ id: 'CH-SHF-N', kind: 'RESONANT_SHAFT', center: [1, kingsY + shaftLens[0] / 2, 0], dims: [0.2, shaftLens[0], 0.2] });
  chambers.push({ id: 'CH-SHF-S', kind: 'RESONANT_SHAFT', center: [-1, kingsY + shaftLens[1] / 2, 0], dims: [0.2, shaftLens[1], 0.2] });
  chambers.push({ id: 'CH-QFO', kind: 'QUANTUM_FOCUS', center: [0, kingsY, 0], dims: [1, 1, 1] });
  const entrance: readonly [number, number, number] = [spec.baseM * 0.35, +(spec.heightM * 0.08).toFixed(2), spec.baseM * 0.5];
  const passages: Passage[] = [
    { id: 'PA-DESC', kind: 'DESCENDING', from: entrance, to: [0, -subDepth, 0], slopeDeg: slopeOf(entrance, [0, -subDepth, 0]) },
    { id: 'PA-ASC', kind: 'ASCENDING', from: [0, queensY, 4], to: [0, kingsY, 0], slopeDeg: slopeOf([0, queensY, 4], [0, kingsY, 0]) },
  ];
  const resonantFrequenciesHz = shaftLens.map(shaftResonanceHz);
  const focalPoints: readonly (readonly [number, number, number])[] = [[0, kingsY, 0], [0, +(kingsY * 0.6).toFixed(2), 8]];
  const partial = { spec, chambers, passages, resonantFrequenciesHz, focalPoints, dataLabel: 'SYNTHETIC_ARCHAEO_RECONSTRUCTION' as const };
  return { ...partial, structuralFingerprint: sha256hex(stableStringify(partial)) };
}
export class GenesisPyramidInteriorEngine {
  constructor(private clock: Clock, private seed: number) {}
  layout(baseM: number, heightM: number): PyramidLayout { return generatePyramidLayout({ baseM, heightM, seed: this.seed }); }
  disclaimer(): string { return ARCHAEO_DISCLAIMER; }
}
