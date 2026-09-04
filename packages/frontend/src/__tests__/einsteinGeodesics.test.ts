import { describe, expect, it } from 'vitest';
import { runSchwarzschildGeodesicScenario } from '../labs/experiments/einstein-geodesics';

describe('bounded Schwarzschild geodesic runner', () => {
  it('reuses the deterministic RK4 step and separates a captured from an escaping ray', () => {
    const captured = runSchwarzschildGeodesicScenario({ impact: 0.8 });
    const escaped = runSchwarzschildGeodesicScenario({ impact: 1.8 });
    expect(runSchwarzschildGeodesicScenario({ impact: 0.8 })).toEqual(captured);
    expect(captured.outcome).toBe('captured');
    expect(escaped.outcome).toBe('escaped');
    expect(captured.criticalImpact).toBeCloseTo((3 * Math.sqrt(3) / 2) * 26, 12);
  });

  it('rejects parameters outside the bounded existing Canvas domain', () => {
    expect(() => runSchwarzschildGeodesicScenario({ impact: 0.4 })).toThrow('impact');
    expect(() => runSchwarzschildGeodesicScenario({ maxSteps: 0 })).toThrow('maxSteps');
  });
});
