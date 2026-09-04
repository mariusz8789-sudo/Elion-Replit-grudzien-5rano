import { describe, expect, it } from 'vitest';
import { logSliderValue, logSliderPosition } from '../core/logSlider';

describe('logSlider (suwak logarytmiczny — Scale Journey i Discovery Timeline)', () => {
  it('t=0 daje dokładnie 10^logMin', () => {
    expect(Math.log10(logSliderValue(0, -18, 27))).toBeCloseTo(-18, 9);
  });

  it('t=1 daje dokładnie 10^logMax', () => {
    expect(Math.log10(logSliderValue(1, -18, 27))).toBeCloseTo(27, 9);
  });

  it('t=0.5 daje środek geometryczny (dekady, nie wartości)', () => {
    const v = logSliderValue(0.5, 0, 4); // środek dekad [0,4] to 2
    expect(Math.log10(v)).toBeCloseTo(2, 9);
  });

  it('logSliderPosition jest odwrotnością logSliderValue', () => {
    for (const t of [0, 0.1, 0.37, 0.5, 0.82, 1]) {
      const value = logSliderValue(t, -10, 15);
      expect(logSliderPosition(value, -10, 15)).toBeCloseTo(t, 9);
    }
  });

  it('monotoniczne rosnące: większe t → większa wartość', () => {
    let prev = -Infinity;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const v = logSliderValue(t, -5, 5);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});
