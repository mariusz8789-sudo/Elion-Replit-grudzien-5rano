import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateCity } from './GenesisCityGenerator.js';
import { createSeirState, seirStep, seirMetrics, createFloodState, floodStep, floodMetrics, blastSolve, overpressureKPa } from './GenesisCrisisEngine.js';
import { GenesisCityMonetizer, TIER_POLICIES } from './GenesisCityMonetizer.js';
const src = (f: string) => readFileSync(fileURLToPath(new URL('./' + f, import.meta.url)), 'utf8');
const clock = { t: 1000, now() { return this.t; } };
describe('city generator', () => {
  it('same seed+profile -> identical fingerprint', () => expect(generateCity(7, 'WARSAW').fingerprint).toBe(generateCity(7, 'WARSAW').fingerprint));
  it('different seed -> different fingerprint', () => expect(generateCity(7, 'WARSAW').fingerprint).not.toBe(generateCity(8, 'WARSAW').fingerprint));
  it('profiles differ', () => expect(generateCity(7, 'DUBAI').fingerprint).not.toBe(generateCity(7, 'WARSAW').fingerprint));
  it('has water, zones, nodes, buildings', () => { const g = generateCity(7, 'WARSAW'); expect(Array.from(g.zones).some(z => z === 0)).toBe(true); expect(g.nodes.length).toBeGreaterThan(0); expect(g.buildings.length).toBeGreaterThan(0); });
});
describe('SEIR', () => {
  it('conserves population', () => { const g = generateCity(7, 'WARSAW'); let st = createSeirState(g, 100, 10); const m0 = seirMetrics(st);
    for (let i = 0; i < 20; i++) st = seirStep(g, st, { beta: 0.3, sigma: 0.2, gamma: 0.1, mobility: 0.05 }, 1);
    expect(seirMetrics(st).total).toBeCloseTo(m0.total, 0); });
  it('infection spreads then recovers (deterministic)', () => { const g = generateCity(7, 'WARSAW'); let a = createSeirState(g, 100); let b = createSeirState(g, 100);
    for (let i = 0; i < 10; i++) { a = seirStep(g, a, { beta: 0.3, sigma: 0.2, gamma: 0.1, mobility: 0.05 }, 1); b = seirStep(g, b, { beta: 0.3, sigma: 0.2, gamma: 0.1, mobility: 0.05 }, 1); }
    expect(seirMetrics(a).infected).toBe(seirMetrics(b).infected); expect(seirMetrics(a).infected).toBeGreaterThan(0); });
});
describe('flood', () => {
  it('conserves water volume (minus none)', () => { const g = generateCity(7, 'WARSAW'); let st = createFloodState(g);
    for (let i = 0; i < 10; i++) st = floodStep(g, st, { inflowCell: 500, inflowRate: i === 0 ? 50 : 0, roughness: 1 }, 1);
    const m = floodMetrics(g, st); expect(m.waterVolume).toBeCloseTo(50, 0); });
  it('flows downhill / inundates', () => { const g = generateCity(7, 'WARSAW'); let st = createFloodState(g);
    for (let i = 0; i < 15; i++) st = floodStep(g, st, { inflowCell: 500, inflowRate: i === 0 ? 100 : 0, roughness: 1 }, 1);
    expect(floodMetrics(g, st).inundatedCells).toBeGreaterThan(1); });
});
describe('blast', () => {
  it('overpressure decreases with distance', () => expect(overpressureKPa(100, 1000)).toBeLessThan(overpressureKPa(50, 1000)));
  it('damage index in [0,1]', () => { const g = generateCity(7, 'DUBAI'); const r = blastSolve(g, { x: 48, y: 48, yieldKg: 5000 }); expect(r.buildings.every(b => b.damageIndex >= 0 && b.damageIndex <= 1)).toBe(true); });
  it('zones ordered lethal<severe<glass', () => { const g = generateCity(7, 'DUBAI'); const r = blastSolve(g, { x: 48, y: 48, yieldKg: 5000 }); expect(r.zones.lethalM).toBeLessThan(r.zones.severeM); expect(r.zones.severeM).toBeLessThan(r.zones.glassM); });
  it('labeled DISASTER_SCENARIO + fingerprint', () => { const g = generateCity(7, 'DUBAI'); const r = blastSolve(g, { x: 48, y: 48, yieldKg: 1000 }); expect(r.dataLabel).toBe('DISASTER_SCENARIO'); expect(r.fingerprint).toMatch(/^[0-9a-f]{64}$/); });
});
describe('monetizer', () => {
  it('key sign/verify', () => { const m = new GenesisCityMonetizer(clock, 'k'); const k = m.issueDeploymentKey('Municipal', 'OPERATIONAL', 5, 60000); expect(m.verifyKey(k)).toBe(true); });
  it('tampered key fails', () => { const m = new GenesisCityMonetizer(clock, 'k'); const k = m.issueDeploymentKey('Defense', 'COMMAND', 5, 60000); expect(m.verifyKey({ ...k, hmac: '00'.repeat(32) })).toBe(false); });
  it('seat limit enforced', () => { const m = new GenesisCityMonetizer(clock, 'k'); const k = m.issueDeploymentKey('Insurance', 'ANALYTIC', 2, 60000); expect(m.activateSeat(k, 's1').ok).toBe(true); expect(m.activateSeat(k, 's2').ok).toBe(true); expect(m.activateSeat(k, 's3').code).toBe('SEAT_LIMIT'); });
  it('tier rate limiting', () => { const m = new GenesisCityMonetizer(clock, 'k'); const k = m.issueDeploymentKey('Municipal', 'ANALYTIC', 5, 60000); const max = TIER_POLICIES.ANALYTIC.maxOpsPerWindow; for (let i = 0; i < max; i++) m.consume(k, 'op'); expect(m.consume(k, 'op').code).toBe('RATE_LIMITED'); });
  it('audit chain verifies', () => { const m = new GenesisCityMonetizer(clock, 'sec'); const k = m.issueDeploymentKey('Municipal', 'OPERATIONAL', 3, 60000); m.consume(k, 'op'); expect(m.verifyAuditChain()).toBe(true); });
});
describe('iron rules', () => {
  for (const f of ['GenesisCityGenerator.ts', 'GenesisCrisisEngine.ts', 'GenesisCityMonetizer.ts']) it(f + ' no Math.random/Date.now', () => { const s = src(f); expect(s).not.toContain('Math.random('); expect(s).not.toContain('Date.now('); });
});
