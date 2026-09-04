import { describe, expect, it } from 'vitest';
import { pendulumEnergy, stepRK4, universeDoublePendulum, type PendulumState } from '../labs/experiments/universe-doublependulum';

describe('podwójne wahadło — integrator RK4', () => {
  it('stan spoczynku (pionowo w dół) ma minimalną, ujemną energię', () => {
    const rest: PendulumState = { th1: 0, th2: 0, w1: 0, w2: 0 };
    // -(m1+m2)*g*L1 - m2*g*L2 = -2*9.81*1 - 1*9.81*1 = -29.43
    expect(pendulumEnergy(rest)).toBeCloseTo(-29.43, 1);
  });

  it('energia jest w przybliżeniu zachowana przy małym kącie (regularny ruch, krótki czas)', () => {
    const th0 = (10 * Math.PI) / 180;
    let s: PendulumState = { th1: th0, th2: th0, w1: 0, w2: 0 };
    const e0 = pendulumEnergy(s);
    const h = 0.002;
    for (let i = 0; i < 2000; i++) s = stepRK4(s, h);
    const e1 = pendulumEnergy(s);
    expect(Math.abs(e1 - e0)).toBeLessThan(Math.abs(e0) * 0.02);
  });

  it('mały kąt startowy: wahadło pozostaje blisko startu (ruch regularny, nie eksploduje)', () => {
    const th0 = (10 * Math.PI) / 180;
    let s: PendulumState = { th1: th0, th2: th0, w1: 0, w2: 0 };
    const h = 0.002;
    for (let i = 0; i < 5000; i++) {
      s = stepRK4(s, h);
      expect(Math.abs(s.th1)).toBeLessThan(Math.PI); // nigdy nie robi pełnego obrotu
    }
  });

  it('RK4 jest deterministyczny: te same warunki startowe dają identyczny wynik', () => {
    const s0: PendulumState = { th1: 1.2, th2: 0.4, w1: 0, w2: 0 };
    let a = { ...s0 };
    let b = { ...s0 };
    for (let i = 0; i < 500; i++) {
      a = stepRK4(a, 0.005);
      b = stepRK4(b, 0.005);
    }
    expect(a).toEqual(b);
  });

  it('duży kąt startowy: mikroskopijne przesunięcie rozjeżdża się znacznie szybciej niż przy małym kącie (sygnatura chaosu)', () => {
    function divergenceAfter(angleDeg: number, steps: number): number {
      const th0 = (angleDeg * Math.PI) / 180;
      let a: PendulumState = { th1: th0, th2: th0, w1: 0, w2: 0 };
      let b: PendulumState = { th1: th0 + 1e-6, th2: th0, w1: 0, w2: 0 };
      const h = 0.002;
      for (let i = 0; i < steps; i++) {
        a = stepRK4(a, h);
        b = stepRK4(b, h);
      }
      return Math.hypot(a.th1 - b.th1, a.th2 - b.th2);
    }
    const small = divergenceAfter(10, 4000);
    const large = divergenceAfter(150, 4000);
    expect(large).toBeGreaterThan(small * 100);
  });
});

describe('podwójne wahadło — ExperimentDef', () => {
  it('narracja działa dla małego i dużego kąta, z dywergencją i bez', () => {
    for (const angle of [10, 150]) {
      for (const divergence of [false, true]) {
        const blocks = universeDoublePendulum.narrate({ angle, divergence, speed: 1 }, { energy: -20, th1Deg: 30, th2Deg: 45, separation: 0.1 });
        expect(blocks.length).toBeGreaterThan(0);
        for (const b of blocks) {
          expect(b.title.length).toBeGreaterThan(0);
          expect(b.body.length).toBeGreaterThan(0);
        }
      }
    }
  });
});
