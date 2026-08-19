import { describe, expect, it } from 'vitest';
import {
  ISING_TC,
  isingEnergyPerSite,
  isingExactMagnetization,
  isingMagnetization,
  isingMetropolisStep,
  isingNeighborSum,
  isingRandomLattice,
  runIsingMetropolisScenario,
} from '../core/isingModel';

/** Generator liniowy kongruentny — deterministyczny, powtarzalny RNG dla testów statystycznych. */
function seededRng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe('ISING_TC (dokładna temperatura krytyczna Onsagera, 1944)', () => {
  it('równa się 2/ln(1+√2) ≈ 2,269', () => {
    expect(ISING_TC).toBeCloseTo(2.26918531, 6);
  });

  it('sinh(2/T_c) = 1 dokładnie — spójność wewnętrzna wzoru na magnetyzację i T_c', () => {
    expect(Math.sinh(2 / ISING_TC)).toBeCloseTo(1, 9);
  });
});

describe('isingExactMagnetization (Onsager 1944 / Yang 1952)', () => {
  it('przy T→0 magnetyzacja → 1 (pełne uporządkowanie)', () => {
    expect(isingExactMagnetization(0.01)).toBeCloseTo(1, 3);
  });

  it('przy T=T_c magnetyzacja jest dokładnie 0 (ciągłe przejście fazowe)', () => {
    expect(isingExactMagnetization(ISING_TC)).toBeCloseTo(0, 9);
  });

  it('powyżej T_c magnetyzacja jest zawsze 0 (paramagnetyk)', () => {
    expect(isingExactMagnetization(ISING_TC + 0.01)).toBe(0);
    expect(isingExactMagnetization(5)).toBe(0);
  });

  it('jest monotonicznie malejąca w przedziale (0, T_c)', () => {
    const temps = [0.5, 1, 1.5, 2, 2.2];
    const mags = temps.map(isingExactMagnetization);
    for (let i = 1; i < mags.length; i++) {
      expect(mags[i]).toBeLessThan(mags[i - 1]);
    }
  });
});

describe('isingNeighborSum (periodyczne warunki brzegowe)', () => {
  it('zawija się na krawędziach siatki 3×3', () => {
    // siatka 3x3, wszystkie +1
    const lattice = new Int8Array(9).fill(1);
    expect(isingNeighborSum(lattice, 3, 0, 0)).toBe(4);
  });

  it('poprawnie liczy sumę dla mieszanej siatki 2×2', () => {
    // [[1,-1],[-1,1]] spłaszczone wierszami
    const lattice = new Int8Array([1, -1, -1, 1]);
    // sąsiedzi (0,0) w 2x2 periodycznie: up=(1,0)=-1, down=(1,0)=-1, left=(0,1)=-1, right=(0,1)=-1
    expect(isingNeighborSum(lattice, 2, 0, 0)).toBe(-4);
  });
});

describe('isingMetropolisStep — symulacja Monte Carlo (RNG z ziarnem, powtarzalna)', () => {
  it('w bardzo niskiej temperaturze losowa siatka porządkuje się (magnetyzacja rośnie)', () => {
    const n = 20;
    const rnd = seededRng(123);
    const lattice = isingRandomLattice(n, rnd);
    const m0 = isingMagnetization(lattice);
    for (let i = 0; i < 60000; i++) isingMetropolisStep(lattice, n, 0.3, rnd);
    const m1 = isingMagnetization(lattice);
    expect(m1).toBeGreaterThan(m0);
    expect(m1).toBeGreaterThan(0.8);
  });

  it('w bardzo wysokiej temperaturze uporządkowana siatka traci magnetyzację', () => {
    const n = 20;
    const rnd = seededRng(456);
    const lattice = new Int8Array(n * n).fill(1); // stan podstawowy, w pełni uporządkowany
    for (let i = 0; i < 60000; i++) isingMetropolisStep(lattice, n, 10, rnd);
    const m1 = isingMagnetization(lattice);
    expect(m1).toBeLessThan(0.3);
  });

  it('poniżej T_c ustalona magnetyzacja jest znacznie wyższa niż powyżej T_c (przejście fazowe widoczne w symulacji)', () => {
    const n = 24;
    function equilibrate(temperature: number, seed: number): number {
      const rnd = seededRng(seed);
      const lattice = isingRandomLattice(n, rnd);
      for (let i = 0; i < 80000; i++) isingMetropolisStep(lattice, n, temperature, rnd);
      return isingMagnetization(lattice);
    }
    const mBelow = equilibrate(1.5, 111); // wyraźnie poniżej T_c≈2,269
    const mAbove = equilibrate(3.5, 222); // wyraźnie powyżej T_c
    expect(mBelow).toBeGreaterThan(mAbove);
    expect(mBelow).toBeGreaterThan(0.5);
    expect(mAbove).toBeLessThan(0.3);
  });
});

describe('runIsingMetropolisScenario', () => {
  it('jest odtwarzalny dla jawnego seeda i wykonuje istniejące kroki Metropolisa', () => {
    const scenario = { temperature: 1.8, latticeSize: 20, sweeps: 80, seed: 42 };
    const first = runIsingMetropolisScenario(scenario);
    const repeated = runIsingMetropolisScenario(scenario);

    expect(repeated).toEqual(first);
    expect(first.magnetization).toBeGreaterThanOrEqual(0);
    expect(first.magnetization).toBeLessThanOrEqual(1);
    expect(first.energyPerSite).toBeGreaterThanOrEqual(-2);
    expect(first.energyPerSite).toBeLessThanOrEqual(2);
    expect(first.exactMagnetization).toBeGreaterThan(0);
  });

  it('odrzuca parametry poza jawną domeną UI i runnera', () => {
    expect(() => runIsingMetropolisScenario({ temperature: 0.4 })).toThrow('temperature');
    expect(() => runIsingMetropolisScenario({ latticeSize: 3 })).toThrow('latticeSize');
    expect(() => runIsingMetropolisScenario({ sweeps: 0 })).toThrow('sweeps');
    expect(() => runIsingMetropolisScenario({ seed: -1 })).toThrow('seed');
  });
});

describe('isingEnergyPerSite', () => {
  it('stan podstawowy (wszystkie spiny zgodne) ma energię dokładnie −2 na spin', () => {
    const n = 10;
    const lattice = new Int8Array(n * n).fill(1);
    expect(isingEnergyPerSite(lattice, n)).toBeCloseTo(-2, 9);
  });

  it('energia rośnie (mniej ujemna) po termalizacji w wysokiej temperaturze', () => {
    const n = 16;
    const rnd = seededRng(789);
    const lattice = new Int8Array(n * n).fill(1);
    const e0 = isingEnergyPerSite(lattice, n);
    for (let i = 0; i < 40000; i++) isingMetropolisStep(lattice, n, 8, rnd);
    const e1 = isingEnergyPerSite(lattice, n);
    expect(e1).toBeGreaterThan(e0);
  });
});

describe('isingRandomLattice', () => {
  it('zawiera tylko wartości +1/−1, deterministyczna przy tym samym RNG', () => {
    const rnd = seededRng(1);
    const lattice = isingRandomLattice(8, rnd);
    for (const s of lattice) expect(Math.abs(s)).toBe(1);
  });
});
