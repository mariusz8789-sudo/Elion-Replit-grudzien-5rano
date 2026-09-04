import { describe, expect, it } from 'vitest';
import { runNuclideChartScenario } from '../labs/experiments/nuclear-chart';

describe('bounded nuclide-chart runner', () => {
  it('separates a shared SEMF prediction from the measured local Fe-56 record', () => {
    const iron = runNuclideChartScenario({ protonNumber: 26, neutronNumber: 30 });
    const absent = runNuclideChartScenario({ protonNumber: 26, neutronNumber: 31 });

    expect(iron).toMatchObject({ massNumber: 56, knownNuclide: true, measuredSymbol: 'Fe-56', measuredDecayMode: 'stabilny' });
    expect(iron.bindingPerNucleonMeV).toBeGreaterThan(0);
    expect(runNuclideChartScenario({ protonNumber: 26, neutronNumber: 30 })).toEqual(iron);
    expect(absent).toMatchObject({ knownNuclide: false, measuredSymbol: '', measuredDecayMode: '', measuredHalfLife: '' });
  });

  it('rejects a nuclide outside the bounded Canvas domain', () => {
    expect(() => runNuclideChartScenario({ protonNumber: 0, neutronNumber: 0 })).toThrow('protonNumber');
    expect(() => runNuclideChartScenario({ protonNumber: 101, neutronNumber: 0 })).toThrow('protonNumber');
    expect(() => runNuclideChartScenario({ protonNumber: 1, neutronNumber: 161 })).toThrow('neutronNumber');
  });
});
