import { describe, expect, it } from 'vitest';
import { zoomInto } from '../core/worldModel/bridge/worldFrameState';
import { CHEMISTRY_KINETICS_SOLVER_ID } from '../core/worldModel/domains/chemistryKinetics';
import { EPIDEMIC_SEIR_SOLVER_ID } from '../core/worldModel/domains/epidemicSEIR';
import {
  SECONDS_PER_DAY,
  buildGenesisCityWorld,
  makeGenesisCityRouter,
  makeGenesisCityUpdater,
} from '../core/worldModel/domains/genesisCityWorld';
import { HYDRAULICS_PUMP_PIPE_SOLVER_ID } from '../core/worldModel/domains/hydraulicsPumpPipe';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * LEVEL 3, SECTION 3: ONE WORLD, MULTIPLE SCIENTIFIC SYSTEMS. CITY hosts a
 * HOSPITAL (epidemiology), a LAB (chemistry), and a WATER SYSTEM
 * (hydraulics) — one `WorldGraph`, one `TemporalEngine`, one journal, one
 * branch identity, three independently real solvers.
 */
describe('One WorldGraph containing three real scientific systems', () => {
  function buildTickedCity() {
    const world = buildGenesisCityWorld();
    const engine = new TemporalEngine(world.graph);
    const router = makeGenesisCityRouter(world.epidemicParams);
    const updater = makeGenesisCityUpdater(router);
    return { world, engine, updater };
  }

  it('all three real solvers execute on every tick and record real evidence, while pure containers are honestly flagged as not modelled', () => {
    const { world, engine, updater } = buildTickedCity();
    const oneHourInSeconds = 3600;
    for (let i = 0; i < 3; i++) engine.advance(oneHourInSeconds, updater);

    // Three real steps per tick x 3 ticks.
    expect(engine.journal.allEvents()).toHaveLength(9);
    const eventTypes = new Set(engine.journal.allEvents().map((e) => e.type));
    expect(eventTypes).toEqual(new Set(['chemistry.kinetics.step', 'epidemiology.seir.step', 'hydraulics.pumppipe.step']));

    // Containers (city, hospital, lab, water system) never bound to a solver — honestly UNGROUNDED_APPROXIMATION (NOT_MODELLED).
    for (const containerId of [world.cityId, world.hospitalId, world.labId, world.waterSystemId]) {
      expect(engine.graph.getEntity(containerId).grounding).toBe('UNGROUNDED_APPROXIMATION');
    }
  });

  it('shares one simulated-time clock across all three domains, each converting it to its own real unit', () => {
    const { world, engine, updater } = buildTickedCity();
    const oneHourInSeconds = 3600;
    engine.advance(oneHourInSeconds, updater);

    expect(engine.simulatedTime).toBe(oneHourInSeconds); // canonical world clock: seconds
    const population = engine.graph.getEntity(world.populationId);
    expect(population.domainState?.t).toBeCloseTo(oneHourInSeconds / SECONDS_PER_DAY, 10); // epidemiology's own unit: days
    const substance = engine.graph.getEntity(world.substanceId);
    expect(substance.chemical?.concentrationFraction).toBeLessThan(1); // chemistry's own unit: seconds, already decaying
  });

  it('preserves one connected hierarchy: CITY -> HOSPITAL -> population, CITY -> LAB -> substance, CITY -> WATER SYSTEM -> pump-pipe', () => {
    const { world, engine } = buildTickedCity();

    const toHospital = zoomInto(engine, world.cityId, 'MESO_LAB');
    expect(toHospital.supported).toBe(true);
    expect(toHospital.children.map((c) => c.id).sort()).toEqual([world.hospitalId, world.labId, world.waterSystemId].sort());

    expect(zoomInto(engine, world.hospitalId, 'MESO_LAB').children.map((c) => c.id)).toEqual([world.populationId]);
    expect(zoomInto(engine, world.labId, 'MICRO_MOLECULAR').children.map((c) => c.id)).toEqual([world.substanceId]);
    expect(zoomInto(engine, world.waterSystemId, 'MESO_LAB').children.map((c) => c.id)).toEqual([world.pumpPipeId]);

    // Deeper than any real solver goes: honest boundary, not fabricated atomic/immune-cell behaviour.
    const beyondSubstance = zoomInto(engine, world.substanceId, 'NANO_ATOMIC');
    expect(beyondSubstance.supported).toBe(false);
  });

  it('registers all three real solvers on one router — the same router class as a single-domain world', () => {
    const { world } = buildTickedCity();
    const router = makeGenesisCityRouter(world.epidemicParams);
    expect(router.hasSolver(CHEMISTRY_KINETICS_SOLVER_ID)).toBe(true);
    expect(router.hasSolver(EPIDEMIC_SEIR_SOLVER_ID)).toBe(true);
    expect(router.hasSolver(HYDRAULICS_PUMP_PIPE_SOLVER_ID)).toBe(true);
  });
});
