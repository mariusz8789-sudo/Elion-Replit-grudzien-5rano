import { describe, expect, it } from 'vitest';
import {
  assertNoBackwardTimeTravelClaim,
  requiredEpistemicLabelForPhysicsClaim,
  validatePhysicsClaim,
  validatePhysicsClaims,
  type PhysicsClaim,
} from '../core/experimentFabric/spacetimeIntegrity';

/**
 * Overnight Science Task 9: proves the required honest label per physics-claim category, the
 * historical-reconstruction sourced/unsourced downgrade, the backward-time-travel guard, and that
 * the canonical epistemic firewall (assertNoTruthUpgrade) still fires for a forbidden upgrade —
 * this module adds no second firewall, it only judges against the existing one.
 */
function claim(overrides: Partial<PhysicsClaim> & Pick<PhysicsClaim, 'claimId' | 'category' | 'assignedLabel'>): PhysicsClaim {
  return { statement: 'A neutral research statement about the phenomenon.', sourceIds: [], ...overrides };
}

describe('requiredEpistemicLabelForPhysicsClaim', () => {
  it('requires HYPOTHESIS for a wormhole claim', () => {
    expect(requiredEpistemicLabelForPhysicsClaim('WORMHOLE')).toBe('HYPOTHESIS');
  });

  it('requires SIMULATION for a multiverse claim', () => {
    expect(requiredEpistemicLabelForPhysicsClaim('MULTIVERSE')).toBe('SIMULATION');
  });

  it('requires MODEL for time dilation and gravity well claims', () => {
    expect(requiredEpistemicLabelForPhysicsClaim('TIME_DILATION')).toBe('MODEL');
    expect(requiredEpistemicLabelForPhysicsClaim('GRAVITY_WELL')).toBe('MODEL');
  });

  it('requires RECONSTRUCTION for a sourced historical-reconstruction claim, INSUFFICIENT_EVIDENCE for an unsourced one', () => {
    expect(requiredEpistemicLabelForPhysicsClaim('HISTORICAL_RECONSTRUCTION', ['source-1'])).toBe('RECONSTRUCTION');
    expect(requiredEpistemicLabelForPhysicsClaim('HISTORICAL_RECONSTRUCTION', [])).toBe('INSUFFICIENT_EVIDENCE');
  });
});

describe('assertNoBackwardTimeTravelClaim', () => {
  it('rejects an explicit backward-time-travel assertion', () => {
    expect(() => assertNoBackwardTimeTravelClaim('The traveler went back in time to 1900.')).toThrow(
      /SPACETIME_INTEGRITY_REJECTED/,
    );
  });

  it('rejects a "changed the past" assertion', () => {
    expect(() => assertNoBackwardTimeTravelClaim('This intervention changed the past outcome.')).toThrow(
      /SPACETIME_INTEGRITY_REJECTED/,
    );
  });

  it('allows a plain forward-looking or purely descriptive statement', () => {
    expect(() => assertNoBackwardTimeTravelClaim('The model predicts time dilation near the mass.')).not.toThrow();
  });
});

describe('validatePhysicsClaim', () => {
  it('reports ok:true when the claim carries the exact honest label for its category', () => {
    const result = validatePhysicsClaim(claim({ claimId: 'c1', category: 'WORMHOLE', assignedLabel: 'HYPOTHESIS' }));
    expect(result.ok).toBe(true);
    expect(result.requiredLabel).toBe('HYPOTHESIS');
  });

  it('reports ok:false (not a throw) for a plain category/label mismatch that is not a forbidden upgrade', () => {
    const result = validatePhysicsClaim(claim({ claimId: 'c2', category: 'MULTIVERSE', assignedLabel: 'MODEL' }));
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('MULTIVERSE');
  });

  it('throws via the canonical epistemic firewall when a wormhole claim is upgraded to REAL_OBSERVATION', () => {
    expect(() => validatePhysicsClaim(claim({ claimId: 'c3', category: 'WORMHOLE', assignedLabel: 'REAL_OBSERVATION' }))).toThrow(
      /EPISTEMIC_UPGRADE_FORBIDDEN/,
    );
  });

  it('rejects a backward-time-travel statement before checking the label at all', () => {
    expect(() =>
      validatePhysicsClaim(
        claim({
          claimId: 'c4',
          category: 'HISTORICAL_RECONSTRUCTION',
          assignedLabel: 'RECONSTRUCTION',
          sourceIds: ['archive-1'],
          statement: 'This device let us travel back in time and change the past.',
        }),
      ),
    ).toThrow(/SPACETIME_INTEGRITY_REJECTED/);
  });

  it('validates a sourced historical-reconstruction claim as ok, and the same claim unsourced as a mismatch', () => {
    const sourced = validatePhysicsClaim(
      claim({ claimId: 'c5', category: 'HISTORICAL_RECONSTRUCTION', assignedLabel: 'RECONSTRUCTION', sourceIds: ['archive-1'] }),
    );
    expect(sourced.ok).toBe(true);

    const unsourced = validatePhysicsClaim(
      claim({ claimId: 'c6', category: 'HISTORICAL_RECONSTRUCTION', assignedLabel: 'RECONSTRUCTION', sourceIds: [] }),
    );
    expect(unsourced.ok).toBe(false);
    expect(unsourced.requiredLabel).toBe('INSUFFICIENT_EVIDENCE');
  });
});

describe('validatePhysicsClaims — batch', () => {
  it('validates a real batch of claims, one result per input claim, in order', () => {
    const claims: PhysicsClaim[] = [
      claim({ claimId: 'a', category: 'GRAVITY_WELL', assignedLabel: 'MODEL' }),
      claim({ claimId: 'b', category: 'MULTIVERSE', assignedLabel: 'SIMULATION' }),
    ];
    const results = validatePhysicsClaims(claims);
    expect(results.map((r) => r.claim.claimId)).toEqual(['a', 'b']);
    expect(results.every((r) => r.ok)).toBe(true);
  });
});
