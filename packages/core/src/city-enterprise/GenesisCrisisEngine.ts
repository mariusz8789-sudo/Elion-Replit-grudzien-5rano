import { sha256hex, stableStringify, districtOf } from './GenesisCityGenerator.js';
import type { CityGrid } from './GenesisCityGenerator.js';
export type CrisisLabel = 'DISASTER_SCENARIO' | 'SYNTHETIC_CRISIS_MODEL';

/** ---------- 1) SPATIAL SEIR DIFFUSION (district-coupled, deterministic) ---------- */
export interface SeirState { readonly S: Float64Array; readonly E: Float64Array; readonly I: Float64Array; readonly R: Float64Array; readonly t: number; }
export interface SeirParams { beta: number; sigma: number; gamma: number; mobility: number; }
export function createSeirState(g: CityGrid, patientZeroCell: number, exposed = 10): SeirState {
  const D = g.districtCount; const S = new Float64Array(D), E = new Float64Array(D), I = new Float64Array(D), R = new Float64Array(D);
  for (let d = 0; d < D; d++) S[d] = 1000;
  const dz = districtOf(g, patientZeroCell); E[dz] = exposed; S[dz] = Math.max(0, S[dz] - exposed);
  return { S, E, I, R, t: 0 };
}
export function seirStep(g: CityGrid, st: SeirState, p: SeirParams, dt: number): SeirState {
  const D = g.districtCount; const S = new Float64Array(D), E = new Float64Array(D), I = new Float64Array(D), R = new Float64Array(D);
  const popOf = (d: number) => st.S[d] + st.E[d] + st.I[d] + st.R[d] || 1;
  for (let d = 0; d < D; d++) {
    const N = popOf(d);
    const contact = 1 + Math.min(2, (g.population[d * g.districtSize * g.gridSize + d] || 5000) / 8000);
    let coupling = 0; const nb = [d - 1, d + 1, d - 8, d + 8];
    for (const n of nb) if (n >= 0 && n < D) coupling += (st.I[n] / popOf(n) - st.I[d] / N);
    const force = p.beta * (st.I[d] / N) * contact + p.mobility * coupling;
    const newE = Math.min(st.S[d], Math.max(0, st.S[d] * force * dt));
    const newI = Math.min(st.E[d], st.E[d] * p.sigma * dt);
    const newR = Math.min(st.I[d], st.I[d] * p.gamma * dt);
    S[d] = st.S[d] - newE; E[d] = st.E[d] + newE - newI; I[d] = st.I[d] + newI - newR; R[d] = st.R[d] + newR;
  }
  return { S, E, I, R, t: st.t + dt };
}
export const seirMetrics = (st: SeirState) => { let s = 0, e = 0, i = 0, r = 0; for (let d = 0; d < st.S.length; d++) { s += st.S[d]; e += st.E[d]; i += st.I[d]; r += st.R[d]; } return { susceptible: +s.toFixed(1), exposed: +e.toFixed(1), infected: +i.toFixed(1), recovered: +r.toFixed(1), total: +(s + e + i + r).toFixed(1) }; };

/** ---------- 2) HYDRODYNAMIC FLOOD ROUTING (volume-conserving over DEM) ---------- */
export interface FloodState { readonly W: Float64Array; readonly t: number; }
export interface FloodParams { inflowCell: number; inflowRate: number; roughness: number; }
export function createFloodState(g: CityGrid): FloodState { return { W: new Float64Array(g.gridSize * g.gridSize), t: 0 }; }
export function floodStep(g: CityGrid, st: FloodState, p: FloodParams, dt: number): FloodState {
  const N = g.gridSize; const W = Float64Array.from(st.W); W[p.inflowCell] += p.inflowRate * dt;
  const surf = (i: number) => g.elevation[i] + W[i];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; if (W[i] <= 1e-6) continue;
    const nbs = [x > 0 ? i - 1 : -1, x < N - 1 ? i + 1 : -1, y > 0 ? i - N : -1, y < N - 1 ? i + N : -1].filter(n => n >= 0);
    let totalHead = 0; const heads = nbs.map(n => { const h = Math.max(0, surf(i) - surf(n)); totalHead += h; return h; });
    if (totalHead <= 0) continue;
    const movable = Math.min(W[i], W[i] * 0.25 * p.roughness * dt + totalHead * 0.125 * dt);
    for (let k = 0; k < nbs.length; k++) { const q = movable * (heads[k] / totalHead); W[i] -= q; W[nbs[k]] += q; }
  }
  return { W, t: st.t + dt };
}
export function floodMetrics(g: CityGrid, st: FloodState, paralysisDepth = 0.3) {
  let inundated = 0, maxDepth = 0, floodedBuildings = 0, volume = 0;
  for (let i = 0; i < st.W.length; i++) { volume += st.W[i]; if (st.W[i] > 0.05) { inundated++; maxDepth = Math.max(maxDepth, st.W[i]); } }
  for (const b of g.buildings) if (st.W[b.cell] > 0.05) floodedBuildings++;
  const paralyzed = g.nodes.filter(n => st.W[n.y * g.gridSize + n.x] > paralysisDepth).length;
  return { inundatedCells: inundated, maxDepthM: +maxDepth.toFixed(3), floodedBuildings, waterVolume: +volume.toFixed(2), paralyzedNodes: paralyzed, totalNodes: g.nodes.length, paralysisRatio: +(paralyzed / Math.max(1, g.nodes.length)).toFixed(4) };
}

/** ---------- 3) BLAST & OVERPRESSURE (TNT scaled-distance, Sadovsky-style fit) ---------- */
export interface BlastParams { x: number; y: number; yieldKg: number; }
export interface BlastBuilding { buildingId: string; distanceM: number; overpressureKPa: number; damageIndex: number; }
export interface BlastResult { zones: { lethalM: number; severeM: number; glassM: number }; buildings: BlastBuilding[]; dataLabel: CrisisLabel; fingerprint: string; }
export function overpressureKPa(distanceM: number, yieldKg: number): number {
  const Z = Math.max(0.5, distanceM / Math.cbrt(Math.max(1, yieldKg)));
  return +Math.min(10000, Math.max(0, 1772 / Z ** 3 + 114 / Z ** 2 + 108 / Z)).toFixed(2);
}
const radiusForKPa = (kpa: number, yieldKg: number): number => { let z = 0.5; for (let i = 0; i < 200; i++) { const p = 1772 / z ** 3 + 114 / z ** 2 + 108 / z; if (p <= kpa) break; z += 0.25; } return +(z * Math.cbrt(Math.max(1, yieldKg))).toFixed(1); };
export function blastSolve(g: CityGrid, p: BlastParams): BlastResult {
  const buildings: BlastBuilding[] = g.buildings.map(b => {
    const bx = b.cell % g.gridSize, by = Math.floor(b.cell / g.gridSize);
    const distM = Math.hypot(bx - p.x, by - p.y) * g.cellM;
    const op = overpressureKPa(distM, p.yieldKg);
    return { buildingId: b.id, distanceM: +distM.toFixed(1), overpressureKPa: op, damageIndex: +Math.min(1, Math.max(0, op / 70)).toFixed(4) };
  });
  const result = { zones: { lethalM: radiusForKPa(35, p.yieldKg), severeM: radiusForKPa(7, p.yieldKg), glassM: radiusForKPa(2, p.yieldKg) }, buildings, dataLabel: 'DISASTER_SCENARIO' as CrisisLabel, fingerprint: '' };
  result.fingerprint = sha256hex(stableStringify({ p, zones: result.zones, count: buildings.length }));
  return result;
}
