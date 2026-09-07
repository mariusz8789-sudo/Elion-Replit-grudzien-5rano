import type { ScenarioKind } from '../../lookingGlass/scenarioRequest';
import { CHEMISTRY_KINETICS_SOLVER_ID } from '../domains/chemistryKinetics';
import { ELECTRICAL_GENERATOR_SOLVER_ID } from '../domains/electricalGenerator';
import { EPIDEMIC_SEIR_SOLVER_ID } from '../domains/epidemicSEIR';
import { HYDRAULICS_PUMP_PIPE_SOLVER_ID } from '../domains/hydraulicsPumpPipe';
import { MOLECULAR_STRUCTURE_SOLVER_ID } from '../domains/molecularStructure';
import { QUANTUM_TUNNELING_SOLVER_ID } from '../domains/quantumTunneling';
import { RAINFALL_RUNOFF_SOLVER_ID } from '../domains/rainfallRunoff';
import { SEISMIC_SOURCE_SOLVER_ID } from '../domains/seismicShaking';

/**
 * PHASE 7 — SOLVER CAPABILITY REGISTRY.
 *
 * The phase was scoped as fire/thermal and traffic/mobility. A full-repository
 * audit found **neither exists**, and that finding is the deliverable:
 *
 * - **Fire / thermal: NOT_MODELLED.** There is no combustion model, no flame
 *   spread, no heat-transfer solver, no pyrolysis, no smoke transport anywhere
 *   in either package. The only matches for "heat" are a canvas gradient in a
 *   tokamak visual and the word appearing in prose. Nothing was built here,
 *   because building a fire model was not in scope and faking one is worse
 *   than admitting the gap.
 * - **Traffic flow: NOT_MODELLED.** No fundamental diagram, no car-following,
 *   no capacity or congestion, no network assignment. `core/agents/cityAgent.ts`
 *   does move agents, but `stepMovement` is constant-speed straight-line travel
 *   toward a goal with **no interaction between agents at all** — that is
 *   kinematics feeding the epidemic contact model, not traffic. It also lives
 *   inside `epidemicCity`'s own simulation loop over a `CityLayout` that is not
 *   a C3 world, so re-hosting it here would mean a second simulation engine
 *   beside the one this architecture exists to keep singular.
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

const NO_FIRE_MODEL: readonly string[] = Object.freeze([
  'a combustion or flame-spread model (ignition, heat release rate, spread rate) — none exists in either package',
  'heat transfer (conduction, convection, radiation) — no solver, and no thermal material properties on any entity',
  'a fuel/material inventory to burn, and smoke or toxic-product transport',
  'fire-resistance and structural-response-to-fire data, which would also need the structural model that does not exist either',
]);

const NO_TRAFFIC_MODEL: readonly string[] = Object.freeze([
  'a traffic-flow relationship (fundamental diagram, or a car-following/cell-transmission model) — agents in cityAgent.ts do not interact at all',
  'road capacity, saturation flow and intersection control on the road-network geometry that does exist',
  'origin-destination demand and a route-choice or assignment model',
  'calibration against real counts or probe data before any congestion or travel-time claim',
]);

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
    solverId: RAINFALL_RUNOFF_SOLVER_ID,
    caveat: 'Rainfall to peak stormwater runoff is real (rational method) and drives the real hydraulics model. Inundation itself is NOT modelled: no terrain, no depth, no flood extent, no hydrograph.',
  },
  EARTHQUAKE: {
    capability: CAPABILITY_CODE.PARTIALLY_MODELLED,
    solverId: SEISMIC_SOURCE_SOLVER_ID,
    caveat: 'Ground shaking is a synthetic, explicitly non-calibrated attenuation (not a GMPE). Structural damage, collapse and casualties are NOT modelled at all — see EARTHQUAKE_DAMAGE_REQUIRED_DATA.',
  },
  CHEMICAL_REACTION: {
    capability: CAPABILITY_CODE.PARTIALLY_MODELLED,
    solverId: MOLECULAR_STRUCTURE_SOLVER_ID,
    caveat: 'Real RDKit descriptors and a real force-field 3D conformer. Bonds are not forwarded to the renderer (no edge channel exists), and reaction dynamics beyond Arrhenius kinetics are not modelled.',
  },
  CELL_CULTURE: {
    capability: CAPABILITY_CODE.PARTIALLY_MODELLED,
    caveat: 'Exact closed-form logistic growth gives an unstructured population count only. No age structure, cell cycle, division mechanism, stochasticity, or any measured cell line.',
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

  // --- The two this phase was scoped around, and found absent ---------------
  WILDFIRE: notModelled(NO_FIRE_MODEL),
  INDUSTRIAL_FIRE: notModelled(NO_FIRE_MODEL),
  TRANSPORT_DISRUPTION: notModelled(NO_TRAFFIC_MODEL),
  EVACUATION: notModelled(Object.freeze([
    ...NO_TRAFFIC_MODEL,
    'an evacuation behaviour model (warning response, departure timing, destination choice under stress)',
  ])),

  // --- Everything else the classifier can recognise but nothing can answer --
  TSUNAMI: notModelled(noHazardModel('wave generation and inundation')),
  HURRICANE: notModelled(noHazardModel('tropical cyclone wind and storm surge')),
  TORNADO: notModelled(noHazardModel('tornado wind field')),
  LANDSLIDE: notModelled(noHazardModel('slope stability and runout')),
  VOLCANIC: notModelled(noHazardModel('eruption, ashfall and flow')),
  DROUGHT: notModelled(noHazardModel('water balance and drought index')),
  EXTREME_HEAT: notModelled(Object.freeze([
    'a heat-exposure model (no thermal solver exists anywhere — see the fire/thermal finding)',
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
