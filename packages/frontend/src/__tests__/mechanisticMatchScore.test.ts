import { describe, expect, it } from 'vitest';
import {
  computeMechanisticMatchScore,
  MECHANISTIC_MATCH_THRESHOLD,
  MECHANISTIC_MATCH_WEIGHTS,
  mechanisticMatchStatement,
  type MechanisticAxisInput,
  type MechanisticMatchInputs,
} from '../core/discovery/mechanisticMatchScore';

function axis(grade: MechanisticAxisInput['grade']): MechanisticAxisInput {
  return { grade, basis: 'LITERATURE_SUPPORTED', rationale: 'test' };
}

const ALL_MATCH: MechanisticMatchInputs = {
  targetMatch: axis('MATCH'), mechanismMatch: axis('MATCH'), directionMatch: axis('MATCH'),
  assayMatch: axis('MATCH'), quantitativeComparability: axis('MATCH'), selectivity: axis('MATCH'), safetyAdvantage: axis('MATCH'),
};

describe('mechanisticMatchScore — weights and threshold', () => {
  it('the seven declared weights sum to exactly 1.0', () => {
    const total = Object.values(MECHANISTIC_MATCH_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1.0, 9);
  });

  it('weights match the mission-specified percentages exactly', () => {
    expect(MECHANISTIC_MATCH_WEIGHTS.targetMatch).toBe(0.30);
    expect(MECHANISTIC_MATCH_WEIGHTS.mechanismMatch).toBe(0.25);
    expect(MECHANISTIC_MATCH_WEIGHTS.directionMatch).toBe(0.15);
    expect(MECHANISTIC_MATCH_WEIGHTS.assayMatch).toBe(0.10);
    expect(MECHANISTIC_MATCH_WEIGHTS.quantitativeComparability).toBe(0.10);
    expect(MECHANISTIC_MATCH_WEIGHTS.selectivity).toBe(0.05);
    expect(MECHANISTIC_MATCH_WEIGHTS.safetyAdvantage).toBe(0.05);
  });

  it('threshold is exactly 95%', () => {
    expect(MECHANISTIC_MATCH_THRESHOLD).toBe(0.95);
  });
});

describe('mechanisticMatchScore — computation', () => {
  it('all-MATCH yields a perfect 100% score that meets the threshold', () => {
    const result = computeMechanisticMatchScore('perfect', 'reference', ALL_MATCH);
    expect(result.totalScore).toBeCloseTo(1.0, 9);
    expect(result.totalScorePercent).toBeCloseTo(100, 6);
    expect(result.meetsThreshold).toBe(true);
  });

  it('all-MISMATCH yields a 0% score', () => {
    const inputs: MechanisticMatchInputs = { ...ALL_MATCH, targetMatch: axis('MISMATCH'), mechanismMatch: axis('MISMATCH'), directionMatch: axis('MISMATCH'), assayMatch: axis('MISMATCH'), quantitativeComparability: axis('MISMATCH'), selectivity: axis('MISMATCH'), safetyAdvantage: axis('MISMATCH') };
    const result = computeMechanisticMatchScore('zero', 'reference', inputs);
    expect(result.totalScore).toBe(0);
    expect(result.meetsThreshold).toBe(false);
  });

  it('PARTIAL contributes exactly half its axis weight', () => {
    const inputs: MechanisticMatchInputs = { ...ALL_MATCH, targetMatch: axis('PARTIAL') };
    const result = computeMechanisticMatchScore('half-target', 'reference', inputs);
    const targetAxis = result.axes.find((a) => a.axis === 'targetMatch')!;
    expect(targetAxis.contribution).toBeCloseTo(0.15, 9);
  });

  it('UNKNOWN contributes zero but is disclosed separately via unknownWeight, never as a negative', () => {
    const inputs: MechanisticMatchInputs = { ...ALL_MATCH, assayMatch: axis('UNKNOWN'), quantitativeComparability: axis('UNKNOWN') };
    const result = computeMechanisticMatchScore('missing-data', 'reference', inputs);
    expect(result.totalScorePercent).toBeCloseTo(80, 6);
    expect(result.unknownWeight).toBeCloseTo(0.20, 9);
    expect(result.mismatchWeight).toBe(0);
    expect(result.meetsThreshold).toBe(false);
  });

  it('a real MISMATCH is tracked separately from an UNKNOWN via mismatchWeight', () => {
    const inputs: MechanisticMatchInputs = { ...ALL_MATCH, selectivity: axis('MISMATCH'), safetyAdvantage: axis('UNKNOWN') };
    const result = computeMechanisticMatchScore('mixed', 'reference', inputs);
    expect(result.mismatchWeight).toBeCloseTo(0.05, 9);
    expect(result.unknownWeight).toBeCloseTo(0.05, 9);
  });

  it('exactly 95% meets the threshold (boundary is inclusive)', () => {
    // 30 + 25 + 15 + 10 + 10 + 5 = 95, with safetyAdvantage MISMATCH (0)
    const inputs: MechanisticMatchInputs = { ...ALL_MATCH, safetyAdvantage: axis('MISMATCH') };
    const result = computeMechanisticMatchScore('boundary', 'reference', inputs);
    expect(result.totalScorePercent).toBeCloseTo(95, 6);
    expect(result.meetsThreshold).toBe(true);
  });

  it('a genuinely below-threshold case: 87.5%', () => {
    const inputs: MechanisticMatchInputs = { ...ALL_MATCH, mechanismMatch: axis('PARTIAL') };
    const result = computeMechanisticMatchScore('ninety', 'reference', inputs);
    expect(result.totalScorePercent).toBeCloseTo(87.5, 6);
    expect(result.meetsThreshold).toBe(false);
  });

  it('every axis carries its own evidence-basis tag and rationale, never a bare grade', () => {
    const result = computeMechanisticMatchScore('c', 'r', ALL_MATCH);
    for (const a of result.axes) {
      expect(a.basis.length).toBeGreaterThan(0);
      expect(a.rationale.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic: identical inputs produce identical results', () => {
    const a = computeMechanisticMatchScore('c', 'r', ALL_MATCH);
    const b = computeMechanisticMatchScore('c', 'r', ALL_MATCH);
    expect(a).toEqual(b);
  });

  it('mechanisticMatchStatement never claims clinical efficacy or proven equivalence', () => {
    const result = computeMechanisticMatchScore('c', 'r', ALL_MATCH);
    const statement = mechanisticMatchStatement(result);
    expect(statement.toLowerCase()).toContain('not a claim');
    expect(statement.toLowerCase()).not.toContain('cures');
    expect(statement.toLowerCase()).not.toContain('effective treatment');
  });
});
