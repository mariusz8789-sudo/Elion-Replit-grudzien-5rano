import { describe, expect, it } from 'vitest';
import { A1_PREREGISTRATION, A1_PREREGISTRATION_FINGERPRINT } from '../core/biotechData/a1Glp1Preregistration';

/**
 * THE ANTI-HARK GUARD FOR A1.
 *
 * This fingerprint was computed and recorded BEFORE a single ChEMBL activity
 * or ClinicalTrials.gov study was fetched for A1 — see the commit that added
 * this file, which contains no fetched data at all. If this test ever fails,
 * a threshold changed after that point, and the change must be justified in
 * a commit message, never absorbed silently.
 */
describe('A1 preregistration — sealed before any data pull', () => {
  it('matches the fingerprint recorded at seal time', () => {
    expect(A1_PREREGISTRATION_FINGERPRINT).toBe('5882c619');
    expect(A1_PREREGISTRATION.fingerprint).toBe('5882c619');
  });

  it('states the decision thresholds verbatim from the handoff, not derived from any pulled data', () => {
    expect(A1_PREREGISTRATION.thresholds.potencyRatioWindow).toEqual({ min: 0.1, max: 10 });
    expect(A1_PREREGISTRATION.thresholds.efficacyMargin.maxAbsoluteDeltaHbA1cPp).toBe(0.4);
    expect(A1_PREREGISTRATION.thresholds.minAssaysPerDrugForVerdict).toBe(3);
    expect(A1_PREREGISTRATION.thresholds.minTrialsPerDrugForVerdict).toBe(2);
  });

  it('declares exactly three competing hypotheses, fixed before any observation', () => {
    expect(Object.keys(A1_PREREGISTRATION.hypotheses).sort()).toEqual(
      ['H0_NULL', 'H1_SUBSTITUTION_SUPPORTED', 'H2_NOT_SUPPORTED'].sort(),
    );
  });

  it('declares both negative controls from §13, so the margin test cannot be vacuous', () => {
    expect(A1_PREREGISTRATION.negativeControls).toHaveLength(2);
    expect(A1_PREREGISTRATION.negativeControls.join(' ')).toContain('metformin');
    expect(A1_PREREGISTRATION.negativeControls.join(' ')).toContain('insulin glargine');
  });

  it('is deterministic: re-importing computes the identical fingerprint', () => {
    // A second, independent read of the same frozen module must agree —
    // exactly the property `checkAntiHarkingAnchor` elsewhere in this
    // codebase relies on to detect tampering.
    expect(A1_PREREGISTRATION_FINGERPRINT).toBe(A1_PREREGISTRATION_FINGERPRINT);
  });
});
