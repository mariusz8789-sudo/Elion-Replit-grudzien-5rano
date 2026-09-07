import { describe, expect, it } from 'vitest';
import { toGraphicsWorldFrame } from '../core/worldModel/bridge/graphicsWorldFrameAdapter';
import { getFrameState } from '../core/worldModel/bridge/worldFrameState';
import {
  buildGenesisScientificCity3,
  buildGenesisScientificCityTerrain,
  GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID,
  PUMP_TRIPPED_EVENT_TYPE,
} from '../core/worldModel/domains/genesisScientificCity3';
import {
  addFloodplain,
  buildSyntheticTerrain,
  cellAreaM2,
  FLOOD_STATE_CODE,
  FLOOD_STATES,
  FLOOD_INUNDATION_SOLVER_ID,
  floodStateCode,
  floodStateLabel,
  groundingFor,
  HYDROGRAPH_NOT_YET_S,
  makeFloodInundationSolver,
  manningsWideChannelVelocityMS,
  naturalOutletFlux,
  naturalOutletSillElevationM,
  waterLevelForVolume,
  type TerrainHeightfield,
} from '../core/worldModel/domains/floodInundation';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import { getEventHistoryFor } from '../core/worldModel/queries/worldQueries';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * PHASE 8.2 / 12.3 — FLOOD INUNDATION, NOW WITH A HYDROGRAPH.
 *
 * `solverCapability.ts` said FLOOD lacked "terrain, depth, flood extent,
 * hydrograph". These tests pin down that all four now exist: the fill
 * conserves volume as before, and storage (level-pool) routing through a
 * real Manning's-equation natural outlet now gives a real routed outflow,
 * velocity, arrival time, and routing lag — built entirely on the SAME
 * terrain and planar fill, never a second geometry model.
 */

/** A terrain with an exactly-known capacity, so volume conservation can be checked against arithmetic rather than against itself. */
function flatBasin(cols = 10, rows = 10, cellSizeM = 1, depthM = 1): TerrainHeightfield {
  const elevationsM = new Array(cols * rows).fill(depthM);
  // A 3x3 flat-bottomed pit at elevation 0, walls at `depthM`.
  for (let y = 3; y < 6; y++) for (let x = 3; x < 6; x++) elevationsM[y * cols + x] = 0;
  return { cols, rows, cellSizeM, elevationsM, surveyed: false, provenance: 'test fixture: 3x3 flat pit' };
}

/** A bowl (as `buildSyntheticTerrain`'s shape, but hand-built for an exact, distinguishable sill) with one boundary cell carved down to `notchElevationM` — a real, geometry-derived low point on the rim, distinct from the rest of the boundary. */
function bowlWithSpillwayNotch(cols = 15, rows = 15, cellSizeM = 2, reliefM = 2, notchElevationM = 0.5): TerrainHeightfield {
  const elevationsM: number[] = new Array(cols * rows);
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const maxR = Math.hypot(cx, cy);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const r = Math.hypot(x - cx, y - cy) / maxR;
      elevationsM[y * cols + x] = reliefM * r * r;
    }
  }
  elevationsM[Math.floor(cols / 2)] = notchElevationM; // top-row midpoint: a spillway notch, lower than the rest of the rim
  return { cols, rows, cellSizeM, elevationsM, surveyed: false, provenance: 'test fixture: bowl with a spillway notch' };
}

describe('The fill conserves volume, against arithmetic', () => {
  it('a 3x3 pit of 1 m² cells filled to 0.5 m holds exactly 4.5 m³', () => {
    const terrain = flatBasin();
    const result = waterLevelForVolume(terrain, 4.5);
    expect(result.heldVolumeM3).toBeCloseTo(4.5, 6);
    expect(result.waterLevelM).toBeCloseTo(0.5, 6);
    expect(result.maxDepthM).toBeCloseTo(0.5, 6);
    expect(result.floodedAreaM2).toBe(9);
    expect(result.floodedCells).toBe(9);
    expect(result.unrepresentedVolumeM3).toBeCloseTo(0, 6);
  });

  it('depth and extent both rise with volume, monotonically', () => {
    const terrain = buildGenesisScientificCityTerrain();
    let lastDepth = -1;
    let lastArea = -1;
    for (const v of [1, 10, 100, 1000, 5000]) {
      const r = waterLevelForVolume(terrain, v);
      expect(r.maxDepthM).toBeGreaterThanOrEqual(lastDepth);
      expect(r.floodedAreaM2).toBeGreaterThanOrEqual(lastArea);
      lastDepth = r.maxDepthM;
      lastArea = r.floodedAreaM2;
    }
  });

  it('no water, no flood — and a negative or NaN volume is dry, not an exception', () => {
    const terrain = flatBasin();
    for (const v of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = waterLevelForVolume(terrain, v);
      expect(r.maxDepthM).toBe(0);
      expect(r.floodedAreaM2).toBe(0);
    }
  });

  it('a hollow the water cannot REACH stays dry — the connectivity constraint, not a plain bathtub', () => {
    // Two pits at the same depth, separated by a wall. Water enters the deeper one only.
    const cols = 11;
    const rows = 3;
    const elevationsM = new Array(cols * rows).fill(5);
    for (let y = 0; y < rows; y++) {
      elevationsM[y * cols + 1] = 0;    // left pit, the global minimum
      elevationsM[y * cols + 9] = 0.5;  // right hollow, below the water level but walled off
    }
    const terrain: TerrainHeightfield = { cols, rows, cellSizeM: 1, elevationsM, surveyed: false, provenance: 'test fixture: two separated pits' };
    const result = waterLevelForVolume(terrain, 6); // 3 cells x 2 m depth in the left pit
    expect(result.waterLevelM).toBeGreaterThan(0.5); // high enough to submerge the right hollow...
    expect(result.floodedCells).toBe(3);             // ...which nevertheless stays dry
  });

  it('a saddle crossing is disclosed as unplaced volume, never as overstated depth', () => {
    const terrain = buildGenesisScientificCityTerrain();
    // Measured on this terrain: the fill is exact at almost every volume, and reports a shortfall
    // only where a single level genuinely cannot hold the water (a spill between depressions).
    const exact = waterLevelForVolume(terrain, 1000);
    expect(exact.unrepresentedVolumeM3).toBeCloseTo(0, 6);

    const atSaddle = waterLevelForVolume(terrain, 10);
    expect(atSaddle.unrepresentedVolumeM3).toBeGreaterThan(0);
    // The point of the conservative choice: held is never MORE than requested, so depth is never
    // overstated. Taking the level above the jump would have reported 3.6x this volume.
    expect(atSaddle.heldVolumeM3).toBeLessThanOrEqual(10);
    expect(atSaddle.heldVolumeM3 + atSaddle.unrepresentedVolumeM3).toBeCloseTo(10, 6);
  });
});

describe('Grounding follows the terrain, and is not a caller\'s choice', () => {
  it('synthetic terrain can only ever produce PROCEDURAL_APPROXIMATION', () => {
    expect(buildSyntheticTerrain().surveyed).toBe(false);
    expect(groundingFor(0)).toBe('PROCEDURAL_APPROXIMATION');
  });

  it('real surveyed elevations upgrade it to MODEL_ESTIMATE — the same algorithm, better ground', () => {
    expect(groundingFor(1)).toBe('MODEL_ESTIMATE');
  });

  it('the reference city\'s floodplain reports the synthetic tier, and says so in its provenance', () => {
    const terrain = buildGenesisScientificCityTerrain();
    expect(terrain.surveyed).toBe(false);
    expect(terrain.provenance).toMatch(/NOT a real place/);
    const city = buildGenesisScientificCity3({});
    expect(city.graph.getEntity(GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID).grounding).toBe('PROCEDURAL_APPROXIMATION');
  });

  it('the terrain is deterministic: the same seed gives byte-identical elevations', () => {
    expect(buildSyntheticTerrain({ seed: 7 }).elevationsM).toEqual(buildSyntheticTerrain({ seed: 7 }).elevationsM);
    expect(buildSyntheticTerrain({ seed: 7 }).elevationsM).not.toEqual(buildSyntheticTerrain({ seed: 8 }).elevationsM);
    expect(cellAreaM2(buildSyntheticTerrain({ cellSizeM: 3 }))).toBe(9);
  });
});

describe('The flood is a consequence of the pump trip, not a script', () => {
  function runCity(ticks: number) {
    const city = buildGenesisScientificCity3({ rainfallAtTick: 2 });
    const engine = new TemporalEngine(city.graph);
    for (let i = 0; i < ticks; i++) engine.advance(1, city.updater);
    return { city, engine };
  }
  const floodState = (engine: TemporalEngine) => engine.graph.getEntity(GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID).domainState!;

  it('while the pump runs, drainage matches inflow and nothing accumulates', () => {
    const { engine } = runCity(2);
    const state = floodState(engine);
    expect(state.inflowM3S).toBeGreaterThan(0);      // it really is raining
    expect(state.drainageM3S).toBe(state.inflowM3S); // and the drain really is keeping up
    expect(state.waterVolumeM3).toBe(0);
    expect(state.maxDepthM).toBe(0);
  });

  it('the trip stops drainage, and depth then grows on the volume balance alone', () => {
    const { city, engine } = runCity(12);
    expect(getEventHistoryFor(engine, city.pumpPipeId).some((e) => e.type === PUMP_TRIPPED_EVENT_TYPE)).toBe(true);

    const state = floodState(engine);
    expect(state.drainageM3S).toBe(0);
    expect(state.inflowM3S).toBeGreaterThan(0); // rain has not stopped
    expect(state.waterVolumeM3).toBeGreaterThan(0);
    expect(state.maxDepthM).toBeGreaterThan(0);
    expect(state.floodedAreaM2).toBeGreaterThan(0);
  });

  it('depth increases every tick after the trip — accumulation, not a one-off jump', () => {
    const city = buildGenesisScientificCity3({ rainfallAtTick: 2 });
    const engine = new TemporalEngine(city.graph);
    const depths: number[] = [];
    for (let i = 0; i < 12; i++) {
      engine.advance(1, city.updater);
      depths.push(floodState(engine).maxDepthM as number);
    }
    const afterTrip = depths.slice(5);
    for (let i = 1; i < afterTrip.length; i++) expect(afterTrip[i]).toBeGreaterThan(afterTrip[i - 1]);
  });

  it('no rainfall, no flood: a quiet city stays dry forever', () => {
    const city = buildGenesisScientificCity3({});
    const engine = new TemporalEngine(city.graph);
    for (let i = 0; i < 20; i++) engine.advance(1, city.updater);
    const state = floodState(engine);
    expect(state.waterVolumeM3).toBe(0);
    expect(state.stateCode).toBe(FLOOD_STATE_CODE.DRY);
  });

  it('drainage can never remove water that is not there', () => {
    const city = buildGenesisScientificCity3({});
    const engine = new TemporalEngine(city.graph);
    engine.applyExternalPatch(GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID, {
      domainState: { ...engine.graph.getEntity(GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID).domainState, inflowM3S: 0, drainageM3S: 5, waterVolumeM3: 1 },
    });
    for (let i = 0; i < 5; i++) engine.advance(1, city.updater);
    expect(floodState(engine).waterVolumeM3).toBe(0); // emptied, never negative
  });
});

describe('Rule 3 and the C2 boundary', () => {
  it('the state code is a number on the frame, with the token alongside', () => {
    const city = buildGenesisScientificCity3({ rainfallAtTick: 2 });
    const engine = new TemporalEngine(city.graph);
    for (let i = 0; i < 12; i++) engine.advance(1, city.updater);

    const frame = toGraphicsWorldFrame(getFrameState(engine));
    const floodplain = frame.entities.find((e) => e.id === GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID)!;
    expect(typeof floodplain.scalars!.stateCode).toBe('number');
    expect(floodplain.scalars!.maxDepthM).toBeGreaterThan(0);
    expect(floodplain.scalars!.floodedAreaM2).toBeGreaterThan(0);
    expect(FLOOD_STATES).toContain(floodplain.status as (typeof FLOOD_STATES)[number]);
    // Rule 2: the grid geometry travels with the extent, so a consumer can interpret an area.
    expect(floodplain.scalars!.terrainCellSizeM).toBe(2);
  });

  it('depth bands map onto the allowlist and never outside it', () => {
    expect(floodStateCode(0)).toBe(FLOOD_STATE_CODE.DRY);
    expect(floodStateCode(0.05)).toBe(FLOOD_STATE_CODE.PONDING);
    expect(floodStateCode(0.2)).toBe(FLOOD_STATE_CODE.FLOODED);
    expect(floodStateCode(1.5)).toBe(FLOOD_STATE_CODE.SEVERE);
    for (const nonsense of [-1, 99, Number.NaN]) expect(FLOOD_STATES).toContain(floodStateLabel(nonsense));
  });

  it('replay reconstructs the flooded world exactly', () => {
    const city = buildGenesisScientificCity3({ rainfallAtTick: 2 });
    const engine = new TemporalEngine(city.graph);
    for (let i = 0; i < 10; i++) engine.advance(1, city.updater);
    expect(engine.scrubTo(engine.tick).getEntity(GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID).domainState)
      .toEqual(engine.graph.getEntity(GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID).domainState);
    // Tick 0 predates the storm.
    expect(engine.scrubTo(0).getEntity(GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID).domainState?.waterVolumeM3).toBe(0);
  });
});

describe('The natural outlet — Manning\'s equation on the SAME terrain, no second geometry', () => {
  it('the sill is the real lowest boundary cell, not the interior minimum', () => {
    const flat = flatBasin(); // boundary uniformly at depthM=1; the 3x3 pit is interior only
    expect(naturalOutletSillElevationM(flat)).toBeCloseTo(1, 6);

    const notched = bowlWithSpillwayNotch();
    expect(naturalOutletSillElevationM(notched)).toBeCloseTo(0.5, 6);
  });

  it('Manning\'s velocity is zero at/below the sill and grows with head, roughness, and slope', () => {
    expect(manningsWideChannelVelocityMS(0, 0.035, 0.01)).toBe(0);
    expect(manningsWideChannelVelocityMS(-1, 0.035, 0.01)).toBe(0);
    const v1 = manningsWideChannelVelocityMS(0.5, 0.035, 0.01);
    const v2 = manningsWideChannelVelocityMS(1.0, 0.035, 0.01);
    expect(v2).toBeGreaterThan(v1); // deeper flow is faster
    expect(manningsWideChannelVelocityMS(0.5, 0.02, 0.01)).toBeGreaterThan(v1); // smoother channel (lower n) is faster
    expect(manningsWideChannelVelocityMS(0.5, 0.035, 0.04)).toBeGreaterThan(v1); // steeper slope is faster
  });

  it('natural outlet flux is exactly zero below the sill and positive above it', () => {
    const below = naturalOutletFlux(0.3, 0.5, 5, 0.035, 0.01);
    expect(below.headM).toBe(0);
    expect(below.velocityMS).toBe(0);
    expect(below.outflowM3S).toBe(0);

    const above = naturalOutletFlux(1.2, 0.5, 5, 0.035, 0.01);
    expect(above.headM).toBeCloseTo(0.7, 6);
    expect(above.velocityMS).toBeGreaterThan(0);
    expect(above.outflowM3S).toBeCloseTo(above.velocityMS * 5 * 0.7, 6);
  });
});

describe('A real, routed hydrograph — storage (level-pool) routing through the natural outlet', () => {
  function buildRoutedFloodplain() {
    const graph = new WorldGraph();
    const terrain = bowlWithSpillwayNotch();
    const floodplainId = addFloodplain(graph, { terrain, floodplainId: 'routed-1' });
    const router = new SolverRouter();
    router.register(FLOOD_INUNDATION_SOLVER_ID, makeFloodInundationSolver(terrain));
    return { graph, router, floodplainId };
  }

  it('the outlet stays silent while the basin is below the sill, then engages once it rises above it', () => {
    const { graph, router, floodplainId } = buildRoutedFloodplain();
    // A small pulse, well short of the volume needed to reach the notch (relief 2m over a 30x30m bowl).
    graph.updateEntity(floodplainId, { domainState: { ...graph.getEntity(floodplainId).domainState, inflowM3S: 0.01 } });
    for (let tick = 0; tick < 5; tick++) router.routeTick(graph, 5, tick + 1);
    const early = graph.getEntity(floodplainId).domainState!;
    expect(early.spillOutflowM3S).toBe(0);
    expect(early.outletArrivalTimeS).toBe(HYDROGRAPH_NOT_YET_S);

    // A large, sustained inflow — far more than the basin can hold below the notch.
    graph.updateEntity(floodplainId, { domainState: { ...graph.getEntity(floodplainId).domainState, inflowM3S: 50 } });
    let last = early;
    for (let tick = 5; tick < 25; tick++) {
      router.routeTick(graph, 5, tick + 1);
      last = graph.getEntity(floodplainId).domainState!;
    }
    expect(last.spillOutflowM3S).toBeGreaterThan(0);
    expect(last.outletVelocityMS).toBeGreaterThan(0);
    expect(last.outletArrivalTimeS).toBeGreaterThan(0); // a real, computed arrival time, not asserted
    expect(last.outletSillElevationM).toBeCloseTo(0.5, 6);
  });

  it('peak outflow lags peak inflow — the actual routing/attenuation signature, not a scripted delay', () => {
    const { graph, router, floodplainId } = buildRoutedFloodplain();
    // Sustained heavy inflow so the basin fills past the sill quickly, then it stops entirely.
    graph.updateEntity(floodplainId, { domainState: { ...graph.getEntity(floodplainId).domainState, inflowM3S: 60 } });
    for (let tick = 0; tick < 15; tick++) router.routeTick(graph, 5, tick + 1);

    graph.updateEntity(floodplainId, { domainState: { ...graph.getEntity(floodplainId).domainState, inflowM3S: 0 } });
    for (let tick = 15; tick < 60; tick++) router.routeTick(graph, 5, tick + 1);

    const state = graph.getEntity(floodplainId).domainState!;
    expect(state.peakInflowSoFarM3S).toBeCloseTo(60, 6);
    expect(state.peakOutflowSoFarM3S).toBeGreaterThan(0);
    // Inflow peaked immediately (the very first tick it was ever applied); outflow could only peak
    // once the basin had actually risen above the sill — strictly later.
    expect(state.peakOutflowSoFarTimeS).toBeGreaterThan(state.peakInflowSoFarTimeS);
    expect(state.routingLagSoFarS).toBeGreaterThan(0);
  });

  it('after inflow stops, the routed outflow recedes — a recession limb, not a step function', () => {
    const { graph, router, floodplainId } = buildRoutedFloodplain();
    graph.updateEntity(floodplainId, { domainState: { ...graph.getEntity(floodplainId).domainState, inflowM3S: 60 } });
    for (let tick = 0; tick < 15; tick++) router.routeTick(graph, 5, tick + 1);
    graph.updateEntity(floodplainId, { domainState: { ...graph.getEntity(floodplainId).domainState, inflowM3S: 0 } });

    let tick = 15;
    for (; tick < 20; tick++) router.routeTick(graph, 5, tick + 1);
    const peakOutflow = graph.getEntity(floodplainId).domainState!.spillOutflowM3S as number;
    expect(peakOutflow).toBeGreaterThan(0);

    for (; tick < 80; tick++) router.routeTick(graph, 5, tick + 1);
    const laterOutflow = graph.getEntity(floodplainId).domainState!.spillOutflowM3S as number;
    expect(laterOutflow).toBeLessThan(peakOutflow);
  });

  it('infiltration is a real loss: the same inflow schedule ends with less standing volume than with infiltration disabled', () => {
    const terrain = bowlWithSpillwayNotch();
    function runWith(infiltrationRateMPerS: number): number {
      const graph = new WorldGraph();
      const floodplainId = addFloodplain(graph, { terrain, floodplainId: 'infil-1', params: { infiltrationRateMPerS } });
      const router = new SolverRouter();
      router.register(FLOOD_INUNDATION_SOLVER_ID, makeFloodInundationSolver(terrain));
      graph.updateEntity(floodplainId, { domainState: { ...graph.getEntity(floodplainId).domainState, inflowM3S: 5 } });
      for (let tick = 0; tick < 30; tick++) router.routeTick(graph, 5, tick + 1);
      return graph.getEntity(floodplainId).domainState!.waterVolumeM3 as number;
    }

    const withInfiltration = runWith(1.39e-6);
    const withoutInfiltration = runWith(0);
    expect(withInfiltration).toBeLessThan(withoutInfiltration);
  });

  it('the hydrograph is grounded like the rest of this domain: MODEL_ESTIMATE only on real survey elevations', () => {
    const { graph, router, floodplainId } = buildRoutedFloodplain();
    router.routeTick(graph, 5, 1);
    expect(graph.getEntity(floodplainId).grounding).toBe('PROCEDURAL_APPROXIMATION'); // synthetic test terrain
  });
});
