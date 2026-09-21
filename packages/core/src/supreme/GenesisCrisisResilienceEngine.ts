import { createHash } from 'node:crypto';
export const mulberry32 = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export interface Clock { now(): number; }
export const CRISIS_DISCLAIMER = 'Civil-defense planning proxy (deterministic physical surrogates). NOT an operational forecast, NOT weapon design guidance.';
export interface CrisisGrid { readonly n: number; readonly cellM: number; readonly population: Float64Array; readonly elevation: Float64Array; readonly infraNodes: readonly number[]; }
export interface CrisisReport { readonly scenario: 'BIO_AEROSOL' | 'THERMONUCLEAR' | 'MEGAFLOOD'; readonly affectedPopulation: number; readonly evacuationZones: readonly number[]; readonly infraSurvivability: number; readonly dataLabel: 'GOV_TECH_CRISIS_SYNTHESIS'; readonly fingerprint: string; }
export const overpressureKPa = (distanceM: number, yieldKgTNT: number): number => { const Z = Math.max(0.5, distanceM / Math.cbrt(Math.max(1, yieldKgTNT))); const raw = Math.max(0, 1772 / Z ** 3 + 114 / Z ** 2 + 108 / Z); return +(10000 * raw / (10000 + raw)).toFixed(2); };
/** Fallout dose-rate decay (t^-1.2) integrated between hours t1..t2 given H+1 rate R1 (mSv/h). */
export const falloutDoseMSv = (R1: number, t1h: number, t2h: number): number => +(R1 / 0.2 * (Math.pow(Math.max(1, t1h), -0.2) - Math.pow(Math.max(t1h, t2h), -0.2))).toFixed(4);
export class GenesisCrisisResilienceEngine {
  constructor(private clock: Clock, private seed: number) {}
  bioAerosol(g: CrisisGrid, releaseCell: number, releaseMassKg: number, wind: readonly [number, number], dt: number, steps: number, kPerDose: number): CrisisReport {
    let C = new Float64Array(g.n * g.n); const dose = new Float64Array(g.n * g.n);
    C[releaseCell] = releaseMassKg;
    for (let s = 0; s < steps; s++) {
      const next = new Float64Array(g.n * g.n);
      for (let y = 0; y < g.n; y++) for (let x = 0; x < g.n; x++) {
        const i = y * g.n + x; const sx = x - Math.round(wind[0] * dt), sy = y - Math.round(wind[1] * dt);
        const src = (sy >= 0 && sy < g.n && sx >= 0 && sx < g.n) ? C[sy * g.n + sx] : 0;
        const l = x > 0 ? C[i - 1] : src, r = x < g.n - 1 ? C[i + 1] : src, u = y > 0 ? C[i - g.n] : src, d = y < g.n - 1 ? C[i + g.n] : src;
        next[i] = src * 0.6 + 0.1 * (l + r + u + d);
      }
      C = next; for (let i = 0; i < dose.length; i++) dose[i] += C[i] * dt;
    }
    let affected = 0; const zones: number[] = [];
    for (let i = 0; i < dose.length; i++) { const surv = Math.exp(-kPerDose * dose[i]); affected += g.population[i] * (1 - surv); if (dose[i] > 1) zones.push(i); }
    const survInfra = g.infraNodes.filter(i => dose[i] <= 1).length / Math.max(1, g.infraNodes.length);
    const partial = { scenario: 'BIO_AEROSOL' as const, affectedPopulation: +affected.toFixed(1), evacuationZones: zones, infraSurvivability: +survInfra.toFixed(4), dataLabel: 'GOV_TECH_CRISIS_SYNTHESIS' as const };
    return { ...partial, fingerprint: sha256hex(stableStringify({ seed: this.seed, ...partial })) };
  }
  thermonuclear(g: CrisisGrid, groundZeroCell: number, yieldMt: number): CrisisReport {
    const W = yieldMt * 1e9; const gzX = groundZeroCell % g.n, gzY = Math.floor(groundZeroCell / g.n);
    let affected = 0; const zones: number[] = []; let survCount = 0;
    for (let i = 0; i < g.population.length; i++) {
      const x = i % g.n, y = Math.floor(i / g.n);
      const R = Math.hypot(x - gzX, y - gzY) * g.cellM;
      const P = overpressureKPa(R, W);
      if (P >= 34.5) affected += g.population[i]; else if (P >= 7) affected += g.population[i] * 0.3;
      if (falloutDoseMSv(100 * Math.exp(-R / 20000), 1, 48) > 10) zones.push(i);
    }
    for (const node of g.infraNodes) { const x = node % g.n, y = Math.floor(node / g.n); const R = Math.hypot(x - gzX, y - gzY) * g.cellM; if (overpressureKPa(R, W) < 34.5) survCount++; }
    const partial = { scenario: 'THERMONUCLEAR' as const, affectedPopulation: +affected.toFixed(1), evacuationZones: zones, infraSurvivability: +(survCount / Math.max(1, g.infraNodes.length)).toFixed(4), dataLabel: 'GOV_TECH_CRISIS_SYNTHESIS' as const };
    return { ...partial, fingerprint: sha256hex(stableStringify({ seed: this.seed, ...partial })) };
  }
  megaFlood(g: CrisisGrid, breachCell: number, volumeM3: number, dt: number, steps: number): CrisisReport {
    let W = new Float64Array(g.n * g.n); W[breachCell] = volumeM3 / (g.cellM * g.cellM);
    for (let s = 0; s < steps; s++) {
      const next = Float64Array.from(W);
      for (let i = 0; i < W.length; i++) {
        if (W[i] <= 1e-6) continue;
        const x = i % g.n, y = Math.floor(i / g.n);
        const nbs = [x > 0 ? i - 1 : -1, x < g.n - 1 ? i + 1 : -1, y > 0 ? i - g.n : -1, y < g.n - 1 ? i + g.n : -1].filter(n => n >= 0);
        const heads = nbs.map(n => Math.max(0, (g.elevation[i] + W[i]) - (g.elevation[n] + W[n])));
        const total = heads.reduce((a, b) => a + b, 0); if (total <= 0) continue;
        const movable = Math.min(W[i], total * 0.125 * dt);
        nbs.forEach((n, k) => { const q = movable * (heads[k] / total); next[i] -= q; next[n] += q; });
      }
      W = next;
    }
    let affected = 0; const zones: number[] = [];
    for (let i = 0; i < W.length; i++) if (W[i] > 0.3) { affected += g.population[i]; zones.push(i); }
    const survInfra = g.infraNodes.filter(i => W[i] <= 0.3).length / Math.max(1, g.infraNodes.length);
    const partial = { scenario: 'MEGAFLOOD' as const, affectedPopulation: +affected.toFixed(1), evacuationZones: zones, infraSurvivability: +survInfra.toFixed(4), dataLabel: 'GOV_TECH_CRISIS_SYNTHESIS' as const };
    return { ...partial, fingerprint: sha256hex(stableStringify({ seed: this.seed, ...partial })) };
  }
  disclaimer(): string { return CRISIS_DISCLAIMER; }
}
