import { describe, expect, it } from 'vitest';
import { inspectEntity, leversForEntity, applyLeverIntervention } from '../core/worldModel/bridge/entityInteractionBridge';
import { GENESIS_FLOOD_CATALOG, GENESIS_FLOOD_LEVERS } from '../core/agent/worldGoalIntent';
import {
  buildGenesisScientificCity3,
  GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID,
  GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID,
} from '../core/worldModel/domains/genesisScientificCity3';
import { TemporalBranchRegistry, TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * GENERIC INTERACTION SYSTEM — `entityInteractionBridge.ts` is the C2-side seam that lets ANY
 * WorldFrame entity, not just the pump, support walk→inspect→change→fork. These tests exercise it
 * directly against the real flagship city and the real, already-shipped flood levers — no mocks, no
 * synthetic graph, since the whole point is that this bridge adds no new physics of its own.
 */

function realEngine(): TemporalEngine {
  const city = buildGenesisScientificCity3({ rainfallAtTick: 2 });
  return new TemporalEngine(city.graph, { registry: new TemporalBranchRegistry() });
}

describe('entityInteractionBridge', () => {
  it('inspectEntity reads the real, current state of the pump off the live graph', () => {
    const engine = realEngine();
    const inspection = inspectEntity(engine.graph, GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID);
    expect(inspection).not.toBeNull();
    expect(inspection!.id).toBe(GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID);
    expect(typeof inspection!.domainState?.volumetricFlow).toBe('number');
  });

  it('inspectEntity returns null for an id the graph does not have', () => {
    const engine = realEngine();
    expect(inspectEntity(engine.graph, 'nonexistent:entity')).toBeNull();
  });

  it('leversForEntity finds exactly the real levers targeting the floodplain (outlet + infiltration)', () => {
    const levers = leversForEntity(GENESIS_FLOOD_CATALOG, GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID);
    expect(levers.map((l) => l.leverId).sort()).toEqual(['lever:infiltration', 'lever:outlet-capacity']);
  });

  it('leversForEntity finds exactly the real lever targeting the pump', () => {
    const levers = leversForEntity(GENESIS_FLOOD_CATALOG, GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID);
    expect(levers.map((l) => l.leverId)).toEqual(['lever:pump-capacity']);
  });

  it('leversForEntity is honestly empty for an entity the world declares no mechanism for', () => {
    expect(leversForEntity(GENESIS_FLOOD_CATALOG, 'building:hospital-building')).toEqual([]);
  });

  it('applyLeverIntervention forks the engine and really runs the pump lever\'s own mutation', () => {
    const engine = realEngine();
    const before = engine.graph.getEntity(GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID).domainState!.volumetricFlow as number;
    const pumpLever = GENESIS_FLOOD_LEVERS.find((l) => l.leverId === 'lever:pump-capacity')!;
    const forked = applyLeverIntervention(engine, pumpLever, 'maxDepthM', 'minimize', 'test-pump-lever');
    const after = forked.graph.getEntity(GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID).domainState!.volumetricFlow as number;
    expect(after).toBeGreaterThan(before);
    // The control holds by construction: the baseline is untouched by the fork's mutation.
    expect(engine.graph.getEntity(GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID).domainState!.volumetricFlow).toBe(before);
  });

  it('applyLeverIntervention really runs the floodplain outlet lever\'s own mutation', () => {
    const engine = realEngine();
    const outletLever = GENESIS_FLOOD_LEVERS.find((l) => l.leverId === 'lever:outlet-capacity')!;
    const forked = applyLeverIntervention(engine, outletLever, 'maxDepthM', 'minimize', 'test-outlet-lever');
    const outletWidthM = forked.graph.getEntity(GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID).domainState!.outletWidthM as number;
    expect(outletWidthM).toBeCloseTo(40, 5); // floodplainLever('outletWidthM', 40, 5) at strength 1
  });
});
