import { describe, expect, it } from 'vitest';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import { entityId, type WorldModelEntity } from '../core/worldModel/ecs/types';
import {
  DEFAULT_DIFFUSION_1D_PARAMS,
  DIFFUSION_1D_DOMAIN_ID,
  DIFFUSION_1D_GRID_SIZE,
  DIFFUSION_1D_SOLVER_ID,
  SolverRouter,
  diffusion1DSolver,
  diffusion1DStep,
  makeDiffusion1DSolver,
} from '../core/worldModel/solvers/solverRouter';

describe('diffusion1DStep (pure function)', () => {
  it('holds boundary points fixed and smooths a spike toward its neighbors', () => {
    const grid = [0, 0, 10, 0, 0];
    const next = diffusion1DStep(grid, { diffusivity: 0.1, dx: 1 }, 1);
    expect(next[0]).toBe(0);
    expect(next[4]).toBe(0);
    expect(next[2]).toBeLessThan(10);
    expect(next[1]).toBeGreaterThan(0);
    expect(next[3]).toBeGreaterThan(0);
  });

  it('is a no-op for a uniform field', () => {
    const grid = [5, 5, 5, 5, 5];
    const next = diffusion1DStep(grid, { diffusivity: 0.2, dx: 1 }, 1);
    expect(next).toEqual(grid);
  });

  it('throws for an unstable step (alpha > 0.5)', () => {
    expect(() => diffusion1DStep([0, 0, 10, 0, 0], { diffusivity: 10, dx: 1 }, 1)).toThrow(/unstable/);
  });

  it('throws when the grid is not exactly 5 points', () => {
    expect(() => diffusion1DStep([0, 0, 0], DEFAULT_DIFFUSION_1D_PARAMS, 1)).toThrow(/5-point/);
  });

  it('DIFFUSION_1D_GRID_SIZE is 5', () => {
    expect(DIFFUSION_1D_GRID_SIZE).toBe(5);
  });
});

function fieldEntity(id: string, domainState: Record<string, number>): WorldModelEntity {
  const ref = { kind: 'diffusion-field', id };
  return {
    id: entityId(ref),
    ref,
    label: `Diffusion Field ${id}`,
    scale: { level: 'MESO_LAB' },
    domainState,
    domainBinding: { solverId: DIFFUSION_1D_SOLVER_ID, domainId: DIFFUSION_1D_DOMAIN_ID },
    grounding: 'MODEL_ESTIMATE',
    updatedAtTick: 0,
  };
}

describe('diffusion1DSolver — registered on the real SolverRouter', () => {
  it('advances a bound entity and produces a real Observation + GenesisEvent', () => {
    const graph = new WorldGraph();
    const entity = fieldEntity('field-1', { u0: 0, u1: 0, u2: 10, u3: 0, u4: 0 });
    graph.addEntity(entity);
    const router = new SolverRouter();
    router.register(DIFFUSION_1D_SOLVER_ID, diffusion1DSolver);
    expect(router.hasSolver(DIFFUSION_1D_SOLVER_ID)).toBe(true);

    const report = router.routeTick(graph, 1, 1);
    expect(report.ungrounded).toEqual([]);
    expect(report.updated).toContain(entity.id);
    expect(report.observations.length).toBe(1);
    expect(report.events.length).toBe(1);
    expect(report.events[0]!.type).toBe('field.diffusion1d.step');

    const advanced = graph.getEntity(entity.id);
    expect(advanced?.domainState?.u0).toBe(0);
    expect(advanced?.domainState?.u4).toBe(0);
    expect(advanced?.domainState?.u2).toBeLessThan(10);
  });

  it('is a no-op (MODEL_ESTIMATE, unchanged state) when the grid is missing from domainState', () => {
    const graph = new WorldGraph();
    const entity = fieldEntity('field-2', {});
    graph.addEntity(entity);
    const router = new SolverRouter();
    router.register(DIFFUSION_1D_SOLVER_ID, makeDiffusion1DSolver());
    const report = router.routeTick(graph, 1, 1);
    expect(report.observations.length).toBe(0);
    const advanced = graph.getEntity(entity.id);
    expect(advanced?.grounding).toBe('MODEL_ESTIMATE');
  });

  it('reports UNGROUNDED_APPROXIMATION rather than throwing when a tick would be unstable', () => {
    const graph = new WorldGraph();
    const entity = fieldEntity('field-3', { u0: 0, u1: 0, u2: 10, u3: 0, u4: 0 });
    graph.addEntity(entity);
    const router = new SolverRouter();
    router.register(DIFFUSION_1D_SOLVER_ID, makeDiffusion1DSolver({ diffusivity: 100, dx: 1 }));
    const report = router.routeTick(graph, 1, 1);
    const advanced = graph.getEntity(entity.id);
    expect(advanced?.grounding).toBe('UNGROUNDED_APPROXIMATION');
    expect(advanced?.domainState?.u2).toBe(10);
    expect(report.observations.length).toBe(0);
  });

  it('respects a per-entity diffusivity/dx override', () => {
    const graphA = new WorldGraph();
    const entityDefault = fieldEntity('field-4a', { u0: 0, u1: 0, u2: 10, u3: 0, u4: 0 });
    graphA.addEntity(entityDefault);
    const graphB = new WorldGraph();
    const entityOverride = fieldEntity('field-4b', { u0: 0, u1: 0, u2: 10, u3: 0, u4: 0, diffusivity: 0.4, dx: 1 });
    graphB.addEntity(entityOverride);

    const router = new SolverRouter();
    router.register(DIFFUSION_1D_SOLVER_ID, makeDiffusion1DSolver());
    router.routeTick(graphA, 1, 1);
    router.routeTick(graphB, 1, 1);

    const a = graphA.getEntity(entityDefault.id);
    const b = graphB.getEntity(entityOverride.id);
    expect(b?.domainState?.u2).not.toBe(a?.domainState?.u2);
  });

  it('an entity with no domain binding at all is reported ungrounded, not silently advanced', () => {
    const graph = new WorldGraph();
    const ref = { kind: 'diffusion-field', id: 'unbound-1' };
    graph.addEntity({
      id: entityId(ref), ref, label: 'Unbound', scale: { level: 'MESO_LAB' },
      domainState: { u0: 0, u1: 0, u2: 10, u3: 0, u4: 0 }, grounding: 'MODEL_ESTIMATE', updatedAtTick: 0,
    });
    const router = new SolverRouter();
    router.register(DIFFUSION_1D_SOLVER_ID, diffusion1DSolver);
    const report = router.routeTick(graph, 1, 1);
    expect(report.ungrounded).toContain(entityId(ref));
  });
});
