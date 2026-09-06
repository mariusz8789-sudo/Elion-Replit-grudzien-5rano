import { describe, expect, it } from 'vitest';
import { compareBranches } from '../core/worldModel/bridge/worldFrameState';
import {
  CHEMISTRY_KINETICS_SOLVER_ID,
  buildChemistryExperimentWorld,
  makeChemistryKineticsSolver,
} from '../core/worldModel/domains/chemistryKinetics';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import { TemporalBranchRegistry, TemporalEngine, type TemporalUpdater } from '../core/worldModel/temporal/temporalEngine';

/**
 * LEVEL 2, CRITICAL TEST (#6/#7): Run A stays at 800K; Run B forks to 700K.
 * Both share real, identical history before the fork; after it, each
 * branch's own solver execution — not a relabeled clone — produces a
 * genuinely different outcome.
 */
describe('Counterfactual branching with real solver execution', () => {
  it('two branches sharing history before divergence produce genuinely different real outcomes after a temperature fork', () => {
    const world = buildChemistryExperimentWorld({ initialTemperatureK: 800 });
    const registry = new TemporalBranchRegistry();
    const runA = new TemporalEngine(world.graph, { label: 'run-A-800K', registry });
    const router = new SolverRouter();
    router.register(CHEMISTRY_KINETICS_SOLVER_ID, makeChemistryKineticsSolver());
    const step: TemporalUpdater = (g, dt, tick) => router.routeTick(g, dt, tick);

    for (let hour = 0; hour < 5; hour++) runA.advance(3600, step);
    const sharedFraction = runA.graph.getEntity(world.substanceId).chemical!.concentrationFraction!;

    const runB = runA.forkBranch(5, 'run-B-700K', (g) => {
      const current = g.getEntity(world.substanceId);
      g.updateEntity(world.substanceId, { physics: { ...current.physics!, temperatureK: 700 } });
    });

    // Identical at the fork point — the divergence hasn't happened yet.
    expect(runB.graph.getEntity(world.substanceId).chemical?.concentrationFraction).toBe(sharedFraction);
    expect(runB.parentBranchId).toBe(runA.branchId);
    expect(runB.forkedAtTick).toBe(5);

    for (let hour = 0; hour < 5; hour++) runA.advance(3600, step);
    for (let hour = 0; hour < 5; hour++) runB.advance(3600, step);

    const fractionA = runA.graph.getEntity(world.substanceId).chemical!.concentrationFraction!;
    const fractionB = runB.graph.getEntity(world.substanceId).chemical!.concentrationFraction!;

    // Real physics, not a display trick: hotter run A decayed faster, so it has LESS substance remaining.
    expect(fractionA).toBeLessThan(fractionB);
    expect(fractionA).not.toBe(fractionB);

    const comparison = compareBranches(registry, runA.branchId, runB.branchId, 10);
    const diff = comparison.entityDiffs.find((d) => d.id === world.substanceId)!;
    expect(diff.equal).toBe(false);
    expect(diff.worldA?.chemical?.concentrationFraction).toBe(fractionA);
    expect(diff.worldB?.chemical?.concentrationFraction).toBe(fractionB);

    // History before the fork stays identical and untouched on both branches.
    expect(runA.scrubTo(5).getEntity(world.substanceId).chemical?.concentrationFraction).toBe(sharedFraction);
    expect(runB.scrubTo(5).getEntity(world.substanceId).chemical?.concentrationFraction).toBe(sharedFraction);
  });

  it('the journal shares evidence recorded before the fork and diverges only after it', () => {
    const world = buildChemistryExperimentWorld({ initialTemperatureK: 800 });
    const registry = new TemporalBranchRegistry();
    const runA = new TemporalEngine(world.graph, { registry });
    const router = new SolverRouter();
    router.register(CHEMISTRY_KINETICS_SOLVER_ID, makeChemistryKineticsSolver());
    const step: TemporalUpdater = (g, dt, tick) => router.routeTick(g, dt, tick);

    for (let hour = 0; hour < 3; hour++) runA.advance(3600, step);
    const runB = runA.forkBranch(3, 'variant', () => {});

    expect(runB.journal.allEvents()).toHaveLength(3);
    expect(runB.journal.allEvents()).toEqual(runA.journal.upToTick(3).events);

    runA.advance(3600, step);
    runB.advance(3600, step);

    expect(runA.journal.allEvents()).toHaveLength(4);
    expect(runB.journal.allEvents()).toHaveLength(4);
    // Each branch's own post-fork event is its own — different ids.
    expect(runA.journal.allEvents()[3].id).not.toBe(runB.journal.allEvents()[3].id);
  });
});
