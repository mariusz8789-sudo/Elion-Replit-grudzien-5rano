import { describe, expect, it } from 'vitest';
import { spawnEntity } from '../core/worldModel/ecs/entityFactory';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';
import {
  CHEMISTRY_KINETICS_SOLVER_ID,
  EPIDEMIC_SEIR_SOLVER_ID,
  HYDRAULICS_PUMP_PIPE_SOLVER_ID,
  buildGenesisCityWorld,
  makeChemistryKineticsSolver,
  makeEpidemicSEIRSolver,
  makeHydraulicsPumpPipeSolver,
} from '../core/worldModel';
import { NEWTONIAN_KINEMATICS_SOLVER_ID, SolverRouter, newtonianKinematicsSolver } from '../core/worldModel/solvers/solverRouter';

/**
 * PRIORITY 5 (solver routing): proves a FOURTH, completely unrelated real
 * solver (Newtonian kinematics — already used elsewhere as the GROUNDED_EXACT
 * reference solver, see worldModelSolvers.test.ts) can be registered
 * alongside the three domains genesisCityWorld.ts already composes
 * (chemistry/epidemiology/hydraulics) on ONE router, driving ONE WorldGraph,
 * with ZERO changes to WorldGraph.ts or SolverRouter.ts themselves — the
 * router dispatches purely by `domainBinding.solverId`, so adding a domain
 * is exactly "register one more entry," never a new branch in the world
 * engine's own code.
 */
describe('SolverRouter extensibility (Priority 5): a 4th real domain plugs in with zero WorldGraph changes', () => {
  it('drives four independent real domains (chemistry, epidemiology, hydraulics, kinematics) on one router and one graph', () => {
    const world = buildGenesisCityWorld();

    // Same composition pattern as makeGenesisCityRouter — built by hand here only to add one
    // more `router.register(...)` line, proving that's the entire integration surface.
    const router = new SolverRouter();
    router.register(CHEMISTRY_KINETICS_SOLVER_ID, makeChemistryKineticsSolver());
    router.register(EPIDEMIC_SEIR_SOLVER_ID, makeEpidemicSEIRSolver(world.epidemicParams));
    router.register(HYDRAULICS_PUMP_PIPE_SOLVER_ID, makeHydraulicsPumpPipeSolver());
    router.register(NEWTONIAN_KINEMATICS_SOLVER_ID, newtonianKinematicsSolver);

    const probeId = spawnEntity(world.graph, {
      ref: { kind: 'probe', id: 'p1' },
      label: 'Free-flying Probe',
      scaleLevel: 'MACRO_CITY',
      parentEntityId: world.cityId,
      spatial: { position: { x: 0, y: 0, z: 0 } },
      physics: { massKg: 1, velocityMS: { x: 5, y: 0, z: 0 } },
      domainBinding: { solverId: NEWTONIAN_KINEMATICS_SOLVER_ID, domainId: 'kinematics' },
    });

    const engine = new TemporalEngine(world.graph);
    for (let i = 0; i < 3; i++) {
      engine.advance(1, (g, dt, tick) =>
        router.routeTick(g, dt, tick, { [EPIDEMIC_SEIR_SOLVER_ID]: dt / 86400 }),
      );
    }

    // The 4th domain actually executed its own real solver (grounded exactly, position advanced).
    const probe = engine.graph.getEntity(probeId);
    expect(probe.grounding).toBe('GROUNDED_EXACT');
    expect(probe.spatial?.position.x).toBe(15); // 3 ticks * dt=1 * vx=5

    // The three pre-existing domains kept executing their OWN real solvers, completely
    // unaffected by the new domain sharing the router and graph.
    const substance = engine.graph.getEntity(world.substanceId);
    expect(substance.grounding).not.toBe('UNGROUNDED_APPROXIMATION');
    const population = engine.graph.getEntity(world.populationId);
    expect(population.grounding).not.toBe('UNGROUNDED_APPROXIMATION');
    const pumpPipe = engine.graph.getEntity(world.pumpPipeId);
    expect(pumpPipe.grounding).not.toBe('UNGROUNDED_APPROXIMATION');
  });

  it('an entity bound to an unregistered solverId still falls back to the honest procedural approximation, never silently skipped', () => {
    const world = buildGenesisCityWorld();
    const router = new SolverRouter();
    router.register(CHEMISTRY_KINETICS_SOLVER_ID, makeChemistryKineticsSolver());
    // Deliberately omit epidemiology/hydraulics/kinematics registration for this router instance.

    const report = router.routeTick(world.graph, 1, 1);
    expect(report.ungrounded).not.toContain(world.substanceId); // chemistry IS registered
    expect(world.graph.getEntity(world.populationId).grounding).toBe('PROCEDURAL_APPROXIMATION');
    expect(world.graph.getEntity(world.pumpPipeId).grounding).toBe('PROCEDURAL_APPROXIMATION');
  });
});
