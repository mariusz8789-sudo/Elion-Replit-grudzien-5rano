import { describe, it, expect } from 'vitest';
import {
  simulateEpidemic, rk4Step, initialState, betaAt, derivatives,
  DEFAULT_EPIDEMIC, type EpidemicParams,
} from '../core/epidemic/sir';

const base = (over: Partial<EpidemicParams> = {}): EpidemicParams => ({ ...DEFAULT_EPIDEMIC, population: 100_000, initialInfected: 50, ...over });

describe('epidemic engine: population conservation (numerical invariant)', () => {
  it('S+E+I+R+D stays equal to N0 across the whole run (all models)', () => {
    for (const model of ['SIR', 'SEIR', 'SEIRD'] as const) {
      const p = base({ model, r0: 3 });
      const { series } = simulateEpidemic(p, 200, 0.25);
      for (const pt of series) {
        const total = pt.S + pt.E + pt.I + pt.R + pt.D;
        expect(Math.abs(total - p.population)).toBeLessThan(1); // <1 osoba dryfu na 100k
      }
    }
  });
});

describe('epidemic engine: R0 threshold (real epidemiology, not decoration)', () => {
  it('R0 < 1 -> no outbreak (infection dies out, peak ~ initial)', () => {
    const r = simulateEpidemic(base({ model: 'SIR', r0: 0.7 }), 200);
    expect(r.peakInfected).toBeLessThanOrEqual(base().initialInfected + 1e-6);
  });

  it('R0 > 1 -> outbreak (infected peak far exceeds the seed)', () => {
    const r = simulateEpidemic(base({ model: 'SIR', r0: 3 }), 200);
    expect(r.peakInfected).toBeGreaterThan(base().initialInfected * 50);
    expect(r.totalInfected).toBeGreaterThan(base().population * 0.5); // duża fala
  });
});

describe('epidemic engine: interventions flatten the curve ("what-if" lever)', () => {
  it('early, effective distancing lowers the peak vs no intervention', () => {
    const noNPI = simulateEpidemic(base({ model: 'SEIR', r0: 3, interventionDay: 0, interventionEffect: 0 }), 250);
    const withNPI = simulateEpidemic(base({ model: 'SEIR', r0: 3, interventionDay: 10, interventionEffect: 0.6 }), 250);
    expect(withNPI.peakInfected).toBeLessThan(noNPI.peakInfected);
  });

  it('betaAt drops after the intervention day by the effectiveness factor', () => {
    const p = base({ r0: 2.8, infectiousDays: 7, interventionDay: 30, interventionEffect: 0.5 });
    const before = betaAt(p, 10);
    const after = betaAt(p, 40);
    expect(after).toBeCloseTo(before * 0.5, 6);
  });
});

describe('epidemic engine: SEIRD mortality', () => {
  it('deaths accrue only in SEIRD and scale with IFR', () => {
    const noDeath = simulateEpidemic(base({ model: 'SEIR', r0: 3 }), 200);
    expect(noDeath.finalDead).toBe(0);
    const lowIfr = simulateEpidemic(base({ model: 'SEIRD', r0: 3, ifr: 0.005 }), 200);
    const highIfr = simulateEpidemic(base({ model: 'SEIRD', r0: 3, ifr: 0.02 }), 200);
    expect(highIfr.finalDead).toBeGreaterThan(lowIfr.finalDead);
    expect(lowIfr.finalDead).toBeGreaterThan(0);
  });
});

describe('epidemic engine: determinism + primitives', () => {
  it('two identical runs produce identical series (reproducible)', () => {
    const a = simulateEpidemic(base({ r0: 2.2 }), 120);
    const b = simulateEpidemic(base({ r0: 2.2 }), 120);
    expect(a.peakInfected).toBe(b.peakInfected);
    expect(a.series.at(-1)!.R).toBe(b.series.at(-1)!.R);
  });

  it('initialState seeds S = N - I0 and one RK4 step conserves population', () => {
    const p = base({ model: 'SIR', r0: 2 });
    const s0 = initialState(p);
    expect(s0.S).toBe(p.population - p.initialInfected);
    const s1 = rk4Step(s0, p, 0, 0.25);
    const total = s1.S + s1.E + s1.I + s1.R + s1.D;
    expect(Math.abs(total - p.population)).toBeLessThan(1e-6);
    // Na starcie epidemii (R0>1) liczba zakażonych rośnie.
    expect(derivatives(s0, p, 0).I).toBeGreaterThan(0);
  });
});
