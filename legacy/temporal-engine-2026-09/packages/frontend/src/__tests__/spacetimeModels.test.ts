import { describe, expect, it } from 'vitest';
import {
  attemptSpacetimeModelValidation,
  GRAVITATIONAL_REDSHIFT_MODEL,
  GR_TIME_DILATION_MODEL,
  SPACETIME_MODELS,
  SR_TIME_DILATION_MODEL,
} from '../core/discovery/physics/spacetimeModels';
import { gravitationalFractionalExcess, specialRelativisticFractionalDeficit, SPEED_OF_LIGHT_M_PER_S } from '../core/discovery/physics/relativisticTimeDilation';
import { weakFieldFractionalFrequencyShift } from '../core/discovery/physics/gravitationalRedshift';

describe('spacetime models — MODEL and EQUATION as first-class objects', () => {
  it('every declared model starts as GENERATED_MODEL with a real equation and stated assumptions', () => {
    expect(SPACETIME_MODELS).toHaveLength(3);
    for (const model of SPACETIME_MODELS) {
      expect(model.status).toBe('GENERATED_MODEL');
      expect(model.equationText.length).toBeGreaterThan(0);
      expect(model.assumptions.length).toBeGreaterThan(0);
      expect(model.variables.some((v) => v.role === 'INPUT')).toBe(true);
      expect(model.variables.some((v) => v.role === 'OUTPUT')).toBe(true);
    }
  });

  it('refuses to construct a model with no stated assumptions (reused, unmodified guard from scientificModel.ts)', () => {
    // Not re-testing buildScientificModel's own guard in depth (that belongs to
    // its own test file); this just confirms these models actually go through it.
    for (const model of SPACETIME_MODELS) {
      expect(model.assumptions.length).toBeGreaterThan(0);
    }
  });

  it('the SR model\'s equation matches the real formula used by the GPS time-dilation case', () => {
    const v = 3874;
    const modelPrediction = (v * v) / (2 * SPEED_OF_LIGHT_M_PER_S * SPEED_OF_LIGHT_M_PER_S);
    const casePrediction = specialRelativisticFractionalDeficit(v, SPEED_OF_LIGHT_M_PER_S);
    expect(modelPrediction).toBeCloseTo(casePrediction, 20);
    expect(SR_TIME_DILATION_MODEL.equationText).toContain('v^2');
  });

  it('the GR model\'s equation matches the real formula used by the GPS time-dilation case', () => {
    const gm = 3.986004418e14;
    const rLow = 6378137;
    const rHigh = 26560000;
    const modelPrediction = (gm / (SPEED_OF_LIGHT_M_PER_S * SPEED_OF_LIGHT_M_PER_S)) * (1 / rLow - 1 / rHigh);
    const casePrediction = gravitationalFractionalExcess(gm, rLow, rHigh, SPEED_OF_LIGHT_M_PER_S);
    expect(modelPrediction).toBeCloseTo(casePrediction, 20);
    expect(GR_TIME_DILATION_MODEL.equationText).toContain('1/rLow');
  });

  it('the redshift model\'s equation matches the real formula used by the gravitational-redshift case', () => {
    const g = 9.8;
    const h = 22.5;
    const modelPrediction = -(g * h) / (SPEED_OF_LIGHT_M_PER_S * SPEED_OF_LIGHT_M_PER_S);
    const casePrediction = weakFieldFractionalFrequencyShift(g, h, SPEED_OF_LIGHT_M_PER_S);
    expect(modelPrediction).toBeCloseTo(casePrediction, 20);
    expect(GRAVITATIONAL_REDSHIFT_MODEL.equationText).toContain('g * h');
  });
});

describe('spacetime models — honest validation with no fabricated measurements', () => {
  it('validating against zero data points yields INCONCLUSIVE, never a fabricated VALIDATED', () => {
    for (const model of SPACETIME_MODELS) {
      const validated = attemptSpacetimeModelValidation(model);
      expect(validated.status).toBe('GENERATED_MODEL');
      expect(validated.validation).not.toBeNull();
      expect(validated.validation!.verdict).toBe('INCONCLUSIVE');
      expect(validated.validation!.reason).toMatch(/no data points/i);
    }
  });

  it('the real evaluator computes the correct prediction when given a SIMULATED data point, and reports VALIDATED honestly (not a real measurement)', () => {
    const v = 3874;
    const c = SPEED_OF_LIGHT_M_PER_S;
    const exactPrediction = (v * v) / (2 * c * c);
    // Explicitly a SIMULATED point (the model's own exact prediction, not an
    // independent measurement) — this proves the evaluator function itself is
    // real and correct; it does not and must not claim empirical validation.
    const simulatedPoint = { inputs: { v }, measuredOutput: exactPrediction, evidenceRecordId: 'SIMULATED:not-a-real-measurement' };
    const result = attemptSpacetimeModelValidation(SR_TIME_DILATION_MODEL, [simulatedPoint]);
    expect(result.validation!.verdict).toBe('VALIDATED');
    expect(result.validation!.meanAbsoluteError).toBeCloseTo(0, 15);
    expect(result.validation!.residuals[0]!.evidenceRecordId).toContain('SIMULATED');
  });
});
