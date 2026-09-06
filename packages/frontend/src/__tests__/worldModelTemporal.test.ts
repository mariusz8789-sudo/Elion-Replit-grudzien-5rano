import { describe, expect, it } from 'vitest';
import { entityId, type WorldModelEntity } from '../core/worldModel/ecs/types';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import { NEWTONIAN_KINEMATICS_SOLVER_ID, SolverRouter, newtonianKinematicsSolver } from '../core/worldModel/solvers/solverRouter';
import { TemporalBranchRegistry, TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

function movingEntity(id: number, vx: number): WorldModelEntity {
  const ref = { kind: 'particle', id };
  return {
    id: entityId(ref),
    ref,
    label: 'particle',
    scale: { level: 'MICRO_MOLECULAR' },
    spatial: { position: { x: 0, y: 0, z: 0 } },
    physics: { massKg: 1, velocityMS: { x: vx, y: 0, z: 0 } },
    domainBinding: { solverId: NEWTONIAN_KINEMATICS_SOLVER_ID, domainId: 'kinematics' },
    grounding: 'GROUNDED_EXACT',
    updatedAtTick: 0,
  };
}

function router(): SolverRouter {
  const r = new SolverRouter();
  r.register(NEWTONIAN_KINEMATICS_SOLVER_ID, newtonianKinematicsSolver);
  return r;
}

describe('TemporalEngine', () => {
  it('advances the graph via the supplied updater and increments tick', () => {
    const graph = new WorldGraph();
    graph.addEntity(movingEntity(1, 2));
    const engine = new TemporalEngine(graph);
    const solverRouter = router();

    engine.advance(1, (g, dt) => solverRouter.routeTick(g, dt));
    expect(engine.tick).toBe(1);
    expect(engine.graph.getEntity('particle:1').spatial?.position.x).toBe(2);
  });

  it('records history as component-level deltas, not full snapshots: untouched entities produce no delta entry', () => {
    const graph = new WorldGraph();
    graph.addEntity(movingEntity(1, 1));
    graph.addEntity(movingEntity(2, 0));
    const engine = new TemporalEngine(graph);

    engine.advance(1, (g) => {
      const e = g.getEntity('particle:1');
      g.updateEntity('particle:1', { spatial: { position: { x: e.spatial!.position.x + 1, y: 0, z: 0 } } }, 1);
      // particle:2 is deliberately left untouched this tick.
    });

    expect(engine.historyLength).toBe(1);
    const deltas = engine.frames[0].deltas;
    expect(deltas).toEqual([{ op: 'update', id: 'particle:1', patch: expect.objectContaining({ spatial: { position: { x: 1, y: 0, z: 0 } } }) }]);
  });

  it('scrubTo reconstructs an exact past state by replaying the keyframe forward', () => {
    const graph = new WorldGraph();
    graph.addEntity(movingEntity(1, 3));
    const engine = new TemporalEngine(graph);
    const solverRouter = router();

    engine.advance(1, (g, dt) => solverRouter.routeTick(g, dt));
    engine.advance(1, (g, dt) => solverRouter.routeTick(g, dt));
    engine.advance(1, (g, dt) => solverRouter.routeTick(g, dt));

    expect(engine.graph.getEntity('particle:1').spatial?.position.x).toBe(9);
    expect(engine.scrubTo(0).getEntity('particle:1').spatial?.position.x).toBe(0);
    expect(engine.scrubTo(2).getEntity('particle:1').spatial?.position.x).toBe(6);
    expect(engine.scrubTo(3).getEntity('particle:1').spatial?.position.x).toBe(9);
  });

  it('forkBranch shares history up to the fork point and diverges only after it', () => {
    const graph = new WorldGraph();
    graph.addEntity(movingEntity(1, 1));
    const registry = new TemporalBranchRegistry();
    const root = new TemporalEngine(graph, { label: 'root', registry });
    const solverRouter = router();

    root.advance(1, (g, dt) => solverRouter.routeTick(g, dt)); // tick 1: x=1
    root.advance(1, (g, dt) => solverRouter.routeTick(g, dt)); // tick 2: x=2

    const fork = root.forkBranch(2, 'faster-branch', (g) => {
      g.updateEntity('particle:1', { physics: { massKg: 1, velocityMS: { x: 10, y: 0, z: 0 } } });
    });

    expect(fork.parentBranchId).toBe(root.branchId);
    expect(fork.forkedAtTick).toBe(2);
    expect(fork.graph.getEntity('particle:1').spatial?.position.x).toBe(2); // inherited, unmoved yet

    fork.advance(1, (g, dt) => solverRouter.routeTick(g, dt));
    root.advance(1, (g, dt) => solverRouter.routeTick(g, dt));

    expect(fork.graph.getEntity('particle:1').spatial?.position.x).toBe(12); // 2 + 10*1
    expect(root.graph.getEntity('particle:1').spatial?.position.x).toBe(3); // 2 + 1*1 — untouched by the fork

    const branches = registry.list();
    expect(branches.map((b) => b.branchId).sort()).toEqual([root.branchId, fork.branchId].sort());
    expect(branches.find((b) => b.branchId === fork.branchId)?.parentBranchId).toBe(root.branchId);
  });

  it('rejects scrubbing before a branch\'s own keyframe', () => {
    const graph = new WorldGraph();
    graph.addEntity(movingEntity(1, 1));
    const registry = new TemporalBranchRegistry();
    const root = new TemporalEngine(graph, { registry });
    root.advance(1, () => {});
    root.advance(1, () => {});
    const fork = root.forkBranch(2, 'f', () => {});
    expect(() => fork.scrubTo(0)).toThrow();
    expect(fork.scrubTo(2).getEntity('particle:1').ref).toEqual({ kind: 'particle', id: 1 });
  });
});
