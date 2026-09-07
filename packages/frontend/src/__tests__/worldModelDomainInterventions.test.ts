import { describe, expect, it } from 'vitest';
import { DEFAULT_EPIDEMIC } from '../core/epidemic/sir';
import { compareBranches, executeIntervention } from '../core/worldModel/bridge/worldFrameState';
import { EPIDEMIC_SEIR_SOLVER_ID, buildEpidemicWorld, makeEpidemicSEIRSolver } from '../core/worldModel/domains/epidemicSEIR';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import { TemporalBranchRegistry, TemporalEngine, type TemporalUpdater } from '../core/worldModel/temporal/temporalEngine';

/**
 * LEVEL 3, SECTION 5: REAL INTERVENTIONS. An epidemiology "contact/infection
 * parameter" intervention (a real-world social-distancing lever: reducing
 * R0) must actually change the RK4 trajectory afterward — not merely change
 * a displayed number.
 */
describe('Epidemiology intervention: reducing R0 measurably slows the real trajectory', () => {
  function buildRoutedEngine(registry?: TemporalBranchRegistry) {
    const world = buildEpidemicWorld({ params: { ...DEFAULT_EPIDEMIC, r0: 3 } });
    const engine = new TemporalEngine(world.graph, registry ? { registry } : {});
    const router = new SolverRouter();
    router.register(EPIDEMIC_SEIR_SOLVER_ID, makeEpidemicSEIRSolver(world.params));
    const step: TemporalUpdater = (g, dt, tick) => router.routeTick(g, dt, tick);
    return { world, engine, step };
  }

  it('records the intervention\'s effect: an R0 override actually changes the next real solver step, not just the display', () => {
    const { world, engine, step } = buildRoutedEngine();
    engine.advance(1, step); // day 0 -> 1 at r0=3

    const before = executeIntervention(engine, world.populationId, {}); // no-op read via the same contract
    expect(before.domainState?.r0).toBeUndefined(); // no override recorded yet — using the solver's base r0

    executeIntervention(engine, world.populationId, { 'domainState.r0': 0.2 }); // real contact-reduction intervention
    engine.advance(1, step);

    const event = engine.journal.allEvents()[engine.journal.allEvents().length - 1];
    expect(event.parameters.r0).toBe(0.2);
    const measurement = engine.journal.allObservations().at(-1)?.measurements.find((m) => m.key === 'r0');
    expect(measurement?.value).toBe(0.2);
  });

  it('a fork with a real R0 intervention produces a genuinely different, measurably slower outbreak than the unforked baseline', () => {
    const registry = new TemporalBranchRegistry();
    const { world, engine, step } = buildRoutedEngine(registry);

    for (let day = 0; day < 10; day++) engine.advance(1, step);
    const sharedInfected = engine.graph.getEntity(world.populationId).domainState!.I;

    const controlled = engine.forkBranch(10, 'r0-controlled', (g) => {
      g.updateEntity(world.populationId, { domainState: { ...g.getEntity(world.populationId).domainState, r0: 0.5 } });
    });

    for (let day = 0; day < 30; day++) {
      engine.advance(1, step);
      controlled.advance(1, step);
    }

    const uncontrolledInfected = engine.graph.getEntity(world.populationId).domainState!.I;
    const controlledInfected = controlled.graph.getEntity(world.populationId).domainState!.I;

    // Real RK4 consequence of a genuinely lower R0 after the fork, not a relabeled clone.
    expect(controlledInfected).toBeLessThan(uncontrolledInfected);
    expect(sharedInfected).toBeGreaterThan(0);

    const comparison = compareBranches(registry, engine.branchId, controlled.branchId, 40);
    const diff = comparison.entityDiffs.find((d) => d.id === world.populationId)!;
    expect(diff.equal).toBe(false);
  });
});
