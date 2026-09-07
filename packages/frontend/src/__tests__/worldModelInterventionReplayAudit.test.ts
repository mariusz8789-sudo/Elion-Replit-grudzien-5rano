import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../core/events/hash';
import { executeIntervention } from '../core/worldModel/bridge/worldFrameState';
import { entityId, type WorldModelEntity } from '../core/worldModel/ecs/types';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import { addBackupGenerator, applyGeneratorStartCommand, ELECTRICAL_GENERATOR_SOLVER_ID, makeElectricalGeneratorSolver } from '../core/worldModel/domains/electricalGenerator';
import { buildGenesisCityWorld, makeGenesisCityRouter, makeGenesisCityUpdater } from '../core/worldModel/domains/genesisCityWorld';
import { HYDRAULIC_FRICTION_SOLVER_ID, NEWTONIAN_KINEMATICS_SOLVER_ID, SolverRouter, makeHydraulicFrictionSolver, newtonianKinematicsSolver } from '../core/worldModel/solvers/solverRouter';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * INTERVENTION/REPLAY AUDIT (Priority 3.9) — this mission already found
 * and fixed TWO real instances of the same bug class (a direct graph
 * mutation outside `advance()`/`applyExternalPatch` silently invisible to
 * `scrubTo`): `executeIntervention` itself (fixed via
 * `TemporalEngine.applyExternalPatch`), and adding an entity to a graph
 * AFTER `TemporalEngine` construction (fixed via `createScientificWorld`'s
 * `augmentGraph`). A grep audit of every production call site found no
 * OTHER direct `engine.graph.updateEntity`/`addEntity` call outside those
 * two, now-fixed paths — this file is the regression net: one real
 * intervention + scrubTo(head) proof PER existing domain solver, so a
 * future regression on any of them fails a test immediately rather than
 * silently reintroducing the bug class.
 *
 * `export function make*Solver` across the module found FIVE real solver
 * factories/constants, not four — the two generic physics solvers in
 * `solvers/solverRouter.ts` (`newtonianKinematicsSolver`,
 * `makeHydraulicFrictionSolver`, genuinely distinct from
 * `hydraulicsPumpPipe.ts`'s pump-PIPE-SYSTEM model: this one decelerates a
 * single fluid-parcel entity's velocity via pipe friction) are real,
 * actively-used solvers (specification compiler, bridge-contract-stability,
 * solver-extensibility, and multiple performance suites all register them)
 * — covered below alongside the four domain solvers.
 */
describe('Every real domain solver: an intervention on its own entity survives scrubTo(head) byte-identical', () => {
  it('chemistry (Arrhenius kinetics)', () => {
    const world = buildGenesisCityWorld();
    const router = makeGenesisCityRouter(world.epidemicParams);
    const engine = new TemporalEngine(world.graph);
    const updater = makeGenesisCityUpdater(router);
    engine.advance(3600, updater);

    executeIntervention(engine, world.substanceId, { 'physics.temperatureK': 900 });
    expect(engine.graph.getEntity(world.substanceId).physics?.temperatureK).toBe(900);

    const live = engine.graph.getEntity(world.substanceId);
    const replayed = engine.scrubTo(engine.tick).getEntity(world.substanceId);
    expect(canonicalJson(replayed)).toBe(canonicalJson(live));
  });

  it('hydraulics (Darcy-Weisbach pump-pipe engineering model)', () => {
    const world = buildGenesisCityWorld();
    const router = makeGenesisCityRouter(world.epidemicParams);
    const engine = new TemporalEngine(world.graph);
    const updater = makeGenesisCityUpdater(router);
    engine.advance(3600, updater);

    executeIntervention(engine, world.pumpPipeId, { 'domainState.volumetricFlow': 0.9 });
    expect(engine.graph.getEntity(world.pumpPipeId).domainState?.volumetricFlow).toBe(0.9);

    const live = engine.graph.getEntity(world.pumpPipeId);
    const replayed = engine.scrubTo(engine.tick).getEntity(world.pumpPipeId);
    expect(canonicalJson(replayed)).toBe(canonicalJson(live));
  });

  it('epidemiology (SEIR RK4)', () => {
    const world = buildGenesisCityWorld();
    const router = makeGenesisCityRouter(world.epidemicParams);
    const engine = new TemporalEngine(world.graph);
    const updater = makeGenesisCityUpdater(router);
    engine.advance(3600, updater);

    executeIntervention(engine, world.populationId, { 'domainState.r0': 0.3 });
    expect(engine.graph.getEntity(world.populationId).domainState?.r0).toBe(0.3);

    const live = engine.graph.getEntity(world.populationId);
    const replayed = engine.scrubTo(engine.tick).getEntity(world.populationId);
    expect(canonicalJson(replayed)).toBe(canonicalJson(live));
  });

  it('electrical (backup generator state machine)', () => {
    const world = buildGenesisCityWorld();
    const router = new SolverRouter();
    const generatorId = addBackupGenerator(world.graph, { parentEntityId: world.waterSystemId });
    router.register(ELECTRICAL_GENERATOR_SOLVER_ID, makeElectricalGeneratorSolver());
    const engine = new TemporalEngine(world.graph);
    engine.advance(1, (g, dt, tick) => router.routeTick(g, dt, tick));

    applyGeneratorStartCommand(engine, generatorId); // itself an intervention, via applyInterventionWithEvent
    expect(engine.graph.getEntity(generatorId).domainState?.status).toBe(1);

    const live = engine.graph.getEntity(generatorId);
    const replayed = engine.scrubTo(engine.tick).getEntity(generatorId);
    expect(canonicalJson(replayed)).toBe(canonicalJson(live));
  });

  it('Newtonian kinematics (GROUNDED_EXACT reference solver)', () => {
    const graph = new WorldGraph();
    const ref = { kind: 'particle', id: 'audit-p1' };
    const entity: WorldModelEntity = {
      id: entityId(ref),
      ref,
      label: 'particle',
      scale: { level: 'MESO_LAB' },
      spatial: { position: { x: 0, y: 0, z: 0 } },
      physics: { massKg: 1, velocityMS: { x: 2, y: 0, z: 0 } },
      domainBinding: { solverId: NEWTONIAN_KINEMATICS_SOLVER_ID, domainId: 'kinematics' },
      grounding: 'UNGROUNDED_APPROXIMATION',
      updatedAtTick: 0,
    };
    graph.addEntity(entity);
    const router = new SolverRouter();
    router.register(NEWTONIAN_KINEMATICS_SOLVER_ID, newtonianKinematicsSolver);
    const engine = new TemporalEngine(graph);
    engine.advance(1, (g, dt, tick) => router.routeTick(g, dt, tick));

    executeIntervention(engine, entity.id, { 'physics.velocityMS.x': 9 });
    expect(engine.graph.getEntity(entity.id).physics?.velocityMS?.x).toBe(9);

    const live = engine.graph.getEntity(entity.id);
    const replayed = engine.scrubTo(engine.tick).getEntity(entity.id);
    expect(canonicalJson(replayed)).toBe(canonicalJson(live));
  });

  it('hydraulic friction (MODEL_ESTIMATE fluid-parcel deceleration, distinct from the pump-pipe SYSTEM model above)', () => {
    const graph = new WorldGraph();
    const ref = { kind: 'fluid-parcel', id: 'audit-f1' };
    const entity: WorldModelEntity = {
      id: entityId(ref),
      ref,
      label: 'fluid-parcel',
      scale: { level: 'MESO_LAB' },
      spatial: { position: { x: 0, y: 0, z: 0 } },
      physics: { massKg: 1, velocityMS: { x: 5, y: 0, z: 0 }, densityKgM3: 998, viscosityPaS: 1.002e-3 },
      domainBinding: { solverId: HYDRAULIC_FRICTION_SOLVER_ID, domainId: 'hydraulics' },
      grounding: 'UNGROUNDED_APPROXIMATION',
      updatedAtTick: 0,
    };
    graph.addEntity(entity);
    const router = new SolverRouter();
    router.register(HYDRAULIC_FRICTION_SOLVER_ID, makeHydraulicFrictionSolver({ pipeDiameterM: 0.1, relativeRoughness: 0.00045 }));
    const engine = new TemporalEngine(graph);
    engine.advance(0.1, (g, dt, tick) => router.routeTick(g, dt, tick));

    executeIntervention(engine, entity.id, { 'physics.velocityMS.x': 1 });
    expect(engine.graph.getEntity(entity.id).physics?.velocityMS?.x).toBe(1);

    const live = engine.graph.getEntity(entity.id);
    const replayed = engine.scrubTo(engine.tick).getEntity(entity.id);
    expect(canonicalJson(replayed)).toBe(canonicalJson(live));
  });

  it('a REAL regression this audit would have caught: a direct graph.updateEntity call (never do this) really is invisible to scrubTo', () => {
    // Kept as a living demonstration of the exact failure mode `applyExternalPatch` fixes — not a
    // test of correct code, a test of what WOULD happen without the fix, so the fix's own value
    // stays visible even after the bug is long gone.
    const world = buildGenesisCityWorld();
    const engine = new TemporalEngine(world.graph);
    engine.advance(1, () => undefined);
    engine.graph.updateEntity(world.substanceId, { physics: { ...engine.graph.getEntity(world.substanceId).physics!, temperatureK: 12345 } }); // the WRONG way — direct mutation
    expect(engine.graph.getEntity(world.substanceId).physics?.temperatureK).toBe(12345); // live state IS changed...
    expect(engine.scrubTo(engine.tick).getEntity(world.substanceId).physics?.temperatureK).not.toBe(12345); // ...but replay never learns about it
  });
});
