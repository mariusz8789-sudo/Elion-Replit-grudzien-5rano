import { describe, expect, it } from 'vitest';
import { buildPumpPipeModel } from '../core/engineeringGraph/pumpPipe';

const FT3_PER_S_TO_M3_PER_S = 0.028316846592;
const usgsDischargeM3PerS = 2850 * FT3_PER_S_TO_M3_PER_S;

describe('USGS observation versus existing water model boundary', () => {
  it('confirms volumetricFlow is a user-provided model input, not a predicted observable', () => {
    const model = buildPumpPipeModel();

    expect(model.parameterIds()).toContain('volumetricFlow');
    expect(model.modelProvenance('flowVelocity')).toBe('calculated');
    expect(model.modelProvenance('headLoss')).toBe('calculated');
    expect(model.modelProvenance('hydraulicPower')).toBe('calculated');
    expect(model.modelProvenance('shaftPower')).toBe('calculated');
  });

  it('treats USGS 00060 as an exogenous discharge input, not as water-model validation', () => {
    const model = buildPumpPipeModel();
    const baseline = model.getValue('volumetricFlow');
    const steps = model.setParameter('volumetricFlow', usgsDischargeM3PerS);

    expect(baseline).not.toBe(usgsDischargeM3PerS);
    expect(steps.some((step) => step.nodeId === 'volumetricFlow')).toBe(true);
    expect(model.getValue('volumetricFlow')).toBeCloseTo(usgsDischargeM3PerS, 10);
    expect(model.effectiveProvenance('flowVelocity').provenance).toBe('calculated');
    expect(model.effectiveProvenance('flowVelocity').validationLimited).toBe(false);
  });

  it('does not silently claim river-model compatibility for a closed 0.1 m pump pipe', () => {
    const model = buildPumpPipeModel();
    model.setParameter('volumetricFlow', usgsDischargeM3PerS);

    // This is a domain-boundary alarm, not a fabricated scientific result:
    // the river discharge is many orders beyond the default closed-pipe design point.
    expect(model.getValue('flowVelocity')).toBeGreaterThan(10_000);
    expect(model.getValue('reynolds')).toBeGreaterThan(1_000_000_000);
    expect(model.getValue('headLoss')).toBeGreaterThan(10_000_000);
    expect(model.getValue('shaftPower')).toBeGreaterThan(1_000_000_000_000);
  });
});
