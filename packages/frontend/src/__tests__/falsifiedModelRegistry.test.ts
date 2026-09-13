import { beforeEach, describe, expect, it } from 'vitest';
import { createHypothesis, updateConfidence, type Hypothesis } from '../core/experimentFabric/beliefRevision';
import type { FalsificationCriterion } from '../core/experimentFabric/scientificDiscovery';
import type { ModelSpec } from '../core/agent/modelSpace';
import {
  consultFalsifiedModelRegistry,
  listFalsifiedModelRecords,
  listOverrides,
  overrideFalsification,
  recordFalsification,
  resetFalsifiedModelRegistryForTests,
  type FalsificationScope,
} from '../core/agent/falsifiedModelRegistry';

function criterion(metric: string): FalsificationCriterion {
  return { metric, relation: 'less-than', rationale: 'test fixture' };
}

function spec(...bases: ('LINEAR' | 'LOG' | 'RECIPROCAL' | 'CONSTANT' | 'POWER')[]): ModelSpec {
  return { id: 'test', terms: bases.map((basis) => (basis === 'POWER' ? { basis: 'POWER' as const, exponent: 2 } : { basis })), lineage: null };
}

function falsifiedHypothesis(id: string): Hypothesis {
  const h = createHypothesis(id, criterion(id), 0.5);
  return updateConfidence(h, 'FALSIFIED_WITHIN_PROTOCOL', 0.9, 'Round 1: decisively beaten by a rival model.', 1);
}

function supportedHypothesis(id: string): Hypothesis {
  const h = createHypothesis(id, criterion(id), 0.5);
  return updateConfidence(h, 'SUPPORTED_WITHIN_PROTOCOL', 0.9, 'Round 2: new observations vindicate the model.', 2);
}

function scopeA(): FalsificationScope {
  return { domain: 'campaign-A-lab', assumptions: ['iid noise', 'linear grammar'], boundary: 'x in [1, 10]' };
}

function scopeB(): FalsificationScope {
  return { domain: 'campaign-B-lab', assumptions: ['iid noise', 'linear grammar'], boundary: 'x in [1, 10]' };
}

beforeEach(() => {
  resetFalsifiedModelRegistryForTests();
});

describe('falsifiedModelRegistry — FALSIFIED only from a real epistemic path', () => {
  it('refuses to record a falsification whose evidence Hypothesis is not FALSIFIED_WITHIN_PROTOCOL', () => {
    const active = createHypothesis('h1', criterion('h1'), 0.5);
    expect(() => recordFalsification({
      spec: spec('LINEAR'), scope: scopeA(), reusableAs: 'VARIANT_ONLY', evidence: active, campaignId: 'campaign-A', round: 1, observationIds: ['obs-1'],
    })).toThrow(/FALSIFIED_WITHIN_PROTOCOL/);
  });

  it('refuses to record a falsification from a SUPPORTED hypothesis', () => {
    const supported = supportedHypothesis('h2');
    expect(() => recordFalsification({
      spec: spec('LINEAR'), scope: scopeA(), reusableAs: 'VARIANT_ONLY', evidence: supported, campaignId: 'campaign-A', round: 1, observationIds: ['obs-1'],
    })).toThrow(/FALSIFIED_WITHIN_PROTOCOL/);
  });

  it('accepts a real FALSIFIED_WITHIN_PROTOCOL hypothesis and carries its provenance verbatim', () => {
    const evidence = falsifiedHypothesis('h3');
    const record = recordFalsification({ spec: spec('LINEAR'), scope: scopeA(), reusableAs: 'VARIANT_ONLY', evidence, campaignId: 'campaign-A', round: 3, observationIds: ['obs-1', 'obs-2'] });
    expect(record.falsifiedBy).toEqual({ observationIds: ['obs-1', 'obs-2'], verdict: 'FALSIFIED', campaignId: 'campaign-A', round: 3 });
    expect(record.modelId).toContain('x');
    expect(record.modelFingerprint).toEqual(expect.any(String));
    expect(record.supersededBy).toBeNull();
  });
});

describe('falsifiedModelRegistry — T1: falsified in campaign A blocks reuse in campaign B', () => {
  it('a model falsified in one campaign is refused (not ALLOW) when a later, different campaign in the same domain considers it', () => {
    const evidence = falsifiedHypothesis('t1');
    recordFalsification({ spec: spec('LOG'), scope: scopeA(), reusableAs: 'VARIANT_ONLY', evidence, campaignId: 'campaign-A', round: 1, observationIds: ['a1'] });

    const consultation = consultFalsifiedModelRegistry({ spec: spec('LOG'), scope: scopeA() });
    expect(consultation.verdict).not.toBe('ALLOW');
    expect(consultation.matchedRecord?.falsifiedBy.campaignId).toBe('campaign-A');
  });

  it('with no standing record at all, consultation is ALLOW', () => {
    const consultation = consultFalsifiedModelRegistry({ spec: spec('RECIPROCAL'), scope: scopeA() });
    expect(consultation.verdict).toBe('ALLOW');
    expect(consultation.matchedRecord).toBeNull();
  });
});

describe('falsifiedModelRegistry — T2: VARIANT_ONLY requires an explicit override', () => {
  it('without an override: REQUIRE_OVERRIDE (never silently ALLOW, never a bare unconditional BLOCK)', () => {
    const evidence = falsifiedHypothesis('t2a');
    recordFalsification({ spec: spec('LOG'), scope: scopeA(), reusableAs: 'VARIANT_ONLY', evidence, campaignId: 'campaign-A', round: 1, observationIds: ['a1'] });
    const consultation = consultFalsifiedModelRegistry({ spec: spec('LOG'), scope: scopeA() });
    expect(consultation.verdict).toBe('REQUIRE_OVERRIDE');
  });

  it('with a valid override: ALLOW', () => {
    const evidence = falsifiedHypothesis('t2b');
    const record = recordFalsification({ spec: spec('LOG'), scope: scopeA(), reusableAs: 'VARIANT_ONLY', evidence, campaignId: 'campaign-A', round: 1, observationIds: ['a1'] });
    overrideFalsification({ recordId: record.recordId, newEvidence: supportedHypothesis('t2b-new'), reason: 'A wider dataset in the same domain now supports this model.' });
    const consultation = consultFalsifiedModelRegistry({ spec: spec('LOG'), scope: scopeA() });
    expect(consultation.verdict).toBe('ALLOW');
  });

  it('refuses to override with another FALSIFIED_WITHIN_PROTOCOL verdict as "new evidence"', () => {
    const evidence = falsifiedHypothesis('t2c');
    const record = recordFalsification({ spec: spec('LOG'), scope: scopeA(), reusableAs: 'VARIANT_ONLY', evidence, campaignId: 'campaign-A', round: 1, observationIds: ['a1'] });
    expect(() => overrideFalsification({ recordId: record.recordId, newEvidence: falsifiedHypothesis('t2c-2'), reason: 'bad override' }))
      .toThrow(/must not itself be/);
  });

  it('refuses to override a recordId that does not exist', () => {
    expect(() => overrideFalsification({ recordId: 'no-such-record', newEvidence: supportedHypothesis('t2d'), reason: 'no-op' }))
      .toThrow(/no falsification record/);
  });
});

describe('falsifiedModelRegistry — T3: materially different assumptions require override, not an automatic BLOCK', () => {
  it('NEVER consulted from the SAME scope it was recorded in: BLOCK', () => {
    const evidence = falsifiedHypothesis('t3a');
    recordFalsification({ spec: spec('RECIPROCAL'), scope: scopeA(), reusableAs: 'NEVER', evidence, campaignId: 'campaign-A', round: 1, observationIds: ['a1'] });
    expect(consultFalsifiedModelRegistry({ spec: spec('RECIPROCAL'), scope: scopeA() }).verdict).toBe('BLOCK');
  });

  it('NEVER consulted from a MATERIALLY DIFFERENT scope (different domain): REQUIRE_OVERRIDE, not an automatic BLOCK', () => {
    const evidence = falsifiedHypothesis('t3b');
    recordFalsification({ spec: spec('RECIPROCAL'), scope: scopeA(), reusableAs: 'NEVER', evidence, campaignId: 'campaign-A', round: 1, observationIds: ['a1'] });
    const consultation = consultFalsifiedModelRegistry({ spec: spec('RECIPROCAL'), scope: scopeB() });
    expect(consultation.verdict).toBe('REQUIRE_OVERRIDE');
    expect(consultation.verdict).not.toBe('BLOCK');
  });

  it('NEVER consulted with materially different assumptions (same domain, different assumption set): REQUIRE_OVERRIDE', () => {
    const evidence = falsifiedHypothesis('t3c');
    recordFalsification({ spec: spec('RECIPROCAL'), scope: scopeA(), reusableAs: 'NEVER', evidence, campaignId: 'campaign-A', round: 1, observationIds: ['a1'] });
    const differentAssumptions: FalsificationScope = { ...scopeA(), assumptions: ['heteroscedastic noise'] };
    expect(consultFalsifiedModelRegistry({ spec: spec('RECIPROCAL'), scope: differentAssumptions }).verdict).toBe('REQUIRE_OVERRIDE');
  });
});

describe('falsifiedModelRegistry — T4: append-only', () => {
  it('overriding never mutates or removes the original record; both remain in the log', () => {
    const evidence = falsifiedHypothesis('t4');
    const record = recordFalsification({ spec: spec('LOG'), scope: scopeA(), reusableAs: 'VARIANT_ONLY', evidence, campaignId: 'campaign-A', round: 1, observationIds: ['a1'] });
    const override = overrideFalsification({ recordId: record.recordId, newEvidence: supportedHypothesis('t4-new'), reason: 'reconsidered' });

    const records = listFalsifiedModelRecords();
    const overrides = listOverrides();
    expect(records).toHaveLength(1);
    expect(overrides).toHaveLength(1);
    // The stored record's own identity fields are untouched — only the
    // DERIVED `supersededBy` view changes, computed from the override log,
    // never written back onto the original entry.
    expect(records[0]!.recordId).toBe(record.recordId);
    expect(records[0]!.fingerprint).toBe(record.fingerprint);
    expect(records[0]!.falsifiedBy).toEqual(record.falsifiedBy);
    expect(records[0]!.supersededBy).toBe(override.overrideId);
    expect(overrides[0]!.newEvidenceId).toBe('t4-new');
    expect(overrides[0]!.overriddenRecordId).toBe(record.recordId);
  });

  it('re-falsifying after an override appends a NEW, independent record — history is never overwritten', () => {
    const evidence = falsifiedHypothesis('t4b');
    const first = recordFalsification({ spec: spec('LOG'), scope: scopeA(), reusableAs: 'VARIANT_ONLY', evidence, campaignId: 'campaign-A', round: 1, observationIds: ['a1'] });
    overrideFalsification({ recordId: first.recordId, newEvidence: supportedHypothesis('t4b-new'), reason: 'reconsidered' });
    expect(consultFalsifiedModelRegistry({ spec: spec('LOG'), scope: scopeA() }).verdict).toBe('ALLOW');

    const second = recordFalsification({ spec: spec('LOG'), scope: scopeA(), reusableAs: 'VARIANT_ONLY', evidence: falsifiedHypothesis('t4b-again'), campaignId: 'campaign-B', round: 2, observationIds: ['b1'] });
    expect(second.recordId).not.toBe(first.recordId);
    expect(listFalsifiedModelRecords()).toHaveLength(2);
    expect(consultFalsifiedModelRegistry({ spec: spec('LOG'), scope: scopeA() }).verdict).toBe('REQUIRE_OVERRIDE');
  });
});

describe('falsifiedModelRegistry — T5: a shared subexpression with a different core is ALLOW', () => {
  it('a model sharing one basis term, but with additional/different terms, does not match the falsified fingerprint', () => {
    const evidence = falsifiedHypothesis('t5');
    recordFalsification({ spec: spec('LOG'), scope: scopeA(), reusableAs: 'COMPONENT', evidence, campaignId: 'campaign-A', round: 1, observationIds: ['a1'] });

    // Same falsified core: still governed.
    expect(consultFalsifiedModelRegistry({ spec: spec('LOG'), scope: scopeA() }).verdict).not.toBe('ALLOW');

    // Shares the LOG term (the "subexpression") but has a genuinely different
    // core (LOG + POWER, a different model altogether) — a different
    // modelSpecFingerprint, hence no relationship to the falsified record.
    expect(consultFalsifiedModelRegistry({ spec: spec('LOG', 'POWER'), scope: scopeA() }).verdict).toBe('ALLOW');
    expect(consultFalsifiedModelRegistry({ spec: spec('POWER'), scope: scopeA() }).verdict).toBe('ALLOW');
  });
});

describe('falsifiedModelRegistry — F1: canonicalize BEFORE fingerprinting, so reordering or duplicating terms cannot dodge a standing record', () => {
  it('recording with terms in one order is caught by consulting the SAME model with its terms reordered', () => {
    const evidence = falsifiedHypothesis('f1a');
    recordFalsification({ spec: spec('LOG', 'LINEAR'), scope: scopeA(), reusableAs: 'VARIANT_ONLY', evidence, campaignId: 'campaign-A', round: 1, observationIds: ['a1'] });

    // The "reordered operators" attack: same two terms, opposite literal order.
    const reordered: ModelSpec = { id: 'reordered', terms: [{ basis: 'LINEAR' }, { basis: 'LOG' }], lineage: null };
    expect(consultFalsifiedModelRegistry({ spec: reordered, scope: scopeA() }).verdict).not.toBe('ALLOW');
  });

  it('a spec with a term repeated is caught by consulting its deduplicated equivalent, and vice versa', () => {
    const evidence = falsifiedHypothesis('f1b');
    const withDuplicate: ModelSpec = { id: 'dup', terms: [{ basis: 'LOG' }, { basis: 'LOG' }, { basis: 'LINEAR' }], lineage: null };
    recordFalsification({ spec: withDuplicate, scope: scopeA(), reusableAs: 'VARIANT_ONLY', evidence, campaignId: 'campaign-A', round: 1, observationIds: ['a1'] });

    expect(consultFalsifiedModelRegistry({ spec: spec('LOG', 'LINEAR'), scope: scopeA() }).verdict).not.toBe('ALLOW');
  });

  it('the record itself stores the CANONICAL fingerprint, not one that depends on the caller\'s literal term order', () => {
    const evidence = falsifiedHypothesis('f1c');
    const orderOne = recordFalsification({ spec: spec('LOG', 'LINEAR'), scope: scopeA(), reusableAs: 'VARIANT_ONLY', evidence, campaignId: 'campaign-A', round: 1, observationIds: ['a1'] });
    resetFalsifiedModelRegistryForTests();
    const reordered: ModelSpec = { id: 'reordered', terms: [{ basis: 'LINEAR' }, { basis: 'LOG' }], lineage: null };
    const orderTwo = recordFalsification({ spec: reordered, scope: scopeA(), reusableAs: 'VARIANT_ONLY', evidence: falsifiedHypothesis('f1c-2'), campaignId: 'campaign-A', round: 1, observationIds: ['a1'] });
    expect(orderTwo.modelFingerprint).toBe(orderOne.modelFingerprint);
    expect(orderTwo.modelId).toBe(orderOne.modelId);
  });
});
