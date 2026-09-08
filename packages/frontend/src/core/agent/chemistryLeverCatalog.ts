import { SolverRouter } from '../worldModel/solvers/solverRouter';
import type { TemporalUpdater } from '../worldModel/temporal/temporalEngine';
import { entityId } from '../worldModel/ecs/types';
import type { WorldGraph } from '../worldModel/ecs/worldGraph';
import {
  buildChemistryExperimentWorld,
  CHEMISTRY_KINETICS_SOLVER_ID,
  DEMO_ACTIVATION_ENERGY_KJ,
  makeChemistryKineticsSolver,
} from '../worldModel/domains/chemistryKinetics';
import { relationFor } from './leverCriterion';
import type { WorldLever, WorldLeverCatalog } from './worldGoalIntent';

/**
 * THE DISCOVERY ENGINE, IN A SECOND REAL DOMAIN.
 *
 * Every real discovery run Genesis had done until this file existed was against
 * the flood city. That made a claim nobody had actually tested: that
 * `discoveryLoop.ts`/`worldCounterfactual.ts`/`crossActionComparison.ts` are
 * domain-agnostic. They are written that way — none of them mentions a
 * floodplain — but "written to be generic" and "has ever run on a second
 * domain" are different claims, and only the second one is evidence.
 *
 * This is that second domain, and it is deliberately as UNLIKE the flood city
 * as the repo allows: molecular chemistry rather than civil hydrology, an
 * Arrhenius rate law rather than a volume-conserving planar fill, a metric that
 * falls monotonically toward zero rather than one that peaks, and seconds-scale
 * `dt` rather than ten-minute hydrological steps. Nothing in the engine changed
 * to accommodate it — the only thing that had to change was a needlessly narrow
 * TYPE on `WorldLeverCatalog.buildWorld`, which had been pinned to the flood
 * city's own builder return type instead of the generic `TemporalUpdater` that
 * `DiscoveryLoopInput.buildWorld` already used.
 *
 * ## Nothing here is new science
 *
 * The solver is `domains/chemistryKinetics.ts` exactly as it already existed —
 * the real Arrhenius model in `modelGraph/chemistryKineticsGraph.ts`, with an
 * exact analytic first-order decay step. This file contributes levers and
 * phrasing, not chemistry. Its honesty inherits directly from that solver's own
 * disclosure: `MODEL_ESTIMATE`, never `GROUNDED_EXACT`, and its kinetics
 * parameters are an illustrative demo pair, NOT measured data for any real
 * compound. That is restated in `declaredAssumptions` below rather than left in
 * a source comment, because a discovery report that quietly dropped it would be
 * claiming more than the model can support.
 */

/** `buildChemistryExperimentWorld`'s default substance ref, as the id the graph stores it under. */
export const GENESIS_CHEMISTRY_SUBSTANCE_ID = entityId({ kind: 'substance', id: 'substance-1' });

export const GENESIS_CHEMISTRY_CATALOG_ID = 'genesis-chemistry-kinetics';

/** One tick is one hour, the same unit `lookingGlass/scenarioSession.ts` already advances this domain in. */
const CHEMISTRY_DT_SECONDS = 3600;

/**
 * The baseline the levers move away from. 750 K is the temperature
 * `scenarioSession.ts` already runs this substance at, chosen there because the
 * demo kinetics pair produces an observable (not instant, not frozen) decay
 * trajectory at that scale.
 */
const BASELINE_TEMPERATURE_K = 750;
const BASELINE_MASS_KG = 1;

/** Heating to 800 K: a real, modest temperature rise, well inside the range the demo pair was chosen for. */
const HEATED_TEMPERATURE_K = 800;
/** 120 -> 100 kJ/mol: a real reduction of the activation barrier, the effect a catalyst has on this rate law. */
const CATALYSED_ACTIVATION_ENERGY_KJ = 100;
/** 1 -> 5 kg. Real field, deliberately chosen because first-order FRACTIONAL decay does not depend on it (see the lever). */
const HEAVIER_MASS_KG = 5;

/**
 * Builds a fresh chemistry world plus the updater that advances it.
 *
 * The updater is `SolverRouter.routeTick` bound to the real Arrhenius solver —
 * the same construction `domains/genesisCityWorld.ts` uses for the city's three
 * solvers, with one entry instead of four. No second integration path.
 */
export function buildChemistryDiscoveryWorld(): { graph: WorldGraph; updater: TemporalUpdater } {
  const world = buildChemistryExperimentWorld({ initialTemperatureK: BASELINE_TEMPERATURE_K });
  const router = new SolverRouter();
  router.register(CHEMISTRY_KINETICS_SOLVER_ID, makeChemistryKineticsSolver());
  const updater: TemporalUpdater = (graph, dtSeconds, tick) => router.routeTick(graph, dtSeconds, tick);
  return { graph: world.graph, updater };
}

/** Scales one scalar on the substance from its baseline to a declared full value, exactly as the flood levers do. */
function substanceScalarLever(
  component: 'physics' | 'chemical',
  key: string,
  fullValue: number,
  baseValue: number,
) {
  return (graph: WorldGraph, strength: number) => {
    const substance = graph.getEntity(GENESIS_CHEMISTRY_SUBSTANCE_ID)!;
    const current = substance[component] ?? {};
    graph.updateEntity(substance.id, {
      [component]: { ...current, [key]: baseValue + (fullValue - baseValue) * strength },
    });
  };
}

/**
 * The levers this chemistry world really has.
 *
 * Two of them drive the Arrhenius rate constant and one deliberately does not.
 * `lever:substance-mass` is NOT a strawman: first-order kinetics is defined on
 * the FRACTION remaining, C(t)/C(0) = exp(-kt), which is independent of how
 * much substance there is. A discovery loop that reports it as
 * REFUTED_BY_NO_EFFECT has recovered a real property of the rate law from the
 * solver's own behaviour, which is exactly the kind of negative result this
 * engine exists to produce — and it gives this domain the same shape of
 * discrimination problem the flood city has, where one declared mechanism
 * genuinely does not control the objective.
 */
export const GENESIS_CHEMISTRY_LEVERS: readonly WorldLever[] = [
  {
    leverId: 'lever:temperature',
    phrases: ['temperature', 'heat', 'heating', 'warmer', 'temperatur', 'ogrzew', 'podgrz'],
    targetEntityId: GENESIS_CHEMISTRY_SUBSTANCE_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:temperature',
      statement: `The reaction rate is limited by temperature, so heating the substance ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: 'raising the substance temperature',
      entityId: GENESIS_CHEMISTRY_SUBSTANCE_ID,
      criterion: {
        metric,
        relation: relationFor(direction),
        rationale: 'Arrhenius makes the rate constant exponential in temperature, so heating must move the remaining fraction.',
      },
      apply: substanceScalarLever('physics', 'temperatureK', HEATED_TEMPERATURE_K, BASELINE_TEMPERATURE_K),
      rationale: 'Temperature is the parameter the real Arrhenius model integrates the rate constant from.',
    }),
  },
  {
    leverId: 'lever:catalyst',
    phrases: ['catalyst', 'catalysis', 'activation energy', 'barrier', 'kataliz', 'energia aktywacji'],
    targetEntityId: GENESIS_CHEMISTRY_SUBSTANCE_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:catalyst',
      statement: `The reaction rate is limited by the activation barrier, so lowering it ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: 'lowering the activation energy (the effect a catalyst has on this rate law)',
      entityId: GENESIS_CHEMISTRY_SUBSTANCE_ID,
      criterion: {
        metric,
        relation: relationFor(direction),
        rationale: 'Activation energy enters the same exponential, so reducing the barrier must move the remaining fraction.',
      },
      apply: substanceScalarLever('chemical', 'activationEnergyKJ', CATALYSED_ACTIVATION_ENERGY_KJ, DEMO_ACTIVATION_ENERGY_KJ),
      rationale: 'Activation energy is a real parameter of the model, and lowering it is what a catalyst does to this rate law.',
    }),
  },
  {
    leverId: 'lever:substance-mass',
    phrases: ['mass', 'amount', 'quantity', 'more substance', 'masa', 'ilość', 'ilosc'],
    targetEntityId: GENESIS_CHEMISTRY_SUBSTANCE_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:substance-mass',
      statement: `The reaction is limited by how much substance is present, so increasing the mass ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: 'increasing the substance mass',
      entityId: GENESIS_CHEMISTRY_SUBSTANCE_ID,
      criterion: {
        metric,
        relation: relationFor(direction),
        rationale: 'If the amount of substance governed the outcome, adding more of it would move the remaining fraction.',
      },
      apply: substanceScalarLever('physics', 'massKg', HEAVIER_MASS_KG, BASELINE_MASS_KG),
      rationale: 'Mass is a real declared property of the substance, so a search that never tested it would be leaving a stated mechanism unexamined.',
    }),
  },
];

export const GENESIS_CHEMISTRY_CATALOG: WorldLeverCatalog = {
  catalogId: GENESIS_CHEMISTRY_CATALOG_ID,
  worldId: 'genesis-chemistry-lab',
  domainId: 'chemistry-kinetics',
  buildWorld: buildChemistryDiscoveryWorld,
  /**
   * Only `concentrationFraction` is offered as an objective, and deliberately so:
   * it is the one scalar on this entity the solver actually COMPUTES. Temperature
   * and activation energy are inputs it only ever reads, so offering either as an
   * objective would let a goal like "minimise temperature" build a tautological
   * experiment whose intervention directly sets the very metric its criterion
   * reads. A metric worth searching for has to be something the model produces.
   */
  metricPhrases: {
    'remaining fraction': 'concentrationFraction',
    'remaining concentration': 'concentrationFraction',
    'how much is left': 'concentrationFraction',
    concentration: 'concentrationFraction',
    'stężenie': 'concentrationFraction',
    'stezenie': 'concentrationFraction',
    'pozostał': 'concentrationFraction',
    'pozostal': 'concentrationFraction',
  },
  entityIdForMetric: {
    concentrationFraction: GENESIS_CHEMISTRY_SUBSTANCE_ID,
  },
  levers: GENESIS_CHEMISTRY_LEVERS,
  decisionAtTick: 1,
  horizonTick: 12,
  dt: CHEMISTRY_DT_SECONDS,
  declaredAssumptions: [
    'Kinetics parameters are an illustrative demo pair (Ea and log10 A), NOT measured data for any real compound — inherited directly from chemistryKinetics.ts\'s own disclosure',
    'The rate constant comes from a documented approximate model, so every result here is MODEL_ESTIMATE, never GROUNDED_EXACT',
    'One well-mixed substance at a uniform temperature — no spatial gradients, no mass transport, no mixing',
    'Each lever is applied instantly at the decision tick, and held for the rest of the run',
  ],
  notModelledFactors: [
    'Reaction mechanism beyond a single first-order decay — no intermediates, no competing pathways, no equilibrium',
    'Any specific catalyst: the catalyst lever moves the activation energy, which is what a catalyst does to this rate law, but no real catalyst\'s identity, loading or selectivity is modelled',
    'Heat transfer and thermal runaway — temperature is a set value, not something the reaction itself changes',
    'Safety, cost, containment and everything else a real experiment would have to answer for',
  ],
};

/**
 * The metric this world's goals are normally about, exported so a caller can
 * state a goal without hardcoding the string (and so a test asserting on it
 * fails loudly if the metric ever gets renamed).
 */
export const GENESIS_CHEMISTRY_OBJECTIVE_METRIC = 'concentrationFraction';
