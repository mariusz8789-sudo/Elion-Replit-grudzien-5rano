import { deterministicEventId, GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from '../../events/genesisEvent';
import { canonicalJson, fnv1a } from '../../events/hash';
import { SCHWARZSCHILD_CRITICAL_IMPACT, stepSchwarzschildGeodesic } from '../../physics';
import type { Observation } from '../../world/scientificWorldState';
import { entityId, type EntityId, type WorldModelEntity } from '../ecs/types';
import { WorldGraph } from '../ecs/worldGraph';
import type { DomainSolver, SolverResult } from '../solvers/solverRouter';

/**
 * SIXTH REAL SCIENTIFIC WORLD: general relativity (null geodesics around a
 * Schwarzschild black hole).
 *
 * Wraps the existing, tested integrator in `core/physics.ts`
 * (`stepSchwarzschildGeodesic`, the exact null-orbit equation
 * d²u/dφ² = −u + (3/2)·r_s·u² integrated with RK4) — the same physics
 * `labs/experiments/einstein-geodesics.ts` and the 3D black-hole scene
 * already run. Nothing here re-implements relativity; this file is the ECS
 * adapter, exactly as `quantumTunneling.ts` adapts the tunnelling runner.
 *
 * WHY AN INCREMENTAL PER-TICK STEP HERE, UNLIKE QUANTUM:
 * Phase 2 had to use a bounded whole-scenario call because the tunnelling
 * solver's state is a 512-point complex wavefunction, which cannot live in
 * `domainState` or survive a fork. This domain is the opposite case and gets
 * the better treatment: a null geodesic's entire state is THREE PLAIN
 * NUMBERS (u, du/dφ, φ), so it fits `domainState` natively, diffs into the
 * delta log, and forks correctly. `stepSchwarzschildGeodesic` is a pure
 * function of those numbers, so one RK4 step per tick is both replay-safe
 * and exactly what `graphics/SOLVER_DATA_CONTRACT.md` §D asks of a
 * trajectory: ONE FRAME PER SYNC, C3 owns time, no interpolation anywhere.
 *
 * UNITS — stated explicitly, as §B requires of any coordinate-producing solver:
 *  1. SOURCE UNIT: the reference integrator measures length in units where
 *     the Schwarzschild radius is `SCHWARZSCHILD_RADIUS_INTEGRATOR_UNITS`
 *     (26 — the Labs runner's own screen-pixel unit). Those exact values are
 *     reused rather than renormalised to r_s = 1, so this solver stays
 *     bit-identical with `runSchwarzschildGeodesicScenario`; its own test
 *     proves that rather than asserting it.
 *  2. CONVERSION APPLIED: positions are published in scene world units via
 *     `worldUnitsPerSchwarzschildRadius`, exposed as a scalar so the scaling
 *     is auditable instead of folded silently into the coordinates.
 *  3. ORIGIN: the black hole sits at the entity's parent origin; the photon's
 *     position is absolute in that space (Rule 1).
 *  4. HANDEDNESS: the scene's own right-handed Y-up. The orbit is equatorial,
 *     so y = 0 always and the motion is in the x/z plane.
 *
 * GROUNDING — `MODEL_ESTIMATE`, never `GROUNDED_EXACT`. The RK4 integration
 * of the exact null-orbit equation is accurate to numerical precision, but
 * the MODEL is an idealisation: a massless TEST PARTICLE in a fixed,
 * eternal, non-rotating vacuum metric, in geometric units, with no
 * self-gravity, no back-reaction on the spacetime, and no accretion
 * environment. The same tier `hydraulicsPumpPipe.ts` uses for a real model
 * of a simplified system.
 *
 * CROSS-DOMAIN COUPLING: **NOT_MODELLED — deliberately, and this is not an
 * omission to be filled in later without a real reason.** There is no
 * honest physical pathway between a photon orbiting a black hole and the
 * reference city's pumps, hospital or population, and inventing one (a
 * "gravitational effect on the water system", a decorative observatory that
 * reads the geodesic) would be exactly the fabricated coupling this
 * consolidation exists to prevent. This domain is therefore a correctly
 * registered, fully real, STANDALONE entity. A future coupling needs a real
 * mechanism first, not a hook.
 */
export const RELATIVITY_GEODESIC_SOLVER_ID = 'relativity-schwarzschild-null-geodesic-rk4';
export const RELATIVITY_DOMAIN_ID = 'general-relativity';

export const GEODESIC_STEP_EVENT_TYPE = 'relativity.geodesic.step';
export const GEODESIC_OUTCOME_EVENT_TYPE = 'relativity.geodesic.outcome';

/**
 * The reference integrator's own length unit and step, reused VERBATIM from
 * `labs/experiments/einstein-geodesics.ts` so this solver reproduces it
 * exactly. Changing either would still be physically valid (the orbit
 * equation is scale-covariant) but would silently break bit-identity with
 * the Labs runner, which is the property this domain's tests pin.
 */
export const SCHWARZSCHILD_RADIUS_INTEGRATOR_UNITS = 26;
export const GEODESIC_STEP_DPHI_RAD = 0.02;
/** Capture/escape cuts, identical to the reference runner's own. */
const CAPTURE_INVERSE_RADIUS = 1 / (SCHWARZSCHILD_RADIUS_INTEGRATOR_UNITS * 1.01);
const ESCAPE_INVERSE_RADIUS = 1 / (SCHWARZSCHILD_RADIUS_INTEGRATOR_UNITS * 44);
/** Launch radius of the incoming photon, in Schwarzschild radii — the reference runner's `RS * 40`. */
const LAUNCH_RADIUS_RS = 40;

/**
 * Discrete outcome as a NUMBER — `graphics/SOLVER_DATA_CONTRACT.md` Rule 3:
 * "C3 MAY additionally ship a discrete code as a number ... This is the
 * cleanest option and SHOULD be preferred for any domain with genuinely
 * discrete modes." Published as `outcomeCode` in `domainState`, which
 * reaches C2 verbatim in `scalars`, so an adapter never has to parse a
 * label. The token allowlist below is the human-readable companion.
 */
export const GEODESIC_OUTCOME_CODE = { IN_FLIGHT: 0, CAPTURED: 1, ESCAPED: 2 } as const;
export const GEODESIC_OUTCOME_STATES = ['GEODESIC_IN_FLIGHT', 'GEODESIC_CAPTURED', 'GEODESIC_ESCAPED'] as const;
export type GeodesicOutcomeState = (typeof GEODESIC_OUTCOME_STATES)[number];

const OUTCOME_BY_CODE: Readonly<Record<number, GeodesicOutcomeState>> = {
  [GEODESIC_OUTCOME_CODE.IN_FLIGHT]: 'GEODESIC_IN_FLIGHT',
  [GEODESIC_OUTCOME_CODE.CAPTURED]: 'GEODESIC_CAPTURED',
  [GEODESIC_OUTCOME_CODE.ESCAPED]: 'GEODESIC_ESCAPED',
};

/** Numeric scalar -> finite token. Pure and exported so the mapping is checkable without running the integrator. */
export function geodesicOutcomeLabel(outcomeCode: number): GeodesicOutcomeState {
  return OUTCOME_BY_CODE[outcomeCode] ?? 'GEODESIC_IN_FLIGHT';
}

export interface GeodesicPhotonDefaults {
  /** Impact parameter as a multiple of the critical b_c = (3√3/2)·r_s. Dimensionless. <1 is captured, >1 escapes. */
  impactParameterRatio: number;
  /** Integrator state: u = 1/r, in inverse integrator length units. Internal, but persisted so a tick can continue the orbit. */
  inverseRadius: number;
  /** Integrator state: du/dφ, same units as `inverseRadius`. */
  inverseRadiusDerivative: number;
  /** Azimuth φ, radians. */
  azimuthRad: number;
  /** Current orbital radius in SCHWARZSCHILD RADII (dimensionless) — the physically meaningful, auditable form of `inverseRadius`. */
  radiusRs: number;
  /** Smallest radius reached so far, in Schwarzschild radii. */
  minRadiusRs: number;
  /** Total winding around the hole so far, in full turns (dimensionless). */
  turns: number;
  /** Impact parameter itself, in Schwarzschild radii. */
  impactParameterRs: number;
  /** Steps integrated so far (count, dimensionless). */
  stepsIntegrated: number;
  /** Discrete outcome, see GEODESIC_OUTCOME_CODE. */
  outcomeCode: number;
  /** Scene world units per Schwarzschild radius — the conversion behind `spatial.position`, exposed so it is auditable (§B item 2). */
  worldUnitsPerSchwarzschildRadius: number;
}

/** Critical impact parameter in Schwarzschild radii, b_c/r_s = 3√3/2 ≈ 2.598 — the photon-capture boundary. Re-exported from the shared physics module, not re-derived. */
export const CRITICAL_IMPACT_PARAMETER_RS = SCHWARZSCHILD_CRITICAL_IMPACT;

export const GEODESIC_PHOTON_DEFAULTS: GeodesicPhotonDefaults = {
  impactParameterRatio: 1.1,
  inverseRadius: 0,
  inverseRadiusDerivative: 0,
  azimuthRad: 0,
  radiusRs: LAUNCH_RADIUS_RS,
  minRadiusRs: LAUNCH_RADIUS_RS,
  turns: 0,
  impactParameterRs: CRITICAL_IMPACT_PARAMETER_RS * 1.1,
  stepsIntegrated: 0,
  outcomeCode: GEODESIC_OUTCOME_CODE.IN_FLIGHT,
  worldUnitsPerSchwarzschildRadius: 0.5,
};

/**
 * The reference runner's own launch condition, factored out so both the
 * entity builder and a re-launch after an intervention produce identical
 * initial conditions.
 */
export function launchGeodesicState(impactParameterRatio: number): { inverseRadius: number; inverseRadiusDerivative: number; azimuthRad: number; impactParameterRs: number } {
  const criticalImpact = CRITICAL_IMPACT_PARAMETER_RS * SCHWARZSCHILD_RADIUS_INTEGRATOR_UNITS;
  const b = criticalImpact * impactParameterRatio;
  const r0 = SCHWARZSCHILD_RADIUS_INTEGRATOR_UNITS * LAUNCH_RADIUS_RS;
  const azimuthRad = Math.PI - Math.asin(Math.min(1, b / r0));
  return {
    inverseRadius: Math.sin(azimuthRad) / b,
    inverseRadiusDerivative: Math.cos(azimuthRad) / b,
    azimuthRad,
    impactParameterRs: b / SCHWARZSCHILD_RADIUS_INTEGRATOR_UNITS,
  };
}


/**
 * One RK4 step of the real null-geodesic equation per tick. A photon that
 * has already been captured or escaped is FROZEN: its orbit is over, and
 * continuing to integrate past the horizon (or out to infinity) would be
 * publishing coordinates for a trajectory the model no longer describes.
 */
export function makeRelativityGeodesicSolver(): DomainSolver {
  return (entity, ctx): SolverResult => {
    const state = { ...GEODESIC_PHOTON_DEFAULTS, ...(entity.domainState as Partial<GeodesicPhotonDefaults> | undefined) };

    if (state.outcomeCode !== GEODESIC_OUTCOME_CODE.IN_FLIGHT) {
      // Settled: republish the same state (positions must still be supplied every frame, Rule 1)
      // without inventing further integration.
      return { patch: { domainState: { ...state }, statusLabel: geodesicOutcomeLabel(state.outcomeCode) }, grounding: 'MODEL_ESTIMATE' };
    }

    const stepped = stepSchwarzschildGeodesic(state.inverseRadius, state.inverseRadiusDerivative, -GEODESIC_STEP_DPHI_RAD, SCHWARZSCHILD_RADIUS_INTEGRATOR_UNITS);
    const azimuthRad = state.azimuthRad - GEODESIC_STEP_DPHI_RAD;
    const radiusIntegratorUnits = 1 / stepped.u;
    const radiusRs = radiusIntegratorUnits / SCHWARZSCHILD_RADIUS_INTEGRATOR_UNITS;

    // The reference runner's own capture/escape cuts, in the same order.
    let outcomeCode: number = GEODESIC_OUTCOME_CODE.IN_FLIGHT;
    if (stepped.u > CAPTURE_INVERSE_RADIUS) outcomeCode = GEODESIC_OUTCOME_CODE.CAPTURED;
    else if (stepped.u <= ESCAPE_INVERSE_RADIUS) outcomeCode = GEODESIC_OUTCOME_CODE.ESCAPED;

    const launchAzimuth = launchGeodesicState(state.impactParameterRatio).azimuthRad;
    const next: GeodesicPhotonDefaults = {
      ...state,
      inverseRadius: stepped.u,
      inverseRadiusDerivative: stepped.du,
      azimuthRad,
      radiusRs,
      minRadiusRs: Math.min(state.minRadiusRs, radiusRs),
      turns: Math.abs(azimuthRad - launchAzimuth) / (2 * Math.PI),
      stepsIntegrated: state.stepsIntegrated + 1,
      outcomeCode,
    };

    // Equatorial orbit: y = 0 by construction, motion in the scene's x/z plane. Absolute position
    // in the parent's space, republished every tick (Rule 1) and converted from Schwarzschild radii
    // through the auditable `worldUnitsPerSchwarzschildRadius` factor (Rule 2 / §B).
    const worldRadius = radiusRs * state.worldUnitsPerSchwarzschildRadius;
    const position = { x: worldRadius * Math.cos(azimuthRad), y: 0, z: worldRadius * Math.sin(azimuthRad) };

    const observation: Observation = {
      observationId: `geo-obs:${entity.id}:${ctx.tick}`,
      tick: ctx.tick,
      statement: `${entity.label}: r=${radiusRs.toFixed(3)} r_s, φ=${azimuthRad.toFixed(3)} rad, b=${state.impactParameterRs.toFixed(3)} r_s (${geodesicOutcomeLabel(outcomeCode)})`,
      measurements: [
        { key: 'radiusRs', value: radiusRs, tick: ctx.tick, entity: entity.ref, provenance: ['core/physics.ts#stepSchwarzschildGeodesic', 'schwarzschild-null-geodesic-rk4'] },
        { key: 'minRadiusRs', value: next.minRadiusRs, tick: ctx.tick, entity: entity.ref, provenance: ['core/physics.ts#stepSchwarzschildGeodesic'] },
        { key: 'turns', value: next.turns, tick: ctx.tick, entity: entity.ref, provenance: ['core/physics.ts#stepSchwarzschildGeodesic'] },
      ],
      provenance: ['core/physics.ts', 'schwarzschild-null-geodesic', `test-particle-geometric-units-rs:${SCHWARZSCHILD_RADIUS_INTEGRATOR_UNITS}`],
    };

    const eventParameters = { ...next };
    const stepEvent: GenesisEvent = {
      contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
      id: deterministicEventId('geo-evt', entity.id, ctx.tick, eventParameters),
      type: GEODESIC_STEP_EVENT_TYPE,
      timestamp: ctx.tick,
      source: entity.ref,
      affectedEntities: [entity.ref],
      cause: 'null-geodesic-rk4-step',
      parameters: eventParameters,
      provenance: { origin: 'model', modelId: RELATIVITY_GEODESIC_SOLVER_ID, paramsHash: fnv1a(canonicalJson({ impactParameterRatio: state.impactParameterRatio, entityId: entity.id })) },
    };

    const patch = { spatial: { ...entity.spatial, position }, domainState: { ...next }, statusLabel: geodesicOutcomeLabel(outcomeCode) };

    if (outcomeCode !== GEODESIC_OUTCOME_CODE.IN_FLIGHT) {
      return {
        patch,
        grounding: 'MODEL_ESTIMATE',
        observation,
        event: {
          ...stepEvent,
          id: `${stepEvent.id}:outcome`,
          type: GEODESIC_OUTCOME_EVENT_TYPE,
          cause: outcomeCode === GEODESIC_OUTCOME_CODE.CAPTURED ? 'crossed-capture-radius' : 'reached-escape-radius',
          parentEventId: stepEvent.id,
          provenance: { origin: 'model', modelId: RELATIVITY_GEODESIC_SOLVER_ID, notes: `outcome: ${geodesicOutcomeLabel(outcomeCode)} after ${next.stepsIntegrated} RK4 steps` },
        },
      };
    }

    return { patch, grounding: 'MODEL_ESTIMATE', observation, event: stepEvent };
  };
}

export interface AddGeodesicPhotonOptions {
  photonId?: string;
  label?: string;
  parentEntityId?: EntityId;
  impactParameterRatio?: number;
  worldUnitsPerSchwarzschildRadius?: number;
}

/**
 * Adds a photon on a null geodesic, launched exactly as the reference
 * runner launches it.
 *
 * KNOWN GAP, stated rather than papered over: `scale.level` is `PLANET`
 * because `ScaleDomain` has no astrophysical tier, and `PLANET` is its
 * coarsest. A photon orbiting a black hole is not planet-scale in any
 * honest sense. `SOLVER_DATA_CONTRACT.md` Rule 6 requires `scale.level` be
 * truthful and its Phase 2 checklist anticipates exactly this ("or a new
 * level if none fits"); adding an enum member ripples through
 * `SCALE_DOMAIN_ORDER`, validation and the scale-boundary tests, so it is
 * left for a deliberate contract change rather than smuggled in here.
 */
export function addGeodesicPhoton(graph: WorldGraph, options: AddGeodesicPhotonOptions = {}): EntityId {
  const ref = { kind: 'geodesic-photon', id: options.photonId ?? 'photon-1' };
  const impactParameterRatio = options.impactParameterRatio ?? GEODESIC_PHOTON_DEFAULTS.impactParameterRatio;
  const launch = launchGeodesicState(impactParameterRatio);
  const worldUnitsPerSchwarzschildRadius = options.worldUnitsPerSchwarzschildRadius ?? GEODESIC_PHOTON_DEFAULTS.worldUnitsPerSchwarzschildRadius;
  const radiusRs = 1 / launch.inverseRadius / SCHWARZSCHILD_RADIUS_INTEGRATOR_UNITS;
  const worldRadius = radiusRs * worldUnitsPerSchwarzschildRadius;

  const entity: WorldModelEntity = {
    id: entityId(ref),
    ref,
    label: options.label ?? 'Photon (null geodesic)',
    scale: { level: 'PLANET', parentEntityId: options.parentEntityId },
    // A real launch position, never an implicit origin (Rule 1's hazard).
    spatial: { position: { x: worldRadius * Math.cos(launch.azimuthRad), y: 0, z: worldRadius * Math.sin(launch.azimuthRad) } },
    domainState: {
      ...GEODESIC_PHOTON_DEFAULTS,
      impactParameterRatio,
      inverseRadius: launch.inverseRadius,
      inverseRadiusDerivative: launch.inverseRadiusDerivative,
      azimuthRad: launch.azimuthRad,
      impactParameterRs: launch.impactParameterRs,
      radiusRs,
      minRadiusRs: radiusRs,
      worldUnitsPerSchwarzschildRadius,
    },
    domainBinding: { solverId: RELATIVITY_GEODESIC_SOLVER_ID, domainId: RELATIVITY_DOMAIN_ID },
    grounding: 'MODEL_ESTIMATE',
    updatedAtTick: 0,
  };
  graph.addEntity(entity);
  return entity.id;
}

export interface SchwarzschildWorld {
  graph: WorldGraph;
  blackHoleId: EntityId;
  photonIds: readonly EntityId[];
}

/**
 * Standalone reference world: one black hole and N photons on their own
 * null geodesics. Standalone precisely BECAUSE there is no honest coupling
 * to the reference city (see the module doc) — a correctly registered real
 * domain with no invented links is the honest shape here.
 */
export function buildSchwarzschildGeodesicWorld(impactParameterRatios: readonly number[] = [0.9, 1.1, 1.6]): SchwarzschildWorld {
  const graph = new WorldGraph();
  const blackHoleRef = { kind: 'black-hole', id: 'schwarzschild-1' };
  const blackHole: WorldModelEntity = {
    id: entityId(blackHoleRef),
    ref: blackHoleRef,
    label: 'Schwarzschild Black Hole',
    scale: { level: 'PLANET' },
    spatial: { position: { x: 0, y: 0, z: 0 } },
    // The horizon and photon-sphere radii are exact consequences of the metric, in Schwarzschild
    // radii — real, dimensionless numbers, not a state any solver advances.
    domainState: { horizonRadiusRs: 1, photonSphereRadiusRs: 1.5, criticalImpactParameterRs: CRITICAL_IMPACT_PARAMETER_RS },
    // No solver advances the hole itself; it is a static background geometry, so it is honestly
    // ungrounded rather than pretending to be a modelled dynamic body.
    grounding: 'UNGROUNDED_APPROXIMATION',
    updatedAtTick: 0,
  };
  graph.addEntity(blackHole);

  // Stable, deterministic id order (Rule 4): index-keyed, never re-sorted.
  const photonIds = impactParameterRatios.map((impactParameterRatio, index) =>
    addGeodesicPhoton(graph, { photonId: `photon-${index + 1}`, parentEntityId: blackHole.id, impactParameterRatio }),
  );
  return { graph, blackHoleId: blackHole.id, photonIds };
}
