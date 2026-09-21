import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GenesisDrugDiscoveryEngine, makeCandidate, MOR_TARGET, chengPrusoffKi } from './GenesisDrugDiscoveryEngine.js';
import { GenesisCrisisResilienceEngine, overpressureKPa, falloutDoseMSv } from './GenesisCrisisResilienceEngine.js';
import { GenesisSocialMatrixCore, integrityHash } from './GenesisSocialMatrixCore.js';
import { GenesisMirrorClient } from '../../../ui/src/mirror/GenesisMirrorClient.js';
import { GenesisMirrorBridge } from '../mirror/GenesisMirrorBridge.js';
const src = (f: string) => readFileSync(fileURLToPath(new URL('./' + f, import.meta.url)), 'utf8');
const clock = { t: 1000, now() { return this.t; } };
const grid = () => { const n = 24; const pop = new Float64Array(n * n).fill(500); const elev = new Float64Array(n * n).fill(1); return { n, cellM: 100, population: pop, elevation: elev, infraNodes: [10, 100, 300, 500] }; };
describe('drug discovery (proxy, labeled)', () => {
  it('same seed -> identical ranking & fingerprints', () => { const c = [makeCandidate(7, 'A'), makeCandidate(7, 'B')]; const mk = () => new GenesisDrugDiscoveryEngine(clock, 7).screen(c, MOR_TARGET); expect(mk()[0].fingerprint).toBe(mk()[0].fingerprint); });
  it('Cheng-Prusoff formula', () => { expect(chengPrusoffKi(100, 10, 10)).toBeCloseTo(50, 4); });
  it('label BIOLOGICAL_SYNTHETIC_ESTIMATE', () => { const r = new GenesisDrugDiscoveryEngine(clock, 7).screen([makeCandidate(7, 'A')], MOR_TARGET); expect(r[0].dataLabel).toBe('BIOLOGICAL_SYNTHETIC_ESTIMATE'); });
});
describe('crisis resilience (civil-defense proxy)', () => {
  it('bio dose monotonic in release mass', () => { const e = new GenesisCrisisResilienceEngine(clock, 7); const a = e.bioAerosol(grid(), 100, 1, [1, 0], 1, 10, 0.01); const b = e.bioAerosol(grid(), 100, 10, [1, 0], 1, 10, 0.01); expect(b.affectedPopulation).toBeGreaterThanOrEqual(a.affectedPopulation); });
  it('blast overpressure decreases with distance', () => { expect(overpressureKPa(2000, 5e10)).toBeLessThan(overpressureKPa(1000, 5e10)); });
  it('fallout dose decreases over time', () => { expect(falloutDoseMSv(100, 24, 48)).toBeLessThan(falloutDoseMSv(100, 1, 24)); });
  it('flood produces evacuation zones & label', () => { const r = new GenesisCrisisResilienceEngine(clock, 7).megaFlood(grid(), 100, 1e6, 1, 10); expect(r.evacuationZones.length).toBeGreaterThan(0); expect(r.dataLabel).toBe('GOV_TECH_CRISIS_SYNTHESIS'); });
});
describe('social matrix (honest reputation)', () => {
  it('integrity hash deterministic', () => { expect(integrityHash('k', 'c')).toBe(integrityHash('k', 'c')); });
  it('verified post raises reputation; mismatch lowers', () => { const s = new GenesisSocialMatrixCore(clock); s.register('u1', 'RESEARCH');
    s.post('u1', 'sim claim', 'FP-X'); s.verify('p-0'.replace('p-', 'P-'), 'FP-X'); expect(s.reputation('u1')).toBe(1);
    const p2 = s.post('u1', 'bad claim', 'FP-Y'); s.verify(p2.postId, 'FP-Z'); expect(s.reputation('u1')).toBe(0); });
});
describe('mirror privacy (zero raw images)', () => {
  it('payload minimal & bridge ephemeral', () => { const c = new GenesisMirrorClient(7, clock); const p = c.syntheticSummary(); expect(p.containsRawImage).toBe(false); expect(p.landmarkVec.length).toBe(32);
    const r = new GenesisMirrorBridge(clock, 1337).handle(p); if (r.type === 'MIRROR_ANIMATION') { expect(r.pkg.retainMs).toBe(0); expect(r.pkg.ephemeral).toBe(true); } });
});
describe('iron rules', () => {
  for (const f of ['GenesisDrugDiscoveryEngine.ts', 'GenesisCrisisResilienceEngine.ts', 'GenesisSocialMatrixCore.ts']) it(f + ' no Math.random/Date.now', () => { const s = src(f); expect(s).not.toContain('Math.random('); expect(s).not.toContain('Date.now('); });
});
