import { describe, expect, it } from 'vitest';
import {
  E2E01_PREREGISTRATION,
  E2E01_PREREGISTRATION_FINGERPRINT,
  E2E01_GENERATION_METHOD,
  E2E01_TIER_CRITERIA,
  E2E01_ALLOWED_OUTCOMES,
  E2E01_FALSIFICATION_ATTACKS,
  E2E01_BANNED_OUTPUT_STRINGS,
  E2E01_REQUIRED_OUTPUT_FIELDS,
  E2E01_PRIOR_RUN_FINGERPRINTS,
  E2E01_SCENARIO_ID,
} from '../core/biotechData/govDrugDiscoveryE2EPreregistration';
import { A1_PREREGISTRATION } from '../core/biotechData/a1Glp1Preregistration';
import { A2_PREREGISTRATION } from '../core/biotechData/a2OzempicSubstitutePreregistration';
import { A3_PREREGISTRATION } from '../core/biotechData/a3GovernmentPreregistration';

/**
 * Sealed BEFORE scripts/fetch-gov-drug-discovery-generated-space.mjs pulled
 * the generated candidate space, and before any funnel stage was run over
 * it — same discipline as every prior anchor in this repo.
 */
describe('GOV-DRUG-DISCOVERY-E2E-01 preregistration — sealed before the generated space was pulled', () => {
  it('fingerprint is exactly this literal', () => {
    expect(E2E01_PREREGISTRATION_FINGERPRINT).toBe('f528c881');
    expect(E2E01_PREREGISTRATION.fingerprint).toBe('f528c881');
    expect(E2E01_SCENARIO_ID).toBe('GOV-DRUG-DISCOVERY-E2E-01');
  });

  it('the T1 generation thresholds are fixed in advance, not fitted to whatever the pull returned', () => {
    expect(E2E01_GENERATION_METHOD.minimumGeneratedSetSize).toBe(60);
    expect(E2E01_GENERATION_METHOD.minimumOutsidePinnedSetSize).toBe(20);
    expect(E2E01_GENERATION_METHOD.generatedByLabel).toBe('GENERATOR');
    expect(E2E01_GENERATION_METHOD.noDrugNameQuery).toBe(true);
    expect(E2E01_GENERATION_METHOD.requiredProvenanceFields).toEqual(['source', 'identifier', 'retrievalTime', 'hash']);
  });

  it('generation queries mechanism targets, never a drug name, and excludes the reference drug from its own candidate space', () => {
    expect(E2E01_GENERATION_METHOD.targetChemblIds).toEqual(['CHEMBL1784', 'CHEMBL4383', 'CHEMBL1985']);
    expect(E2E01_GENERATION_METHOD.excludeMoleculeIds).toEqual(['CHEMBL2108724']);
  });

  it('tier criteria assert REDUCTION, not particular stage counts', () => {
    expect(E2E01_TIER_CRITERIA.assertsReductionNotCounts).toBe(true);
    expect(E2E01_TIER_CRITERIA.tier1.dataAvailabilityMinMaxPhase).toBe(2);
    expect(E2E01_TIER_CRITERIA.top3Size).toBe(3);
    expect(E2E01_TIER_CRITERIA.tier2.efficacyEvidenceGate).toContain('NO_COMPARISON');
    expect(E2E01_TIER_CRITERIA.tier2.safetyEvidenceGate).toContain('risk ratio');
  });

  it('all six falsification attacks are named in advance', () => {
    expect(E2E01_FALSIFICATION_ATTACKS).toEqual([
      'EFFICACY', 'SAFETY', 'SUBGROUP', 'LONG_TERM', 'EXPOSURE_OR_PUBLICATION_BIAS', 'CONFLICTING_TRIALS',
    ]);
  });

  it('four of the five allowed outcomes end WITHOUT a winner — an honest non-winner is a permitted ending', () => {
    expect(E2E01_ALLOWED_OUTCOMES).toEqual(['WINNER', 'NO_WINNER', 'NO_SAFE_WINNER', 'INSUFFICIENT_EVIDENCE', 'CONFLICTING_EVIDENCE']);
    expect(E2E01_ALLOWED_OUTCOMES.filter((o) => o !== 'WINNER')).toHaveLength(4);
  });

  it('the winner rule requires surviving falsification, not merely leading a ranking', () => {
    expect(E2E01_PREREGISTRATION.winnerRules).toContain('survives every one of E2E01_FALSIFICATION_ATTACKS');
    expect(E2E01_PREREGISTRATION.winnerRules).toContain('never produced merely because the question asked for one');
  });

  it('a recipe is gated on WINNER and can never carry a dose or an operational route', () => {
    expect(E2E01_PREREGISTRATION.recipeRules).toContain('if and only if outcome === WINNER');
    expect(E2E01_PREREGISTRATION.recipeRules).toContain('never contains a dose');
  });

  it('the banned output strings are fixed, and cover both Polish spellings', () => {
    expect(E2E01_BANNED_OUTPUT_STRINGS).toContain('bezpieczny');
    expect(E2E01_BANNED_OUTPUT_STRINGS).toContain('cudowny lek');
    expect(E2E01_BANNED_OUTPUT_STRINGS).toContain('approved replacement');
    expect(E2E01_BANNED_OUTPUT_STRINGS).toContain('bez skutków ubocznych');
    expect(E2E01_BANNED_OUTPUT_STRINGS).toContain('bez skutkow ubocznych');
  });

  it('exactly 18 output fields are required, and researchRecipe is deliberately NOT one of them', () => {
    expect(E2E01_REQUIRED_OUTPUT_FIELDS).toHaveLength(18);
    expect(E2E01_REQUIRED_OUTPUT_FIELDS).not.toContain('researchRecipe');
    expect(E2E01_REQUIRED_OUTPUT_FIELDS).toContain('whyWinnerSurvivedFalsification');
    expect(E2E01_REQUIRED_OUTPUT_FIELDS).toContain('replayFingerprint');
  });

  it('anti-HARK lineage records the exact upstream sealed fingerprints this scenario stands on', () => {
    expect(E2E01_PRIOR_RUN_FINGERPRINTS.a1Glp1).toBe(A1_PREREGISTRATION.fingerprint);
    expect(E2E01_PRIOR_RUN_FINGERPRINTS.a2OzempicSubstitute).toBe(A2_PREREGISTRATION.fingerprint);
    expect(E2E01_PRIOR_RUN_FINGERPRINTS.a3Government).toBe(A3_PREREGISTRATION.fingerprint);
    expect(E2E01_PRIOR_RUN_FINGERPRINTS).toEqual({ a1Glp1: '5882c619', a2OzempicSubstitute: '4642088a', a3Government: '2b32c0a8' });
  });

  it('the existential safety veto is REUSED from A2 by reference, not restated with different numbers', () => {
    expect(E2E01_PREREGISTRATION.existentialSafetyVetoFrom).toBe('A2_PREREGISTRATION.existentialSafetyVeto');
    expect(E2E01_GENERATION_METHOD.assayInclusionRuleFrom).toBe('A2_PREREGISTRATION.candidateInclusion.assay');
  });
});
