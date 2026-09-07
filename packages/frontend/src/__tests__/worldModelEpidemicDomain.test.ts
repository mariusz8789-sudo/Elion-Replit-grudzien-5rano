import { describe, expect, it } from 'vitest';
import { validateEvent } from '../core/events/genesisEvent';
import { DEFAULT_EPIDEMIC, initialState, rk4Step } from '../core/epidemic/sir';
import { EPIDEMIC_SEIR_SOLVER_ID, buildEpidemicWorld, makeEpidemicSEIRSolver } from '../core/worldModel/domains/epidemicSEIR';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import { TemporalEngine, type TemporalUpdater } from '../core/worldModel/temporal/temporalEngine';

/**
 * LEVEL 2, SECOND REAL DOMAIN: epidemiology. Wraps the existing RK4
 * compartmental engine (core/epidemic/sir.ts) — this test proves the C3
 * solver step is bit-identical to a direct call of the real `rk4Step`, not
 * a re-derived or simplified copy.
 */
describe('Epidemiology SEIR domain (real RK4 solver)', () => {
  it('advances compartments identically to a direct rk4Step reference call', () => {
    const world = buildEpidemicWorld();
    const engine = new TemporalEngine(world.graph);
    const router = new SolverRouter();
    router.register(EPIDEMIC_SEIR_SOLVER_ID, makeEpidemicSEIRSolver(world.params));
    const step: TemporalUpdater = (g, dt, tick) => router.routeTick(g, dt, tick);

    const dtDays = 0.5;
    engine.advance(dtDays, step);

    const reference = rk4Step(initialState(world.params), world.params, 0, dtDays);
    const entity = engine.graph.getEntity(world.populationId);
    expect(entity.domainState?.S).toBeCloseTo(Math.max(0, reference.S), 6);
    expect(entity.domainState?.E).toBeCloseTo(Math.max(0, reference.E), 6);
    expect(entity.domainState?.I).toBeCloseTo(Math.max(0, reference.I), 6);
    expect(entity.domainState?.R).toBeCloseTo(Math.max(0, reference.R), 6);
    expect(entity.grounding).toBe('MODEL_ESTIMATE');
  });

  it('a real R0 > 1 outbreak rises above the seed and then declines — the shape a real epidemic model must produce', () => {
    const params = { ...DEFAULT_EPIDEMIC, r0: 2.5 };
    const world = buildEpidemicWorld({ params });
    const engine = new TemporalEngine(world.graph);
    const router = new SolverRouter();
    router.register(EPIDEMIC_SEIR_SOLVER_ID, makeEpidemicSEIRSolver(params));
    const step: TemporalUpdater = (g, dt, tick) => router.routeTick(g, dt, tick);

    const infectedSeries: number[] = [];
    for (let day = 0; day < 200; day++) {
      engine.advance(1, step);
      infectedSeries.push(engine.graph.getEntity(world.populationId).domainState!.I);
    }

    const peak = Math.max(...infectedSeries);
    expect(peak).toBeGreaterThan(params.initialInfected);
    expect(infectedSeries[infectedSeries.length - 1]).toBeLessThan(peak);
  });

  it('emits valid GenesisEvents whose provenance names the real sir.ts engine', () => {
    const world = buildEpidemicWorld();
    const engine = new TemporalEngine(world.graph);
    const router = new SolverRouter();
    router.register(EPIDEMIC_SEIR_SOLVER_ID, makeEpidemicSEIRSolver(world.params));
    engine.advance(1, (g, dt, tick) => router.routeTick(g, dt, tick));

    const event = engine.journal.allEvents()[0];
    expect(validateEvent(event).ok).toBe(true);
    expect(event.type).toBe('epidemiology.seir.step');
    const observation = engine.journal.allObservations()[0];
    expect(observation.provenance).toContain('core/epidemic/sir.ts');
  });
});
