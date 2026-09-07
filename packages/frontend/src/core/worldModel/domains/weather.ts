import { deterministicEventId, GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from '../../events/genesisEvent';
import type { Observation } from '../../world/scientificWorldState';
import { entityId, type EntityId, type WorldModelEntity } from '../ecs/types';
import { WorldGraph } from '../ecs/worldGraph';
import type { DomainSolver, SolverResult } from '../solvers/solverRouter';

/**
 * WEATHER / ATMOSPHERIC ENVIRONMENT — ONE environmental state for the whole
 * world, consumed by domains through the existing cross-domain coupling
 * mechanism.
 *
 * ## THIS IS AN ENVIRONMENTAL FORCING LAYER, NOT A WEATHER MODEL
 *
 * Stated first because it is the most important thing about this file:
 * **Genesis does not predict weather and this module does not pretend to.**
 * There is no numerical weather prediction here — no primitive equations, no
 * advection, no radiation scheme, no convection, no data assimilation,
 * nothing that forecasts anything. What this is: a place for weather to be
 * SUPPLIED to the world (from a scenario, from a human intervention, or —
 * unchanged — from a real observation record), plus the exact thermodynamic
 * relationships needed to convert between the variables that supply
 * describes. Every number that leaves this module is either something a
 * caller put in, or an exact thermodynamic consequence of what a caller put
 * in. Nothing here is forecast.
 *
 * That boundary is the same one `floodInundation.ts` draws for terrain: a
 * `TerrainHeightfield` is a place for real survey elevations to be dropped
 * in, not a landscape-evolution model. `WeatherObservation` is the same
 * shape of contract for the atmosphere.
 *
 * ## What is real here
 *
 * **1. Saturation vapour pressure and dewpoint** — the August-Roche-Magnus
 * form with Bolton's (1980) coefficients, `es(T) = 6.112·exp(17.67·T/(T+243.5))`
 * hPa for T in °C: one of the most reproduced relationships in meteorology.
 * Relative humidity, actual vapour pressure and dewpoint are then exact
 * algebra on it, so `dewpointC` and `relativeHumidityPct` are two views of
 * ONE physical state and can never disagree.
 *
 * **2. The environmental lapse rate.** Air temperature falls with elevation
 * at the ICAO standard atmosphere's 6.5 °C/km. Because Genesis already has
 * REAL terrain elevations, this makes the environmental state genuinely
 * terrain-aware — the one spatially-varying weather relationship the
 * existing architecture can support honestly, rather than an invented
 * mesoscale field.
 *
 * **3. A diurnal cycle that is a real approximation, not a fitted curve.**
 * `diurnalWeatherAt` swings temperature sinusoidally between a stated daily
 * minimum and maximum, and holds DEWPOINT approximately constant through the
 * day — the standard clear-sky approximation, and the reason relative
 * humidity rises at night without anything computing it directly: RH is
 * derived from the same Magnus relationship as the temperature falls toward
 * the (unchanged) dewpoint. The physics does the work, not a humidity curve.
 *
 * ## What is NOT modelled, and must never be claimed
 *
 * - **No forecasting of any kind.** See above. A `WeatherSequence` is data a
 *   caller supplied; stepping through it is playback, not prediction.
 * - **No atmospheric dynamics**: no wind field, no pressure field, no fronts,
 *   no convection, no cloud or radiation physics. Wind is a stated vector.
 * - **Spatially uniform except for the lapse rate.** One observation applies
 *   to the whole world, adjusted for elevation where a consumer asks. There
 *   is no horizontal interpolation, no terrain channelling of wind, no
 *   valley cold-air pooling — all real effects this does not have.
 * - **No precipitation physics.** Precipitation is a supplied rate, not
 *   something condensed out of the modelled atmosphere.
 * - **Not calibrated to any place.** The defaults are illustrative values,
 *   like every other stated input in this codebase.
 */
export const WEATHER_SOLVER_ID = 'environment-weather-forcing-layer';
export const WEATHER_DOMAIN_ID = 'environment-atmosphere';
export const WEATHER_STEP_EVENT_TYPE = 'environment.weather.step';

// ---------------------------------------------------------------------------
// Exact unit conversions — named and inspectable (SOLVER_DATA_CONTRACT Rule 2).
// ---------------------------------------------------------------------------
export const MPH_PER_M_S = 1 / 0.44704; // 1 mph = 0.44704 m/s, exactly
export const HOURS_PER_DAY = 24;
const SECONDS_PER_HOUR = 3600;

export function celsiusToFahrenheit(celsius: number): number {
  return celsius * 9 / 5 + 32;
}

// ---------------------------------------------------------------------------
// 1. THERMODYNAMICS — August-Roche-Magnus, Bolton (1980) coefficients.
// ---------------------------------------------------------------------------

const MAGNUS_A = 17.67;
const MAGNUS_B = 243.5; // °C
const MAGNUS_ES0_HPA = 6.112;

/** Saturation vapour pressure over liquid water, hPa, for air temperature in °C. */
export function saturationVapourPressureHPa(airTemperatureC: number): number {
  return MAGNUS_ES0_HPA * Math.exp((MAGNUS_A * airTemperatureC) / (airTemperatureC + MAGNUS_B));
}

/** Actual vapour pressure, hPa, from temperature and relative humidity. */
export function vapourPressureHPa(airTemperatureC: number, relativeHumidityPct: number): number {
  const rh = Math.max(0, Math.min(100, relativeHumidityPct));
  return (rh / 100) * saturationVapourPressureHPa(airTemperatureC);
}

/**
 * Dewpoint, °C — the exact algebraic inverse of the Magnus relationship
 * above, so `dewpointC` and `relativeHumidityPct` are always two views of the
 * same physical state rather than two independently-tracked numbers.
 */
export function dewpointC(airTemperatureC: number, relativeHumidityPct: number): number {
  const e = vapourPressureHPa(airTemperatureC, relativeHumidityPct);
  if (e <= 0) return Number.NEGATIVE_INFINITY;
  const gamma = Math.log(e / MAGNUS_ES0_HPA);
  return (MAGNUS_B * gamma) / (MAGNUS_A - gamma);
}

/** Relative humidity, %, implied by a temperature and a dewpoint — the inverse of `dewpointC`, clamped to a physical [0,100]. */
export function relativeHumidityFromDewpointPct(airTemperatureC: number, dewpointCelsius: number): number {
  const es = saturationVapourPressureHPa(airTemperatureC);
  if (es <= 0) return 0;
  const e = saturationVapourPressureHPa(dewpointCelsius);
  return Math.max(0, Math.min(100, (e / es) * 100));
}

/** ICAO standard atmosphere environmental lapse rate: air cools 6.5 °C for every 1000 m of elevation gain. */
export const ENVIRONMENTAL_LAPSE_RATE_C_PER_M = 0.0065;

/** Air temperature at `targetElevationM`, given an observation taken at `observationElevationM` — the standard lapse rate, the one spatially-varying relationship this layer can support honestly. */
export function temperatureAtElevationC(observedTemperatureC: number, observationElevationM: number, targetElevationM: number): number {
  return observedTemperatureC - ENVIRONMENTAL_LAPSE_RATE_C_PER_M * (targetElevationM - observationElevationM);
}

// ---------------------------------------------------------------------------
// 2. THE ENVIRONMENTAL STATE ITSELF.
// ---------------------------------------------------------------------------

/**
 * One atmospheric observation. Deliberately a plain data structure with no
 * solver attached, so a REAL weather station record or reanalysis extract can
 * be dropped in unchanged — the same contract shape as
 * `floodInundation.ts`'s `TerrainHeightfield`.
 *
 * `observed` is the honesty flag: `true` only when these values came from
 * real measurements. Nothing in this module ever sets it to `true` on its own.
 */
export interface WeatherObservation {
  readonly airTemperatureC: number;
  readonly relativeHumidityPct: number;
  readonly precipitationMmPerHour: number;
  readonly windSpeedMS: number;
  /** Direction the wind blows TOWARD, degrees, in the world grid's own row/column frame (see `wildfireSpread.ts`'s `WindVector` for the identical convention). */
  readonly windDirectionDegrees: number;
  /** Elevation this observation applies at, m — the lapse-rate reference. */
  readonly observationElevationM: number;
  readonly observed: boolean;
  /** Where these values came from: a citation when observed, a description of the construction when not. */
  readonly provenance: string;
}

export const DEFAULT_WEATHER: WeatherObservation = Object.freeze({
  airTemperatureC: 20,
  relativeHumidityPct: 50,
  precipitationMmPerHour: 0,
  windSpeedMS: 2,
  windDirectionDegrees: 0,
  observationElevationM: 0,
  observed: false,
  provenance: 'illustrative default conditions — NOT a measurement, NOT a forecast',
});

/**
 * A time series of supplied observations. This is PLAYBACK of data a caller
 * provided (a scenario, or a real record), never a prediction: `weatherAt`
 * holds the most recent observation at or before the requested time, the
 * standard way an observation record is interpreted between samples.
 */
export interface WeatherSequence {
  readonly samples: readonly { readonly atSeconds: number; readonly weather: WeatherObservation }[];
}

export function weatherAt(sequence: WeatherSequence, elapsedS: number): WeatherObservation {
  let current = sequence.samples.length > 0 ? sequence.samples[0].weather : DEFAULT_WEATHER;
  for (const sample of sequence.samples) {
    if (sample.atSeconds <= elapsedS) current = sample.weather;
    else break;
  }
  return current;
}

export interface DiurnalWeatherParams {
  readonly dailyMinTemperatureC: number;
  readonly dailyMaxTemperatureC: number;
  /** Held approximately constant through the day — the standard clear-sky approximation that MAKES relative humidity rise at night, rather than prescribing humidity directly. */
  readonly dewpointC: number;
  readonly precipitationMmPerHour: number;
  readonly windSpeedMS: number;
  readonly windDirectionDegrees: number;
  readonly observationElevationM: number;
  /** Hour of day at which temperature peaks — mid-afternoon by convention, not a fitted value. */
  readonly peakHour: number;
}

export const DEFAULT_DIURNAL: DiurnalWeatherParams = Object.freeze({
  dailyMinTemperatureC: 12,
  dailyMaxTemperatureC: 30,
  dewpointC: 8,
  precipitationMmPerHour: 0,
  windSpeedMS: 3,
  windDirectionDegrees: 90,
  observationElevationM: 0,
  peakHour: 15,
});

/**
 * A diurnal cycle: temperature swings sinusoidally between the stated daily
 * minimum and maximum, peaking at `peakHour`. Relative humidity is NOT
 * prescribed — it falls out of the Magnus relationship between the current
 * temperature and the (held-constant) dewpoint, which is why this produces
 * the real, observed behaviour of humid nights and dry afternoons without
 * any humidity curve being fitted.
 *
 * Still forcing, not prediction: the daily range and dewpoint are supplied.
 */
export function diurnalWeatherAt(params: DiurnalWeatherParams, elapsedS: number): WeatherObservation {
  const hourOfDay = ((elapsedS / SECONDS_PER_HOUR) % HOURS_PER_DAY + HOURS_PER_DAY) % HOURS_PER_DAY;
  const mean = (params.dailyMaxTemperatureC + params.dailyMinTemperatureC) / 2;
  const amplitude = (params.dailyMaxTemperatureC - params.dailyMinTemperatureC) / 2;
  const airTemperatureC = mean + amplitude * Math.cos((2 * Math.PI * (hourOfDay - params.peakHour)) / HOURS_PER_DAY);
  return {
    airTemperatureC,
    relativeHumidityPct: relativeHumidityFromDewpointPct(airTemperatureC, params.dewpointC),
    precipitationMmPerHour: params.precipitationMmPerHour,
    windSpeedMS: params.windSpeedMS,
    windDirectionDegrees: params.windDirectionDegrees,
    observationElevationM: params.observationElevationM,
    observed: false,
    provenance: `synthetic diurnal cycle (${params.dailyMinTemperatureC}-${params.dailyMaxTemperatureC}°C, dewpoint ${params.dewpointC}°C) — NOT a measurement, NOT a forecast`,
  };
}

// ---------------------------------------------------------------------------
// ECS BINDING
// ---------------------------------------------------------------------------

export interface WeatherDomainState extends Record<string, number> {
  elapsedS: number;
  airTemperatureC: number;
  relativeHumidityPct: number;
  dewpointC: number;
  vapourPressureHPa: number;
  precipitationMmPerHour: number;
  windSpeedMS: number;
  windDirectionDegrees: number;
  observationElevationM: number;
  weatherObserved: number;
}

function toDomainState(weather: WeatherObservation, elapsedS: number): WeatherDomainState {
  return {
    elapsedS,
    airTemperatureC: weather.airTemperatureC,
    relativeHumidityPct: weather.relativeHumidityPct,
    dewpointC: dewpointC(weather.airTemperatureC, weather.relativeHumidityPct),
    vapourPressureHPa: vapourPressureHPa(weather.airTemperatureC, weather.relativeHumidityPct),
    precipitationMmPerHour: weather.precipitationMmPerHour,
    windSpeedMS: weather.windSpeedMS,
    windDirectionDegrees: weather.windDirectionDegrees,
    observationElevationM: weather.observationElevationM,
    weatherObserved: weather.observed ? 1 : 0,
  };
}

/** How a weather entity gets its values each tick: a supplied series, a diurnal cycle, or whatever a caller/intervention wrote onto the entity itself. */
export type WeatherSource =
  | { readonly kind: 'sequence'; readonly sequence: WeatherSequence }
  | { readonly kind: 'diurnal'; readonly params: DiurnalWeatherParams }
  | { readonly kind: 'held' };


/**
 * The weather solver. `dt` is in seconds. It computes NOTHING about the
 * atmosphere's future: it reads the supplied source at the current elapsed
 * time and republishes it with its exact thermodynamic companions
 * (dewpoint, vapour pressure). Its grounding is `MODEL_ESTIMATE` on real
 * observed input and `PROCEDURAL_APPROXIMATION` on synthetic input — the
 * same rule `floodInundation.ts` applies to surveyed vs. synthetic terrain,
 * enforced in code rather than left to a caller.
 */
export function makeWeatherSolver(source: WeatherSource = { kind: 'held' }): DomainSolver {
  return (entity, ctx): SolverResult => {
    const previous = entity.domainState as Partial<WeatherDomainState> | undefined;
    const elapsedS = (previous?.elapsedS ?? 0) + ctx.dt;

    let weather: WeatherObservation;
    if (source.kind === 'sequence') {
      weather = weatherAt(source.sequence, elapsedS);
    } else if (source.kind === 'diurnal') {
      weather = diurnalWeatherAt(source.params, elapsedS);
    } else {
      // 'held': whatever the entity currently carries, so a human intervention or a scenario
      // patch stays in force until something changes it. Still supplied data, never invented.
      weather = {
        airTemperatureC: previous?.airTemperatureC ?? DEFAULT_WEATHER.airTemperatureC,
        relativeHumidityPct: previous?.relativeHumidityPct ?? DEFAULT_WEATHER.relativeHumidityPct,
        precipitationMmPerHour: previous?.precipitationMmPerHour ?? DEFAULT_WEATHER.precipitationMmPerHour,
        windSpeedMS: previous?.windSpeedMS ?? DEFAULT_WEATHER.windSpeedMS,
        windDirectionDegrees: previous?.windDirectionDegrees ?? DEFAULT_WEATHER.windDirectionDegrees,
        observationElevationM: previous?.observationElevationM ?? DEFAULT_WEATHER.observationElevationM,
        observed: (previous?.weatherObserved ?? 0) === 1,
        provenance: 'held',
      };
    }

    const domainState = toDomainState(weather, elapsedS);

    const observation: Observation = {
      observationId: `weather-obs:${entity.id}:${ctx.tick}`,
      tick: ctx.tick,
      statement: `${entity.label}: T=${weather.airTemperatureC.toFixed(1)}°C, RH=${weather.relativeHumidityPct.toFixed(0)}%, dewpoint=${domainState.dewpointC.toFixed(1)}°C, precip=${weather.precipitationMmPerHour.toFixed(2)}mm/h, wind=${weather.windSpeedMS.toFixed(1)}m/s@${weather.windDirectionDegrees.toFixed(0)}°`,
      measurements: [
        { key: 'airTemperatureC', value: weather.airTemperatureC, unit: 'C', tick: ctx.tick, entity: entity.ref, provenance: ['domains/weather.ts#supplied-forcing'] },
        { key: 'relativeHumidityPct', value: weather.relativeHumidityPct, unit: '%', tick: ctx.tick, entity: entity.ref, provenance: ['domains/weather.ts#supplied-forcing'] },
        { key: 'dewpointC', value: domainState.dewpointC, unit: 'C', tick: ctx.tick, entity: entity.ref, provenance: ['domains/weather.ts#dewpointC', 'august-roche-magnus-bolton-1980'] },
        { key: 'precipitationMmPerHour', value: weather.precipitationMmPerHour, unit: 'mm/h', tick: ctx.tick, entity: entity.ref, provenance: ['domains/weather.ts#supplied-forcing'] },
        { key: 'windSpeedMS', value: weather.windSpeedMS, unit: 'm/s', tick: ctx.tick, entity: entity.ref, provenance: ['domains/weather.ts#supplied-forcing'] },
      ],
      provenance: ['domains/weather.ts', 'august-roche-magnus-bolton-1980', weather.observed ? 'weather:observed' : 'weather:synthetic'],
    };

    const eventParameters = { ...domainState };
    const event: GenesisEvent = {
      contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
      id: deterministicEventId('weather-evt', entity.id, ctx.tick, eventParameters),
      type: WEATHER_STEP_EVENT_TYPE,
      timestamp: ctx.tick,
      source: entity.ref,
      affectedEntities: [entity.ref],
      cause: 'environmental-forcing-step',
      parameters: eventParameters,
      provenance: {
        origin: 'model',
        modelId: WEATHER_SOLVER_ID,
        notes: 'Environmental FORCING layer, not a weather model: supplied observations republished with their exact thermodynamic companions (August-Roche-Magnus, Bolton 1980). No prediction, no atmospheric dynamics, no precipitation physics.',
      },
    };

    return {
      patch: { domainState, statusLabel: `${weather.airTemperatureC.toFixed(0)}°C / ${weather.relativeHumidityPct.toFixed(0)}% RH` },
      // Real thermodynamics over supplied values: as grounded as the values themselves are.
      grounding: weather.observed ? 'MODEL_ESTIMATE' : 'PROCEDURAL_APPROXIMATION',
      observation,
      event,
    };
  };
}

export interface AddWeatherStationOptions {
  stationId?: string;
  label?: string;
  parentEntityId?: EntityId;
  initial?: WeatherObservation;
}

/** Adds THE environmental state entity for a world. One world, one environmental state — domains consume it through declared couplings, never by embedding their own weather. */
export function addWeatherStation(graph: WorldGraph, options: AddWeatherStationOptions = {}): EntityId {
  const ref = { kind: 'weather', id: options.stationId ?? 'weather-1' };
  const initial = options.initial ?? DEFAULT_WEATHER;
  const entity: WorldModelEntity = {
    id: entityId(ref),
    ref,
    label: options.label ?? 'Environmental Conditions',
    scale: { level: 'MACRO_CITY', parentEntityId: options.parentEntityId },
    spatial: { position: { x: 0, y: 0, z: initial.observationElevationM } },
    domainState: toDomainState(initial, 0),
    domainBinding: { solverId: WEATHER_SOLVER_ID, domainId: WEATHER_DOMAIN_ID },
    statusLabel: `${initial.airTemperatureC.toFixed(0)}°C / ${initial.relativeHumidityPct.toFixed(0)}% RH`,
    grounding: initial.observed ? 'MODEL_ESTIMATE' : 'PROCEDURAL_APPROXIMATION',
    updatedAtTick: 0,
  };
  graph.addEntity(entity);
  return entity.id;
}
