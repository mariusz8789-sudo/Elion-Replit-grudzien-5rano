import { describe, expect, it } from 'vitest';
import {
  compareBranches,
  describeWorldMoment,
  explainEntityChange,
  getFrameState,
  packTransformBuffer,
  querySpatialContext,
} from '../core/worldModel/bridge/worldFrameState';
import {
  CHEMISTRY_KINETICS_SOLVER_ID,
  buildChemistryExperimentWorld,
  makeChemistryKineticsSolver,
} from '../core/worldModel/domains/chemistryKinetics';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import { TemporalBranchRegistry, TemporalEngine, type TemporalUpdater } from '../core/worldModel/temporal/temporalEngine';

/**
 * LEVEL 2, THE BIG DEMO (#11): "show me what happens to this substance over
 * 24 hours" — end to end through every stage the mission requires: real
 * solver, temporal history, evidence/provenance, C2 frame state, C1
 * observation, replay, and a counterfactual branch comparison.
 */
describe('BIG DEMO: what happens to this substance over 24 hours', () => {
  it('runs the full real chain: solver -> temporal history -> evidence -> frame state -> observation -> replay -> counterfactual branch -> comparison', () => {
    // 1-3: create the scientific world and bind the real solver.
    const world = buildChemistryExperimentWorld({ substanceLabel: 'Compound X', formula: 'C8H10N4O2', initialTemperatureK: 800 });
    const registry = new TemporalBranchRegistry();
    const engine = new TemporalEngine(world.graph, { label: '800K-run', registry });
    const router = new SolverRouter();
    router.register(CHEMISTRY_KINETICS_SOLVER_ID, makeChemistryKineticsSolver());
    const step: TemporalUpdater = (g, dt, tick) => router.routeTick(g, dt, tick);

    // 4-6: evolve the world through time, one real solver step per hour, for 24 hours.
    for (let hour = 1; hour <= 24; hour++) engine.advance(3600, step);
    expect(engine.historyLength).toBe(24);
    // 6: every step recorded observation/evidence — nothing silently skipped.
    expect(engine.journal.allEvents()).toHaveLength(24);
    expect(engine.journal.allObservations()).toHaveLength(24);

    // 7: expose the evolving state to C2.
    const finalFrame = getFrameState(engine);
    const substanceFrame = finalFrame.entities.find((e) => e.id === world.substanceId)!;
    expect(substanceFrame.scalars.concentrationFraction).toBeLessThan(1);
    expect(substanceFrame.scalars.temperatureK).toBe(800);
    expect(substanceFrame.grounding).toBe('MODEL_ESTIMATE');
    const buffer = packTransformBuffer(finalFrame);
    expect(buffer.length).toBe(finalFrame.entities.length * 3);

    // 8: C1 presents it — the substance is where the experiment placed it.
    const nearby = querySpatialContext(engine, { x: 1, y: 0, z: 0 }, 0.5);
    expect(nearby.map((e) => e.id)).toContain(world.substanceId);

    // 9: user scrubs through time — concentration is strictly decreasing, a real trajectory.
    const at6 = getFrameState(engine, 6).entities.find((e) => e.id === world.substanceId)!;
    const at18 = getFrameState(engine, 18).entities.find((e) => e.id === world.substanceId)!;
    expect(at18.scalars.concentrationFraction).toBeLessThan(at6.scalars.concentrationFraction);

    // 10: user inspects an event — "what is happening" and "why" agree with each other and with real evidence.
    const moment = describeWorldMoment(engine, world.substanceId, 12);
    expect(moment.latestEvent?.type).toBe('chemistry.kinetics.step');
    const trace = explainEntityChange(engine, world.substanceId, 12);
    expect(trace?.event.id).toBe(moment.latestEvent?.id);

    // 11: user replays it — every tick's recorded state is present and consistent.
    for (let hour = 0; hour <= 24; hour++) {
      expect(engine.scrubTo(hour).getEntity(world.substanceId).chemical?.concentrationFraction).toBeDefined();
    }

    // 12: user creates a counterfactual branch from hour 12 — a cooler variant.
    const cooler = engine.forkBranch(12, 'cooler-700K', (g) => {
      const current = g.getEntity(world.substanceId);
      g.updateEntity(world.substanceId, { physics: { ...current.physics!, temperatureK: 700 } });
    });
    // The original 800K run needs no further advancement — it already ran the full 24 hours.
    // The cooler branch must run its own remaining 12 hours to reach the same tick for comparison.
    for (let hour = 13; hour <= 24; hour++) cooler.advance(3600, step);

    // 13: compare both outcomes.
    const comparison = compareBranches(registry, engine.branchId, cooler.branchId, 24);
    const diff = comparison.entityDiffs.find((d) => d.id === world.substanceId)!;
    expect(diff.equal).toBe(false);
    // Cooler branch decayed slower after the fork, so it retains MORE of the substance.
    expect(diff.worldB!.chemical!.concentrationFraction!).toBeGreaterThan(diff.worldA!.chemical!.concentrationFraction!);

    // Scientific integrity: every real result on both worlds declares its grounding, never hidden.
    expect(diff.worldA!.grounding).toBe('MODEL_ESTIMATE');
    expect(diff.worldB!.grounding).toBe('MODEL_ESTIMATE');

    // History shared before the fork is identical on both branches.
    expect(engine.scrubTo(12).getEntity(world.substanceId).chemical?.concentrationFraction).toBe(
      cooler.scrubTo(12).getEntity(world.substanceId).chemical?.concentrationFraction,
    );
  });
});
