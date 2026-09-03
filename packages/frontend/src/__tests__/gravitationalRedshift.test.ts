import { describe, expect, it } from 'vitest';
import {
  POUND_REBKA_TOWER_HEIGHT_M,
  replayGravitationalRedshiftCase,
  runGravitationalRedshiftCase,
  saveGravitationalRedshiftCaseToMemory,
  surfaceGravity,
  toStandardScientificResult,
  weakFieldFractionalFrequencyShift,
} from '../core/discovery/physics/gravitationalRedshift';
import { PHYSICAL_CONSTANTS, SPEED_OF_LIGHT_M_PER_S } from '../core/discovery/physics/relativisticTimeDilation';

describe('gravitational redshift — pure formulas', () => {
  it('surfaceGravity refuses a non-positive radius', () => {
    expect(() => surfaceGravity(1, 0)).toThrow(/positive/);
    expect(() => surfaceGravity(1, -1)).toThrow(/positive/);
  });

  it('surfaceGravity derives ~9.8 m/s^2 for Earth from GM and R, not a memorised constant', () => {
    const g = surfaceGravity(PHYSICAL_CONSTANTS.earthGravitationalParameter!.value, PHYSICAL_CONSTANTS.earthEquatorialRadius!.value);
    expect(g).toBeGreaterThan(9.7);
    expect(g).toBeLessThan(9.9);
  });

  it('weakFieldFractionalFrequencyShift refuses a zero height', () => {
    expect(() => weakFieldFractionalFrequencyShift(9.8, 0, SPEED_OF_LIGHT_M_PER_S)).toThrow(/non-zero/);
  });

  it('weakFieldFractionalFrequencyShift is negative (redshift) for positive height climbing away from gravity', () => {
    const shift = weakFieldFractionalFrequencyShift(9.8, 22.5, SPEED_OF_LIGHT_M_PER_S);
    expect(shift).toBeLessThan(0);
  });

  it('weakFieldFractionalFrequencyShift is positive (blueshift) for a photon falling inward (negative height)', () => {
    const shift = weakFieldFractionalFrequencyShift(9.8, -22.5, SPEED_OF_LIGHT_M_PER_S);
    expect(shift).toBeGreaterThan(0);
  });
});

describe('gravitational redshift — the Pound-Rebka case, derived not fabricated', () => {
  it('predicts a REDSHIFT for light climbing the real tower height', () => {
    const result = runGravitationalRedshiftCase();
    expect(result.towerHeight).toBe(POUND_REBKA_TOWER_HEIGHT_M);
    expect(result.direction).toBe('REDSHIFT');
    expect(result.fractionalFrequencyShift).toBeLessThan(0);
  });

  it('exactly one hypothesis is SUPPORTED and matches the derived direction', () => {
    const result = runGravitationalRedshiftCase();
    const supported = result.hypotheses.filter((h) => h.verdict === 'SUPPORTED');
    const falsified = result.hypotheses.filter((h) => h.verdict === 'FALSIFIED');
    expect(supported).toHaveLength(1);
    expect(falsified).toHaveLength(1);
    expect(supported[0]!.hypothesisId).toBe('H_CLIMBING_LIGHT_REDSHIFTS');
  });

  it('the derived order of magnitude is consistent with the historically reported ~1e-15 scale', () => {
    const result = runGravitationalRedshiftCase();
    expect(result.orderOfMagnitudeConsistentWithHistoricalReport).toBe(true);
    expect(Math.abs(result.fractionalFrequencyShift)).toBeGreaterThan(1e-16);
    expect(Math.abs(result.fractionalFrequencyShift)).toBeLessThan(1e-14);
  });

  it('never asserts EMPIRICAL_FIT — every hypothesis is decided by derivation from established physics', () => {
    const result = runGravitationalRedshiftCase();
    for (const h of result.hypotheses) expect(h.basis).toBe('DERIVATION_FROM_ESTABLISHED_PHYSICS');
  });

  it('separates FACT, THEORY and ASSUMPTIONS as distinct, non-empty arrays', () => {
    const result = runGravitationalRedshiftCase();
    expect(result.fact.length).toBeGreaterThan(0);
    expect(result.theory.length).toBeGreaterThan(0);
    expect(result.assumptions.length).toBeGreaterThan(0);
  });

  it('is deterministic across runs', () => {
    const a = runGravitationalRedshiftCase();
    const b = runGravitationalRedshiftCase();
    expect(a.resultFingerprint).toBe(b.resultFingerprint);
  });
});

describe('gravitational redshift — replay and memory', () => {
  it('replays MATCH against its own freshly recomputed result', () => {
    const saved = runGravitationalRedshiftCase();
    expect(replayGravitationalRedshiftCase(saved).status).toBe('MATCH');
  });

  it('replays DRIFT when the saved fingerprint is tampered with', () => {
    const saved = runGravitationalRedshiftCase();
    const tampered = { ...saved, resultFingerprint: `${saved.resultFingerprint}0` };
    expect(replayGravitationalRedshiftCase(tampered).status).toBe('DRIFT');
  });

  it('saves to memory keyed on the result fingerprint', () => {
    const result = runGravitationalRedshiftCase();
    const saved = saveGravitationalRedshiftCaseToMemory(result);
    expect(saved.experimentId).toContain(result.resultFingerprint);
    expect(saved.epistemicStatus).toContain('BASIS=DERIVATION_FROM_ESTABLISHED_PHYSICS');
  });
});

describe('gravitational redshift — StandardScientificResult projection', () => {
  it('projects into the generic contract with a matching fingerprint and non-empty derivation trail', () => {
    const result = runGravitationalRedshiftCase();
    const standard = toStandardScientificResult(result);
    expect(standard.domainId).toBe('PHYSICS');
    expect(standard.caseId).toBe('GRAVITATIONAL_REDSHIFT');
    expect(standard.resultFingerprint).toBe(result.resultFingerprint);
    expect(standard.equations.length).toBeGreaterThan(0);
    expect(standard.calculation.length).toBeGreaterThan(0);
    expect(standard.falsificationCriteria).toHaveLength(2);
    expect(standard.epistemicTag).toBe('DERIVED');
  });
});
