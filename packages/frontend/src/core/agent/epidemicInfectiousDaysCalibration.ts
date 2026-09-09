import { EPIDEMIC_SEIR_SOLVER_ID, buildEpidemicWorld, makeEpidemicSEIRSolver } from '../worldModel/domains/epidemicSEIR';
import { SolverRouter } from '../worldModel/solvers/solverRouter';
import type { TemporalUpdater } from '../worldModel/temporal/temporalEngine';
import type { WorldGraph } from '../worldModel/ecs/worldGraph';
import {
  GENESIS_EPIDEMIC_OBJECTIVE_METRIC,
  GENESIS_EPIDEMIC_PARAMS,
  GENESIS_EPIDEMIC_POPULATION_ID,
} from './epidemicLeverCatalog';
import type {
  WorldParameterCalibrationInput,
  WorldParameterHypothesis,
  WorldParameterSystem,
} from './worldParameterCalibration';

/**
 * WORLD CALIBRATION ON EPIDEMIOLOGY — the first real domain declared for
 * `worldParameterCalibration.ts`.
 *
 * ## Why this domain, and why `infectiousDays`
 *
 * `epidemicLeverCatalog.ts` already turns `r0`, `interventionEffect` and `ifr`
 * into MECHANISM levers — interventions a caller applies at a decision tick.
 * Two real SEIRD parameters this world's own solver reads are declared but
 * never exposed as a lever at all: `infectiousDays` and `incubationDays` (see
 * that file's own doc on `metricPhrases`, which names both as inputs the
 * solver only ever reads). That is not an oversight to fill in with a fourth
 * lever — MEAN INFECTIOUS PERIOD is not something anyone intervenes on; it is
 * a property of the pathogen, and in every real outbreak it is exactly the
 * kind of thing epidemiologists ESTIMATE from observed case-count curves
 * rather than set. That is a PARAMETER question, not a MECHANISM one, and it
 * is the real candidate this file answers.
 *
 * ## Why choosing the tick matters here — measured, not assumed
 *
 * `betaAt` computes β = r0 / infectiousDays, so R0 fixed and a SHORTER
 * infectious period means a HIGHER transmission rate: that epidemic runs
 * hotter and peaks earlier. MEASURED on the real solver (fixed r0=2.5,
 * incubationDays=3, ifr=0.01, population=100 000), candidates spanning 6-8
 * days:
 *
 *     day=2                    all five candidates read within 2% of each other
 *     day=30   d=6:623   d=6.5:528   d=7:454   d=7.5:397   d=8:350   — cleanly separated
 *     day=80   d=6:9081  d=6.5:11869 d=7:14279  d=7.5:15976 d=8:16801 — REVERSED
 *
 * By day 80 the SHORT-period epidemic (d=6, ran hot, peaked early) has already
 * receded below the LONG-period one (d=8, still climbing) — the ranking by
 * infected count flips relative to day 30. A caller that always read at the
 * horizon would misjudge this domain; `worldParameterCalibration.ts` chooses
 * the tick from real predictions instead, precisely to avoid that.
 *
 * ## Nothing here is new epidemiology
 *
 * The solver is `epidemicSEIR.ts`'s real RK4 SEIRD integration, exactly as
 * `epidemicLeverCatalog.ts` already uses it — same `buildEpidemicWorld`, same
 * `makeEpidemicSEIRSolver`, same baseline parameters
 * (`GENESIS_EPIDEMIC_PARAMS`), just with `infectiousDays` substituted per
 * candidate rather than held at its declared default. No intervention is ever
 * applied; each candidate world runs, unperturbed, from tick zero.
 */

export const EPIDEMIC_CALIBRATION_SYSTEM_ID = 'epidemic-infectious-days-sample';
export const EPIDEMIC_CALIBRATION_WORLD_ID = 'genesis-epidemic-population-calibration';
export const EPIDEMIC_CALIBRATION_PARAMETER_ID = 'infectiousDays';

/**
 * Builds a fresh, unperturbed epidemic world with the given mean infectious
 * period, otherwise identical to `epidemicLeverCatalog.ts`'s own baseline
 * (`GENESIS_EPIDEMIC_PARAMS`) — same R0, incubation period, IFR, population
 * and starting infected count, so `infectiousDays` is the only thing that
 * differs between candidate worlds.
 */
export function buildEpidemicWorldAt(infectiousDays: number): { graph: WorldGraph; updater: TemporalUpdater } {
  const params = { ...GENESIS_EPIDEMIC_PARAMS, infectiousDays };
  const world = buildEpidemicWorld({ params });
  const router = new SolverRouter();
  router.register(EPIDEMIC_SEIR_SOLVER_ID, makeEpidemicSEIRSolver(params));
  const updater: TemporalUpdater = (graph, dtDays, tick) => router.routeTick(graph, dtDays, tick);
  return { graph: world.graph, updater };
}

/**
 * Five candidate mean infectious periods, closely spaced around the
 * catalog's own declared default (7 days) — measured to separate cleanly by
 * day 30-60 while staying genuinely indistinguishable in the first couple of
 * days, the same degenerate-then-discriminating shape `chemistry-arrhenius`
 * and the protein-folding calibration already show on their own substrates.
 */
export const EPIDEMIC_INFECTIOUS_DAYS_CANDIDATES = [
  { id: 'h:short', infectiousDays: 6, description: 'a short infectious period, high transmission rate' },
  { id: 'h:brief', infectiousDays: 6.5, description: 'a brief infectious period' },
  { id: 'h:typical', infectiousDays: 7, description: "this world's own declared default" },
  { id: 'h:extended', infectiousDays: 7.5, description: 'an extended infectious period' },
  { id: 'h:long', infectiousDays: 8, description: 'a long infectious period, low transmission rate' },
] as const;

export const EPIDEMIC_INFECTIOUS_DAYS_HYPOTHESES: readonly WorldParameterHypothesis[] =
  EPIDEMIC_INFECTIOUS_DAYS_CANDIDATES.map((c) => ({
    hypothesisId: c.id,
    statement: `This outbreak's mean infectious period is ${c.infectiousDays} days: ${c.description}.`,
    claimedValue: c.infectiousDays,
    priorConfidence: 0.5,
  }));

/**
 * Probe days, short to long. Ordered short-first for the same reason every
 * other inquiry in this codebase is: if an early, cheap reading already
 * separates the survivors, there is no reason to wait longer — and here,
 * waiting too long is not merely wasteful, it is actively misleading (see the
 * module doc's day-80 reversal).
 */
export const EPIDEMIC_INFECTIOUS_DAYS_PROBE_TICKS: readonly number[] = [2, 10, 20, 30, 45, 60];

/** The shortest, cheapest reading in the list — measured to be nearly degenerate across every candidate. */
export const EPIDEMIC_INFECTIOUS_DAYS_OPENING_TICK = 2;

/** ±12%, chosen from the measured day-30/45/60 gaps between adjacent candidates — comfortably inside them without being so loose it papers over a real non-separation. */
export const EPIDEMIC_INFECTIOUS_DAYS_TOLERANCE = 0.12;

export function epidemicInfectiousDaysSystem(infectiousDays: number, systemId = EPIDEMIC_CALIBRATION_SYSTEM_ID): WorldParameterSystem {
  return {
    systemId,
    label: 'Unmitigated SEIRD outbreak (mean infectious period not yet measured)',
    worldId: EPIDEMIC_CALIBRATION_WORLD_ID,
    domainId: 'epidemiology',
    parameterId: EPIDEMIC_CALIBRATION_PARAMETER_ID,
    hiddenValue: infectiousDays,
    buildWorldAt: buildEpidemicWorldAt,
    entityId: GENESIS_EPIDEMIC_POPULATION_ID,
    observedMetric: GENESIS_EPIDEMIC_OBJECTIVE_METRIC,
    dt: 1,
    candidateProbeTicks: EPIDEMIC_INFECTIOUS_DAYS_PROBE_TICKS,
    agreementTolerance: EPIDEMIC_INFECTIOUS_DAYS_TOLERANCE,
  };
}

export function epidemicInfectiousDaysCalibration(infectiousDays: number, maxRounds = 4): WorldParameterCalibrationInput {
  return {
    question: "What is this outbreak's real mean infectious period?",
    system: epidemicInfectiousDaysSystem(infectiousDays),
    hypotheses: EPIDEMIC_INFECTIOUS_DAYS_HYPOTHESES,
    openingProbeTick: EPIDEMIC_INFECTIOUS_DAYS_OPENING_TICK,
    maxRounds,
  };
}

/**
 * What this calibration cannot answer. `runAutonomousWorldCalibration`
 * already emits its own model-scoped limitations; these are specific to
 * reading this SEIRD run as a claim about a real outbreak.
 */
export const EPIDEMIC_INFECTIOUS_DAYS_NOT_MODELLED: readonly string[] = [
  'An abstract "Pathogen X" with illustrative R0, IFR and incubation period — not calibrated to any real pathogen or outbreak (epidemicLeverCatalog.ts\'s own disclosure)',
  'Homogeneous mixing in one closed population — no age structure, no contact network, no spatial spread',
  'No intervention of any kind: this is a pure observational calibration of an unmitigated outbreak, not a policy question',
  'No real case-count data: the "hidden" world here is another run of the same model, not an actual surveillance record',
];
