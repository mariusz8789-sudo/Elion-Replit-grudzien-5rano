import { describe, expect, it } from 'vitest';
import {
  figure8Bodies,
  integrateAdaptive,
  pythagoreanBodies,
  stepVerlet,
  totalEnergy,
  universeThreeBody,
} from '../labs/experiments/universe-threebody';

/**
 * Integrator velocity-Verlet musi być symplektyczny (energia stała
 * długoterminowo) i musi odtworzyć znane własności obu układów startowych:
 * ósemka jest okresowa i stabilna, problem pitagorejski jest chaotyczny
 * (dwa niemal identyczne starty rozjeżdżają się wykładniczo).
 */
describe('problem trzech ciał — integrator symplektyczny', () => {
  it('zachowuje energię długoterminowo (ósemka, 20000 kroków)', () => {
    const bodies = figure8Bodies();
    const e0 = totalEnergy(bodies);
    const h = 0.001;
    for (let i = 0; i < 20000; i++) stepVerlet(bodies, h);
    const e1 = totalEnergy(bodies);
    expect(Math.abs(e1 - e0)).toBeLessThan(Math.abs(e0) * 0.01);
  });

  it('zachowuje energię długoterminowo z krokiem adaptacyjnym (problem pitagorejski, przez bliskie przejście)', () => {
    const bodies = pythagoreanBodies();
    const e0 = totalEnergy(bodies);
    integrateAdaptive(bodies, 10, 0.0005);
    const e1 = totalEnergy(bodies);
    expect(Math.abs(e1 - e0)).toBeLessThan(Math.abs(e0) * 0.05);
  });

  it('ósemka: po jednym okresie (T≈6.32591398) ciała wracają blisko startu', () => {
    const bodies = figure8Bodies();
    const start = bodies.map((b) => ({ x: b.x, y: b.y }));
    const period = 6.32591398;
    const h = 0.0002;
    const steps = Math.round(period / h);
    for (let i = 0; i < steps; i++) stepVerlet(bodies, h);
    for (let i = 0; i < bodies.length; i++) {
      expect(bodies[i].x).toBeCloseTo(start[i].x, 2);
      expect(bodies[i].y).toBeCloseTo(start[i].y, 2);
    }
  });

  it('wrażliwość na warunki początkowe: mikroskopijne przesunięcie rozjeżdża się wykładniczo (problem pitagorejski)', () => {
    const a = pythagoreanBodies();
    const b = pythagoreanBodies();
    b[0].x += 1e-8;
    const separation = () => {
      let sep = 0;
      for (let i = 0; i < a.length; i++) sep += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
      return sep;
    };
    const sep0 = separation();
    integrateAdaptive(a, 35, 0.0005);
    integrateAdaptive(b, 35, 0.0005);
    const sepLater = separation();
    expect(sepLater).toBeGreaterThan(sep0 * 1000);
  });
});

describe('problem trzech ciał — ExperimentDef', () => {
  it('ma zbalansowany pęd całkowity ≈ 0 dla obu układów startowych', () => {
    for (const bodies of [figure8Bodies(), pythagoreanBodies()]) {
      let px = 0;
      let py = 0;
      for (const b of bodies) {
        px += b.m * b.vx;
        py += b.m * b.vy;
      }
      expect(Math.abs(px)).toBeLessThan(1e-6);
      expect(Math.abs(py)).toBeLessThan(1e-6);
    }
  });

  it('narracja działa dla obu presetów i trybu rozjazdu', () => {
    for (const preset of ['figure8', 'pythagorean']) {
      for (const divergence of [false, true]) {
        const blocks = universeThreeBody.narrate(
          { preset, divergence, speed: 1 },
          { t: 3, energy: -1.2, separation: 0.5 },
        );
        expect(blocks.length).toBeGreaterThan(0);
        for (const b of blocks) {
          expect(b.title.length).toBeGreaterThan(0);
          expect(b.body.length).toBeGreaterThan(0);
        }
      }
    }
  });
});
