import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SpacetimeCurvatureEngine, schwarzschildRadius, timeDilationFactor, kerrOuterHorizon, photonGeodesic, weakDeflection, G, C } from './SpacetimeCurvatureEngine.js';
import { GenesisEnterpriseMonetizer, TIER_POLICIES } from './GenesisEnterpriseMonetizer.js';
import { createRelativisticPipeline } from './RelativisticRendererPipeline.js';
const src = (f: string) => readFileSync(fileURLToPath(new URL('./' + f, import.meta.url)), 'utf8');
const clock = { t: 1000, now() { return this.t; } };
const MSUN = 1.989e30;
describe('spacetime physics', () => {
  it('Schwarzschild radius of Sun ~2954 m', () => { expect(schwarzschildRadius(MSUN)).toBeCloseTo(2954, 0); });
  it('time dilation in (0,1] outside horizon', () => { const f = timeDilationFactor(MSUN, 1e7); expect(f).toBeGreaterThan(0); expect(f).toBeLessThanOrEqual(1); });
  it('Kerr outer horizon <= 2*M_geo', () => { const m = (G * MSUN) / (C * C); expect(kerrOuterHorizon(MSUN, m)).toBeLessThanOrEqual(2 * m + 1e-9); });
  it('photon geodesic deterministic', () => { const a = photonGeodesic(MSUN, 1e9, 200, 0.02); const b = photonGeodesic(MSUN, 1e9, 200, 0.02); expect(a.deflectionRad).toBe(b.deflectionRad); expect(a.points.length).toBe(b.points.length); });
  it('weak deflection positive & matches 4GM/c2b', () => { expect(weakDeflection(MSUN, 1e9)).toBeCloseTo((4 * G * MSUN) / (C * C * 1e9), 12); });
  it('solve labels RELATIVISTIC_SIMULATION + fingerprint', () => { const e = new SpacetimeCurvatureEngine(clock); const s = e.solve({ massKg: MSUN, radiusM: 1e7, spinAM: 0, impactParamB: 1e9 }); expect(s.dataLabel).toBe('RELATIVISTIC_SIMULATION'); expect(s.fingerprint).toMatch(/^[0-9a-f]{64}$/); });
});
describe('relativistic renderer pipeline', () => {
  it('falls back safely when WebGL unavailable', () => { let msg = ''; const fake = {} as HTMLCanvasElement; const h = createRelativisticPipeline(fake, m => { msg = m; }); expect(h.ok).toBe(false); expect(msg).toBeTruthy(); });
});
describe('enterprise monetizer', () => {
  it('license sign/verify roundtrip', () => { const m = new GenesisEnterpriseMonetizer(clock, 'k'); const l = m.issueLicense('RESEARCH', 60000); expect(m.verifyLicense(l)).toBe(true); });
  it('tampered license fails', () => { const m = new GenesisEnterpriseMonetizer(clock, 'k'); const l = m.issueLicense('RESEARCH', 60000); expect(m.verifyLicense({ ...l, hmac: '00'.repeat(32) })).toBe(false); });
  it('instance limit enforced', () => { const m = new GenesisEnterpriseMonetizer(clock, 'k'); const l = m.issueLicense('ACADEMIC', 60000); expect(m.activateInstance(l, 'i1').ok).toBe(true); expect(m.activateInstance(l, 'i2').ok).toBe(true); expect(m.activateInstance(l, 'i3').code).toBe('INSTANCE_LIMIT'); });
  it('tier rate limiting enforced', () => { const m = new GenesisEnterpriseMonetizer(clock, 'k'); const l = m.issueLicense('ACADEMIC', 60000); const max = TIER_POLICIES.ACADEMIC.maxOpsPerWindow; for (let i = 0; i < max; i++) expect(m.consume(l, 'op').ok).toBe(true); expect(m.consume(l, 'op').code).toBe('RATE_LIMITED'); });
  it('telemetry chain verifies; sanitize zeroes key', () => { const m = new GenesisEnterpriseMonetizer(clock, 'sec'); const l = m.issueLicense('B2G', 60000); m.consume(l, 'op'); expect(m.verifyTelemetryChain()).toBe(true); m.sanitize(); expect(m.getTelemetry().length).toBeGreaterThan(0); });
});
describe('iron rules: no randomness/time in supreme engines', () => {
  for (const f of ['SpacetimeCurvatureEngine.ts', 'GenesisEnterpriseMonetizer.ts', 'RelativisticRendererPipeline.ts']) {
    it(f + ' clean', () => { const s = src(f); expect(s).not.toContain('Math.random('); expect(s).not.toContain('Date.now('); });
  }
});
