import { describe, expect, it } from 'vitest';
import { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { KernelProviderRegistry } from '@genesis/core/mythos/KernelProviderRegistry.js';
import { assertNonConsciousnessFraming, runMetaCognitionAudit } from '../core/metaCognition/metaCognitionRuntime';

function record(ledger: EvidenceLedger, sourceUrl: string, claim: string, claimType: 'observation' | 'reported_claim' | 'hypothesis' | 'model' | 'conclusion' = 'reported_claim'): void {
  ledger.addRecord({ sourceUrl, sourceTimestamp: null, claim, claimType, confidence: 0.8, provenance: { sourceKind: 'document', retrievedBy: 'test', independentSourceIds: [] } });
}

describe('D-141 Meta-Cognition — canonical adapters', () => {
  it('promotes both sides of a detected conflict to CONTRADICTED and emits the real meta event', () => {
    const ledger = new EvidenceLedger({ now: () => 7 });
    record(ledger, 'https://a.example/r0', 'epidemic estimate r0=2.5');
    record(ledger, 'https://b.example/r0', 'epidemic estimate r0=3.4');
    const registry = new KernelProviderRegistry();
    registry.register({ providerId: 'test-provider', capabilities: ['test-analysis'], analyze: () => ({ ok: true }) });

    const snapshot = runMetaCognitionAudit({ ledger, registry });
    expect(snapshot.states.CONTRADICTED).toBe(2);
    expect(snapshot.records.every((entry) => entry.state === 'CONTRADICTED')).toBe(true);
    expect(snapshot.events.some((entry) => entry.type === 'META_CONTRADICTION_DETECTED')).toBe(true);
    expect(snapshot.capabilities).toEqual([{ providerId: 'test-provider', capabilities: ['test-analysis'] }]);
    expect(snapshot.goalCapability).toBe('PARTIAL');
  });

  it('emits observation/evidence-required events into the same ledger without creating Meta Memory', () => {
    const ledger = new EvidenceLedger({ now: () => 9 });
    record(ledger, 'https://instrument.example/run', 'temperatureK=302.1 from instrument', 'observation');
    record(ledger, 'genesis://model/run', 'pressurePa=101325 model output', 'model');
    const registry = new KernelProviderRegistry();
    const snapshot = runMetaCognitionAudit({ ledger, registry, persistEvents: true });

    expect(snapshot.events.some((entry) => entry.type === 'META_OBSERVATION_RECORDED')).toBe(true);
    expect(snapshot.events.some((entry) => entry.type === 'META_EVIDENCE_REQUIRED')).toBe(true);
    expect(ledger.getActive().some((entry) => entry.claim.startsWith('META_OBSERVATION_RECORDED'))).toBe(true);
    expect(ledger.getActive().some((entry) => entry.claim.startsWith('META_EVIDENCE_REQUIRED'))).toBe(true);
    expect(ledger.verifyLedger().ok).toBe(true);
  });

  it('keeps all eight explicit states visible without inventing records', () => {
    const ledger = new EvidenceLedger({ now: () => 1 });
    const snapshot = runMetaCognitionAudit({ ledger, registry: new KernelProviderRegistry() });
    expect(Object.keys(snapshot.states).sort()).toEqual(['ASSUMED', 'CONTRADICTED', 'INFERRED', 'KNOWN', 'SIMULATED', 'SUPPORTED', 'UNKNOWN', 'UNVERIFIED'].sort());
    expect(snapshot.states.UNKNOWN).toBe(1);
    expect(snapshot.records).toHaveLength(0);
  });

  it('screens every free-text field authored by meta-cognition for consciousness overclaims', () => {
    expect(() => assertNonConsciousnessFraming({ decision: 'I am conscious', rationale: 'derived from evidence' })).toThrow(/META_NON_CONSCIOUSNESS_GUARD:decision/);
    expect(() => assertNonConsciousnessFraming({ decision: 'Evidence is incomplete', rationale: 'The model is sentient' })).toThrow(/META_NON_CONSCIOUSNESS_GUARD:rationale/);
    expect(() => assertNonConsciousnessFraming({ decision: 'Evidence is incomplete', rationale: 'Derived deterministic audit' })).not.toThrow();
  });
});
