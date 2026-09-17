import { describe, expect, it } from 'vitest';
import {
  A2_ALLOWED_VERDICTS,
  A2_MECHANISM_TARGETS,
  A2_PREREGISTRATION,
  A2_PREREGISTRATION_FINGERPRINT,
  A2_REFERENCE_DRUG,
  A2_SAFETY_CATEGORIES,
} from '../core/biotechData/a2OzempicSubstitutePreregistration';

/**
 * THE ANTI-HARK GUARD FOR A2.
 *
 * This fingerprint was computed and recorded BEFORE a single candidate
 * molecule's activity or ClinicalTrials.gov trial was fetched — see the
 * commit that adds this file, which contains no fetched candidate data at
 * all (only recon confirming API shapes, never any analysis result). If
 * this test ever fails, a threshold changed after that point, and the
 * change must be justified in a commit message, never absorbed silently.
 */
describe('A2 preregistration — sealed before any candidate data pull', () => {
  it('matches the fingerprint recorded at seal time', () => {
    expect(A2_PREREGISTRATION_FINGERPRINT).toBe('4642088a');
    expect(A2_PREREGISTRATION.fingerprint).toBe('4642088a');
  });

  it('names semaglutide as the reference drug, with the real A1-pinned trial reused, not re-derived', () => {
    expect(A2_REFERENCE_DRUG.moleculeChemblId).toBe('CHEMBL2108724');
    expect(A2_REFERENCE_DRUG.referenceTrialNctId).toBe('NCT03191396');
  });

  it('fixes all three real incretin-axis mechanism targets, confirmed by recon', () => {
    expect(A2_MECHANISM_TARGETS.glp1r.chemblId).toBe('CHEMBL1784');
    expect(A2_MECHANISM_TARGETS.gipr.chemblId).toBe('CHEMBL4383');
    expect(A2_MECHANISM_TARGETS.gcgr.chemblId).toBe('CHEMBL1985');
  });

  it('gates candidates on real clinical development (max_phase) and real posted trial evidence, not popularity', () => {
    expect(A2_PREREGISTRATION.candidateInclusion.minMaxPhase).toBe(2);
    expect(A2_PREREGISTRATION.candidateInclusion.excludeMoleculeIds).toContain('CHEMBL2108724');
    expect(A2_PREREGISTRATION.candidateInclusion.trialEvidence.minArmSizeForComparison).toBe(30);
  });

  it('fixes the efficacy margin at the same regulatory convention A1 used, not re-derived from A2 data', () => {
    expect(A2_PREREGISTRATION.effectSizeThresholds.efficacyComparableMarginPp).toBe(0.4);
  });

  it('declares 7 named safety categories plus the structural serious-AE veto, with a fixed Bonferroni family size', () => {
    expect(A2_SAFETY_CATEGORIES).toHaveLength(7);
    expect(A2_PREREGISTRATION.multipleComparisonPolicy.familySize).toBe(7);
    expect(A2_PREREGISTRATION.multipleComparisonPolicy.correctedAlpha).toBeCloseTo(0.05 / 7, 10);
  });

  it('declares all 6 allowed final verdicts, so a run cannot narrow its own exits after seeing evidence', () => {
    expect(A2_ALLOWED_VERDICTS).toHaveLength(6);
    expect(A2_ALLOWED_VERDICTS).toEqual([
      'BEST_SUPPORTED_CANDIDATE',
      'PROMISING_BUT_UNCERTAIN',
      'NO_SUPERIOR_CANDIDATE',
      'NO_SAFE_SUPERIOR_CANDIDATE',
      'CONFLICTING_EVIDENCE',
      'INSUFFICIENT_EVIDENCE',
    ]);
  });

  it('states the existential safety veto in words, matched by the analysis code', () => {
    expect(A2_PREREGISTRATION.existentialSafetyVeto).toContain('never BEST_SUPPORTED_CANDIDATE');
  });

  it('is deterministic: re-importing computes the identical fingerprint', () => {
    expect(A2_PREREGISTRATION_FINGERPRINT).toBe(A2_PREREGISTRATION_FINGERPRINT);
  });
});
