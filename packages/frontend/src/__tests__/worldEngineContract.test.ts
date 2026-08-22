import { describe, expect, it } from 'vitest';
import { EpidemicCitySimulation } from '../core/simulation/epidemicCity';
import {
  projectWorldState,
  projectMobilityState,
  computeHotspots,
  WORLD_ENGINE_CONTRACT_VERSION,
  WORLD_NOT_MODELED,
  type AgentStateView,
} from '../core/simulation/worldEngineContract';

const sim = (over = {}) => new EpidemicCitySimulation({ nAgents: 120, initialInfected: 6, seed: 4242, ...over });

const run = (s: EpidemicCitySimulation, days: number) => {
  for (let i = 0; i < days * 4; i++) s.tick(0.25);
  return s;
};

const agent = (over: Partial<AgentStateView>): AgentStateView => ({
  id: 0, x: 0, y: 0, vx: 0, vy: 0, health: 'S', isolated: false, hospitalized: false, behavior: 'idzie', ...over,
});

describe('World Engine contract — one read-only projection of the real world state', () => {
  it('carries a contract version so the consumer can pin what it reads', () => {
    expect(projectWorldState(sim()).contractVersion).toBe(WORLD_ENGINE_CONTRACT_VERSION);
  });

  it('epidemic counts are exactly what the model reports — nothing recomputed', () => {
    const s = run(sim(), 12);
    const stats = s.stats();
    const w = projectWorldState(s);
    expect(w.epidemic.susceptible).toBe(stats.S);
    expect(w.epidemic.exposed).toBe(stats.E);
    expect(w.epidemic.infectious).toBe(stats.I);
    expect(w.epidemic.recovered).toBe(stats.R);
    expect(w.epidemic.deceased).toBe(stats.D);
    expect(w.epidemic.hospitalized).toBe(stats.hospitalizowani);
    expect(w.epidemic.peakInfectious).toBe(stats.szczyt_I);
    expect(w.clock.day).toBe(stats.dzien);
    expect(w.clock.population).toBe(stats.agenci);
  });

  it('projects every real agent and invents none', () => {
    const s = run(sim(), 8);
    const w = projectWorldState(s);
    expect(w.agents.length).toBe(s.agents().length);
    expect(w.agents.length).toBe(w.clock.population);
    const ids = new Set(s.agents().map((a) => a.id));
    for (const a of w.agents) expect(ids.has(a.id)).toBe(true);
  });

  it('the SEIRD compartments sum to the projected population', () => {
    const s = run(sim(), 15);
    const e = projectWorldState(s).epidemic;
    expect(e.susceptible + e.exposed + e.infectious + e.recovered + e.deceased).toBe(s.stats().agenci);
  });

  it('is a pure read: projecting twice does not advance or mutate the model', () => {
    const s = run(sim(), 10);
    const before = { ...s.stats() };
    const a = projectWorldState(s);
    const b = projectWorldState(s);
    expect(s.stats()).toEqual(before);
    expect(b).toEqual(a);
  });

  it('does not hand the consumer a live handle on the simulation buffers', () => {
    const s = run(sim(), 6);
    const w = projectWorldState(s);
    const modelAgent = s.agents()[0];
    const viewAgent = w.agents.find((a) => a.id === modelAgent.id)!;
    viewAgent.x = -99999;
    expect(s.agents()[0].x).not.toBe(-99999);
    expect(w.agents[0]).not.toBe(s.agents()[0] as unknown);
  });

  it('two runs with the same seed produce an identical projection', () => {
    const a = projectWorldState(run(sim(), 9));
    const b = projectWorldState(run(sim(), 9));
    expect(b).toEqual(a);
  });

  it('exposes locations with their real closed flag, not a guess', () => {
    const s = sim();
    const w = projectWorldState(s);
    expect(w.locations.length).toBe(s.objects().length);
    for (const [i, loc] of w.locations.entries()) {
      expect(loc.kind).toBe(s.objects()[i].kind);
      expect(loc.closed).toBe(Boolean(s.objects()[i].closed));
    }
  });

  it('hospital state is wired from the real hospitalised count', () => {
    const s = run(sim({ severeRate: 0.4 }), 20);
    const w = projectWorldState(s);
    expect(s.stats().hospitalizowani).toBeGreaterThan(0); // inaczej test byłby pusty
    expect(w.hospital.requiredCare).toBe(s.stats().hospitalizowani);
    expect(w.hospital.occupiedBeds + w.hospital.occupiedIcu + w.hospital.unmetCare).toBe(w.hospital.requiredCare);
    expect(w.hospital.day).toBe(w.clock.day);
  });

  it('world bounds come from the model layout', () => {
    const s = sim();
    expect(projectWorldState(s).world).toEqual({ width: s.worldWidth, height: s.worldHeight });
  });
});

describe('World Engine contract — hotspots', () => {
  it('aggregates only genuinely infectious agents', () => {
    const hs = computeHotspots([
      agent({ id: 1, x: 10, y: 10, health: 'I' }),
      agent({ id: 2, x: 20, y: 20, health: 'I' }),
      agent({ id: 3, x: 15, y: 15, health: 'S' }),
      agent({ id: 4, x: 15, y: 15, health: 'E' }),
      agent({ id: 5, x: 15, y: 15, health: 'D' }),
    ], 60);
    expect(hs).toEqual([{ x: 30, y: 30, infectious: 2 }]);
  });

  it('returns nothing when nobody is infectious — no phantom heat', () => {
    expect(computeHotspots([agent({ health: 'S' }), agent({ health: 'R' })])).toEqual([]);
  });

  it('separates agents that fall into different cells and sorts hottest first', () => {
    const hs = computeHotspots([
      agent({ id: 1, x: 5, y: 5, health: 'I' }),
      agent({ id: 2, x: 65, y: 5, health: 'I' }),
      agent({ id: 3, x: 70, y: 5, health: 'I' }),
      agent({ id: 4, x: 75, y: 5, health: 'I' }),
    ], 60);
    expect(hs.map((h) => h.infectious)).toEqual([3, 1]);
    expect(hs[0].x).toBe(90);
  });

  it('the projected hotspot total equals the projected infectious count', () => {
    const s = run(sim(), 14);
    const w = projectWorldState(s);
    const inHotspots = w.hotspots.reduce((n, h) => n + h.infectious, 0);
    const infectiousAgents = w.agents.filter((a) => a.health === 'I').length;
    expect(inHotspots).toBe(infectiousAgents);
  });
});

describe('World Engine contract — mobility and transmissions', () => {
  it('mobility is derived from the real intervention parameters', () => {
    const m = projectMobilityState({ mobility: 0.8, restrictions: 0, isolate: false });
    expect(m.mobilityScale).toBe(1);
    expect(m.effectiveMobility).toBeCloseTo(0.8, 10);
    expect(m.closedKinds).toEqual([]);
    expect(m.isolationEnabled).toBe(false);
  });

  it('restrictions reduce mobility and close the same places the model closes', () => {
    const m = projectMobilityState({ mobility: 0.8, restrictions: 1, isolate: true });
    expect(m.mobilityScale).toBeCloseTo(0.25, 10);
    expect(m.effectiveMobility).toBeCloseTo(0.2, 10);
    expect(m.contactTransmissionScale).toBeCloseTo(0.4, 10);
    expect(m.closedKinds).toEqual(['school', 'shop']);
    expect(m.isolationEnabled).toBe(true);
  });

  it('the projected mobility follows the simulation parameters that are actually set', () => {
    const s = sim({ mobility: 0.6, restrictions: 0.5, isolate: true });
    const m = projectWorldState(s).mobility;
    expect(m.baseMobility).toBe(0.6);
    expect(m.restrictionLevel).toBe(0.5);
    expect(m.closedKinds).toEqual(['school']);
  });

  it('transmissions mirror the model tick and are copies, not the live buffer', () => {
    // Transmisje są efemeryczne (tylko z ostatniego ticku), więc tykamy do
    // momentu, w którym model faktycznie je zgłosi — test nie może przejść pusty.
    const s = sim();
    let ticks = 0;
    while (s.lastTransmissions().length === 0 && ticks < 400) { s.tick(0.25); ticks++; }
    expect(s.lastTransmissions().length).toBeGreaterThan(0);

    const live = s.lastTransmissions();
    const w = projectWorldState(s);
    expect(w.transmissions.length).toBe(live.length);
    for (const [i, t] of w.transmissions.entries()) {
      expect(t).toEqual(live[i]);
      expect(t).not.toBe(live[i]);           // kopia, nie żywy bufor modelu
      expect(Number.isFinite(t.x)).toBe(true);
      expect(t.to).toBeGreaterThanOrEqual(0);
    }
  });

  it('an empty tick reports zero transmissions instead of stale ones', () => {
    const s = sim({ initialInfected: 0 });
    run(s, 5);
    expect(projectWorldState(s).transmissions).toEqual([]);
  });
});

describe('World Engine contract — honesty', () => {
  it('declares what the scientific core does NOT model', () => {
    const w = projectWorldState(sim());
    expect(w.notModeled).toBe(WORLD_NOT_MODELED);
    expect(w.notModeled).toContain('vehicle-traffic');
    expect(w.notModeled).toContain('public-transport-flow');
    expect(w.notModeled).toContain('weather');
  });

  it('ResourceState is declared NOT_MODELED rather than shipped as an empty mock', () => {
    const w = projectWorldState(sim()) as unknown as Record<string, unknown>;
    expect(w.resources).toBeUndefined();
    expect(WORLD_NOT_MODELED).toContain('resource-stock-levels');
  });
});
