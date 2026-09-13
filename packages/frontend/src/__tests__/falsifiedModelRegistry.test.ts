import { describe, expect, it } from 'vitest';
import {
  FalsifiedModelRegistry,
  registryFingerprint,
  type FalsifiedModelScope,
} from '../core/agent/falsifiedModelRegistry';

const QUANTUM: FalsifiedModelScope = {
  domain: 'trapped-ion entanglement growth',
  assumptions: ['independent observations', 'reported sigmas correct'],
  boundary: 'T in [1,20] ms, 10-ion disordered chain',
};

const ASTRO: FalsifiedModelScope = {
  domain: 'planetary orbital dynamics',
  assumptions: ['two-body approximation'],
  boundary: 'nine Sun-orbiting bodies',
};

function seeded(reusableAs: 'NEVER' | 'VARIANT_ONLY' | 'COMPONENT' = 'NEVER', scope = QUANTUM) {
  const written = new FalsifiedModelRegistry().record({
    modelId: 'model:linear',
    modelFingerprint: 'fp-linear',
    observationIds: ['obs-1', 'obs-2', 'obs-3'],
    verdict: 'FALSIFIED',
    campaignId: 'qe4-brydges-disorder-k5',
    round: 4,
    scope,
    reusableAs,
    recordedAt: 1,
  });
  if (!written.ok) throw new Error(written.reason);
  return written;
}

describe('M2 T1 — cross-campaign block', () => {
  it('blocks a model in campaign B that campaign A falsified under the same assumptions', () => {
    const { registry } = seeded('NEVER');
    const lookup = registry.check('fp-linear', QUANTUM);
    expect(lookup.outcome).toBe('BLOCK');
    expect(lookup.matched).toHaveLength(1);
    expect(lookup.reason).toContain('qe4-brydges-disorder-k5#4');
  });

  it('cites the observations that killed it, so the block is auditable rather than asserted', () => {
    const { registry } = seeded('NEVER');
    expect(registry.check('fp-linear', QUANTUM).matched[0]!.falsifiedBy.observationIds).toEqual(['obs-1', 'obs-2', 'obs-3']);
  });
});

describe('M2 T2 — variant-only override', () => {
  it('requires an override rather than blocking outright', () => {
    const { registry } = seeded('VARIANT_ONLY');
    expect(registry.check('fp-linear', QUANTUM).outcome).toBe('REQUIRE_OVERRIDE');
  });

  it('lifts to ALLOW_WITH_TAG only for an override that names new evidence and a rationale', () => {
    const { registry } = seeded('VARIANT_ONLY');
    const lookup = registry.check('fp-linear', QUANTUM);
    const allowed = registry.applyOverride(lookup, {
      recordId: lookup.matched[0]!.recordId,
      authorizedBy: 'principal investigator',
      rationale: 'A re-analysis at finer time resolution changes which parameterisation is being proposed.',
      newEvidenceIds: ['obs-11', 'obs-12'],
      at: 2,
    });
    expect(allowed.outcome).toBe('ALLOW_WITH_TAG');
    expect(allowed.reason).toContain('principal investigator');
  });

  it('refuses an override that cites no new evidence — disagreement is not evidence', () => {
    const { registry } = seeded('VARIANT_ONLY');
    const lookup = registry.check('fp-linear', QUANTUM);
    const refused = registry.applyOverride(lookup, {
      recordId: lookup.matched[0]!.recordId, authorizedBy: 'someone', rationale: 'I think it is fine.', newEvidenceIds: [], at: 2,
    });
    expect(refused.outcome).toBe('REQUIRE_OVERRIDE');
    expect(refused.reason).toContain('not evidence');
  });

  it('an override cannot resurrect a NEVER record, however it is authorized', () => {
    const { registry } = seeded('NEVER');
    const lookup = registry.check('fp-linear', QUANTUM);
    const stillBlocked = registry.applyOverride(lookup, {
      recordId: lookup.matched[0]!.recordId, authorizedBy: 'owner', rationale: 'override it', newEvidenceIds: ['obs-9'], at: 2,
    });
    expect(stillBlocked.outcome).toBe('BLOCK');
  });
});

describe('M2 T3 — assumption-scope handling', () => {
  it('does not block when the new campaign changed an assumption: that is a different question', () => {
    const { registry } = seeded('NEVER');
    const relaxed = { ...QUANTUM, assumptions: ['independent observations'] };
    const lookup = registry.check('fp-linear', relaxed);
    expect(lookup.outcome).toBe('ALLOW');
    // The non-matching record is still surfaced, so nobody can claim it was hidden.
    expect(lookup.outOfScope).toHaveLength(1);
    expect(lookup.reason).toContain('never under this domain and assumption set');
  });

  it('records the same model separately per scope, and each blocks only its own', () => {
    const first = seeded('NEVER', QUANTUM);
    const second = first.registry.record({
      modelId: 'model:linear', modelFingerprint: 'fp-linear', observationIds: ['obs-7'], verdict: 'FALSIFIED',
      campaignId: 'nasa-nssdc-planetary-orbits', round: 2, scope: ASTRO, reusableAs: 'COMPONENT', recordedAt: 3,
    });
    if (!second.ok) throw new Error(second.reason);
    expect(second.registry.size()).toBe(2);
    expect(second.registry.check('fp-linear', QUANTUM).outcome).toBe('BLOCK');
    expect(second.registry.check('fp-linear', ASTRO).outcome).toBe('ALLOW_WITH_TAG');
  });
});

describe('M2 T4 — append-only', () => {
  it('every write returns a NEW registry and leaves the previous one exactly as it was', () => {
    const empty = new FalsifiedModelRegistry();
    const { registry } = seeded();
    expect(empty.size()).toBe(0);
    expect(registry.size()).toBe(1);
    expect(empty.check('fp-linear', QUANTUM).outcome).toBe('ALLOW');
  });

  it('supersession adds a pointer and never deletes: the original stays readable', () => {
    const { registry, record } = seeded('NEVER');
    const after = registry.supersede(record.recordId, 'falsified:newer');
    expect(after.size()).toBe(1);
    expect(after.all()[0]!.supersededBy).toBe('falsified:newer');
    // Superseded records stop gating, but the history is intact.
    expect(after.check('fp-linear', QUANTUM).outcome).toBe('ALLOW');
    expect(registry.all()[0]!.supersededBy).toBeNull();
  });

  it('exposes no mutator that could rewrite or drop a record', () => {
    const { registry } = seeded();
    const names = Object.getOwnPropertyNames(Object.getPrototypeOf(registry));
    expect(names).not.toContain('delete');
    expect(names).not.toContain('remove');
    expect(names).not.toContain('update');
    expect(names).not.toContain('clear');
  });

  it('re-writing an identical fact is idempotent rather than duplicated', () => {
    const { registry } = seeded('NEVER');
    const again = registry.record({
      modelId: 'model:linear', modelFingerprint: 'fp-linear', observationIds: ['obs-1', 'obs-2', 'obs-3'],
      verdict: 'FALSIFIED', campaignId: 'qe4-brydges-disorder-k5', round: 4, scope: QUANTUM, reusableAs: 'NEVER', recordedAt: 9,
    });
    if (!again.ok) throw new Error(again.reason);
    expect(again.registry.size()).toBe(1);
  });
});

describe('M2 T5 — no false-positive blocking', () => {
  it('never blocks a model nobody falsified', () => {
    const { registry } = seeded('NEVER');
    expect(registry.check('fp-logarithmic', QUANTUM).outcome).toBe('ALLOW');
    expect(registry.check('fp-logarithmic', QUANTUM).matched).toHaveLength(0);
  });

  it('never blocks across unrelated science: a quantum falsification says nothing about orbits', () => {
    const { registry } = seeded('NEVER');
    expect(registry.check('fp-linear', ASTRO).outcome).toBe('ALLOW');
  });

  it('an empty registry blocks nothing at all', () => {
    const empty = new FalsifiedModelRegistry();
    for (const fp of ['fp-a', 'fp-b', 'fp-linear']) expect(empty.check(fp, QUANTUM).outcome).toBe('ALLOW');
  });
});

describe('M2 — admission rule: only a real falsification gets in', () => {
  it('refuses a non-falsified verdict', () => {
    for (const verdict of ['SUPPORTED_WITHIN_PROTOCOL', 'INCONCLUSIVE', 'UNRESOLVED', '']) {
      const result = new FalsifiedModelRegistry().record({
        modelId: 'm', modelFingerprint: 'fp', observationIds: ['o'], verdict,
        campaignId: 'c', round: 1, scope: QUANTUM, reusableAs: 'NEVER', recordedAt: 1,
      });
      expect(result.ok).toBe(false);
    }
  });

  it('refuses a falsification with no observations behind it', () => {
    const result = new FalsifiedModelRegistry().record({
      modelId: 'm', modelFingerprint: 'fp', observationIds: [], verdict: 'FALSIFIED',
      campaignId: 'c', round: 1, scope: QUANTUM, reusableAs: 'NEVER', recordedAt: 1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('not evidence');
  });

  it('accepts the engine\'s own FALSIFIED_WITHIN_PROTOCOL vocabulary without renaming anything stored', () => {
    const result = new FalsifiedModelRegistry().record({
      modelId: 'm', modelFingerprint: 'fp', observationIds: ['o'], verdict: 'FALSIFIED_WITHIN_PROTOCOL',
      campaignId: 'c', round: 1, scope: QUANTUM, reusableAs: 'NEVER', recordedAt: 1,
    });
    expect(result.ok).toBe(true);
  });

  it('is replay-deterministic: identical facts produce an identical registry fingerprint', () => {
    expect(registryFingerprint(seeded().registry)).toBe(registryFingerprint(seeded().registry));
    expect(registryFingerprint(seeded('NEVER').registry)).not.toBe(registryFingerprint(seeded('COMPONENT').registry));
  });
});
