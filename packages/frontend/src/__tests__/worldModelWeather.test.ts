import { describe, expect, it } from 'vitest';
import { withCrossDomainCouplings } from '../core/worldModel/crossDomain/crossDomainCoupling';
import {
  addDroughtCatchment,
  buildWeatherToDroughtCoupling,
  DROUGHT_SOLVER_ID,
  makeDroughtWaterBalanceSolver,
} from '../core/worldModel/domains/drought';
import { buildSyntheticTerrain } from '../core/worldModel/domains/floodInundation';
import {
  addLandslide,
  DEFAULT_SOIL_PARAMS,
  LANDSLIDE_SOLVER_ID,
  makeLandslideSolver,
} from '../core/worldModel/domains/landslide';
import {
  addRainfallCatchment,
  buildWeatherToRainfallCoupling,
  makeRainfallRunoffSolver,
  RAINFALL_RUNOFF_SOLVER_ID,
} from '../core/worldModel/domains/rainfallRunoff';
import {
  addWeatherStation,
  celsiusToFahrenheit,
  DEFAULT_DIURNAL,
  dewpointC,
  diurnalWeatherAt,
  ENVIRONMENTAL_LAPSE_RATE_C_PER_M,
  makeWeatherSolver,
  relativeHumidityFromDewpointPct,
  saturationVapourPressureHPa,
  temperatureAtElevationC,
  vapourPressureHPa,
  weatherAt,
  WEATHER_SOLVER_ID,
  type WeatherObservation,
} from '../core/worldModel/domains/weather';
import {
  addWildfire,
  buildUniformFuelBed,
  buildWeatherToFuelMoistureCoupling,
  DEAD_FUEL_TIMELAG_HOURS,
  makeWildfireSpreadSolver,
  relaxDeadFuelMoisturePct,
  rothermelBaseRate,
  simardEquilibriumMoisturePct,
  FUEL_MODELS,
  WILDFIRE_SPREAD_SOLVER_ID,
} from '../core/worldModel/domains/wildfireSpread';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * PHASE 17 — the environmental forcing layer.
 *
 * These tests hold three things in place: the thermodynamics are real and
 * self-consistent; the DECLARED couplings move the domains they should, in
 * the direction the science says; and — just as important — weather reaches
 * NOTHING it has not been explicitly wired to.
 */

const SECONDS_PER_HOUR = 3600;

function weather(overrides: Partial<WeatherObservation> = {}): WeatherObservation {
  return {
    airTemperatureC: 20,
    relativeHumidityPct: 50,
    precipitationMmPerHour: 0,
    windSpeedMS: 2,
    windDirectionDegrees: 0,
    observationElevationM: 0,
    observed: false,
    provenance: 'test fixture',
    ...overrides,
  };
}

describe('Thermodynamics are real and mutually consistent', () => {
  it('saturation vapour pressure rises with temperature and matches the Magnus reference at 0 C', () => {
    // The Magnus/Bolton form is anchored at es(0 C) = 6.112 hPa by construction.
    expect(saturationVapourPressureHPa(0)).toBeCloseTo(6.112, 6);
    expect(saturationVapourPressureHPa(30)).toBeGreaterThan(saturationVapourPressureHPa(20));
    expect(saturationVapourPressureHPa(20)).toBeGreaterThan(saturationVapourPressureHPa(10));
  });

  it('saturated air has a dewpoint equal to its temperature — the definition, recovered exactly', () => {
    for (const t of [-5, 0, 12.5, 25, 40]) {
      expect(dewpointC(t, 100)).toBeCloseTo(t, 6);
    }
  });

  it('dewpoint and relative humidity are exact inverses, so the two can never disagree', () => {
    for (const t of [5, 18, 32]) {
      for (const rh of [15, 40, 65, 95]) {
        const td = dewpointC(t, rh);
        expect(relativeHumidityFromDewpointPct(t, td)).toBeCloseTo(rh, 6);
      }
    }
  });

  it('dewpoint never exceeds air temperature, and vapour pressure never exceeds saturation', () => {
    for (const t of [0, 10, 25, 38]) {
      for (const rh of [1, 25, 50, 99, 100]) {
        expect(dewpointC(t, rh)).toBeLessThanOrEqual(t + 1e-9);
        expect(vapourPressureHPa(t, rh)).toBeLessThanOrEqual(saturationVapourPressureHPa(t) + 1e-9);
      }
    }
  });

  it('BOUNDARY: humidity outside 0-100% is clamped rather than producing nonsense', () => {
    expect(vapourPressureHPa(20, 150)).toBeCloseTo(saturationVapourPressureHPa(20), 6);
    expect(vapourPressureHPa(20, -20)).toBe(0);
    expect(relativeHumidityFromDewpointPct(20, 80)).toBe(100); // dewpoint above air temp cannot mean >100%
  });

  it('UNITS: the Celsius/Fahrenheit conversion is exact at both reference points', () => {
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(celsiusToFahrenheit(100)).toBe(212);
  });
});

describe('Elevation: the one spatially-varying relationship the architecture supports', () => {
  it('applies the ICAO standard lapse rate — 6.5 C cooler per 1000 m of ascent', () => {
    expect(ENVIRONMENTAL_LAPSE_RATE_C_PER_M).toBeCloseTo(0.0065, 9);
    expect(temperatureAtElevationC(20, 0, 1000)).toBeCloseTo(13.5, 6);
    expect(temperatureAtElevationC(20, 0, 0)).toBeCloseTo(20, 6);
    expect(temperatureAtElevationC(20, 1000, 0)).toBeCloseTo(26.5, 6); // descending warms
  });
});

describe('Time-varying forcing', () => {
  it('a supplied sequence is played back by holding the most recent sample — never interpolated into a forecast', () => {
    const sequence = {
      samples: [
        { atSeconds: 0, weather: weather({ airTemperatureC: 10 }) },
        { atSeconds: 100, weather: weather({ airTemperatureC: 20 }) },
        { atSeconds: 200, weather: weather({ airTemperatureC: 30 }) },
      ],
    };
    expect(weatherAt(sequence, 0).airTemperatureC).toBe(10);
    expect(weatherAt(sequence, 99).airTemperatureC).toBe(10);
    expect(weatherAt(sequence, 100).airTemperatureC).toBe(20);
    expect(weatherAt(sequence, 150).airTemperatureC).toBe(20); // held, not interpolated
    expect(weatherAt(sequence, 10_000).airTemperatureC).toBe(30);
  });

  it('the diurnal cycle peaks at the stated hour and spans exactly the stated daily range', () => {
    const peak = diurnalWeatherAt(DEFAULT_DIURNAL, DEFAULT_DIURNAL.peakHour * SECONDS_PER_HOUR);
    const trough = diurnalWeatherAt(DEFAULT_DIURNAL, (DEFAULT_DIURNAL.peakHour + 12) * SECONDS_PER_HOUR);
    expect(peak.airTemperatureC).toBeCloseTo(DEFAULT_DIURNAL.dailyMaxTemperatureC, 6);
    expect(trough.airTemperatureC).toBeCloseTo(DEFAULT_DIURNAL.dailyMinTemperatureC, 6);
  });

  it('humidity rises at night WITHOUT being prescribed — it falls out of the constant dewpoint', () => {
    const afternoon = diurnalWeatherAt(DEFAULT_DIURNAL, DEFAULT_DIURNAL.peakHour * SECONDS_PER_HOUR);
    const night = diurnalWeatherAt(DEFAULT_DIURNAL, (DEFAULT_DIURNAL.peakHour + 12) * SECONDS_PER_HOUR);
    expect(night.relativeHumidityPct).toBeGreaterThan(afternoon.relativeHumidityPct);
    // ...and the dewpoint really did stay put: that is the whole mechanism.
    expect(dewpointC(afternoon.airTemperatureC, afternoon.relativeHumidityPct)).toBeCloseTo(DEFAULT_DIURNAL.dewpointC, 6);
    expect(dewpointC(night.airTemperatureC, night.relativeHumidityPct)).toBeCloseTo(DEFAULT_DIURNAL.dewpointC, 6);
  });

  it('the cycle repeats exactly every 24 hours — deterministic and reproducible', () => {
    for (const hour of [0, 6, 15, 23]) {
      const dayOne = diurnalWeatherAt(DEFAULT_DIURNAL, hour * SECONDS_PER_HOUR);
      const dayThree = diurnalWeatherAt(DEFAULT_DIURNAL, (hour + 48) * SECONDS_PER_HOUR);
      expect(dayThree.airTemperatureC).toBeCloseTo(dayOne.airTemperatureC, 9);
      expect(dayThree.relativeHumidityPct).toBeCloseTo(dayOne.relativeHumidityPct, 9);
    }
  });
});

describe('Simard (1968) equilibrium moisture content', () => {
  it('is nearly continuous across its own branch boundaries — the check that the coefficients are right', () => {
    // Simard's three branches are separately-fitted regressions, not a spline, so a small step at
    // each breakpoint is inherent to the PUBLISHED relationship. What a wrong transcription would
    // produce is a large step; agreement within about 1% moisture is the real signal here.
    for (const tF of [50, 70, 90]) {
      const tC = (tF - 32) * 5 / 9;
      expect(Math.abs(simardEquilibriumMoisturePct(tC, 9.999) - simardEquilibriumMoisturePct(tC, 10.001))).toBeLessThan(1);
      expect(Math.abs(simardEquilibriumMoisturePct(tC, 50) - simardEquilibriumMoisturePct(tC, 50.001))).toBeLessThan(1);
    }
  });

  it('HUMIDITY EFFECT: damper air means damper fuel, monotonically', () => {
    let previous = -1;
    for (const rh of [5, 20, 40, 60, 80, 95]) {
      const emc = simardEquilibriumMoisturePct(20, rh);
      expect(emc).toBeGreaterThan(previous);
      previous = emc;
    }
  });

  it('TEMPERATURE EFFECT: warmer air at the same humidity dries the fuel', () => {
    expect(simardEquilibriumMoisturePct(35, 40)).toBeLessThan(simardEquilibriumMoisturePct(5, 40));
    expect(simardEquilibriumMoisturePct(35, 70)).toBeLessThan(simardEquilibriumMoisturePct(5, 70));
  });

  it('produces physically plausible magnitudes, never negative', () => {
    expect(simardEquilibriumMoisturePct(25, 20)).toBeGreaterThan(1);
    expect(simardEquilibriumMoisturePct(25, 20)).toBeLessThan(10);
    expect(simardEquilibriumMoisturePct(25, 90)).toBeGreaterThan(10);
    expect(simardEquilibriumMoisturePct(50, 0)).toBeGreaterThanOrEqual(0);
  });
});

describe('Dead fuel timelag relaxation', () => {
  it('accomplishes 1-1/e of the adjustment in exactly one timelag — the definition of a timelag', () => {
    const relaxed = relaxDeadFuelMoisturePct(20, 10, 1, DEAD_FUEL_TIMELAG_HOURS.ONE_HOUR);
    expect(relaxed).toBeCloseTo(10 + 10 * Math.exp(-1), 9);
    expect((20 - relaxed) / (20 - 10)).toBeCloseTo(1 - Math.exp(-1), 9);
  });

  it('fine fuels track the air; heavy fuels lag it', () => {
    const fine = relaxDeadFuelMoisturePct(20, 5, 2, DEAD_FUEL_TIMELAG_HOURS.ONE_HOUR);
    const heavy = relaxDeadFuelMoisturePct(20, 5, 2, DEAD_FUEL_TIMELAG_HOURS.THOUSAND_HOUR);
    expect(fine).toBeLessThan(heavy); // the fine fuel has already dried much further
    expect(heavy).toBeCloseTo(20, 1);
  });

  it('BOUNDARY: zero or negative elapsed time changes nothing, and it never overshoots equilibrium', () => {
    expect(relaxDeadFuelMoisturePct(15, 5, 0, 1)).toBe(15);
    expect(relaxDeadFuelMoisturePct(15, 5, -1, 1)).toBe(15);
    expect(relaxDeadFuelMoisturePct(15, 5, 1000, 1)).toBeGreaterThanOrEqual(5);
    expect(relaxDeadFuelMoisturePct(5, 15, 1000, 1)).toBeLessThanOrEqual(15);
  });
});

describe('The weather solver publishes forcing, not forecasts', () => {
  function buildWeatherWorld(source: Parameters<typeof makeWeatherSolver>[0], initial?: WeatherObservation) {
    const graph = new WorldGraph();
    const stationId = addWeatherStation(graph, { initial });
    const router = new SolverRouter();
    router.register(WEATHER_SOLVER_ID, makeWeatherSolver(source));
    return { graph, router, stationId };
  }

  it('publishes the supplied state with its exact thermodynamic companions', () => {
    const { graph, router, stationId } = buildWeatherWorld({ kind: 'held' }, weather({ airTemperatureC: 25, relativeHumidityPct: 40 }));
    const report = router.routeTick(graph, SECONDS_PER_HOUR, 1);
    const state = graph.getEntity(stationId).domainState!;
    expect(state.airTemperatureC).toBe(25);
    expect(state.relativeHumidityPct).toBe(40);
    expect(state.dewpointC).toBeCloseTo(dewpointC(25, 40), 9);
    expect(report.events[0].type).toBe('environment.weather.step');
  });

  it('synthetic conditions are PROCEDURAL_APPROXIMATION; only real observations earn MODEL_ESTIMATE', () => {
    const synthetic = buildWeatherWorld({ kind: 'held' }, weather({ observed: false }));
    synthetic.router.routeTick(synthetic.graph, 60, 1);
    expect(synthetic.graph.getEntity(synthetic.stationId).grounding).toBe('PROCEDURAL_APPROXIMATION');

    const observed = buildWeatherWorld({ kind: 'held' }, weather({ observed: true, provenance: 'test: a real station record' }));
    observed.router.routeTick(observed.graph, 60, 1);
    expect(observed.graph.getEntity(observed.stationId).grounding).toBe('MODEL_ESTIMATE');
  });

  it('REPLAY: the same source and the same ticks give byte-identical state', () => {
    const a = buildWeatherWorld({ kind: 'diurnal', params: DEFAULT_DIURNAL });
    const b = buildWeatherWorld({ kind: 'diurnal', params: DEFAULT_DIURNAL });
    for (let i = 0; i < 30; i++) {
      a.router.routeTick(a.graph, SECONDS_PER_HOUR, i + 1);
      b.router.routeTick(b.graph, SECONDS_PER_HOUR, i + 1);
    }
    expect(a.graph.getEntity(a.stationId).domainState).toEqual(b.graph.getEntity(b.stationId).domainState);
  });
});

/** One world, one environmental state, domains attached by DECLARED relationships only. */
function buildCoupledWorld(options: { dryAir: boolean; wireWildfire?: boolean; wireDrought?: boolean; wireRainfall?: boolean; precipitationMmPerHour?: number }) {
  const graph = new WorldGraph();
  // 50 m cells over 60x60: a 3 km x 3 km landscape, large enough that a wind-driven grass fire
  // does not saturate it inside the test window, so the moisture effect on spread is observable.
  const terrain = buildSyntheticTerrain({ cols: 60, rows: 60, cellSizeM: 50 });
  const fuelBed = buildUniformFuelBed(terrain, 'FM1_SHORT_GRASS', 0.08);
  const wind = { speedMph: 6, directionDegrees: 90 };
  const ignition = [terrain.cols * 30 + 30];

  const stationId = addWeatherStation(graph, {
    initial: weather({
      airTemperatureC: options.dryAir ? 38 : 8,
      relativeHumidityPct: options.dryAir ? 8 : 95,
      precipitationMmPerHour: options.precipitationMmPerHour ?? 0,
    }),
  });
  const wildfireId = addWildfire(graph, fuelBed, wind, ignition);
  const droughtId = addDroughtCatchment(graph, { params: { precipitationMmPerDay: 0 } });
  const rainfallId = addRainfallCatchment(graph);
  const landslideId = addLandslide(graph, terrain, DEFAULT_SOIL_PARAMS);

  if (options.wireWildfire) graph.addRelationship(stationId, wildfireId, 'weathers');
  if (options.wireDrought) graph.addRelationship(stationId, droughtId, 'rainsOn');
  if (options.wireRainfall) graph.addRelationship(stationId, rainfallId, 'rainsOn');
  // NOTE: the landslide is deliberately never wired to weather. See the regression tests.

  const router = new SolverRouter();
  router.register(WEATHER_SOLVER_ID, makeWeatherSolver({ kind: 'held' }));
  router.register(WILDFIRE_SPREAD_SOLVER_ID, makeWildfireSpreadSolver(fuelBed, wind, ignition));
  router.register(DROUGHT_SOLVER_ID, makeDroughtWaterBalanceSolver());
  router.register(RAINFALL_RUNOFF_SOLVER_ID, makeRainfallRunoffSolver());
  router.register(LANDSLIDE_SOLVER_ID, makeLandslideSolver(terrain, DEFAULT_SOIL_PARAMS));

  const engine = new TemporalEngine(graph);
  const updater = withCrossDomainCouplings(
    (g, dt, tick) => {
      const report = router.routeTick(g, dt, tick);
      return { observations: report.observations, events: report.events };
    },
    [buildWeatherToFuelMoistureCoupling(), buildWeatherToDroughtCoupling(), buildWeatherToRainfallCoupling()],
  );
  return { engine, updater, stationId, wildfireId, droughtId, rainfallId, landslideId };
}

describe('THE UNLOCK: weather really changes wildfire behaviour, in the direction the science says', () => {
  it('hot dry air dries the fuel toward a low equilibrium; cold damp air wets it toward a high one', () => {
    const dry = buildCoupledWorld({ dryAir: true, wireWildfire: true });
    const damp = buildCoupledWorld({ dryAir: false, wireWildfire: true });
    for (let step = 0; step < 36; step++) {
      dry.engine.advance(SECONDS_PER_HOUR / 6, dry.updater);
      damp.engine.advance(SECONDS_PER_HOUR / 6, damp.updater);
    }
    const dryState = dry.engine.graph.getEntity(dry.wildfireId).domainState!;
    const dampState = damp.engine.graph.getEntity(damp.wildfireId).domainState!;

    expect(dryState.equilibriumMoisturePct as number).toBeLessThan(dampState.equilibriumMoisturePct as number);
    expect(dryState.fuelMoistureFraction as number).toBeLessThan(dampState.fuelMoistureFraction as number);
  });

  it('and the drier fuel really burns faster — a lower Rothermel moisture damping, not a relabelled number', () => {
    const dry = buildCoupledWorld({ dryAir: true, wireWildfire: true });
    const damp = buildCoupledWorld({ dryAir: false, wireWildfire: true });
    // 10-minute ticks: the resolution a 1-hour timelag fuel actually responds at.
    for (let step = 0; step < 6; step++) {
      dry.engine.advance(SECONDS_PER_HOUR / 6, dry.updater);
      damp.engine.advance(SECONDS_PER_HOUR / 6, damp.updater);
    }
    const dryMoisture = dry.engine.graph.getEntity(dry.wildfireId).domainState!.fuelMoistureFraction as number;
    const dampMoisture = damp.engine.graph.getEntity(damp.wildfireId).domainState!.fuelMoistureFraction as number;

    // The physics that carries the effect: Rothermel's own no-wind spread rate at each moisture.
    const dryRate = rothermelBaseRate(FUEL_MODELS.FM1_SHORT_GRASS, dryMoisture).r0FtPerMin;
    const dampRate = rothermelBaseRate(FUEL_MODELS.FM1_SHORT_GRASS, dampMoisture).r0FtPerMin;
    expect(dryRate).toBeGreaterThan(dampRate);

    // And it reaches the actual fire: more of the landscape has burned by the same time.
    const dryBurned = dry.engine.graph.getEntity(dry.wildfireId).domainState!.burnedCells as number;
    const dampBurned = damp.engine.graph.getEntity(damp.wildfireId).domainState!.burnedCells as number;
    expect(dryBurned).toBeGreaterThan(dampBurned);
  });

  it('damp enough air puts the fuel past its moisture of extinction and the fire stops spreading entirely', () => {
    const damp = buildCoupledWorld({ dryAir: false, wireWildfire: true });
    for (let h = 0; h < 24; h++) damp.engine.advance(SECONDS_PER_HOUR, damp.updater);
    const state = damp.engine.graph.getEntity(damp.wildfireId).domainState!;
    // FM1's moisture of extinction is 12%; 95% RH at 8 C equilibrates well above that.
    expect((state.fuelMoistureFraction as number) * 100).toBeGreaterThan(FUEL_MODELS.FM1_SHORT_GRASS.moistureOfExtinction * 100);
    expect(state.headRosMS).toBe(0);
  });
});

describe('Weather reaches drought and rainfall-runoff, through declared couplings only', () => {
  it('DROUGHT: precipitation converts exactly (mm/h x 24) into the daily water balance input', () => {
    const world = buildCoupledWorld({ dryAir: true, wireDrought: true, precipitationMmPerHour: 0.5 });
    world.engine.advance(SECONDS_PER_HOUR, world.updater);
    expect(world.engine.graph.getEntity(world.droughtId).domainState!.precipitationMmPerDay).toBeCloseTo(12, 9);
  });

  it('DROUGHT: rain really refills the soil, drought really empties it', () => {
    const wet = buildCoupledWorld({ dryAir: false, wireDrought: true, precipitationMmPerHour: 1 });
    const dryWorld = buildCoupledWorld({ dryAir: true, wireDrought: true, precipitationMmPerHour: 0 });
    const day = 24 * SECONDS_PER_HOUR;
    for (let d = 0; d < 40; d++) {
      wet.engine.advance(day, wet.updater);
      dryWorld.engine.advance(day, dryWorld.updater);
    }
    const wetSoil = wet.engine.graph.getEntity(wet.droughtId).domainState!.soilMoistureMm as number;
    const drySoil = dryWorld.engine.graph.getEntity(dryWorld.droughtId).domainState!.soilMoistureMm as number;
    expect(wetSoil).toBeGreaterThan(drySoil);
    expect(drySoil).toBe(0); // 40 days of evapotranspiration with no rain empties the profile
  });

  it('RAINFALL-RUNOFF: intensity passes through in the same units and drives real peak runoff', () => {
    const world = buildCoupledWorld({ dryAir: true, wireRainfall: true, precipitationMmPerHour: 40 });
    // Tick 1 publishes the weather and the coupling writes the intensity; the rational method
    // consumes it on tick 2. One real tick per cascade hop, exactly as cascadeRules.ts documents.
    world.engine.advance(SECONDS_PER_HOUR, world.updater);
    expect(world.engine.graph.getEntity(world.rainfallId).domainState!.rainfallIntensityMmPerHour).toBe(40);
    world.engine.advance(SECONDS_PER_HOUR, world.updater);
    const state = world.engine.graph.getEntity(world.rainfallId).domainState!;
    expect(state.rainfallIntensityMmPerHour).toBe(40);
    expect(state.peakRunoffM3S as number).toBeGreaterThan(0);
  });
});

describe('NO HIDDEN COUPLINGS: weather changes nothing it was not explicitly wired to', () => {
  it('an unwired wildfire keeps its stated fuel moisture no matter what the weather does', () => {
    const world = buildCoupledWorld({ dryAir: true }); // no relationships declared at all
    const before = world.engine.graph.getEntity(world.wildfireId).domainState!.fuelMoistureFraction;
    for (let h = 0; h < 24; h++) world.engine.advance(SECONDS_PER_HOUR, world.updater);
    const after = world.engine.graph.getEntity(world.wildfireId).domainState!;
    expect(after.fuelMoistureFraction).toBe(before);
    expect(after.equilibriumMoisturePct).toBe(0); // never even computed for this entity
  });

  it('an unwired drought catchment never sees the rain falling in the same world', () => {
    const world = buildCoupledWorld({ dryAir: false, precipitationMmPerHour: 5 }); // rain, but no `rainsOn` edge
    for (let h = 0; h < 24; h++) world.engine.advance(SECONDS_PER_HOUR, world.updater);
    expect(world.engine.graph.getEntity(world.droughtId).domainState!.precipitationMmPerDay).toBe(0);
  });

  it('the landslide domain is never touched by weather — no coupling is declared, and none is implied', () => {
    const wetWindy = buildCoupledWorld({ dryAir: false, wireWildfire: true, wireDrought: true, wireRainfall: true, precipitationMmPerHour: 10 });
    const hotDry = buildCoupledWorld({ dryAir: true, wireWildfire: true, wireDrought: true, wireRainfall: true, precipitationMmPerHour: 0 });
    for (let h = 0; h < 12; h++) {
      wetWindy.engine.advance(SECONDS_PER_HOUR, wetWindy.updater);
      hotDry.engine.advance(SECONDS_PER_HOUR, hotDry.updater);
    }
    // Rain does not raise pore pressure here, because no infiltration model connects them and
    // none was invented. Identical soil state under opposite weather is the proof.
    const wetState = wetWindy.engine.graph.getEntity(wetWindy.landslideId).domainState!;
    const dryState = hotDry.engine.graph.getEntity(hotDry.landslideId).domainState!;
    expect(wetState).toEqual(dryState);
  });

  it('wiring only the drought edge leaves the wildfire untouched — couplings are independent', () => {
    const world = buildCoupledWorld({ dryAir: true, wireDrought: true, precipitationMmPerHour: 0 });
    const before = world.engine.graph.getEntity(world.wildfireId).domainState!.fuelMoistureFraction;
    for (let h = 0; h < 12; h++) world.engine.advance(SECONDS_PER_HOUR, world.updater);
    expect(world.engine.graph.getEntity(world.wildfireId).domainState!.fuelMoistureFraction).toBe(before);
    expect(world.engine.graph.getEntity(world.droughtId).domainState!.precipitationMmPerDay).toBe(0);
  });
});

describe('The coupled world replays deterministically', () => {
  it('two identically-built coupled worlds agree on every domain after the same ticks', () => {
    const a = buildCoupledWorld({ dryAir: true, wireWildfire: true, wireDrought: true, wireRainfall: true, precipitationMmPerHour: 2 });
    const b = buildCoupledWorld({ dryAir: true, wireWildfire: true, wireDrought: true, wireRainfall: true, precipitationMmPerHour: 2 });
    for (let h = 0; h < 20; h++) {
      a.engine.advance(SECONDS_PER_HOUR, a.updater);
      b.engine.advance(SECONDS_PER_HOUR, b.updater);
    }
    for (const key of ['wildfireId', 'droughtId', 'rainfallId', 'stationId'] as const) {
      expect(a.engine.graph.getEntity(a[key]).domainState).toEqual(b.engine.graph.getEntity(b[key]).domainState);
    }
  });
});
