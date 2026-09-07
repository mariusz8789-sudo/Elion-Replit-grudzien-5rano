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
import type { DomainSolver } from '../solvers/solverRouter';
import type { TemporalUpdater } from '../temporal/temporalEngine';
import { makeGenesisCityRouter, makeGenesisCityUpdater } from './genesisCityWorld';
import { bindEnvironmentToRainfallRunoff, rationalMethodPeakRunoffM3S, RAINFALL_CATCHMENT_DEFAULTS } from './rainfallRunoff';

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
export const LAB_COOLING_LOST_EVENT_TYPE = 'chemistry.lab.coolinglost';

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
/**
 * The intensity the flagship "extreme rainfall" scenario runs at, in mm/h.
 *
 * 80 mm/h is a violent-rain rate (the conventional band starts at 50 mm/h) —
 * a severe but entirely real short-duration urban storm intensity, not an
 * arbitrary dial. It is the number the scenario event has always carried in
 * `parameters.intensityMmPerHour`; as of Phase 5 it is also the number that
 * actually drives the load, rather than decoration beside a hardcoded ×4.
 */
export const FLAGSHIP_RAINFALL_INTENSITY_MM_PER_HOUR = 80;

/**
 * Total pump inflow under rainfall: baseline demand plus the stormwater runoff
 * the REAL rational method computes for this city's drainage sub-catchment
 * (`rainfallRunoff.ts` — Q = C·i·A, with the catchment's own tabulated area and
 * runoff coefficient).
 *
 * This replaces the former `RAINFALL_LOAD_MULTIPLIER = 4`. The difference is not
 * cosmetic: the multiplier made every storm identical, so the scenario's own
 * intensity parameter was inert and "what if the rain were lighter" had no
 * answer. Now intensity propagates into the real Darcy-Weisbach model, and
 * whether the pump trips is decided by the resulting head loss. It happens to
 * trip at about 18.3 mm/h for this catchment and this pipe — an emergent
 * crossing of the overload threshold, not a scripted outcome. At the flagship
 * 80 mm/h the total is ~0.201 m³/s (≈4× baseline, so the reference cascade is
 * preserved) and head loss is ~555 m, far above the 100 m trip threshold.
 *
 * Exported so a caller driving an on-demand "what if the pump fails" fork
 * reuses the EXACT same real loading this file's own rainfall coupling applies,
 * rather than inventing a second one.
 */
export function rainfallLoadedPumpFlowM3S(intensityMmPerHour: number, baselineFlowM3S: number = PUMP_PIPE_DEFAULTS.volumetricFlow): number {
  return baselineFlowM3S + rationalMethodPeakRunoffM3S(
    intensityMmPerHour,
    RAINFALL_CATCHMENT_DEFAULTS.catchmentAreaM2,
    RAINFALL_CATCHMENT_DEFAULTS.runoffCoefficient,
  );
}

/**
 * How much a hospital's loss of water service raises the population's R0
 * while the outage lasts.
 *
 * MECHANISM (real, not invented): loss of a clean-water supply in a
 * healthcare facility degrades hand hygiene and infection-prevention
 * practice, which raises transmission — the standard WASH/IPC rationale for
 * why water service is treated as infection-control infrastructure. What is
 * REAL here is that the effect is applied to `r0`, an actual parameter of
 * the actual RK4 SEIR model (`core/epidemic/sir.ts`, β = R0/D_inf), and
 * every consequence — the whole infection curve — is then computed by that
 * unmodified real solver, never written in by hand.
 *
 * What is a SCRIPTED ASSUMPTION, disclosed as such: the MAGNITUDE. +20% is
 * an engineering-judgment figure for this reference scenario, not a measured
 * or fitted epidemiological estimate — exactly the same honesty tier as
 * `RAINFALL_LOAD_MULTIPLIER` and `PUMP_OVERLOAD_HEAD_LOSS_THRESHOLD_M`
 * above, hence the coupling's `PROCEDURAL_APPROXIMATION` grounding.
 */
export const HOSPITAL_WATER_OUTAGE_R0_MULTIPLIER = 1.2;

/**
 * How far a lab sample's temperature drifts up when the pump trip cuts the
 * cooling-water supply the lab's thermal loop depends on.
 *
 * MECHANISM (real): the same pump that feeds the hospital also feeds the
 * lab's cooling loop; losing it means an actively-cooled sample drifts off
 * its held setpoint. The CONSEQUENCE is then computed entirely by the real
 * Arrhenius model (`core/modelGraph/chemistryKineticsGraph.ts`,
 * k = A·exp(−Eₐ/RT)) — this coupling never touches the reaction rate,
 * half-life, or concentration itself; it only changes the temperature the
 * real model then solves at.
 *
 * SCRIPTED ASSUMPTION, disclosed: the +40 K drift magnitude is engineering
 * judgment for this reference scenario, not a measured thermal-loop
 * response — same tier as the constants above, hence
 * `PROCEDURAL_APPROXIMATION`.
 */
export const LAB_LOST_COOLING_TEMPERATURE_RISE_K = 40;

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

/** Exported so `genesisScientificCity4.ts` can build the exact same reference specification and drive it through the Trinity `createScientificWorld` entry point instead of this module's own manual compile/generate/wrap pipeline — proving the two paths are equivalent, not duplicating the specification. */
export function buildGenesisScientificCity3Specification(options: GenesisScientificCity3Options): WorldSpecification {
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
      // The same city pump also feeds the chemistry lab's cooling loop — the declared edge the
      // hydraulics -> chemistry coupling travels over. Resolved in `postGenerate` (see
      // specification/compiler.ts), so it correctly references the substance LABORATORY_TEMPLATE
      // only attaches after `generateWorld` runs.
      { from: { kind: 'pump-pipe-system', id: 'pump-pipe-1' }, to: { kind: 'substance', id: 's1' }, kind: 'cools' },
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

/** `baseR0` must be the SAME value the registered SEIR solver runs with (`computeEpidemicParamsFor(specification).r0`) — see `serviceToPopulationAccess` below for why the coupling needs it. */
function buildCouplings(baseR0: number): readonly CrossDomainCoupling[] {
  const rainfallToLoad = defineCrossDomainCoupling({
    id: 'rainfall-to-hydraulic-load',
    sourceDomain: 'environment',
    targetDomain: 'hydraulics',
    triggerEventType: RAINFALL_EVENT_TYPE,
    relationshipKind: 'loads',
    direction: 'from',
    condition: 'Extreme-rainfall scenario begins, at the intensity the event itself carries',
    effect: "Stormwater runoff computed from that intensity by the rational method (Q = C*i*A) is added to the pump-pipe system's inflow; the real hydraulics model re-solves headLoss/shaftPower on its own next tick",
    // Upgraded from PROCEDURAL_APPROXIMATION in Phase 5. The load is no longer a
    // scripted multiplier: it is a standard hydrological method evaluated on the
    // scenario's real intensity. MODEL_ESTIMATE, not exact — the catchment area
    // and runoff coefficient are typical tabulated values, not site survey data
    // (see `rainfallRunoff.ts` for the full limitation list).
    grounding: 'MODEL_ESTIMATE',
    deriveEffect: (pumpPipe, triggerEvent) => {
      // Phase 5: the event's OWN intensity now drives the load. Previously this
      // read a fixed multiplier and the `intensityMmPerHour` parameter was inert.
      const intensityMmPerHour = typeof triggerEvent.parameters.intensityMmPerHour === 'number'
        ? triggerEvent.parameters.intensityMmPerHour
        : FLAGSHIP_RAINFALL_INTENSITY_MM_PER_HOUR;
      const currentFlow = pumpPipe.domainState?.volumetricFlow ?? PUMP_PIPE_DEFAULTS.volumetricFlow;
      return {
        patch: { domainState: { ...pumpPipe.domainState, volumetricFlow: rainfallLoadedPumpFlowM3S(intensityMmPerHour, currentFlow) } },
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
      "Raises the population's R0 by HOSPITAL_WATER_OUTAGE_R0_MULTIPLIER for as long as the outage lasts (degraded hand hygiene / infection control without a clean-water supply), and records a durable event. The S/E/I/R/D compartments are NEVER written by this coupling: it moves one real MODEL PARAMETER (`r0`, already this solver's own documented intervention lever), and the unmodified RK4 SEIR solver computes every consequence itself on its next tick.",
    grounding: 'PROCEDURAL_APPROXIMATION',
    deriveEffect: (population) => {
      const state = population.domainState ?? {};
      if (state.r0 !== undefined) return undefined; // outage effect already applied — never compound it
      return {
        // `baseR0` is the EXACT parameter the registered SEIR solver is running with (both come from
        // the same `computeEpidemicParamsFor(specification)` call), so the outage multiplies the real
        // baseline rather than a guess — and recovery restores it by dropping the override key
        // entirely, letting the solver fall back to that same baseline with zero drift.
        patch: { domainState: { ...state, r0: baseR0 * HOSPITAL_WATER_OUTAGE_R0_MULTIPLIER } },
        eventType: POPULATION_ACCESS_IMPAIRED_EVENT_TYPE,
        cause: 'hospital-water-service-interrupted',
      };
    },
  });

  /**
   * FOURTH REAL CONSEQUENCE PATH — hydraulics -> chemistry. The pump that
   * feeds the hospital also cools the lab; losing it raises the sample's
   * temperature, and the REAL Arrhenius model then re-solves k/half-life
   * against that temperature on its own next tick, exactly as the real
   * hydraulics model re-solves headLoss after the rainfall load increase.
   * The coupling itself computes no chemistry.
   */
  const tripToLabCooling = defineCrossDomainCoupling({
    id: 'pump-trip-to-lab-cooling',
    sourceDomain: 'hydraulics',
    targetDomain: 'chemistry-kinetics',
    triggerEventType: PUMP_TRIPPED_EVENT_TYPE,
    relationshipKind: 'cools',
    direction: 'from',
    condition: 'Pump-pipe system tripped, cutting the lab cooling loop',
    effect: "Lab sample drifts LAB_LOST_COOLING_TEMPERATURE_RISE_K above the setpoint the cooling loop was holding; the real Arrhenius kinetics model re-solves the rate constant at that temperature on its own next tick",
    grounding: 'PROCEDURAL_APPROXIMATION',
    deriveEffect: (substance) => {
      const state = substance.domainState ?? {};
      if (state.coolingLost === 1) return undefined; // already lost — do not drift twice
      const setpointK = substance.physics?.temperatureK ?? 0;
      return {
        patch: {
          physics: { ...substance.physics, massKg: substance.physics?.massKg ?? 0, temperatureK: setpointK + LAB_LOST_COOLING_TEMPERATURE_RISE_K },
          // The setpoint the loop was holding, kept so recovery restores the EXACT pre-outage
          // temperature rather than assuming the drift was the only thing that ever moved it.
          domainState: { ...state, coolingLost: 1, cooledSetpointK: setpointK },
          statusLabel: 'Cooling lost (upstream pump trip)',
        },
        eventType: LAB_COOLING_LOST_EVENT_TYPE,
        cause: 'upstream-pump-trip',
      };
    },
  });

  return [rainfallToLoad, tripToHospitalService, serviceToPopulationAccess, tripToLabCooling];
}

/** Exported so a caller already running this world's engine (e.g. C1's Scientific Director, on a
 * "show me the city during extreme rainfall" request) can schedule the SAME real event on a LIVE
 * engine via `withScheduledEvents(engine's own updater, rainfallSchedule(nextTick))`, rather than
 * only at world-construction time via `rainfallAtTick` — the identical event, no second scenario
 * mechanism. */
export function rainfallSchedule(
  atTick: number,
  intensityMmPerHour: number = FLAGSHIP_RAINFALL_INTENSITY_MM_PER_HOUR,
): readonly ScheduledEvent[] {
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
        parameters: { intensityMmPerHour },
        provenance: {
          origin: 'experiment-action',
          notes: 'Scripted scenario trigger marking WHEN the event begins — intensityMmPerHour is real (Phase 5 rational-method runoff), the timing itself is still not a simulated storm.',
        },
      }),
    },
  ];
}

/** The `pump-pipe-system:pump-pipe-1` id `WATER_SYSTEM_TEMPLATE` always produces for this specification — independent of the PLANET/REGION wrap, so it's the same id whether a graph came from this module's manual pipeline or the generic `generateSpecifiedWorld` path (see `genesisScientificCity4.ts`). */
export const GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID: EntityId = 'pump-pipe-system:pump-pipe-1';

/** The `environment:city-environment` id `CITY_TEMPLATE` always produces for this specification — the node Phase 5 binds to the real rational-method runoff solver. Same id on both the manual and the Trinity construction path. */
export const GENESIS_SCIENTIFIC_CITY_ENVIRONMENT_ID: EntityId = 'environment:city-environment';

/**
 * Extension point for a CALLER-SPECIFIC layer on top of this scenario's own
 * three couplings — e.g. `genesisScientificCity4.ts`'s real backup-
 * generator domain — without City 3.0 itself changing at all (every
 * existing caller passing none of these behaves identically). Registers
 * onto the SAME router/updater chain this function already builds; never
 * a second router, cascade engine, or coupling mechanism.
 */
export interface GenesisScientificCity3UpdaterExtras {
  /** Extra domain solvers registered onto the same `SolverRouter` alongside chemistry/epidemiology/hydraulics. */
  extraSolvers?: readonly { solverId: string; solver: DomainSolver }[];
  /** Extra cascade rules, applied (as one more `withCascades` layer) AFTER this scenario's own trip cascade. */
  extraCascades?: readonly CascadeRule[];
  /** Extra cross-domain couplings, applied (as one more `withCrossDomainCouplings` layer) AFTER this scenario's own three — so they see every event already in this tick's chain, including a caller's own extra solvers'. */
  extraCouplings?: readonly CrossDomainCoupling[];
}

/**
 * Builds the real, tickable updater for the extreme-rainfall cross-domain
 * scenario over an ALREADY-GENERATED graph. Extracted from
 * `buildGenesisScientificCity3` so `genesisScientificCity4.ts` can attach
 * the exact same scenario logic to a graph generated through the Trinity
 * `createScientificWorld` entry point instead — never a second scenario
 * implementation, only a second caller of this one.
 */
export function buildGenesisScientificCity3Updater(
  specification: WorldSpecification,
  options: Pick<GenesisScientificCity3Options, 'rainfallAtTick'> = {},
  extras: GenesisScientificCity3UpdaterExtras = {},
): TemporalUpdater {
  const epidemicParams = computeEpidemicParamsFor(specification);
  const router = makeGenesisCityRouter(epidemicParams);
  for (const { solverId, solver } of extras.extraSolvers ?? []) router.register(solverId, solver);
  let updater: TemporalUpdater = makeGenesisCityUpdater(router);
  if (options.rainfallAtTick !== undefined) updater = withScheduledEvents(updater, rainfallSchedule(options.rainfallAtTick));
  const couplings = buildCouplings(epidemicParams.r0);
  updater = withCrossDomainCouplings(updater, [couplings[0]]); // rainfall -> hydraulic load
  updater = withCascades(updater, [pumpOverloadTripRule(GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID)]); // real headLoss -> trip
  updater = withCrossDomainCouplings(updater, [couplings[1]]); // trip -> hospital service
  updater = withCrossDomainCouplings(updater, [couplings[2]]); // hospital service -> population access (real r0 lever)
  updater = withCrossDomainCouplings(updater, [couplings[3]]); // trip -> lab cooling loss (real Arrhenius input)
  if (extras.extraCascades?.length) updater = withCascades(updater, extras.extraCascades);
  // ONE coupling per `withCrossDomainCouplings` layer, applied in order — matching this function's
  // own three above exactly. `withCascades`' own "one pass" rule means a single layer holding
  // multiple couplings would never see one coupling's own derived event as another's trigger
  // WITHIN the same tick (e.g. a chained generator -> pump -> hospital -> population recovery);
  // one sequential layer per coupling is what makes same-tick chaining work at all.
  for (const coupling of extras.extraCouplings ?? []) updater = withCrossDomainCouplings(updater, [coupling]);
  return updater;
}

export function buildGenesisScientificCity3(options: GenesisScientificCity3Options = {}): GenesisScientificCity3 {
  const specification = buildGenesisScientificCity3Specification(options);
  const compiled = compileSpecification(specification);
  const planetId: EntityId = 'planet:earth';
  const regionId: EntityId = 'region:r1';
  const wrapped = wrapUnderPlanetAndRegion(compiled.blueprint, 'earth', 'r1');
  const generated = generateWorld(wrapped);
  for (const step of compiled.postGenerate) step(generated.graph);
  // Phase 5: turn the template's inert environmental-context node into a really-solved
  // catchment. At construction time, so it is genuine tick-0 state that `scrubTo` replays.
  bindEnvironmentToRainfallRunoff(generated.graph, GENESIS_SCIENTIFIC_CITY_ENVIRONMENT_ID);

  const invariants = validateWorldInvariants(generated.graph);
  if (!invariants.ok) {
    const summary = invariants.violations.map((v) => (v.entityId ? `${v.entityId}: ${v.message}` : v.message)).join('; ');
    throw new Error(`Genesis Scientific City 3.0 failed structural invariants: ${summary}`);
  }

  const pumpPipeId = GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID;
  const updater = buildGenesisScientificCity3Updater(specification, options);
  const couplings = buildCouplings(computeEpidemicParamsFor(specification).r0);

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
    environmentId: GENESIS_SCIENTIFIC_CITY_ENVIRONMENT_ID,
  };
}
