import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GenesisSwissPrecisionEngine } from './GenesisSwissPrecisionEngine.js';
import { logisticReplication, mutationCurve, diffuseMedium, massOf, bindingKinetics, expressionDynamics, gcContent, franklinLayerLines, flemingInhibitionZoneMm, GenesisBioVirologyEngine } from './GenesisBioVirologyEngine.js';
import { GenesisTitanExpandedCore, TITAN_BIO_KNOWLEDGE } from './GenesisTitanExpandedCore.js';
const src = (f: string) => readFileSync(fileURLToPath(new URL('./' + f, import.meta.url)), 'utf8');
const clock = { t: 1000, now() { return this.t; } };
describe('swiss precision engine', () => {
  const frames = [{ t: 0, position: [0, 0, 10] as const, attitude: [0, 0, 0] as const, battery: 1 }, { t: 1, position: [3, 4, 10] as const, attitude: [0, 0, 0] as const, battery: 0.9 }];
  it('telemetry path length exact & hash chain', () => { const e = new GenesisSwissPrecisionEngine(clock, 7); const r = e.ingestTelemetry(frames); expect(r.ok).toBe(true); expect(r.pathLengthM).toBe(5); expect(e.getChain().length).toBe(2); expect(r.headHash).toMatch(/^[0-9a-f]{64}$/); });
  it('rejects non-monotonic time', () => { const e = new GenesisSwissPrecisionEngine(clock, 7); expect(e.ingestTelemetry([frames[1], frames[0]]).error).toBe('NON_MONOTONIC_TIME'); });
  it('terrain from lidar bitwise-identical on repeat', () => { const pts = Float64Array.from([0.2, 0.3, 5, 0.6, 0.7, 6, 0.4, 0.4, 5.5]); const scan = { points: pts, resolutionM: 0.1, bbox: [0, 1, 0, 1] as const };
    const a = new GenesisSwissPrecisionEngine(clock, 7).buildTerrainFromLidar(scan, 8); const b = new GenesisSwissPrecisionEngine(clock, 7).buildTerrainFromLidar(scan, 8);
    expect(Array.from(a.elevation)).toEqual(Array.from(b.elevation)); expect(a.fingerprint).toBe(b.fingerprint); });
  it('line-of-sight deterministic', () => { const e = new GenesisSwissPrecisionEngine(clock, 7); const t = e.buildTerrainFromLidar({ points: Float64Array.from([0.2, 0.2, 1, 0.8, 0.8, 2]), resolutionM: 0.1, bbox: [0, 1, 0, 1] }, 8);
    const a = e.lineOfSight(t, [1, 1], [6, 6]); const b = e.lineOfSight(t, [1, 1], [6, 6]); expect(a.minClearanceM).toBe(b.minClearanceM); expect(a.fingerprint).toBe(b.fingerprint); });
});
describe('bio-virology engine', () => {
  it('logistic reaches K', () => { expect(logisticReplication(0.5, 1000, 1, 60)).toBeCloseTo(1000, 3); });
  it('mutation curve complementary', () => { const m = mutationCurve(1e-6, 1000); expect(m.wildtypeFraction + m.variantFraction).toBeCloseTo(1, 6); });
  it('diffusion conserves mass', () => { const init = new Float64Array(32); init[16] = 10; const out = diffuseMedium(0.1, 1, 0.2, 50, init); expect(massOf(out)).toBeCloseTo(massOf(init), 6); });
  it('binding neutralization monotonic in kon', () => { const a = bindingKinetics(1e3, 1e-3, 10, 5, 0.01, 500); const b = bindingKinetics(1e4, 1e-3, 10, 5, 0.01, 500); expect(b.neutralization).toBeGreaterThanOrEqual(a.neutralization); });
  it('expression converges to analytic steady state', () => { const r = expressionDynamics(2, 0.5, 3, 0.6, 0, 0, 0.01, 4000); expect(r.mRNA).toBeCloseTo(r.steadyMRNA, 3); expect(r.protein).toBeCloseTo(r.steadyProtein, 3); });
  it('gc content & franklin & fleming deterministic', () => { expect(gcContent('GGCCAA')).toBeCloseTo(4 / 6, 6); expect(franklinLayerLines(3.4, 0.34, 3)).toEqual(franklinLayerLines(3.4, 0.34, 3)); expect(flemingInhibitionZoneMm(1, 100, 1)).toBeGreaterThan(0); });
  it('wrap label & fingerprint', () => { const e = new GenesisBioVirologyEngine(clock, 7); const r = e.wrap({ v: 1 }); expect(r.dataLabel).toBe('BIOLOGICAL_SYNTHETIC_ESTIMATE'); expect(r.fingerprint).toMatch(/^[0-9a-f]{64}$/); });
});
describe('titan expanded core', () => {
  it('knowledge labelled', () => { expect(TITAN_BIO_KNOWLEDGE.every(e => ['VERIFIED', 'ACTIVE_RESEARCH', 'THEORETICAL', 'UNSUBSTANTIATED'].includes(e.claimStatus))).toBe(true); });
  it('decide deterministic & confidence bounded', () => { const c = new GenesisTitanExpandedCore(clock, 7); const a = c.decide('q', ['GERM_THEORY', 'DNA_HELIX']); const b = c.decide('q', ['GERM_THEORY', 'DNA_HELIX']); expect(a.fingerprint).toBe(b.fingerprint); expect(a.confidence).toBeGreaterThanOrEqual(0); expect(a.confidence).toBeLessThanOrEqual(0.95); });
  it('empty evidence -> INSUFFICIENT', () => { expect(new GenesisTitanExpandedCore(clock, 7).decide('q', []).recommendation).toContain('INSUFFICIENT_EVIDENCE'); });
});
describe('iron rules', () => {
  for (const f of ['GenesisSwissPrecisionEngine.ts', 'GenesisBioVirologyEngine.ts', 'GenesisTitanExpandedCore.ts']) it(f + ' no Math.random/Date.now', () => { const s = src(f); expect(s).not.toContain('Math.random('); expect(s).not.toContain('Date.now('); });
});
