import { GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from '../../events/genesisEvent';
import type { Observation } from '../../world/scientificWorldState';
import { entityId, type EntityId, type WorldModelEntity } from '../ecs/types';
import type { WorldGraph } from '../ecs/worldGraph';
import type { DomainSolver, SolverResult } from '../solvers/solverRouter';

/**
 * PHASE 8.4 — CELL-CYCLE STRUCTURED POPULATION.
 *
 * Closes the two gaps `capability/solverCapability.ts` named for CELL_CULTURE:
 * "No age structure, cell cycle, division mechanism". The existing
 * `core/world/cellWorldAdapter.ts` is backed by the exact closed-form logistic
 * solution, which is a real model but an UNSTRUCTURED one — a single count with
 * no internal state, so it cannot say what fraction of a culture is
 * synthesising DNA, and its saturation is a phenomenological term rather than a
 * mechanism.
 *
 * ## What is real
 *
 * A standard **compartmental cell-cycle model**: cells occupy G1, S or G2/M and
 * progress through them, with mitosis turning one G2/M cell into two G1 cells.
 *
 * ```
 *   dG1/dt  = 2*kM*G2M - kG1*G1*inhibition - death*G1
 *   dS/dt   = kG1*G1*inhibition - kS*S     - death*S
 *   dG2M/dt = kS*S            - kM*G2M     - death*G2M
 * ```
 *
 * Two properties make this a mechanism rather than a curve fit:
 *
 * 1. **The factor of 2 is the division event.** Total population changes by
 *    `kM*G2M` per unit time — exactly one net new cell per mitosis — so growth
 *    is a consequence of cells completing the cycle, not a rate parameter.
 * 2. **Saturation is contact inhibition, applied where biology applies it.**
 *    The density term multiplies **G1 -> S entry only**, because that is where a
 *    confluent culture actually arrests: the G1/S restriction point. Cells
 *    already past it finish their cycle and divide. So a culture reaching
 *    confluence accumulates in G1 — which is what is observed — instead of every
 *    phase being scaled down uniformly, which is what a logistic term applied to
 *    the total would do.
 *
 * Integrated with **RK4** at the same order as the SEIR solver, so the phase
 * fractions are a real solution of the system rather than an Euler drift.
 *
 * ## Honesty
 *
 * Phase durations default to representative values for a generic proliferating
 * mammalian line (~24 h cycle: G1 ~11 h, S ~8 h, G2/M ~5 h). These are
 * **typical textbook values, not a measurement of any named cell line** — the
 * same tier as Phase 5's runoff coefficient, and the reason this reports
 * `MODEL_ESTIMATE` and never `GROUNDED_EXACT`. They are per-entity
 * `domainState`, so a caller with real flow-cytometry data can substitute it.
 *
 * ## Still NOT modelled
 *
 * - **Chronological age structure.** This is CELL-CYCLE-PHASE structure, which
 *   is not the same thing: it says where in the cycle a cell is, not how old it
 *   is. A true age-structured model is a PDE (McKendrick-von Foerster), not this.
 * - **Phase-duration variability.** Each compartment implies an exponential
 *   residence time, so a real culture's tighter, more Erlang-like phase
 *   distributions are not reproduced. Sub-staging each phase would fix this and
 *   is not done here.
 * - Gene expression, differentiation, spatial structure, nutrient depletion as
 *   an explicit resource, and any specific measured cell line. Death is a plain
 *   first-order rate and defaults to zero: a non-zero value is the caller's own
 *   datum, never something this module supplies.
 */
export const CELL_CYCLE_SOLVER_ID = 'cell-cycle-compartmental-rk4';
export const CELL_BIOLOGY_DOMAIN_ID = 'cell-biology';

/** Rule 3: the discrete state is a NUMBER. */
export const CULTURE_STATE_CODE = { GROWING: 0, CONFLUENT: 1, ARRESTED: 2, DECLINING: 3 } as const;

export const CULTURE_STATES = ['CULTURE_GROWING', 'CULTURE_CONFLUENT', 'CULTURE_ARRESTED', 'CULTURE_DECLINING'] as const;
export type CultureState = (typeof CULTURE_STATES)[number];

/** Confluence bands as a fraction of carrying capacity. Descriptive labels for display; they never enter the ODE. */
const CONFLUENT_FRACTION = 0.9;
const ARRESTED_FRACTION = 0.99;

export function cultureStateCode(occupancyFraction: number, netGrowthPerHour: number): number {
  if (!Number.isFinite(occupancyFraction)) return CULTURE_STATE_CODE.GROWING;
  if (netGrowthPerHour < 0) return CULTURE_STATE_CODE.DECLINING;
  if (occupancyFraction >= ARRESTED_FRACTION) return CULTURE_STATE_CODE.ARRESTED;
  if (occupancyFraction >= CONFLUENT_FRACTION) return CULTURE_STATE_CODE.CONFLUENT;
  return CULTURE_STATE_CODE.GROWING;
}

/** Total function: an out-of-range code still lands inside the allowlist. */
export function cultureStateLabel(code: number): CultureState {
  switch (code) {
    case CULTURE_STATE_CODE.CONFLUENT: return 'CULTURE_CONFLUENT';
    case CULTURE_STATE_CODE.ARRESTED: return 'CULTURE_ARRESTED';
    case CULTURE_STATE_CODE.DECLINING: return 'CULTURE_DECLINING';
    default: return 'CULTURE_GROWING';
  }
}

export interface CellCycleParams {
  /** Cells currently in G1 (including G0 arrest, which this model does not distinguish). */
  g1Cells: number;
  /** Cells synthesising DNA. */
  sCells: number;
  /** Cells in G2 or mitosis. */
  g2mCells: number;
  /** Mean residence time in each phase, hours. */
  g1DurationH: number;
  sDurationH: number;
  g2mDurationH: number;
  /** Contact-inhibition capacity, cells. G1 -> S entry stops as the culture approaches it. */
  carryingCapacityCells: number;
  /** First-order loss, per hour. Zero unless a caller supplies a real figure. */
  deathRatePerHour: number;
}

/**
 * A generic proliferating mammalian line with a ~24 h cycle. Representative
 * textbook values, NOT a measurement of any named line — see the module doc.
 */
export const CELL_CYCLE_DEFAULTS: CellCycleParams = {
  g1Cells: 1_000,
  sCells: 0,
  g2mCells: 0,
  g1DurationH: 11,
  sDurationH: 8,
  g2mDurationH: 5,
  carryingCapacityCells: 1_000_000,
  deathRatePerHour: 0,
};

interface Phases {
  g1: number;
  s: number;
  g2m: number;
}

/**
 * The derivative. `inhibition` is clamped into [0,1]: an over-capacity culture
 * stops admitting cells to S phase, it does not start pulling them backwards
 * out of it.
 */
function derivative(state: Phases, params: CellCycleParams): Phases {
  const kG1 = 1 / params.g1DurationH;
  const kS = 1 / params.sDurationH;
  const kM = 1 / params.g2mDurationH;
  const total = state.g1 + state.s + state.g2m;
  const inhibition = params.carryingCapacityCells > 0
    ? Math.min(1, Math.max(0, 1 - total / params.carryingCapacityCells))
    : 1;
  const entry = kG1 * state.g1 * inhibition;
  const death = params.deathRatePerHour;
  return {
    // The 2 is mitosis: one G2/M cell becomes two G1 cells.
    g1: 2 * kM * state.g2m - entry - death * state.g1,
    s: entry - kS * state.s - death * state.s,
    g2m: kS * state.s - kM * state.g2m - death * state.g2m,
  };
}

const add = (a: Phases, b: Phases, scale: number): Phases => ({ g1: a.g1 + b.g1 * scale, s: a.s + b.s * scale, g2m: a.g2m + b.g2m * scale });

/** Classical RK4 over the three compartments — same integration order as the SEIR solver. */
export function rk4CellCycleStep(state: Phases, params: CellCycleParams, dtHours: number): Phases {
  const k1 = derivative(state, params);
  const k2 = derivative(add(state, k1, dtHours / 2), params);
  const k3 = derivative(add(state, k2, dtHours / 2), params);
  const k4 = derivative(add(state, k3, dtHours), params);
  const next: Phases = {
    g1: state.g1 + (dtHours / 6) * (k1.g1 + 2 * k2.g1 + 2 * k3.g1 + k4.g1),
    s: state.s + (dtHours / 6) * (k1.s + 2 * k2.s + 2 * k3.s + k4.s),
    g2m: state.g2m + (dtHours / 6) * (k1.g2m + 2 * k2.g2m + 2 * k3.g2m + k4.g2m),
  };
  // A compartment can never hold a negative number of cells; a large dt could
  // otherwise overshoot one below zero and make the population meaningless.
  return { g1: Math.max(0, next.g1), s: Math.max(0, next.s), g2m: Math.max(0, next.g2m) };
}

let stepCounter = 0;

/**
 * One reusable solver. `dt` arrives in whatever unit the router supplies; this
 * domain works in HOURS, so a caller routes it a per-solver dt exactly as
 * epidemiology is routed days (`SolverRouter.routeTick`'s `dtBySolverId`).
 */
export function makeCellCycleSolver(): DomainSolver {
  return (entity, ctx): SolverResult => {
    const state = entity.domainState as Partial<CellCycleParams> | undefined;
    const params: CellCycleParams = { ...CELL_CYCLE_DEFAULTS, ...state };
    const before: Phases = { g1: params.g1Cells, s: params.sCells, g2m: params.g2mCells };
    const totalBefore = before.g1 + before.s + before.g2m;

    const after = rk4CellCycleStep(before, params, ctx.dt);
    const totalCells = after.g1 + after.s + after.g2m;
    const occupancyFraction = params.carryingCapacityCells > 0 ? totalCells / params.carryingCapacityCells : 0;
    // Per hour, so the label does not change meaning when the caller changes dt.
    const netGrowthPerHour = ctx.dt > 0 ? (totalCells - totalBefore) / ctx.dt : 0;
    const stateCode = cultureStateCode(occupancyFraction, netGrowthPerHour);
    // The fraction in S phase is what a real BrdU/EdU or flow-cytometry readout reports, and it is
    // the observable an unstructured logistic model simply cannot produce.
    const sPhaseFraction = totalCells > 0 ? after.s / totalCells : 0;
    stepCounter += 1;

    const observation: Observation = {
      observationId: `cell-obs:${entity.id}:${ctx.tick}`,
      tick: ctx.tick,
      statement: `${entity.label}: N=${totalCells.toFixed(0)} cells (G1 ${after.g1.toFixed(0)} / S ${after.s.toFixed(0)} / G2M ${after.g2m.toFixed(0)}), S-phase ${(sPhaseFraction * 100).toFixed(1)}%, ${cultureStateLabel(stateCode)}`,
      measurements: [
        { key: 'totalCells', value: totalCells, tick: ctx.tick, entity: entity.ref, provenance: ['domains/cellCycle.ts#rk4CellCycleStep'] },
        { key: 'sPhaseFraction', value: sPhaseFraction, tick: ctx.tick, entity: entity.ref, provenance: ['domains/cellCycle.ts#compartmental-cell-cycle'] },
      ],
      provenance: ['domains/cellCycle.ts', 'compartmental-cell-cycle-G1-S-G2M', 'rk4'],
    };

    const event: GenesisEvent = {
      contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
      id: `cell-evt:${entity.id}:${ctx.tick}:${stepCounter}`,
      type: 'biology.cellcycle.step',
      timestamp: ctx.tick,
      source: entity.ref,
      affectedEntities: [entity.ref],
      cause: 'rk4-cell-cycle-step',
      parameters: { ...params, g1Cells: after.g1, sCells: after.s, g2mCells: after.g2m, totalCells, sPhaseFraction, stateCode },
      provenance: {
        origin: 'model',
        modelId: CELL_CYCLE_SOLVER_ID,
        notes: 'G1/S/G2M compartments, mitosis as 1->2, contact inhibition applied at the G1/S restriction point. Phase durations are representative mammalian values, not a measured line. No chronological age structure, no phase-duration variability.',
      },
    };

    return {
      patch: {
        domainState: {
          ...params,
          g1Cells: after.g1,
          sCells: after.s,
          g2mCells: after.g2m,
          totalCells,
          sPhaseFraction,
          g1Fraction: totalCells > 0 ? after.g1 / totalCells : 0,
          g2mFraction: totalCells > 0 ? after.g2m / totalCells : 0,
          occupancyFraction,
          netGrowthPerHour,
          stateCode,
        },
        statusLabel: cultureStateLabel(stateCode),
      },
      // Real mechanism, real integration, representative rather than measured parameters.
      grounding: 'MODEL_ESTIMATE',
      observation,
      event,
    };
  };
}

export interface AddCellCultureOptions {
  cultureId?: string;
  label?: string;
  parentEntityId?: EntityId;
  params?: Partial<CellCycleParams>;
}

export function addCellCulture(graph: WorldGraph, options: AddCellCultureOptions = {}): EntityId {
  const ref = { kind: 'cell-culture', id: options.cultureId ?? 'culture-1' };
  const params: CellCycleParams = { ...CELL_CYCLE_DEFAULTS, ...options.params };
  const totalCells = params.g1Cells + params.sCells + params.g2mCells;
  const entity: WorldModelEntity = {
    id: entityId(ref),
    ref,
    label: options.label ?? 'Cell Culture',
    // Rule 6: ONE entity for the whole culture. A million cells are not resolved
    // individually and must never be rendered as a million placed objects.
    scale: { level: 'MESO_LAB', parentEntityId: options.parentEntityId },
    spatial: { position: { x: 0, y: 0, z: 0 } },
    domainState: {
      ...params,
      totalCells,
      sPhaseFraction: totalCells > 0 ? params.sCells / totalCells : 0,
      g1Fraction: totalCells > 0 ? params.g1Cells / totalCells : 0,
      g2mFraction: totalCells > 0 ? params.g2mCells / totalCells : 0,
      occupancyFraction: params.carryingCapacityCells > 0 ? totalCells / params.carryingCapacityCells : 0,
      netGrowthPerHour: 0,
      stateCode: CULTURE_STATE_CODE.GROWING,
    },
    domainBinding: { solverId: CELL_CYCLE_SOLVER_ID, domainId: CELL_BIOLOGY_DOMAIN_ID },
    statusLabel: cultureStateLabel(CULTURE_STATE_CODE.GROWING),
    grounding: 'MODEL_ESTIMATE',
    updatedAtTick: 0,
  };
  graph.addEntity(entity);
  return entity.id;
}
