import { describe, expect, it } from 'vitest';
import {
  deriveContradictedStatuses,
  detectMetaContradiction,
  isMetaCognitiveEpistemicStatus,
  recordMetaObservation,
  type MetaClaim,
} from '../core/metaCognition/epistemicStatus';
import { introspectCapabilities, type CapabilityDescriptor } from '../core/metaCognition/capabilityIntrospection';

function claim(overrides: Partial<MetaClaim> & Pick<MetaClaim, 'id' | 'status' | 'value'>): MetaClaim {
  return { subject: 'candidate-1', predicate: 'is-toxic', evidenceRefs: [], ...overrides };
}

describe('isMetaCognitiveEpistemicStatus', () => {
  it('accepts exactly the eight canonical values (D-141 required set)', () => {
    for (const s of ['KNOWN', 'SUPPORTED', 'INFERRED', 'SIMULATED', 'ASSUMED', 'UNKNOWN', 'CONTRADICTED', 'UNVERIFIED']) {
      expect(isMetaCognitiveEpistemicStatus(s)).toBe(true);
    }
  });

  it('rejects an invented status', () => {
    expect(isMetaCognitiveEpistemicStatus('CERTAIN')).toBe(false);
  });
});

describe('detectMetaContradiction', () => {
  it('returns null when subjects differ', () => {
    const a = claim({ id: 'a', status: 'KNOWN', value: true, subject: 'candidate-1' });
    const b = claim({ id: 'b', status: 'KNOWN', value: false, subject: 'candidate-2' });
    expect(detectMetaContradiction(a, b)).toBeNull();
  });

  it('returns null when values agree', () => {
    const a = claim({ id: 'a', status: 'SUPPORTED', value: true });
    const b = claim({ id: 'b', status: 'INFERRED', value: true });
    expect(detectMetaContradiction(a, b)).toBeNull();
  });

  it('returns null when either claim is still UNKNOWN — an unresolved claim cannot contradict', () => {
    const a = claim({ id: 'a', status: 'UNKNOWN', value: true });
    const b = claim({ id: 'b', status: 'KNOWN', value: false });
    expect(detectMetaContradiction(a, b)).toBeNull();
  });

  it('reports a real, deterministic META_CONTRADICTION_DETECTED event for same subject+predicate, disagreeing values, both resolved', () => {
    const a = claim({ id: 'a', status: 'SUPPORTED', value: true });
    const b = claim({ id: 'b', status: 'SUPPORTED', value: false });
    const event = detectMetaContradiction(a, b);
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe('META_CONTRADICTION_DETECTED');
    expect(event!.claimAId).toBe('a');
    expect(event!.claimBId).toBe('b');
    expect(event!.reason).toContain('candidate-1');

    const again = detectMetaContradiction(a, b);
    expect(again!.id).toBe(event!.id);
  });
});

describe('deriveContradictedStatuses', () => {
  it('flips both sides of a real contradiction to CONTRADICTED, leaves everything else unchanged', () => {
    const claims: MetaClaim[] = [
      claim({ id: 'a', status: 'SUPPORTED', value: true }),
      claim({ id: 'b', status: 'SUPPORTED', value: false }),
      claim({ id: 'c', status: 'KNOWN', value: true, subject: 'candidate-2' }),
    ];
    const derived = deriveContradictedStatuses(claims);
    expect(derived.find((c) => c.id === 'a')!.status).toBe('CONTRADICTED');
    expect(derived.find((c) => c.id === 'b')!.status).toBe('CONTRADICTED');
    expect(derived.find((c) => c.id === 'c')!.status).toBe('KNOWN');
  });

  it('never asserts CONTRADICTED up front — a non-contradicting claim set is untouched', () => {
    const claims: MetaClaim[] = [claim({ id: 'a', status: 'SUPPORTED', value: true })];
    expect(deriveContradictedStatuses(claims)[0]!.status).toBe('SUPPORTED');
  });
});

describe('recordMetaObservation', () => {
  it('produces a deterministic, structured META_OBSERVATION_RECORDED event referencing the claim', () => {
    const a = claim({ id: 'claim-1', status: 'KNOWN', value: 42 });
    const event = recordMetaObservation(a);
    expect(event.eventType).toBe('META_OBSERVATION_RECORDED');
    expect(event.claimId).toBe('claim-1');
    expect(event.status).toBe('KNOWN');
    expect(recordMetaObservation(a).id).toBe(event.id);
  });

  it('gives different claims different fingerprints', () => {
    const a = recordMetaObservation(claim({ id: 'claim-1', status: 'KNOWN', value: 1 }));
    const b = recordMetaObservation(claim({ id: 'claim-1', status: 'KNOWN', value: 2 }));
    expect(a.id).not.toBe(b.id);
  });
});

describe('introspectCapabilities — capability introspection', () => {
  it('summarizes real caller-supplied capability checks without fabricating any', () => {
    const descriptors: CapabilityDescriptor[] = [
      { id: 'chem-rdkit-descriptors', kind: 'SOLVER', available: true },
      { id: 'quantum-chemistry-pyscf', kind: 'EXTERNAL_ENGINE', available: false, reason: 'PySCF not installed' },
    ];
    const report = introspectCapabilities(descriptors);
    expect(report.totalCount).toBe(2);
    expect(report.availableCount).toBe(1);
    expect(report.blockedCount).toBe(1);
    expect(report.blocked[0]!.reason).toBe('PySCF not installed');
  });

  it('refuses an unavailable descriptor with no reason — an honest BLOCKED must say why', () => {
    expect(() => introspectCapabilities([{ id: 'x', kind: 'SOLVER', available: false }])).toThrow();
  });

  it('is pure: identical input always produces an identical report', () => {
    const descriptors: CapabilityDescriptor[] = [{ id: 'a', kind: 'SOLVER', available: true }];
    expect(introspectCapabilities(descriptors)).toEqual(introspectCapabilities(descriptors));
  });
});
