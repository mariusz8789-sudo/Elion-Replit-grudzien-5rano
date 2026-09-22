import { describe, expect, it } from 'vitest';
import {
  detectMetaContradiction,
  isMetaCognitiveEpistemicStatus,
  recordMetaObservation,
  type MetaClaim,
} from '../core/metaCognition/epistemicStatus';

function claim(overrides: Partial<MetaClaim> & Pick<MetaClaim, 'id' | 'status' | 'value'>): MetaClaim {
  return { subject: 'candidate-1', predicate: 'is-toxic', evidenceRefs: [], ...overrides };
}

describe('isMetaCognitiveEpistemicStatus', () => {
  it('accepts exactly the eight canonical values', () => {
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

  it('reports a real, deterministic contradiction event for same subject+predicate, disagreeing values, both resolved', () => {
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

describe('recordMetaObservation', () => {
  it('produces a deterministic, structured event referencing the claim', () => {
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
