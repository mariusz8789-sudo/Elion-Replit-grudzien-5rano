import { describe, expect, it } from 'vitest';
import { toGraphicsWorldFrame } from '../core/worldModel/bridge/graphicsWorldFrameAdapter';
import { getFrameState } from '../core/worldModel/bridge/worldFrameState';
import {
  addCellCulture,
  CELL_CYCLE_DEFAULTS,
  CELL_CYCLE_SOLVER_ID,
  CULTURE_STATE_CODE,
  CULTURE_STATES,
  cultureStateLabel,
  makeCellCycleSolver,
  rk4CellCycleStep,
  type CellCycleParams,
} from '../core/worldModel/domains/cellCycle';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * PHASE 8.4 — CELL-CYCLE STRUCTURED POPULATION.
 *
 * `solverCapability.ts` said CELL_CULTURE had "no age structure, cell cycle,
 * division mechanism". These tests check that the replacement is a real
 * mechanism — its characteristic behaviours are emergent, not written down —
 * and that what is still missing is stated rather than implied.
 */
const DT_HOURS = 0.5;

function culture(params: Partial<CellCycleParams> = {}) {
  const graph = new WorldGraph();
  const id = addCellCulture(graph, { params });
  const router = new SolverRouter();
  router.register(CELL_CYCLE_SOLVER_ID, makeCellCycleSolver());
  const engine = new TemporalEngine(graph);
  const advance = (hours: number) => {
    for (let i = 0; i < Math.round(hours / DT_HOURS); i++) engine.advance(DT_HOURS, (g, dt, tick) => router.routeTick(g, dt, tick));
  };
  const state = () => engine.graph.getEntity(id).domainState!;
  return { graph, id, engine, advance, state };
}

describe('Division is a mechanism, not a growth-rate parameter', () => {
  it('the population changes by exactly one net cell per mitosis', () => {
    // dN/dt should equal kM * G2M: one G2/M cell leaves and two G1 cells arrive.
    const params: CellCycleParams = { ...CELL_CYCLE_DEFAULTS, g1Cells: 0, sCells: 0, g2mCells: 1000, carryingCapacityCells: 1e12, deathRatePerHour: 0 };
    const dt = 0.001; // small enough that the derivative dominates
    const after = rk4CellCycleStep({ g1: 0, s: 0, g2m: 1000 }, params, dt);
    const gained = after.g1 + after.s + after.g2m - 1000;
    const expected = (1 / params.g2mDurationH) * 1000 * dt;
    // Relative, not absolute: `expected` is the first-order estimate, while RK4 integrates the
    // real system over the step, during which the G2/M pool is depleting. The small residual is
    // that depletion, not an error — it shrinks with dt, which the next assertion checks.
    expect(gained / expected).toBeCloseTo(1, 3);

    const finer = rk4CellCycleStep({ g1: 0, s: 0, g2m: 1000 }, params, dt / 10);
    const finerRatio = (finer.g1 + finer.s + finer.g2m - 1000) / (expected / 10);
    expect(Math.abs(1 - finerRatio)).toBeLessThan(Math.abs(1 - gained / expected));
  });

  it('with no cells there is no growth — nothing appears from nowhere', () => {
    const { advance, state } = culture({ g1Cells: 0, sCells: 0, g2mCells: 0 });
    advance(240);
    expect(state().totalCells).toBe(0);
  });

  it('a compartment never goes negative, even at an absurd step size', () => {
    const params: CellCycleParams = { ...CELL_CYCLE_DEFAULTS, g1Cells: 10, sCells: 10, g2mCells: 10, carryingCapacityCells: 1e12 };
    const after = rk4CellCycleStep({ g1: 10, s: 10, g2m: 10 }, params, 1000);
    for (const value of [after.g1, after.s, after.g2m]) expect(value).toBeGreaterThanOrEqual(0);
  });
});

describe('The steady-state phase distribution is emergent', () => {
  it('an exponentially growing culture settles on a stable phase distribution nobody wrote down', () => {
    const { advance, state } = culture({ carryingCapacityCells: 1e12 });
    advance(96);
    const early = { s: state().sPhaseFraction as number, g1: state().g1Fraction as number };
    advance(96);
    const late = { s: state().sPhaseFraction as number, g1: state().g1Fraction as number };
    // Converged: the distribution stops moving even though the population keeps growing.
    expect(late.s).toBeCloseTo(early.s, 4);
    expect(late.g1).toBeCloseTo(early.g1, 4);
    // And it lands in the range a proliferating mammalian culture actually shows.
    expect(late.s).toBeGreaterThan(0.2);
    expect(late.s).toBeLessThan(0.4);
    expect(late.g1).toBeGreaterThan(late.s); // G1 is the longest phase, so it holds the most cells
  });

  it('the population doubles FASTER than the mean cycle length — a real consequence of the exponential residence assumption', () => {
    const { advance, state } = culture({ carryingCapacityCells: 1e12 });
    advance(96); // let the distribution converge first
    const before = state().totalCells as number;
    advance(24);
    const after = state().totalCells as number;
    const doublingH = (24 * Math.LN2) / Math.log(after / before);
    // ~21 h against a 24 h nominal cycle. Not a bug and not a fudge: with exponentially
    // distributed phase durations some cells cycle faster, which skews the population young.
    // This IS the limitation the module documents — a real culture's tighter, more Erlang-like
    // phase distributions would push this closer to 24 h.
    expect(doublingH).toBeGreaterThan(18);
    expect(doublingH).toBeLessThan(24);
  });

  it('a slower cycle grows more slowly — the durations really drive the dynamics', () => {
    const fast = culture({ carryingCapacityCells: 1e12 });
    const slow = culture({ carryingCapacityCells: 1e12, g1DurationH: 22, sDurationH: 16, g2mDurationH: 10 });
    fast.advance(120);
    slow.advance(120);
    expect(fast.state().totalCells as number).toBeGreaterThan(slow.state().totalCells as number);
  });
});

describe('Saturation is contact inhibition, applied where biology applies it', () => {
  it('a confluent culture arrests in G1 with S phase emptied — not every phase scaled down', () => {
    const { advance, state } = culture({ carryingCapacityCells: 100_000 });
    advance(480);
    expect(state().stateCode).toBe(CULTURE_STATE_CODE.ARRESTED);
    // The observable signature of confluence arrest: cells pile up before the G1/S restriction point.
    expect(state().g1Fraction as number).toBeGreaterThan(0.95);
    expect(state().sPhaseFraction as number).toBeLessThan(0.02);
  });

  it('it overshoots nominal capacity slightly, because committed cells still divide', () => {
    const { advance, state } = culture({ carryingCapacityCells: 100_000 });
    advance(480);
    const total = state().totalCells as number;
    // Inhibition blocks ENTRY to S; cells already past the restriction point finish and divide.
    // A logistic term on the total would have stopped exactly at K, which is the less faithful answer.
    expect(total).toBeGreaterThan(100_000);
    expect(total).toBeLessThan(115_000);
  });

  it('growth really stops rather than merely slowing', () => {
    const { advance, state } = culture({ carryingCapacityCells: 100_000 });
    advance(480);
    const settled = state().totalCells as number;
    advance(240);
    expect(state().totalCells as number).toBeCloseTo(settled, 0);
  });

  it('a death rate above the division rate makes the culture decline, and it is labelled so', () => {
    const { advance, state } = culture({ carryingCapacityCells: 1e12, deathRatePerHour: 0.5 });
    advance(48);
    expect(state().netGrowthPerHour as number).toBeLessThan(0);
    expect(state().stateCode).toBe(CULTURE_STATE_CODE.DECLINING);
  });
});

describe('Contract compliance', () => {
  it('Rule 6: a million cells are ONE entity, never a million placed objects', () => {
    const graph = new WorldGraph();
    addCellCulture(graph, { params: { g1Cells: 1_000_000 } });
    expect(graph.listEntities()).toHaveLength(1);
  });

  it('Rule 3: the culture state reaches C2 as a number, with the token alongside', () => {
    const { advance, engine, id } = culture({ carryingCapacityCells: 100_000 });
    advance(480);
    const frame = toGraphicsWorldFrame(getFrameState(engine));
    const entity = frame.entities.find((e) => e.id === id)!;
    expect(entity.scalars!.stateCode).toBe(CULTURE_STATE_CODE.ARRESTED);
    expect(entity.scalars!.sPhaseFraction).toBeLessThan(0.02);
    // The observable an unstructured logistic model cannot produce at all.
    expect(typeof entity.scalars!.g1Fraction).toBe('number');
    expect(CULTURE_STATES).toContain(entity.status as (typeof CULTURE_STATES)[number]);
    expect(entity.grounding).toBe('MODELED');
  });

  it('state labels are total', () => {
    expect(cultureStateLabel(CULTURE_STATE_CODE.CONFLUENT)).toBe('CULTURE_CONFLUENT');
    for (const nonsense of [-1, 99, Number.NaN]) expect(CULTURE_STATES).toContain(cultureStateLabel(nonsense));
  });

  it('replay reconstructs the culture exactly', () => {
    const { advance, engine, id } = culture({ carryingCapacityCells: 100_000 });
    advance(120);
    expect(engine.scrubTo(engine.tick).getEntity(id).domainState).toEqual(engine.graph.getEntity(id).domainState);
    expect(engine.scrubTo(0).getEntity(id).domainState?.totalCells).toBe(CELL_CYCLE_DEFAULTS.g1Cells);
  });

  it('the same parameters give the same trajectory — deterministic, no stochasticity claimed or present', () => {
    const a = culture({ carryingCapacityCells: 100_000 });
    const b = culture({ carryingCapacityCells: 100_000 });
    a.advance(240);
    b.advance(240);
    expect(a.state()).toEqual(b.state());
  });
});
