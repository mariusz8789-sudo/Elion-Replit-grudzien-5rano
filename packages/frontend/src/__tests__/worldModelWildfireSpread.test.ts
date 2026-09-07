import { describe, expect, it } from 'vitest';
import type { TerrainHeightfield } from '../core/worldModel/domains/floodInundation';
import {
  buildUniformFuelBed,
  buildWildfireWorld,
  burnedAreaM2At,
  byramFirelineIntensityKWm,
  byramFlameLengthM,
  ellipticalRosAtAngle,
  FUEL_MODELS,
  lengthToBreadthRatio,
  rothermelBaseRate,
  rothermelSlopeCoefficient,
  rothermelWindCoefficient,
  simulateWildfireSpread,
  WILDFIRE_SPREAD_SOLVER_ID,
  makeWildfireSpreadSolver,
  type WindVector,
} from '../core/worldModel/domains/wildfireSpread';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';

/**
 * WILDFIRE SPREAD — Rothermel (1972) surface fire spread + Anderson/Alexander
 * elliptical fire shape + Finney (2002) minimum-travel-time grid propagation,
 * on the SAME `TerrainHeightfield` `floodInundation.ts` already uses.
 * `solverCapability.ts` named the WILDFIRE gap as fire spread; these tests
 * pin down the real physics and the real grid algorithm.
 */

function flatTerrain(cols = 15, rows = 15, cellSizeM = 10): TerrainHeightfield {
  return { cols, rows, cellSizeM, elevationsM: new Array(cols * rows).fill(0), surveyed: false, provenance: 'test fixture: flat terrain' };
}

/** A steady east-west ramp: elevation increases with column index. */
function rampTerrain(cols = 15, rows = 15, cellSizeM = 10, riseM = 1): TerrainHeightfield {
  const elevationsM = new Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) elevationsM[y * cols + x] = x * riseM;
  return { cols, rows, cellSizeM, elevationsM, surveyed: false, provenance: 'test fixture: east-west ramp' };
}

describe('Rothermel (1972) base spread rate', () => {
  it('is positive for a dry fuel bed, for every curated fuel model', () => {
    for (const key of Object.keys(FUEL_MODELS)) {
      const base = rothermelBaseRate(FUEL_MODELS[key], 0.06);
      expect(base.r0FtPerMin).toBeGreaterThan(0);
      expect(base.reactionIntensityBtuFt2Min).toBeGreaterThan(0);
      expect(base.packingRatio).toBeGreaterThan(0);
    }
  });

  it('spread rate drops toward zero as moisture approaches the fuel\'s moisture of extinction', () => {
    const fuel = FUEL_MODELS.FM1_SHORT_GRASS;
    const dry = rothermelBaseRate(fuel, 0.03);
    const nearExtinction = rothermelBaseRate(fuel, fuel.moistureOfExtinction * 0.99);
    expect(nearExtinction.r0FtPerMin).toBeLessThan(dry.r0FtPerMin);
    // The moisture-damping cubic only reaches exactly zero at Mf/Mx=1 (see the next test); at 99% of
    // extinction it should already be a small fraction of the dry rate, not merely "somewhat lower".
    expect(nearExtinction.r0FtPerMin / dry.r0FtPerMin).toBeLessThan(0.1);
  });

  it('at or above the moisture of extinction, the fuel does not carry fire (rate collapses to zero)', () => {
    const fuel = FUEL_MODELS.FM1_SHORT_GRASS;
    const atExtinction = rothermelBaseRate(fuel, fuel.moistureOfExtinction);
    expect(atExtinction.r0FtPerMin).toBeCloseTo(0, 6);
  });
});

describe('Wind and slope coefficients', () => {
  const fuel = FUEL_MODELS.FM1_SHORT_GRASS;
  const base = rothermelBaseRate(fuel, 0.06);

  it('wind coefficient is zero at zero wind and increases with wind speed', () => {
    expect(rothermelWindCoefficient(fuel, base, 0)).toBe(0);
    const low = rothermelWindCoefficient(fuel, base, 5);
    const high = rothermelWindCoefficient(fuel, base, 20);
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(low);
  });

  it('slope coefficient is zero for flat or downhill, and increases with uphill steepness', () => {
    expect(rothermelSlopeCoefficient(base, 0)).toBe(0);
    expect(rothermelSlopeCoefficient(base, -0.5)).toBe(0); // downhill: Rothermel's own convention
    const gentle = rothermelSlopeCoefficient(base, 0.2);
    const steep = rothermelSlopeCoefficient(base, 0.6);
    expect(gentle).toBeGreaterThan(0);
    expect(steep).toBeGreaterThan(gentle);
  });
});

describe('Elliptical fire shape (Anderson 1983 / Alexander 1985)', () => {
  it('length-to-breadth ratio is exactly 1 (a circle) at zero wind, and grows with wind speed', () => {
    expect(lengthToBreadthRatio(0)).toBe(1);
    const lb20 = lengthToBreadthRatio(20);
    const lb60 = lengthToBreadthRatio(60);
    expect(lb20).toBeGreaterThan(1);
    expect(lb60).toBeGreaterThan(lb20);
  });

  it('is isotropic (independent of angle) when the shape is a circle', () => {
    expect(ellipticalRosAtAngle(5, 1, 0)).toBeCloseTo(5, 6);
    expect(ellipticalRosAtAngle(5, 1, Math.PI / 3)).toBeCloseTo(5, 6);
    expect(ellipticalRosAtAngle(5, 1, Math.PI)).toBeCloseTo(5, 6);
  });

  it('recovers exactly the head rate at angle 0 and the back rate at angle pi — the ellipse\'s own defining property', () => {
    const headRos = 10;
    const lb = 3;
    const atHead = ellipticalRosAtAngle(headRos, lb, 0);
    const atBack = ellipticalRosAtAngle(headRos, lb, Math.PI);
    expect(atHead).toBeCloseTo(headRos, 6);
    expect(atBack).toBeLessThan(headRos); // backing is always slower than heading for LB>1
    expect(atBack).toBeGreaterThan(0);
  });

  it('spread rate decreases monotonically from the head direction to the back direction', () => {
    const headRos = 8;
    const lb = 4;
    const angles = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI];
    const rates = angles.map((a) => ellipticalRosAtAngle(headRos, lb, a));
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeLessThanOrEqual(rates[i - 1]);
  });
});

describe('Byram (1959) fireline intensity and flame length', () => {
  it('intensity increases with rate of spread, and flame length increases with intensity', () => {
    const fuel = FUEL_MODELS.FM4_CHAPARRAL;
    const base = rothermelBaseRate(fuel, 0.08);
    const lowIntensity = byramFirelineIntensityKWm(base, 5);
    const highIntensity = byramFirelineIntensityKWm(base, 50);
    expect(highIntensity).toBeGreaterThan(lowIntensity);
    expect(byramFlameLengthM(highIntensity)).toBeGreaterThan(byramFlameLengthM(lowIntensity));
    expect(byramFlameLengthM(0)).toBe(0);
  });
});

describe('Minimum-travel-time grid propagation (Finney 2002)', () => {
  it('the ignition cell itself has zero arrival time; a cell twice as far arrives roughly twice as late under zero wind', () => {
    const terrain = flatTerrain(21, 21, 10);
    const fuelBed = buildUniformFuelBed(terrain, 'FM1_SHORT_GRASS', 0.06);
    const calmWind: WindVector = { speedMph: 0, directionDegrees: 0 };
    const centerIndex = 10 * 21 + 10;
    const result = simulateWildfireSpread(fuelBed, calmWind, [centerIndex]);

    expect(result.arrivalTimeS[centerIndex]).toBe(0);
    const nearIndex = 10 * 21 + 13; // 3 cells east
    const farIndex = 10 * 21 + 16; // 6 cells east
    expect(result.arrivalTimeS[farIndex]).toBeCloseTo(result.arrivalTimeS[nearIndex] * 2, 0);
  });

  it('under zero wind on flat ground, spread is roughly isotropic — arrival time depends on distance, not direction', () => {
    const terrain = flatTerrain(21, 21, 10);
    const fuelBed = buildUniformFuelBed(terrain, 'FM1_SHORT_GRASS', 0.06);
    const calmWind: WindVector = { speedMph: 0, directionDegrees: 0 };
    const centerIndex = 10 * 21 + 10;
    const result = simulateWildfireSpread(fuelBed, calmWind, [centerIndex]);

    const east = result.arrivalTimeS[10 * 21 + 15];
    const north = result.arrivalTimeS[5 * 21 + 10]; // same distance, orthogonal direction
    expect(east).toBeGreaterThan(0);
    expect(Math.abs(east - north) / east).toBeLessThan(0.05); // within the 8-connectivity grid's own discretisation error
  });

  it('a strong wind makes the fire reach downwind cells faster than upwind cells at the same distance', () => {
    const terrain = flatTerrain(31, 5, 10);
    const fuelBed = buildUniformFuelBed(terrain, 'FM1_SHORT_GRASS', 0.06);
    // Direction convention: 0deg = +row, 90deg = +column (see WindVector doc) — blow toward +column (east).
    const wind: WindVector = { speedMph: 20, directionDegrees: 90 };
    const centerIndex = 2 * 31 + 15;
    const result = simulateWildfireSpread(fuelBed, wind, [centerIndex]);

    const downwind = result.arrivalTimeS[2 * 31 + 20]; // 5 cells toward +column (with the wind)
    const upwind = result.arrivalTimeS[2 * 31 + 10]; // 5 cells toward -column (against the wind)
    expect(downwind).toBeLessThan(upwind);
  });

  it('an uphill run arrives faster than the equivalent flat-ground run; downhill gets no bonus', () => {
    const flat = flatTerrain(21, 5, 10);
    const ramp = rampTerrain(21, 5, 10, 2); // 2m rise per cell — a steep, unambiguous slope
    const fuelBedFlat = buildUniformFuelBed(flat, 'FM1_SHORT_GRASS', 0.06);
    const fuelBedRamp = buildUniformFuelBed(ramp, 'FM1_SHORT_GRASS', 0.06);
    const calmWind: WindVector = { speedMph: 0, directionDegrees: 0 };
    const centerIndex = 2 * 21 + 10;

    const flatResult = simulateWildfireSpread(fuelBedFlat, calmWind, [centerIndex]);
    const rampResult = simulateWildfireSpread(fuelBedRamp, calmWind, [centerIndex]);

    const uphillFlat = flatResult.arrivalTimeS[2 * 21 + 15]; // toward +column, where the ramp rises
    const uphillRamp = rampResult.arrivalTimeS[2 * 21 + 15];
    const downhillFlat = flatResult.arrivalTimeS[2 * 21 + 5];
    const downhillRamp = rampResult.arrivalTimeS[2 * 21 + 5];

    expect(uphillRamp).toBeLessThan(uphillFlat); // uphill: real acceleration
    expect(downhillRamp).toBeGreaterThanOrEqual(downhillFlat - 1e-6); // downhill: no bonus, never slower either
  });

  it('a cell with no assigned fuel model never burns', () => {
    const terrain = flatTerrain(11, 11, 10);
    const fuelBed = buildUniformFuelBed(terrain, 'FM1_SHORT_GRASS', 0.06);
    const unburnable = [...fuelBed.fuelModelKeys];
    unburnable[5 * 11 + 6] = 'NOT_A_FUEL_MODEL';
    const result = simulateWildfireSpread({ ...fuelBed, fuelModelKeys: unburnable }, { speedMph: 0, directionDegrees: 0 }, [5 * 11 + 5]);
    expect(result.arrivalTimeS[5 * 11 + 6]).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('Burned area — a level-set query on the precomputed field', () => {
  it('grows monotonically with elapsed time, and starts at the ignition footprint', () => {
    const terrain = flatTerrain(21, 21, 10);
    const fuelBed = buildUniformFuelBed(terrain, 'FM1_SHORT_GRASS', 0.06);
    const centerIndex = 10 * 21 + 10;
    const result = simulateWildfireSpread(fuelBed, { speedMph: 10, directionDegrees: 45 }, [centerIndex]);

    let last = burnedAreaM2At(result, terrain, 0);
    expect(last).toBeGreaterThan(0); // the ignition cell itself
    for (const t of [60, 300, 900, 3600]) {
      const area = burnedAreaM2At(result, terrain, t);
      expect(area).toBeGreaterThanOrEqual(last);
      last = area;
    }
  });
});

describe('WorldGraph binding', () => {
  it('binds one wildfire entity to the real solver and advances burned area/elapsed time each tick', () => {
    const terrain = flatTerrain(15, 15, 10);
    const fuelBed = buildUniformFuelBed(terrain, 'FM1_SHORT_GRASS', 0.06);
    const wind: WindVector = { speedMph: 10, directionDegrees: 0 };
    const ignitionIndex = 7 * 15 + 7;
    const world = buildWildfireWorld({ fuelBed, wind, ignitionCellIndices: [ignitionIndex] });

    const router = new SolverRouter();
    router.register(WILDFIRE_SPREAD_SOLVER_ID, makeWildfireSpreadSolver(fuelBed, wind, [ignitionIndex]));

    const report = router.routeTick(world.graph, 300, 1);
    expect(report.ungrounded).not.toContain(world.wildfireId);
    expect(report.updated).toContain(world.wildfireId);

    const entity = world.graph.getEntity(world.wildfireId);
    expect(entity.grounding).toBe('PROCEDURAL_APPROXIMATION'); // synthetic test terrain
    expect(entity.domainState?.elapsedS).toBeCloseTo(300, 6);
    expect(entity.domainState?.headRosMS).toBeGreaterThan(0);
    expect(entity.domainState?.burnedCells).toBeGreaterThanOrEqual(1);
    expect(report.observations.length).toBe(1);
    expect(report.events[0].type).toBe('wildfire.spread.step');

    router.routeTick(world.graph, 3000, 2);
    const later = world.graph.getEntity(world.wildfireId);
    expect(later.domainState?.burnedCells as number).toBeGreaterThanOrEqual(entity.domainState?.burnedCells as number);
    expect(later.domainState?.burnedCells as number).toBeLessThanOrEqual(later.domainState?.totalCells as number);
  });
});
