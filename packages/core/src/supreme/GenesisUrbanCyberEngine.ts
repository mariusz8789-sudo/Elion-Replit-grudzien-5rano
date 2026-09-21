import { createHash } from 'node:crypto';
export const mulberry32 = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export interface Clock { now(): number; }
export const URBAN_DISCLAIMER = 'Procedural synthetic urban twin seeded by prompt hash. NOT a real city model, NOT real measurements.';
export type WorldStyle = 'DUBAI_FUTURIST' | 'NEON_METROPOLIS' | 'RETRO_BROOKLYN' | 'LUNAR_BASE' | 'GENERIC_CITY';
export interface WorldPromptResolution { readonly prompt: string; readonly style: WorldStyle; readonly density: number; readonly neonSaturation: number; readonly reflectionIndex: number; readonly palette: readonly string[]; readonly seedNum: number; readonly dataLabel: 'SYNTHETIC_URBAN_TWIN'; readonly fingerprint: string; }
export interface Building5D { readonly id: string; readonly x: number; readonly z: number; readonly heightM: number; readonly footprintM: number; readonly styleTag: WorldStyle; readonly w: number; readonly t: number; }
export interface NeonEmitter5D { readonly id: string; readonly x: number; readonly y: number; readonly z: number; readonly w: number; readonly colorHex: string; readonly intensity: number; readonly flickerHz: number; readonly billboard: boolean; readonly scheduleSlot: number; }
export interface UrbanGrid { readonly gridSize: number; readonly cellM: number; readonly buildings: readonly Building5D[]; readonly emitters: readonly NeonEmitter5D[]; readonly roads: readonly (readonly [number, number])[]; readonly dataLabel: 'SYNTHETIC_URBAN_TWIN'; readonly fingerprint: string; }
export interface NarrationBeat { readonly tStart: number; readonly tEnd: number; readonly line: string; }
export interface BillboardSlot { readonly slot: number; readonly emitterId: string; readonly contentHash: string; }
export interface CinematicPackage { readonly packageId: string; readonly resolution: WorldPromptResolution; readonly grid: UrbanGrid; readonly billboardSchedule: readonly BillboardSlot[]; readonly narratorScript: readonly NarrationBeat[]; readonly durationSeconds: number; readonly cameraPath5D: readonly (readonly number[])[]; readonly urbanLabel: 'SYNTHETIC_URBAN_TWIN'; readonly dataLabel: 'SYNTHETIC_CINEMATIC'; readonly disclaimer: string; readonly fingerprint: string; }
export interface ComputeJob { readonly jobId: string; readonly prompt: string; readonly weight: number; readonly tier: 'LIGHT' | 'HEAVY'; }
export interface AllocEvent { readonly kind: 'SPAWN_HEAVY' | 'RELEASE_HEAVY' | 'ASSIGN_LIGHT' | 'PROCESS'; readonly jobId: string; readonly at: number; readonly costUnits: number; }
const PALETTES: Record<WorldStyle, readonly string[]> = {
  DUBAI_FUTURIST: ['#c9a227', '#e8d5a0', '#38bdf8'], NEON_METROPOLIS: ['#ff2d78', '#00e5ff', '#a78bfa'],
  RETRO_BROOKLYN: ['#d97706', '#7c2d12', '#38bdf8'], LUNAR_BASE: ['#dfefff', '#9fc3e8', '#38bdf8'], GENERIC_CITY: ['#38bdf8', '#a78bfa', '#34d399'] };
const STYLE_BASE: Record<WorldStyle, { d: number; n: number; r: number; hMax: number }> = {
  DUBAI_FUTURIST: { d: 0.9, n: 0.6, r: 0.4, hMax: 400 }, NEON_METROPOLIS: { d: 0.95, n: 0.95, r: 0.6, hMax: 140 },
  RETRO_BROOKLYN: { d: 0.6, n: 0.5, r: 0.4, hMax: 28 }, LUNAR_BASE: { d: 0.3, n: 0.2, r: 0.1, hMax: 14 }, GENERIC_CITY: { d: 0.5, n: 0.3, r: 0.3, hMax: 60 } };
/** Dynamic World & District Resolver: prompt -> style/density/lighting params (deterministic). */
export function resolveWorld(prompt: string, seed: number): WorldPromptResolution {
  const p = prompt.toLowerCase();
  let style: WorldStyle = 'GENERIC_CITY';
  if (p.includes('moon') || p.includes('księżyc') || p.includes('lunar')) style = 'LUNAR_BASE';
  else if (p.includes('times square') || p.includes('neon') || p.includes('billboard')) style = 'NEON_METROPOLIS';
  else if (p.includes('greenpoint') || p.includes('brooklyn') || p.includes('retro')) style = 'RETRO_BROOKLYN';
  else if (p.includes('dubai') || p.includes('dubaj') || p.includes('tower') || p.includes('wieżow')) style = 'DUBAI_FUTURIST';
  const base = STYLE_BASE[style];
  const future = p.includes('2029') || p.includes('future') || p.includes('przyszł') ? 0.05 : 0;
  const wet = p.includes('rain') || p.includes('deszcz') ? 0.35 : 0;
  const density = +Math.min(1, base.d + future).toFixed(3);
  const neonSaturation = +Math.min(1, base.n + (p.includes('neon') ? 0.1 : 0)).toFixed(3);
  const reflectionIndex = +Math.min(1, base.r + wet).toFixed(3);
  const seedNum = parseInt(sha256hex(p).slice(0, 8), 16) ^ seed;
  const partial = { prompt, style, density, neonSaturation, reflectionIndex, palette: PALETTES[style], seedNum, dataLabel: 'SYNTHETIC_URBAN_TWIN' as const };
  return { ...partial, fingerprint: sha256hex(stableStringify(partial)) };
}
/** Procedural Urban Grid & Volumetric Neon Generator (5D emitters for raymarching). */
export function generateUrbanGrid(res: WorldPromptResolution, gridSize = 48, cellM = 20): UrbanGrid {
  const rng = mulberry32(res.seedNum); const base = STYLE_BASE[res.style];
  const buildings: Building5D[] = []; const emitters: NeonEmitter5D[] = []; const roads: [number, number][] = [];
  for (let z = 0; z < gridSize; z++) for (let x = 0; x < gridSize; x++) {
    if (x % 6 === 0 || z % 6 === 0) { roads.push([x, z]); continue; }
    if (rng() < res.density) {
      const h = +(base.hMax * (0.25 + rng() * 0.75)).toFixed(1); const fp = +(cellM * (0.5 + rng() * 0.4)).toFixed(1);
      buildings.push({ id: 'B-' + x + '-' + z, x: x * cellM, z: z * cellM, heightM: h, footprintM: fp, styleTag: res.style, w: +((rng() - 0.5) * 0.2).toFixed(4), t: 0 });
      const neonCount = Math.floor(res.neonSaturation * (h > base.hMax * 0.5 ? 3 : 1));
      for (let k = 0; k < neonCount; k++) {
        emitters.push({ id: 'N-' + x + '-' + z + '-' + k, x: x * cellM + (rng() - 0.5) * fp, y: +(h * (0.3 + rng() * 0.6)).toFixed(1), z: z * cellM + (rng() - 0.5) * fp, w: +(rng() * 6.28).toFixed(4), colorHex: res.palette[Math.floor(rng() * res.palette.length)], intensity: +(0.4 + rng() * 0.6).toFixed(3), flickerHz: +(0.5 + rng() * 4).toFixed(2), billboard: res.style === 'NEON_METROPOLIS' && h > base.hMax * 0.5 && k === 0, scheduleSlot: Math.floor(rng() * 8) });
      }
    }
  }
  return { gridSize, cellM, buildings, emitters, roads, dataLabel: 'SYNTHETIC_URBAN_TWIN', fingerprint: sha256hex(stableStringify({ rf: res.fingerprint, gridSize, nb: buildings.length, ne: emitters.length })) };
}
/** Elastic Compute Bridge: deterministic Sentinel job queue with ephemeral HPC spawn/release lifecycle. */
export const HEAVY_THRESHOLD = 1000; const HEAVY_RATE = 0.05; const LIGHT_RATE = 0.001;
export class ElasticComputeBridge {
  private queue: ComputeJob[] = []; private log: AllocEvent[] = []; private heavyActive = 0; private cost = 0; private seq = 0;
  constructor(private clock: Clock) {}
  enqueue(prompt: string, weight: number): string { const jobId = 'J-' + (this.seq++); this.queue.push({ jobId, prompt, weight, tier: weight > HEAVY_THRESHOLD ? 'HEAVY' : 'LIGHT' }); return jobId; }
  scheduleStep(): AllocEvent | null {
    const job = this.queue.shift(); if (!job) return null; const at = this.clock.now();
    if (job.tier === 'HEAVY' && this.heavyActive === 0) { this.heavyActive = 1; this.log.push({ kind: 'SPAWN_HEAVY', jobId: job.jobId, at, costUnits: +this.cost.toFixed(4) }); }
    if (job.tier === 'LIGHT') this.log.push({ kind: 'ASSIGN_LIGHT', jobId: job.jobId, at, costUnits: +this.cost.toFixed(4) });
    this.cost += job.weight * (job.tier === 'HEAVY' ? HEAVY_RATE : LIGHT_RATE);
    this.log.push({ kind: 'PROCESS', jobId: job.jobId, at, costUnits: +this.cost.toFixed(4) });
    if (job.tier === 'HEAVY') { this.heavyActive = 0; this.log.push({ kind: 'RELEASE_HEAVY', jobId: job.jobId, at, costUnits: +this.cost.toFixed(4) }); }
    return this.log[this.log.length - 1];
  }
  runQueue(): readonly AllocEvent[] { while (this.scheduleStep()) { /* deterministic drain */ } return this.log; }
  getLog(): readonly AllocEvent[] { return this.log; }
  getCost(): number { return +this.cost.toFixed(4); }
  heavyCurrentlyActive(): number { return this.heavyActive; }
}
/** Cinematic Package Compiler: 5D coords + billboard schedule + social narrator + SHA-256 fingerprint. */
export function compileCinematicPackage(res: WorldPromptResolution, grid: UrbanGrid, opts: { durationSeconds: number; cameraSeed: number }): CinematicPackage {
  const duration = Math.min(180, Math.max(15, Math.floor(opts.durationSeconds)));
  const rng = mulberry32(opts.cameraSeed ^ res.seedNum);
  const billboardSchedule: BillboardSlot[] = grid.emitters.filter(e => e.billboard).map(e => ({ slot: e.scheduleSlot, emitterId: e.id, contentHash: sha256hex(stableStringify({ e: e.id, slot: e.scheduleSlot, palette: res.palette })) }));
  const narratorScript: NarrationBeat[] = [];
  for (let t = 0; t < duration; t += 15) narratorScript.push({ tStart: t, tEnd: Math.min(duration, t + 15), line: `[Narrator, syntetycznie] ${res.style}: proceduralna metropolia z promptu "${res.prompt}". To symulacja, nie realne miasto.` });
  const cameraPath5D: number[][] = []; for (let i = 0; i < 6; i++) cameraPath5D.push([ +(rng() * 360).toFixed(2), +((rng() - 0.5) * 180).toFixed(2), +(grid.cellM * grid.gridSize * (0.3 + rng() * 0.5)).toFixed(1), +(20 + rng() * 180).toFixed(1), +(0.1 + rng() * 0.3).toFixed(3) ]);
  const partial = { packageId: 'PKG-' + res.fingerprint.slice(0, 12), resolution: res, grid, billboardSchedule, narratorScript, durationSeconds: duration, cameraPath5D, urbanLabel: 'SYNTHETIC_URBAN_TWIN' as const, dataLabel: 'SYNTHETIC_CINEMATIC' as const, disclaimer: URBAN_DISCLAIMER };
  return { ...partial, fingerprint: sha256hex(stableStringify({ rf: res.fingerprint, gf: grid.fingerprint, duration, bs: billboardSchedule.length, ns: narratorScript.length })) };
}
export class GenesisUrbanCyberEngine {
  readonly bridge: ElasticComputeBridge;
  constructor(private clock: Clock, private seed: number) { this.bridge = new ElasticComputeBridge(clock); }
  pipeline(prompt: string, gridSize = 48): CinematicPackage {
    const res = resolveWorld(prompt, this.seed);
    const grid = generateUrbanGrid(res, gridSize);
    this.bridge.enqueue(prompt, grid.buildings.length + grid.emitters.length * 2);
    this.bridge.runQueue();
    return compileCinematicPackage(res, grid, { durationSeconds: 60, cameraSeed: this.seed });
  }
}
