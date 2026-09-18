/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RecursiveSimulationMatrix } from './RecursiveSimulationMatrix.js';
import { ZeroTrustSemanticEngine } from './ZeroTrustSemanticEngine.js';
import { PqcLatticeShield } from './PqcLatticeShield.js';
import { ActionGateSynthesizer } from './ActionGateSynthesizer.js';
const cfg = { dims: 6, horizon: 4, branching: 3, beamK: 8, maxScenarios: 5000, eps: 0.05, seed: 7 };
const obj = new Float64Array([0.4, -0.2, 0.6, 0.1, 0.3, -0.5]);
const inter = new Float64Array(36).fill(0.02);
describe('RecursiveSimulationMatrix', () => {
  it('deterministic result & certificate hash', () => { const a = new RecursiveSimulationMatrix(cfg, obj, inter).run(); const b = new RecursiveSimulationMatrix(cfg, obj, inter).run(); expect(a.resultHash).toBe(b.resultHash); expect(a.certificate.certificateHash).toBe(b.certificate.certificateHash); });
  it('enumeration capped by maxScenarios', () => { const r = new RecursiveSimulationMatrix(cfg, obj, inter).run(); expect(r.enumerated).toBeLessThanOrEqual(cfg.maxScenarios); });
  it('certificate verified when margin positive', () => { const r = new RecursiveSimulationMatrix(cfg, obj, inter).run(); expect(r.certificate.verified).toBe(r.certificate.margin > 0); });
});
describe('ZeroTrustSemanticEngine', () => {
  it('accepts consistent interval, isolates contradiction with proof trace', () => {
    const e = new ZeroTrustSemanticEngine();
    e.accept({ kind: 'INTERVAL', subject: 'GRID-7', metric: 'freq', lo: 49.9, hi: 50.1, provenanceHash: 'a'.repeat(64) });
    const ok = e.check({ kind: 'INTERVAL', subject: 'GRID-7', metric: 'freq', lo: 49.95, hi: 50.05, provenanceHash: 'b'.repeat(64) });
    expect(ok.verdict).toBe('ACCEPT');
    const bad = e.check({ kind: 'INTERVAL', subject: 'GRID-7', metric: 'freq', lo: 51.0, hi: 52.0, provenanceHash: 'c'.repeat(64) });
    expect(bad.verdict).toBe('ISOLATE'); expect(bad.rule).toBe('INTERVAL_CONTRADICTION'); expect(bad.proofTrace.length).toBeGreaterThan(0); expect(bad.anomalyId).not.toBeNull();
  });
  it('equality clash detected', () => {
    const e = new ZeroTrustSemanticEngine();
    e.accept({ kind: 'EQUALITY', subject: 'TREATY-1', metric: 'warheads', value: 100, provenanceHash: 'd'.repeat(64) });
    const r = e.check({ kind: 'EQUALITY', subject: 'TREATY-1', metric: 'warheads', value: 120, provenanceHash: 'e'.repeat(64) });
    expect(r.verdict).toBe('ISOLATE'); expect(r.rule).toBe('EQUALITY_CONTRADICTION');
  });
});
describe('PqcLatticeShield (fail-closed)', () => {
  it('refuses seal without provider', () => { const s = new PqcLatticeShield(null, null); const r = s.seal({ x: 1 }); expect(r.ok).toBe(false); expect(r.error).toBe('FAIL_CLOSED_NO_PQC'); });
  it('seals with injected provider & audit chain verifies', () => {
    const kem = { algorithm: 'ML-KEM-768(ext)', keygen: () => ({ pk: new Uint8Array(8), sk: new Uint8Array(8) }), encapsulate: () => ({ ct: new Uint8Array([1, 2]), ss: new Uint8Array([3]) }), decapsulate: () => new Uint8Array([3]) };
    const sig = { algorithm: 'ML-DSA-65(ext)', keygen: () => ({ pk: new Uint8Array(4), sk: new Uint8Array(4) }), sign: () => new Uint8Array([9]), verify: () => true };
    const s = new PqcLatticeShield(kem, sig);
    const r = s.seal({ secret: 'x' });
    expect(r.ok).toBe(true); expect(r.blob!.kemAlg).toBe('ML-KEM-768(ext)');
    expect(s.verifyAudit().ok).toBe(true);
  });
});
describe('ActionGateSynthesizer (dual-control, no execute)', () => {
  const mk = () => new ActionGateSynthesizer((approver, actionId, sig) => sig === 'SIG-' + approver + '-' + actionId);
  it('single approval stays PROPOSED; second distinct authorizes; duplicate rejected', () => {
    const g = mk();
    const [spec] = g.synthesize({ criticalNodeCompromised: true, supplySurge: false, treatyCandidateViolation: false });
    const a1 = g.approve(spec.actionId, 'OFF-1', 'SIG-OFF-1-' + spec.actionId);
    expect(a1.action!.status).toBe('PROPOSED');
    const dup = g.approve(spec.actionId, 'OFF-1', 'SIG-OFF-1-' + spec.actionId);
    expect(dup.error).toBe('DUPLICATE_APPROVER');
    const a2 = g.approve(spec.actionId, 'OFF-2', 'SIG-OFF-2-' + spec.actionId);
    expect(a2.action!.status).toBe('AUTHORIZED_FOR_HUMAN_EXECUTION');
  });
  it('bad signature rejected', () => { const g = mk(); const [spec] = g.synthesize({ criticalNodeCompromised: false, supplySurge: true, treatyCandidateViolation: false }); expect(g.approve(spec.actionId, 'OFF-1', 'WRONG').error).toBe('BAD_SIGNATURE'); });
  it('no execute method exists on prototype', () => { const g = mk(); expect((g as unknown as { execute?: unknown }).execute).toBeUndefined(); });
});
describe('iron rules', () => {
  for (const f of ['RecursiveSimulationMatrix.ts', 'ZeroTrustSemanticEngine.ts', 'PqcLatticeShield.ts', 'ActionGateSynthesizer.ts']) {
    it(f + ' bez Math.random/Date.now', () => { const s = readFileSync(fileURLToPath(new URL('./' + f, import.meta.url)), 'utf8'); expect(s).not.toContain('Math.random('); expect(s).not.toContain('Date.now('); });
  }
});
