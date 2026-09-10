import { SolverRouter } from '../worldModel/solvers/solverRouter';
import type { TemporalUpdater } from '../worldModel/temporal/temporalEngine';
import { entityId } from '../worldModel/ecs/types';
import { WorldGraph } from '../worldModel/ecs/worldGraph';
import {
  addRainfallCatchment,
  ENVIRONMENT_DOMAIN_ID,
  makeRainfallRunoffSolver,
  RAINFALL_RUNOFF_SOLVER_ID,
  type RainfallCatchmentDefaults,
} from '../worldModel/domains/rainfallRunoff';
import { relationFor } from './leverCriterion';
import type { WorldLever, WorldLeverCatalog } from './worldGoalIntent';

/**
 * THE DISCOVERY ENGINE, IN A SIXTH REAL DOMAIN.
 *
 * The solver is `domains/rainfallRunoff.ts` exactly as it already existed —
 * the real Rational Method (Q = C·i·A), with its own honest disclosure that
 * intensity is an input, never a forecast, and that this is peak-flow-only,
 * no hydrograph. This file contributes levers and phrasing, nothing else.
 * `declaredAssumptions`/`notModelledFactors` below are inherited from that
 * solver's own module doc, not reinvented.
 */

/** `addRainfallCatchment`'s own ref-construction rule (`{kind:'environment', id: catchmentId}`), applied to the id this world uses. */
export const GENESIS_RAINFALL_CATCHMENT_ID = entityId({ kind: 'environment', id: 'rainfall-catchment-1' });

export const GENESIS_RAINFALL_RUNOFF_CATALOG_ID = 'genesis-rainfall-runoff';

/**
 * The method is an instantaneous relation (Q = C·i·A), not an ODE — the
 * solver re-evaluates Q from whatever `domainState` currently holds on every
 * tick, exactly as `rainfallRunoff.ts`'s own module doc states ("dt is
 * irrelevant here"). `dt` is therefore an arbitrary but sensible unit (one
 * minute); a small horizon is enough to let the decision-tick intervention
 * take effect and hold for the rest of the run, the same convention
 * `chemistryLeverCatalog.ts` uses for its own instantaneous-at-tick levers.
 */
const RAINFALL_DT_SECONDS = 60;

/**
 * Baseline: a real MODERATE-band rainfall rate (the band is 2.5-10 mm/h per
 * `rainfallRunoff.ts`'s own `RAINFALL_INTENSITY_CODE` thresholds) — a
 * routine rain event, not a storm.
 */
const BASELINE_INTENSITY_MM_PER_HOUR = 6;
/**
 * Full: a real HEAVY-band design-storm intensity (10-50 mm/h band) — the
 * kind of sustained heavy-rain rate urban drainage sizing is checked
 * against, not a VIOLENT-band extreme.
 */
const HEAVY_INTENSITY_MM_PER_HOUR = 40;

/** Baseline: `RAINFALL_CATCHMENT_DEFAULTS.catchmentAreaM2` (8000 m^2) — this world's own reference small urban sub-catchment. */
const BASELINE_CATCHMENT_AREA_M2 = 8000;
/** Full: a larger contributing area, representing further urbanization/development draining into the same outlet. */
const EXPANDED_CATCHMENT_AREA_M2 = 20000;

/**
 * Baseline: a real tabulated (ASCE/NRCS-style) runoff coefficient for
 * mixed, substantially vegetated/porous urban land use (the ~0.1-0.3
 * porous / ~0.4-0.6 mixed bands these tables list).
 */
const GREEN_RUNOFF_COEFFICIENT = 0.35;
/** Full: `RAINFALL_CATCHMENT_DEFAULTS.runoffCoefficient` (0.85) — this world's own reference value for dense, substantially paved surface. */
const PAVED_RUNOFF_COEFFICIENT = 0.85;

/**
 * Builds a fresh rainfall-runoff world plus the updater that advances it.
 *
 * `rainfallRunoff.ts` has no `buildXExperimentWorld` helper (unlike
 * chemistry) — only `addRainfallCatchment(graph, options)` — so this follows
 * the same pattern `cellCultureLeverCatalog.ts` uses when no such helper
 * exists: construct a bare `WorldGraph`, add the one entity, register the
 * one solver.
 */
export function buildRainfallRunoffDiscoveryWorld(): { graph: WorldGraph; updater: TemporalUpdater } {
  const graph = new WorldGraph();
  addRainfallCatchment(graph, {
    catchmentId: 'rainfall-catchment-1',
    label: 'Drainage Catchment (Discovery)',
    // Every field is set explicitly to each lever's own declared baseline —
    // relying on RAINFALL_CATCHMENT_DEFAULTS for runoffCoefficient would
    // silently start the world at 0.85, the SAME value lever:runoff-coefficient
    // applies at full strength, making that lever a no-op tautology.
    params: {
      rainfallIntensityMmPerHour: BASELINE_INTENSITY_MM_PER_HOUR,
      catchmentAreaM2: BASELINE_CATCHMENT_AREA_M2,
      runoffCoefficient: GREEN_RUNOFF_COEFFICIENT,
    },
  });
  const router = new SolverRouter();
  router.register(RAINFALL_RUNOFF_SOLVER_ID, makeRainfallRunoffSolver());
  const updater: TemporalUpdater = (g, dtSeconds, tick) => router.routeTick(g, dtSeconds, tick);
  return { graph, updater };
}

/** Scales one `domainState` field on the catchment from baseline to a declared full value — the `domainState` analogue of `chemistryLeverCatalog.ts`'s `substanceScalarLever`. */
function catchmentParamLever(key: keyof RainfallCatchmentDefaults, fullValue: number, baseValue: number) {
  return (graph: WorldGraph, strength: number) => {
    const catchment = graph.getEntity(GENESIS_RAINFALL_CATCHMENT_ID)!;
    const current = catchment.domainState ?? {};
    graph.updateEntity(catchment.id, {
      domainState: { ...current, [key]: baseValue + (fullValue - baseValue) * strength },
    });
  };
}

/**
 * The levers this catchment really has: the three inputs `rainfallRunoff.ts`
 * itself reads (`rainfallIntensityMmPerHour`, `catchmentAreaM2`,
 * `runoffCoefficient`). Q = C·i·A is linear in each, so all three genuinely
 * move `peakRunoffM3S` — none is a strawman-that-does-nothing lever here.
 */
export const GENESIS_RAINFALL_RUNOFF_LEVERS: readonly WorldLever[] = [
  {
    leverId: 'lever:rainfall-intensity',
    phrases: ['rainfall intensity', 'rainfall', 'rain intensity', 'storm intensity', 'precipitation', 'intensywność opadu', 'intensywnosc opadu', 'opad', 'deszcz'],
    targetEntityId: GENESIS_RAINFALL_CATCHMENT_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:rainfall-intensity',
      statement: `Peak runoff is limited by how intense the rainfall is, so a heavier storm ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: 'increasing the rainfall intensity falling on the catchment',
      entityId: GENESIS_RAINFALL_CATCHMENT_ID,
      criterion: { metric, relation: relationFor(direction), rationale: 'Q = C*i*A is linear in intensity i, so raising it must move the peak runoff the solver computes.' },
      apply: catchmentParamLever('rainfallIntensityMmPerHour', HEAVY_INTENSITY_MM_PER_HOUR, BASELINE_INTENSITY_MM_PER_HOUR),
      rationale: 'Rainfall intensity is the one input this world varies independently of catchment geometry, and Q = C*i*A reads it directly every tick.',
    }),
  },
  {
    leverId: 'lever:catchment-area',
    phrases: ['catchment area', 'contributing area', 'drainage area', 'urbanization', 'urbanisation', 'powierzchnia zlewni', 'obszar zlewni', 'urbanizacja'],
    targetEntityId: GENESIS_RAINFALL_CATCHMENT_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:catchment-area',
      statement: `Peak runoff is limited by how large the contributing catchment is, so expanding it (further urbanization) ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: 'increasing the contributing catchment area',
      entityId: GENESIS_RAINFALL_CATCHMENT_ID,
      criterion: { metric, relation: relationFor(direction), rationale: 'Q = C*i*A is linear in area A, so a larger contributing area must move the peak runoff the solver computes.' },
      apply: catchmentParamLever('catchmentAreaM2', EXPANDED_CATCHMENT_AREA_M2, BASELINE_CATCHMENT_AREA_M2),
      rationale: 'Catchment area is a real declared input to the Rational Method; RAINFALL_CATCHMENT_DEFAULTS already sets 8000 m^2 as this world\'s own reference point for how far development could plausibly expand it.',
    }),
  },
  {
    leverId: 'lever:runoff-coefficient',
    phrases: ['runoff coefficient', 'surface paving', 'impervious surface', 'paving', 'ground cover', 'współczynnik spływu', 'wspolczynnik splywu', 'utwardzenie', 'zabudowa', 'powierzchnia nieprzepuszczalna'],
    targetEntityId: GENESIS_RAINFALL_CATCHMENT_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:runoff-coefficient',
      statement: `Peak runoff is limited by how much rainfall becomes surface runoff rather than infiltrating, so paving over more of the catchment ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: 'increasing the runoff coefficient (paving over more of the catchment surface)',
      entityId: GENESIS_RAINFALL_CATCHMENT_ID,
      criterion: { metric, relation: relationFor(direction), rationale: 'Q = C*i*A is linear in the runoff coefficient C, so a higher coefficient must move the peak runoff the solver computes.' },
      apply: catchmentParamLever('runoffCoefficient', PAVED_RUNOFF_COEFFICIENT, GREEN_RUNOFF_COEFFICIENT),
      rationale: 'Runoff coefficient is a real, tabulated (ASCE/NRCS-style) surface-cover input; RAINFALL_CATCHMENT_DEFAULTS already sets 0.85 (dense paved) as this world\'s own reference value for the "full" end of that range.',
    }),
  },
];

export const GENESIS_RAINFALL_RUNOFF_CATALOG: WorldLeverCatalog = {
  catalogId: GENESIS_RAINFALL_RUNOFF_CATALOG_ID,
  worldId: 'genesis-drainage-catchment',
  domainId: ENVIRONMENT_DOMAIN_ID,
  buildWorld: buildRainfallRunoffDiscoveryWorld,
  /**
   * Only `peakRunoffM3S` is offered as an objective, and deliberately so: it
   * is the one scalar this entity's solver actually COMPUTES. Intensity,
   * area and coefficient are inputs it only ever reads, so offering any of
   * them as an objective would let a goal build a tautological experiment
   * whose intervention directly sets the very metric its criterion reads —
   * the same reasoning `chemistryLeverCatalog.ts` applies to `concentrationFraction`.
   */
  metricPhrases: {
    'peak runoff': 'peakRunoffM3S',
    'peak flow': 'peakRunoffM3S',
    inflow: 'peakRunoffM3S',
    runoff: 'peakRunoffM3S',
    'przepływ szczytowy': 'peakRunoffM3S',
    'przeplyw szczytowy': 'peakRunoffM3S',
    'natężenie odpływu': 'peakRunoffM3S',
    'natezenie odplywu': 'peakRunoffM3S',
  },
  entityIdForMetric: { peakRunoffM3S: GENESIS_RAINFALL_CATCHMENT_ID },
  levers: GENESIS_RAINFALL_RUNOFF_LEVERS,
  decisionAtTick: 1,
  horizonTick: 3,
  dt: RAINFALL_DT_SECONDS,
  declaredAssumptions: [
    'Rainfall intensity is an input, never a forecast — Genesis has no weather model; nothing here predicts precipitation (inherited directly from rainfallRunoff.ts\'s own disclosure)',
    'The Rational Method assumes rainfall uniform over the catchment, a storm lasting at least the catchment\'s time of concentration, and a runoff coefficient constant with intensity — real catchments violate these to some degree; the method is standard, not perfect, and applies in the small-catchment regime this world uses',
    'Every result here is MODEL_ESTIMATE, never GROUNDED_EXACT — the method and arithmetic are real, but the catchment area and runoff coefficient are typical tabulated values, not a survey of any real site',
    'Each lever is applied instantly at the decision tick, and held for the rest of the run',
  ],
  notModelledFactors: [
    'Peak flow only, no hydrograph — the Rational Method returns one number, not the storm response shape over time; no routing, channel storage or infiltration dynamics',
    'Time of concentration is not computed — that needs catchment slope, length and surface data this world does not have',
    'Atmospheric dynamics — intensity is set directly by a lever, never generated or forecast by any weather model',
    'Downstream drainage infrastructure capacity or failure (pumps, pipes) — that lives in the separate hydraulics domain, not here',
  ],
};

/** The metric this world's goals are normally about, exported so a caller never hardcodes the string. */
export const GENESIS_RAINFALL_RUNOFF_OBJECTIVE_METRIC = 'peakRunoffM3S';
