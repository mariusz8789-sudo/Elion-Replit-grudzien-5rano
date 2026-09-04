import { describe, expect, it } from 'vitest';
import { setPendingScenario, consumePendingScenario } from '../core/scenarioBridge';

describe('scenarioBridge (most "Co by było, gdyby?" → parametry laboratorium)', () => {
  it('zwraca null, gdy nic nie czeka', () => {
    expect(consumePendingScenario('universe')).toBeNull();
  });

  it('zwraca ustawione parametry dla właściwego laboratorium', () => {
    setPendingScenario('universe', { omegaLambda: 0 });
    expect(consumePendingScenario('universe')).toEqual({ params: { omegaLambda: 0 } });
  });

  it('jest jednorazowa: drugie odczytanie zwraca null', () => {
    setPendingScenario('einstein', { metric: 'kerr' });
    expect(consumePendingScenario('einstein')).toEqual({ params: { metric: 'kerr' } });
    expect(consumePendingScenario('einstein')).toBeNull();
  });

  it('nie oddaje parametrów niewłaściwemu laboratorium', () => {
    setPendingScenario('multiverse', { preset: 'crushing' });
    expect(consumePendingScenario('quantum')).toBeNull();
    // wciąż czeka na właściwe laboratorium
    expect(consumePendingScenario('multiverse')).toEqual({ params: { preset: 'crushing' } });
  });

  it('nowe wywołanie setPendingScenario nadpisuje poprzednie, nieskonsumowane', () => {
    setPendingScenario('universe', { omegaLambda: 0 });
    setPendingScenario('spacetime', { v: 0.99 });
    expect(consumePendingScenario('universe')).toBeNull();
    expect(consumePendingScenario('spacetime')).toEqual({ params: { v: 0.99 } });
  });

  it('opcjonalny experimentId wskazuje konkretny eksperyment (nie tylko bazowy) — patrz LabShell.tsx', () => {
    setPendingScenario('universe', { speed: 200 }, 'solar-system');
    expect(consumePendingScenario('universe')).toEqual({ params: { speed: 200 }, experimentId: 'solar-system' });
  });

  it('brak experimentId oznacza domyślnie eksperyment bazowy (kompatybilność wsteczna)', () => {
    setPendingScenario('universe', { omegaLambda: 0.5 });
    const result = consumePendingScenario('universe');
    expect(result?.experimentId).toBeUndefined();
    expect(result?.params).toEqual({ omegaLambda: 0.5 });
  });
});
