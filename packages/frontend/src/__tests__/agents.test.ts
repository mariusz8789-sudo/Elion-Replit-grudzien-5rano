import { describe, it, expect } from 'vitest';
import { AgentWorld, makeRng, type AgentParams } from '../core/epidemic/agents';

const runDays = (over: Partial<AgentParams>, days: number, dt = 0.25): AgentWorld => {
  const w = new AgentWorld(over);
  const steps = Math.round(days / dt);
  for (let i = 0; i < steps; i++) w.step(dt);
  return w;
};

describe('agent engine: RNG determinism', () => {
  it('same seed → identical stream, different seed → different stream', () => {
    const a = makeRng(42), b = makeRng(42), c = makeRng(43);
    const sa = [a(), a(), a()], sb = [b(), b(), b()], sc = [c(), c(), c()];
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
    expect(sa.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe('agent engine: population conservation (invariant)', () => {
  it('S+E+I+R+D stays exactly N across the whole run', () => {
    const n = 240;
    const w = new AgentWorld({ nAgents: n, r0: 3, seed: 7 });
    expect(w.total()).toBe(n);
    for (let i = 0; i < 400; i++) {
      w.step(0.25);
      expect(w.total()).toBe(n);
    }
  });
});

describe('agent engine: deterministic trajectory (reproducible)', () => {
  it('two runs with the same seed produce identical final counts', () => {
    const a = runDays({ nAgents: 200, r0: 3, seed: 99 }, 60);
    const b = runDays({ nAgents: 200, r0: 3, seed: 99 }, 60);
    expect(a.getCounts()).toEqual(b.getCounts());
    expect(a.getPeakInfected()).toBe(b.getPeakInfected());
  });
});

describe('agent engine: transmission is real (contact-driven, not decoration)', () => {
  it('R0 = 0 → no secondary infections (only the seed ever gets infected)', () => {
    const w = runDays({ nAgents: 200, r0: 0, seed: 5 }, 60);
    const c = w.getCounts();
    // Bez transmisji nikt nowy nie przechodzi przez E; wszyscy podatni zostają S.
    expect(c.E).toBe(0);
    const everInfected = c.I + c.R + c.D; // tylko zaszczepione ognisko
    const seed = Math.max(1, Math.round(200 * 0.02));
    expect(everInfected).toBeLessThanOrEqual(seed);
  });

  it('higher R0 → strictly more people infected (monotone response)', () => {
    const low = runDays({ nAgents: 300, r0: 1.2, seed: 21, contactRadius: 0.03 }, 80);
    const high = runDays({ nAgents: 300, r0: 5, seed: 21, contactRadius: 0.03 }, 80);
    const infected = (w: AgentWorld) => { const c = w.getCounts(); return c.R + c.D + c.I + c.E; };
    expect(infected(high)).toBeGreaterThan(infected(low));
  });
});

describe('agent engine: isolation intervention flattens the outbreak', () => {
  it('isolating symptomatic agents lowers the infection peak vs no isolation (same seed)', () => {
    const noIso = runDays({ nAgents: 300, r0: 4, seed: 33, contactRadius: 0.03, isolationEnabled: false }, 90);
    const withIso = runDays({
      nAgents: 300, r0: 4, seed: 33, contactRadius: 0.03,
      isolationEnabled: true, isolationDelayDays: 1, isolationEffectiveness: 0.9,
    }, 90);
    expect(withIso.getPeakInfected()).toBeLessThan(noIso.getPeakInfected());
  });
});

describe('agent engine: SEIRD mortality', () => {
  it('deaths accrue and scale with IFR', () => {
    const lowIfr = runDays({ nAgents: 300, r0: 4, ifr: 0.01, seed: 8, contactRadius: 0.03 }, 120);
    const highIfr = runDays({ nAgents: 300, r0: 4, ifr: 0.1, seed: 8, contactRadius: 0.03 }, 120);
    expect(highIfr.getCounts().D).toBeGreaterThan(lowIfr.getCounts().D);
  });
});
