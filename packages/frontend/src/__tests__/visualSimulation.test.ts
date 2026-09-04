import { describe, it, expect } from 'vitest';
import { SimulationClock } from '../core/simulationClock/clock';
import { EpidemicCitySimulation, type EpidemicCityParams } from '../core/simulation/epidemicCity';
import { interventionEffects } from '../core/interventions/interventions';
import { resolveContacts } from '../core/interactions/contacts';
import type { SimAgent } from '../core/simulation/types';

const run = (over: Partial<EpidemicCityParams>, days: number): EpidemicCitySimulation => {
  const sim = new EpidemicCitySimulation(over);
  const steps = Math.round(days / 0.05);
  for (let i = 0; i < steps; i++) sim.tick(0.05);
  return sim;
};

describe('SimulationClock — prawdziwy czas, stały krok', () => {
  it('przy pauzie nie tyka; setSpeed(0) zatrzymuje', () => {
    const c = new SimulationClock();
    let n = 0;
    c.advance(1, () => n++);         // domyślnie nie działa (running=false)
    expect(n).toBe(0);
    c.setSpeed(0);
    c.advance(1, () => n++);
    expect(n).toBe(0);
    expect(c.running).toBe(false);
  });

  it('1× wydaje kroki proporcjonalnie do czasu i skaluje z prędkością', () => {
    // fixedStep 0.125 = 1/8 (dokładny w float); wysoki maxDaysPerFrame, by nie clampować.
    const c1 = new SimulationClock({ daysPerSecondAt1x: 1, fixedStepDays: 0.125, maxDaysPerFrame: 100 });
    c1.play(); let s1 = 0; c1.advance(1, () => s1++);
    const c2 = new SimulationClock({ daysPerSecondAt1x: 1, fixedStepDays: 0.125, maxDaysPerFrame: 100 });
    c2.setSpeed(5); let s2 = 0; c2.advance(1, () => s2++);
    expect(s1).toBe(8);            // 1 dzień / 0.125
    expect(s2).toBe(40);           // 5× szybciej
    expect(c2.time).toBeCloseTo(5, 6);
  });

  it('singleStep działa nawet w pauzie', () => {
    const c = new SimulationClock({ fixedStepDays: 0.25 });
    let n = 0; c.singleStep(() => n++);
    expect(n).toBe(1);
    expect(c.time).toBeCloseTo(0.25, 6);
  });
});

describe('EpidemicCitySimulation — świat jako źródło prawdy', () => {
  it('zachowuje populację: S+E+I+R+D = N na każdym kroku', () => {
    const sim = new EpidemicCitySimulation({ nAgents: 200, r0: 3, seed: 1 });
    for (let i = 0; i < 400; i++) {
      sim.tick(0.05);
      const s = sim.stats();
      expect(s.S + s.E + s.I + s.R + s.D).toBe(200);
    }
  });

  it('jest deterministyczna przy ustalonym ziarnie', () => {
    const a = run({ nAgents: 200, r0: 3, seed: 42 }, 40);
    const b = run({ nAgents: 200, r0: 3, seed: 42 }, 40);
    expect(a.stats()).toEqual(b.stats());
  });

  it('MODEL ↔ ZACHOWANIE: wyższe R₀ → wyraźnie więcej zakażonych (nie losowa choreografia)', () => {
    const low = run({ nAgents: 260, r0: 1.2, seed: 7 }, 60);
    const high = run({ nAgents: 260, r0: 4.5, seed: 7 }, 60);
    const infected = (s: EpidemicCitySimulation) => { const st = s.stats(); return st.E + st.I + st.R + st.D; };
    expect(infected(high)).toBeGreaterThan(infected(low));
  });

  it('INTERWENCJA zmienia świat: wysokie restrykcje obniżają szczyt zakażeń', () => {
    const open = run({ nAgents: 260, r0: 4, seed: 9, restrictions: 0 }, 80);
    const locked = run({ nAgents: 260, r0: 4, seed: 9, restrictions: 0.9 }, 80);
    expect(locked.stats().szczyt_I).toBeLessThan(open.stats().szczyt_I);
  });

  it('IZOLACJA: włączona kwarantanna faktycznie izoluje część zakażonych (zmiana zachowania)', () => {
    const sim = new EpidemicCitySimulation({ nAgents: 260, r0: 4, seed: 3, isolate: true });
    for (let i = 0; i < Math.round(50 / 0.05); i++) sim.tick(0.05);
    expect(sim.stats().izolowani).toBeGreaterThan(0);
  });

  it('BRAK FAKE: bez kontaktu (transmissionScale=0) nikt nowy się nie zaraża (tylko ognisko)', () => {
    const sim = run({ nAgents: 260, r0: 5, seed: 11, transmissionScale: 0, initialInfected: 4 }, 40);
    const st = sim.stats();
    // Nikt nie przeszedł przez E; zakażeni pochodzą tylko z ogniska (I+R+D <= seed).
    expect(st.E).toBe(0);
    expect(st.I + st.R + st.D).toBeLessThanOrEqual(4);
  });

  it('debugInfo zwraca stan agenta + źródło zakażenia (Observability)', () => {
    const sim = run({ nAgents: 120, r0: 4, seed: 5 }, 30);
    const info = sim.debugInfo(0);
    expect(info).not.toBeNull();
    expect(info!).toHaveProperty('stan');
    expect(info!).toHaveProperty('zarazony_przez');
  });

  it('zmiana R₀ w locie nie resetuje świata; zmiana liczby agentów tworzy nowy świat', () => {
    const sim = new EpidemicCitySimulation({ nAgents: 200, seed: 2 });
    for (let i = 0; i < 100; i++) sim.tick(0.05);
    const dayBefore = sim.stats().dzien;
    sim.setParam('r0', 5);
    expect(sim.stats().dzien).toBe(dayBefore); // ten sam świat
    sim.setParam('nAgents', 300);
    expect(sim.stats().agenci).toBe(300);
    expect(sim.stats().dzien).toBe(0);          // nowy świat
  });
});

describe('interactions + interventions (warstwy)', () => {
  it('resolveContacts zaraża tylko podatnych w zasięgu, pomija odizolowanych', () => {
    const mk = (id: number, x: number, y: number, state: string, isolated = false): SimAgent => ({
      id, x, y, vx: 0, vy: 0, goalX: x, goalY: y, state, stateSince: 0, isolated, behavior: '', infectedBy: -1,
    });
    const agents = [mk(0, 0, 0, 'I'), mk(1, 5, 0, 'S'), mk(2, 100, 0, 'S'), mk(3, 5, 0, 'S', true)];
    const res = resolveContacts(agents, { contactRadius: 10, beta: 100, dt: 1, rng: () => 0, transmissionScale: 1, susceptible: 'S', infectious: 'I' });
    expect(res.exposures.has(1)).toBe(true);   // blisko → zakażony
    expect(res.exposures.has(2)).toBe(false);  // daleko → nie
    expect(res.exposures.has(3)).toBe(false);  // odizolowany → nie
    expect(res.exposures.get(1)).toBe(0);      // provenance: źródło = agent 0
  });

  it('interventionEffects: poziom 0 = pełna mobilność; wysoki poziom zamyka obiekty i tnie mobilność', () => {
    const none = interventionEffects({ level: 0, isolate: false });
    expect(none.mobilityScale).toBe(1);
    expect(none.transmissionScale).toBe(1);
    expect(none.closedKinds.size).toBe(0);
    const hard = interventionEffects({ level: 1, isolate: true });
    expect(hard.mobilityScale).toBeLessThan(0.5);
    expect(hard.transmissionScale).toBeLessThan(1);
    expect(hard.closedKinds.has('school')).toBe(true);
    expect(hard.closedKinds.has('shop')).toBe(true);
  });
});
