import { describe, expect, it } from 'vitest';
import { deriveInterpolatedParameterValue, type FalsifiedParameterPoint } from '../core/agent/parameterRegeneration';
import { runAutonomousWorldCalibration } from '../core/agent/worldParameterCalibration';
import { epidemicInfectiousDaysCalibration } from '../core/agent/epidemicInfectiousDaysCalibration';

/**
 * PARAMETER REGENERATION — the missing half of P3, measured against the real
 * `epidemicInfectiousDaysCalibration` fixture C3 already built for P6/P7.
 *
 * `AUTONOMOUS_DISCOVERY_ROADMAP.md` §10.3 measured that PARAMETER never
 * creates a hypothesis id beyond what was declared, unlike MECHANISM's P3
 * regeneration. This checks the honest mechanical derivation that would let
 * it: given a hidden truth (6.75 days) NOT among the five declared candidates
 * (6/6.5/7/7.5/8), does interpolating between the real falsified predictions
 * that bracket the real observation recover something close to it?
 */
describe('parameterRegeneration — real epidemic-calibration fixture, hidden value nobody proposed', () => {
  const CLAIMED_VALUES: Record<string, number> = { 'h:short': 6, 'h:brief': 6.5, 'h:typical': 7, 'h:extended': 7.5, 'h:long': 8 };

  function falsifiedPointsAt(hiddenValue: number, roundIndex: number) {
    const result = runAutonomousWorldCalibration(epidemicInfectiousDaysCalibration(hiddenValue));
    const round = result.rounds[roundIndex]!;
    const falsified: FalsifiedParameterPoint[] = round.outcomes
      .filter((o) => o.assessment === 'FALSIFIED_WITHIN_PROTOCOL' && o.predicted !== null)
      .map((o) => ({ hypothesisId: o.hypothesisId, claimedValue: CLAIMED_VALUES[o.hypothesisId]!, predicted: o.predicted! }));
    return { observed: round.observed!, falsified };
  }

  it('interpolates a candidate close to a real hidden value nobody declared (6.75, between 6.5 and 7)', () => {
    // Round 2 (tick=30) is where three of the five candidates are genuinely
    // falsified against one shared real observation — grounding the fixture
    // before trusting the derivation on it.
    const { observed, falsified } = falsifiedPointsAt(6.75, 1);
    expect(falsified.map((f) => f.hypothesisId).sort()).toEqual(['h:extended', 'h:long', 'h:short']);

    const derived = deriveInterpolatedParameterValue(falsified, observed);
    expect(derived).not.toBeNull();
    // MEASURED: the real interpolation lands within 0.15 days of the real
    // hidden value — not exact (the epidemic model is not linear in
    // infectiousDays), but a genuinely useful proposal, mechanically read
    // from real falsified numbers, not guessed.
    expect(derived!.claimedValue).toBeGreaterThan(6.7);
    expect(derived!.claimedValue).toBeLessThan(7.0);
    expect(Math.abs(derived!.claimedValue - 6.75)).toBeLessThan(0.15);
  });

  it('refuses to extrapolate for a hidden value far outside the declared range (20 days)', () => {
    // Every declared candidate over-predicts a hidden value this far outside
    // their range in the SAME direction — nothing brackets it, and the
    // honest behaviour is to say so rather than guess how far past the
    // declared range the truth sits. Round 2 (tick=45) is where all five are
    // falsified against one shared real observation.
    const { observed, falsified } = falsifiedPointsAt(20, 1);
    expect(falsified).toHaveLength(5);
    expect(deriveInterpolatedParameterValue(falsified, observed)).toBeNull();
  });
});

describe('parameterRegeneration — pure classifier edge cases', () => {
  it('returns null when fewer than two falsified points are given', () => {
    expect(deriveInterpolatedParameterValue([], 5)).toBeNull();
    expect(deriveInterpolatedParameterValue([{ hypothesisId: 'a', claimedValue: 1, predicted: 2 }], 5)).toBeNull();
  });

  it('skips a degenerate pair whose predictions are identical rather than dividing by zero', () => {
    const points: FalsifiedParameterPoint[] = [
      { hypothesisId: 'a', claimedValue: 1, predicted: 10 },
      { hypothesisId: 'b', claimedValue: 2, predicted: 10 },
    ];
    expect(deriveInterpolatedParameterValue(points, 10)).toBeNull();
  });

  it('finds a bracketing pair regardless of order, and reports which one is the lower prediction', () => {
    const points: FalsifiedParameterPoint[] = [
      { hypothesisId: 'high', claimedValue: 100, predicted: 50 },
      { hypothesisId: 'low', claimedValue: 0, predicted: 0 },
    ];
    const derived = deriveInterpolatedParameterValue(points, 25);
    expect(derived).not.toBeNull();
    expect(derived!.lowerBound.hypothesisId).toBe('low');
    expect(derived!.upperBound.hypothesisId).toBe('high');
    expect(derived!.interpolationFraction).toBeCloseTo(0.5, 9);
    expect(derived!.claimedValue).toBeCloseTo(50, 9);
  });
});
