/* Proprietary / All Rights Reserved - Genesis OS */
import { createHash } from 'node:crypto';
export const mulberry32 = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export interface Clock { now(): number; }
export const GEO_DISCLAIMER = 'Procedural thought-experiment reconstruction. NOT real cartography. "Lands beyond the ice wall" are fictional/uncharted synthetic landmasses; the ice-wall premise is an unsubstantiated claim, modeled here only as speculative geometry.';
export type BeyondBiome = 'ICE_SHELF' | 'TUNDRA' | 'BOREAL_FOREST' | 'VOLCANIC' | 'UNKNOWN_MAGNETIC';
export interface BeyondLandMatrix { readonly gridN: number; readonly cellKm: number; readonly altitude: Float64Array; readonly biome: readonly BeyondBiome[]; readonly magneticAnomaly: Float64Array; readonly dataLabel: 'SYNTHETIC_GEO_EXPLORATION'; readonly fingerprint: string; }
export interface ExpeditionEntry { readonly index: number; readonly at: number; readonly region: string; readonly payloadHash: string; readonly prevHash: string; readonly hash: string; }
const hash2 = (x: number, y: number, seed: number): number => { let h = seed >>> 0; h = Math.imul(h ^ x, 0x27d4eb2d); h = Math.imul(h ^ y, 0x165667b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const smooth = (t: number) => t * t * (3 - 2 * t);
function valueNoise(x: number, y: number, seed: number): number { const xi = Math.floor(x), yi = Math.floor(y); const fx = smooth(x - xi), fy = smooth(y - yi); const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; }
function fbm(x: number, y: number, seed: number, oct = 4): number { let amp = 1, f = 1, s = 0, n = 0; for (let o = 0; o < oct; o++) { s += amp * valueNoise(x * f, y * f, seed + o * 101); n += amp; amp *= 0.5; f *= 2; } return s / n; }
/** Procedural beyond-ice-wall landmass: angularly warped (non-Euclidean-feel) coastlines, altitude, biomes, magnetic anomalies. */
export function generateBeyondLand(seed: number, gridN: number, cellKm = 25): BeyondLandMatrix {
  const rng = mulberry32(seed); const phase = rng() * 6.28;
  const altitude = new Float64Array(gridN * gridN); const magneticAnomaly = new Float64Array(gridN * gridN); const biome: BeyondBiome[] = [];
  for (let y = 0; y < gridN; y++) for (let x = 0; x < gridN; x++) {
    const i = y * gridN + x; const nx = x / gridN - 0.5, ny = y / gridN - 0.5;
    const r = Math.hypot(nx, ny); const theta = Math.atan2(ny, nx);
    const warpedR = r * (1 + 0.25 * Math.sin(3 * theta + phase));
    const alt = (fbm(warpedR * 6 + 10, theta * 2 + 10, seed) - 0.45) * 2200 - Math.max(0, r - 0.42) * 4000;
    altitude[i] = +alt.toFixed(2);
    const mag = fbm(nx * 8 + 40, ny * 8 + 40, seed ^ 0x5f3a);
    magneticAnomaly[i] = +mag.toFixed(4);
    biome.push(r > 0.46 ? 'ICE_SHELF' : mag > 0.75 ? 'UNKNOWN_MAGNETIC' : alt < 200 ? 'TUNDRA' : alt < 900 ? 'BOREAL_FOREST' : 'VOLCANIC');
  }
  return { gridN, cellKm, altitude, biome, magneticAnomaly, dataLabel: 'SYNTHETIC_GEO_EXPLORATION', fingerprint: sha256hex(stableStringify({ seed, gridN, sample: Array.from(altitude.slice(0, 128)) })) };
}
export class GenesisIceWallBeyondEngine {
  private ledger: ExpeditionEntry[] = [];
  constructor(private clock: Clock, private seed: number) {}
  explore(region: string, gridN = 48): BeyondLandMatrix { const m = generateBeyondLand(this.seed ^ parseInt(sha256hex(region).slice(0, 8), 16), gridN); this.log(region, { fingerprint: m.fingerprint }); return m; }
  private log(region: string, payload: unknown): void { const prev = this.ledger.length ? this.ledger[this.ledger.length - 1].hash : 'GENESIS'; const at = this.clock.now(); const index = this.ledger.length; const payloadHash = sha256hex(stableStringify(payload)); const hash = sha256hex(stableStringify({ index, region, at, payloadHash, prevHash: prev })); this.ledger.push(Object.freeze({ index, at, region, payloadHash, prevHash: prev, hash })); }
  getLedger(): readonly ExpeditionEntry[] { return this.ledger; }
  verifyLedger(): { ok: boolean; errors: readonly string[] } { const errors: string[] = []; let prev = 'GENESIS'; for (const e of this.ledger) { if (e.prevHash !== prev) errors.push('CHAIN_BREAK@' + e.index); if (e.hash !== sha256hex(stableStringify({ index: e.index, region: e.region, at: e.at, payloadHash: e.payloadHash, prevHash: e.prevHash }))) errors.push('HASH_MISMATCH@' + e.index); prev = e.hash; } return { ok: errors.length === 0, errors }; }
  disclaimer(): string { return GEO_DISCLAIMER; }
}
