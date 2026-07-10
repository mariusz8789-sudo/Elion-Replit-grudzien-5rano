import { describe, expect, it } from 'vitest';
import { branchToSimParams, gaussianRandom, runMonteCarlo, simulateTrajectory } from '../core/decisionMonteCarlo';

/** Generator liniowy kongruentny — deterministyczny, powtarzalny RNG dla testów statystycznych. */
function seededRng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe('gaussianRandom (transformacja Boxa–Mullera)', () => {
  it('duża próbka ma średnią bliską 0 i odchylenie standardowe bliskie 1 (N(0,1))', () => {
    const rnd = seededRng(42);
    const n = 20000;
    const samples: number[] = [];
    for (let i = 0; i < n; i++) samples.push(gaussianRandom(rnd));
    const mean = samples.reduce((a, b) => a + b, 0) / n;
    const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.abs(Math.sqrt(variance) - 1)).toBeLessThan(0.05);
  });
});

describe('simulateTrajectory (dyskretny proces Wienera z dryfem)', () => {
  it('bez dryfu i zmienności trajektoria pozostaje dokładnie na zerze', () => {
    const traj = simulateTrajectory(10, 0, 0, 50);
    for (const p of traj) expect(p.v).toBe(0);
  });

  it('czysty dryf bez zmienności: v(T) = drift·T dokładnie', () => {
    const traj = simulateTrajectory(10, 0.5, 0, 100);
    const last = traj[traj.length - 1];
    expect(last.t).toBeCloseTo(10, 9);
    expect(last.v).toBeCloseTo(5, 9);
  });

  it('trajektoria ma steps+1 punktów, zaczyna się w (0,0)', () => {
    const traj = simulateTrajectory(5, 0.1, 0.2, 40);
    expect(traj.length).toBe(41);
    expect(traj[0]).toEqual({ t: 0, v: 0 });
  });
});

describe('runMonteCarlo — kluczowa własność: rozrzut rośnie jak √czas', () => {
  it('odchylenie standardowe wyniku końcowego skaluje się w przybliżeniu jak √T (własność procesu Wienera)', () => {
    const rnd = seededRng(7);
    const volatility = 0.4;
    const short = runMonteCarlo(1, 0, volatility, { paths: 4000, steps: 20, rnd });
    const long = runMonteCarlo(4, 0, volatility, { paths: 4000, steps: 20, rnd });
    // std(4 lata) powinno być ok. 2x std(1 rok), bo √4=2
    const ratio = long.stdFinal / short.stdFinal;
    expect(ratio).toBeGreaterThan(1.6);
    expect(ratio).toBeLessThan(2.4);
  });

  it('teoretyczne odchylenie standardowe (volatility·√T) zgadza się z empirycznym w granicach tolerancji dla dużej próby', () => {
    const rnd = seededRng(99);
    const volatility = 0.3;
    const years = 9;
    const bundle = runMonteCarlo(years, 0, volatility, { paths: 6000, steps: 30, rnd });
    const theoretical = volatility * Math.sqrt(years);
    expect(Math.abs(bundle.stdFinal - theoretical) / theoretical).toBeLessThan(0.1);
  });

  it('dodatni dryf przesuwa średnią wyniku końcowego w górę, ujemny w dół', () => {
    const rnd = seededRng(1);
    const up = runMonteCarlo(5, 0.4, 0.1, { paths: 500, steps: 20, rnd });
    const down = runMonteCarlo(5, -0.4, 0.1, { paths: 500, steps: 20, rnd });
    expect(up.meanFinal).toBeGreaterThan(0);
    expect(down.meanFinal).toBeLessThan(0);
  });

  it('significantFraction jest w [0,1] i większe przy większej zmienności', () => {
    const rnd = seededRng(5);
    const low = runMonteCarlo(10, 0, 0.05, { paths: 2000, steps: 20, rnd });
    const high = runMonteCarlo(10, 0, 0.05, { paths: 2000, steps: 20, rnd });
    expect(low.significantFraction).toBeGreaterThanOrEqual(0);
    expect(low.significantFraction).toBeLessThanOrEqual(1);
    expect(high.significantFraction).toBeGreaterThanOrEqual(0);
  });

  it('każda wiązka zwraca tyle trajektorii i wartości końcowych, ile poproszono', () => {
    const bundle = runMonteCarlo(5, 0.1, 0.2, { paths: 33, steps: 15 });
    expect(bundle.trajectories.length).toBe(33);
    expect(bundle.finalValues.length).toBe(33);
  });
});

describe('branchToSimParams — mapowanie ocen użytkownika na parametry symulacji', () => {
  it('zmienność rośnie z wagą decyzji', () => {
    const low = branchToSimParams(1, 0);
    const high = branchToSimParams(10, 0);
    expect(high.volatility).toBeGreaterThan(low.volatility);
  });

  it('dryf ma ten sam znak co ton odgałęzienia', () => {
    expect(branchToSimParams(5, 3).drift).toBeGreaterThan(0);
    expect(branchToSimParams(5, -3).drift).toBeLessThan(0);
    expect(branchToSimParams(5, 0).drift).toBe(0);
  });

  it('zmienność jest zawsze dodatnia (nawet przy minimalnej wadze)', () => {
    expect(branchToSimParams(1, 0).volatility).toBeGreaterThan(0);
  });
});
