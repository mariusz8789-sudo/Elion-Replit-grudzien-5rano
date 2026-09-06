import type { HypothesisDiscrimination, HypothesisProblem } from '../experimentFabric/hypothesisLoop';
import { SCENARIOS } from '../simulation/scenarioEngine';
import type { ScenarioCounterfactual } from '../simulation/scenarioCounterfactual';

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
 *  - EPIDEMIC uses `scenarioCounterfactual.runScenarioCounterfactual`, the
 *    same counterfactual engine already used by the first-person lab session
 *    and by Scientific Memory — not a second, Looking-Glass-only pairing of
 *    two raw runs. It BLOCKS (via the same `compareScenarios` underneath)
 *    when a difference could not be attributed to policy, and it additionally
 *    carries `firstDivergentDay` and a `counterfactualFingerprint` — real
 *    evidence this module does not compute, only relays.
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

/**
 * Evidence a comparison carries beyond the metric table, when the engine
 * that produced it tracks such a thing. `null` for a comparison whose engine
 * does not compute this — never filled in by guessing.
 */
export interface ComparisonEvidence {
  /** First tick the two arms actually diverged, measured on the real series — not the intervention day. */
  readonly firstDivergentDay: number | null;
  /** Fingerprint a saved counterfactual is checked against on replay. */
  readonly counterfactualFingerprint: string;
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
  readonly evidence: ComparisonEvidence | null;
}

/**
 * Wraps a real `ScenarioCounterfactual` — the same counterfactual engine the
 * first-person lab session and Scientific Memory already use to run and save
 * baseline/variant pairs. This function computes nothing: `counterfactual`
 * already carries both real runs, `compareScenarios`'s verdict, the measured
 * divergence day, and a stable fingerprint a saved copy can be replayed
 * against.
 */
export function compareEpidemicRuns(counterfactual: ScenarioCounterfactual): ScenarioComparisonView {
  const result = counterfactual.comparison;
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
    producedBy: `scenarioCounterfactual.runScenarioCounterfactual(${result.baselineScenario}->${result.variantScenario})`,
    evidence: status === 'READY'
      ? { firstDivergentDay: counterfactual.firstDivergentDay, counterfactualFingerprint: counterfactual.counterfactualFingerprint }
      : null,
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
      changedFactors: [], metrics: [], producedBy, evidence: null,
      message: 'Fewer than two candidates ran — there is nothing to compare.',
    };
  }
  if (!discrimination.decisive) {
    return {
      status: 'BLOCKED_NOT_COMPARABLE',
      baselineLabel: problem.candidateVariable, variantLabel: problem.candidateVariable,
      changedFactors: [problem.candidateVariable], metrics: [], producedBy, evidence: null,
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
    evidence: null,
  };
}
