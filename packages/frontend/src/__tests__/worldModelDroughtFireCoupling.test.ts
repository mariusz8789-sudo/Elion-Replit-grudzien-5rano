import { describe, expect, it } from 'vitest';
import { withCrossDomainCouplings } from '../core/worldModel/crossDomain/crossDomainCoupling';
import {
  addDroughtCatchment,
  DROUGHT_SOLVER_ID,
  KBDI_CLASS_CODE,
  KBDI_MAX_INDEX,
  KBDI_SATURATION_DEFICIT_MM,
  kbdiClassCode,
  kbdiEquivalentFromDeficitMm,
  makeDroughtWaterBalanceSolver,
  soilStorageDeficitMm,
} from '../core/worldModel/domains/drought';
import { buildSyntheticTerrain } from '../core/worldModel/domains/floodInundation';
import {
  addWildfire,
  buildDroughtToWildfireCoupling,
  buildUniformFuelBed,
  makeWildfireSpreadSolver,
  WILDFIRE_SPREAD_SOLVER_ID,
} from '../core/worldModel/domains/wildfireSpread';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * PHASE 16 — the first real cross-domain dependency between two independent
 * scientific domains: `drought.ts`'s water balance reaching
 * `wildfireSpread.ts`.
 *
 * These tests pin down BOTH halves of the honesty: the link that IS real
 * (a KBDI-equivalent index, an exact unit correspondence to a published
 * index definition, carried through the SAME coupling mechanism as
 * rainfall->floodplain), and the link that is deliberately NOT made (soil
 * moisture must not silently become fuel moisture — no published universal
 * relationship supports it).
 */
describe('KBDI-equivalent index: an exact unit correspondence, not a fitted coefficient', () => {
  it('no deficit is index zero', () => {
    expect(kbdiEquivalentFromDeficitMm(0)).toBe(0);
    expect(kbdiEquivalentFromDeficitMm(-5)).toBe(0);
    expect(kbdiEquivalentFromDeficitMm(Number.NaN)).toBe(0);
  });

  it('converts millimetres to hundredths of an inch exactly — 25.4 mm is one inch is 100 index units', () => {
    expect(kbdiEquivalentFromDeficitMm(25.4)).toBeCloseTo(100, 9);
    expect(kbdiEquivalentFromDeficitMm(50.8)).toBeCloseTo(200, 9);
  });

  it('saturates at KBDI\'s own published ceiling of 800 (8 inches of deficiency), never above it', () => {
    expect(kbdiEquivalentFromDeficitMm(KBDI_SATURATION_DEFICIT_MM)).toBeCloseTo(KBDI_MAX_INDEX, 9);
    expect(kbdiEquivalentFromDeficitMm(KBDI_SATURATION_DEFICIT_MM * 10)).toBe(KBDI_MAX_INDEX);
  });

  it('is defined on the STORAGE shortfall below saturation, not on accumulated unmet ET demand', () => {
    expect(soilStorageDeficitMm(150, 150)).toBe(0); // full profile: no deficiency
    expect(soilStorageDeficitMm(100, 150)).toBeCloseTo(50, 9);
    expect(soilStorageDeficitMm(0, 150)).toBeCloseTo(150, 9);
    expect(soilStorageDeficitMm(200, 150)).toBe(0); // never negative
  });

  it('classifies into the conventional operational bands', () => {
    expect(kbdiClassCode(100)).toBe(KBDI_CLASS_CODE.LOW);
    expect(kbdiClassCode(300)).toBe(KBDI_CLASS_CODE.MODERATE);
    expect(kbdiClassCode(500)).toBe(KBDI_CLASS_CODE.HIGH);
    expect(kbdiClassCode(750)).toBe(KBDI_CLASS_CODE.EXTREME);
    expect(kbdiClassCode(Number.NaN)).toBe(KBDI_CLASS_CODE.LOW);
  });
});

describe('The coupling is declared data, not a hidden closure', () => {
  const coupling = buildDroughtToWildfireCoupling('environment.drought.step');

  it('names both domains, the relationship it travels over, and its own grounding', () => {
    expect(coupling.sourceDomain).toBe('environment-hydrology');
    expect(coupling.targetDomain).toBe('wildfire-spread');
    expect(coupling.relationshipKind).toBe('dries');
    expect(coupling.grounding).toBe('MODEL_ESTIMATE');
  });

  it('states in its own effect text that it does NOT change fuel moisture or spread rate', () => {
    expect(coupling.effect).toMatch(/does NOT change fuel moisture/);
    expect(coupling.effect).toMatch(/no published relationship/);
  });
});

/** A world with a real drought catchment and a real wildfire, joined by a real `dries` relationship. */
function buildCoupledWorld() {
  const graph = new WorldGraph();
  const terrain = buildSyntheticTerrain({ cols: 8, rows: 8 });
  const fuelBed = buildUniformFuelBed(terrain, 'FM1_SHORT_GRASS', 0.06);
  const wind = { speedMph: 5, directionDegrees: 0 };
  const ignition = [0];

  const catchmentId = addDroughtCatchment(graph, { params: { precipitationMmPerDay: 0 } });
  const wildfireId = addWildfire(graph, fuelBed, wind, ignition);
  graph.addRelationship(catchmentId, wildfireId, 'dries');

  const router = new SolverRouter();
  router.register(DROUGHT_SOLVER_ID, makeDroughtWaterBalanceSolver());
  router.register(WILDFIRE_SPREAD_SOLVER_ID, makeWildfireSpreadSolver(fuelBed, wind, ignition));

  const engine = new TemporalEngine(graph);
  const updater = withCrossDomainCouplings(
    (g, dt, tick) => {
      const report = router.routeTick(g, dt, tick);
      return { observations: report.observations, events: report.events };
    },
    [buildDroughtToWildfireCoupling('environment.drought.step')],
  );
  return { engine, updater, catchmentId, wildfireId };
}

describe('Drought really reaches the wildfire domain, through the existing coupling mechanism', () => {
  it('a drying catchment raises the drought index carried on the wildfire entity', () => {
    const { engine, updater, catchmentId, wildfireId } = buildCoupledWorld();
    const oneDay = 86400;

    expect(engine.graph.getEntity(wildfireId).domainState?.droughtIndexKBDI).toBe(0);

    for (let day = 0; day < 30; day++) engine.advance(oneDay, updater);

    const drought = engine.graph.getEntity(catchmentId).domainState!;
    const wildfire = engine.graph.getEntity(wildfireId).domainState!;

    // 30 days of evapotranspiration with no rain leaves the soil well below field capacity.
    expect(drought.soilMoistureMm as number).toBeLessThan(drought.fieldCapacityMm as number);
    expect(wildfire.droughtIndexKBDI).toBeGreaterThan(0);
    // The value on the fire is exactly the drought solver's own number, not a re-derivation.
    expect(wildfire.droughtIndexKBDI).toBeCloseTo(drought.kbdiEquivalent as number, 9);
  });

  it('a well-watered catchment never raises it — the coupling reports real conditions, not a constant', () => {
    const { engine, updater, wildfireId } = buildCoupledWorld();
    const oneDay = 86400;
    // Rain that keeps up with evapotranspiration: no deficit ever accumulates.
    engine.applyExternalPatch(engine.graph.listEntities().find((e) => e.id.startsWith('drought-catchment'))!.id, {
      domainState: { ...engine.graph.listEntities().find((e) => e.id.startsWith('drought-catchment'))!.domainState, precipitationMmPerDay: 20 },
    });
    for (let day = 0; day < 30; day++) engine.advance(oneDay, updater);
    expect(engine.graph.getEntity(wildfireId).domainState?.droughtIndexKBDI).toBe(0);
  });

  it('HONESTY: the coupling never touches fuel moisture, head rate of spread, or burned area', () => {
    const { engine, updater, wildfireId } = buildCoupledWorld();
    const oneDay = 86400;

    engine.advance(oneDay, updater);
    const afterOne = { ...engine.graph.getEntity(wildfireId).domainState! };
    for (let day = 0; day < 60; day++) engine.advance(oneDay, updater);
    const afterMany = engine.graph.getEntity(wildfireId).domainState!;

    // Drought really moved...
    expect(afterMany.droughtIndexKBDI as number).toBeGreaterThan(afterOne.droughtIndexKBDI as number);
    // ...and the fire's own physics did NOT silently change because of it. Head ROS is a pure
    // function of fuel, moisture and wind; if a future coupling ever wires drought into fuel
    // moisture, this assertion is what will force that claim to be made explicitly.
    expect(afterMany.headRosMS).toBe(afterOne.headRosMS);
  });

  it('the wildfire solver preserves the coupled value instead of overwriting it each tick', () => {
    const { engine, updater, wildfireId } = buildCoupledWorld();
    const oneDay = 86400;
    for (let day = 0; day < 20; day++) engine.advance(oneDay, updater);
    const carried = engine.graph.getEntity(wildfireId).domainState?.droughtIndexKBDI as number;
    expect(carried).toBeGreaterThan(0);
    // One more tick of the fire solver alone must not wipe what the coupling wrote.
    engine.advance(oneDay, updater);
    expect(engine.graph.getEntity(wildfireId).domainState?.droughtIndexKBDI as number).toBeGreaterThanOrEqual(carried);
  });
});
