import type { HypothesisDiscrimination, HypothesisProblem } from '../experimentFabric/hypothesisLoop';
import { compareScenarios, SCENARIOS, type ScenarioRun } from '../simulation/scenarioEngine';

/**
 * LOOKING GLASS — COMPARE, WITHOUT PRETENDING.
 *
 * A real defect motivated this file: the shot plan already had a RESULT
 * shot that said "Closing on the comparison of the two runs" whenever the
 * user's sentence merely CONTAINED the word "compare" — regardless of
 * whether a second run had ever been computed. `scenarioSession` built
 * exactly one run either way. That is the same failure this whole layer
 * exists to prevent, just spoken by a sentence instead of a rendered day.
 *
 * WHAT THIS MODULE OWNS. Turning a REAL comparison — one that was actually
 * computed by an engine — into one domain-independent shape. It computes no
 * comparison itself. The two domains here already have comparison, and
 * they compare different things for different reasons:
 *
 *  - EPIDEMIC uses `compareScenarios`, which BLOCKS when a difference could
 *    not be attributed to policy (different seed, different population,
 *    different horizon). That refusal is preserved verbatim.
 *  - LABORATORY already runs multiple candidate hypotheses every time —
 *    `discrimination` is the real ranking between them, computed whether or
 *    not the user asked to "compare". A tie (`decisive: false`) means no
 *    candidate could be preferred, which is reported as blocked rather than
 *    picking a winner arbitrarily.
 *
 * `session.comparison` is populated ONLY when a real comparison exists for
 * the request, so a shot plan or a UI can gate its own "comparison" claim on
 * this being non-null instead of on the user's sentence.
 */

export type ComparisonStatus = 'READY' | 'BLOCKED_NOT_MODELLED' | 'BLOCKED_NOT_COMPARABLE';

export interface ComparisonMetric {
  readonly key: string;
  readonly baseline: number;
  readonly variant: number;
  readonly absoluteDelta: number;
  readonly relativeDeltaPercent: number | null;
}

export interface ScenarioComparisonView {
  readonly status: ComparisonStatus;
  readonly baselineLabel: string;
  readonly variantLabel: string;
  /** What actually differs between the two sides — never assumed. */
  readonly changedFactors: readonly string[];
  readonly metrics: readonly ComparisonMetric[];
  readonly message: string;
  /** The real function that produced this, for provenance in the UI. */
  readonly producedBy: string;
}

/** Wraps the epidemic engine's own `compareScenarios` — no reinterpretation. */
export function compareEpidemicRuns(baseline: ScenarioRun, variant: ScenarioRun): ScenarioComparisonView {
  const result = compareScenarios(baseline, variant);
  const status: ComparisonStatus = result.status === 'COMPLETED' ? 'READY'
    : result.status === 'BLOCKED_NOT_MODELED' ? 'BLOCKED_NOT_MODELLED'
    : 'BLOCKED_NOT_COMPARABLE';
  return {
    status,
    baselineLabel: SCENARIOS[result.baselineScenario].label,
    variantLabel: SCENARIOS[result.variantScenario].label,
    changedFactors: [...result.changedParameters, ...result.changedTiming, ...result.changedCapacity],
    metrics: result.metrics,
    message: result.message,
    producedBy: `scenarioEngine.compareScenarios(${result.baselineScenario}, ${result.variantScenario})`,
  };
}

/**
 * Wraps the hypothesis loop's own ranking between candidate arms. Compares
 * the two extremes of the ranking (lowest vs highest metric) rather than an
 * arbitrary pair, since those are the ones a "what changed" question is
 * actually asking about.
 */
export function compareHypothesisRanking(
  problem: HypothesisProblem,
  discrimination: HypothesisDiscrimination,
): ScenarioComparisonView {
  const producedBy = `hypothesisLoop.discrimination(${problem.problemId})`;
  if (discrimination.ranking.length < 2) {
    return {
      status: 'BLOCKED_NOT_COMPARABLE',
      baselineLabel: problem.candidateVariable, variantLabel: problem.candidateVariable,
      changedFactors: [], metrics: [], producedBy,
      message: 'Fewer than two candidates ran — there is nothing to compare.',
    };
  }
  if (!discrimination.decisive) {
    return {
      status: 'BLOCKED_NOT_COMPARABLE',
      baselineLabel: problem.candidateVariable, variantLabel: problem.candidateVariable,
      changedFactors: [problem.candidateVariable], metrics: [], producedBy,
      message: discrimination.reason,
    };
  }

  const sorted = [...discrimination.ranking].sort((a, b) => a.metric - b.metric);
  const lowest = sorted[0];
  const highest = sorted[sorted.length - 1];
  const absoluteDelta = highest.metric - lowest.metric;

  return {
    status: 'READY',
    baselineLabel: `${problem.candidateVariable}=${lowest.candidate}`,
    variantLabel: `${problem.candidateVariable}=${highest.candidate}`,
    changedFactors: [problem.candidateVariable],
    metrics: [{
      key: problem.primaryMetric,
      baseline: lowest.metric,
      variant: highest.metric,
      absoluteDelta,
      relativeDeltaPercent: lowest.metric === 0 ? null : (absoluteDelta / lowest.metric) * 100,
    }],
    message: discrimination.reason,
    producedBy,
  };
}
