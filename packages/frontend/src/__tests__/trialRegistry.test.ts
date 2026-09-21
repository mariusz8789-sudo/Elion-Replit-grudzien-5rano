import { describe, expect, it } from 'vitest';
import {
  createTrialRegistry,
  recordTrial,
  listTrials,
  countTrials,
  correctForMultiplicity,
  assertRegistryComplete,
  registryFingerprint,
  type TrialInput,
} from '../core/agent/trialRegistry';

const CANDIDATE: TrialInput = {
  kind: 'CANDIDATE_EVALUATION',
  subject: 'CHEMBL1201866',
  stage: 'TIER_1',
  outcome: 'ELIMINATED',
  reason: 'No qualifying activity at any incretin-axis target.',
};

describe('TrialRegistry — the assertions that make it worth having', () => {
  it('REJECTS a trial with an empty reason: an attempt nobody can audit is not a recorded attempt', () => {
    const r = createTrialRegistry('test');
    expect(() => recordTrial(r, { ...CANDIDATE, reason: '   ' })).toThrow(/reason/i);
    expect(listTrials(r).length).toBe(0);
  });

  it('REJECTS a trial with an empty subject', () => {
    const r = createTrialRegistry('test');
    expect(() => recordTrial(r, { ...CANDIDATE, subject: '' })).toThrow(/subject/i);
  });

  it('is append-only: the returned list is a copy, and mutating it does not touch the registry', () => {
    const r = createTrialRegistry('test');
    recordTrial(r, CANDIDATE);
    const snapshot = listTrials(r) as unknown as TrialInput[];
    snapshot.length = 0;
    expect(listTrials(r).length).toBe(1);
  });

  it('gives every attempt a distinct id even when the SAME subject is tried twice', () => {
    const r = createTrialRegistry('test');
    const a = recordTrial(r, CANDIDATE);
    const b = recordTrial(r, { ...CANDIDATE, stage: 'TIER_2' });
    expect(a.trialId).not.toBe(b.trialId);
    expect(a.ordinal).toBe(1);
    expect(b.ordinal).toBe(2);
  });
});

describe('completeness — the registry must not silently miss an attempt', () => {
  it('THROWS when the process made more attempts than the registry recorded (the silent-skip failure mode)', () => {
    const r = createTrialRegistry('test');
    recordTrial(r, CANDIDATE);
    expect(() => assertRegistryComplete(r, 3)).toThrow(/3.*recorded 1|recorded 1.*3/i);
  });

  it('THROWS when more was recorded than the process claims to have attempted (the double-count failure mode)', () => {
    const r = createTrialRegistry('test');
    recordTrial(r, CANDIDATE);
    recordTrial(r, { ...CANDIDATE, stage: 'TIER_2' });
    expect(() => assertRegistryComplete(r, 1)).toThrow();
  });

  it('passes when the counts agree', () => {
    const r = createTrialRegistry('test');
    recordTrial(r, CANDIDATE);
    recordTrial(r, { ...CANDIDATE, stage: 'TIER_2' });
    expect(() => assertRegistryComplete(r, 2)).not.toThrow();
  });

  it('counts an ABANDONED branch as a real attempt — abandoning is not the same as never trying', () => {
    const r = createTrialRegistry('test');
    recordTrial(r, { kind: 'ABANDONED_BRANCH', subject: 'dual-agonist branch', stage: 'EXPLORATION', outcome: 'ABANDONED', reason: 'No molecule in the branch reached clinical phase 2.' });
    expect(countTrials(r)).toBe(1);
    expect(() => assertRegistryComplete(r, 1)).not.toThrow();
  });
});

describe('multiplicity correction — must be driven by the registry, never by a hand-passed number', () => {
  it('THROWS when nothing was counted: an alpha correction over zero trials is meaningless, not 1.0', () => {
    const r = createTrialRegistry('test');
    expect(() => correctForMultiplicity(r, 0.05)).toThrow(/no trial/i);
  });

  it('divides the nominal alpha by the number of recorded trials', () => {
    const r = createTrialRegistry('test');
    for (let i = 0; i < 4; i += 1) recordTrial(r, { ...CANDIDATE, subject: `CHEMBL${i}` });
    const c = correctForMultiplicity(r, 0.05);
    expect(c.method).toBe('BONFERRONI');
    expect(c.trialsCounted).toBe(4);
    expect(c.correctedAlpha).toBeCloseTo(0.0125, 10);
  });

  it('can be restricted to specific trial kinds, and reports which kinds it counted', () => {
    const r = createTrialRegistry('test');
    recordTrial(r, CANDIDATE);
    recordTrial(r, { kind: 'CORRELATION_PAIR', subject: 'hba1c~weight', stage: 'SCAN', outcome: 'INCONCLUSIVE', reason: 'Correlation present but fully explained by a declared confounder.' });
    recordTrial(r, { kind: 'CORRELATION_PAIR', subject: 'hba1c~bmi', stage: 'SCAN', outcome: 'ELIMINATED', reason: 'Below the corrected alpha.' });
    const c = correctForMultiplicity(r, 0.05, ['CORRELATION_PAIR']);
    expect(c.trialsCounted).toBe(2);
    expect(c.correctedAlpha).toBeCloseTo(0.025, 10);
    expect(c.countedKinds).toEqual(['CORRELATION_PAIR']);
  });

  it('a correlation scan that widens its trial count gets a STRICTER alpha — the point of the mechanism', () => {
    const few = createTrialRegistry('few');
    const many = createTrialRegistry('many');
    for (let i = 0; i < 2; i += 1) recordTrial(few, { ...CANDIDATE, subject: `s${i}` });
    for (let i = 0; i < 200; i += 1) recordTrial(many, { ...CANDIDATE, subject: `s${i}` });
    expect(correctForMultiplicity(many, 0.05).correctedAlpha).toBeLessThan(correctForMultiplicity(few, 0.05).correctedAlpha);
  });
});

describe('fingerprint / replay', () => {
  it('is deterministic for the same recorded attempts', () => {
    const a = createTrialRegistry('x');
    const b = createTrialRegistry('x');
    recordTrial(a, CANDIDATE);
    recordTrial(b, CANDIDATE);
    expect(registryFingerprint(a)).toBe(registryFingerprint(b));
  });

  it('EXCLUDES caller-supplied wall-clock time, so two runs of the same process replay identically', () => {
    const a = createTrialRegistry('x');
    const b = createTrialRegistry('x');
    recordTrial(a, { ...CANDIDATE, recordedAt: 1_000 });
    recordTrial(b, { ...CANDIDATE, recordedAt: 9_999_999 });
    expect(registryFingerprint(a)).toBe(registryFingerprint(b));
  });

  it('CHANGES when a different attempt is recorded — it is not a constant', () => {
    const a = createTrialRegistry('x');
    const b = createTrialRegistry('x');
    recordTrial(a, CANDIDATE);
    recordTrial(b, { ...CANDIDATE, outcome: 'SURVIVED', reason: 'Reached Tier-2.' });
    expect(registryFingerprint(a)).not.toBe(registryFingerprint(b));
  });
});
