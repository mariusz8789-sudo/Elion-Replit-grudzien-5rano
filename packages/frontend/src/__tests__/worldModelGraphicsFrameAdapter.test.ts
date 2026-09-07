import { describe, expect, it } from 'vitest';
import { toGraphicsGrounding, toGraphicsWorldFrame } from '../core/worldModel/bridge/graphicsWorldFrameAdapter';
import { getFrameState } from '../core/worldModel/bridge/worldFrameState';
import { buildGenesisScientificCity3 } from '../core/worldModel/domains/genesisScientificCity3';
import type { WorldFrameState } from '../core/worldModel/bridge/worldFrameState';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * C1/C2 INTEGRATION (Genesis Scientific World Model 3.0, section 15) — proves
 * the REAL adapter between C3's canonical `WorldFrameState` and C2's
 * `core/three/graphics/worldFrame.ts::WorldFrame`, on both a synthetic
 * fixture (exact field mapping) and a real generated world (end to end).
 */
describe('graphicsWorldFrameAdapter: field mapping', () => {
  const fixture: WorldFrameState = {
    branchId: 'b1',
    tick: 3,
    simulatedTime: 10_800,
    entities: [
      {
        id: 'pump-pipe-system:pump-pipe-1',
        parentId: 'building:water-system-building',
        ref: { kind: 'pump-pipe-system', id: 'pump-pipe-1' },
        transform: { position: { x: 1, y: 2, z: 3 }, rotation: { x: 0.1, y: 0.2, z: 0.3 }, scale: { x: 5, y: 5, z: 5 } },
        scalars: { headLoss: 42.5, volumetricFlow: 0.2 },
        statusLabel: 'Pump tripped (overload protection)',
        grounding: 'MODEL_ESTIMATE',
      },
      {
        id: 'planet:earth',
        parentId: undefined,
        ref: { kind: 'planet', id: 'earth' },
        transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
        scalars: {},
        statusLabel: undefined,
        grounding: 'UNGROUNDED_APPROXIMATION',
      },
    ],
    events: [],
  } as unknown as WorldFrameState;

  it('maps time from simulatedTime, never the raw tick', () => {
    const graphicsFrame = toGraphicsWorldFrame(fixture);
    expect(graphicsFrame.time).toBe(10_800);
    expect(graphicsFrame.time).not.toBe(fixture.tick);
  });

  it('maps every field for a real, grounded entity', () => {
    const graphicsFrame = toGraphicsWorldFrame(fixture);
    const pump = graphicsFrame.entities.find((e) => e.id === 'pump-pipe-system:pump-pipe-1')!;
    expect(pump.parentId).toBe('building:water-system-building');
    expect(pump.position).toEqual([1, 2, 3]);
    expect(pump.rotation).toEqual([0.1, 0.2, 0.3]);
    expect(pump.scale).toBe(5);
    expect(pump.scalars).toEqual({ headLoss: 42.5, volumetricFlow: 0.2 });
    expect(pump.status).toBe('Pump tripped (overload protection)');
    expect(pump.grounding).toBe('MODELED');
    expect(pump.visualHint).toBe('pump-pipe-system');
  });

  it('maps an ungrounded root entity honestly, with no parent', () => {
    const graphicsFrame = toGraphicsWorldFrame(fixture);
    const planet = graphicsFrame.entities.find((e) => e.id === 'planet:earth')!;
    expect(planet.parentId).toBeUndefined();
    expect(planet.grounding).toBe('NOT_MODELED');
  });

  it('preserves entity count and order', () => {
    const graphicsFrame = toGraphicsWorldFrame(fixture);
    expect(graphicsFrame.entities.map((e) => e.id)).toEqual(['pump-pipe-system:pump-pipe-1', 'planet:earth']);
  });
});

describe('toGraphicsGrounding: the 4-tier -> 3-tier honesty mapping', () => {
  it('collapses both real-solver tiers to MODELED, the fallback-heuristic tier to DERIVED, and the ungrounded tier to NOT_MODELED', () => {
    expect(toGraphicsGrounding('GROUNDED_EXACT')).toBe('MODELED');
    expect(toGraphicsGrounding('MODEL_ESTIMATE')).toBe('MODELED');
    expect(toGraphicsGrounding('PROCEDURAL_APPROXIMATION')).toBe('DERIVED');
    expect(toGraphicsGrounding('UNGROUNDED_APPROXIMATION')).toBe('NOT_MODELED');
  });
});

describe('graphicsWorldFrameAdapter: end to end on a real generated world', () => {
  it('adapts a real Genesis Scientific City 3.0 WorldFrame without dropping or corrupting any entity', () => {
    const city = buildGenesisScientificCity3({ rainfallAtTick: 2 });
    const engine = new TemporalEngine(city.graph);
    for (let i = 0; i < 4; i++) engine.advance(1, city.updater);

    const c3Frame = getFrameState(engine);
    const graphicsFrame = toGraphicsWorldFrame(c3Frame);

    expect(graphicsFrame.entities.length).toBe(c3Frame.entities.length);
    expect(graphicsFrame.time).toBe(c3Frame.simulatedTime);

    const pump = graphicsFrame.entities.find((e) => e.id === city.pumpPipeId)!;
    expect(pump).toBeDefined();
    expect(pump.position).toHaveLength(3);
    expect(typeof pump.scale).toBe('number');
    expect(['MODELED', 'DERIVED', 'NOT_MODELED']).toContain(pump.grounding);

    // The pump's real, solved scalar state (headLoss/volumetricFlow) survives the adaptation verbatim.
    const c3Pump = c3Frame.entities.find((e) => e.id === city.pumpPipeId)!;
    expect(pump.scalars).toEqual(c3Pump.scalars);
  });
});
