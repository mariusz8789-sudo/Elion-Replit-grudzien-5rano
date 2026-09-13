import { createHypothesis, updateConfidence, type Hypothesis } from '../experimentFabric/beliefRevision';
import { assessTautology, evidenceCeiling, type TautologyAssessment } from '../agent/tautologyGate';
import type { FalsificationCriterion, HypothesisAssessment } from '../experimentFabric/scientificDiscovery';
import { weightedLinearFit } from './qe4BrydgesEstimator';
import { buildEmpiricalComponent, significantlyGreater } from './qe4BrydgesAnalysis';
import { pointsForGrid, type Qe4GridPoint } from './qe4DatasetLaboratory';

/**
 * P0.2 (Discovery Engine, `docs/DISCOVERY_ENGINE_FINAL_CLASSIFICATION_2026-09-12.md`
 * section 4/7) — competing regime hypotheses about how S2 grows with TIME at
 * one fixed partition size, generated from the pinned QE4 grid itself
 * (`qe4DatasetLaboratory.ts::pointsForGrid`), not from a literal hypothesis
 * list. This tests a DIFFERENT axis than `qe4BrydgesAnalysis.ts`'s own P1/P2
 * (which fit S2 vs PARTITION SIZE k at one fixed time) — growth vs. TIME at
 * one fixed k — over the SAME raw measured shots, so it reuses the same
 * epistemic pairing (`buildEmpiricalComponent`) rather than inventing a new
 * justification for why prediction and observation are independent here.
 *
 * Three declared TEMPLATES (not three declared hypothesis STATEMENTS): each
 * one's actual expected value, tolerance, and verdict are computed fresh from
 * whichever (dataset,k) grid is requested. Genuinely competing: a real grid
 * can support more than one, or none, and this module does not force an
 * artificial exclusivity that the physics does not have.
 */

export const QE4_REGIME_TEMPLATES = ['LINEAR_GROWTH', 'LOGARITHMIC_GROWTH', 'SATURATING'] as const;
export type Qe4RegimeTemplate = (typeof QE4_REGIME_TEMPLATES)[number];

export type Qe4RegimeVerdict = 'SUPPORTED_WITHIN_MODEL' | 'FALSIFIED' | 'INCONCLUSIVE';

export interface Qe4RegimeHypothesisResult {
  readonly template: Qe4RegimeTemplate;
  readonly dataset: 'clean' | 'disorder';
  readonly k: number;
  readonly verdict: Qe4RegimeVerdict;
  readonly reasons: readonly string[];
  readonly tautology: TautologyAssessment;
  readonly hypothesis: Hypothesis;
  readonly pointsUsed: readonly Qe4GridPoint[];
}

const MIN_POINTS_FOR_FIT = 3;
/** Same relative-precision gate `qe4BrydgesAnalysis.ts`'s own P1 test uses for its slope. */
const MAX_RELATIVE_SLOPE_UNCERTAINTY = 0.5;

interface RegimeAssessment {
  readonly verdict: Qe4RegimeVerdict;
  readonly reasons: readonly string[];
  readonly criterion: FalsificationCriterion;
}

function verdictFromSlope(
  slope: number,
  slopeSigma: number,
  metric: string,
  growthLabel: string,
): RegimeAssessment {
  const significantlyPositive = slope - 3 * slopeSigma > 0;
  const relativeUncertainty = slopeSigma / Math.abs(slope);
  const criterion: FalsificationCriterion = {
    metric,
    relation: 'monotonic-increase',
    expectedValue: slope,
    tolerance: slopeSigma,
    rationale: `Weighted-least-squares slope of S2 vs ${growthLabel}: ${slope.toFixed(4)} ± ${slopeSigma.toFixed(4)} (analytic WLS standard error); significantly positive (3σ excludes zero): ${significantlyPositive}.`,
  };
  if (!significantlyPositive) {
    return {
      verdict: 'FALSIFIED',
      reasons: [criterion.rationale, `FALSIFIED: slope not significantly positive at 3σ against ${growthLabel} — this dataset's own points do not show this growth shape.`],
      criterion,
    };
  }
  if (relativeUncertainty > MAX_RELATIVE_SLOPE_UNCERTAINTY) {
    return {
      verdict: 'INCONCLUSIVE',
      reasons: [criterion.rationale, `INCONCLUSIVE: slope uncertainty (${(relativeUncertainty * 100).toFixed(1)}% of the fitted value) is too wide relative to its magnitude to confidently confirm this regime.`],
      criterion,
    };
  }
  return {
    verdict: 'SUPPORTED_WITHIN_MODEL',
    reasons: [criterion.rationale, `SUPPORTED_WITHIN_MODEL: significant positive slope vs ${growthLabel}, with acceptable relative precision.`],
    criterion,
  };
}

function assessLinearGrowth(points: readonly Qe4GridPoint[], dataset: 'clean' | 'disorder', k: number): RegimeAssessment {
  if (points.length < MIN_POINTS_FOR_FIT) {
    return {
      verdict: 'INCONCLUSIVE',
      reasons: [`INCONCLUSIVE: only ${points.length} declared point(s) for ${dataset} k=${k} — need at least ${MIN_POINTS_FOR_FIT} to fit a slope.`],
      criterion: { metric: `s2-vs-t-slope:${dataset}:k=${k}`, relation: 'monotonic-increase', rationale: 'Insufficient declared points; no fit was attempted.' },
    };
  }
  const { slope, slopeSigma } = weightedLinearFit(points.map((p) => p.t), points.map((p) => p.s2), points.map((p) => p.sigma));
  return verdictFromSlope(slope, slopeSigma, `s2-vs-t-slope:${dataset}:k=${k}`, 'time t (linear, "volume-law-like" growth)');
}

function assessLogarithmicGrowth(points: readonly Qe4GridPoint[], dataset: 'clean' | 'disorder', k: number): RegimeAssessment {
  const positiveT = points.filter((p) => p.t > 0);
  if (positiveT.length < MIN_POINTS_FOR_FIT) {
    return {
      verdict: 'INCONCLUSIVE',
      reasons: [`INCONCLUSIVE: only ${positiveT.length} declared point(s) with t>0 for ${dataset} k=${k} — need at least ${MIN_POINTS_FOR_FIT} to fit ln(t).`],
      criterion: { metric: `s2-vs-ln-t-slope:${dataset}:k=${k}`, relation: 'monotonic-increase', rationale: 'Insufficient declared t>0 points; no fit was attempted.' },
    };
  }
  const { slope, slopeSigma } = weightedLinearFit(positiveT.map((p) => Math.log(p.t)), positiveT.map((p) => p.s2), positiveT.map((p) => p.sigma));
  return verdictFromSlope(slope, slopeSigma, `s2-vs-ln-t-slope:${dataset}:k=${k}`, 'ln(t) (logarithmic, sub-extensive growth)');
}

function assessSaturating(points: readonly Qe4GridPoint[], dataset: 'clean' | 'disorder', k: number): RegimeAssessment {
  const metric = `s2-plateau:${dataset}:k=${k}`;
  if (points.length < 2) {
    return {
      verdict: 'INCONCLUSIVE',
      reasons: [`INCONCLUSIVE: only ${points.length} declared point(s) for ${dataset} k=${k} — need at least 2 to compare the last two.`],
      criterion: { metric, relation: 'equal-within-tolerance', rationale: 'Insufficient declared points; no plateau comparison was attempted.' },
    };
  }
  const last = points[points.length - 1]!;
  const prevLast = points[points.length - 2]!;
  const combinedSigma = Math.sqrt(last.sigma ** 2 + prevLast.sigma ** 2);
  const stillRising = significantlyGreater(last.s2, last.sigma, prevLast.s2, prevLast.sigma);
  const stillFalling = significantlyGreater(prevLast.s2, prevLast.sigma, last.s2, last.sigma);
  const criterion: FalsificationCriterion = {
    metric,
    relation: 'equal-within-tolerance',
    expectedValue: prevLast.s2,
    tolerance: 3 * combinedSigma,
    rationale: `S2 at the last two declared times for ${dataset} k=${k}: T=${prevLast.t}ms=${prevLast.s2.toFixed(4)}±${prevLast.sigma.toFixed(4)}, T=${last.t}ms=${last.s2.toFixed(4)}±${last.sigma.toFixed(4)}.`,
  };
  if (stillRising || stillFalling) {
    return {
      verdict: 'FALSIFIED',
      reasons: [criterion.rationale, `FALSIFIED: the last two declared points still differ significantly (3σ) — this dataset has not plateaued yet within its own declared time range.`],
      criterion,
    };
  }
  return {
    verdict: 'SUPPORTED_WITHIN_MODEL',
    reasons: [criterion.rationale, 'SUPPORTED_WITHIN_MODEL: the last two declared points are not significantly different (3σ) — consistent with a plateau within this dataset\'s own declared time range.'],
    criterion,
  };
}

function toAssessment(verdict: Qe4RegimeVerdict): HypothesisAssessment {
  if (verdict === 'SUPPORTED_WITHIN_MODEL') return 'SUPPORTED_WITHIN_PROTOCOL';
  if (verdict === 'FALSIFIED') return 'FALSIFIED_WITHIN_PROTOCOL';
  return 'INCONCLUSIVE';
}

function assessForTemplate(template: Qe4RegimeTemplate, points: readonly Qe4GridPoint[], dataset: 'clean' | 'disorder', k: number): RegimeAssessment {
  if (template === 'LINEAR_GROWTH') return assessLinearGrowth(points, dataset, k);
  if (template === 'LOGARITHMIC_GROWTH') return assessLogarithmicGrowth(points, dataset, k);
  return assessSaturating(points, dataset, k);
}

/**
 * Generates one competing hypothesis per declared template
 * (`QE4_REGIME_TEMPLATES`) for a real `(dataset, k)` grid, each independently
 * belief-revised from a fresh 0.5 prior. Computes nothing about S2 itself —
 * every value comes from `pointsForGrid` (pure delegation to the already-
 * verified `runQe4BrydgesAnalysis()`) and `weightedLinearFit`/
 * `significantlyGreater` (the same estimator primitives P1/P2 already use).
 */
export function generateQe4RegimeHypotheses(dataset: 'clean' | 'disorder', k: number): readonly Qe4RegimeHypothesisResult[] {
  const points = pointsForGrid(dataset, k);
  const rawMeasurementModelId = dataset === 'clean' ? 'zenodo-2527010-brydges-measuredstates-clean' : 'zenodo-2527010-brydges-measuredstates-disorder';

  return QE4_REGIME_TEMPLATES.map((template): Qe4RegimeHypothesisResult => {
    const assessment = assessForTemplate(template, points, dataset, k);
    const id = `qe4-regime:${dataset}:k=${k}:${template}`;
    const tautology = assessTautology([buildEmpiricalComponent(`${id}:tautology`, 'qe4-randomized-measurement-estimator', rawMeasurementModelId)]);
    const cap = evidenceCeiling(tautology.classification);
    const evidenceMagnitude = cap === null ? 1 : Math.min(1, cap);
    const initial = createHypothesis(id, assessment.criterion, 0.5, 'INITIAL', null);
    const revised = updateConfidence(initial, toAssessment(assessment.verdict), evidenceMagnitude, assessment.reasons[assessment.reasons.length - 1]!, 0);
    return { template, dataset, k, verdict: assessment.verdict, reasons: assessment.reasons, tautology, hypothesis: revised, pointsUsed: points };
  });
}
