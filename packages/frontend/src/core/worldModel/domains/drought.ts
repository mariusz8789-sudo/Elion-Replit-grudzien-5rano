import { GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from '../../events/genesisEvent';
import type { Observation } from '../../world/scientificWorldState';
import { entityId, type EntityId, type WorldModelEntity } from '../ecs/types';
import { WorldGraph } from '../ecs/worldGraph';
import type { DomainSolver, SolverResult } from '../solvers/solverRouter';

/**
 * DROUGHT — a real water-balance solver, extending the same hydrology
 * `rainfallRunoff.ts` already models rather than starting a new domain.
 *
 * Closes the gap `capability/solverCapability.ts` named for DROUGHT: "a
 * water balance and drought index process model — Genesis has none."
 *
 * ## Why this is NOT the same model as `rainfallRunoff.ts`
 *
 * `rainfallRunoff.ts`'s Rational Method answers "how much peak stormwater
 * flow does a short, intense design storm produce" — a design-storm peak
 * intensity (mm/h) over minutes. Drought is the opposite regime: a
 * longer-duration precipitation DEFICIT (mm/day, accumulated over days to
 * months) failing to meet evaporative demand. Feeding one quantity into the
 * other's formula would silently misuse both, so this module takes its own
 * `precipitationMmPerDay` input — the same physical quantity (precipitation
 * depth), the real timescale drought analysis actually uses.
 *
 * ## What is real here
 *
 * **The Thornthwaite-Mather (1955) one-layer soil-moisture water balance** —
 * a foundational, still widely-taught and used method (FAO, USDA, and state
 * climate-office water-balance tools all use this or a close variant):
 * `stepWaterBalance` is exact bucket accounting given its inputs — actual
 * evapotranspiration is the potential rate, but capped by what water is
 * actually available (precipitation first, then stored soil moisture);
 * whatever remains once ET is satisfied fills the soil profile up to its
 * field capacity; anything beyond field capacity is runoff. This is real
 * conservation of water (P = AET + ΔS + Runoff), exactly as flood's volume
 * balance conserves water at a basin.
 *
 * From that balance: `soilMoistureFractionOfCapacity` (a direct, real
 * indicator of moisture stress) and `cumulativeMoistureDeficitMm` (the
 * running shortfall between what plants/soil demanded and what evaporated,
 * resetting when the profile fully recharges) — a genuine drought-relevant
 * output, not an assumption.
 *
 * ## What is NOT modelled, and is not pretended to be
 *
 * - **This is not the Standardized Precipitation Index, SPEI, or Palmer
 *   Drought Severity Index.** Those are calibrated against decades of real
 *   climatological records (a gamma-distribution fit to 30+ years of
 *   precipitation, in SPI's case) that Genesis does not have for any place.
 *   `droughtSeverityCode` below is an absolute soil-moisture-fraction
 *   threshold, not a percentile against real climate history — the same
 *   honesty distinction `floodInundation.ts` already draws for its
 *   civil-protection depth bands (conventional bands, not derived, and
 *   never confused with a calibrated index).
 * - **Potential evapotranspiration (PET) is a stated, literature-typical
 *   rate (FAO Irrigation and Drainage Paper 56, Allen et al. 1998), not
 *   derived from real temperature, radiation, humidity or wind data** — the
 *   same kind of typical/tabulated input `rainfallRunoff.ts`'s own
 *   `runoffCoefficient` already is, disclosed the same way.
 * - **Field capacity is a stated typical soil value** (USDA/NRCS available
 *   water capacity tables), not a surveyed soil profile.
 * - **One lumped catchment, no spatial variation, no groundwater, no
 *   vegetation/crop-specific water use** — the same single-catchment scope
 *   `rainfallRunoff.ts` and `floodInundation.ts` already have.
 * - **No calibration** against any specific real location's water balance.
 */
export const DROUGHT_SOLVER_ID = 'environment-drought-water-balance-thornthwaite-mather';
export const DROUGHT_DOMAIN_ID = 'environment-hydrology';

/**
 * Rule 3: the discrete state is a NUMBER. Thresholds are absolute
 * soil-moisture-fraction bands — illustrative, conventional cut-offs, never
 * the calibrated USDM/SPI percentile categories they visually resemble.
 */
export const DROUGHT_SEVERITY_CODE = { NORMAL: 0, ABNORMALLY_DRY: 1, MODERATE_DROUGHT: 2, SEVERE_DROUGHT: 3, EXTREME_DROUGHT: 4 } as const;
export type DroughtSeverityCode = (typeof DROUGHT_SEVERITY_CODE)[keyof typeof DROUGHT_SEVERITY_CODE];

export const DROUGHT_SEVERITY_STATES = ['DROUGHT_NORMAL', 'DROUGHT_ABNORMALLY_DRY', 'DROUGHT_MODERATE', 'DROUGHT_SEVERE', 'DROUGHT_EXTREME'] as const;
export type DroughtSeverityState = (typeof DROUGHT_SEVERITY_STATES)[number];

const ABNORMALLY_DRY_FRACTION = 0.6;
const MODERATE_DROUGHT_FRACTION = 0.4;
const SEVERE_DROUGHT_FRACTION = 0.2;
const EXTREME_DROUGHT_FRACTION = 0.05;

export function droughtSeverityCode(soilMoistureFractionOfCapacity: number): DroughtSeverityCode {
  if (!Number.isFinite(soilMoistureFractionOfCapacity) || soilMoistureFractionOfCapacity >= ABNORMALLY_DRY_FRACTION) return DROUGHT_SEVERITY_CODE.NORMAL;
  if (soilMoistureFractionOfCapacity >= MODERATE_DROUGHT_FRACTION) return DROUGHT_SEVERITY_CODE.ABNORMALLY_DRY;
  if (soilMoistureFractionOfCapacity >= SEVERE_DROUGHT_FRACTION) return DROUGHT_SEVERITY_CODE.MODERATE_DROUGHT;
  if (soilMoistureFractionOfCapacity >= EXTREME_DROUGHT_FRACTION) return DROUGHT_SEVERITY_CODE.SEVERE_DROUGHT;
  return DROUGHT_SEVERITY_CODE.EXTREME_DROUGHT;
}

/** Total function: an out-of-range code still lands inside the allowlist. */
export function droughtSeverityLabel(code: number): DroughtSeverityState {
  switch (code) {
    case DROUGHT_SEVERITY_CODE.ABNORMALLY_DRY: return 'DROUGHT_ABNORMALLY_DRY';
    case DROUGHT_SEVERITY_CODE.MODERATE_DROUGHT: return 'DROUGHT_MODERATE';
    case DROUGHT_SEVERITY_CODE.SEVERE_DROUGHT: return 'DROUGHT_SEVERE';
    case DROUGHT_SEVERITY_CODE.EXTREME_DROUGHT: return 'DROUGHT_EXTREME';
    default: return 'DROUGHT_NORMAL';
  }
}

// ---------------------------------------------------------------------------
// KEETCH-BYRAM DROUGHT INDEX EQUIVALENT — an exact unit correspondence, not a
// fitted coefficient.
// ---------------------------------------------------------------------------

/**
 * The Keetch-Byram Drought Index (Keetch & Byram 1968) is DEFINED as
 * cumulative soil/duff moisture deficiency expressed in hundredths of an
 * inch of water, on a 0-800 scale whose upper bound is 8 inches of
 * deficiency (the assumed maximum the represented layer can lose).
 *
 * That is the same physical quantity `stepWaterBalance` already tracks in
 * its soil store: how far the layer sits BELOW saturation, i.e.
 * `fieldCapacityMm - soilMoistureMm`. Converting that storage shortfall in
 * mm into KBDI units is an EXACT unit conversion plus KBDI's own stated
 * cap, with no fitted or invented coefficient anywhere in it.
 *
 * Note which deficit this is: KBDI is a STORAGE shortfall (how much water
 * the layer is short of full), NOT this module's
 * `cumulativeMoistureDeficitMm`, which is accumulated UNMET EVAPORATIVE
 * DEMAND (how much evapotranspiration the soil could not supply). Both are
 * real and both are called "deficit" in the literature; they are different
 * quantities, and only the first one is what KBDI is defined as. A soil
 * whose capacity is under 203.2 mm simply cannot reach KBDI 800, and this
 * reports that honestly rather than rescaling to fill the range.
 *
 * The honest caveat, which travels with every use: Keetch & Byram compute
 * their deficit with their OWN drying equation (a temperature and
 * annual-rainfall based formulation), while this module computes it with
 * Thornthwaite-Mather. Both are real water balances measuring the same
 * quantity; this is therefore a KBDI-EQUIVALENT deficit, not KBDI computed
 * by Keetch & Byram's equation, and it must be reported as such.
 */
export const KBDI_MAX_INDEX = 800;
export const KBDI_SATURATION_DEFICIT_MM = 8 * 25.4; // 8 inches, KBDI's own assumed maximum deficiency

export function kbdiEquivalentFromDeficitMm(storageDeficitMm: number): number {
  if (!Number.isFinite(storageDeficitMm) || storageDeficitMm <= 0) return 0;
  const hundredthsOfAnInch = (storageDeficitMm * 100) / 25.4;
  return Math.min(KBDI_MAX_INDEX, hundredthsOfAnInch);
}

/** The soil layer's shortfall below saturation, mm — the quantity KBDI is defined on. */
export function soilStorageDeficitMm(soilMoistureMm: number, fieldCapacityMm: number): number {
  return Math.max(0, fieldCapacityMm - soilMoistureMm);
}

/** Rule 3: a NUMBER. The 200/400/600 cut-offs are the conventional operational KBDI bands, not derived physics — same disclosure style as `floodInundation.ts`'s depth bands. */
export const KBDI_CLASS_CODE = { LOW: 0, MODERATE: 1, HIGH: 2, EXTREME: 3 } as const;

export function kbdiClassCode(kbdi: number): number {
  if (!Number.isFinite(kbdi) || kbdi < 200) return KBDI_CLASS_CODE.LOW;
  if (kbdi < 400) return KBDI_CLASS_CODE.MODERATE;
  if (kbdi < 600) return KBDI_CLASS_CODE.HIGH;
  return KBDI_CLASS_CODE.EXTREME;
}

export interface WaterBalanceParams {
  /** Precipitation, mm/day — a daily accumulation, NOT `rainfallRunoff.ts`'s short-duration design-storm intensity. */
  precipitationMmPerDay: number;
  /** Potential evapotranspiration, mm/day — a stated typical rate (FAO-56), not derived from weather data Genesis does not model. */
  potentialEvapotranspirationMmPerDay: number;
  /** Soil available water capacity, mm — a stated typical value (USDA/NRCS tables for a ~1 m root zone in loam). */
  fieldCapacityMm: number;
  /** Current soil moisture storage, mm — the state this domain actually integrates, bounded [0, fieldCapacityMm]. */
  soilMoistureMm: number;
}

/**
 * Representative defaults: a temperate climate's typical reference ET
 * (FAO-56 Table 1: temperate ≈3-5 mm/day) and a loam soil's typical 1 m
 * root-zone available water capacity (≈150 mm, USDA/NRCS). Not a survey of
 * any real place — a plausible baseline, exactly like `rainfallRunoff.ts`'s
 * `RAINFALL_CATCHMENT_DEFAULTS`.
 */
export const WATER_BALANCE_DEFAULTS: WaterBalanceParams = {
  precipitationMmPerDay: 0,
  potentialEvapotranspirationMmPerDay: 4,
  fieldCapacityMm: 150,
  soilMoistureMm: 150, // starts fully recharged: "normal", absent evidence of an ongoing drought
};

export interface WaterBalanceStepResult {
  /** Soil moisture storage after this step, mm — clamped to [0, fieldCapacityMm]. */
  readonly soilMoistureMm: number;
  /** Actual evapotranspiration this step, expressed as a rate, mm/day. */
  readonly actualEvapotranspirationMmPerDay: number;
  /** Water that exceeded field capacity and ran off this step, mm. */
  readonly runoffMm: number;
  /** Unmet evapotranspiration demand this step (potential − actual), mm — always ≥ 0. */
  readonly deficitMm: number;
}

/**
 * One Thornthwaite-Mather step over `dtDays`. Exact bucket accounting:
 * P = AET + ΔS + Runoff, with AET capped at whatever water is actually
 * available (incoming precipitation, then stored soil moisture) — never
 * allowed to exceed the potential rate, and never allowed to draw the soil
 * below zero.
 */
export function stepWaterBalance(params: WaterBalanceParams, dtDays: number): WaterBalanceStepResult {
  if (dtDays <= 0) {
    return { soilMoistureMm: params.soilMoistureMm, actualEvapotranspirationMmPerDay: 0, runoffMm: 0, deficitMm: 0 };
  }
  const precipMm = Math.max(0, params.precipitationMmPerDay) * dtDays;
  const potentialETMm = Math.max(0, params.potentialEvapotranspirationMmPerDay) * dtDays;
  const availableMm = Math.max(0, params.soilMoistureMm) + precipMm;

  const actualETMm = Math.min(potentialETMm, availableMm);
  const afterETMm = availableMm - actualETMm;
  const fieldCapacityMm = Math.max(0, params.fieldCapacityMm);
  const runoffMm = Math.max(0, afterETMm - fieldCapacityMm);
  const soilMoistureMm = Math.min(afterETMm, fieldCapacityMm);

  return {
    soilMoistureMm,
    actualEvapotranspirationMmPerDay: actualETMm / dtDays,
    runoffMm,
    deficitMm: potentialETMm - actualETMm,
  };
}

export function soilMoistureFractionOfCapacity(soilMoistureMm: number, fieldCapacityMm: number): number {
  if (!Number.isFinite(fieldCapacityMm) || fieldCapacityMm <= 0) return 0;
  return Math.max(0, Math.min(1, soilMoistureMm / fieldCapacityMm));
}

const SECONDS_PER_DAY = 86400;

let stepCounter = 0;

/**
 * One reusable solver. `dt` is expected in seconds, converted to days
 * internally — the Thornthwaite-Mather method is a daily-timestep method by
 * convention, but the underlying accounting is exact for any `dtDays`, so a
 * finer or coarser tick cadence changes nothing about correctness.
 */
export function makeDroughtWaterBalanceSolver(): DomainSolver {
  return (entity, ctx): SolverResult => {
    const state = entity.domainState as Partial<WaterBalanceParams & { cumulativeMoistureDeficitMm: number }> | undefined;
    const params: WaterBalanceParams = { ...WATER_BALANCE_DEFAULTS, ...state };
    const dtDays = ctx.dt / SECONDS_PER_DAY;

    const step = stepWaterBalance(params, dtDays);
    const fractionOfCapacity = soilMoistureFractionOfCapacity(step.soilMoistureMm, params.fieldCapacityMm);
    const severityCode = droughtSeverityCode(fractionOfCapacity);

    // A full recharge resolves an ongoing deficit — the same convention drought monitoring tools
    // use for "event" accounting, rather than letting one wet day's leftover deficit linger forever.
    const priorDeficitMm = state?.cumulativeMoistureDeficitMm ?? 0;
    const fullyRecharged = params.fieldCapacityMm > 0 && step.soilMoistureMm >= params.fieldCapacityMm - 1e-9;
    const cumulativeMoistureDeficitMm = fullyRecharged ? 0 : priorDeficitMm + step.deficitMm;

    const kbdiEquivalent = kbdiEquivalentFromDeficitMm(soilStorageDeficitMm(step.soilMoistureMm, params.fieldCapacityMm));

    stepCounter += 1;

    const observation: Observation = {
      observationId: `drought-obs:${entity.id}:${ctx.tick}`,
      tick: ctx.tick,
      statement: `${entity.label}: soil moisture=${step.soilMoistureMm.toFixed(1)}mm (${(fractionOfCapacity * 100).toFixed(0)}% of capacity), AET=${step.actualEvapotranspirationMmPerDay.toFixed(2)}mm/day (${droughtSeverityLabel(severityCode)})`,
      measurements: [
        { key: 'soilMoistureMm', value: step.soilMoistureMm, unit: 'mm', tick: ctx.tick, entity: entity.ref, provenance: ['domains/drought.ts#stepWaterBalance', 'thornthwaite-mather-1955'] },
        { key: 'soilMoistureFractionOfCapacity', value: fractionOfCapacity, tick: ctx.tick, entity: entity.ref, provenance: ['domains/drought.ts#soilMoistureFractionOfCapacity'] },
        { key: 'actualEvapotranspirationMmPerDay', value: step.actualEvapotranspirationMmPerDay, unit: 'mm/day', tick: ctx.tick, entity: entity.ref, provenance: ['domains/drought.ts#stepWaterBalance'] },
        { key: 'cumulativeMoistureDeficitMm', value: cumulativeMoistureDeficitMm, unit: 'mm', tick: ctx.tick, entity: entity.ref, provenance: ['domains/drought.ts#stepWaterBalance'] },
        { key: 'kbdiEquivalent', value: kbdiEquivalent, tick: ctx.tick, entity: entity.ref, provenance: ['domains/drought.ts#kbdiEquivalentFromDeficitMm', 'keetch-byram-1968-definition'] },
      ],
      provenance: ['domains/drought.ts', 'thornthwaite-mather-1955', 'fao-56-typical-pet'],
    };

    const event: GenesisEvent = {
      contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
      id: `drought-evt:${entity.id}:${ctx.tick}:${stepCounter}`,
      type: 'environment.drought.step',
      timestamp: ctx.tick,
      source: entity.ref,
      affectedEntities: [entity.ref],
      cause: 'thornthwaite-mather-water-balance-step',
      parameters: { ...params, soilMoistureMm: step.soilMoistureMm, actualEvapotranspirationMmPerDay: step.actualEvapotranspirationMmPerDay, runoffMm: step.runoffMm, severityCode, kbdiEquivalent, cumulativeMoistureDeficitMm },
      provenance: {
        origin: 'model',
        modelId: DROUGHT_SOLVER_ID,
        notes: 'Thornthwaite-Mather (1955) one-layer soil-moisture water balance: P = AET + dS + Runoff, AET capped at available water. Not SPI/SPEI/PDSI — no calibrated climatological distribution exists to fit. PET and field capacity are stated typical values.',
      },
    };

    return {
      patch: {
        domainState: {
          ...params,
          soilMoistureMm: step.soilMoistureMm,
          actualEvapotranspirationMmPerDay: step.actualEvapotranspirationMmPerDay,
          runoffMm: step.runoffMm,
          deficitMm: step.deficitMm,
          cumulativeMoistureDeficitMm,
          kbdiEquivalent,
          kbdiClassCode: kbdiClassCode(kbdiEquivalent),
          soilMoistureFractionOfCapacity: fractionOfCapacity,
          severityCode,
        },
        statusLabel: droughtSeverityLabel(severityCode),
      },
      // The bucket accounting is exact given its inputs, but PET and field capacity are stated
      // typical values rather than measured for a real place — the same honesty level as
      // rainfallRunoff.ts's own runoffCoefficient/catchmentAreaM2.
      grounding: 'MODEL_ESTIMATE',
      observation,
      event,
    };
  };
}

export interface AddDroughtCatchmentOptions {
  catchmentId?: string;
  label?: string;
  parentEntityId?: EntityId;
  params?: Partial<WaterBalanceParams>;
}

export function addDroughtCatchment(graph: WorldGraph, options: AddDroughtCatchmentOptions = {}): EntityId {
  const ref = { kind: 'drought-catchment', id: options.catchmentId ?? 'drought-catchment-1' };
  const params: WaterBalanceParams = { ...WATER_BALANCE_DEFAULTS, ...options.params };
  const fractionOfCapacity = soilMoistureFractionOfCapacity(params.soilMoistureMm, params.fieldCapacityMm);
  const severityCode = droughtSeverityCode(fractionOfCapacity);
  const entity: WorldModelEntity = {
    id: entityId(ref),
    ref,
    label: options.label ?? 'Drought Water Balance',
    scale: { level: 'MACRO_CITY', parentEntityId: options.parentEntityId },
    spatial: { position: { x: 0, y: 0, z: 0 } },
    domainState: {
      ...params,
      actualEvapotranspirationMmPerDay: 0,
      runoffMm: 0,
      deficitMm: 0,
      cumulativeMoistureDeficitMm: 0,
      kbdiEquivalent: 0,
      kbdiClassCode: KBDI_CLASS_CODE.LOW,
      soilMoistureFractionOfCapacity: fractionOfCapacity,
      severityCode,
    },
    domainBinding: { solverId: DROUGHT_SOLVER_ID, domainId: DROUGHT_DOMAIN_ID },
    statusLabel: droughtSeverityLabel(severityCode),
    grounding: 'MODEL_ESTIMATE',
    updatedAtTick: 0,
  };
  graph.addEntity(entity);
  return entity.id;
}

export interface DroughtWorldOptions {
  catchmentId?: string;
  params?: Partial<WaterBalanceParams>;
}

export interface DroughtWorld {
  graph: WorldGraph;
  catchmentId: EntityId;
}

/** Standalone scenario: one drought-catchment entity bound to the real Thornthwaite-Mather water-balance solver. */
export function buildDroughtWorld(options: DroughtWorldOptions = {}): DroughtWorld {
  const graph = new WorldGraph();
  const catchmentId = addDroughtCatchment(graph, { catchmentId: options.catchmentId, params: options.params });
  return { graph, catchmentId };
}
