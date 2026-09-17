import { createHash } from 'node:crypto';
export const mulberry32 = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export interface Clock { now(): number; }
export const BIO_DISCLAIMER = 'Computational proxy only (shape/complementarity surrogate). NOT experimental affinity, NOT a drug, NOT safety or efficacy claim.';
export interface ReceptorTarget { readonly id: string; readonly name: string; readonly family: string; readonly pocketVec: readonly number[]; }
export const MOR_TARGET: ReceptorTarget = { id: 'MOR', name: 'mu-opioid receptor (antagonist mode)', family: 'GPCR', pocketVec: Array.from({ length: 24 }, (_, i) => Math.sin(i * 0.7) * 0.8) };
export const TOXIN_EPITOPE: ReceptorTarget = { id: 'FENT-EPITOPE', name: 'synthetic-opioid epitope (neutralization mode)', family: 'small-molecule', pocketVec: Array.from({ length: 24 }, (_, i) => Math.cos(i * 0.5) * 0.7) };
export interface Candidate { readonly id: string; readonly descVec: readonly number[]; readonly massDa: number; readonly logP: number; readonly hbd: number; readonly hba: number; readonly toxophores: readonly string[]; }
export interface DockingResult { readonly candidateId: string; readonly complementarity: number; readonly kdProxyNM: number; readonly kiProxyNM: number; readonly selectivity: number; readonly toxFlag: boolean; readonly score: number; readonly dataLabel: 'BIOLOGICAL_SYNTHETIC_ESTIMATE'; readonly fingerprint: string; }
const TOXOPHORE_PATTERNS = ['N=N', 'epoxide', 'C(=O)Cl', 'aziridine'] as const;
export const makeCandidate = (seed: number, id: string): Candidate => { const rng = mulberry32(seed ^ parseInt(sha256hex(id).slice(0, 8), 16));
  return { id, descVec: Array.from({ length: 24 }, () => +(rng() * 2 - 1).toFixed(4)), massDa: +(150 + rng() * 350).toFixed(1), logP: +(rng() * 5).toFixed(2), hbd: Math.floor(rng() * 4), hba: Math.floor(rng() * 8), toxophores: TOXOPHORE_PATTERNS.filter((_, i) => rng() > 0.85 && i === 0) }; };
const complementarityOf = (pocket: readonly number[], desc: readonly number[]): number => { let d = 0, np = 0, nd = 0; for (let i = 0; i < pocket.length; i++) { d += (pocket[i] - desc[i]) ** 2; np += pocket[i] ** 2; nd += desc[i] ** 2; } return +(1 - Math.min(1, Math.sqrt(d) / (Math.sqrt(np) + Math.sqrt(nd) + 1e-9))).toFixed(6); };
/** Cheng-Prusoff shift: Ki = IC50 / (1 + [S]/Km). Deterministic. */
export const chengPrusoffKi = (ic50NM: number, substrateNM: number, kmNM: number): number => +(ic50NM / (1 + substrateNM / Math.max(1e-9, kmNM))).toFixed(4);
export class GenesisDrugDiscoveryEngine {
  constructor(private clock: Clock, private seed: number) {}
  screen(candidates: readonly Candidate[], target: ReceptorTarget, substrateNM = 10, kmNM = 50): readonly DockingResult[] {
    const out: DockingResult[] = candidates.map(c => {
      const comp = complementarityOf(target.pocketVec, c.descVec);
      const kd = +(1000 * Math.exp(-6 * comp)).toFixed(4);
      const ki = chengPrusoffKi(kd, substrateNM, kmNM);
      const offTarget = complementarityOf(MOR_TARGET.pocketVec, c.descVec);
      const selectivity = +(Math.max(0, comp - offTarget)).toFixed(6);
      const toxFlag = c.toxophores.length > 0;
      const score = +(comp * 0.6 + selectivity * 0.3 + (toxFlag ? 0 : 0.1)).toFixed(6);
      return { candidateId: c.id, complementarity: comp, kdProxyNM: kd, kiProxyNM: ki, selectivity, toxFlag, score, dataLabel: 'BIOLOGICAL_SYNTHETIC_ESTIMATE', fingerprint: sha256hex(stableStringify({ seed: this.seed, target: target.id, c: c.id, comp, kd, ki, selectivity, toxFlag })) };
    });
    return out.sort((a, b) => b.score - a.score);
  }
  disclaimer(): string { return BIO_DISCLAIMER; }
}
