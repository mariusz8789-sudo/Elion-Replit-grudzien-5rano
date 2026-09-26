import { mulberry32, canonicalJson as stableStringify, sha256Hex as sha256hex } from '../determinism.js';
export { mulberry32, stableStringify, sha256hex };
/** Deterministic helpers. NO Math.random, NO Date.now. */
const hash2 = (x: number, y: number, seed: number): number => { let h = seed >>> 0; h = Math.imul(h ^ x, 0x27d4eb2d); h = Math.imul(h ^ y, 0x165667b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const smooth = (t: number) => t * t * (3 - 2 * t);
function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y); const fx = smooth(x - xi), fy = smooth(y - yi);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
export function fbm2(x: number, y: number, seed: number, octaves = 4): number {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) { sum += amp * valueNoise(x * freq, y * freq, seed + o * 101); norm += amp; amp *= 0.5; freq *= 2; }
  return sum / norm;
}

export type CityProfileId = 'DUBAI' | 'WARSAW' | 'CUSTOM';
export interface CityProfile { readonly id: CityProfileId; readonly label: string; readonly gridSize: number; readonly cellM: number; readonly water: 'coast' | 'river'; readonly maxHeightM: number; readonly densityBias: number; }
export const CITY_PROFILES: Record<CityProfileId, CityProfile> = {
  DUBAI: { id: 'DUBAI', label: 'Dubai (coast, high-density)', gridSize: 96, cellM: 50, water: 'coast', maxHeightM: 320, densityBias: 1.3 },
  WARSAW: { id: 'WARSAW', label: 'Warsaw (river, district grid)', gridSize: 96, cellM: 60, water: 'river', maxHeightM: 180, densityBias: 1.0 },
  CUSTOM: { id: 'CUSTOM', label: 'Custom metro', gridSize: 64, cellM: 50, water: 'river', maxHeightM: 120, densityBias: 1.0 },
};
export type ZoneId = 0 | 1 | 2 | 3 | 4; // 0 water,1 residential,2 business,3 industrial,4 transport
export interface TransportNode { readonly id: string; readonly x: number; readonly y: number; readonly kind: 'metro' | 'mall' | 'school' | 'hub'; readonly capacity: number; }
export interface Building { readonly id: string; readonly cell: number; readonly heightM: number; readonly zone: ZoneId; }
export interface CityGrid {
  readonly profileId: CityProfileId; readonly seed: number; readonly gridSize: number; readonly cellM: number;
  readonly elevation: Float64Array; readonly zones: Uint8Array; readonly population: Float64Array; readonly roadCapacity: Float64Array;
  readonly nodes: readonly TransportNode[]; readonly buildings: readonly Building[]; readonly districtSize: number; readonly districtCount: number;
  readonly dataLabel: 'SYNTHETIC_CRISIS_MODEL'; readonly fingerprint: string;
}
export const districtOf = (g: CityGrid, cell: number): number => { const x = cell % g.gridSize, y = Math.floor(cell / g.gridSize); const ds = g.districtSize; return Math.floor(x / ds) + Math.floor(y / ds) * Math.ceil(g.gridSize / ds); };

export function generateCity(seed: number, profileId: CityProfileId): CityGrid {
  const P = CITY_PROFILES[profileId]; const N = P.gridSize;
  const elevation = new Float64Array(N * N); const zones = new Uint8Array(N * N);
  const population = new Float64Array(N * N); const roadCapacity = new Float64Array(N * N);
  const nodes: TransportNode[] = []; const buildings: Building[] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const nx = x / N, ny = y / N;
    let elev = fbm2(nx * 4, ny * 4, seed) * P.maxHeightM * 0.15;
    if (P.water === 'coast') { const coastY = 0.25; if (ny < coastY) elev = Math.min(elev, (ny / coastY) * 3 - 3); }
    else { const band = Math.abs(nx - 0.5); if (band < 0.06) elev = Math.min(elev, -2 + (band / 0.06) * 3); }
    elevation[i] = +elev.toFixed(3);
    const distC = Math.hypot(nx - 0.5, ny - 0.5);
    let z: ZoneId = elev <= 0 ? 0 : distC < 0.18 ? 2 : (P.water === 'coast' ? ny < 0.38 : Math.abs(nx - 0.5) < 0.12) ? 3 : 1;
    const arterial = x % 8 === 0 || y % 8 === 0;
    if (z !== 0 && arterial) z = 4;
    zones[i] = z;
    const popBase = z === 2 ? 4000 : z === 1 ? 8000 : z === 3 ? 1500 : z === 4 ? 500 : 0;
    population[i] = +(popBase * P.densityBias * (0.6 + 0.8 * hash2(x, y, seed + 7))).toFixed(1);
    roadCapacity[i] = +((arterial ? 2200 : 600) * (0.7 + 0.6 * hash2(x, y, seed + 11))).toFixed(1);
  }
  for (let y = 4; y < N; y += 8) for (let x = 4; x < N; x += 8) { const i = y * N + x; if (zones[i] !== 0) nodes.push({ id: 'METRO-' + x + '-' + y, x, y, kind: 'metro', capacity: 20000 }); }
  for (let y = 8; y < N; y += 16) for (let x = 8; x < N; x += 16) { const i = y * N + x; if (zones[i] === 2) nodes.push({ id: 'MALL-' + x + '-' + y, x, y, kind: 'mall', capacity: 8000 }); else if (zones[i] === 1) nodes.push({ id: 'SCHOOL-' + x + '-' + y, x, y, kind: 'school', capacity: 1200 }); }
  nodes.push({ id: 'HUB-CENTER', x: Math.floor(N / 2), y: Math.floor(N / 2), kind: 'hub', capacity: 50000 });
  for (let y = 0; y < N; y += 2) for (let x = 0; x < N; x += 2) { const i = y * N + x; const z = zones[i] as ZoneId;
    if (z >= 1 && z <= 3 && hash2(x, y, seed + 13) < (z === 2 ? 0.9 : z === 1 ? 0.7 : 0.5)) {
      const h = z === 2 ? P.maxHeightM * (0.4 + 0.6 * hash2(x, y, seed + 17)) : z === 1 ? 25 * (0.5 + hash2(x, y, seed + 19)) : 15 * (0.5 + hash2(x, y, seed + 23));
      buildings.push({ id: 'B-' + x + '-' + y, cell: i, heightM: +h.toFixed(1), zone: z }); } }
  const districtSize = 8; const districtCount = Math.ceil(N / districtSize) ** 2;
  const elevSum = Array.from(elevation).reduce((a, b) => a + b, 0);
  const fingerprint = sha256hex(stableStringify({ seed, profileId, N, elevSum: +elevSum.toFixed(2), buildings: buildings.length, nodes: nodes.length }));
  return { profileId, seed, gridSize: N, cellM: P.cellM, elevation, zones, population, roadCapacity, nodes, buildings, districtSize, districtCount, dataLabel: 'SYNTHETIC_CRISIS_MODEL', fingerprint };
}
