import { deterministicEventId, GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from '../../events/genesisEvent';
import { canonicalJson, fnv1a } from '../../events/hash';
import type { Observation } from '../../world/scientificWorldState';
import type { DomainSolver, SolverResult } from './solverRouter';

/**
 * SPECIALIST SOLVER ADAPTERS (Work Item 6).
 *
 * Per-tick `DomainSolver`s registrable on the canonical `SolverRouter`
 * (`solverRouter.ts`, unmodified logic — only new solver values added here).
 * State/parameters live in `entity.domainState` (the ECS's own documented
 * escape hatch for "real solver output that does not fit the fixed physical
 * components", see `worldModel/ecs/types.ts::WorldModelEntity.domainState`)
 * — no new ECS component was added or needed.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT ADD, AND WHY (first-inspect-existing-
 * solvers finding, before writing anything):
 *  - SEIR: `worldModel/domains/epidemicSEIR.ts::EPIDEMIC_SEIR_SOLVER_ID`
 *    ('epidemic-seir-rk4') already wraps the real RK4 SIR/SEIR engine
 *    (`core/epidemic/sir.ts`) as a registrable `DomainSolver`. Adding a
 *    second one here would be exactly the duplicate architecture this
 *    integration exists to avoid.
 *  - 1D diffusion: every existing `DomainSolver` in this repo (kinematics,
 *    hydraulic friction, all 21 files under `worldModel/domains/`) advances
 *    ONE entity from its own state — none reach across `ctx.graph` to couple
 *    neighboring entities. A real 1D diffusion step needs exactly that
 *    (a concentration field split across spatially adjacent entities), which
 *    would introduce a new cross-entity coupling convention this integration
 *    was not asked to design and no existing solver establishes. Left out
 *    rather than forced into a single-entity shape it does not fit.
 *  - Exponential decay: multiple existing domains already model a decay term
 *    for a SPECIFIC real phenomenon (radioactive/thermal/chemical — see
 *    `particlePhysics.ts`, `fireThermal.ts`, `chemistryKinetics.ts`). A
 *    generic, phenomenon-agnostic decay solver risks being read as competing
 *    with one of those rather than filling a real gap, so it is left out;
 *    logistic growth below has no existing generic equivalent (only an
 *    internal density-dependent term inside `cellCycle.ts`'s own compartmental
 *    model, not a reusable standalone solver), which is why it is the one
 *    addition here.
 *  - Newtonian kinematics: already `newtonianKinematicsSolver` in
 *    `solverRouter.ts`. Reused as-is, not reimplemented.
 */

export const SPECIALIST_SOLVERS_VERSION = '1.0.0';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// --- Logistic population growth --------------------------------------------------------------

export const LOGISTIC_GROWTH_SOLVER_ID = 'specialist-logistic-growth-closed-form';
export const LOGISTIC_GROWTH_DOMAIN_ID = 'population-dynamics';

export interface LogisticGrowthParams {
  /** Intrinsic growth rate r (1/time). May be negative to model decline toward 0. */
  readonly growthRate: number;
  /** Carrying capacity K (population units). Must be finite and > 0. */
  readonly carryingCapacity: number;
}

export const DEFAULT_LOGISTIC_GROWTH_PARAMS: LogisticGrowthParams = { growthRate: 0.5, carryingCapacity: 1000 };

/**
 * Exact closed-form logistic step (not RK4): dP/dt = r·P·(1 - P/K) is autonomous, so its
 * closed-form solution can be re-applied from ANY current population `p0` over an elapsed
 * `dt` as if `p0` were the t=0 condition — this is mathematically exact, not an
 * approximation of the ODE (verified: r=0 leaves `p0` unchanged; p0>K correctly decays
 * back toward K; p0<=0 stays extinct). The MODEL itself (logistic growth) is still a real,
 * deliberate simplification of actual population dynamics, so this is disclosed as
 * `MODEL_ESTIMATE`, the same classification `epidemicSEIR.ts` uses for its own
 * exactly-integrated-but-still-a-model compartmental solver — exact arithmetic does not
 * imply an exact model of reality.
 */
export function logisticGrowthStep(p0: number, params: LogisticGrowthParams, dt: number): number {
  if (p0 <= 0) return 0;
  const { growthRate: r, carryingCapacity: k } = params;
  if (k <= 0) return p0;
  const ratio = (k - p0) / p0;
  const denominator = 1 + ratio * Math.exp(-r * dt);
  if (denominator <= 0) return k;
  return k / denominator;
}

function effectiveLogisticParams(base: LogisticGrowthParams, state: Record<string, number> | undefined): LogisticGrowthParams {
  if (!state) return base;
  const growthRate = isFiniteNumber(state.growthRate) ? state.growthRate : base.growthRate;
  const carryingCapacity = isFiniteNumber(state.carryingCapacity) ? state.carryingCapacity : base.carryingCapacity;
  return { growthRate, carryingCapacity };
}

/** One reusable solver bound to base params — each entity may override `growthRate`/`carryingCapacity` via its own `domainState`, same override convention as `epidemicSEIR.ts`. */
export function makeLogisticGrowthSolver(baseParams: LogisticGrowthParams = DEFAULT_LOGISTIC_GROWTH_PARAMS): DomainSolver {
  return (entity, ctx): SolverResult => {
    const state = entity.domainState;
    const population = state?.population;
    if (!isFiniteNumber(population) || population < 0) {
      // No valid population state to advance: a no-op, not an invented value. Matches the
      // established convention (`newtonianKinematicsSolver`, `makeHydraulicFrictionSolver`)
      // of returning an empty patch at this solver's own grounding level rather than
      // fabricating output from missing input.
      return { patch: {}, grounding: 'MODEL_ESTIMATE' };
    }
    const params = effectiveLogisticParams(baseParams, state);
    if (!isFiniteNumber(params.growthRate) || !isFiniteNumber(params.carryingCapacity) || params.carryingCapacity <= 0) {
      return { patch: {}, grounding: 'MODEL_ESTIMATE' };
    }
    const t = isFiniteNumber(state?.t) ? state!.t : 0;
    const dt = ctx.dt;
    const nextPopulation = Math.max(0, logisticGrowthStep(population, params, dt));
    const nextT = t + dt;
    const paramsHash = fnv1a(canonicalJson({ params, t, dt, entityId: entity.id }));

    const observation: Observation = {
      observationId: `logistic-obs:${entity.id}:${ctx.tick}`,
      tick: ctx.tick,
      statement: `${entity.label}: t=${nextT.toFixed(2)} population=${nextPopulation.toFixed(2)} (r=${params.growthRate}, K=${params.carryingCapacity})`,
      measurements: [
        { key: 'population', value: nextPopulation, tick: ctx.tick, entity: entity.ref, provenance: [`${LOGISTIC_GROWTH_SOLVER_ID}#logisticGrowthStep`] },
        { key: 'growthRate', value: params.growthRate, tick: ctx.tick, entity: entity.ref, provenance: [`${LOGISTIC_GROWTH_SOLVER_ID}#params`] },
        { key: 'carryingCapacity', value: params.carryingCapacity, tick: ctx.tick, entity: entity.ref, provenance: [`${LOGISTIC_GROWTH_SOLVER_ID}#params`] },
      ],
      provenance: [LOGISTIC_GROWTH_SOLVER_ID],
    };

    const eventParameters = { population: nextPopulation, t: nextT, growthRate: params.growthRate, carryingCapacity: params.carryingCapacity };
    const event: GenesisEvent = {
      contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
      id: deterministicEventId('logistic-evt', entity.id, ctx.tick, eventParameters),
      type: 'population.logistic.step',
      timestamp: ctx.tick,
      source: entity.ref,
      affectedEntities: [entity.ref],
      cause: 'closed-form-logistic-step',
      parameters: eventParameters,
      provenance: { origin: 'model', modelId: LOGISTIC_GROWTH_SOLVER_ID, paramsHash },
    };

    return {
      patch: {
        domainState: { ...state, population: nextPopulation, t: nextT, growthRate: params.growthRate, carryingCapacity: params.carryingCapacity },
        statusLabel: `population=${nextPopulation.toFixed(0)} (t=${nextT.toFixed(1)})`,
      },
      grounding: 'MODEL_ESTIMATE',
      observation,
      event,
    };
  };
}

export const logisticGrowthSolver = makeLogisticGrowthSolver();
