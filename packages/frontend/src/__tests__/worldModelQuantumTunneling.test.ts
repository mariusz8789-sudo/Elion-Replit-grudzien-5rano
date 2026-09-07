import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../core/events/hash';
import { runTunnelingScenario } from '../core/quantum/tunnelingRunner';
import { toGraphicsWorldFrame } from '../core/worldModel/bridge/graphicsWorldFrameAdapter';
import { executeIntervention, getFrameState } from '../core/worldModel/bridge/worldFrameState';
import { buildGenesisScientificCity4 } from '../core/worldModel/domains/genesisScientificCity4';
import {
  addTunnelJunction,
  BARRIER_TRANSPARENT_THRESHOLD,
  classifyTunnelingTransmission,
  makeQuantumTunnelingSolver,
  QUANTUM_TUNNELING_SOLVER_ID,
  QUANTUM_TUNNELING_STATES,
  STM_IMAGING_LOST_EVENT_TYPE,
  STM_IMAGING_RESTORED_EVENT_TYPE,
  TUNNELING_DETECTED_THRESHOLD,
} from '../core/worldModel/domains/quantumTunneling';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import { getCausalAncestry } from '../core/worldModel/queries/worldQueries';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * PHASE 2 — QUANTUM INTEGRATION. The split-step Fourier Schrödinger solver
 * (`core/quantum/tunnelingRunner.ts`) was already real and tested but had
 * ZERO connection to the world model. These tests prove it is now a genuine
 * `DomainSolver` on the existing `SolverRouter`, that the REAL runner (not a
 * re-implementation) produces every number, and that what reaches C2 obeys
 * `graphics/ADAPTER_CONTRACT.md`.
 */
function buildJunctionWorld(params?: Record<string, number>) {
  const graph = new WorldGraph();
  const junctionId = addTunnelJunction(graph, { params });
  const router = new SolverRouter();
  router.register(QUANTUM_TUNNELING_SOLVER_ID, makeQuantumTunnelingSolver());
  const engine = new TemporalEngine(graph);
  const updater = (g: WorldGraph, dt: number, tick: number) => router.routeTick(g, dt, tick);
  return { engine, junctionId, updater };
}

describe('Quantum tunnelling solver: a real wrapper, not a second implementation', () => {
  it('produces exactly what the real runner produces for the same parameters', () => {
    const { engine, junctionId, updater } = buildJunctionWorld({ energy: 0.55, barrier: 1, width: 3, frames: 600 });
    engine.advance(1, updater);

    // Computed independently, straight from the existing runner. If the solver had re-implemented
    // (or approximated) the physics, these would not match to the last bit.
    const direct = runTunnelingScenario({ energy: 0.55, barrier: 1, width: 3, frames: 600 });
    const state = engine.graph.getEntity(junctionId).domainState!;
    expect(state.transmission).toBe(direct.transmission);
    expect(state.reflection).toBe(direct.reflection);
    expect(state.remainingProbability).toBe(direct.remainingProbability);
  });

  it('reproduces real tunnelling behaviour: a wider barrier suppresses transmission, more energy increases it', () => {
    const transmissionFor = (params: Record<string, number>) => {
      const { engine, junctionId, updater } = buildJunctionWorld({ frames: 600, ...params });
      engine.advance(1, updater);
      return engine.graph.getEntity(junctionId).domainState!.transmission;
    };

    const narrow = transmissionFor({ energy: 0.55, barrier: 1, width: 1 });
    const wide = transmissionFor({ energy: 0.55, barrier: 1, width: 6 });
    expect(wide).toBeLessThan(narrow); // exponential suppression with barrier width

    const lowEnergy = transmissionFor({ energy: 0.3, barrier: 1, width: 3 });
    const highEnergy = transmissionFor({ energy: 1.5, barrier: 1, width: 3 });
    expect(highEnergy).toBeGreaterThan(lowEnergy);
  });

  it('clamps an out-of-range intervention instead of throwing, and stores the parameters actually used', () => {
    const { engine, junctionId, updater } = buildJunctionWorld({ frames: 300 });
    engine.advance(1, updater);

    // The runner THROWS outside its validated range; a solver that threw would abort the whole
    // world's tick for every other domain.
    executeIntervention(engine, junctionId, { 'domainState.width': 999 });
    expect(() => engine.advance(1, updater)).not.toThrow();

    const state = engine.graph.getEntity(junctionId).domainState!;
    expect(state.width).toBe(8); // the runner's own documented maximum
    // The stored state must describe the experiment that actually ran, not the rejected request.
    expect(state.transmission).toBe(runTunnelingScenario({ energy: state.energy, barrier: state.barrier, width: 8, frames: state.frames }).transmission);
  });

  it('memoisation is exact: a cached tick returns what a fresh solver computes', () => {
    const { engine, junctionId, updater } = buildJunctionWorld({ frames: 300 });
    engine.advance(1, updater);
    const first = canonicalJson(engine.graph.getEntity(junctionId).domainState);
    engine.advance(1, updater); // same parameters -> cache hit
    expect(canonicalJson(engine.graph.getEntity(junctionId).domainState)).toBe(first);

    const fresh = buildJunctionWorld({ frames: 300 });
    fresh.engine.advance(1, fresh.updater);
    expect(canonicalJson(fresh.engine.graph.getEntity(fresh.junctionId).domainState)).toBe(first);
  });
});

describe('Status classification: a finite enum derived from a numeric scalar', () => {
  it('maps the real transmission scalar onto the allowlisted states, including at the thresholds', () => {
    expect(classifyTunnelingTransmission(0)).toBe('QUANTUM_BARRIER_OPAQUE');
    expect(classifyTunnelingTransmission(TUNNELING_DETECTED_THRESHOLD / 2)).toBe('QUANTUM_BARRIER_OPAQUE');
    expect(classifyTunnelingTransmission(TUNNELING_DETECTED_THRESHOLD)).toBe('QUANTUM_TUNNELING_DETECTED');
    expect(classifyTunnelingTransmission(BARRIER_TRANSPARENT_THRESHOLD / 2)).toBe('QUANTUM_TUNNELING_DETECTED');
    expect(classifyTunnelingTransmission(BARRIER_TRANSPARENT_THRESHOLD)).toBe('QUANTUM_BARRIER_TRANSPARENT');
    expect(classifyTunnelingTransmission(1)).toBe('QUANTUM_BARRIER_TRANSPARENT');
  });

  it('never returns a value outside the exported allowlist, even for a nonsense input', () => {
    for (const value of [Number.NaN, -1, Number.POSITIVE_INFINITY, 1e9]) {
      expect(QUANTUM_TUNNELING_STATES).toContain(classifyTunnelingTransmission(value));
    }
  });

  it('what reaches C2 is an allowlisted enum token and the numeric scalar behind it — never prose', () => {
    const city = buildGenesisScientificCity4({ withQuantumLab: true, worldId: 'q-c2-contract' });
    const engine = city.base.engine;
    engine.advance(1, city.updater);

    const frame = toGraphicsWorldFrame(getFrameState(engine));
    const junction = frame.entities.find((entity) => entity.id === city.tunnelJunctionId)!;

    // ADAPTER_CONTRACT.md rule 2: an adapter gates on `KNOWN_STATES.has(status)`. Prose could never
    // be allowlisted, so it would silently render as unmodeled.
    expect(QUANTUM_TUNNELING_STATES).toContain(junction.status as (typeof QUANTUM_TUNNELING_STATES)[number]);
    expect(junction.grounding).toBe('MODELED');
    // The scalar the status was derived FROM is exposed too, so a consumer never has to parse a label.
    expect(junction.scalars).toBeDefined();
    expect(typeof junction.scalars!.transmission).toBe('number');
    expect(junction.scalars!.transmission).toBe(engine.graph.getEntity(city.tunnelJunctionId!).domainState!.transmission);
  });
});

describe('Quantum -> chemistry coupling in the living city', () => {
  it('an opaque junction really disables STM imaging of the sample, and recovery re-enables it', () => {
    const city = buildGenesisScientificCity4({ withQuantumLab: true, worldId: 'q-coupling' });
    const engine = city.base.engine;
    const substance = () => engine.graph.getEntity(city.substanceId);
    engine.advance(1, city.updater);
    engine.advance(1, city.updater);

    // Widening the junction gap is a REAL parameter change; the solver's own physics collapses
    // transmission, and only then does the coupling react.
    executeIntervention(engine, city.tunnelJunctionId!, { 'domainState.width': 8 });
    engine.advance(1, city.updater);
    engine.advance(1, city.updater);

    expect(engine.graph.getEntity(city.tunnelJunctionId!).statusLabel).toBe('QUANTUM_BARRIER_OPAQUE');
    expect(substance().domainState?.stmImagingAvailable).toBe(0);
    expect(engine.journal.allEvents().map((e) => e.type)).toContain(STM_IMAGING_LOST_EVENT_TYPE);

    executeIntervention(engine, city.tunnelJunctionId!, { 'domainState.width': 3, 'domainState.energy': 1.5 });
    engine.advance(1, city.updater);
    engine.advance(1, city.updater);

    expect(engine.graph.getEntity(city.tunnelJunctionId!).statusLabel).toBe('QUANTUM_BARRIER_TRANSPARENT');
    expect(substance().domainState?.stmImagingAvailable).toBe(1);
    expect(engine.journal.allEvents().map((e) => e.type)).toContain(STM_IMAGING_RESTORED_EVENT_TYPE);
  });

  it("never touches the sample's real Arrhenius chemistry — only instrument availability", () => {
    const city = buildGenesisScientificCity4({ withQuantumLab: true, worldId: 'q-chem-untouched' });
    const engine = city.base.engine;
    engine.advance(1, city.updater);
    const chemicalBefore = canonicalJson(engine.graph.getEntity(city.substanceId).chemical);

    executeIntervention(engine, city.tunnelJunctionId!, { 'domainState.width': 8 });
    engine.advance(1, city.updater);
    engine.advance(1, city.updater);

    expect(engine.graph.getEntity(city.substanceId).domainState?.stmImagingAvailable).toBe(0);
    // The chemistry solver keeps evolving `chemical` on its own; what matters is that the QUANTUM
    // coupling wrote nothing into it. Its activation energy / pre-exponential are untouched.
    const chemicalAfter = engine.graph.getEntity(city.substanceId).chemical!;
    expect(chemicalAfter.activationEnergyKJ).toBe(JSON.parse(chemicalBefore).activationEnergyKJ);
    expect(chemicalAfter.preExponentialLog10).toBe(JSON.parse(chemicalBefore).preExponentialLog10);
  });

  it('the imaging loss is causally traceable to the real tunnelling transition that caused it', () => {
    const city = buildGenesisScientificCity4({ withQuantumLab: true, worldId: 'q-causal' });
    const engine = city.base.engine;
    engine.advance(1, city.updater);
    executeIntervention(engine, city.tunnelJunctionId!, { 'domainState.width': 8 });
    engine.advance(1, city.updater);
    engine.advance(1, city.updater);

    const lost = engine.journal.allEvents().find((e) => e.type === STM_IMAGING_LOST_EVENT_TYPE)!;
    expect(getCausalAncestry(engine, lost.id).map((e) => e.type)).toContain('quantum.tunneling.statechanged');
  });

  it('replay stays byte-identical across the whole quantum intervention sequence', () => {
    const city = buildGenesisScientificCity4({ withQuantumLab: true, worldId: 'q-replay' });
    const engine = city.base.engine;
    engine.advance(1, city.updater);
    executeIntervention(engine, city.tunnelJunctionId!, { 'domainState.width': 8 });
    engine.advance(1, city.updater);
    executeIntervention(engine, city.tunnelJunctionId!, { 'domainState.energy': 1.5, 'domainState.width': 3 });
    engine.advance(1, city.updater);

    const sortById = (entities: readonly { id: string }[]) => [...entities].sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(canonicalJson(sortById(engine.scrubTo(engine.tick).listEntities()))).toBe(canonicalJson(sortById(engine.graph.listEntities())));
  });
});

describe('The quantum lab is strictly opt-in', () => {
  it('the default flagship city has no junction and no quantum domain', () => {
    const city = buildGenesisScientificCity4({ worldId: 'q-optout' });
    expect(city.tunnelJunctionId).toBeUndefined();
    expect(city.base.availableDomains).not.toContain('quantum-mechanics');
    expect(city.base.availableDomains).toEqual(['chemistry-kinetics', 'electrical-engineering', 'environment-hydrology', 'epidemiology', 'hydraulics-engineering']);
  });

  it('opting in adds the quantum domain to the SAME world, alongside the existing five', () => {
    const city = buildGenesisScientificCity4({ withQuantumLab: true, worldId: 'q-optin' });
    expect(city.tunnelJunctionId).toBe('tunnel-junction:stm-1');
    expect(city.base.availableDomains).toEqual(['chemistry-kinetics', 'electrical-engineering', 'environment-hydrology', 'epidemiology', 'hydraulics-engineering', 'quantum-mechanics']);
  });

  it('the rainfall cascade still runs identically with the quantum lab enabled', () => {
    const city = buildGenesisScientificCity4({ rainfallAtTick: 1, withQuantumLab: true, worldId: 'q-rainfall' });
    const engine = city.base.engine;
    for (let i = 0; i < 5; i++) engine.advance(1, city.updater);

    const types = engine.journal.allEvents().map((e) => e.type);
    expect(types).toContain('hydraulics.pumppipe.tripped');
    expect(types).toContain('building.waterservice.interrupted');
    expect(engine.graph.getEntity(city.pumpPipeId).domainState?.volumetricFlow).toBe(0);
  });
});
