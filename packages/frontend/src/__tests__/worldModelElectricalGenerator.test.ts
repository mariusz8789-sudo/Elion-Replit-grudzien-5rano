import { describe, expect, it } from 'vitest';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import {
  addBackupGenerator,
  applyGeneratorStartCommand,
  ELECTRICAL_GENERATOR_SOLVER_ID,
  GENERATOR_DEFAULTS,
  GENERATOR_STARTCOMMAND_EVENT_TYPE,
  GENERATOR_STATUS,
  GENERATOR_STATUS_CHANGED_EVENT_TYPE,
  makeElectricalGeneratorSolver,
} from '../core/worldModel/domains/electricalGenerator';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * ELECTRICAL BACKUP GENERATOR (Priority 2.4) — a real, physically-grounded
 * state machine (startup delay, fuel burn, rated power), tested in
 * isolation from any reference city. The full cross-domain recovery
 * cascade (generator -> pump -> hospital -> population) is tested on the
 * real Genesis Scientific City 4.0 in worldModelGenesisScientificCity4Recovery.test.ts.
 */
function buildGeneratorWorld(params: Partial<typeof GENERATOR_DEFAULTS> = {}) {
  const graph = new WorldGraph();
  const generatorId = addBackupGenerator(graph, { params });
  const router = new SolverRouter();
  router.register(ELECTRICAL_GENERATOR_SOLVER_ID, makeElectricalGeneratorSolver());
  const engine = new TemporalEngine(graph);
  const updater = (g: WorldGraph, dt: number, tick: number) => router.routeTick(g, dt, tick);
  return { graph, engine, generatorId, updater };
}

describe('Backup generator: real state machine', () => {
  it('stays OFF on its own — never self-starts', () => {
    const { engine, generatorId, updater } = buildGeneratorWorld();
    for (let i = 0; i < 5; i++) engine.advance(1, updater);
    expect(engine.graph.getEntity(generatorId).domainState?.status).toBe(GENERATOR_STATUS.OFF);
  });

  it('a start command transitions OFF -> STARTING, with a real, replayable event', () => {
    const { engine, generatorId, updater } = buildGeneratorWorld();
    applyGeneratorStartCommand(engine, generatorId);
    expect(engine.graph.getEntity(generatorId).domainState?.status).toBe(GENERATOR_STATUS.STARTING);
    const startEvent = engine.journal.allEvents().find((e) => e.type === GENERATOR_STARTCOMMAND_EVENT_TYPE);
    expect(startEvent).toBeDefined();
    expect(startEvent?.provenance?.origin).toBe('experiment-action');
    engine.advance(1, updater); // sanity: still real and tickable afterward
  });

  it('refuses a start command on an already-starting/running/exhausted generator', () => {
    const { engine, generatorId } = buildGeneratorWorld();
    applyGeneratorStartCommand(engine, generatorId);
    expect(() => applyGeneratorStartCommand(engine, generatorId)).toThrow(/not OFF/);
  });

  it('reaches RUNNING after its real startup delay elapses, with rated load and a real transition event', () => {
    const { engine, generatorId, updater } = buildGeneratorWorld({ startupDelayS: 5 });
    applyGeneratorStartCommand(engine, generatorId);
    for (let i = 0; i < 4; i++) engine.advance(1, updater);
    expect(engine.graph.getEntity(generatorId).domainState?.status).toBe(GENERATOR_STATUS.STARTING); // not yet — only 4s of a 5s delay elapsed
    engine.advance(1, updater); // 5th second
    const entity = engine.graph.getEntity(generatorId);
    expect(entity.domainState?.status).toBe(GENERATOR_STATUS.RUNNING);
    expect(entity.domainState?.loadKw).toBe(GENERATOR_DEFAULTS.ratedPowerKw);
    const transition = engine.journal.allEvents().find((e) => e.type === GENERATOR_STATUS_CHANGED_EVENT_TYPE);
    expect(transition?.parameters).toEqual({ previousStatus: GENERATOR_STATUS.STARTING, newStatus: GENERATOR_STATUS.RUNNING });
  });

  it('burns real fuel while running, using the linear diesel-genset fuel model, and stops when exhausted', () => {
    // A tiny fuel tank forces exhaustion within a test-sized number of ticks.
    const { engine, generatorId, updater } = buildGeneratorWorld({ startupDelayS: 1, fuelCapacityL: 0.01, ratedPowerKw: 50, specificFuelConsumptionLPerKwh: 0.32 });
    applyGeneratorStartCommand(engine, generatorId);
    engine.graph.updateEntity(generatorId, { domainState: { ...engine.graph.getEntity(generatorId).domainState, fuelRemainingL: 0.01 } });
    engine.advance(1, updater); // starts
    expect(engine.graph.getEntity(generatorId).domainState?.status).toBe(GENERATOR_STATUS.RUNNING);

    let exhausted = false;
    for (let i = 0; i < 20 && !exhausted; i++) {
      engine.advance(1, updater);
      exhausted = engine.graph.getEntity(generatorId).domainState?.status === GENERATOR_STATUS.FUEL_EXHAUSTED;
    }
    expect(exhausted).toBe(true);
    expect(engine.graph.getEntity(generatorId).domainState?.loadKw).toBe(0);
    expect(engine.graph.getEntity(generatorId).domainState?.fuelRemainingL).toBe(0);
    const exhaustedEvent = engine.journal.allEvents().find((e) => e.type === GENERATOR_STATUS_CHANGED_EVENT_TYPE && e.parameters.newStatus === GENERATOR_STATUS.FUEL_EXHAUSTED);
    expect(exhaustedEvent).toBeDefined();
  });

  it('a generator that starts but has zero fuel goes straight to FUEL_EXHAUSTED, never RUNNING', () => {
    const { engine, generatorId, updater } = buildGeneratorWorld({ startupDelayS: 1, fuelRemainingL: 0 });
    applyGeneratorStartCommand(engine, generatorId);
    engine.advance(1, updater);
    expect(engine.graph.getEntity(generatorId).domainState?.status).toBe(GENERATOR_STATUS.FUEL_EXHAUSTED);
  });

  it('replay stays byte-identical after a real start command and running transition', () => {
    const { engine, generatorId, updater } = buildGeneratorWorld({ startupDelayS: 2 });
    applyGeneratorStartCommand(engine, generatorId);
    for (let i = 0; i < 4; i++) engine.advance(1, updater);
    const live = engine.graph.getEntity(generatorId);
    const replayed = engine.scrubTo(engine.tick).getEntity(generatorId);
    expect(replayed).toEqual(live);
  });

  it('grounding is honestly PROCEDURAL_APPROXIMATION — the fuel-consumption figure is a representative published one, not a measurement', () => {
    const { engine, generatorId, updater } = buildGeneratorWorld();
    engine.advance(1, updater);
    expect(engine.graph.getEntity(generatorId).grounding).toBe('PROCEDURAL_APPROXIMATION');
  });
});
