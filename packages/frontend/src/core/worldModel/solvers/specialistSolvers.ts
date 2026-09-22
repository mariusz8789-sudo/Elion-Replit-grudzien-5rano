import { deterministicEventId, GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from '../../events/genesisEvent';
import { canonicalJson, fnv1a } from '../../events/hash';
import type { Observation } from '../../world/scientificWorldState';
import type { DomainSolver, SolverResult } from './solverRouter';

/**
 * SPECIALIST SOLVER ADAPTERS (Work Item 6; 1D diffusion added during the
 * Universe Engine reference-package integration pass).
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
 *
 * 1D DIFFUSION — reconsidered and added below. A prior pass of this file
 * rejected it on the theory that it needs cross-entity coupling via
 * `ctx.graph`, which no existing solver establishes. That theory does not
 * hold: `epidemicSEIR.ts` already couples FOUR named quantities (S/E/I/R)
 * entirely WITHIN one entity's `domainState`, each tick, via RK4 — a
 * bounded 1D diffusion field is the same shape (N named scalar grid points
 * coupled by a local update rule), just with more named quantities (u0..u4)
 * and a simpler explicit-Euler update. No cross-entity coupling is needed
 * or added; `makeDiffusion1DSolver` below follows the exact same
 * single-entity, named-domainState-keys convention as `epidemicSEIR.ts`
 * and `makeLogisticGrowthSolver`.
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

// --- 1D diffusion (bounded, fixed 5-point grid, single entity) -------------------------------

export const DIFFUSION_1D_SOLVER_ID = 'specialist-diffusion-1d-explicit-fd';
export const DIFFUSION_1D_DOMAIN_ID = 'field-diffusion';
export const DIFFUSION_1D_GRID_SIZE = 5;
const DIFFUSION_1D_KEYS = ['u0', 'u1', 'u2', 'u3', 'u4'] as const;

export interface Diffusion1DParams {
  /** Diffusivity coefficient (length^2/time). Must be finite and >= 0. */
  readonly diffusivity: number;
  /** Grid spacing (length). Must be finite and > 0. */
  readonly dx: number;
}

export const DEFAULT_DIFFUSION_1D_PARAMS: Diffusion1DParams = { diffusivity: 0.1, dx: 1 };

/**
 * One explicit-Euler finite-difference step over a FIXED 5-point grid (u0..u4). Boundary
 * points (u0, u4) are held fixed (Dirichlet), matching the reference algorithm this was
 * adapted from — only interior points (u1..u3) update. Throws on an unstable step
 * (alpha = diffusivity*dt/dx^2 > 0.5) rather than silently returning a numerically wrong
 * result — the same fail-loud convention the reference implementation used.
 */
export function diffusion1DStep(grid: readonly number[], params: Diffusion1DParams, dt: number): number[] {
  if (grid.length !== DIFFUSION_1D_GRID_SIZE) throw new Error(`diffusion1DStep: expected a ${DIFFUSION_1D_GRID_SIZE}-point grid, got ${grid.length}`);
  const alpha = (params.diffusivity * dt) / (params.dx * params.dx);
  if (alpha > 0.5) throw new Error(`diffusion1DStep: unstable explicit step (alpha=${alpha.toFixed(4)} > 0.5) — reduce dt or diffusivity, or increase dx`);
  const next = [...grid];
  for (let i = 1; i < grid.length - 1; i += 1) {
    next[i] = grid[i]! + alpha * (grid[i + 1]! - 2 * grid[i]! + grid[i - 1]!);
  }
  return next;
}

function readDiffusionGrid(state: Record<string, number> | undefined): number[] | null {
  if (!state) return null;
  const grid = DIFFUSION_1D_KEYS.map((key) => state[key]);
  if (!grid.every(isFiniteNumber)) return null;
  return grid as number[];
}

function effectiveDiffusionParams(base: Diffusion1DParams, state: Record<string, number> | undefined): Diffusion1DParams {
  if (!state) return base;
  const diffusivity = isFiniteNumber(state.diffusivity) ? state.diffusivity : base.diffusivity;
  const dx = isFiniteNumber(state.dx) ? state.dx : base.dx;
  return { diffusivity, dx };
}

/**
 * One reusable solver bound to base params. Each entity's grid lives in its own `domainState`
 * under keys `u0`..`u4`; `diffusivity`/`dx` may be overridden per-entity, same convention as
 * `makeLogisticGrowthSolver`. A no-op (never a fabricated value) when the grid is missing/
 * invalid, when params are invalid, or when the requested step would be numerically unstable —
 * an unstable step is reported as UNGROUNDED_APPROXIMATION rather than thrown from inside a
 * tick loop (the pure `diffusion1DStep` above still throws for direct callers).
 */
export function makeDiffusion1DSolver(baseParams: Diffusion1DParams = DEFAULT_DIFFUSION_1D_PARAMS): DomainSolver {
  return (entity, ctx): SolverResult => {
    const state = entity.domainState;
    const grid = readDiffusionGrid(state);
    if (!grid) return { patch: {}, grounding: 'MODEL_ESTIMATE' };
    const params = effectiveDiffusionParams(baseParams, state);
    if (!isFiniteNumber(params.diffusivity) || params.diffusivity < 0 || !isFiniteNumber(params.dx) || params.dx <= 0) {
      return { patch: {}, grounding: 'MODEL_ESTIMATE' };
    }
    const dt = ctx.dt;
    const alpha = (params.diffusivity * dt) / (params.dx * params.dx);
    if (alpha > 0.5) {
      return {
        patch: { statusLabel: `diffusion step unstable (alpha=${alpha.toFixed(3)} > 0.5) — not advanced` },
        grounding: 'UNGROUNDED_APPROXIMATION',
      };
    }
    const nextGrid = diffusion1DStep(grid, params, dt);
    const nextState: Record<string, number> = { ...state, diffusivity: params.diffusivity, dx: params.dx };
    DIFFUSION_1D_KEYS.forEach((key, i) => { nextState[key] = nextGrid[i]!; });
    const paramsHash = fnv1a(canonicalJson({ params, grid, dt, entityId: entity.id }));

    const observation: Observation = {
      observationId: `diffusion1d-obs:${entity.id}:${ctx.tick}`,
      tick: ctx.tick,
      statement: `${entity.label}: grid=[${nextGrid.map((v) => v.toFixed(3)).join(', ')}] (D=${params.diffusivity}, dx=${params.dx})`,
      measurements: DIFFUSION_1D_KEYS.map((key, i) => ({
        key, value: nextGrid[i]!, tick: ctx.tick, entity: entity.ref, provenance: [`${DIFFUSION_1D_SOLVER_ID}#diffusion1DStep`],
      })),
      provenance: [DIFFUSION_1D_SOLVER_ID],
    };

    const eventParameters = { grid: nextGrid, diffusivity: params.diffusivity, dx: params.dx };
    const event: GenesisEvent = {
      contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
      id: deterministicEventId('diffusion1d-evt', entity.id, ctx.tick, eventParameters),
      type: 'field.diffusion1d.step',
      timestamp: ctx.tick,
      source: entity.ref,
      affectedEntities: [entity.ref],
      cause: 'explicit-fd-diffusion-step',
      parameters: eventParameters,
      provenance: { origin: 'model', modelId: DIFFUSION_1D_SOLVER_ID, paramsHash },
    };

    return {
      patch: { domainState: nextState, statusLabel: `diffusion grid=[${nextGrid.map((v) => v.toFixed(2)).join(', ')}]` },
      grounding: 'MODEL_ESTIMATE',
      observation,
      event,
    };
  };
}

export const diffusion1DSolver = makeDiffusion1DSolver();
