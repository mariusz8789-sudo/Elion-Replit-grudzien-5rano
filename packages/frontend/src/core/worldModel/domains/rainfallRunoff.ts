import { deterministicEventId, GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from '../../events/genesisEvent';
import type { Observation } from '../../world/scientificWorldState';
import { entityId, type EntityId, type WorldModelEntity } from '../ecs/types';
import type { WorldGraph } from '../ecs/worldGraph';
import type { DomainSolver, SolverResult } from '../solvers/solverRouter';
import { applyInterventionWithEvent } from '../events/worldEventRules';
import type { TemporalEngine } from '../temporal/temporalEngine';
import { defineCrossDomainCoupling, type CrossDomainCoupling } from '../crossDomain/crossDomainCoupling';
import { WEATHER_STEP_EVENT_TYPE } from './weather';

/**
 * PHASE 5 — ENVIRONMENT / RAINFALL RUNOFF.
 *
 * WHAT THIS IS: a real rainfall-to-runoff hydrology model — the **Rational
 * Method**, Q = C·i·A, the standard peak-flow method of urban storm-drainage
 * design (Mulvaney 1851 / Kuichling 1889; it is the sizing method in every
 * drainage manual and hydrology text). It converts a rainfall intensity into
 * the peak stormwater inflow a catchment delivers to the drainage system
 * downstream of it.
 *
 * WHAT THIS IS **NOT** — stated first, because the gap is the point:
 *
 * - **Genesis still has no weather model.** Nothing here forecasts, generates,
 *   or evolves precipitation. Intensity is an INPUT — set by a scenario event
 *   or by a human intervention — never a predicted quantity. Atmospheric
 *   dynamics remain NOT_MODELLED, and this file does not pretend otherwise.
 * - **Peak flow only, no hydrograph.** The Rational Method returns one number:
 *   the peak. It says nothing about the shape of the storm response over time,
 *   because it does not model routing, channel storage, or infiltration
 *   dynamics. Those are NOT_MODELLED.
 * - **Its own documented assumptions apply**, and are the reason it is
 *   `MODEL_ESTIMATE` rather than exact: rainfall uniform over the catchment,
 *   storm duration at least the catchment's time of concentration, and a
 *   runoff coefficient constant with intensity. Real catchments violate all
 *   three to some degree. The method is standard, not perfect, and it is used
 *   here in the small-catchment regime (well under a few km²) where it is
 *   considered applicable.
 * - **Time of concentration is not computed.** That needs catchment slope,
 *   length and surface data this world does not have. NOT_MODELLED.
 *
 * WHY IT MATTERS HERE: before this, the reference city's extreme-rainfall
 * scenario carried an `intensityMmPerHour: 80` parameter that **nothing read**.
 * The pump's load rose by a hardcoded ×4 whatever the number said, so "what if
 * the rain were half as heavy" was unanswerable. With the Rational Method in
 * the loop, intensity drives the real hydraulics model's real inflow, and the
 * pump trips (or does not) because of the physics rather than because of a
 * script. See `genesisScientificCity3.ts`'s `rainfallToLoad`.
 */
export const RAINFALL_RUNOFF_SOLVER_ID = 'environment-rainfall-runoff-rational-method';
export const ENVIRONMENT_DOMAIN_ID = 'environment-hydrology';

export const RAINFALL_INTENSITY_CHANGED_EVENT_TYPE = 'environment.rainfall.intensitychanged';

/**
 * Intensity bands, as a NUMBER (`SOLVER_DATA_CONTRACT.md` Rule 3: an adapter
 * must be able to discriminate on a scalar, never on prose).
 *
 * The thresholds are the conventional meteorological rain-rate classes —
 * light below 2.5 mm/h, moderate 2.5–10, heavy 10–50, violent above 50 — not
 * invented cut-offs. They classify the driver; they do not affect any
 * computation, which uses the continuous intensity throughout.
 */
export const RAINFALL_INTENSITY_CODE = { NONE: 0, LIGHT: 1, MODERATE: 2, HEAVY: 3, VIOLENT: 4 } as const;
export type RainfallIntensityCode = (typeof RAINFALL_INTENSITY_CODE)[keyof typeof RAINFALL_INTENSITY_CODE];

/** Closed allowlist of `statusLabel` values this domain emits — the prose companion to the code above, never the discriminator itself. */
export const RAINFALL_INTENSITY_STATES = ['RAINFALL_NONE', 'RAINFALL_LIGHT', 'RAINFALL_MODERATE', 'RAINFALL_HEAVY', 'RAINFALL_VIOLENT'] as const;
export type RainfallIntensityState = (typeof RAINFALL_INTENSITY_STATES)[number];

const MODERATE_RAIN_THRESHOLD_MM_PER_HOUR = 2.5;
const HEAVY_RAIN_THRESHOLD_MM_PER_HOUR = 10;
const VIOLENT_RAIN_THRESHOLD_MM_PER_HOUR = 50;

export function rainfallIntensityCode(intensityMmPerHour: number): RainfallIntensityCode {
  if (!Number.isFinite(intensityMmPerHour) || intensityMmPerHour <= 0) return RAINFALL_INTENSITY_CODE.NONE;
  if (intensityMmPerHour < MODERATE_RAIN_THRESHOLD_MM_PER_HOUR) return RAINFALL_INTENSITY_CODE.LIGHT;
  if (intensityMmPerHour < HEAVY_RAIN_THRESHOLD_MM_PER_HOUR) return RAINFALL_INTENSITY_CODE.MODERATE;
  if (intensityMmPerHour < VIOLENT_RAIN_THRESHOLD_MM_PER_HOUR) return RAINFALL_INTENSITY_CODE.HEAVY;
  return RAINFALL_INTENSITY_CODE.VIOLENT;
}

/** Total function: anything outside the allowlist's domain still lands inside the allowlist. */
export function rainfallIntensityLabel(code: number): RainfallIntensityState {
  switch (code) {
    case RAINFALL_INTENSITY_CODE.LIGHT: return 'RAINFALL_LIGHT';
    case RAINFALL_INTENSITY_CODE.MODERATE: return 'RAINFALL_MODERATE';
    case RAINFALL_INTENSITY_CODE.HEAVY: return 'RAINFALL_HEAVY';
    case RAINFALL_INTENSITY_CODE.VIOLENT: return 'RAINFALL_VIOLENT';
    default: return 'RAINFALL_NONE';
  }
}

/** mm/h -> m/s. Rule 2: the conversion is a named, inspectable constant, not an inline magic number. */
const MM_PER_HOUR_TO_M_PER_S = 1 / (1000 * 3600);

/**
 * The Rational Method itself: **Q = C · i · A**, in SI throughout.
 *
 * @param intensityMmPerHour rainfall intensity `i` (mm/h — converted to m/s internally)
 * @param catchmentAreaM2    contributing catchment area `A` (m²)
 * @param runoffCoefficient  dimensionless `C` in [0, 1] — the fraction of rainfall that becomes
 *                           surface runoff rather than infiltrating or being intercepted
 * @returns peak runoff `Q` in m³/s
 *
 * Non-finite or negative inputs yield 0 rather than NaN: a malformed parameter
 * must degrade to "no runoff", never poison the hydraulics model downstream
 * with a NaN that would render as a silently broken pump.
 */
export function rationalMethodPeakRunoffM3S(intensityMmPerHour: number, catchmentAreaM2: number, runoffCoefficient: number): number {
  if (![intensityMmPerHour, catchmentAreaM2, runoffCoefficient].every(Number.isFinite)) return 0;
  if (intensityMmPerHour <= 0 || catchmentAreaM2 <= 0 || runoffCoefficient <= 0) return 0;
  return Math.min(1, runoffCoefficient) * (intensityMmPerHour * MM_PER_HOUR_TO_M_PER_S) * catchmentAreaM2;
}

export interface RainfallCatchmentDefaults {
  rainfallIntensityMmPerHour: number;
  catchmentAreaM2: number;
  runoffCoefficient: number;
}

/**
 * The reference catchment: one drainage sub-catchment feeding one pump station.
 *
 * `catchmentAreaM2` 8000 m² (0.8 ha, roughly a city block) and
 * `runoffCoefficient` 0.85 are **typical tabulated values** for dense,
 * substantially paved urban land use — the kind of figure a drainage manual
 * lists for a surface class, NOT a survey of any real catchment. That is
 * exactly why the solver reports `MODEL_ESTIMATE`: the METHOD is standard and
 * the arithmetic is real, but these two inputs describe a plausible catchment,
 * not a measured one. Both are per-entity `domainState`, so a caller with real
 * site data can substitute it and get a correspondingly better-grounded answer.
 */
export const RAINFALL_CATCHMENT_DEFAULTS: RainfallCatchmentDefaults = {
  rainfallIntensityMmPerHour: 0,
  catchmentAreaM2: 8000,
  runoffCoefficient: 0.85,
};


/**
 * One reusable solver. Note what it does NOT do: it never advances rainfall on
 * its own. `dt` is irrelevant here — like hydraulics, this is an instantaneous
 * relation, not an ODE — so a tick simply re-evaluates Q for whatever intensity
 * currently holds. Intensity changes only via a scenario event or a real
 * intervention, because Genesis cannot predict weather and this file will not
 * imply that it can by drifting a number around.
 */
export function makeRainfallRunoffSolver(): DomainSolver {
  return (entity, ctx): SolverResult => {
    const state = entity.domainState as Partial<RainfallCatchmentDefaults> | undefined;
    const params: RainfallCatchmentDefaults = { ...RAINFALL_CATCHMENT_DEFAULTS, ...state };
    const peakRunoffM3S = rationalMethodPeakRunoffM3S(params.rainfallIntensityMmPerHour, params.catchmentAreaM2, params.runoffCoefficient);
    const intensityCode = rainfallIntensityCode(params.rainfallIntensityMmPerHour);

    const observation: Observation = {
      observationId: `rain-obs:${entity.id}:${ctx.tick}`,
      tick: ctx.tick,
      statement: `${entity.label}: i=${params.rainfallIntensityMmPerHour.toFixed(1)}mm/h, peak runoff Q=${peakRunoffM3S.toFixed(4)}m³/s (rational method)`,
      measurements: [
        { key: 'rainfallIntensityMmPerHour', value: params.rainfallIntensityMmPerHour, tick: ctx.tick, entity: entity.ref, provenance: ['domains/rainfallRunoff.ts#input'] },
        { key: 'peakRunoffM3S', value: peakRunoffM3S, tick: ctx.tick, entity: entity.ref, provenance: ['domains/rainfallRunoff.ts#rationalMethodPeakRunoffM3S', 'rational-method:Q=C*i*A'] },
      ],
      provenance: ['domains/rainfallRunoff.ts', 'rational-method'],
    };

    const eventParameters = { ...params, peakRunoffM3S, intensityCode };
    const event: GenesisEvent = {
      contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
      id: deterministicEventId('rain-evt', entity.id, ctx.tick, eventParameters),
      type: 'environment.rainfallrunoff.step',
      timestamp: ctx.tick,
      source: entity.ref,
      affectedEntities: [entity.ref],
      cause: 'rational-method-recompute',
      parameters: eventParameters,
      provenance: {
        origin: 'model',
        modelId: RAINFALL_RUNOFF_SOLVER_ID,
        notes: 'Q = C*i*A (rational method). Peak flow only — no hydrograph, no routing, no storage; intensity is an input, never a forecast.',
      },
    };

    return {
      patch: {
        domainState: { ...params, peakRunoffM3S, intensityCode },
        statusLabel: rainfallIntensityLabel(intensityCode),
      },
      // The method is real and quantitative; its coefficient and area are typical
      // tabulated values rather than site measurements. MODEL_ESTIMATE, never exact.
      grounding: 'MODEL_ESTIMATE',
      observation,
      event,
    };
  };
}

export interface AddRainfallCatchmentOptions {
  catchmentId?: string;
  label?: string;
  parentEntityId?: EntityId;
  params?: Partial<RainfallCatchmentDefaults>;
}

export function addRainfallCatchment(graph: WorldGraph, options: AddRainfallCatchmentOptions = {}): EntityId {
  const ref = { kind: 'environment', id: options.catchmentId ?? 'catchment-1' };
  const params: RainfallCatchmentDefaults = { ...RAINFALL_CATCHMENT_DEFAULTS, ...options.params };
  const entity: WorldModelEntity = {
    id: entityId(ref),
    ref,
    label: options.label ?? 'Drainage Catchment',
    scale: { level: 'MACRO_CITY', parentEntityId: options.parentEntityId },
    spatial: { position: { x: 0, y: 0, z: 0 } },
    domainState: { ...params, peakRunoffM3S: rationalMethodPeakRunoffM3S(params.rainfallIntensityMmPerHour, params.catchmentAreaM2, params.runoffCoefficient), intensityCode: rainfallIntensityCode(params.rainfallIntensityMmPerHour) },
    domainBinding: { solverId: RAINFALL_RUNOFF_SOLVER_ID, domainId: ENVIRONMENT_DOMAIN_ID },
    statusLabel: rainfallIntensityLabel(rainfallIntensityCode(params.rainfallIntensityMmPerHour)),
    grounding: 'MODEL_ESTIMATE',
    updatedAtTick: 0,
  };
  graph.addEntity(entity);
  return entity.id;
}

/**
 * Binds an environment entity a world GENERATOR already produced (rather than
 * adding a new one) to this solver. The reference city's `city-environment`
 * node came out of `CITY_TEMPLATE` as an inert, honestly-ungrounded context
 * marker; this is what turns it into a real solved entity without duplicating
 * it or changing the generic template.
 *
 * Must run at CONSTRUCTION time — before a `TemporalEngine` is built over the
 * graph — so the binding is genuine tick-0 state that `scrubTo` reconstructs.
 */
export function bindEnvironmentToRainfallRunoff(graph: WorldGraph, environmentEntityId: EntityId, params: Partial<RainfallCatchmentDefaults> = {}): void {
  const existing = graph.getEntity(environmentEntityId);
  const merged: RainfallCatchmentDefaults = { ...RAINFALL_CATCHMENT_DEFAULTS, ...params };
  graph.updateEntity(environmentEntityId, {
    domainState: {
      ...existing.domainState,
      ...merged,
      peakRunoffM3S: rationalMethodPeakRunoffM3S(merged.rainfallIntensityMmPerHour, merged.catchmentAreaM2, merged.runoffCoefficient),
      intensityCode: rainfallIntensityCode(merged.rainfallIntensityMmPerHour),
    },
    domainBinding: { solverId: RAINFALL_RUNOFF_SOLVER_ID, domainId: ENVIRONMENT_DOMAIN_ID },
    statusLabel: rainfallIntensityLabel(rainfallIntensityCode(merged.rainfallIntensityMmPerHour)),
    grounding: 'MODEL_ESTIMATE',
  });
}

/**
 * A real, human-initiated intervention: set the rainfall intensity falling on
 * a catchment. This is what makes "what if the rain were half as heavy" a
 * genuine counterfactual rather than a refusal — the new intensity flows
 * through the real Rational Method into the real hydraulics model, and
 * whatever happens downstream happens because of that, not because a scenario
 * said so. Goes through `applyInterventionWithEvent`, so it is replayable
 * evidence like any other intervention.
 *
 * Negative intensity is rejected rather than clamped: it is not a weaker
 * storm, it is a malformed request.
 */
export function applyRainfallIntensity(engine: TemporalEngine, environmentEntityId: EntityId, intensityMmPerHour: number): WorldModelEntity {
  if (!Number.isFinite(intensityMmPerHour) || intensityMmPerHour < 0) {
    throw new Error(`applyRainfallIntensity: intensity must be a finite, non-negative mm/h value (got ${intensityMmPerHour})`);
  }
  return applyInterventionWithEvent(
    engine,
    environmentEntityId,
    { 'domainState.rainfallIntensityMmPerHour': intensityMmPerHour },
    { eventType: RAINFALL_INTENSITY_CHANGED_EVENT_TYPE, cause: 'human-intervention' },
  );
}

/**
 * WEATHER -> RAINFALL RUNOFF. The environmental layer's precipitation rate
 * becomes the Rational Method's design-storm intensity.
 *
 * Both are the same physical quantity in the same units (mm/h), so no
 * conversion is involved — but the ASSUMPTION is real and is stated here
 * rather than hidden: the Rational Method wants the intensity of a storm
 * lasting at least the catchment's time of concentration, uniform over the
 * catchment. Feeding it an instantaneous rate is exactly right while that
 * rate is sustained, which is the method's own stated assumption, and
 * increasingly wrong for a brief burst. `rainfallRunoff.ts`'s module doc
 * already discloses that assumption set; this coupling inherits it whole and
 * adds nothing to it.
 */
export function buildWeatherToRainfallCoupling(): CrossDomainCoupling {
  return defineCrossDomainCoupling({
    id: 'weather-to-rainfall-intensity',
    sourceDomain: 'environment-atmosphere',
    targetDomain: ENVIRONMENT_DOMAIN_ID,
    triggerEventType: WEATHER_STEP_EVENT_TYPE,
    relationshipKind: 'rainsOn',
    direction: 'from',
    condition: 'The environmental state reports a precipitation rate over this catchment',
    effect: 'The precipitation rate becomes the Rational Method rainfall intensity, inheriting that method\'s own uniform-storm assumption (the rate is taken to be sustained for at least the time of concentration) rather than adding a new one',
    grounding: 'MODEL_ESTIMATE',
    deriveEffect: (catchment, triggerEvent) => {
      const precipitationMmPerHour = triggerEvent.parameters.precipitationMmPerHour;
      if (typeof precipitationMmPerHour !== 'number' || !Number.isFinite(precipitationMmPerHour)) return undefined;
      if (catchment.domainState?.rainfallIntensityMmPerHour === precipitationMmPerHour) return undefined;
      return {
        patch: { domainState: { ...catchment.domainState, rainfallIntensityMmPerHour: precipitationMmPerHour } },
        eventType: RAINFALL_INTENSITY_CHANGED_EVENT_TYPE,
        cause: 'atmospheric-precipitation',
      };
    },
  });
}
