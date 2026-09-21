import { describe, expect, it } from 'vitest';
import {
  A3_PREREGISTRATION,
  A3_PREREGISTRATION_FINGERPRINT,
  A3_GOVERNMENT_WEIGHTS,
  A3_POLICY_DIMENSIONS_WITHOUT_SOURCE,
  A3_SAFETY_LABELS,
  A3_ALLOWED_RECOMMENDATIONS,
  A3_TRIAL_CONDITIONS_SOURCE,
} from '../core/biotechData/a3GovernmentPreregistration';

/**
 * Sealed BEFORE scripts/fetch-a3-trial-conditions.mjs's output was read
 * anywhere in the analysis code, and BEFORE any government recommendation
 * was computed for any population — same discipline as
 * a1Glp1Preregistration.test.ts / a2OzempicSubstitutePreregistration.test.ts.
 * A later change to any sealed field is a visible, reviewed diff via this
 * literal, not a silent edit.
 */
describe('A3 government preregistration — sealed before data pull', () => {
  it('fingerprint is exactly this literal', () => {
    expect(A3_PREREGISTRATION_FINGERPRINT).toBe('2b32c0a8');
    expect(A3_PREREGISTRATION.fingerprint).toBe('2b32c0a8');
  });

  it('the government question is fixed', () => {
    expect(A3_PREREGISTRATION.governmentQuestion).toContain('semaglutydu');
  });

  it('the population-condition patterns handle both real word orders and both "2"/"II" spellings seen in the pinned data', () => {
    expect(A3_PREREGISTRATION.populationConditionPatterns).toEqual({
      T2D: 'diabetes.{0,20}type\\s*(2|ii)\\b|type\\s*(2|ii)\\b.{0,20}diabetes',
      OBESITY: 'obesity',
    });
  });

  it('trial conditions are sourced from a real ClinicalTrials.gov field over the EXACT A2 NCT id set, not a new search', () => {
    expect(A3_TRIAL_CONDITIONS_SOURCE).toEqual({
      api: 'ClinicalTrials.gov API v2',
      endpoint: '/studies/{nctId}?fields=NCTId,Condition',
      field: 'protocolSection.conditionsModule.conditions',
      nctIdCount: 31,
      reusesA2NctIdSet: true,
    });
  });

  it('the government weights name every §9 dimension, including the ones without an integrated real source', () => {
    expect(A3_GOVERNMENT_WEIGHTS).toEqual({
      efficacy: 1,
      safety: 1,
      evidenceStrength: 0.5,
      uncertaintyPenalty: -0.5,
      conflictPenalty: -1,
      cost: 0.5,
      availability: 0.5,
      scalability: 0.3,
      supplySecurity: 0.3,
      manufacturingFeasibility: 0.3,
      populationCoverage: 0.5,
    });
  });

  it('the scientific weights (efficacy/safety/evidenceStrength/uncertaintyPenalty/conflictPenalty) match A2 exactly — same evidence, same scientific weighting', () => {
    expect(A3_GOVERNMENT_WEIGHTS.efficacy).toBe(1);
    expect(A3_GOVERNMENT_WEIGHTS.safety).toBe(1);
    expect(A3_GOVERNMENT_WEIGHTS.evidenceStrength).toBe(0.5);
    expect(A3_GOVERNMENT_WEIGHTS.uncertaintyPenalty).toBe(-0.5);
    expect(A3_GOVERNMENT_WEIGHTS.conflictPenalty).toBe(-1);
  });

  it('policy dimensions without an integrated real source are named, not hidden', () => {
    expect(A3_POLICY_DIMENSIONS_WITHOUT_SOURCE).toEqual([
      'cost', 'availability', 'scalability', 'supplySecurity', 'manufacturingFeasibility', 'populationCoverage',
    ]);
  });

  it('the safety-language vocabulary never includes the raw word "safe" alone', () => {
    expect(A3_SAFETY_LABELS).toEqual(['SAFE_RELATIVE_TO_X', 'LOWER_OBSERVED_RISK', 'NO_SIGNAL_DETECTED', 'INSUFFICIENT_SAFETY_EVIDENCE']);
    for (const label of A3_SAFETY_LABELS) expect(label.toLowerCase()).not.toBe('safe');
  });

  it('the 6 allowed recommendation labels are exactly A2\'s verdict vocabulary, not a rosier or gloomier one', () => {
    expect(A3_ALLOWED_RECOMMENDATIONS).toEqual([
      'BEST_SUPPORTED_CANDIDATE', 'PROMISING_BUT_UNCERTAIN', 'NO_SUPERIOR_CANDIDATE',
      'NO_SAFE_SUPERIOR_CANDIDATE', 'CONFLICTING_EVIDENCE', 'INSUFFICIENT_EVIDENCE',
    ]);
  });

  it('AnswerRecord vs ActionRecord separation is stated and names practicalCandidateGate.ts reuse', () => {
    expect(A3_PREREGISTRATION.answerRecordVsActionRecord).toContain('practicalCandidateGate.ts');
    expect(A3_PREREGISTRATION.answerRecordVsActionRecord).toContain('TRUTH');
  });
});
