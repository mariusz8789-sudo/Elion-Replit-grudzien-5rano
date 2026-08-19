import { describe, expect, it } from 'vitest';
import { runChshCorrelationScenario } from '../labs/experiments/quantum-chsh';

describe('analityczny runner CHSH', () => {
  it('oblicza korelację singletu i maksimum Tsirelsona bez losowego próbkowania', () => {
    const result = runChshCorrelationScenario();
    expect(result.absS).toBeCloseTo(2 * Math.SQRT2, 9);
    expect(result.tsirelsonBound).toBeCloseTo(2 * Math.SQRT2, 12);
  });

  it('odrzuca kąty poza zakresem istniejącego Canvasu', () => {
    expect(() => runChshCorrelationScenario({ a: 181 })).toThrow('a');
  });
});
