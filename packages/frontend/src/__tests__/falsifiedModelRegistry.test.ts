import { beforeEach, describe, expect, it } from 'vitest';
import { createHypothesis, updateConfidence, type Hypothesis } from '../core/experimentFabric/beliefRevision';
import type { FalsificationCriterion } from '../core/experimentFabric/scientificDiscovery';
import type { ModelSpec } from '../core/agent/modelSpace';
import {
  consultFalsifiedModelRegistry,
  listFalsifiedModelRegistryEntries,
  overrideFalsification,
  recordFalsification,
  resetFalsifiedModelRegistryForTests,
} from '../core/agent/falsifiedModelRegistry';

function criterion(metric: string): FalsificationCriterion {
  return { metric, relation: 'less-than', rationale: 'test fixture' };
}

function spec(...bases: ('LINEAR' | 'LOG' | 'RECIPROCAL' | 'CONSTANT')[]): ModelSpec {
  return { id: 'test', terms: bases.map((basis) => ({ basis })), lineage: null };
}

function falsifiedHypothesis(id: string): Hypothesis {
  const h = createHypothesis(id, criterion(id), 0.5);
  return updateConfidence(h, 'FALSIFIED_WITHIN_PROTOCOL', 0.9, 'Round 1: decisively beaten by a rival model.', 1);
}

function supportedHypothesis(id: string): Hypothesis {
  const h = createHypothesis(id, criterion(id), 0.5);
  return updateConfidence(h, 'SUPPORTED_WITHIN_PROTOCOL', 0.9, 'Round 2: new observations vindicate the model.', 2);
}

beforeEach(() => {
  resetFalsifiedModelRegistryForTests();
});

describe('falsifiedModelRegistry — FALSIFIED only from a real epistemic path', () => {
  it('refuses to record a falsification whose evidence Hypothesis is not FALSIFIED_WITHIN_PROTOCOL', () => {
    const active = createHypothesis('h1', criterion('h1'), 0.5);
    expect(() => recordFalsification({
      labId: 'lab-a', spec: spec('LINEAR'), scope: 'VARIANT_ONLY', evidence: active, evidenceRoundFingerprint: 'round-1',
    })).toThrow(/FALSIFIED_WITHIN_PROTOCOL/);
  });

  it('refuses to record a falsification from a SUPPORTED hypothesis', () => {
    const supported = supportedHypothesis('h2');
    expect(() => recordFalsification({
      labId: 'lab-a', spec: spec('LINEAR'), scope: 'VARIANT_ONLY', evidence: supported, evidenceRoundFingerprint: 'round-1',
    })).toThrow(/FALSIFIED_WITHIN_PROTOCOL/);
  });

  it('accepts a real FALSIFIED_WITHIN_PROTOCOL hypothesis and records the reason from its own history', () => {
    const evidence = falsifiedHypothesis('h3');
    const entry = recordFalsification({ labId: 'lab-a', spec: spec('LINEAR'), scope: 'VARIANT_ONLY', evidence, evidenceRoundFingerprint: 'round-1' });
    expect(entry.reason).toContain('decisively beaten');
    expect(entry.evidenceHypothesisId).toBe('h3');
    expect(entry.evidenceStatus).toBe('FALSIFIED_WITHIN_PROTOCOL');
  });

  it('requires componentBasis for scope COMPONENT', () => {
    const evidence = falsifiedHypothesis('h4');
    expect(() => recordFalsification({
      labId: 'lab-a', spec: spec('LOG'), scope: 'COMPONENT', evidence, evidenceRoundFingerprint: 'round-1',
    })).toThrow(/componentBasis/);
  });
});

describe('falsifiedModelRegistry — consultation before a model is emitted', () => {
  it('allows a model with no standing entry', () => {
    const result = consultFalsifiedModelRegistry('lab-a', spec('LINEAR'));
    expect(result.allowed).toBe(true);
  });

  it('VARIANT_ONLY blocks the exact model in the SAME lab only', () => {
    const evidence = falsifiedHypothesis('h5');
    recordFalsification({ labId: 'lab-a', spec: spec('LOG'), scope: 'VARIANT_ONLY', evidence, evidenceRoundFingerprint: 'round-1' });

    const sameLab = consultFalsifiedModelRegistry('lab-a', spec('LOG'));
    expect(sameLab.allowed).toBe(false);
    expect(sameLab.reason).toContain('VARIANT_ONLY');

    const differentLab = consultFalsifiedModelRegistry('lab-b', spec('LOG'));
    expect(differentLab.allowed).toBe(true);
  });

  it('NEVER blocks the exact model form across every laboratory', () => {
    const evidence = falsifiedHypothesis('h6');
    recordFalsification({ labId: 'lab-a', spec: spec('RECIPROCAL'), scope: 'NEVER', evidence, evidenceRoundFingerprint: 'round-1' });

    expect(consultFalsifiedModelRegistry('lab-a', spec('RECIPROCAL')).allowed).toBe(false);
    const elsewhere = consultFalsifiedModelRegistry('lab-z-completely-unrelated', spec('RECIPROCAL'));
    expect(elsewhere.allowed).toBe(false);
    expect(elsewhere.reason).toContain('NEVER');
  });

  it('COMPONENT blocks every model in the lab that still carries the implicated basis, regardless of the rest of its shape', () => {
    const evidence = falsifiedHypothesis('h7');
    recordFalsification({
      labId: 'lab-a', spec: spec('LOG', 'LINEAR'), scope: 'COMPONENT', componentBasis: 'LOG', evidence, evidenceRoundFingerprint: 'round-1',
    });

    expect(consultFalsifiedModelRegistry('lab-a', spec('LOG')).allowed).toBe(false);
    expect(consultFalsifiedModelRegistry('lab-a', spec('LOG', 'RECIPROCAL')).allowed).toBe(false);
    expect(consultFalsifiedModelRegistry('lab-a', spec('LINEAR')).allowed).toBe(true);
    expect(consultFalsifiedModelRegistry('lab-b', spec('LOG')).allowed).toBe(true);
  });
});

describe('falsifiedModelRegistry — append-only, explicit override with new evidence', () => {
  it('refuses to override when no standing falsification exists', () => {
    const newEvidence = supportedHypothesis('h8');
    expect(() => overrideFalsification({
      labId: 'lab-a', spec: spec('LINEAR'), newEvidence, evidenceRoundFingerprint: 'round-2', reason: 'no-op',
    })).toThrow(/no standing falsification/);
  });

  it('refuses to override using another FALSIFIED_WITHIN_PROTOCOL verdict as "new evidence"', () => {
    const first = falsifiedHypothesis('h9a');
    recordFalsification({ labId: 'lab-a', spec: spec('LINEAR'), scope: 'VARIANT_ONLY', evidence: first, evidenceRoundFingerprint: 'round-1' });
    const anotherFalsification = falsifiedHypothesis('h9b');
    expect(() => overrideFalsification({
      labId: 'lab-a', spec: spec('LINEAR'), newEvidence: anotherFalsification, evidenceRoundFingerprint: 'round-2', reason: 'bad override',
    })).toThrow(/must not itself be/);
  });

  it('a real override un-blocks consultation, and the ORIGINAL falsification entry is never mutated (append-only)', () => {
    const evidence = falsifiedHypothesis('h10');
    const original = recordFalsification({ labId: 'lab-a', spec: spec('LINEAR'), scope: 'VARIANT_ONLY', evidence, evidenceRoundFingerprint: 'round-1' });

    expect(consultFalsifiedModelRegistry('lab-a', spec('LINEAR')).allowed).toBe(false);

    const newEvidence = supportedHypothesis('h10-new');
    const overrideEntry = overrideFalsification({
      labId: 'lab-a', spec: spec('LINEAR'), newEvidence, evidenceRoundFingerprint: 'round-9', reason: 'A later campaign with tighter sigmas vindicated this model.',
    });

    expect(overrideEntry.kind).toBe('OVERRIDE');
    expect(overrideEntry.overridesEntryId).toBe(original.entryId);
    expect(consultFalsifiedModelRegistry('lab-a', spec('LINEAR')).allowed).toBe(true);

    // Append-only: the ORIGINAL falsification entry is still present in the
    // log, completely unchanged, sitting alongside the new override entry —
    // it was never mutated or removed.
    const entries = listFalsifiedModelRegistryEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual(original);
    expect(entries[1]).toEqual(overrideEntry);
  });

  it('a later re-falsification after an override is itself visible — the log keeps the whole history, not just the latest state', () => {
    const evidence = falsifiedHypothesis('h11');
    recordFalsification({ labId: 'lab-a', spec: spec('LINEAR'), scope: 'VARIANT_ONLY', evidence, evidenceRoundFingerprint: 'round-1' });
    overrideFalsification({ labId: 'lab-a', spec: spec('LINEAR'), newEvidence: supportedHypothesis('h11-new'), evidenceRoundFingerprint: 'round-2', reason: 'override' });
    expect(consultFalsifiedModelRegistry('lab-a', spec('LINEAR')).allowed).toBe(true);

    const reFalsified = falsifiedHypothesis('h11-again');
    recordFalsification({ labId: 'lab-a', spec: spec('LINEAR'), scope: 'VARIANT_ONLY', evidence: reFalsified, evidenceRoundFingerprint: 'round-3' });
    expect(consultFalsifiedModelRegistry('lab-a', spec('LINEAR')).allowed).toBe(false);
  });
});
