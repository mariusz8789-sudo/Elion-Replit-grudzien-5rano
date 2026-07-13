import { describe, expect, it } from 'vitest';
import { normalizeToFrequency, type SonificationMapping } from '../core/sonification';

/**
 * Sonifikacja naukowa — testuje CZYSTĄ, deterministyczną transformację
 * wartość→częstotliwość (zmienna → normalizacja → ton). To jest sedno „prawdziwej"
 * sonifikacji: ta sama wartość zawsze daje ten sam ton, a skala jest logarytmiczna
 * (percepcyjnie równomierna).
 */
const M: SonificationMapping = { sourceLabel: 'T', unit: 'K', min: 0, max: 100, fMin: 200, fMax: 800 };

describe('normalizeToFrequency', () => {
  it('mapuje krańce zakresu na krańce częstotliwości', () => {
    expect(normalizeToFrequency(0, M)).toBeCloseTo(200, 5);
    expect(normalizeToFrequency(100, M)).toBeCloseTo(800, 5);
  });

  it('środek zakresu daje środek GEOMETRYCZNY (skala log), nie arytmetyczny', () => {
    // 50/100 → t=0.5 → fMin·(fMax/fMin)^0.5 = 200·√4 = 400 (nie 500).
    expect(normalizeToFrequency(50, M)).toBeCloseTo(400, 3);
  });

  it('obcina wartości poza zakresem do krańców', () => {
    expect(normalizeToFrequency(-20, M)).toBeCloseTo(200, 5);
    expect(normalizeToFrequency(200, M)).toBeCloseTo(800, 5);
  });

  it('jest deterministyczna i monotoniczna', () => {
    expect(normalizeToFrequency(30, M)).toBe(normalizeToFrequency(30, M));
    expect(normalizeToFrequency(30, M)).toBeLessThan(normalizeToFrequency(60, M));
  });

  it('wartość nieoznaczona (NaN) daje bezpieczny ton dolny', () => {
    expect(normalizeToFrequency(NaN, M)).toBe(M.fMin);
  });
});
