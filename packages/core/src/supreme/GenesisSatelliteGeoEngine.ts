import { createHash } from 'node:crypto';
export const mulberry32 = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export interface Clock { now(): number; }
export const GEO_DISCLAIMER = 'Procedural synthetic reconstruction seeded by location-name hash. NOT real satellite, bathymetric or sensor measurements.';
export type LandCoverType = 'OCEAN' | 'COAST' | 'JUNGLE' | 'DESERT' | 'ICE' | 'URBAN' | 'ROCK';
export interface LocationQuery { readonly queryId: string; readonly name: string; readonly gps?: { readonly lat: number; readonly lon: number }; readonly seed: number; }
export interface SatelliteProfile { readonly locationName: string; readonly gpsHash: string; readonly gridSize: number; readonly elevation: Float64Array; readonly bathymetry: Float64Array; readonly landCover: LandCoverType; readonly thermalIndex: number; readonly jungleDensity: number; readonly dataLabel: 'SATELLITE_GEO_SYNTHESIS'; readonly fingerprint: string; }
export interface Point5D { readonly t: number; readonly x: number; readonly y: number; readonly z: number; readonly w: number; }
export interface GeoReconstruction5D { readonly points: readonly Point5D[]; readonly gridSize: number; readonly cellM: number; readonly bbox: readonly [number, number, number, number]; readonly dataLabel: 'SATELLITE_GEO_SYNTHESIS'; readonly fingerprint: string; }
export interface NarrationBeat { readonly tStart: number; readonly tEnd: number; readonly line: string; }
export interface RenderPackage5D { readonly packageId: string; readonly locationName: string; readonly reconstruction: GeoReconstruction5D; readonly cameraPath: readonly (readonly number[])[]; readonly palette: readonly string[]; readonly narration: readonly NarrationBeat[]; readonly durationSeconds: number; readonly viralTags: readonly string[]; readonly geoLabel: 'SATELLITE_GEO_SYNTHESIS'; readonly dataLabel: 'SYNTHETIC_CINEMATIC'; readonly disclaimer: string; readonly fingerprint: string; }
const hash2 = (x: number, y: number, seed: number): number => { let h = seed >>> 0; h = Math.imul(h ^ x, 0x27d4eb2d); h = Math.imul(h ^ y, 0x165667b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const smooth = (t: number) => t * t * (3 - 2 * t);
function valueNoise(x: number, y: number, seed: number): number { const xi = Math.floor(x), yi = Math.floor(y); const fx = smooth(x - xi), fy = smooth(y - yi); const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; }
function fbm(x: number, y: number, seed: number, oct = 4): number { let amp = 1, f = 1, s = 0, n = 0; for (let o = 0; o < oct; o++) { s += amp * valueNoise(x * f, y * f, seed + o * 101); n += amp; amp *= 0.5; f *= 2; } return s / n; }
export const hashLocation = (name: string): string => sha256hex(name.trim().toLowerCase());
function pickBiome(name: string, rng: () => number): LandCoverType {
  const n = name.toLowerCase();
  if (n.includes('island') || n.includes('wyspa')) return rng() > 0.5 ? 'JUNGLE' : 'COAST';
  if (n.includes('antarc') || n.includes('antarkty')) return 'ICE';
  if (n.includes('desert') || n.includes('area 51')) return 'DESERT';
  const opts: LandCoverType[] = ['OCEAN', 'COAST', 'JUNGLE', 'DESERT', 'ICE', 'URBAN', 'ROCK'];
  return opts[Math.floor(rng() * opts.length)];
}
/** Deterministic in-memory satellite/geo profile resolver (name-hash seeded; NOT real measurements). */
export function deriveProfile(q: LocationQuery, gridSize = 48): SatelliteProfile {
  const h = hashLocation(q.name); const seedNum = parseInt(h.slice(0, 8), 16); const rng = mulberry32(seedNum ^ q.seed);
  const biome = pickBiome(q.name, rng);
  const amp = biome === 'ICE' ? 400 : biome === 'ROCK' ? 900 : biome === 'DESERT' ? 200 : biome === 'JUNGLE' ? 300 : 120;
  const elevation = new Float64Array(gridSize * gridSize); const bathymetry = new Float64Array(gridSize * gridSize);
  for (let y = 0; y < gridSize; y++) for (let x = 0; x < gridSize; x++) {
    const i = y * gridSize + x; const nx = x / gridSize, ny = y / gridSize;
    const e = fbm(nx * 3, ny * 3, seedNum) * amp - amp * 0.35;
    elevation[i] = +e.toFixed(2); bathymetry[i] = e < 0 ? +(e * 1.5).toFixed(2) : 0;
  }
  const thermal = +((biome === 'ICE' ? 0.05 : biome === 'DESERT' ? 0.9 : 0.4 + rng() * 0.3)).toFixed(3);
  const jungle = +(biome === 'JUNGLE' ? 0.7 + rng() * 0.3 : rng() * 0.15).toFixed(3);
  const sample = Array.from(elevation.slice(0, 64));
  return { locationName: q.name, gpsHash: h, gridSize, elevation, bathymetry, landCover: biome, thermalIndex: thermal, jungleDensity: jungle, dataLabel: 'SATELLITE_GEO_SYNTHESIS', fingerprint: sha256hex(stableStringify({ name: q.name, seed: q.seed, gridSize, biome, thermal, jungle, sample })) };
}
/** 5D volumetric reconstruction: [t, x, elevation, z, warp] from height grid. */
export function reconstruct5D(p: SatelliteProfile, t0 = 0, subsample = 4, cellM = 30): GeoReconstruction5D {
  const points: Point5D[] = []; let maxAbs = 1;
  for (let i = 0; i < p.elevation.length; i++) maxAbs = Math.max(maxAbs, Math.abs(p.elevation[i]));
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let y = 0; y < p.gridSize; y += subsample) for (let x = 0; x < p.gridSize; x += subsample) {
    const e = p.elevation[y * p.gridSize + x]; const X = x * cellM, Z = y * cellM;
    minX = Math.min(minX, X); maxX = Math.max(maxX, X); minZ = Math.min(minZ, Z); maxZ = Math.max(maxZ, Z);
    points.push({ t: t0, x: +X.toFixed(2), y: +e.toFixed(2), z: +Z.toFixed(2), w: +(e / maxAbs * 0.5).toFixed(4) });
  }
  return { points, gridSize: p.gridSize, cellM, bbox: [minX, maxX, minZ, maxZ], dataLabel: 'SATELLITE_GEO_SYNTHESIS', fingerprint: sha256hex(stableStringify({ pf: p.fingerprint, subsample, cellM, n: points.length })) };
}
const PALETTES: Record<LandCoverType, readonly string[]> = { OCEAN: ['#0b2a4a', '#0e3f66', '#7dd3fc'], COAST: ['#0e3f66', '#c9b458', '#7dd3fc'], JUNGLE: ['#1e3a26', '#2f5d3a', '#c9b458'], DESERT: ['#8a6a3b', '#c9a227', '#e8d5a0'], ICE: ['#dfefff', '#9fc3e8', '#5c7fa8'], URBAN: ['#22303f', '#38bdf8', '#a78bfa'], ROCK: ['#3b2f23', '#6b5a44', '#a8896a'] };
 function buildRenderPackage(q: LocationQuery, p: SatelliteProfile, r: GeoReconstruction5D): RenderPackage5D {
  const rng = mulberry32(parseInt(p.gpsHash.slice(8, 16), 16) ^ q.seed);
  const duration = Math.min(180, 60); const narration: NarrationBeat[] = [];
  for (let t = 0; t < duration; t += 15) narration.push({ tStart: t, tEnd: Math.min(duration, t + 15), line: `[Narrator, syntetycznie] ${q.name}: proceduralna rekonstrukcja terenu (${p.landCover}). To symulacja, nie pomiar satelitarny.` });
  const cameraPath: number[][] = []; for (let i = 0; i < 6; i++) cameraPath.push([ +(rng() * 360).toFixed(2), +((rng() - 0.5) * 180).toFixed(2), +(r.bbox[0] + rng() * (r.bbox[1] - r.bbox[0])).toFixed(1), +(50 + rng() * 150).toFixed(1), +(0.1 + rng() * 0.3).toFixed(3) ]);
  const partial = { packageId: `PKG-${q.queryId}`, locationName: q.name, reconstruction: r, cameraPath, palette: PALETTES[p.landCover], narration, durationSeconds: duration, viralTags: ['#genesis5d', '#satellitesynthesis', `#${q.name.toLowerCase().replace(/\s+/g, '')}`], geoLabel: 'SATELLITE_GEO_SYNTHESIS' as const, dataLabel: 'SYNTHETIC_CINEMATIC' as const, disclaimer: GEO_DISCLAIMER };
  return { ...partial, fingerprint: sha256hex(stableStringify({ q: q.queryId, pf: p.fingerprint, rf: r.fingerprint, duration })) };
}
/** Autonomous query->simulation bridge (deterministic async queue; no real timers). */
export class QueryToSimulationBridge {
  private queue: LocationQuery[] = []; private results = new Map<string, RenderPackage5D>();
  constructor(private clock: Clock, private seed: number, private gridSize = 48) {}
  enqueue(q: LocationQuery): string { this.queue.push(q); return q.queryId; }
  async processNext(): Promise<RenderPackage5D | null> { const q = this.queue.shift(); if (!q) return null; const p = deriveProfile(q, this.gridSize); const r = reconstruct5D(p); const pkg = buildRenderPackage(q, p, r); this.results.set(q.queryId, pkg); return pkg; }
  async runQueue(): Promise<readonly RenderPackage5D[]> { const out: RenderPackage5D[] = []; let p: RenderPackage5D | null; while ((p = await this.processNext())) out.push(p); return out; }
  getResult(id: string): RenderPackage5D | undefined { return this.results.get(id); }
}
