import { entityId } from '../worldModel/ecs/types';
import { WorldGraph } from '../worldModel/ecs/worldGraph';
import {
  addBackupGenerator,
  ELECTRICAL_GENERATOR_SOLVER_ID,
  GENERATOR_DEFAULTS,
  GENERATOR_STATUS,
  makeElectricalGeneratorSolver,
} from '../worldModel/domains/electricalGenerator';
import { SolverRouter } from '../worldModel/solvers/solverRouter';
import type { TemporalUpdater } from '../worldModel/temporal/temporalEngine';
import { relationFor } from './leverCriterion';
import type { WorldLever, WorldLeverCatalog } from './worldGoalIntent';

/**
 * THE DISCOVERY ENGINE ON ELECTRICAL ENGINEERING — the fifth domain on the
 * WorldGraph substrate, after flood, chemistry, epidemiology and cell biology.
 *
 * Why this substrate: lines 1 and 2 of the checklist in
 * `docs/TWO_AUTONOMOUS_LOOPS_DECISION.md`. A running genset is a state machine
 * with a real trajectory — fuel draining tick by tick toward an exhaustion
 * state — and every lever here is something an operator does AT A MOMENT to a
 * unit that is already online.
 *
 * ## Nothing here is new engineering
 *
 * The solver is `domains/electricalGenerator.ts` exactly as it already existed:
 * a real state machine (OFF / STARTING / RUNNING / FUEL_EXHAUSTED) over the
 * standard linear diesel-genset fuel model, `fuelRateLPerHr = loadKw ×
 * specificFuelConsumptionLPerKwh`. This file contributes levers and phrasing.
 *
 * Its honesty is inherited rather than upgraded, and there is a real subtlety
 * to state: the capability registry codes BLACKOUT as `MODELLED`, but the
 * solver publishes its own results at `PROCEDURAL_APPROXIMATION`, because the
 * specific fuel consumption figure is a representative published value for a
 * mid-size genset and not a measurement of any named unit. Where those two
 * disagree the lower one governs what may be claimed, so every result here is
 * PROCEDURAL_APPROXIMATION.
 *
 * ## The baseline is a RUNNING generator, and that is not a convenience
 *
 * `OFF` never advances on its own — by design, the same discipline that stops a
 * pump un-tripping itself. A baseline left at `OFF` would therefore have no
 * trajectory at all and every lever would be measuring nothing. The question
 * this catalogue asks is the one an operator actually has during an outage:
 * the backup is already carrying the load, so **how long does the fuel last?**
 */

export const GENESIS_GENERATOR_ID = entityId({ kind: 'backup-generator', id: 'generator-1' });

export const GENESIS_GENERATOR_CATALOG_ID = 'genesis-backup-generator';

/** One tick is ten minutes, in the seconds the solver's state machine counts in. */
const GENERATOR_DT_SECONDS = 600;

/** 50 minutes in: the outage is under way and the unit is stably online. */
const GENERATOR_DECISION_TICK = 5;

/**
 * Tick 60 — ten hours of running. MEASURED from the printed baseline, not
 * picked as a round number.
 *
 * At 50 kW and 0.32 L/kWh the unit burns 16 L/h, so the 200 L tank empties at
 * 12.5 h — tick 75. At tick 60 the baseline still holds 40.0 L: every lever is
 * acting linearly and nothing has hit the `Math.max(0, ...)` floor. Past tick 75
 * the baseline clamps at zero and flips to FUEL_EXHAUSTED, at which point every
 * arm that saved any fuel at all looks alike against a floor rather than against
 * a trajectory — the far end of the degenerate-horizon trap, and it is only
 * fifteen ticks away.
 */
const GENERATOR_HORIZON_TICK = 60;

/** 0.32 -> 0.22 L/kWh. A real efficiency improvement, inside the range published for this class of genset. */
const EFFICIENT_SPECIFIC_FUEL_CONSUMPTION = 0.22;
/** 50 -> 30 kW. A real load shed: an operator drops non-essential circuits. */
const SHED_LOAD_KW = 30;
/** 200 -> 400 L. A real declared field — see the lever for why it is nonetheless inert. */
const LARGER_TANK_L = 400;
/** 50 -> 30 kW nameplate. A real declared field — see the lever for why it is nonetheless inert. */
const SMALLER_RATED_POWER_KW = 30;

/**
 * Builds a fresh generator world plus the updater that advances it.
 *
 * `SolverRouter.routeTick` bound to the real generator solver — the same
 * construction every other lever catalogue uses. The unit is seeded RUNNING at
 * its rated load, which is the state a backup unit is in once an outage has
 * started it; see the module doc for why an OFF baseline would be unmeasurable.
 */
export function buildGeneratorDiscoveryWorld(): { graph: WorldGraph; updater: TemporalUpdater } {
  const graph = new WorldGraph();
  addBackupGenerator(graph, {
    params: { status: GENERATOR_STATUS.RUNNING, loadKw: GENERATOR_DEFAULTS.ratedPowerKw },
  });
  const router = new SolverRouter();
  router.register(ELECTRICAL_GENERATOR_SOLVER_ID, makeElectricalGeneratorSolver());
  const updater: TemporalUpdater = (g, dtSeconds, tick) => router.routeTick(g, dtSeconds, tick);
  return { graph, updater };
}

/** Scales one generator parameter from its baseline to a declared full value. */
function generatorParamLever(key: string, fullValue: number, baseValue: number) {
  return (graph: WorldGraph, strength: number) => {
    const generator = graph.getEntity(GENESIS_GENERATOR_ID)!;
    graph.updateEntity(generator.id, {
      domainState: { ...generator.domainState, [key]: baseValue + (fullValue - baseValue) * strength },
    });
  };
}

/**
 * The levers this generator really has. Two move the fuel and two do not, and
 * the two that do not are inert for GENUINELY DIFFERENT REASONS — a distinction
 * worth keeping rather than collapsing into "no effect".
 *
 * `lever:generator-rating` is inert for a reason that is about the machine.
 * `loadKw` is set from `ratedPowerKw` only once, at the STARTING -> RUNNING
 * transition; after that the unit carries whatever load it is carrying. So
 * re-rating a genset that is already online does not change what it is
 * delivering, and therefore does not change what it burns. That is right:
 * fuel burn is driven by LOAD, and a nameplate is not a load. It is the
 * electrical counterpart of the chemistry catalogue's mass lever.
 *
 * `lever:larger-tank` is inert for a reason that is about the MODEL, and this
 * file will not blur the two. The solver decrements `fuelRemainingL` and never
 * reads `fuelCapacityL` at all, so enlarging the declared tank changes nothing.
 * A real generator with a bigger tank obviously runs longer; what the loop has
 * found is a real limit of THIS model — capacity is a declared field the fuel
 * model does not consume — and reporting that as a fact about diesel
 * generators would be false. The loop's own disclaimer already scopes every
 * verdict to the model; this lever is the case where that scoping does the
 * whole work, which is why it is kept rather than quietly dropped.
 */
export const GENESIS_GENERATOR_LEVERS: readonly WorldLever[] = [
  {
    leverId: 'lever:fuel-efficiency',
    phrases: ['efficiency', 'efficient', 'consumption', 'fuel efficiency', 'sprawnoś', 'sprawnos', 'zużyci', 'zuzyci', 'oszczędn', 'oszczedn'],
    targetEntityId: GENESIS_GENERATOR_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:fuel-efficiency',
      statement: `Endurance is limited by how much fuel the engine burns per kWh, so improving specific consumption to ${EFFICIENT_SPECIFIC_FUEL_CONSUMPTION} L/kWh ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: `improving specific fuel consumption to ${EFFICIENT_SPECIFIC_FUEL_CONSUMPTION} L/kWh`,
      entityId: GENESIS_GENERATOR_ID,
      criterion: {
        metric,
        relation: relationFor(direction),
        rationale: 'Specific consumption is one of the two factors in the burn rate, so changing it must change how much fuel is left.',
      },
      apply: generatorParamLever('specificFuelConsumptionLPerKwh', EFFICIENT_SPECIFIC_FUEL_CONSUMPTION, GENERATOR_DEFAULTS.specificFuelConsumptionLPerKwh),
      rationale: 'Specific fuel consumption is a real parameter of the linear diesel-genset fuel model the solver integrates.',
    }),
  },
  {
    leverId: 'lever:load-shedding',
    phrases: ['load', 'shed', 'load shedding', 'demand', 'circuits', 'obciążeni', 'obciazeni', 'odciąż', 'odciaz'],
    targetEntityId: GENESIS_GENERATOR_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:load-shedding',
      statement: `Endurance is limited by the load carried, so shedding down to ${SHED_LOAD_KW} kW ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: `shedding non-essential load down to ${SHED_LOAD_KW} kW`,
      entityId: GENESIS_GENERATOR_ID,
      criterion: {
        metric,
        relation: relationFor(direction),
        rationale: 'Load is the other factor in the burn rate, so carrying less of it must leave more fuel.',
      },
      apply: generatorParamLever('loadKw', SHED_LOAD_KW, GENERATOR_DEFAULTS.ratedPowerKw),
      rationale: 'Shedding circuits is the intervention an operator actually has during an outage, and load is what the fuel model consumes.',
    }),
  },
  {
    leverId: 'lever:generator-rating',
    phrases: ['rating', 'rated', 'nameplate', 'bigger generator', 'smaller generator', 'moc znamionow', 'znamionow'],
    targetEntityId: GENESIS_GENERATOR_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:generator-rating',
      statement: `Endurance is limited by the size of the machine, so re-rating it to ${SMALLER_RATED_POWER_KW} kW ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: `changing the generator's nameplate rating to ${SMALLER_RATED_POWER_KW} kW`,
      entityId: GENESIS_GENERATOR_ID,
      criterion: {
        metric,
        relation: relationFor(direction),
        rationale: 'If the size of the machine governed endurance, re-rating it would move the fuel remaining.',
      },
      apply: generatorParamLever('ratedPowerKw', SMALLER_RATED_POWER_KW, GENERATOR_DEFAULTS.ratedPowerKw),
      rationale: 'Rated power is a real declared property of the unit, so a thorough search has to test it rather than assume it reaches the fuel.',
    }),
  },
  {
    leverId: 'lever:larger-tank',
    phrases: ['tank', 'capacity', 'fuel capacity', 'bigger tank', 'zbiornik', 'pojemność zbiornika', 'pojemnosc zbiornika'],
    targetEntityId: GENESIS_GENERATOR_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:larger-tank',
      statement: `Endurance is limited by tank size, so doubling the declared capacity to ${LARGER_TANK_L} L ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: `doubling the declared fuel-tank capacity to ${LARGER_TANK_L} L`,
      entityId: GENESIS_GENERATOR_ID,
      criterion: {
        metric,
        relation: relationFor(direction),
        rationale: 'If the declared tank capacity governed how much fuel is left, enlarging it would move the metric.',
      },
      apply: generatorParamLever('fuelCapacityL', LARGER_TANK_L, GENERATOR_DEFAULTS.fuelCapacityL),
      rationale: 'Fuel capacity is a real declared field of this domain, and a search that never tested it would leave a stated mechanism unexamined — see the block comment above for what its refutation does and does not mean.',
    }),
  },
];

export const GENESIS_GENERATOR_CATALOG: WorldLeverCatalog = {
  catalogId: GENESIS_GENERATOR_CATALOG_ID,
  worldId: 'genesis-backup-power',
  domainId: 'electrical-engineering',
  buildWorld: buildGeneratorDiscoveryWorld,
  /**
   * One objective, and the exclusions are all deliberate.
   *
   * `loadKw` is computed, but `lever:load-shedding` sets it: offering it would
   * build an experiment whose intervention IS its own criterion. `status` and
   * `secondsRemaining` are a discrete mode and a countdown, not quantities a
   * relation can order. `cumulativeRuntimeS` is computed but, on a unit that is
   * already RUNNING, it increments by exactly `dt` every tick whatever anyone
   * does — a clock, so every lever would score exactly zero against it for a
   * reason that says nothing about generators. `ratedPowerKw`,
   * `specificFuelConsumptionLPerKwh`, `fuelCapacityL` and `startupDelayS` are
   * inputs the solver reads (or, in two cases, does not even read) and never
   * computes.
   */
  metricPhrases: {
    'fuel remaining': 'fuelRemainingL',
    'remaining fuel': 'fuelRemainingL',
    fuel: 'fuelRemainingL',
    endurance: 'fuelRemainingL',
    'paliw': 'fuelRemainingL',
    'zapas paliwa': 'fuelRemainingL',
  },
  entityIdForMetric: {
    fuelRemainingL: GENESIS_GENERATOR_ID,
  },
  levers: GENESIS_GENERATOR_LEVERS,
  decisionAtTick: GENERATOR_DECISION_TICK,
  horizonTick: GENERATOR_HORIZON_TICK,
  dt: GENERATOR_DT_SECONDS,
  declaredAssumptions: [
    'A representative mid-size diesel genset: 50 kW rated, 200 L tank, 0.32 L/kWh specific consumption — published figures for the CLASS, NOT a measurement of any named unit, inherited directly from electricalGenerator.ts\'s own disclosure',
    'The linear diesel-genset fuel model, fuelRateLPerHr = loadKw x specificFuelConsumptionLPerKwh, which is the textbook form and not a curve fitted to any engine',
    'The unit is already RUNNING and carrying its rated load at tick 0: this catalogue asks how long the fuel lasts, not whether the unit starts',
    'Each lever is applied instantly at 50 minutes and held for the rest of the run',
    'The horizon is 10 hours, chosen from the measured baseline: 40 L still in the tank, and 15 ticks before the tank empties and every arm would be compared against a floor rather than a trajectory',
    'The solver publishes at PROCEDURAL_APPROXIMATION even though the capability registry codes BLACKOUT as MODELLED; the lower of the two governs what may be claimed here',
  ],
  notModelledFactors: [
    'Part-load efficiency: specific consumption is one constant, so the model cannot say that a genset is less efficient at 30% load than at 90%, which is the single biggest real-world qualifier on the load-shedding result',
    'Engine thermodynamics, ambient conditions, altitude derating, fuel temperature and fuel quality',
    'Mechanical failure, maintenance, oil, cooling and everything that actually stops backup generators in practice',
    'Refuelling logistics — whether anyone can reach the site with fuel is the real limit on endurance and is not modelled at all',
    'Electrical behaviour beyond a scalar load: no frequency, no voltage, no power factor, no transient response, no paralleling',
    'Emissions, noise, cost and siting',
  ],
};

/** The metric this world's goals are normally about. Exported so a caller need not hardcode the key. */
export const GENESIS_GENERATOR_OBJECTIVE_METRIC = 'fuelRemainingL';
