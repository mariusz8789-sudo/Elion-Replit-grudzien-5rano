import { describe, expect, it } from 'vitest';
import { setPendingScenario, consumePendingScenario } from '../core/scenarioBridge';

describe('scenarioBridge (most "Co by było, gdyby?" → parametry laboratorium)', () => {
  it('zwraca null, gdy nic nie czeka', () => {
    expect(consumePendingScenario('universe')).toBeNull();
  });

  it('zwraca ustawione parametry dla właściwego laboratorium', () => {
    setPendingScenario('universe', { omegaLambda: 0 });
    expect(consumePendingScenario('universe')).toEqual({ omegaLambda: 0 });
  });

  it('jest jednorazowa: drugie odczytanie zwraca null', () => {
    setPendingScenario('einstein', { metric: 'kerr' });
    expect(consumePendingScenario('einstein')).toEqual({ metric: 'kerr' });
    expect(consumePendingScenario('einstein')).toBeNull();
  });

  it('nie oddaje parametrów niewłaściwemu laboratorium', () => {
    setPendingScenario('multiverse', { preset: 'crushing' });
    expect(consumePendingScenario('quantum')).toBeNull();
    // wciąż czeka na właściwe laboratorium
    expect(consumePendingScenario('multiverse')).toEqual({ preset: 'crushing' });
  });

  it('nowe wywołanie setPendingScenario nadpisuje poprzednie, nieskonsumowane', () => {
    setPendingScenario('universe', { omegaLambda: 0 });
    setPendingScenario('spacetime', { v: 0.99 });
    expect(consumePendingScenario('universe')).toBeNull();
    expect(consumePendingScenario('spacetime')).toEqual({ v: 0.99 });
  });
});
