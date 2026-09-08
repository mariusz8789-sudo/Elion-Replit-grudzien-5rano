import { entityId } from '../worldModel/ecs/types';
import { WorldGraph } from '../worldModel/ecs/worldGraph';
import {
  addCellCulture,
  CELL_CYCLE_DEFAULTS,
  CELL_CYCLE_SOLVER_ID,
  makeCellCycleSolver,
} from '../worldModel/domains/cellCycle';
import { SolverRouter } from '../worldModel/solvers/solverRouter';
import type { TemporalUpdater } from '../worldModel/temporal/temporalEngine';
import { relationFor } from './leverCriterion';
import type { WorldLever, WorldLeverCatalog } from './worldGoalIntent';

/**
 * THE DISCOVERY ENGINE ON CELL BIOLOGY — the fourth domain on the WorldGraph
 * substrate.
 *
 * Why this substrate: line 1 of the checklist in
 * `docs/TWO_AUTONOMOUS_LOOPS_DECISION.md`. A culture is a state that evolves,
 * and the interesting questions are about what a drug added at a moment does to
 * the trajectory that follows — which is a fork, not a parameter sweep.
 *
 * ## Nothing here is new biology
 *
 * The solver is `domains/cellCycle.ts` exactly as it already existed: a real
 * compartmental G1/S/G2M model integrated with RK4, where growth comes from
 * mitosis turning one G2/M cell into two G1 cells and saturation comes from
 * contact inhibition applied at the G1/S restriction point. This file
 * contributes levers and phrasing, not biology.
 *
 * The capability registry declares this domain `PARTIALLY_MODELLED`, and that
 * is inherited rather than quietly upgraded here: the phase durations are
 * representative mammalian values and not a measured line, each compartment
 * implies an exponential residence time (so the population doubles somewhat
 * faster than the nominal cycle), and there is no chronological age structure,
 * no gene expression, no differentiation, no spatial structure and no
 * stochasticity. Nothing below is a claim about any real cell line, and
 * NOTHING here is a claim about a drug's effect in an organism.
 *
 * ## This domain has NO exactly-inert lever, and that is a measured finding
 *
 * The chemistry catalogue has `lever:substance-mass`, which the loop reports as
 * REFUTED_BY_NO_EFFECT because first-order fractional decay is exactly
 * independent of how much substance is present. There is no counterpart here,
 * and none was invented to make the domain look symmetrical.
 *
 * The reason is structural: every parameter reaches the objective through
 * `inhibition = 1 - total / carryingCapacityCells`, which is NONLINEAR in the
 * total cell count. So no parameter change cancels exactly — not even a uniform
 * death rate, which would cancel out of the phase fractions exactly if the
 * system were linear (measured: it does not, dS = +3.0e-4 at 60 h).
 *
 * The nearest candidate, `lever:vessel-capacity`, is LATENT rather than inert,
 * and the measured numbers say so plainly: enlarging the vessel changes the
 * cell count by +0.12% at 60 h (sparse), +9.0% at 180 h (27% occupancy) and
 * +85% at 240 h (confluent). Reporting that as "no effect" would be false; it
 * is a real effect that has not switched on yet.
 *
 * What this domain does have is the OTHER kind of real negative result:
 * REFUTED_BY_CRITERION. Against a growth objective, both the S-phase inhibitor
 * and the cytotoxic agent move the cell count decisively in the direction the
 * criterion rules out. Those are genuine refutations of genuine hypotheses,
 * they are just refutations of a different shape.
 */

export const GENESIS_CELL_CULTURE_ID = entityId({ kind: 'cell-culture', id: 'culture-1' });

export const GENESIS_CELL_CULTURE_CATALOG_ID = 'genesis-cell-culture';

/**
 * One tick is six HOURS. `domains/cellCycle.ts` works in hours and takes `ctx.dt`
 * in that unit directly (unlike the flood city, whose `dt` is seconds) — a
 * quarter of the nominal 24 h cycle is fine enough to resolve the phase
 * transitions and coarse enough to reach confluence in a reasonable number of
 * ticks.
 */
const CELL_DT_HOURS = 6;

/** 12 h in. Early enough that the culture is still sparse and every lever has the whole run to act. */
const CELL_DECISION_TICK = 2;

/**
 * Tick 30 — 180 h, seven and a half days. MEASURED from the printed baseline
 * trajectory, not picked as a round number.
 *
 * At tick 30 the baseline culture holds 268 524 cells at 27% of capacity and
 * 26.3% of them are in S phase: proliferating hard, contact inhibition already
 * measurable but nowhere near arrest. Both ends of the degenerate-horizon trap
 * are real here and both were seen in the probe. Too early (tick 10, 60 h) and
 * the vessel-capacity lever has moved the count by 0.12%, indistinguishable
 * from nothing. Too late (tick 50, 300 h) and the baseline has arrested at
 * 1.08 M cells with an S-phase fraction of 0.000026 — every arm collapses onto
 * the same ceiling and the S-phase fraction underflows toward zero, so nothing
 * can be told apart.
 */
const CELL_HORIZON_TICK = 30;

/** 11 -> 7 h. A real shortening of G1 transit, the effect mitogenic signalling has at the restriction point. */
const MITOGEN_G1_DURATION_H = 7;
/** 8 -> 16 h. A real doubling of S-phase transit, the effect a DNA-synthesis inhibitor has. */
const BLOCKED_S_DURATION_H = 16;
/** 0 -> 0.01 /h. A real first-order loss; the model's own default is zero, so any non-zero value is a declared datum. */
const CYTOTOXIC_DEATH_RATE_PER_HOUR = 0.01;
/** 1e6 -> 5e6 cells. A real fivefold increase in the contact-inhibition ceiling: a larger vessel. */
const LARGER_CAPACITY_CELLS = 5_000_000;

/**
 * Builds a fresh culture plus the updater that advances it.
 *
 * `SolverRouter.routeTick` bound to the real cell-cycle solver — the same
 * construction `chemistryLeverCatalog.ts` and `epidemicLeverCatalog.ts` use.
 * No second integration path.
 */
export function buildCellCultureDiscoveryWorld(): { graph: WorldGraph; updater: TemporalUpdater } {
  const graph = new WorldGraph();
  addCellCulture(graph);
  const router = new SolverRouter();
  router.register(CELL_CYCLE_SOLVER_ID, makeCellCycleSolver());
  const updater: TemporalUpdater = (g, dtHours, tick) => router.routeTick(g, dtHours, tick);
  return { graph, updater };
}

/**
 * Scales one cell-cycle parameter on the culture from its baseline to a
 * declared full value.
 *
 * Spreading the existing `domainState` is load-bearing, not tidiness:
 * `updateEntity` replaces a component wholesale, so dropping it would discard
 * the compartment counts and restart the culture from its seeding density at
 * the fork.
 */
function cultureParamLever(key: string, fullValue: number, baseValue: number) {
  return (graph: WorldGraph, strength: number) => {
    const culture = graph.getEntity(GENESIS_CELL_CULTURE_ID)!;
    graph.updateEntity(culture.id, {
      domainState: { ...culture.domainState, [key]: baseValue + (fullValue - baseValue) * strength },
    });
  };
}

/**
 * The levers this culture really has. All four are real parameters of the
 * model, and none of them is a placeholder — see the module doc for why none of
 * them is exactly inert either.
 */
export const GENESIS_CELL_CULTURE_LEVERS: readonly WorldLever[] = [
  {
    leverId: 'lever:mitogen',
    phrases: ['mitogen', 'growth factor', 'serum', 'stimulation', 'czynnik wzrostu', 'stymulacj', 'surowic'],
    targetEntityId: GENESIS_CELL_CULTURE_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:mitogen',
      statement: `Proliferation is limited by how long cells spend in G1, so shortening G1 transit to ${MITOGEN_G1_DURATION_H} h ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: `shortening G1 transit to ${MITOGEN_G1_DURATION_H} h (what mitogenic signalling does at the restriction point)`,
      entityId: GENESIS_CELL_CULTURE_ID,
      criterion: {
        metric,
        relation: relationFor(direction),
        rationale: 'G1 -> S entry is the model\'s rate-limiting step; its rate is 1/g1DurationH, so shortening G1 must move the population.',
      },
      apply: cultureParamLever('g1DurationH', MITOGEN_G1_DURATION_H, CELL_CYCLE_DEFAULTS.g1DurationH),
      rationale: 'The G1/S restriction point is where this model applies its control, and it is the real control node mitogens act on.',
    }),
  },
  {
    leverId: 'lever:s-phase-inhibitor',
    phrases: ['s-phase', 's phase', 'dna synthesis', 'replication', 'hydroxyurea', 'thymidine', 'faza s', 'synteza dna', 'replikacj'],
    targetEntityId: GENESIS_CELL_CULTURE_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:s-phase-inhibitor',
      statement: `Proliferation is limited by DNA synthesis, so doubling S-phase transit to ${BLOCKED_S_DURATION_H} h ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: `doubling S-phase transit to ${BLOCKED_S_DURATION_H} h (what a DNA-synthesis inhibitor does)`,
      entityId: GENESIS_CELL_CULTURE_ID,
      criterion: {
        metric,
        relation: relationFor(direction),
        rationale: 'S -> G2M progression runs at 1/sDurationH, so slowing it holds cells in S and delays every mitosis behind them.',
      },
      apply: cultureParamLever('sDurationH', BLOCKED_S_DURATION_H, CELL_CYCLE_DEFAULTS.sDurationH),
      rationale: 'S-phase duration is a real parameter of the model and the real target of a replication-blocking agent.',
    }),
  },
  {
    leverId: 'lever:cytotoxic',
    phrases: ['cytotoxic', 'toxin', 'kill', 'death rate', 'apoptosis', 'cytotoksy', 'toksyn', 'apoptoz'],
    targetEntityId: GENESIS_CELL_CULTURE_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:cytotoxic',
      statement: `The population is limited by cell loss, so a first-order death rate of ${CYTOTOXIC_DEATH_RATE_PER_HOUR}/h ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: `imposing a first-order death rate of ${CYTOTOXIC_DEATH_RATE_PER_HOUR}/h across every phase`,
      entityId: GENESIS_CELL_CULTURE_ID,
      criterion: {
        metric,
        relation: relationFor(direction),
        rationale: 'Death removes cells from all three compartments, so it competes directly with mitosis for the population balance.',
      },
      apply: cultureParamLever('deathRatePerHour', CYTOTOXIC_DEATH_RATE_PER_HOUR, CELL_CYCLE_DEFAULTS.deathRatePerHour),
      rationale: 'The death rate is a real declared parameter whose default is zero, so testing it is testing a stated mechanism rather than a supplied result.',
    }),
  },
  {
    leverId: 'lever:vessel-capacity',
    phrases: ['vessel', 'flask', 'capacity', 'surface', 'confluence', 'contact inhibition', 'naczyni', 'butelk', 'pojemnoś', 'pojemnos', 'konfluencj'],
    targetEntityId: GENESIS_CELL_CULTURE_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:vessel-capacity',
      statement: `Proliferation is limited by contact inhibition, so raising the capacity to ${LARGER_CAPACITY_CELLS} cells ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: `raising the contact-inhibition capacity to ${LARGER_CAPACITY_CELLS} cells (a larger vessel)`,
      entityId: GENESIS_CELL_CULTURE_ID,
      criterion: {
        metric,
        relation: relationFor(direction),
        rationale: 'Capacity enters only through the inhibition term damping G1 -> S entry, so it can only matter to the extent the culture has filled the vessel.',
      },
      apply: cultureParamLever('carryingCapacityCells', LARGER_CAPACITY_CELLS, CELL_CYCLE_DEFAULTS.carryingCapacityCells),
      // The honest one. See the module doc: LATENT, not inert. Its measured
      // effect on the cell count grows from +0.12% at 60 h to +85% at 240 h,
      // so whether it is "the limiting mechanism" is a question about the
      // horizon and not only about the biology.
      rationale: 'Contact inhibition is the model\'s only saturating term, and whether it is currently binding is exactly the sort of thing a search should determine rather than assume.',
    }),
  },
];

export const GENESIS_CELL_CULTURE_CATALOG: WorldLeverCatalog = {
  catalogId: GENESIS_CELL_CULTURE_CATALOG_ID,
  worldId: 'genesis-cell-culture-lab',
  domainId: 'cell-biology',
  buildWorld: buildCellCultureDiscoveryWorld,
  /**
   * Two objectives, both genuinely COMPUTED by the solver each tick.
   *
   * `occupancyFraction` is computed too and is deliberately NOT offered: it is
   * `totalCells / carryingCapacityCells`, and `lever:vessel-capacity` sets that
   * denominator — a goal like "minimise occupancy" would build a tautological
   * experiment whose intervention directly moves its own criterion's metric.
   * `g1Cells`/`sCells`/`g2mCells` are absent for the same class of reason: they
   * are simultaneously the solver's outputs and its seeding inputs, so a future
   * seeding-density lever would make any of them tautological, and the guard is
   * cheaper to keep than to remember. `stateCode` is a discrete label, not a
   * quantity a criterion can order.
   */
  metricPhrases: {
    'cell count': 'totalCells',
    cells: 'totalCells',
    population: 'totalCells',
    proliferation: 'totalCells',
    growth: 'totalCells',
    'liczba komórek': 'totalCells',
    'liczba komorek': 'totalCells',
    'komórek': 'totalCells',
    'komorek': 'totalCells',
    'proliferacj': 'totalCells',
    's-phase fraction': 'sPhaseFraction',
    's phase fraction': 'sPhaseFraction',
    'fraction in s phase': 'sPhaseFraction',
    'frakcja s': 'sPhaseFraction',
  },
  entityIdForMetric: {
    totalCells: GENESIS_CELL_CULTURE_ID,
    sPhaseFraction: GENESIS_CELL_CULTURE_ID,
  },
  levers: GENESIS_CELL_CULTURE_LEVERS,
  decisionAtTick: CELL_DECISION_TICK,
  horizonTick: CELL_HORIZON_TICK,
  dt: CELL_DT_HOURS,
  declaredAssumptions: [
    'Phase durations (G1 11 h, S 8 h, G2/M 5 h) are representative mammalian values, NOT a measurement of any named cell line — inherited directly from cellCycle.ts\'s own disclosure',
    'One well-mixed culture in one vessel, seeded at 1000 cells all in G1',
    'Each compartment implies an exponential residence time, so the population doubles somewhat faster than the nominal 24 h cycle would suggest',
    'Contact inhibition is applied at the G1/S restriction point only: a confluent culture arrests in G1, which is what is observed, but the arrest is the model\'s single saturating term and not a mechanism',
    'Each lever is applied instantly at 12 h and held for the rest of the run',
    'The horizon is 180 h, chosen from the measured baseline trajectory: the culture is proliferating at 27% of capacity, past the point where a capacity change is indistinguishable from nothing and well before the arrest that collapses every arm onto the same ceiling',
    'The capability registry declares this domain PARTIALLY_MODELLED; every result here is MODEL_ESTIMATE and never GROUNDED_EXACT',
  ],
  notModelledFactors: [
    'Chronological age structure — that is a PDE, and cycle-phase structure is not the same thing',
    'Phase-duration variability: each compartment is exponential, so real, tighter phase distributions are not reproduced',
    'Gene expression, differentiation, checkpoints, DNA damage response and senescence',
    'Spatial structure, nutrient and oxygen gradients, and medium exchange — capacity is one scalar ceiling, not a resource',
    'Stochasticity: the model is deterministic, so nothing here says anything about variability between replicate wells',
    'Any specific drug: the levers move model parameters that a drug class is known to act on, but no compound\'s identity, concentration, pharmacokinetics, selectivity or off-target effects is modelled',
    'Everything that separates a culture from an organism — so no result here is evidence about a therapy, a patient or a disease',
  ],
};

/** The metric this world's goals are normally about. Exported so a caller need not hardcode the key. */
export const GENESIS_CELL_CULTURE_OBJECTIVE_METRIC = 'totalCells';
/** The other offered objective — the one the S-phase inhibitor really does raise. */
export const GENESIS_CELL_CULTURE_S_PHASE_METRIC = 'sPhaseFraction';
