import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hashLocation, deriveProfile, reconstruct5D, QueryToSimulationBridge } from './GenesisSatelliteGeoEngine.js';
const src = readFileSync(fileURLToPath(new URL('./GenesisSatelliteGeoEngine.ts', import.meta.url)), 'utf8');
const clock = { t: 1000, now() { return this.t; } };
const Q = { queryId: 'Q1', name: 'North Sentinel Island', seed: 7 };
describe('location hashing & profile', () => {
  it('hash stable & 64hex', () => { expect(hashLocation('North Sentinel Island')).toBe(hashLocation(' north sentinel island ')); expect(hashLocation('X')).toMatch(/^[0-9a-f]{64}$/); });
  it('same name+seed -> identical fingerprint', () => { expect(deriveProfile(Q, 32).fingerprint).toBe(deriveProfile(Q, 32).fingerprint); });
  it('different seed -> different fingerprint', () => { expect(deriveProfile(Q, 32).fingerprint).not.toBe(deriveProfile({ ...Q, seed: 8 }, 32).fingerprint); });
  it('elevation finite & sized; bathymetry<=0', () => { const p = deriveProfile(Q, 32); expect(p.elevation.length).toBe(1024); expect(Array.from(p.elevation).every(Number.isFinite)).toBe(true); expect(Array.from(p.bathymetry).every(v => v <= 0)).toBe(true); });
  it('label SATELLITE_GEO_SYNTHESIS', () => { expect(deriveProfile(Q, 32).dataLabel).toBe('SATELLITE_GEO_SYNTHESIS'); });
});
describe('5D reconstruction', () => {
  it('points subsampled & w bounded', () => { const p = deriveProfile(Q, 32); const r = reconstruct5D(p, 0, 4); expect(r.points.length).toBe(64); expect(r.points.every(pt => Math.abs(pt.w) <= 0.5)).toBe(true); });
  it('deterministic fingerprint', () => { const p = deriveProfile(Q, 32); expect(reconstruct5D(p).fingerprint).toBe(reconstruct5D(p).fingerprint); });
});
describe('query-to-simulation bridge', () => {
  it('processes queue in order, deterministic packages', async () => {
    const mk = async () => { const b = new QueryToSimulationBridge(clock, 7, 16); b.enqueue(Q); b.enqueue({ queryId: 'Q2', name: 'Snake Island', seed: 7 }); return b.runQueue(); };
    const a = await mk(); const b = await mk();
    expect(a.length).toBe(2); expect(a[0].packageId).toBe('PKG-Q1'); expect(a[0].fingerprint).toBe(b[0].fingerprint);
    expect(a[0].durationSeconds).toBeLessThanOrEqual(180); expect(a[0].narration[0].tEnd - a[0].narration[0].tStart).toBe(15);
    expect(a[0].disclaimer).toContain('NOT real satellite');
  });
});
describe('iron rules', () => { it('no Math.random/Date.now', () => { expect(src).not.toContain('Math.random('); expect(src).not.toContain('Date.now('); }); });
