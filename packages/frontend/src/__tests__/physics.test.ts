import { describe, expect, it } from 'vitest';
import {
  chshS,
  decayRemaining,
  kardashevPower,
  lensAmplification,
  lensImagePositions,
  lorentzGamma,
  lorentzTime,
  sampleLocalHiddenPair,
  sampleSingletPair,
  schwarzschildRadius,
  singletCorrelation,
} from '../core/physics';

/** Deterministyczny PRNG (mulberry32) — testy statystyczne bez flakiness. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('szczególna teoria względności', () => {
  it('γ(0) = 1, γ(0,6) = 1,25, γ(0,8) = 5/3', () => {
    expect(lorentzGamma(0)).toBeCloseTo(1, 12);
    expect(lorentzGamma(0.6)).toBeCloseTo(1.25, 10);
    expect(lorentzGamma(0.8)).toBeCloseTo(5 / 3, 10);
  });

  it('kolejność zdarzeń przestrzennopodobnych zależy od obserwatora', () => {
    // Zdarzenia z Minkowski Lab: A(x=-0,55, ct=0,12), B(x=0,62, ct=0,2)
    const tA = (b: number) => lorentzTime(0.12, -0.55, b);
    const tB = (b: number) => lorentzTime(0.2, 0.62, b);
    expect(tA(0)).toBeLessThan(tB(0)); // spoczynek: najpierw A
    expect(tA(0.5)).toBeGreaterThan(tB(0.5)); // szybki obserwator: najpierw B
  });
});

describe('soczewka grawitacyjna (punktowa)', () => {
  it('iloczyn pozycji obrazów = −θ_E² (θ+·θ− = −1 w jednostkach θ_E)', () => {
    for (const beta of [0.1, 0.5, 1, 1.7]) {
      const [p, m] = lensImagePositions(beta);
      expect(p * m).toBeCloseTo(-1, 10);
      expect(p - m).toBeCloseTo(Math.sqrt(beta * beta + 4), 10);
    }
  });

  it('β = 0 daje pierścień Einsteina (obrazy w ±θ_E)', () => {
    const [p, m] = lensImagePositions(0);
    expect(p).toBeCloseTo(1, 10);
    expect(m).toBeCloseTo(-1, 10);
  });

  it('wzmocnienie: A(1) = 3/√5, A(∞) → 1, A małych u rośnie nieograniczenie', () => {
    expect(lensAmplification(1)).toBeCloseTo(3 / Math.sqrt(5), 10);
    expect(lensAmplification(50)).toBeCloseTo(1, 3);
    expect(lensAmplification(0.01)).toBeGreaterThan(50);
  });
});

describe('rozpad promieniotwórczy', () => {
  it('po 1 T½ zostaje 50%, po 10 T½ mniej niż 0,1%', () => {
    expect(decayRemaining(1)).toBeCloseTo(0.5, 12);
    expect(decayRemaining(2)).toBeCloseTo(0.25, 12);
    expect(decayRemaining(10)).toBeLessThan(0.001);
  });
});

describe('skala Kardaszewa (wzór Sagana)', () => {
  it('K=0,73 ≈ dzisiejsza ludzkość (~2×10¹³ W)', () => {
    const P = kardashevPower(0.73);
    expect(P).toBeGreaterThan(1e13);
    expect(P).toBeLessThan(3e13);
  });
  it('K=1 → 10¹⁶ W, K=2 → 10²⁶ W', () => {
    expect(kardashevPower(1)).toBeCloseTo(1e16, -10);
    expect(kardashevPower(2)).toBeCloseTo(1e26, -20);
  });
});

describe('promień Schwarzschilda', () => {
  it('dla Słońca ≈ 2,95 km', () => {
    const rs = schwarzschildRadius(1.989e30);
    expect(rs).toBeGreaterThan(2900);
    expect(rs).toBeLessThan(3000);
  });
});

describe('splątanie i CHSH', () => {
  it('korelacja singletu: E(a,a) = −1, E(a, a+90°) = 0', () => {
    expect(singletCorrelation(0.3, 0.3)).toBeCloseTo(-1, 10);
    expect(singletCorrelation(0, Math.PI / 2)).toBeCloseTo(0, 10);
  });

  it('optymalne kąty dają |S| = 2√2 (granica Tsirelsona)', () => {
    const D = Math.PI / 180;
    const S = chshS(singletCorrelation, 0, 90 * D, 45 * D, 135 * D);
    expect(Math.abs(S)).toBeCloseTo(2 * Math.SQRT2, 6);
  });

  it('próbkowanie kwantowe odtwarza −cos(a−b) i łamie granicę klasyczną', () => {
    const rnd = mulberry32(42);
    const N = 30000;
    const D = Math.PI / 180;
    const angles: [number, number][] = [
      [0, 45 * D],
      [0, 135 * D],
      [90 * D, 45 * D],
      [90 * D, 135 * D],
    ];
    const E = angles.map(([a, b]) => {
      let sum = 0;
      let ones = 0;
      for (let i = 0; i < N; i++) {
        const [A, B] = sampleSingletPair(a, b, rnd);
        sum += A * B;
        if (A === 1) ones++;
      }
      // rozkład brzegowy 50/50 (splątanie nie przesyła informacji)
      expect(ones / N).toBeGreaterThan(0.47);
      expect(ones / N).toBeLessThan(0.53);
      return sum / N;
    });
    E.forEach((e, i) => {
      const [a, b] = angles[i];
      expect(e).toBeCloseTo(singletCorrelation(a, b), 1);
    });
    const S = Math.abs(E[0] - E[1] + E[2] + E[3]);
    expect(S).toBeGreaterThan(2.6); // > 2 = złamany lokalny realizm
    expect(S).toBeLessThan(2.95); // ≤ 2√2 + szum
  });

  it('lokalne ukryte zmienne NIGDY nie przekraczają |S| = 2', () => {
    const rnd = mulberry32(7);
    const N = 30000;
    const D = Math.PI / 180;
    const angles: [number, number][] = [
      [0, 45 * D],
      [0, 135 * D],
      [90 * D, 45 * D],
      [90 * D, 135 * D],
    ];
    const E = angles.map(([a, b]) => {
      let sum = 0;
      for (let i = 0; i < N; i++) {
        const [A, B] = sampleLocalHiddenPair(a, b, rnd);
        sum += A * B;
      }
      return sum / N;
    });
    const S = Math.abs(E[0] - E[1] + E[2] + E[3]);
    expect(S).toBeLessThan(2.1); // 2 + margines statystyczny
  });
});
