import type { ScenarioKind } from '../../lookingGlass/scenarioRequest';
import { CELL_CYCLE_SOLVER_ID } from '../domains/cellCycle';
import { CHEMISTRY_KINETICS_SOLVER_ID } from '../domains/chemistryKinetics';
import { ELECTRICAL_GENERATOR_SOLVER_ID } from '../domains/electricalGenerator';
import { EPIDEMIC_SEIR_SOLVER_ID } from '../domains/epidemicSEIR';
import { HYDRAULICS_PUMP_PIPE_SOLVER_ID } from '../domains/hydraulicsPumpPipe';
import { MOLECULAR_STRUCTURE_SOLVER_ID } from '../domains/molecularStructure';
import { QUANTUM_TUNNELING_SOLVER_ID } from '../domains/quantumTunneling';
import { FLOOD_INUNDATION_SOLVER_ID } from '../domains/floodInundation';
import { SEISMIC_SOURCE_SOLVER_ID } from '../domains/seismicShaking';
import { TRAFFIC_FLOW_SOLVER_ID } from '../domains/trafficFlow';
import { FIRE_THERMAL_SOLVER_ID } from '../domains/fireThermal';

/**
 * PHASE 7 — SOLVER CAPABILITY REGISTRY.
 *
 * The phase was scoped as fire/thermal and traffic/mobility. A full-repository
 * audit found **neither exists**, and that finding is the deliverable:
 *
 * - **Fire / thermal: now PARTIALLY_MODELLED for a single source.**
 *   `domains/fireThermal.ts` is a real solver: the published NFPA 921/SFPE
 *   t-squared heat-release-rate design-fire curve, a real fuel inventory with
 *   energy conservation bounding it, and the SFPE point-source radiant-heat-
 *   transfer model. It advances exactly ONE fire source — no spread, no
 *   compartment dynamics, no structural response. That single-source model
 *   is an honest fit for INDUSTRIAL_FIRE (this is literally how real
 *   process-safety practice models a pool/jet fire consequence), but NOT for
 *   WILDFIRE, whose defining phenomenon is spread across a fuel bed — which
 *   this does not do — so WILDFIRE stays NOT_MODELLED. See both entries below.
 * - **Traffic flow: now PARTIALLY_MODELLED.** `domains/trafficFlow.ts` is a real
 *   WorldGraph solver on the existing road-network geometry
 *   (`core/world/roadNetwork.ts`): a Greenshields fundamental diagram, a
 *   Cell-Transmission-Model/Godunov update that actually produces congestion
 *   and shockwaves, and HCM signalised-intersection capacity at every real
 *   street crossing. `core/agents/cityAgent.ts`'s constant-speed,
 *   non-interacting agent kinematics remain untouched and unrelated — this is
 *   a separate, real macroscopic flow solver, not a re-hosting of that loop.
 *   What that solver still lacks (OD demand, route choice, calibration) is
 *   named in its own PARTIALLY_MODELLED entries below.
 *
 * WHY THIS FILE EXISTS RATHER THAN A FIRE SOLVER. `lookingGlass/scenarioRequest.ts`
 * classifies 30+ `ScenarioKind`s from a user's sentence — WILDFIRE and
 * INDUSTRIAL_FIRE among them — and **nothing consumed those classifications**.
 * A user could ask for a wildfire, be understood, and reach a world model with
 * no fire model and no statement that there isn't one. Silence there is the
 * dangerous case: it reads as "nothing happened" rather than "not modelled".
 *
 * So this registry answers, for every scenario kind the system can recognise,
 * the only two honest answers: **which real solver would run**, or **exactly
 * what is missing**. The table is exhaustive over `ScenarioKind` by
 * construction — the compiler rejects a new kind that has no entry, so a future
 * scenario type cannot silently arrive without a capability answer.
 */
export const CAPABILITY_CODE = {
  /** A real C3 domain solver runs this. `solverId` names it. */
  MODELLED: 0,
  /** A solver runs, but a scientifically central part of the question is not modelled. `caveat` says which. */
  PARTIALLY_MODELLED: 1,
  /** No solver exists. `missing` names what would be required. Never answered with an approximation. */
  NOT_MODELLED: 2,
} as const;
export type CapabilityCode = (typeof CAPABILITY_CODE)[keyof typeof CAPABILITY_CODE];

export interface SolverCapability {
  readonly capability: CapabilityCode;
  /** The real solver that answers this, when one does. */
  readonly solverId?: string;
  /** What a solver-backed answer still does NOT cover — present whenever `capability` is PARTIALLY_MODELLED. */
  readonly caveat?: string;
  /** Concretely what Genesis lacks — present whenever `capability` is NOT_MODELLED. Named gaps, never "more work needed". */
  readonly missing?: readonly string[];
}

/**
 * What `domains/fireThermal.ts` covers for a single fire source (a real
 * t-squared HRR curve, energy-conserving fuel inventory, and point-source
 * radiant heat transfer) does not make WILDFIRE modelled: spread across a
 * fuel bed IS the phenomenon, and nothing here advances more than one
 * non-spreading source.
 */
const NO_WILDFIRE_SPREAD_MODEL: readonly string[] = Object.freeze([
  'a fire-spread/rate-of-spread model across a fuel bed (e.g. Rothermel for wildland fuels) — domains/fireThermal.ts advances exactly one non-spreading fire source, never two',
  'a fuel-bed/terrain map (fuel type, moisture, load, arrangement) for spread to run on',
  'wind and slope effects on spread direction and rate',
  'fire-resistance and structural-response-to-fire data, which would also need the structural model that does not exist either',
]);

/** What `domains/fireThermal.ts` still does not cover — the honest remainder after the HRR/fuel/radiation solver. */
const FIRE_THERMAL_CAVEAT =
  'A real NFPA 921/SFPE Handbook t-squared design-fire heat-release-rate curve now runs, with a real fuel ' +
  'inventory (mass, heat of combustion) whose energy conservation actually bounds the growth/steady/decay ' +
  'shape, and a real SFPE point-source radiant-heat-flux model to a stated target distance. Still NOT ' +
  'modelled: fire spread (this advances exactly one fire source, never two, so it cannot answer how far or ' +
  'fast a fire grows across a fuel bed), compartment fire dynamics (no flashover, no ventilation-limited ' +
  'combustion, no two-zone model), conduction/convection heat transfer, and structural response (no fire- ' +
  'resistance rating, no strength loss with temperature, no collapse — that needs the structural model ' +
  'Genesis does not have anywhere). Growth class, peak heat-release rate and fuel properties are literature- ' +
  'typical design values, not calibrated to any specific real fire.';

/** What `domains/trafficFlow.ts` still does not cover — the honest remainder after the FD/CTM/capacity solver. */
const TRAFFIC_MODEL_CAVEAT =
  'A real Greenshields fundamental diagram, a Godunov/Cell-Transmission-Model network update, and HCM ' +
  'signalised-intersection capacity now run on the actual road-network geometry (core/world/roadNetwork.ts), ' +
  'producing real congestion, shockwaves and capacity-limited throughput. Still NOT modelled: origin-destination ' +
  'demand and any route-choice/assignment (vehicles enter as one aggregate boundary demand, never assigned a ' +
  'destination or route), turning movements at intersections, and calibration — free-flow speed, jam density, ' +
  'saturation flow and signal timing are textbook defaults, not fitted to any measured count or probe data.';

const noHazardModel = (hazard: string): readonly string[] => Object.freeze([
  `a ${hazard} process model — Genesis has none`,
  'exposure and vulnerability data for whatever the hazard would act on',
  'calibrated intensity-to-consequence relationships, reviewed by a domain expert',
]);

const notModelled = (missing: readonly string[]): SolverCapability => Object.freeze({ capability: CAPABILITY_CODE.NOT_MODELLED, missing });

/**
 * Exhaustive by construction: `Record<ScenarioKind, ...>` means a new
 * `ScenarioKind` fails to compile until someone states whether it can be
 * modelled. That compile error is the point of the file.
 */
export const SOLVER_CAPABILITY_BY_SCENARIO_KIND: Readonly<Record<ScenarioKind, SolverCapability>> = Object.freeze({
  // --- Really modelled ------------------------------------------------------
  CHEMICAL_KINETICS: { capability: CAPABILITY_CODE.MODELLED, solverId: CHEMISTRY_KINETICS_SOLVER_ID },
  EPIDEMIC: { capability: CAPABILITY_CODE.MODELLED, solverId: EPIDEMIC_SEIR_SOLVER_ID },
  HYDRAULIC_SYSTEM: { capability: CAPABILITY_CODE.MODELLED, solverId: HYDRAULICS_PUMP_PIPE_SOLVER_ID },
  BLACKOUT: { capability: CAPABILITY_CODE.MODELLED, solverId: ELECTRICAL_GENERATOR_SOLVER_ID },
  PARTICLE_SYSTEM: { capability: CAPABILITY_CODE.MODELLED, solverId: QUANTUM_TUNNELING_SOLVER_ID },

  // --- Partially modelled: a real solver, with a real hole in it ------------
  FLOOD: {
    capability: CAPABILITY_CODE.PARTIALLY_MODELLED,
    solverId: FLOOD_INUNDATION_SOLVER_ID,
    caveat: 'Rainfall to peak runoff is real (rational method), it drives the real hydraulics model, inundation depth and extent are real (a volume-conserving, connectivity-constrained planar fill over a terrain heightfield), and there is now a real hydrograph too: storage (level-pool) routing through a Manning\'s-equation natural outlet derived from the same terrain, giving a real routed outflow rate, outlet velocity, arrival time, and a constant-rate infiltration loss — all growing when a pump trip removes engineered drainage. Still NOT modelled: a flood-wave front inside the basin (the planar fill still reaches its equilibrium level within a tick, everywhere at once), any channel network or multi-reach routing (one basin, one lumped outlet), and Horton/Green-Ampt infiltration decay (the loss rate is constant, a real but simplified method). On the reference city the terrain is synthetic, which holds the result at PROCEDURAL_APPROXIMATION until real survey elevations are loaded.',
  },
  EARTHQUAKE: {
    capability: CAPABILITY_CODE.PARTIALLY_MODELLED,
    solverId: SEISMIC_SOURCE_SOLVER_ID,
    caveat: 'Ground shaking is a synthetic, explicitly non-calibrated attenuation (not a GMPE). Structural damage, collapse and casualties are still NOT modelled, now as a checked refusal rather than an assumption: the lognormal fragility machinery is real and is actually queried, but its catalogue is empty (FEMA unreachable from this environment, GEM is CC BY-NC-SA) and, more fundamentally, published building fragility is indexed on spectral displacement while this hazard model produces a PGA — bridging that needs capacity curves and a demand spectrum. See FRAGILITY_REQUIRED_DATA.',
  },
  CHEMICAL_REACTION: {
    capability: CAPABILITY_CODE.PARTIALLY_MODELLED,
    solverId: MOLECULAR_STRUCTURE_SOLVER_ID,
    caveat: 'Real RDKit descriptors, a real force-field 3D conformer, and real RDKit bonds now forwarded to the renderer through the frame edge channel (SOLVER_DATA_CONTRACT §C, closed in Phase 8.1). Reaction dynamics beyond Arrhenius kinetics remain not modelled.',
  },
  CELL_CULTURE: {
    capability: CAPABILITY_CODE.PARTIALLY_MODELLED,
    solverId: CELL_CYCLE_SOLVER_ID,
    caveat: 'A real compartmental cell-cycle model (G1/S/G2M, RK4), where growth comes from mitosis turning one cell into two and saturation comes from contact inhibition at the G1/S restriction point — so a confluent culture arrests in G1, as observed. Phase durations are representative mammalian values, not a measured line. Still NOT modelled: chronological age structure (that is a PDE, and cycle-phase structure is not the same thing), phase-duration variability (each compartment implies exponential residence times, so the population doubles somewhat faster than the nominal cycle), gene expression, differentiation, spatial structure, and stochasticity.',
  },
  LAB_EXPERIMENT: {
    capability: CAPABILITY_CODE.PARTIALLY_MODELLED,
    solverId: CHEMISTRY_KINETICS_SOLVER_ID,
    caveat: 'A lab world runs real chemistry, hydraulics and electrical solvers. There is no general model of "an experiment": anything outside those domains is not modelled.',
  },
  WATERBORNE_OUTBREAK: {
    capability: CAPABILITY_CODE.PARTIALLY_MODELLED,
    solverId: EPIDEMIC_SEIR_SOLVER_ID,
    caveat: 'Transmission dynamics are the real RK4 SEIR model, and a water-service outage really moves R0. The waterborne pathway itself — contamination, dose and ingestion — is not modelled.',
  },
  QUARANTINE: {
    capability: CAPABILITY_CODE.PARTIALLY_MODELLED,
    solverId: EPIDEMIC_SEIR_SOLVER_ID,
    caveat: 'An intervention can change real SEIR parameters. Compliance, enforcement and the resulting contact-structure change are not modelled.',
  },
  URBAN_TRANSFORMATION: {
    capability: CAPABILITY_CODE.PARTIALLY_MODELLED,
    caveat: 'The world generator really builds and rebuilds city structure. Urban dynamics — land use, economics, population change over time — are not modelled.',
  },

  // --- Fire/thermal: a real single-source HRR/radiation solver ------------
  // fits INDUSTRIAL_FIRE (real process-safety practice models a pool/jet
  // fire this way); WILDFIRE needs the spread this does not do.
  WILDFIRE: notModelled(NO_WILDFIRE_SPREAD_MODEL),
  INDUSTRIAL_FIRE: {
    capability: CAPABILITY_CODE.PARTIALLY_MODELLED,
    solverId: FIRE_THERMAL_SOLVER_ID,
    caveat: FIRE_THERMAL_CAVEAT,
  },

  // --- Traffic: a real fundamental-diagram/CTM solver, with real named holes -
  TRANSPORT_DISRUPTION: {
    capability: CAPABILITY_CODE.PARTIALLY_MODELLED,
    solverId: TRAFFIC_FLOW_SOLVER_ID,
    caveat: TRAFFIC_MODEL_CAVEAT,
  },
  EVACUATION: {
    capability: CAPABILITY_CODE.PARTIALLY_MODELLED,
    solverId: TRAFFIC_FLOW_SOLVER_ID,
    caveat: `${TRAFFIC_MODEL_CAVEAT} An evacuation surge is only an elevated demand multiplier on that same ` +
      'boundary demand: no evacuation behaviour model exists (warning response, departure timing, or ' +
      'destination choice under stress).',
  },

  // --- Everything else the classifier can recognise but nothing can answer --
  TSUNAMI: notModelled(noHazardModel('wave generation and inundation')),
  HURRICANE: notModelled(noHazardModel('tropical cyclone wind and storm surge')),
  TORNADO: notModelled(noHazardModel('tornado wind field')),
  LANDSLIDE: notModelled(noHazardModel('slope stability and runout')),
  VOLCANIC: notModelled(noHazardModel('eruption, ashfall and flow')),
  DROUGHT: notModelled(noHazardModel('water balance and drought index')),
  EXTREME_HEAT: notModelled(Object.freeze([
    'an ambient heat-exposure model (the fire/thermal solver that exists models one fire source\'s heat release and radiant flux, not ambient air temperature or a heat-wave)',
    'health-effect relationships for heat exposure, and the population vulnerability data behind them',
  ])),
  AVALANCHE: notModelled(noHazardModel('snowpack stability and avalanche runout')),
  BIOLOGICAL_CONTAMINATION: notModelled(Object.freeze([
    'an environmental persistence and exposure-pathway model for a biological agent',
    'a dose-response relationship',
    'NOTE: Genesis models consequences, exposure and interventions. It does not model pathogen design or optimisation, and that boundary is architectural, not a missing feature.',
  ])),
  INDUSTRIAL_ACCIDENT: notModelled(noHazardModel('industrial process failure and its release')),
  CHEMICAL_RELEASE: notModelled(Object.freeze([
    'an atmospheric dispersion model (no plume, no wind field — the environment domain models rainfall runoff only)',
    'source-term characterisation for the release',
    'exposure and toxicological dose-response data',
  ])),
  WATER_CONTAMINATION: notModelled(Object.freeze([
    'contaminant transport and fate in the water network (the hydraulics model solves flow and head loss, not water quality)',
    'a dose-response relationship for the contaminant',
  ])),
  INFRASTRUCTURE_FAILURE: notModelled(Object.freeze([
    'a network topology and interdependency model — the reference city has a handful of declared edges, not an infrastructure network',
    'component reliability and failure-propagation data',
    'NOTE: one specific failure IS real — a pump trip on real computed head loss, with its downstream cascade. That is a modelled scenario, not a general infrastructure-failure capability.',
  ])),
  AVIATION_INCIDENT: notModelled(noHazardModel('flight dynamics and incident')),
  EXPLOSION_CONSEQUENCE: notModelled(Object.freeze([
    'a blast overpressure and impulse model',
    'structural and human vulnerability relationships for blast, which would also need the structural model that does not exist',
    'NOTE: Genesis models consequences to people and infrastructure. It does not model weapon design or yield optimisation, and that boundary is architectural.',
  ])),
  RADIOLOGICAL_CONTAMINATION: notModelled(Object.freeze([
    'a radionuclide transport and deposition model',
    'a dosimetry model relating deposition to dose',
    'NOTE: consequence modelling only; device design is out of scope by architecture, not by omission.',
  ])),
  COMMUNICATIONS_DISRUPTION: notModelled(Object.freeze([
    'a communications network topology and traffic model',
    'a service-degradation relationship for the population that depends on it',
  ])),
});

/** The honest answer for any scenario the system can recognise. Never undefined for a valid kind. */
export function solverCapabilityFor(kind: ScenarioKind): SolverCapability {
  return SOLVER_CAPABILITY_BY_SCENARIO_KIND[kind];
}

export function isModelled(kind: ScenarioKind): boolean {
  return solverCapabilityFor(kind).capability === CAPABILITY_CODE.MODELLED;
}

/**
 * A one-line, user-facing statement of what Genesis can and cannot do for this
 * request. Written so it can be shown verbatim: a refusal that names the gap is
 * more useful than an approximation that hides it.
 */
export function describeCapability(kind: ScenarioKind): string {
  const capability = solverCapabilityFor(kind);
  switch (capability.capability) {
    case CAPABILITY_CODE.MODELLED:
      return `${kind}: modelled by ${capability.solverId}.`;
    case CAPABILITY_CODE.PARTIALLY_MODELLED:
      return `${kind}: partially modelled${capability.solverId ? ` by ${capability.solverId}` : ''}. ${capability.caveat}`;
    default:
      return `${kind}: NOT MODELLED. Genesis would need: ${(capability.missing ?? []).join('; ')}.`;
  }
}

/** The gaps, listed directly, so a caller can show them without walking every kind. */
export const NOT_MODELLED_SCENARIO_KINDS: readonly ScenarioKind[] = Object.freeze(
  (Object.keys(SOLVER_CAPABILITY_BY_SCENARIO_KIND) as ScenarioKind[])
    .filter((kind) => SOLVER_CAPABILITY_BY_SCENARIO_KIND[kind].capability === CAPABILITY_CODE.NOT_MODELLED)
    .sort(),
);
