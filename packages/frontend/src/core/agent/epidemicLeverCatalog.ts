import { DEFAULT_EPIDEMIC, type EpidemicParams } from '../epidemic/sir';
import { entityId } from '../worldModel/ecs/types';
import type { WorldGraph } from '../worldModel/ecs/worldGraph';
import {
  buildEpidemicWorld,
  EPIDEMIC_SEIR_SOLVER_ID,
  makeEpidemicSEIRSolver,
} from '../worldModel/domains/epidemicSEIR';
import { SolverRouter } from '../worldModel/solvers/solverRouter';
import type { TemporalUpdater } from '../worldModel/temporal/temporalEngine';
import { relationFor } from './leverCriterion';
import type { WorldLever, WorldLeverCatalog } from './worldGoalIntent';

/**
 * THE DISCOVERY ENGINE ON EPIDEMIOLOGY — the third domain on the WorldGraph
 * substrate, after the flood city and chemistry.
 *
 * Why this substrate and not the Experiment Fabric: line 1 and line 2 of the
 * checklist in `docs/TWO_AUTONOMOUS_LOOPS_DECISION.md`. An epidemic is a state
 * that evolves tick by tick, and every intervention worth asking about is
 * applied AT A MOMENT — a policy starts on a day — with a before and an after.
 * The Fabric can run an SEIR model, but it cannot fork one mid-epidemic, which
 * is exactly the question here.
 *
 * ## Nothing here is new science
 *
 * The solver is `domains/epidemicSEIR.ts` exactly as it already existed, which
 * in turn wraps `core/epidemic/sir.ts` — a real RK4-integrated compartmental
 * ODE system. This file contributes levers and phrasing, not epidemiology, and
 * it inherits that model's own disclosure verbatim: `MODEL_ESTIMATE`, an
 * abstract "Pathogen X", homogeneous mixing, and a fixed population. Nothing
 * here is about any real pathogen, outbreak or population, and no number below
 * is a forecast.
 *
 * ## The model variant, and why it is SEIRD rather than the default SEIR
 *
 * `DEFAULT_EPIDEMIC.model` is `'SEIR'`, in which `derivatives` never reads
 * `ifr` at all and the D compartment stays at zero. Under that variant the
 * treatment lever below would be a knob the model simply ignores — a strawman.
 * Under SEIRD `ifr` is a REAL parameter with a REAL effect: it splits the flux
 * leaving I between R and D. The lever therefore genuinely works; it just does
 * not work on the metric the hypothesis claims it does, which is what makes it
 * an honest negative result rather than a rigged one.
 */

export const GENESIS_EPIDEMIC_POPULATION_ID = entityId({ kind: 'population', id: 'city-1' });

export const GENESIS_EPIDEMIC_CATALOG_ID = 'genesis-epidemic-seir';

/** One tick is one day — the unit `core/epidemic/sir.ts` integrates in. */
const EPIDEMIC_DT_DAYS = 1;

/**
 * The decision day, and the day the distancing lever's policy starts.
 *
 * These are the same number ON PURPOSE, and it is not a coincidence worth
 * hiding: `betaAt` compares the model's own day counter against
 * `interventionDay`, so a policy declared for a day earlier than the fork
 * would already have been in force in the baseline, and one declared for a
 * later day would test "distancing, but delayed" rather than "distancing".
 */
const EPIDEMIC_DECISION_TICK = 5;

/**
 * Day 60. MEASURED, not assumed — the whole point of picking a horizon from a
 * printed trajectory rather than a round number.
 *
 * At day 60 the baseline epidemic is genuinely underway (I = 10 194, D = 155,
 * S down to 67 791 from 100 000) so every lever has something real to move,
 * and it is well before day ~100 where the sign of the contact-reduction
 * effect INVERTS: a flattened curve is still climbing at day 120 (I = 1 436)
 * while the unmitigated one has already burnt out (I = 759). Reporting
 * "distancing increases infections" from a horizon past that crossover would
 * be true of the numbers and false about the science, which is precisely the
 * degenerate-horizon trap.
 */
const EPIDEMIC_HORIZON_TICK = 60;

/** Baseline parameters. Illustrative, NOT calibrated to any real pathogen. */
export const GENESIS_EPIDEMIC_PARAMS: EpidemicParams = {
  ...DEFAULT_EPIDEMIC,
  model: 'SEIRD',
  population: 100_000,
  initialInfected: 20,
  r0: 2.5,
  infectiousDays: 7,
  incubationDays: 3,
  ifr: 0.01,
  interventionDay: 0,
  interventionEffect: 0,
};

/** R0 2.5 -> 1.4: a real, achievable contact reduction that still leaves the epidemic supercritical. */
const REDUCED_R0 = 1.4;
/** A 60% reduction of the transmission rate from the policy day onward. */
const DISTANCING_EFFECT = 0.6;
/** IFR 1% -> 0.2%: a fivefold improvement in survival, the scale a real treatment advance can have. */
const TREATED_IFR = 0.002;

/**
 * Builds a fresh epidemic world plus the updater that advances it.
 *
 * `SolverRouter.routeTick` bound to the real SEIR solver — the same
 * construction `chemistryLeverCatalog.ts` and `genesisCityWorld.ts` use. The
 * solver is given the SAME parameter object the world was seeded with, so the
 * baseline it integrates and the compartments the entity starts from cannot
 * disagree.
 */
export function buildEpidemicDiscoveryWorld(): { graph: WorldGraph; updater: TemporalUpdater } {
  const world = buildEpidemicWorld({ params: GENESIS_EPIDEMIC_PARAMS });
  const router = new SolverRouter();
  router.register(EPIDEMIC_SEIR_SOLVER_ID, makeEpidemicSEIRSolver(GENESIS_EPIDEMIC_PARAMS));
  const updater: TemporalUpdater = (graph, dtSeconds, tick) => router.routeTick(graph, dtSeconds, tick);
  return { graph: world.graph, updater };
}

/**
 * Scales one epidemic parameter on the population from its baseline to a
 * declared full value, and may set companion fields that are part of the same
 * declared mechanism.
 *
 * The spread of the existing `domainState` is not cosmetic: `updateEntity`
 * replaces a component wholesale, so dropping it would wipe S/E/I/R/D and
 * restart the epidemic from nothing at the fork.
 */
function populationParamLever(
  key: keyof EpidemicParams,
  fullValue: number,
  baseValue: number,
  companions: Readonly<Record<string, number>> = {},
) {
  return (graph: WorldGraph, strength: number) => {
    const population = graph.getEntity(GENESIS_EPIDEMIC_POPULATION_ID)!;
    graph.updateEntity(population.id, {
      domainState: {
        ...population.domainState,
        ...companions,
        [key]: baseValue + (fullValue - baseValue) * strength,
      },
    });
  };
}

/**
 * A virtual metric, resolved at hypothesis-construction time — never a real
 * `domainState` field, and never seen past this file.
 *
 * "Peak infected" is a real, distinct objective from plain "infected", and it
 * is exactly the case `objectiveReducer.ts` was built for: unlike the flood
 * city's `maxDepthM` (a running peak the solver already tracks for itself),
 * `I` is the CURRENT infected count at one tick, so asking for the peak needs
 * `objectiveTrajectory.ts`'s scan (`{kind: 'MAX'}`), not a different field.
 *
 * Deliberately NOT applied to plain "infected". That phrase has committed
 * tests reading `I` AT the catalog's declared horizon (day 60), and
 * retrofitting it to MAX would silently change what they measure — measured,
 * not assumed: at full strength the distancing arm's true peak (day 19,
 * I=28.714) differs from its day-60 reading (I=28.502), because by day 60 it
 * has already come down off that peak. So this is a new, additive metric a
 * goal can ask for, not a redefinition of an existing one.
 */
const EPIDEMIC_PEAK_INFECTED_METRIC = 'I_PEAK';

/**
 * Translates the virtual peak metric into the real field plus its reducer,
 * and leaves every other declared metric (`I`, `D`) exactly as it always was —
 * `{ metric }`, no `reducer` key at all, so `hypothesis.criterion.reducer` is
 * `undefined` and `discoveryLoop.ts` takes the AT_HORIZON path unchanged.
 */
function objectiveField(metric: string): { readonly metric: string; readonly reducer?: { readonly kind: 'MAX' } } {
  return metric === EPIDEMIC_PEAK_INFECTED_METRIC
    ? { metric: GENESIS_EPIDEMIC_OBJECTIVE_METRIC, reducer: { kind: 'MAX' } }
    : { metric };
}

/** The prose name for a metric. Real field names read fine as-is ("I", "D"); the virtual peak metric needs a name a sentence can actually use. */
function metricLabel(metric: string): string {
  return metric === EPIDEMIC_PEAK_INFECTED_METRIC ? 'the peak of I' : metric;
}

/**
 * The levers this epidemic world really has.
 *
 * Two of them change the course of the epidemic and one deliberately does not.
 *
 * `lever:treatment` is NOT a strawman. Under SEIRD, `ifr` really does something:
 * it decides what fraction of the flux leaving I becomes D rather than R, and
 * against a "minimise deaths" goal it is the single most effective lever here
 * (deaths at day 60: 31.2 treated against 155.4 untreated). What it cannot do
 * is change how many people are infected, because `derivatives` computes S, E
 * and I without reading `ifr` at all. Measured at every horizon probed
 * (days 10 through 120): the difference in I is EXACTLY zero, bit for bit.
 *
 * That is a real and widely-made confusion — "we have better treatment now, so
 * the epidemic is under control" — recovered from the solver's own behaviour
 * rather than asserted, and it is the epidemiological counterpart of the
 * chemistry catalogue's mass lever.
 */
export const GENESIS_EPIDEMIC_LEVERS: readonly WorldLever[] = [
  {
    leverId: 'lever:distancing',
    phrases: ['distancing', 'social distancing', 'lockdown', 'restrictions', 'dystans', 'dystansowanie', 'lockdown', 'obostrzeni', 'restrykcj'],
    targetEntityId: GENESIS_EPIDEMIC_POPULATION_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:distancing',
      statement: `The epidemic is limited by the transmission rate, so a distancing policy from day ${EPIDEMIC_DECISION_TICK} ${direction === 'minimize' ? 'lowers' : 'raises'} "${metricLabel(metric)}".`,
      mechanism: `a distancing policy reducing the transmission rate β from day ${EPIDEMIC_DECISION_TICK}`,
      entityId: GENESIS_EPIDEMIC_POPULATION_ID,
      criterion: {
        ...objectiveField(metric),
        relation: relationFor(direction),
        rationale: 'β is the rate at which contact turns susceptibles into exposed; scaling it down from a policy day must move the trajectory that follows.',
      },
      // Distinct from the contact-reduction lever below and not a second copy of
      // it: this is the model's own `interventionDay`/`interventionEffect` path,
      // which SCALES β from a date onward, whereas the other changes the
      // reproduction number itself. Same direction, different code path in
      // `betaAt`, and different real-world things — a temporary policy against a
      // structurally different contact rate.
      apply: populationParamLever('interventionEffect', DISTANCING_EFFECT, 0, { interventionDay: EPIDEMIC_DECISION_TICK }),
      rationale: 'interventionDay/interventionEffect is the lever the SEIR model itself declares for a non-pharmaceutical intervention.',
    }),
  },
  {
    leverId: 'lever:contact-reduction',
    phrases: ['contact', 'contacts', 'reproduction number', 'r0', 'kontakt', 'kontakty', 'liczba reprodukcji'],
    targetEntityId: GENESIS_EPIDEMIC_POPULATION_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:contact-reduction',
      statement: `The epidemic is limited by the reproduction number, so cutting R0 from ${GENESIS_EPIDEMIC_PARAMS.r0} to ${REDUCED_R0} ${direction === 'minimize' ? 'lowers' : 'raises'} "${metricLabel(metric)}".`,
      mechanism: `reducing the basic reproduction number R0 to ${REDUCED_R0}`,
      entityId: GENESIS_EPIDEMIC_POPULATION_ID,
      criterion: {
        ...objectiveField(metric),
        relation: relationFor(direction),
        rationale: 'R0 sets β = R0/D_inf, so a permanently lower reproduction number changes the force of infection for the whole remaining run.',
      },
      apply: populationParamLever('r0', REDUCED_R0, GENESIS_EPIDEMIC_PARAMS.r0),
      rationale: 'R0 is the parameter the compartmental model derives its transmission rate from.',
    }),
  },
  {
    leverId: 'lever:treatment',
    phrases: ['treatment', 'therapy', 'care', 'fatality', 'ifr', 'leczeni', 'terapia', 'śmiertelność', 'smiertelnosc'],
    targetEntityId: GENESIS_EPIDEMIC_POPULATION_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:treatment',
      statement: `The epidemic is limited by how badly infections end, so cutting the infection fatality ratio from ${GENESIS_EPIDEMIC_PARAMS.ifr} to ${TREATED_IFR} ${direction === 'minimize' ? 'lowers' : 'raises'} "${metricLabel(metric)}".`,
      mechanism: `improving treatment so the infection fatality ratio falls to ${TREATED_IFR}`,
      entityId: GENESIS_EPIDEMIC_POPULATION_ID,
      criterion: {
        ...objectiveField(metric),
        relation: relationFor(direction),
        rationale: 'If the outcome of infection governed this metric, improving survival would move it.',
      },
      apply: populationParamLever('ifr', TREATED_IFR, GENESIS_EPIDEMIC_PARAMS.ifr),
      rationale: 'IFR is a real declared parameter of the SEIRD model and a real target of medical progress, so a thorough search has to actually test it rather than assume its reach.',
    }),
  },
];

export const GENESIS_EPIDEMIC_CATALOG: WorldLeverCatalog = {
  catalogId: GENESIS_EPIDEMIC_CATALOG_ID,
  worldId: 'genesis-epidemic-population',
  domainId: 'epidemiology',
  buildWorld: buildEpidemicDiscoveryWorld,
  /**
   * Only compartment counts the solver COMPUTES are offered as objectives.
   *
   * `beta` is computed too and is deliberately NOT offered: it is an algebraic
   * function of `r0` and `interventionEffect`, so two of the three levers below
   * would set it directly and a goal like "minimise beta" would build a
   * tautological experiment whose intervention IS its own criterion. `r0`,
   * `ifr`, `infectiousDays`, `incubationDays`, `interventionDay` and
   * `interventionEffect` are likewise absent: the solver only ever READS them,
   * and they appear in `domainState` at all only because a live intervention
   * has to survive the tick. `t` is the clock.
   *
   * `'peak infected'`/`'szczyt zakażeń'` resolve to `I_PEAK`, a metric name that
   * exists only in this map, never in `domainState` — `objectiveField` (above)
   * translates it back to the real `I` field plus the MAX reducer before any
   * criterion is built. "Longest phrase first" (`worldGoalIntent.ts`) means
   * plain "infected" still wins for goals that name it alone, exactly as it
   * always has.
   */
  metricPhrases: {
    'peak infected': EPIDEMIC_PEAK_INFECTED_METRIC,
    'peak infections': EPIDEMIC_PEAK_INFECTED_METRIC,
    'infection peak': EPIDEMIC_PEAK_INFECTED_METRIC,
    'infected peak': EPIDEMIC_PEAK_INFECTED_METRIC,
    'szczyt zakażeń': EPIDEMIC_PEAK_INFECTED_METRIC,
    'szczyt zakazen': EPIDEMIC_PEAK_INFECTED_METRIC,
    'szczyt zachorowań': EPIDEMIC_PEAK_INFECTED_METRIC,
    'szczyt zachorowan': EPIDEMIC_PEAK_INFECTED_METRIC,
    infected: 'I',
    infections: 'I',
    infectious: 'I',
    'infected people': 'I',
    'zakażeni': 'I',
    'zakazeni': 'I',
    'zakażon': 'I',
    'zakazon': 'I',
    deaths: 'D',
    dead: 'D',
    'death toll': 'D',
    zgony: 'D',
    'zgonów': 'D',
    'zgonow': 'D',
  },
  entityIdForMetric: {
    I: GENESIS_EPIDEMIC_POPULATION_ID,
    D: GENESIS_EPIDEMIC_POPULATION_ID,
    [EPIDEMIC_PEAK_INFECTED_METRIC]: GENESIS_EPIDEMIC_POPULATION_ID,
  },
  levers: GENESIS_EPIDEMIC_LEVERS,
  decisionAtTick: EPIDEMIC_DECISION_TICK,
  horizonTick: EPIDEMIC_HORIZON_TICK,
  dt: EPIDEMIC_DT_DAYS,
  declaredAssumptions: [
    'An abstract "Pathogen X" with illustrative parameters (R0 2.5, 7 infectious days, 3 incubation days, IFR 1%) — NOT calibrated to any real pathogen or outbreak, inherited directly from core/epidemic/sir.ts\'s own disclosure',
    'Homogeneous mixing in one closed population of 100 000: everyone contacts everyone with equal probability, and nobody enters or leaves',
    'RK4 integration is exact for this ODE system; the compartmental model itself is a deliberate simplification of a real epidemic, so every result is MODEL_ESTIMATE and never GROUNDED_EXACT',
    'Each lever is applied instantly at the decision day and held for the rest of the run',
    'The horizon is day 60, chosen from the measured baseline trajectory: far enough that the epidemic is genuinely underway, and before the day-~100 crossover where a flattened curve overtakes a burnt-out one',
  ],
  notModelledFactors: [
    'Age structure, comorbidity and any heterogeneity in susceptibility or severity — one compartment per state, everyone identical',
    'Spatial structure, households, workplaces and contact networks — homogeneous mixing has none of these',
    'Compliance, enforcement and behavioural response: the distancing lever scales β directly rather than modelling anyone deciding anything',
    'Healthcare capacity, and therefore any dependence of the fatality ratio on how many people are sick at once',
    'Vaccination, waning immunity, reinfection and variants',
    'Every cost of an intervention — economic, social, educational — so nothing here can rank one policy against another',
  ],
};

/** The metric this world's goals are normally about. Exported so a caller need not hardcode the key. */
export const GENESIS_EPIDEMIC_OBJECTIVE_METRIC = 'I';
/** The other offered objective — the one the treatment lever really does move. */
export const GENESIS_EPIDEMIC_MORTALITY_METRIC = 'D';
