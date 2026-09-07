import { PUMP_PIPE_DEFAULTS } from '../../engineeringGraph/pumpPipe';
import { GENESIS_EVENT_CONTRACT_VERSION } from '../../events/genesisEvent';
import { withCascades, type CascadeRule } from '../cascade/cascadeRules';
import { defineCrossDomainCoupling, withCrossDomainCouplings, type CrossDomainCoupling } from '../crossDomain/crossDomainCoupling';
import { entityId, type EntityId } from '../ecs/types';
import { withScheduledEvents, type ScheduledEvent } from '../events/worldEventRules';
import type { WorldBlueprint } from '../generation/worldBlueprint';
import { generateWorld, type GeneratedWorld } from '../generation/worldGenerator';
import { compileSpecification } from '../specification/compiler';
import { computeEpidemicParamsFor } from '../specification/templates';
import { validateWorldInvariants } from '../specification/worldInvariants';
import type { WorldSpecification } from '../specification/worldSpecification';
import type { TemporalUpdater } from '../temporal/temporalEngine';
import { makeGenesisCityRouter, makeGenesisCityUpdater } from './genesisCityWorld';

/**
 * GENESIS SCIENTIFIC CITY 3.0 — the canonical Generative Scientific World
 * Model 2.0 reference world (mission section 17).
 *
 * Generated through the FULL pipeline — never manually assembled:
 *
 *   WorldSpecification -> compileSpecification -> WorldBlueprint
 *   -> (wrapped under a PLANET/REGION ancestor) -> generateWorld -> WorldGraph
 *
 * PLANET
 *  └── REGION
 *       └── CITY (MACRO_CITY, from CITY_TEMPLATE: districts, buildings,
 *           roads, one environmental-context node — honestly ungrounded)
 *            ├── HOSPITAL BUILDING -> population (real RK4 SEIR, EPIDEMIOLOGY_TEMPLATE)
 *            ├── LABORATORY BUILDING -> lab -> substance (real Arrhenius kinetics, LABORATORY_TEMPLATE)
 *            └── WATER SYSTEM BUILDING -> pump-pipe (real hydraulics EngineeringModel, WATER_SYSTEM_TEMPLATE)
 *
 * REFERENCE SCENARIO (mission section 18) — extreme rainfall:
 *
 *   environment.rainfall.extreme (SCRIPTED — Genesis has no weather solver;
 *   this event only marks WHEN the scenario begins)
 *     -> hydraulics.pumppipe.loadincrease (cross-domain coupling: rainfall
 *        raises the REAL pump-pipe's volumetric-flow demand; PROCEDURAL_APPROXIMATION —
 *        the multiplier is a scripted assumption, not measured)
 *     -> the REAL hydraulics EngineeringModel re-solves headLoss/shaftPower
 *        on its own next tick, exactly as it would for any other parameter change
 *     -> hydraulics.pumppipe.tripped (same-domain cascade: an engineering-
 *        judgment overload threshold on the real headLoss output trips the
 *        pump; PROCEDURAL_APPROXIMATION — the threshold itself is not measured)
 *     -> building.waterservice.interrupted (cross-domain coupling, reused
 *        verbatim from domains/genesisCityWorld2.ts's own cascade: the
 *        hospital building's water service is flagged interrupted)
 *     -> population.hospitalaccess.impaired (cross-domain coupling: the
 *        population is flagged with impaired hospital access — an HONEST
 *        QUALITATIVE flag; the real SEIR compartments themselves are NEVER
 *        altered by this, since no validated model connects a water outage
 *        to epidemic dynamics — the goal is proving one world can contain
 *        multiple real scientific subsystems, not fake realism)
 */
export const RAINFALL_EVENT_TYPE = 'environment.rainfall.extreme';
export const PUMP_TRIPPED_EVENT_TYPE = 'hydraulics.pumppipe.tripped';
export const HOSPITAL_SERVICE_INTERRUPTED_EVENT_TYPE = 'building.waterservice.interrupted';
export const POPULATION_ACCESS_IMPAIRED_EVENT_TYPE = 'population.hospitalaccess.impaired';

/**
 * Engineering-judgment threshold (not a measured pipe rating) — the real
 * Darcy-Weisbach headLoss output tripping this is the honest,
 * PROCEDURAL_APPROXIMATION consequence this reference scenario
 * demonstrates. Chosen with real margin either side, using the actual
 * model's own output: `PUMP_PIPE_DEFAULTS` steady-state headLoss is
 * ~35.6m; at `RAINFALL_LOAD_MULTIPLIER`x flow it is ~548.6m — 100m sits
 * clearly above the former (no trip without rainfall) and clearly below
 * the latter (a real trip once rainfall raises the load).
 */
const PUMP_OVERLOAD_HEAD_LOSS_THRESHOLD_M = 100;
/** Scripted assumption for how much an "extreme rainfall" scenario raises inflow demand — not
 * derived from any real hydrology model. Exported so a caller driving an on-demand "what if the
 * pump fails" fork (City Infrastructure Integration 1.0) can reuse the EXACT same real load-increase
 * magnitude this file's own scripted rainfall coupling applies, rather than inventing a second one. */
export const RAINFALL_LOAD_MULTIPLIER = 4;

export interface GenesisScientificCity3Options {
  seed?: number;
  populationCount?: number;
  levelOfDetail?: WorldSpecification['levelOfDetail'];
  /** Tick the scripted extreme-rainfall scenario begins at. `undefined` disables the scenario entirely (a plain reference city). */
  rainfallAtTick?: number;
}

export interface GenesisScientificCity3 {
  specification: WorldSpecification;
  blueprint: WorldBlueprint;
  generated: GeneratedWorld;
  graph: GeneratedWorld['graph'];
  updater: TemporalUpdater;
  couplings: readonly CrossDomainCoupling[];
  planetId: EntityId;
  regionId: EntityId;
  cityId: EntityId;
  hospitalBuildingId: EntityId;
  populationId: EntityId;
  labBuildingId: EntityId;
  labId: EntityId;
  substanceId: EntityId;
  waterSystemBuildingId: EntityId;
  pumpPipeId: EntityId;
  environmentId: EntityId;
}

function buildSpecification(options: GenesisScientificCity3Options): WorldSpecification {
  return {
    worldId: 'genesis-scientific-city-3',
    seed: options.seed ?? 1,
    worldType: ['CITY', 'LABORATORY', 'WATER_SYSTEM', 'EPIDEMIOLOGY'],
    scale: 'MACRO_CITY',
    levelOfDetail: options.levelOfDetail ?? 'MEDIUM',
    population: { count: options.populationCount ?? 250_000 },
    scientificDomains: [{ domain: 'chemistry', required: true }, { domain: 'hydraulics', required: true }, { domain: 'epidemiology', required: true }],
    relationships: [
      { from: { kind: 'pump-pipe-system', id: 'pump-pipe-1' }, to: { kind: 'building', id: 'hospital-building' }, kind: 'feedsInto' },
      { from: { kind: 'environment', id: 'city-environment' }, to: { kind: 'pump-pipe-system', id: 'pump-pipe-1' }, kind: 'loads' },
      { from: { kind: 'building', id: 'hospital-building' }, to: { kind: 'population', id: 'city-1' }, kind: 'affects' },
    ],
    provenanceNote: 'Genesis Scientific City 3.0 — canonical Generative Scientific World Model 2.0 reference world.',
  };
}

/** Wraps an already-compiled city-scale blueprint root under a PLANET -> REGION ancestry — a one-off composition local to this reference world, not a change to the generic compiler (which keeps `spec.scale` as the root's own level). */
function wrapUnderPlanetAndRegion(blueprint: WorldBlueprint, planetId: string, regionId: string): WorldBlueprint {
  return {
    ...blueprint,
    root: {
      ref: { kind: 'planet', id: planetId },
      label: 'Earth',
      scaleLevel: 'PLANET',
      spatial: { position: { x: 0, y: 0, z: 0 } },
      children: [
        {
          ref: { kind: 'region', id: regionId },
          label: 'Region One',
          scaleLevel: 'REGION',
          spatial: { position: { x: 0, y: 0, z: 0 } },
          children: [blueprint.root],
        },
      ],
    },
  };
}

function pumpOverloadTripRule(pumpPipeId: EntityId): CascadeRule {
  return (triggerEvent, ctx) => {
    if (triggerEvent.type !== 'hydraulics.pumppipe.step' || !triggerEvent.source) return { patches: [], events: [] };
    if (entityId(triggerEvent.source) !== pumpPipeId) return { patches: [], events: [] };
    const headLoss = triggerEvent.parameters.headLoss;
    if (typeof headLoss !== 'number' || headLoss < PUMP_OVERLOAD_HEAD_LOSS_THRESHOLD_M) return { patches: [], events: [] };
    const pump = ctx.graph.getEntity(pumpPipeId);
    if (pump.domainState?.volumetricFlow === 0) return { patches: [], events: [] }; // already tripped — do not re-fire

    return {
      patches: [{ id: pumpPipeId, patch: { domainState: { ...pump.domainState, volumetricFlow: 0 }, statusLabel: 'Pump tripped (overload protection)' } }],
      events: [
        {
          contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
          id: `cascade:${pumpPipeId}:${ctx.tick}:${PUMP_TRIPPED_EVENT_TYPE}`,
          type: PUMP_TRIPPED_EVENT_TYPE,
          timestamp: ctx.tick,
          source: pump.ref,
          affectedEntities: [pump.ref],
          cause: 'overload-protection',
          parameters: { headLossAtTripM: headLoss, thresholdM: PUMP_OVERLOAD_HEAD_LOSS_THRESHOLD_M },
          parentEventId: triggerEvent.id,
          provenance: {
            origin: 'consequence-rule',
            ruleId: PUMP_TRIPPED_EVENT_TYPE,
            notes: 'Engineering-judgment overload threshold on the real Darcy-Weisbach headLoss output — the threshold itself is not a measured pipe rating (PROCEDURAL_APPROXIMATION).',
          },
        },
      ],
    };
  };
}

function buildCouplings(): readonly CrossDomainCoupling[] {
  const rainfallToLoad = defineCrossDomainCoupling({
    id: 'rainfall-to-hydraulic-load',
    sourceDomain: 'environment',
    targetDomain: 'hydraulics',
    triggerEventType: RAINFALL_EVENT_TYPE,
    relationshipKind: 'loads',
    direction: 'from',
    condition: 'Scripted extreme-rainfall scenario begins',
    effect: "Pump-pipe system's volumetric-flow demand rises; the real hydraulics model re-solves headLoss/shaftPower on its own next tick",
    grounding: 'PROCEDURAL_APPROXIMATION',
    deriveEffect: (pumpPipe) => {
      const currentFlow = pumpPipe.domainState?.volumetricFlow ?? PUMP_PIPE_DEFAULTS.volumetricFlow;
      return {
        patch: { domainState: { ...pumpPipe.domainState, volumetricFlow: currentFlow * RAINFALL_LOAD_MULTIPLIER } },
        eventType: 'hydraulics.pumppipe.loadincrease',
        cause: 'extreme-rainfall-loading',
      };
    },
  });

  const tripToHospitalService = defineCrossDomainCoupling({
    id: 'pump-trip-to-hospital-service',
    sourceDomain: 'hydraulics',
    targetDomain: 'infrastructure',
    triggerEventType: PUMP_TRIPPED_EVENT_TYPE,
    relationshipKind: 'feedsInto',
    direction: 'from',
    condition: 'Pump-pipe system tripped (overload protection)',
    effect: "Hospital building's water service flagged interrupted",
    grounding: 'PROCEDURAL_APPROXIMATION',
    deriveEffect: (hospitalBuilding) => {
      if (hospitalBuilding.domainState?.waterServiceInterrupted === 1) return undefined;
      return {
        patch: { statusLabel: 'Water service interrupted (upstream pump trip)', domainState: { ...hospitalBuilding.domainState, waterServiceInterrupted: 1 } },
        eventType: HOSPITAL_SERVICE_INTERRUPTED_EVENT_TYPE,
        cause: 'upstream-pump-trip',
      };
    },
  });

  const serviceToPopulationAccess = defineCrossDomainCoupling({
    id: 'hospital-service-to-population-access',
    sourceDomain: 'infrastructure',
    targetDomain: 'epidemiology',
    triggerEventType: HOSPITAL_SERVICE_INTERRUPTED_EVENT_TYPE,
    relationshipKind: 'affects',
    direction: 'from',
    condition: 'Hospital building water service interrupted',
    effect:
      'A real, durable EVENT records the population as having impaired hospital access — deliberately NOT a persisted domainState flag on the population entity: its real RK4-SEIR solver overwrites domainState wholesale every tick (see epidemicSEIR.ts), so any flag stored there would be silently erased on the population\'s own very next solved tick, which would be a more subtle dishonesty than not persisting it at all. The real SEIR compartments (S/E/I/R/D) are never altered by this coupling, and neither is anything else on the entity.',
    grounding: 'PROCEDURAL_APPROXIMATION',
    deriveEffect: (_population) => ({
      patch: {},
      eventType: POPULATION_ACCESS_IMPAIRED_EVENT_TYPE,
      cause: 'hospital-water-service-interrupted',
    }),
  });

  return [rainfallToLoad, tripToHospitalService, serviceToPopulationAccess];
}

/** Exported so a caller already running this world's engine (e.g. C1's Scientific Director, on a
 * "show me the city during extreme rainfall" request) can schedule the SAME real event on a LIVE
 * engine via `withScheduledEvents(engine's own updater, rainfallSchedule(nextTick))`, rather than
 * only at world-construction time via `rainfallAtTick` — the identical event, no second scenario
 * mechanism. */
export function rainfallSchedule(atTick: number): readonly ScheduledEvent[] {
  const environmentRef = { kind: 'environment', id: 'city-environment' };
  return [
    {
      atTick,
      build: (ctx) => ({
        contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
        id: `scenario:rainfall:${atTick}`,
        type: RAINFALL_EVENT_TYPE,
        timestamp: ctx.tick,
        source: environmentRef,
        affectedEntities: [environmentRef],
        cause: 'scripted-scenario-start',
        parameters: { intensityMmPerHour: 80 },
        provenance: {
          origin: 'experiment-action',
          notes: 'Scripted scenario trigger — Genesis has no weather/precipitation solver; this event marks WHEN the scenario begins, not a simulated storm.',
        },
      }),
    },
  ];
}

export function buildGenesisScientificCity3(options: GenesisScientificCity3Options = {}): GenesisScientificCity3 {
  const specification = buildSpecification(options);
  const compiled = compileSpecification(specification);
  const planetId: EntityId = 'planet:earth';
  const regionId: EntityId = 'region:r1';
  const wrapped = wrapUnderPlanetAndRegion(compiled.blueprint, 'earth', 'r1');
  const generated = generateWorld(wrapped);
  for (const step of compiled.postGenerate) step(generated.graph);

  const invariants = validateWorldInvariants(generated.graph);
  if (!invariants.ok) {
    const summary = invariants.violations.map((v) => (v.entityId ? `${v.entityId}: ${v.message}` : v.message)).join('; ');
    throw new Error(`Genesis Scientific City 3.0 failed structural invariants: ${summary}`);
  }

  const pumpPipeId: EntityId = 'pump-pipe-system:pump-pipe-1';
  const router = makeGenesisCityRouter(computeEpidemicParamsFor(specification));

  let updater: TemporalUpdater = makeGenesisCityUpdater(router);
  if (options.rainfallAtTick !== undefined) updater = withScheduledEvents(updater, rainfallSchedule(options.rainfallAtTick));
  const couplings = buildCouplings();
  updater = withCrossDomainCouplings(updater, [couplings[0]]); // rainfall -> hydraulic load
  updater = withCascades(updater, [pumpOverloadTripRule(pumpPipeId)]); // real headLoss -> trip
  updater = withCrossDomainCouplings(updater, [couplings[1]]); // trip -> hospital service
  updater = withCrossDomainCouplings(updater, [couplings[2]]); // hospital service -> population access

  return {
    specification,
    blueprint: wrapped,
    generated,
    graph: generated.graph,
    updater,
    couplings,
    planetId,
    regionId,
    cityId: 'city:genesis-scientific-city-3',
    hospitalBuildingId: 'building:hospital-building',
    populationId: 'population:city-1',
    labBuildingId: 'building:chemistry-lab-building',
    labId: 'lab:lab1',
    substanceId: 'substance:s1',
    waterSystemBuildingId: 'building:water-system-building',
    pumpPipeId,
    environmentId: 'environment:city-environment',
  };
}
