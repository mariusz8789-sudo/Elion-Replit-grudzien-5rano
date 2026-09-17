import { createHash } from 'node:crypto';

/** Local deterministic helpers (self-contained; no Math.random, no Date.now). */
export const mulberry32 = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');

export type DataLabel = 'REAL' | 'COMPUTED' | 'MODEL_ESTIMATE' | 'SYNTHETIC' | 'SCENARIO' | 'BLOCKED' | 'CORROBORATION_ONLY' | 'UNVERIFIED_GAP';
export interface Clock { now(): number; }
export interface MicroscopeInput { readonly sampleId: string; readonly baseGridSize: number; readonly seed: number; readonly psfSigma: number; }
export interface MicroscopeResult {
  readonly sampleId: string; readonly baseGrid: readonly (readonly number[])[]; readonly superGrid: readonly (readonly number[])[];
  readonly resolutionGainFactor: 2; readonly psfSigma: number; readonly seed: number; readonly simulationTime: number;
  readonly dataLabel: 'MODEL_ESTIMATE'; readonly fingerprint: string;
}

/** Base spatial intensity matrix (n x n), deterministic from seed. */
export function sampleBase(input: MicroscopeInput): number[][] {
  const rng = mulberry32(input.seed); const n = Math.max(2, Math.floor(input.baseGridSize));
  const raw: number[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => rng()));
  return raw.map((row, i) => row.map((v, j) => {
    const up = raw[Math.max(0, i - 1)][j], dn = raw[Math.min(n - 1, i + 1)][j], lf = raw[i][Math.max(0, j - 1)], rt = raw[i][Math.min(n - 1, j + 1)];
    return +((v * 0.5 + (up + dn + lf + rt) * 0.125)).toFixed(6);
  }));
}
/** Stochastic super-resolution upsample to 2x density (localization jitter from seeded RNG, NOT Math.random). */
export function upsampleSuperRes(base: readonly (readonly number[])[], seed: number, psfSigma: number): number[][] {
  const n = base.length; const n2 = n * 2; const rng = mulberry32(seed ^ 0x5f3a);
  const at = (i: number, j: number) => base[Math.min(n - 1, Math.max(0, i))][Math.min(n - 1, Math.max(0, j))];
  const out: number[][] = [];
  for (let i = 0; i < n2; i++) { const row: number[] = []; const bi = Math.floor(i / 2); const fx = (i % 2) * 0.5;
    for (let j = 0; j < n2; j++) { const bj = Math.floor(j / 2); const fy = (j % 2) * 0.5;
      const c00 = at(bi, bj), c01 = at(bi, bj + 1), c10 = at(bi + 1, bj), c11 = at(bi + 1, bj + 1);
      const bilinear = c00 * (1 - fx) * (1 - fy) + c01 * (1 - fx) * fy + c10 * fx * (1 - fy) + c11 * fx * fy;
      const jitter = (rng() - 0.5) * psfSigma * bilinear;
      row.push(+Math.max(0, bilinear + jitter).toFixed(6)); }
    out.push(row); }
  return out;
}
export function createHyperMicroscope(clock: Clock) {
  function simulate(input: MicroscopeInput): MicroscopeResult {
    const base = sampleBase(input);
    const superGrid = upsampleSuperRes(base, input.seed, input.psfSigma);
    const partial = { sampleId: input.sampleId, baseGrid: base, superGrid, resolutionGainFactor: 2 as const, psfSigma: input.psfSigma, seed: input.seed, simulationTime: clock.now(), dataLabel: 'MODEL_ESTIMATE' as const };
    return { ...partial, fingerprint: sha256hex(stableStringify(partial)) };
  }
  return { simulate, sampleBase, upsampleSuperRes };
}
