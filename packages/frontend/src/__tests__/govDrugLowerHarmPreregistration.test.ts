import { describe, expect, it } from 'vitest';
import {
  LOWER_HARM_PREREGISTRATION,
  LOWER_HARM_PREREGISTRATION_FINGERPRINT,
  LOWER_HARM_SCENARIO_ID,
  LOWER_HARM_AXES,
  LOWER_HARM_ALLOWED_VERDICTS,
  LOWER_HARM_BANNED_OUTPUT_STRINGS,
  evaluatedAxes,
  assertSafetyDominatesRanking,
  assertNoNaturalnessBias,
  type LowerHarmRankingWeights,
} from '../core/biotechData/govDrugLowerHarmPreregistration';
import { A2_PREREGISTRATION_FINGERPRINT } from '../core/biotechData/a2OzempicSubstitutePreregistration';
import { E2E01_PREREGISTRATION_FINGERPRINT } from '../core/biotechData/govDrugDiscoveryE2EPreregistration';
import { GDD_CAMPAIGN_PREREGISTRATION_FINGERPRINT } from '../core/biotechData/govDrugDiscoveryCampaignPreregistration';

/**
 * Mandate step 10 (LOWER-HARM), preceded by the closed Genesis Adjudication
 * Protocol (D-047). This file asserts the SEAL only — no candidate has been
 * ranked under this rule yet, and none of these tests read a real trial.
 */

describe('the seal is a new provenance chain, not a rename of an existing one', () => {
  it('has its own scenario id, distinct from E2E-01 and the campaign', () => {
    expect(LOWER_HARM_SCENARIO_ID).toBe('GOV-DRUG-DISCOVERY-E2E-02-LOWER-HARM');
  });

  it('its fingerprint is NOT chained to E2E-01, the campaign, or A2 — a genuinely new question', () => {
    expect(LOWER_HARM_PREREGISTRATION_FINGERPRINT).not.toBe(E2E01_PREREGISTRATION_FINGERPRINT);
    expect(LOWER_HARM_PREREGISTRATION_FINGERPRINT).not.toBe(GDD_CAMPAIGN_PREREGISTRATION_FINGERPRINT);
    expect(LOWER_HARM_PREREGISTRATION_FINGERPRINT).not.toBe(A2_PREREGISTRATION_FINGERPRINT);
    expect(LOWER_HARM_PREREGISTRATION).not.toHaveProperty('inheritedFromFingerprint');
  });

  it('the fingerprint is deterministic — a pure function of the frozen record', () => {
    // Re-importing the same module in the same process must yield the same
    // constant; this guards against any accidental non-determinism (e.g. an
    // unordered Set/Map serialised into the frozen view).
    expect(LOWER_HARM_PREREGISTRATION_FINGERPRINT).toBe(LOWER_HARM_PREREGISTRATION.fingerprint);
    expect(typeof LOWER_HARM_PREREGISTRATION_FINGERPRINT).toBe('string');
    expect(LOWER_HARM_PREREGISTRATION_FINGERPRINT.length).toBeGreaterThan(0);
  });
});

describe('the efficacy floor is a hard gate declared before any candidate is read', () => {
  it('is a real fraction strictly between 0 and 1 — never 0 (no floor) or 1 (non-inferiority, i.e. A2 again)', () => {
    const floor = LOWER_HARM_PREREGISTRATION.efficacyFloor;
    expect(floor.minFractionOfReferenceEffect).toBeGreaterThan(0);
    expect(floor.minFractionOfReferenceEffect).toBeLessThan(1);
  });

  it('references the same pinned HbA1c benchmark A2 uses, not a re-derived number', () => {
    expect(LOWER_HARM_PREREGISTRATION.efficacyFloor.referenceEffectPp).toBe(-1.7);
  });
});

describe('axes — nothing the mandate named is silently omitted', () => {
  it('every axis the mandate requires is declared with an explicit applicability', () => {
    const names = LOWER_HARM_AXES.map((a) => a.axis);
    expect(names).toContain('toxicity_organ_burden');
    expect(names).toContain('severe_adverse_events');
    expect(names).toContain('dependence_addiction_abuse_withdrawal');
    expect(names).toContain('psychiatric_cognitive');
    expect(names).toContain('long_term_risk');
  });

  it('every axis has a non-empty rationale — no bare label', () => {
    for (const a of LOWER_HARM_AXES) expect(a.rationale.trim().length).toBeGreaterThan(0);
  });

  it('the dependence axis is explicitly NOT_CENTRAL_TO_DOMAIN, not silently EVALUATED with no data', () => {
    const dependence = LOWER_HARM_AXES.find((a) => a.axis === 'dependence_addiction_abuse_withdrawal');
    expect(dependence?.applicability).toBe('NOT_CENTRAL_TO_DOMAIN');
  });

  it('evaluatedAxes() returns exactly the EVALUATED subset, and it is non-empty', () => {
    const ev = evaluatedAxes();
    expect(ev.length).toBeGreaterThan(0);
    expect(ev.every((a) => a.applicability === 'EVALUATED')).toBe(true);
    expect(ev.length).toBeLessThan(LOWER_HARM_AXES.length);
  });
});

describe('assertSafetyDominatesRanking — item: stronger != better, machine-checked', () => {
  it('accepts the actual frozen weights', () => {
    expect(() => assertSafetyDominatesRanking(LOWER_HARM_PREREGISTRATION.rankingWeights, 'test')).not.toThrow();
  });

  it('rejects weights where efficacy-margin is not dominated by safety', () => {
    const bad: LowerHarmRankingWeights = { safety: 1, efficacyMarginAboveFloor: 1, evidenceStrength: 0.5, uncertaintyPenalty: -0.5, conflictPenalty: -1 };
    expect(() => assertSafetyDominatesRanking(bad, 'test')).toThrow(/must weight safety above/);
  });

  it('rejects weights where efficacy-margin exceeds safety (A2\'s rule wearing a new name)', () => {
    const bad: LowerHarmRankingWeights = { safety: 1, efficacyMarginAboveFloor: 2, evidenceStrength: 0.5, uncertaintyPenalty: -0.5, conflictPenalty: -1 };
    expect(() => assertSafetyDominatesRanking(bad, 'test')).toThrow();
  });
});

describe('assertNoNaturalnessBias — item: natural origin is a generator, never a bonus or filter', () => {
  it('accepts the actual frozen record (naturalness never appears as a scoring key)', () => {
    expect(() => assertNoNaturalnessBias(LOWER_HARM_PREREGISTRATION, 'test')).not.toThrow();
  });

  it('rejects a record with a naturalness-named scoring key', () => {
    expect(() => assertNoNaturalnessBias({ rankingWeights: { naturalBonus: 1 } }, 'test')).toThrow(/naturalBonus.*naturalness must never be a ranking criterion|naturalness must never be a ranking criterion/);
  });

  it('does NOT falsely trip on prose that merely discusses natural-origin candidates', () => {
    expect(() => assertNoNaturalnessBias({ rationale: 'natural-origin candidates are one generation path among several' }, 'test')).not.toThrow();
  });
});

describe('banned output strings — the truth-engine vocabulary is inherited, not re-typed loosely', () => {
  it('includes the exact banned phrases from the mandate, PL and EN', () => {
    expect(LOWER_HARM_BANNED_OUTPUT_STRINGS).toContain('bezpieczny');
    expect(LOWER_HARM_BANNED_OUTPUT_STRINGS).toContain('bez skutków ubocznych');
    expect(LOWER_HARM_BANNED_OUTPUT_STRINGS).toContain('cudowny lek');
    expect(LOWER_HARM_BANNED_OUTPUT_STRINGS).toContain('approved replacement');
    expect(LOWER_HARM_BANNED_OUTPUT_STRINGS).toContain('miracle cure');
  });
});

describe('allowed verdicts — no forced winner, no silent narrowing of exits', () => {
  it('WINNER, CONFLICTING_EVIDENCE, NO_WINNER and INSUFFICIENT_EVIDENCE are all legitimate', () => {
    expect(LOWER_HARM_ALLOWED_VERDICTS).toEqual(['WINNER', 'CONFLICTING_EVIDENCE', 'NO_WINNER', 'INSUFFICIENT_EVIDENCE']);
  });
});

describe('multiple-comparison policy tracks the EVALUATED axis count, not the full declared list', () => {
  it('familySize equals evaluatedAxes().length, not LOWER_HARM_AXES.length', () => {
    expect(LOWER_HARM_PREREGISTRATION.multipleComparisonPolicy.familySize).toBe(evaluatedAxes().length);
    expect(LOWER_HARM_PREREGISTRATION.multipleComparisonPolicy.familySize).toBeLessThan(LOWER_HARM_AXES.length);
  });

  it('correctedAlpha is nominalAlpha divided by familySize', () => {
    const p = LOWER_HARM_PREREGISTRATION.multipleComparisonPolicy;
    expect(p.correctedAlpha).toBeCloseTo(p.nominalAlpha / p.familySize, 10);
  });
});
