import { createHash } from 'node:crypto';
export const mulberry32 = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export interface Clock { now(): number; }
export const SWISS_EPS = 1e-12; // documented numerical tolerance; analytic solutions used where available (no integration error)
export interface DroneTelemetryFrame { readonly t: number; readonly position: readonly [number, number, number]; readonly attitude: readonly [number, number, number]; readonly battery: number; }
export interface TelemetryIngestResult { readonly ok: boolean; readonly error?: 'NON_MONOTONIC_TIME'; readonly pathLengthM: number; readonly headHash: string; readonly dataLabel: 'SWISS_PRECISION_DIGITAL_TWIN'; }
export interface LidarScanVector { readonly points: Float64Array; readonly resolutionM: number; readonly bbox: readonly [number, number, number, number]; }
export interface TerrainModel { readonly gridSize: number; readonly cellM: number; readonly elevation: Float64Array; readonly dataLabel: 'SWISS_PRECISION_DIGITAL_TWIN'; readonly fingerprint: string; }
export interface LineOfSightResult { readonly clear: boolean; readonly minClearanceM: number; readonly fingerprint: string; }
export class GenesisSwissPrecisionEngine {
  private chain: string[] = [];
  constructor(private clock: Clock, private seed: number) {}
  ingestTelemetry(frames: readonly DroneTelemetryFrame[]): TelemetryIngestResult {
    let path = 0; let prevHash = 'GENESIS';
    for (let i = 0; i < frames.length; i++) {
      if (i > 0 && frames[i].t <= frames[i - 1].t) return { ok: false, error: 'NON_MONOTONIC_TIME', pathLengthM: 0, headHash: '', dataLabel: 'SWISS_PRECISION_DIGITAL_TWIN' };
      if (i > 0) { const d = Math.hypot(frames[i].position[0] - frames[i - 1].position[0], frames[i].position[1] - frames[i - 1].position[1], frames[i].position[2] - frames[i - 1].position[2]); path += d; }
      prevHash = sha256hex(stableStringify({ i, frame: frames[i], prevHash }));
      this.chain.push(prevHash);
    }
    return { ok: true, pathLengthM: +path.toFixed(9), headHash: prevHash, dataLabel: 'SWISS_PRECISION_DIGITAL_TWIN' };
  }
  buildTerrainFromLidar(scan: LidarScanVector, gridSize: number): TerrainModel {
    const [minX, maxX, minY, maxY] = scan.bbox; const sum = new Float64Array(gridSize * gridSize); const cnt = new Float64Array(gridSize * gridSize);
    for (let i = 0; i + 2 < scan.points.length; i += 3) {
      const x = scan.points[i], y = scan.points[i + 1], z = scan.points[i + 2];
      const gx = Math.min(gridSize - 1, Math.max(0, Math.floor(((x - minX) / (maxX - minX)) * gridSize)));
      const gy = Math.min(gridSize - 1, Math.max(0, Math.floor(((y - minY) / (maxY - minY)) * gridSize)));
      const idx = gy * gridSize + gx; sum[idx] += z; cnt[idx] += 1;
    }
    const elev = new Float64Array(gridSize * gridSize);
    for (let i = 0; i < elev.length; i++) elev[i] = cnt[i] > 0 ? sum[i] / cnt[i] : NaN;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < elev.length; i++) {
      if (!Number.isNaN(elev[i])) continue;
      const l = i % gridSize > 0 ? elev[i - 1] : NaN, r = i % gridSize < gridSize - 1 ? elev[i + 1] : NaN;
      const cand = [l, r].filter(v => Number.isFinite(v));
      if (cand.length) elev[i] = cand.reduce((a, b) => a + b, 0) / cand.length;
    }
    for (let i = 0; i < elev.length; i++) if (Number.isNaN(elev[i])) elev[i] = 0;
    return { gridSize, cellM: +((maxX - minX) / gridSize).toFixed(6), elevation: elev, dataLabel: 'SWISS_PRECISION_DIGITAL_TWIN', fingerprint: sha256hex(stableStringify({ gridSize, sample: Array.from(elev.slice(0, 128)) })) };
  }
  elevationAt(t: TerrainModel, x: number, y: number): number {
    const gx = Math.min(t.gridSize - 1, Math.max(0, x)), gy = Math.min(t.gridSize - 1, Math.max(0, y));
    return t.elevation[gy * t.gridSize + gx];
  }
  lineOfSight(t: TerrainModel, a: readonly [number, number], b: readonly [number, number], antennaM = 2, samples = 64): LineOfSightResult {
    const za = this.elevationAt(t, a[0], a[1]) + antennaM; const zb = this.elevationAt(t, b[0], b[1]) + antennaM;
    let minClear = Infinity;
    for (let i = 1; i < samples; i++) { const u = i / samples; const x = a[0] + (b[0] - a[0]) * u; const y = a[1] + (b[1] - a[1]) * u; const lineZ = za + (zb - za) * u; const clear = lineZ - this.elevationAt(t, x, y); minClear = Math.min(minClear, clear); }
    return { clear: minClear > 0, minClearanceM: +minClear.toFixed(9), fingerprint: sha256hex(stableStringify({ tf: t.fingerprint, a, b, antennaM, samples, minClear })) };
  }
  getChain(): readonly string[] { return this.chain; }
}
