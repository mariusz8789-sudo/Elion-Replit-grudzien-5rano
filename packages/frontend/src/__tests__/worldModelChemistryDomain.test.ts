import { describe, expect, it } from 'vitest';
import { validateEvent } from '../core/events/genesisEvent';
import { buildChemistryKineticsGraph } from '../core/modelGraph/chemistryKineticsGraph';
import {
  CHEMISTRY_KINETICS_SOLVER_ID,
  DEMO_ACTIVATION_ENERGY_KJ,
  DEMO_PRE_EXPONENTIAL_LOG10,
  buildChemistryExperimentWorld,
  describeMolecularState,
  makeChemistryKineticsSolver,
} from '../core/worldModel/domains/chemistryKinetics';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import { TemporalEngine, type TemporalUpdater } from '../core/worldModel/temporal/temporalEngine';

/**
 * LEVEL 2, FIRST REFERENCE WORLD: "show what happens to this substance when
 * temperature is increased to 800K for 24 hours" — driven end to end by the
 * real Arrhenius kinetics ModelGraph already in Genesis
 * (core/modelGraph/chemistryKineticsGraph.ts), never a re-derived formula.
 */
describe('Chemistry Kinetics domain (real Arrhenius solver)', () => {
  function buildRoutedEngine(initialTemperatureK: number) {
    const world = buildChemistryExperimentWorld({ initialTemperatureK });
    const engine = new TemporalEngine(world.graph);
    const router = new SolverRouter();
    router.register(CHEMISTRY_KINETICS_SOLVER_ID, makeChemistryKineticsSolver());
    const step: TemporalUpdater = (g, dt, tick) => router.routeTick(g, dt, tick);
    return { world, engine, router, step };
  }

  it('advances concentration using the real ModelGraph rate constant, matching an independently computed reference', () => {
    const { world, engine, step } = buildRoutedEngine(800);
    const dtSeconds = 3600;
    engine.advance(dtSeconds, step);

    // Independent reference: build a FRESH instance of the same real graph and read k directly — proves the
    // solver did not invent a number, it used the same executable model (with the same demo kinetics overrides
    // the scenario builder applies to its substance).
    const referenceGraph = buildChemistryKineticsGraph();
    referenceGraph.setParameter('temperatureK', 800);
    referenceGraph.setParameter('activationEnergyKJ', DEMO_ACTIVATION_ENERGY_KJ);
    referenceGraph.setParameter('preExponentialLog10', DEMO_PRE_EXPONENTIAL_LOG10);
    const referenceK = referenceGraph.getValue('rateConstant');
    const expectedFraction = Math.exp(-referenceK * dtSeconds);

    const substance = engine.graph.getEntity(world.substanceId);
    expect(substance.chemical?.concentrationFraction).toBeCloseTo(expectedFraction, 10);
    expect(substance.grounding).toBe('MODEL_ESTIMATE');
    expect(substance.statusLabel).toContain(describeMolecularState(expectedFraction));
  });

  it('runs 24 hourly ticks and produces a real, strictly decreasing temporal history — not procedural animation', () => {
    const { world, engine, step } = buildRoutedEngine(800);
    const fractions: number[] = [1];
    for (let hour = 1; hour <= 24; hour++) {
      engine.advance(3600, step);
      fractions.push(engine.graph.getEntity(world.substanceId).chemical!.concentrationFraction!);
    }

    expect(engine.historyLength).toBe(24);
    for (let i = 1; i < fractions.length; i++) expect(fractions[i]).toBeLessThan(fractions[i - 1]);

    // Replay must reproduce the exact recorded value, not a freshly re-simulated one.
    const midGraph = engine.scrubTo(12);
    expect(midGraph.getEntity(world.substanceId).chemical?.concentrationFraction).toBe(fractions[12]);
  });

  it('emits a structurally valid GenesisEvent and a provenance-bearing Observation for every step', () => {
    const { world, engine, step } = buildRoutedEngine(800);
    engine.advance(3600, step);

    expect(engine.journal.allEvents()).toHaveLength(1);
    const event = engine.journal.allEvents()[0];
    expect(validateEvent(event).ok).toBe(true);
    expect(event.type).toBe('chemistry.kinetics.step');
    expect(event.affectedEntities).toEqual([world.graph.getEntity(world.substanceId).ref]);
    expect(event.provenance?.modelId).toBe(CHEMISTRY_KINETICS_SOLVER_ID);

    expect(engine.journal.allObservations()).toHaveLength(1);
    const observation = engine.journal.allObservations()[0];
    expect(observation.provenance).toContain('core/modelGraph/chemistryKineticsGraph.ts');
    expect(observation.measurements.some((m) => m.key === 'rateConstant')).toBe(true);
    expect(observation.measurements.some((m) => m.key === 'concentrationFraction')).toBe(true);
  });

  it('never advances an entity with no domain binding — it is flagged UNGROUNDED_APPROXIMATION and left untouched', () => {
    const world = buildChemistryExperimentWorld();
    world.graph.updateEntity(world.substanceId, { domainBinding: undefined });
    const engine = new TemporalEngine(world.graph);
    const router = new SolverRouter();
    router.register(CHEMISTRY_KINETICS_SOLVER_ID, makeChemistryKineticsSolver());

    const report = router.routeTick(engine.graph, 3600, 1);
    expect(report.ungrounded).toContain(world.substanceId);

    const substance = engine.graph.getEntity(world.substanceId);
    expect(substance.grounding).toBe('UNGROUNDED_APPROXIMATION');
    expect(substance.chemical?.concentrationFraction).toBe(1);
  });

  it('higher temperature produces a real, measurably faster decay (Arrhenius direction is respected, not asserted)', () => {
    const hot = buildRoutedEngine(800);
    const cold = buildRoutedEngine(300);
    hot.engine.advance(3600, hot.step);
    cold.engine.advance(3600, cold.step);

    const hotFraction = hot.engine.graph.getEntity(hot.world.substanceId).chemical!.concentrationFraction!;
    const coldFraction = cold.engine.graph.getEntity(cold.world.substanceId).chemical!.concentrationFraction!;
    expect(hotFraction).toBeLessThan(coldFraction);
  });
});
