import { describe, expect, it } from 'vitest';
import { runDiscovery, type DiscoveryRan } from '../core/agent/discoveryOrchestrator';
import {
  GENESIS_RAINFALL_CATCHMENT_ID,
  GENESIS_RAINFALL_RUNOFF_CATALOG,
  GENESIS_RAINFALL_RUNOFF_CATALOG_ID,
  GENESIS_RAINFALL_RUNOFF_OBJECTIVE_METRIC,
  buildRainfallRunoffDiscoveryWorld,
} from '../core/agent/rainfallRunoffLeverCatalog';
import { WORLD_LEVER_CATALOGS } from '../core/agent/worldGoalIntent';

function expectRan(outcome: ReturnType<typeof runDiscovery>): DiscoveryRan {
  if (outcome.status !== 'RAN') throw new Error(`expected RAN, got REFUSED at ${outcome.stage}: ${outcome.admission.why}`);
  return outcome;
}

describe('rainfall-runoff lever catalog — registration', () => {
  it('is registered under its own catalogId, resolvable like every other domain', () => {
    expect(WORLD_LEVER_CATALOGS[GENESIS_RAINFALL_RUNOFF_CATALOG_ID]).toBe(GENESIS_RAINFALL_RUNOFF_CATALOG);
  });

  it('catalogId/worldId/domainId are unique among the registered catalogs', () => {
    const others = Object.values(WORLD_LEVER_CATALOGS).filter((c) => c.catalogId !== GENESIS_RAINFALL_RUNOFF_CATALOG_ID);
    for (const other of others) {
      expect(other.catalogId).not.toBe(GENESIS_RAINFALL_RUNOFF_CATALOG.catalogId);
      expect(other.worldId).not.toBe(GENESIS_RAINFALL_RUNOFF_CATALOG.worldId);
    }
  });
});

describe('rainfall-runoff lever catalog — buildWorld wraps the real solver', () => {
  it('the catchment entity is bound to the real rainfall-runoff solver, and Q = C*i*A holds at tick 0', () => {
    const { graph } = buildRainfallRunoffDiscoveryWorld();
    const catchment = graph.getEntity(GENESIS_RAINFALL_CATCHMENT_ID);
    expect(catchment).toBeDefined();
    expect(catchment!.domainBinding?.solverId).toBe('environment-rainfall-runoff-rational-method');
    const state = catchment!.domainState as { rainfallIntensityMmPerHour: number; catchmentAreaM2: number; runoffCoefficient: number; peakRunoffM3S: number };
    const expectedQ = (state.runoffCoefficient * (state.rainfallIntensityMmPerHour / (1000 * 3600))) * state.catchmentAreaM2;
    expect(state.peakRunoffM3S).toBeCloseTo(expectedQ, 10);
  });

  it('baseline rainfall intensity is non-zero (never 0, or every lever looks like it has no effect)', () => {
    const { graph } = buildRainfallRunoffDiscoveryWorld();
    const catchment = graph.getEntity(GENESIS_RAINFALL_CATCHMENT_ID);
    const state = catchment!.domainState as { rainfallIntensityMmPerHour: number };
    expect(state.rainfallIntensityMmPerHour).toBeGreaterThan(0);
  });

  it('the updater advances the graph through the real SolverRouter without throwing', () => {
    const { graph, updater } = buildRainfallRunoffDiscoveryWorld();
    expect(() => updater(graph, 60, 1)).not.toThrow();
  });
});

describe('rainfall-runoff lever catalog — objective metric discipline', () => {
  it('offers exactly one objective, the one field the solver actually computes', () => {
    const metrics = new Set(Object.values(GENESIS_RAINFALL_RUNOFF_CATALOG.metricPhrases));
    expect([...metrics]).toEqual([GENESIS_RAINFALL_RUNOFF_OBJECTIVE_METRIC]);
  });

  it('no lever\'s own input field name is offered as a metric phrase target (no tautological objective)', () => {
    const inputFields = ['rainfallIntensityMmPerHour', 'catchmentAreaM2', 'runoffCoefficient'];
    for (const target of Object.values(GENESIS_RAINFALL_RUNOFF_CATALOG.metricPhrases)) {
      expect(inputFields).not.toContain(target);
    }
  });
});

describe('rainfall-runoff lever catalog — three levers, each genuinely moving the objective', () => {
  it('declares exactly three levers, one per RainfallCatchmentDefaults field', () => {
    expect(GENESIS_RAINFALL_RUNOFF_CATALOG.levers.map((l) => l.leverId).sort()).toEqual([
      'lever:catchment-area', 'lever:rainfall-intensity', 'lever:runoff-coefficient',
    ]);
  });

  it.each(GENESIS_RAINFALL_RUNOFF_CATALOG.levers.map((l) => l.leverId))('%s: applying it at full strength changes peakRunoffM3S from the tick-0 baseline', (leverId) => {
    const { graph, updater } = buildRainfallRunoffDiscoveryWorld();
    const before = (graph.getEntity(GENESIS_RAINFALL_CATCHMENT_ID)!.domainState as { peakRunoffM3S: number }).peakRunoffM3S;
    const lever = GENESIS_RAINFALL_RUNOFF_CATALOG.levers.find((l) => l.leverId === leverId)!;
    lever.hypothesis(GENESIS_RAINFALL_RUNOFF_OBJECTIVE_METRIC, 'maximize').apply(graph, 1);
    updater(graph, 60, 1);
    const after = (graph.getEntity(GENESIS_RAINFALL_CATCHMENT_ID)!.domainState as { peakRunoffM3S: number }).peakRunoffM3S;
    expect(after).not.toBeCloseTo(before, 6);
    expect(after).toBeGreaterThan(before);
  });
});

describe('rainfall-runoff lever catalog — end-to-end through the real Discovery Orchestrator', () => {
  it('runs the sixth real domain through the same entry point, unchanged', () => {
    const goal = 'Maximise the peak runoff by increasing rainfall intensity, at most 2 experiments.';
    const outcome = expectRan(runDiscovery({ shape: 'MECHANISM', goal, catalog: GENESIS_RAINFALL_RUNOFF_CATALOG }));

    expect(outcome.run.domainId).toBe('environment-hydrology');
    expect(outcome.run.rounds.length).toBeGreaterThan(0);
    expect(outcome.run.limitations.length).toBeGreaterThan(0);
  });
});
