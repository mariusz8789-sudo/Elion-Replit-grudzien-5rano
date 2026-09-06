import { describe, expect, it } from 'vitest';
import { describeWorldMoment, explainEntityChange } from '../core/worldModel/bridge/worldFrameState';
import { CHEMISTRY_KINETICS_SOLVER_ID, buildChemistryExperimentWorld, makeChemistryKineticsSolver } from '../core/worldModel/domains/chemistryKinetics';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import { TemporalEngine, type TemporalUpdater } from '../core/worldModel/temporal/temporalEngine';

/**
 * LEVEL 2, C1 LOOKING GLASS (#10): "what is happening here?" and "why did
 * this state change?" must be answered from real C3 state/evidence, never
 * an invented narrative.
 */
describe('C1 "what is happening / why" queries answer from real state', () => {
  function buildTickedEngine() {
    const world = buildChemistryExperimentWorld({ initialTemperatureK: 800 });
    const engine = new TemporalEngine(world.graph);
    const router = new SolverRouter();
    router.register(CHEMISTRY_KINETICS_SOLVER_ID, makeChemistryKineticsSolver());
    const step: TemporalUpdater = (g, dt, tick) => router.routeTick(g, dt, tick);
    engine.advance(3600, step);
    return { world, engine };
  }

  it('describeWorldMoment reports the real solver, grounding, branch, and latest recorded evidence', () => {
    const { world, engine } = buildTickedEngine();

    const moment = describeWorldMoment(engine, world.substanceId);
    expect(moment.tick).toBe(1);
    expect(moment.branchId).toBe(engine.branchId);
    expect(moment.solverId).toBe(CHEMISTRY_KINETICS_SOLVER_ID);
    expect(moment.grounding).toBe('MODEL_ESTIMATE');
    expect(moment.latestEvent?.type).toBe('chemistry.kinetics.step');
    expect(moment.latestObservation?.measurements.some((m) => m.key === 'rateConstant')).toBe(true);
    expect(moment.canReplay).toBe(true);
  });

  it('explainEntityChange traces the real causing event via the existing traceWorldChange contract', () => {
    const { world, engine } = buildTickedEngine();

    const trace = explainEntityChange(engine, world.substanceId);
    expect(trace).not.toBeNull();
    expect(trace!.event.type).toBe('chemistry.kinetics.step');
    expect(trace!.affectedEntities.map((e) => e.ref.id)).toContain('substance-1');
    expect(trace!.parentEvent).toBeNull(); // first-ever event on this entity has no predecessor
  });

  it('returns null / canReplay:false-equivalent honestly when nothing has happened yet — no invented narrative', () => {
    const world = buildChemistryExperimentWorld();
    const engine = new TemporalEngine(world.graph);

    expect(explainEntityChange(engine, world.substanceId)).toBeNull();
    const moment = describeWorldMoment(engine, world.substanceId);
    expect(moment.latestEvent).toBeNull();
    expect(moment.latestObservation).toBeNull();
    expect(moment.canReplay).toBe(false);
  });
});
