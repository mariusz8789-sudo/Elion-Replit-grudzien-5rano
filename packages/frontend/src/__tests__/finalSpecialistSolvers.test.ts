import { describe, expect, it } from 'vitest';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import { entityId, type WorldModelEntity } from '../core/worldModel/ecs/types';
import {
  SolverRouter,
  LOGISTIC_GROWTH_SOLVER_ID,
  DEFAULT_LOGISTIC_GROWTH_PARAMS,
  logisticGrowthStep,
  makeLogisticGrowthSolver,
} from '../core/worldModel/solvers/solverRouter';

function populationEntity(id: string, population: number, overrides: Partial<Record<string, number>> = {}): WorldModelEntity {
  const ref = { kind: 'population', id };
  return {
    id: entityId(ref),
    ref,
    label: `Population ${id}`,
    scale: { level: 'MACRO_CITY' },
    domainState: { population, ...overrides },
    domainBinding: { solverId: LOGISTIC_GROWTH_SOLVER_ID, domainId: 'population-dynamics' },
    grounding: 'MODEL_ESTIMATE',
    updatedAtTick: 0,
  };
}

describe('logisticGrowthStep — deterministic output', () => {
  it('is a pure function: identical inputs always produce the identical output', () => {
    const a = logisticGrowthStep(10, DEFAULT_LOGISTIC_GROWTH_PARAMS, 1);
    const b = logisticGrowthStep(10, DEFAULT_LOGISTIC_GROWTH_PARAMS, 1);
    expect(a).toBe(b);
  });

  it('growth rate 0 leaves the population unchanged', () => {
    const next = logisticGrowthStep(250, { growthRate: 0, carryingCapacity: 1000 }, 5);
    expect(next).toBeCloseTo(250, 9);
  });

  it('grows monotonically toward K when starting below capacity', () => {
    const p1 = logisticGrowthStep(10, { growthRate: 0.5, carryingCapacity: 1000 }, 1);
    const p2 = logisticGrowthStep(p1, { growthRate: 0.5, carryingCapacity: 1000 }, 1);
    expect(p1).toBeGreaterThan(10);
    expect(p2).toBeGreaterThan(p1);
    expect(p2).toBeLessThan(1000);
  });

  it('decays back toward K when starting above capacity', () => {
    const next = logisticGrowthStep(2000, { growthRate: 0.5, carryingCapacity: 1000 }, 1);
    expect(next).toBeLessThan(2000);
    expect(next).toBeGreaterThan(1000);
  });

  it('stays extinct at zero population', () => {
    expect(logisticGrowthStep(0, DEFAULT_LOGISTIC_GROWTH_PARAMS, 10)).toBe(0);
  });
});

describe('logisticGrowthSolver — SolverRouter registration and validation', () => {
  it('registers on the canonical SolverRouter and advances a bound entity each tick', () => {
    const graph = new WorldGraph();
    const entity = populationEntity('city-1', 50);
    graph.addEntity(entity);
    const router = new SolverRouter();
    router.register(LOGISTIC_GROWTH_SOLVER_ID, makeLogisticGrowthSolver());
    expect(router.hasSolver(LOGISTIC_GROWTH_SOLVER_ID)).toBe(true);

    const report = router.routeTick(graph, 1, 1);
    expect(report.ungrounded).toEqual([]);
    expect(report.updated).toContain(entity.id);
    const advanced = graph.getEntity(entity.id);
    expect(advanced?.domainState?.population).toBeGreaterThan(50);
    expect(advanced?.grounding).toBe('MODEL_ESTIMATE');
  });

  it('produces an Evidence-compatible observation and event carrying the population measurement', () => {
    const graph = new WorldGraph();
    const entity = populationEntity('city-2', 100);
    graph.addEntity(entity);
    const router = new SolverRouter();
    router.register(LOGISTIC_GROWTH_SOLVER_ID, makeLogisticGrowthSolver());

    const report = router.routeTick(graph, 1, 1);
    expect(report.observations.length).toBe(1);
    const obs = report.observations[0]!;
    expect(obs.measurements.some((m) => m.key === 'population')).toBe(true);
    expect(report.events.length).toBe(1);
    expect(report.events[0]!.type).toBe('population.logistic.step');
  });

  it('honors per-entity growthRate/carryingCapacity overrides in domainState', () => {
    const graph = new WorldGraph();
    const entity = populationEntity('city-3', 10, { growthRate: 0, carryingCapacity: 500 });
    graph.addEntity(entity);
    const router = new SolverRouter();
    router.register(LOGISTIC_GROWTH_SOLVER_ID, makeLogisticGrowthSolver());
    router.routeTick(graph, 5, 1);
    const advanced = graph.getEntity(entity.id);
    expect(advanced?.domainState?.population).toBeCloseTo(10, 6);
  });

  it('finite-number validation: a non-finite population produces a no-op patch, never a fabricated value', () => {
    const graph = new WorldGraph();
    const entity = populationEntity('city-4', Number.NaN);
    graph.addEntity(entity);
    const router = new SolverRouter();
    router.register(LOGISTIC_GROWTH_SOLVER_ID, makeLogisticGrowthSolver());
    router.routeTick(graph, 1, 1);
    const advanced = graph.getEntity(entity.id);
    expect(advanced?.domainState?.population).toBeNaN();
    expect(advanced?.grounding).toBe('MODEL_ESTIMATE');
  });

  it('parameter validation: a non-positive carrying capacity produces a no-op patch', () => {
    const graph = new WorldGraph();
    const entity = populationEntity('city-5', 10, { carryingCapacity: 0 });
    graph.addEntity(entity);
    const router = new SolverRouter();
    router.register(LOGISTIC_GROWTH_SOLVER_ID, makeLogisticGrowthSolver());
    router.routeTick(graph, 1, 1);
    const advanced = graph.getEntity(entity.id);
    expect(advanced?.domainState?.population).toBe(10);
  });

  it('an entity with no domain binding at all is reported ungrounded, not silently advanced', () => {
    const graph = new WorldGraph();
    const ref = { kind: 'population', id: 'unbound-1' };
    graph.addEntity({
      id: entityId(ref), ref, label: 'Unbound', scale: { level: 'MACRO_CITY' },
      domainState: { population: 10 }, grounding: 'MODEL_ESTIMATE', updatedAtTick: 0,
    });
    const router = new SolverRouter();
    router.register(LOGISTIC_GROWTH_SOLVER_ID, makeLogisticGrowthSolver());
    const report = router.routeTick(graph, 1, 1);
    expect(report.ungrounded).toContain(entityId(ref));
  });
});
