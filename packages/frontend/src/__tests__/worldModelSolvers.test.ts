import { describe, expect, it } from 'vitest';
import { entityId, type WorldModelEntity } from '../core/worldModel/ecs/types';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import {
  HYDRAULIC_FRICTION_SOLVER_ID,
  NEWTONIAN_KINEMATICS_SOLVER_ID,
  SolverRouter,
  makeHydraulicFrictionSolver,
  newtonianKinematicsSolver,
} from '../core/worldModel/solvers/solverRouter';

function baseEntity(kind: string, id: string): WorldModelEntity {
  const ref = { kind, id };
  return {
    id: entityId(ref),
    ref,
    label: kind,
    scale: { level: 'MESO_LAB' },
    spatial: { position: { x: 0, y: 0, z: 0 } },
    physics: { massKg: 1, velocityMS: { x: 2, y: 0, z: 0 } },
    grounding: 'UNGROUNDED_APPROXIMATION',
    updatedAtTick: 0,
  };
}

describe('SolverRouter', () => {
  it('routes a bound entity to its registered real solver and discloses GROUNDED_EXACT', () => {
    const graph = new WorldGraph();
    const e = baseEntity('particle', 'p1');
    e.domainBinding = { solverId: NEWTONIAN_KINEMATICS_SOLVER_ID, domainId: 'kinematics' };
    graph.addEntity(e);
    const router = new SolverRouter();
    router.register(NEWTONIAN_KINEMATICS_SOLVER_ID, newtonianKinematicsSolver);

    const report = router.routeTick(graph, 1);
    expect(report.updated).toEqual([e.id]);
    expect(report.ungrounded).toEqual([]);
    const after = graph.getEntity(e.id);
    expect(after.grounding).toBe('GROUNDED_EXACT');
    expect(after.spatial?.position.x).toBe(2);
  });

  it('falls back to a procedural heuristic and discloses PROCEDURAL_APPROXIMATION when a declared solver is not registered', () => {
    const graph = new WorldGraph();
    const e = baseEntity('particle', 'p2');
    e.domainBinding = { solverId: 'not-registered-anywhere', domainId: 'unknown-domain' };
    graph.addEntity(e);
    const router = new SolverRouter();

    const report = router.routeTick(graph, 1);
    expect(report.updated).toEqual([e.id]);
    const after = graph.getEntity(e.id);
    expect(after.grounding).toBe('PROCEDURAL_APPROXIMATION');
    expect(after.spatial?.position.x).toBe(2); // inertial fallback still moves it
  });

  it('never invents a domain binding: entities with none are flagged UNGROUNDED_APPROXIMATION and reported to the caller', () => {
    const graph = new WorldGraph();
    const e = baseEntity('particle', 'p3'); // no domainBinding at all
    graph.addEntity(e);
    const router = new SolverRouter();

    const report = router.routeTick(graph, 1);
    expect(report.ungrounded).toEqual([e.id]);
    expect(report.updated).toEqual([]);
    const after = graph.getEntity(e.id);
    expect(after.grounding).toBe('UNGROUNDED_APPROXIMATION');
    expect(after.spatial?.position.x).toBe(0); // left untouched, not silently advanced
  });

  it('MODEL_ESTIMATE example: reuses the real pump-pipe friction model to decelerate a fluid parcel', () => {
    const graph = new WorldGraph();
    const e = baseEntity('fluid-parcel', 'f1');
    e.physics = { massKg: 1, velocityMS: { x: 5, y: 0, z: 0 }, densityKgM3: 998, viscosityPaS: 1.002e-3 };
    e.domainBinding = { solverId: HYDRAULIC_FRICTION_SOLVER_ID, domainId: 'hydraulics' };
    graph.addEntity(e);
    const router = new SolverRouter();
    router.register(HYDRAULIC_FRICTION_SOLVER_ID, makeHydraulicFrictionSolver({ pipeDiameterM: 0.1, relativeRoughness: 0.00045 }));

    router.routeTick(graph, 0.1);
    const after = graph.getEntity(e.id);
    expect(after.grounding).toBe('MODEL_ESTIMATE');
    expect(after.physics!.velocityMS!.x).toBeLessThan(5);
    expect(after.physics!.velocityMS!.x).toBeGreaterThan(0);
    expect(after.spatial!.position.x).toBeCloseTo(0.5, 5);
  });
});
