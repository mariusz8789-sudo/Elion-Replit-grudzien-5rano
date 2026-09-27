import { describe, expect, it } from 'vitest';
import { createStandaloneLabRuntime } from './standaloneDeterminism';
import { DigitalTwinSynchronizer } from './digitalTwinSynchronizer';
import { ModelCalibrationEngine } from './modelCalibrationEngine';
import { ModelValidationEngine } from './modelValidationEngine';

describe('D-140 twin/calibration/validation', () => {
  it('detects synchronized and out-of-model residuals', () => {
    const twin = new DigitalTwinSynchronizer(createStandaloneLabRuntime());
    expect(twin.synchronize({ value: 10, standardUncertainty: 1, sequence: 1 }, { value: 10.5, standardUncertainty: 1, sequence: 1 }, 1).syncStatus).toBe('SYNCHRONIZED');
    expect(twin.synchronize({ value: 10, standardUncertainty: 0.1, sequence: 1 }, { value: 20, standardUncertainty: 0.1, sequence: 1 }, 1).syncStatus).toBe('OUT_OF_MODEL');
  });

  it('fits a deterministic weighted linear model', () => {
    const result = new ModelCalibrationEngine(createStandaloneLabRuntime()).calibrateLinear({ slope: 0, intercept: 0 }, [{ x: 0, y: 1, standardUncertainty: 1 }, { x: 1, y: 3, standardUncertainty: 1 }, { x: 2, y: 5, standardUncertainty: 1 }]);
    expect(result.modelAfter.slope).toBeCloseTo(2, 10); expect(result.modelAfter.intercept).toBeCloseTo(1, 10);
  });

  it('does not call a model true/proven', () => {
    const result = new ModelValidationEngine(createStandaloneLabRuntime()).validate([{ predicted: 1, predictedUncertainty: 0.1, measured: 1.05, measuredUncertainty: 0.1, inModelDomain: true }]);
    expect(result.classification).toBe('SUPPORTED_WITHIN_UNCERTAINTY');
  });
});
